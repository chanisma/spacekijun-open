/**
 * 메뉴 배치·대상별 노출 회귀 (2026-09-21)
 *
 * 실행: npx tsx scripts/menu-layout-test/run.mts
 *
 * 이 기능이 조용히 틀리는 자리:
 *   · 배치 설정 때문에 메뉴가 **사라진다**(대상 범례가 없는 이동, 지운 범례에 뒤늦게 주입되는 메뉴)
 *   · 편집한 트리 → 저장값 → 다시 적용했을 때 **다른 모양**이 된다(서랍이 낀 범례의 순서)
 *   · 예전에 저장된 `{users:false}` 가 새 형식에서 **켜진 것으로** 읽힌다(개발 중 메뉴가 전원에게 열림)
 *   · 역할을 아직 모르는 순간에 개발 중 메뉴가 깜빡인다
 */
import { regularNavSections, studentNavSections, isNavGroup, type NavSection } from '../../src/config/navigation';
import {
  addGroup, addSection, applyNavLayout, canDeleteGroup, canDeleteSection, cloneNavSections, containerKeyOf, deleteGroup,
  deleteSection, deriveNavLayout, hrefsOf, isLockedSection, listContainers, listGroups, moveGroupBy, moveGroupTo,
  moveItemBy, moveItemTo, moveSection, parseNavLayoutConfig, renameGroup, renameSection, sameNavShape,
  sectionKeyOfGroup, type NavLayout,
} from '../../src/lib/navLayout';
import { buildManageableBase, injectTeacherDynamicItems } from '../../src/lib/navAssembly';
import {
  buildMenuVisibilityPayload, isPathVisible, isStaffClosedByDefault, isStaffOpenedByMenu,
  parseMenuVisibilityConfig, resolveMenuVisibility,
  type MenuVisibility,
} from '../../src/lib/menuVisibility';
import { MANAGED_MENUS } from '../../src/config/menuRegistry';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail: unknown = '') => {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); }
};
const allHrefs = (sections: NavSection[]) =>
  sections.flatMap((s) => s.items.flatMap((e) => (isNavGroup(e) ? e.children.map((c) => c.href) : [e.href]))).sort();
const ids = (sections: NavSection[]) => sections.map((s) => s.id);
const base = () => buildManageableBase('teacher');

console.log('[① 기본 배치 조립]');
{
  const full = base();
  check('관리 화면은 주입 가능한 메뉴를 전부 본다', ['/rescue-note', '/timetable-generator', '/spaced-repetition'].every((h) => allHrefs(full).includes(h)));
  check('원본 상수는 오염되지 않는다', !allHrefs(cloneNavSections(regularNavSections)).includes('/rescue-note'));
  const plain = injectTeacherDynamicItems(cloneNavSections(regularNavSections), { rescueNote: false });
  check('위기 노트는 권한이 있어야 주입된다', !allHrefs(plain).includes('/rescue-note'));
  // 시간표 생성·간격반복은 예전엔 admin 에게만 주입했다 — 지금은 늘 넣고 노출 설정(기본 = 관리자만)이 거른다
  check('구 관리자 전용 메뉴는 늘 주입된다', ['/timetable-generator', '/spaced-repetition'].every((h) => allHrefs(plain).includes(h)));
  check('시간표 생성은 시험 시간표 바로 뒤', (() => { const h = hrefsOf(full, 'group:academic-ops-hub'); return h.indexOf('/timetable-generator') === h.indexOf('/exam-schedule') + 1; })());
  check('학생 기본 배치', ids(buildManageableBase('student')).join() === ids(studentNavSections).join());
}

console.log('[② 적용 — 설정 때문에 메뉴가 사라지면 안 된다]');
{
  const before = allHrefs(base());
  check('설정이 없으면 그대로', sameNavShape(applyNavLayout(base(), null), base()) && sameNavShape(applyNavLayout(base(), undefined), base()));

  const moved = applyNavLayout(base(), { placements: { '/documents': 'section:today' } });
  check('메뉴 이동', containerKeyOf(moved, '/documents') === 'section:today' && !hrefsOf(moved, 'section:tools').includes('/documents'));
  check('이동해도 메뉴 수는 같다', allHrefs(moved).join() === before.join());

  const ghost = applyNavLayout(base(), { placements: { '/documents': 'section:no-such', '/toolbox': 'group:no-such' } });
  check('대상이 없는 이동은 무시(원래 자리)', containerKeyOf(ghost, '/documents') === 'section:tools' && containerKeyOf(ghost, '/toolbox') === 'section:tools');

  const intoHub = applyNavLayout(base(), { placements: { '/documents': 'group:analytics-hub' } });
  check('서랍 안으로 이동', containerKeyOf(intoHub, '/documents') === 'group:analytics-hub');
  const outOfHub = applyNavLayout(base(), { placements: { '/evalog': 'section:tools' } });
  check('서랍 밖으로 이동', containerKeyOf(outOfHub, '/evalog') === 'section:tools');

  const custom: NavLayout = {
    sections: [{ id: 'today', label: '오늘' }, { id: 'custom:abc', label: '행정' }, { id: 'tools', label: '도구함' }],
    placements: { '/documents': 'section:custom:abc' },
  };
  const withCustom = applyNavLayout(base(), custom);
  check('새 범례 + 이름 변경', withCustom.find((s) => s.id === 'custom:abc')?.label === '행정' && withCustom.find((s) => s.id === 'tools')?.label === '도구함');
  check('새 범례로 이동', containerKeyOf(withCustom, '/documents') === 'section:custom:abc');
  check('저장값에 없는 코드 범례는 살아남는다(항목이 있으므로)', ['analytics', 'academic-ops', 'student-menus'].every((id) => ids(withCustom).includes(id)), ids(withCustom));
  check('메뉴는 하나도 사라지지 않았다', allHrefs(withCustom).join() === before.join());
  check('[관리]는 늘 맨 끝', ids(withCustom).at(-1) === 'admin');

  // 범례를 지웠는데(저장값에서 뺌) 나중에 그 범례로 메뉴가 주입되는 경우 — 되살아나야 한다
  const emptied: NavLayout = {
    sections: base().filter((s) => !isLockedSection(s.id) && s.id !== 'student-menus').map((s) => ({ id: s.id, label: s.label })),
    // [학생 메뉴]의 모든 항목을 옮겨야 «빈 범례»가 된다 — 학생 메뉴에 새 항목을 넣으면 여기도(2026-10-10 별까지 쌓기 · 2026-10-26 투자 게임 · 2026-10-27 코인 얻는 법 · 2026-10-28 이세계 사회인)
    placements: { '/planner': 'section:tools', '/academy': 'section:tools', '/tamagotchi': 'section:tools', '/star-tower': 'section:tools', '/isekai': 'section:tools', '/coins': 'section:tools', '/interview-prep': 'section:tools', '/spaced-repetition': 'section:tools' },
  };
  const gone = applyNavLayout(base(), emptied);
  check('비운 뒤 지운 범례는 사라진다', !ids(gone).includes('student-menus') && allHrefs(gone).join() === before.join());
  const partial: NavLayout = { ...emptied, placements: { '/planner': 'section:tools', '/academy': 'section:tools' } };
  const revived = applyNavLayout(base(), partial);
  check('항목이 남으면 지운 범례가 되살아난다', ids(revived).includes('student-menus') && containerKeyOf(revived, '/spaced-repetition') === 'section:student-menus');

  const ordered = applyNavLayout(base(), { order: { 'section:tools': ['/toolbox', '/collab'] } });
  const tools = hrefsOf(ordered, 'section:tools');
  check('순서 — 적힌 것이 앞, 나머지는 원래 순서로 뒤', tools[0] === '/toolbox' && tools[1] === '/collab' && tools.length === hrefsOf(base(), 'section:tools').length, tools);
  check('순서 목록의 모르는 href 는 무해', sameNavShape(applyNavLayout(base(), { order: { 'section:tools': ['/nope'] } }), base()));

  // 권한으로 주입되지 않은 사용자에게 그 메뉴의 이동 설정이 있어도 터지지 않는다
  const plain = injectTeacherDynamicItems(cloneNavSections(regularNavSections), { rescueNote: false });
  const safe = applyNavLayout(plain, { placements: { '/rescue-note': 'section:today' } });
  check('없는 메뉴의 이동 설정은 무시', !allHrefs(safe).includes('/rescue-note'));
}

console.log('[③ 편집 연산]');
{
  let tree = base();
  tree = addSection(tree, '  행정  ', 'custom:t1');
  check('범례 추가 — [관리] 앞, 이름은 다듬는다', ids(tree).at(-2) === 'custom:t1' && tree.find((s) => s.id === 'custom:t1')?.label === '행정', ids(tree));
  check('빈 범례만 지울 수 있다', canDeleteSection(tree.find((s) => s.id === 'custom:t1')!) && !canDeleteSection(tree.find((s) => s.id === 'tools')!));
  check('잠긴 범례는 못 지운다', !canDeleteSection({ id: 'admin', label: '관리', items: [] }));
  check('항목 있는 범례 삭제는 무시', sameNavShape(deleteSection(tree, 'tools'), tree));

  tree = moveItemTo(tree, '/documents', 'section:custom:t1');
  tree = moveItemTo(tree, '/toolbox', 'section:custom:t1');
  check('메뉴 옮기기', hrefsOf(tree, 'section:custom:t1').join() === '/documents,/toolbox');
  tree = moveItemBy(tree, '/toolbox', -1);
  check('한 칸 위로', hrefsOf(tree, 'section:custom:t1').join() === '/toolbox,/documents');
  check('끝에서 더 못 간다', sameNavShape(moveItemBy(tree, '/toolbox', -1), tree));
  tree = renameSection(tree, 'today', '하루');
  tree = moveSection(tree, 'custom:t1', -1);
  check('범례 위로', ids(tree).indexOf('custom:t1') === ids(base()).length - 2, ids(tree));
  check('[관리]와는 자리를 못 바꾼다', sameNavShape(moveSection(tree, ids(tree).at(-2)!, 1), tree));
  check('잠긴 범례는 이동 대상이 아니다', !listContainers(tree).some((c) => c.key === 'section:admin'));

  // 서랍이 낀 범례의 순서 — 메뉴를 서랍 **위로** 올린다
  tree = moveItemTo(tree, '/signatures', 'section:analytics');
  tree = moveItemBy(tree, '/signatures', -1);
  check('서랍 위로 올라간다', !isNavGroup(tree.find((s) => s.id === 'analytics')!.items[0]));

  // ★ 왕복: 편집한 트리 → 저장값 → 다시 적용 = 같은 모양
  const layout = deriveNavLayout(base(), tree);
  check('차이가 있으면 저장값이 나온다', !!layout?.sections && !!layout.placements && !!layout.order);
  const reapplied = applyNavLayout(base(), layout);
  check('왕복해도 같은 모양(서랍 자리 포함)', sameNavShape(reapplied, tree), { want: ids(tree), got: ids(reapplied) });
  check('JSON 을 거쳐도 같다(저장 → 파싱)', sameNavShape(applyNavLayout(base(), parseNavLayoutConfig(JSON.parse(JSON.stringify({ teacher: layout }))).teacher), tree));

  check('손대지 않으면 저장값이 없다', deriveNavLayout(base(), base()) === null);
  const onlyMove = deriveNavLayout(base(), moveItemTo(base(), '/documents', 'section:today'));
  check('옮기기만 하면 placements 만 적는다', !!onlyMove?.placements && !onlyMove.sections && !onlyMove.order, onlyMove);
  check('되돌리면 저장값이 사라진다', deriveNavLayout(base(), moveItemBy(moveItemBy(base(), '/toolbox', -1), '/toolbox', 1)) === null);

  // 학생 네비도 같은 규칙
  const st = moveItemTo(buildManageableBase('student'), '/planner', 'section:student-inquiry');
  check('학생 네비 왕복', sameNavShape(applyNavLayout(buildManageableBase('student'), deriveNavLayout(buildManageableBase('student'), st)), st));
}

console.log('[④ 파싱 — 어긋난 값은 버리고 나머지를 쓴다]');
{
  check('쓰레기 입력', [null, 1, 'x', [], {}].every((v) => Object.keys(parseNavLayoutConfig(v)).length === 0));
  const parsed = parseNavLayoutConfig({
    teacher: {
      sections: [{ id: 'today', label: ' 오늘 ' }, { id: 'today', label: '중복' }, { id: 'admin', label: '관리' }, { id: 3 }, null],
      placements: { '/a': 'section:x', 'nope': 'section:x', '/b': 'somewhere', '/c': 7 },
      order: { 'section:x': ['/a', 3, null], 'section:y': 'bad' },
    },
    nobody: { sections: [{ id: 'x', label: 'x' }] },
  });
  check('중복·잠긴 범례·모양 어긋난 것 제거', JSON.stringify(parsed.teacher?.sections) === JSON.stringify([{ id: 'today', label: '오늘' }]), parsed.teacher?.sections);
  check('이동은 경로 → section:/group: 만', JSON.stringify(parsed.teacher?.placements) === JSON.stringify({ '/a': 'section:x' }));
  check('순서는 문자열만', JSON.stringify(parsed.teacher?.order) === JSON.stringify({ 'section:x': ['/a'] }));
  check('모르는 네비 종류는 무시', !('nobody' in parsed));
}

console.log('[⑤ 대상별 노출 — 학생·교사·직원·관리자]');
{
  const ALL: MenuVisibility = { student: true, teacher: true, staff: true, admin: true };
  check('설정 없으면 전부 노출', JSON.stringify(resolveMenuVisibility({}, '/tasks/mine')) === JSON.stringify(ALL));

  // ★ 구 형식 — 마이그레이션 없이 "세 대상 모두"로 읽혀야 한다
  const legacy = parseMenuVisibilityConfig({ '/tasks/mine': { users: false, admin: true } });
  const v = resolveMenuVisibility(legacy, '/tasks/mine');
  check('구 {users:false} = 세 대상 모두 끔', !v.student && !v.teacher && !v.staff && v.admin, v);
  check('대상별 값이 users 를 이긴다', resolveMenuVisibility({ '/tasks/mine': { users: false, teacher: true } }, '/tasks/mine').teacher === true);

  const dev = MANAGED_MENUS.find((m) => !m.defaultVisibleToUsers)!;
  const dv = resolveMenuVisibility({}, dev.key);
  check('개발 중 메뉴의 코드 기본값 = 세 대상 모두 끔', !dv.student && !dv.teacher && !dv.staff && dv.admin, dev.key);

  const cfg = parseMenuVisibilityConfig({ '/planner': { teacher: false, staff: false } });
  check('교사에게만 끔 → 학생은 본다', isPathVisible(cfg, '/planner', { isAdmin: false, role: 'student' }) && !isPathVisible(cfg, '/planner', { isAdmin: false, role: 'teacher' }) && !isPathVisible(cfg, '/planner', { isAdmin: false, role: 'staff' }));
  check('관리자는 관리자 스위치를 따른다', isPathVisible(cfg, '/planner', { isAdmin: true, role: 'admin' }));
  check('하위 경로도 함께', !isPathVisible(cfg, '/planner/2026-09-21', { isAdmin: false, role: 'teacher' }));
  check('접두가 같은 다른 메뉴는 영향 없음', isPathVisible({ '/timetable': { users: false } }, '/timetable-generator', { isAdmin: true, role: 'admin' }));

  // 역할을 아직 모를 때 — 멀쩡한 메뉴는 깜빡이지 않고, 개발 중 메뉴는 그 사이에도 감춘다
  check('역할 미상 + 하나라도 켜짐 → 보임', isPathVisible(cfg, '/planner', { isAdmin: false, role: null }) && isPathVisible(cfg, '/planner', { isAdmin: false }));
  check('역할 미상 + 셋 다 꺼짐 → 숨김', !isPathVisible({}, dev.key, { isAdmin: false, role: null }));
  check('관리 대상이 아닌 경로는 늘 보임', isPathVisible(cfg, '/', { isAdmin: false, role: 'student' }) && isPathVisible(cfg, '/admin', { isAdmin: false, role: 'staff' }));

  // 저장값 — 바뀐 것만, 세 대상이 같으면 users 하나로 접는다
  const draft: Record<string, MenuVisibility> = {};
  for (const m of MANAGED_MENUS) draft[m.key] = resolveMenuVisibility({}, m.key);
  check('손대지 않으면 빈 저장값', Object.keys(buildMenuVisibilityPayload(draft)).length === 0);
  draft['/tasks/mine'] = { student: false, teacher: false, staff: false, admin: true };
  draft['/documents'] = { student: true, teacher: false, staff: true, admin: true };
  const payload = buildMenuVisibilityPayload(draft);
  check('세 대상이 같으면 users 로 접는다', JSON.stringify(payload['/tasks/mine']) === JSON.stringify({ users: false }), payload['/tasks/mine']);
  check('다르면 바뀐 대상만 적는다', JSON.stringify(payload['/documents']) === JSON.stringify({ teacher: false }), payload['/documents']);
  const back = parseMenuVisibilityConfig(JSON.parse(JSON.stringify(payload)));
  check('저장 → 파싱 → 해석 왕복', MANAGED_MENUS.every((m) => JSON.stringify(resolveMenuVisibility(back, m.key)) === JSON.stringify(draft[m.key])));
  // 개발 중 메뉴를 교사에게만 연다
  draft[dev.key] = { student: false, teacher: true, staff: false, admin: true };
  const p2 = buildMenuVisibilityPayload(draft);
  check('개발 중 메뉴를 한 대상에게만 열기', resolveMenuVisibility(parseMenuVisibilityConfig(p2), dev.key).teacher && !resolveMenuVisibility(parseMenuVisibilityConfig(p2), dev.key).student);
}

console.log('[⑥ 코드에 박혀 있던 닫힘 = 메뉴 관리의 코드 기본값]');
{
  const TEACHER = { isAdmin: false, role: 'teacher' } as const;
  const STAFF = { isAdmin: false, role: 'staff' } as const;
  const ADMIN = { isAdmin: true, role: 'admin' } as const;
  const STUDENT = { isAdmin: false, role: 'student' } as const;

  // 직원 차단 목록 — 없애지 않고 직원 스위치의 기본값이 됐다
  check('직원에게 닫힌 메뉴의 기본값 = 직원만 꺼짐', (() => { const v = resolveMenuVisibility({}, '/evalog'); return v.teacher && v.student && !v.staff && v.admin; })());
  check('직원에게 열린 메뉴는 기본 켜짐', resolveMenuVisibility({}, '/documents').staff && !isStaffClosedByDefault('/documents'));
  check('기본 동작은 종전과 같다 — 직원은 못 보고 교사는 본다', !isPathVisible({}, '/evalog', STAFF) && isPathVisible({}, '/evalog', TEACHER));
  check('하위 경로도 닫힘', !isPathVisible({}, '/evalog/abc', STAFF) && isStaffClosedByDefault('/timetable/x'));
  check('접두가 같은 다른 경로는 별개', !isStaffClosedByDefault('/timetable-generator'));

  const opened = parseMenuVisibilityConfig({ '/evalog': { staff: true } });
  check('관리자가 켜면 직원에게 열린다(메뉴)', isPathVisible(opened, '/evalog', STAFF));
  check('관리자가 켜면 직원에게 열린다(라우트 예외)', isStaffOpenedByMenu(opened, '/evalog') && isStaffOpenedByMenu(opened, '/evalog/student/1'));
  check('켜지 않았으면 라우트 예외 없음', !isStaffOpenedByMenu({}, '/evalog'));
  check('원래 열린 메뉴는 예외 대상이 아니다', !isStaffOpenedByMenu({}, '/documents') && !isStaffOpenedByMenu(opened, '/documents'));
  check('관리 대상이 아닌 경로는 예외 없음', !isStaffOpenedByMenu(opened, '/admin') && !isStaffOpenedByMenu(opened, '/dev-tools') && !isStaffOpenedByMenu(opened, undefined));

  // ★ 예전에 저장된 {users:true} 는 직원에게 열겠다는 뜻이 아니었다
  const legacyOn = parseMenuVisibilityConfig({ '/exam-schedule': { users: true } });
  check('구 {users:true} 는 닫힌 경로의 직원을 열지 않는다', !resolveMenuVisibility(legacyOn, '/exam-schedule').staff && resolveMenuVisibility(legacyOn, '/exam-schedule').teacher);
  check('… 라우트 예외도 없다', !isStaffOpenedByMenu(legacyOn, '/exam-schedule'));
  check('구 {users:false} 는 여전히 전원 끔', (() => { const v = resolveMenuVisibility({ '/evalog': { users: false } }, '/evalog'); return !v.student && !v.teacher && !v.staff; })());
  // 라이브에 저장돼 있는 값(2026-09-21 실측) — 이번 변경으로 아무에게도 새로 열리지 않아야 한다
  const live = parseMenuVisibilityConfig({ '/exam-schedule': { admin: false, users: false }, '/timetable-generator': { admin: false, users: false } });
  check('라이브 저장값: 누구에게도 새로 열리지 않는다', ['/exam-schedule', '/timetable-generator'].every((k) => [TEACHER, STAFF, ADMIN, STUDENT].every((who) => !isPathVisible(live, k, who))));

  // 저장 왕복 — 직원 기본값이 다른 메뉴는 users 로 접지 않는다
  const draft: Record<string, MenuVisibility> = {};
  for (const m of MANAGED_MENUS) draft[m.key] = resolveMenuVisibility({}, m.key);
  check('손대지 않으면 빈 저장값(직원 기본 꺼짐이 저장되지 않는다)', Object.keys(buildMenuVisibilityPayload(draft)).length === 0);
  draft['/evalog'] = { ...draft['/evalog'], staff: true };
  check('직원에게 열기 = {staff:true} 만 적는다', JSON.stringify(buildMenuVisibilityPayload(draft)['/evalog']) === JSON.stringify({ staff: true }));
  draft['/ipsi'] = { student: false, teacher: false, staff: false, admin: true };
  const payload = buildMenuVisibilityPayload(draft);
  check('닫힌 경로를 전원 끄기 — users 로 접지 않고 바뀐 대상만', JSON.stringify(payload['/ipsi']) === JSON.stringify({ student: false, teacher: false }), payload['/ipsi']);
  const back = parseMenuVisibilityConfig(JSON.parse(JSON.stringify(payload)));
  check('왕복', MANAGED_MENUS.every((m) => JSON.stringify(resolveMenuVisibility(back, m.key)) === JSON.stringify(draft[m.key])));

  // ★ 기본이 '전원 꺼짐'이면서 직원에게 닫힌 메뉴(시험 시간표)를 전원에게 켠다 — users 로 접으면
  //    읽을 때 직원에게 적용되지 않아 직원만 꺼진 채 돌아온다(실제로 그렇게 만들었다가 회귀가 잡았다)
  const d2: Record<string, MenuVisibility> = {};
  for (const m of MANAGED_MENUS) d2[m.key] = resolveMenuVisibility({}, m.key);
  d2['/exam-schedule'] = { student: true, teacher: true, staff: true, admin: true };
  const p2 = buildMenuVisibilityPayload(d2);
  check('닫힌 경로는 세 값이 같아도 users 로 접지 않는다', !('users' in p2['/exam-schedule']) && p2['/exam-schedule'].staff === true, p2['/exam-schedule']);
  check('… 왕복', JSON.stringify(resolveMenuVisibility(parseMenuVisibilityConfig(p2), '/exam-schedule')) === JSON.stringify(d2['/exam-schedule']));

  // 구 관리자 전용 메뉴 — 기본은 관리자만, 켜면 교사에게 열린다
  check('간격반복·시간표 생성의 기본 = 관리자만', ['/spaced-repetition', '/timetable-generator'].every((k) => !isPathVisible({}, k, TEACHER) && !isPathVisible({}, k, STAFF) && !isPathVisible({}, k, STUDENT) && isPathVisible({}, k, ADMIN)));
  check('교사에게 열 수 있다', isPathVisible({ '/spaced-repetition': { teacher: true } }, '/spaced-repetition', TEACHER) && !isPathVisible({ '/spaced-repetition': { teacher: true } }, '/spaced-repetition', STAFF));
}

console.log('[⑨ 서랍 관리 — 이름·이동·순서·추가·삭제 (2026-10-11)]');
{
  const before = allHrefs(base());
  const roundTrip = (edited: NavSection[]) => {
    const layout = deriveNavLayout(base(), edited);
    const reparsed = parseNavLayoutConfig(JSON.parse(JSON.stringify({ teacher: layout }))).teacher;
    return applyNavLayout(base(), reparsed);
  };
  const groupOf = (sections: NavSection[], id: string) => listGroups(sections).find((g) => g.group.id === id);

  // 이름 변경
  const renamed = renameGroup(base(), 'tasks-hub', '업무');
  check('서랍 이름 변경', groupOf(renamed, 'tasks-hub')?.group.name === '업무');
  check('원본은 그대로', groupOf(base(), 'tasks-hub')?.group.name === '업무 관리');
  check('이름 변경은 모양 변경으로 잡힌다', !sameNavShape(renamed, base()));
  const rLayout = deriveNavLayout(base(), renamed);
  check('저장값 = 바뀐 이름만', JSON.stringify(rLayout) === JSON.stringify({ groups: { 'tasks-hub': '업무' } }), rLayout);
  check('이름 변경 왕복', sameNavShape(roundTrip(renamed), renamed));

  // 다른 범례로 이동(안의 메뉴째)
  const fromKey = sectionKeyOfGroup(base(), 'analytics-hub');
  const moved = moveGroupTo(base(), 'analytics-hub', 'section:tools');
  check('서랍 이동', sectionKeyOfGroup(moved, 'analytics-hub') === 'section:tools' && fromKey !== 'section:tools');
  check('서랍째 옮겨도 메뉴는 그대로', allHrefs(moved).join() === before.join() && containerKeyOf(moved, '/evalog') === 'group:analytics-hub');
  check('서랍 이동 왕복', sameNavShape(roundTrip(moved), moved));
  check('잠긴 범례로는 못 옮긴다', sectionKeyOfGroup(moveGroupTo(base(), 'analytics-hub', 'section:admin'), 'analytics-hub') === fromKey);
  const ghostMove = applyNavLayout(base(), { placements: { 'group:analytics-hub': 'section:no-such' } });
  check('대상 범례가 없는 서랍 이동은 무시', sectionKeyOfGroup(ghostMove, 'analytics-hub') === fromKey);
  check('서랍 안에 서랍은 없다(파싱이 버린다)', !parseNavLayoutConfig({ teacher: { placements: { 'group:tasks-hub': 'group:analytics-hub' } } }).teacher);

  // 범례 안 순서
  const todayItems = base().find((s) => s.id === 'today')!.items;
  const hubIdx = todayItems.findIndex((e) => isNavGroup(e) && e.id === 'tasks-hub');
  if (hubIdx > 0) {
    const up = moveGroupBy(base(), 'tasks-hub', -1);
    const upIdx = up.find((s) => s.id === 'today')!.items.findIndex((e) => isNavGroup(e) && e.id === 'tasks-hub');
    check('서랍 위로', upIdx === hubIdx - 1);
    check('서랍 순서 왕복', sameNavShape(roundTrip(up), up));
  }

  // 새 서랍 → 메뉴 넣기 → 왕복
  let custom = addGroup(base(), 'tools', '행정 업무', 'custom:g1');
  check('새 서랍은 범례 끝에', sectionKeyOfGroup(custom, 'custom:g1') === 'section:tools');
  custom = moveItemTo(custom, '/documents', 'group:custom:g1');
  check('새 서랍으로 메뉴 이동', containerKeyOf(custom, '/documents') === 'group:custom:g1');
  const cLayout = deriveNavLayout(base(), custom)!;
  check('만든 서랍은 이름·자리를 함께 적는다', cLayout.groups?.['custom:g1'] === '행정 업무' && cLayout.placements?.['group:custom:g1'] === 'section:tools', cLayout);
  const cBack = roundTrip(custom);
  check('새 서랍 왕복', sameNavShape(cBack, custom) && containerKeyOf(cBack, '/documents') === 'group:custom:g1');
  check('메뉴는 하나도 사라지지 않는다', allHrefs(cBack).join() === before.join());
  const orphan = applyNavLayout(base(), { groups: { 'custom:g2': '자리 잃은 서랍' }, placements: { 'group:custom:g2': 'section:no-such' } });
  check('만든 서랍의 범례가 사라지면 첫 범례로', !!groupOf(orphan, 'custom:g2'));

  // 삭제 — 비어 있어야
  const full = groupOf(base(), 'analytics-hub')!.group;
  check('메뉴가 든 서랍은 못 지운다', !canDeleteGroup(full) && !!groupOf(deleteGroup(base(), 'analytics-hub'), 'analytics-hub'));
  let emptied = base();
  for (const h of hrefsOf(base(), 'group:analytics-hub')) emptied = moveItemTo(emptied, h, 'section:tools');
  const deleted = deleteGroup(emptied, 'analytics-hub');
  check('비운 서랍은 지워진다', !groupOf(deleted, 'analytics-hub') && allHrefs(deleted).join() === before.join());
  const dLayout = deriveNavLayout(base(), deleted)!;
  check('지운 코드 서랍이 저장된다', dLayout.deletedGroups?.includes('analytics-hub') === true, dLayout);
  check('삭제 왕복', sameNavShape(roundTrip(deleted), deleted));
  const revived = applyNavLayout(base(), { deletedGroups: ['analytics-hub'] });
  check('메뉴가 남으면 지운 서랍이 되살아난다', !!groupOf(revived, 'analytics-hub') && allHrefs(revived).join() === before.join());
  const customGone = deleteGroup(addGroup(base(), 'tools', '임시', 'custom:g3'), 'custom:g3');
  check('만든 서랍을 지우면 저장값에서도 사라진다', deriveNavLayout(base(), customGone) === null);

  // 범례의 유일한 항목이던 서랍을 지우면 범례도 지울 수 있다
  const lone = addGroup(addSection(base(), '임시 범례', 'custom:s9'), 'custom:s9', '빈 서랍', 'custom:g4');
  check('빈 서랍이 든 범례는 아직 못 지운다', !canDeleteSection(lone.find((s) => s.id === 'custom:s9')!));
  const loneClean = deleteGroup(lone, 'custom:g4');
  check('서랍을 지우면 범례를 지울 수 있다', canDeleteSection(loneClean.find((s) => s.id === 'custom:s9')!));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
