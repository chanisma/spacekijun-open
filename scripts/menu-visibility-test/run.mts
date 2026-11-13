// 메뉴 활성화 설정 회귀 — `npx tsx scripts/menu-visibility-test/run.mts`
//
// 이 기능은 "조용히 틀리는" 실패 모드가 많아 기계 검증이 필요하다:
//  · 카탈로그 키와 실제 네비 항목이 어긋나면 관리 화면에서 껐는데 메뉴는 그대로 남는다.
//  · 경로 판정이 세그먼트 경계를 안 지키면 `/timetable`을 끄는 순간 `/timetable-generator`가
//    함께 죽는다(이 저장소에 실제로 존재하는 접두 충돌 쌍).
//  · 기본값을 DB가 아니라 코드에 둔 것이 "개발 중 메뉴가 깜빡이지 않는" 근거이므로,
//    그 기본값 자체를 못 박아 둔다.
import {
  MANAGED_MENUS,
  MANAGED_MENUS_BY_SPECIFICITY,
  MANAGED_MENU_BY_KEY,
  MANAGED_MENU_GROUPS,
} from '../../src/config/menuRegistry';
import {
  buildMenuVisibilityPayload,
  defaultVisibilityOf,
  findManagedMenuForPath,
  isPathHidden,
  isPathVisible,
  parseMenuVisibilityConfig,
  resolveAllMenuVisibility,
  resolveMenuVisibility,
  type MenuVisibility,
  type MenuVisibilityConfig,
} from '../../src/lib/menuVisibility';
import {
  commonNavItems,
  isNavGroup,
  regularNavSections,
  studentNavSections,
  type NavItem,
  type NavSection,
} from '../../src/config/navigation';

let pass = 0;
function ok(cond: boolean, name: string): void {
  if (!cond) {
    console.error('  ✗', name);
    process.exit(1);
  }
  console.log('  ✓', name);
  pass++;
}

const USER = { isAdmin: false };
const ADMIN = { isAdmin: true };
const EMPTY: MenuVisibilityConfig = {};

// ----------------------------------------
console.log('[1] 카탈로그 무결성');
// ----------------------------------------
ok(MANAGED_MENUS.length > 0, '항목이 존재한다');
ok(
  MANAGED_MENUS.every((m) => m.key.startsWith('/')),
  '모든 키가 내부 경로(/…)다'
);
ok(
  new Set(MANAGED_MENUS.map((m) => m.key)).size === MANAGED_MENUS.length,
  '키 중복이 없다'
);
ok(
  MANAGED_MENUS.every((m) => MANAGED_MENU_GROUPS.includes(m.group)),
  '모든 항목의 그룹이 표시 순서 목록에 있다'
);
ok(
  MANAGED_MENUS.every((m) => MANAGED_MENU_BY_KEY.get(m.key) === m),
  '키 인덱스가 카탈로그와 일치한다'
);
ok(
  MANAGED_MENUS_BY_SPECIFICITY.every(
    (m, i, arr) => i === 0 || arr[i - 1].key.length >= m.key.length
  ),
  '경로 판정용 목록이 키 길이 내림차순이다'
);
ok(
  !MANAGED_MENU_BY_KEY.has('/') && !MANAGED_MENU_BY_KEY.has('/admin'),
  '홈·관리자는 관리 대상에서 제외됐다 (끄면 돌아올 곳·되돌릴 화면이 사라진다)'
);

// ----------------------------------------
console.log('[2] 카탈로그 ↔ 실제 네비게이션 정합');
// ----------------------------------------
//
// 정적 섹션(교사·학생) + useNavSections가 조건부로 주입하는 항목이 곧 "관리 가능한 메뉴"의
// 모집단이다. 여기가 어긋나면 새 메뉴를 추가하고 카탈로그에 넣는 것을 잊었거나(관리 불가),
// 사라진 메뉴가 관리 화면에만 남는다(죽은 스위치).
function flatten(sections: NavSection[]): NavItem[] {
  return sections.flatMap((s) =>
    s.items.flatMap((item) => (isNavGroup(item) ? item.children : [item]))
  );
}

/** useNavSections가 권한·역할에 따라 동적으로 push/splice 하는 항목들 */
const DYNAMIC_NAV_ITEMS: NavItem[] = [
  commonNavItems.timetableGenerator, // isAdminUI → 학사 운영 허브
  commonNavItems.rescueNote, // rescueAccess.canSeeMenu → 학사 운영 허브
  commonNavItems.spacedRepetition, // isAdminUI → [학습] 섹션
];

/** 관리 대상에서 의도적으로 뺀 것 — 이유는 menuRegistry.ts 주석 참고 */
const INTENTIONALLY_UNMANAGED = new Set(['/', '/admin']);

const navHrefs = new Set(
  [...flatten(regularNavSections), ...flatten(studentNavSections), ...DYNAMIC_NAV_ITEMS]
    .map((item) => item.href)
    .filter((href) => !INTENTIONALLY_UNMANAGED.has(href))
);
const catalogKeys = new Set(MANAGED_MENUS.map((m) => m.key));

const missing = [...navHrefs].filter((href) => !catalogKeys.has(href));
ok(missing.length === 0, `네비의 모든 메뉴가 카탈로그에 있다${missing.length ? ` (누락: ${missing.join(', ')})` : ''}`);

const stale = [...catalogKeys].filter((key) => !navHrefs.has(key));
ok(stale.length === 0, `카탈로그에 죽은 항목이 없다${stale.length ? ` (잔존: ${stale.join(', ')})` : ''}`);

// 라벨은 commonNavItems에서 가져온다 — 메뉴 이름을 고쳤을 때 관리 화면만 옛 이름으로 남지 않게.
const navItemByHref = new Map(
  [...flatten(regularNavSections), ...flatten(studentNavSections), ...DYNAMIC_NAV_ITEMS].map(
    (item) => [item.href, item]
  )
);
ok(
  MANAGED_MENUS.every((m) => navItemByHref.get(m.key)?.name === m.label),
  '라벨이 네비 항목 이름과 같다'
);

// ----------------------------------------
console.log('[3] 경로 판정 — 세그먼트 경계');
// ----------------------------------------
ok(findManagedMenuForPath('/timetable')?.key === '/timetable', '/timetable → 시간표');
ok(
  findManagedMenuForPath('/timetable-generator')?.key === '/timetable-generator',
  '/timetable-generator는 /timetable에 삼켜지지 않는다 (핵심 회귀)'
);
ok(
  findManagedMenuForPath('/timetable-generator/new')?.key === '/timetable-generator',
  '/timetable-generator/new → 시간표 생성'
);
ok(
  findManagedMenuForPath('/exam-schedule/mock/new')?.key === '/exam-schedule',
  '하위 경로는 상위 메뉴에 귀속된다'
);
ok(
  findManagedMenuForPath('/issue-register/volunteer')?.key === '/issue-register/volunteer',
  '두 단계 키도 정확히 매칭된다'
);
ok(
  findManagedMenuForPath('/collab/abc-123')?.key === '/collab',
  '/collab/:id → 협업 보드'
);
ok(
  findManagedMenuForPath('/student-collab')?.key === '/student-collab',
  '/student-collab은 /collab과 별개 항목이다'
);
ok(findManagedMenuForPath('/') === null, '홈은 관리 대상이 아니다');
ok(findManagedMenuForPath('/admin') === null, '관리자 화면은 관리 대상이 아니다');
ok(findManagedMenuForPath('/calls') === null, '헤더 진입점(전화번호부)은 관리 대상이 아니다');
ok(
  findManagedMenuForPath('https://example.com') === null,
  '외부 메뉴(절대 URL)는 관리 대상이 아니다'
);

// ----------------------------------------
console.log('[4] 코드 기본값 — 개발 중 기능');
// ----------------------------------------
// 2026-09-21: 간격반복 학습은 개발 중이 아니라 **구 관리자 전용 메뉴** — 예전엔 admin 에게만 주입하던 것을
// "기본 = 관리자만"이라는 코드 기본값으로 옮겼다(동작은 같고, 메뉴 관리에서 열 수 있게 됐다).
// 2026-10-05: 업무 관리의 「학교 전체」 페이지 — 탭 시절엔 코드(isAdmin)로만 막던 관리자 전용을 메뉴 기본값으로도 건다.
// 2026-10-06: 다마고찌 Phase 1 — 개발 중이라 관리자만 → 2026-10-07 Phase 7(학생 공개 준비)에서 기본 공개로 뺐다(직원은 routeAccess 가 닫는다).
// 2026-10-10: 별까지 쌓기 — 신설 때 관리자만 → 같은 날 공개(«이제 기능 LIVE로»). 직원은 routeAccess 가 닫는다.
// 2026-10-23: 자동화 업무 — 실행 서버(쿨메신저 폴러) 준비 전이라 관리자만. 폴러를 붙이면 메뉴 관리에서 연다.
// 2026-10-30: 공문 판단함 1단계 — 관리자 전용(표 RLS 도 관리자만).
// 2026-10-26: 투자 게임 — 진짜 코인이 움직여 확인 전에는 관리자만(docs/plans/2026-10-26-invest-game.md §8).
// 2026-11-08: 「오늘」 시험판(업무 온톨로지 P0) — 읽기 전용 시험이라 관리자만. P3 에서 내 할 일을 대신할 때 연다.
// 2026-11-10: 예산(업무 관리 서랍) — 시험 중이라 관리자만. 담당 교사에게는 «메뉴 관리»에서 연다.
// 2026-11-11: 동아리 — 동아리 관리 P1 시험 중이라 관리자만. 단계가 끝나면 메뉴 관리에서 연다.
const DEV_IN_PROGRESS = ['/exam-schedule', '/timetable-generator', '/spaced-repetition', '/tasks/map', '/automations', '/tasks/docs', '/tasks/budget', '/clubs'];
for (const key of DEV_IN_PROGRESS) {
  const menu = MANAGED_MENU_BY_KEY.get(key)!;
  ok(menu.defaultVisibleToUsers === false, `${key}: 일반 사용자에게 기본 비노출`);
  ok(menu.defaultVisibleToAdmin === true, `${key}: 관리자에게는 기본 노출 (개발 계속 가능)`);
}
ok(
  MANAGED_MENUS.filter((m) => !m.defaultVisibleToUsers).length === DEV_IN_PROGRESS.length,
  '기본 비노출은 이 목록뿐이다(개발 중 3 + 관리자 전용 2)'
);
ok(
  MANAGED_MENUS.every((m) => m.defaultVisibleToAdmin),
  '관리자 기본값은 전부 노출이다'
);

// 설정이 하나도 없을 때(=DB 행 없음, 조회 로딩 중) 곧바로 적용되는지
ok(isPathHidden(EMPTY, '/exam-schedule', USER), '설정 없이도 사용자에게는 시험 시간표가 막힌다');
ok(isPathVisible(EMPTY, '/exam-schedule', ADMIN), '설정 없이도 관리자는 시험 시간표에 들어간다');
ok(isPathHidden(EMPTY, '/timetable-generator/new', USER), '하위 경로도 함께 막힌다');
ok(isPathVisible(EMPTY, '/timetable', USER), '접두가 겹치는 시간표는 열려 있다 (핵심 회귀)');
ok(isPathVisible(EMPTY, '/tasks/mine', USER), '나머지 메뉴는 기본 노출이다');
ok(isPathVisible(EMPTY, '/', USER), '홈은 언제나 열려 있다');
ok(isPathVisible(EMPTY, '/admin', USER), '관리자 화면은 이 설정으로 막히지 않는다');
ok(isPathVisible(EMPTY, undefined, USER), '경로가 없으면 통과시킨다');

// ----------------------------------------
console.log('[5] 저장값 파싱');
// ----------------------------------------
ok(Object.keys(parseMenuVisibilityConfig(null)).length === 0, 'null → 빈 설정');
ok(Object.keys(parseMenuVisibilityConfig('x')).length === 0, '문자열 → 빈 설정');
ok(Object.keys(parseMenuVisibilityConfig([1, 2])).length === 0, '배열 → 빈 설정');
{
  const parsed = parseMenuVisibilityConfig({
    '/tasks/mine': { users: false, admin: true },
    '/documents': { users: 'no' }, // 잘못된 타입 → 무시
    'tasks': { users: false }, // 경로가 아님 → 무시
    '/toolbox': {}, // 빈 객체 → 무시
    '/legacy-menu': { users: false }, // 카탈로그에 없는 키 → 보존(해석에서 무시)
  });
  ok(parsed['/tasks/mine']?.users === false && parsed['/tasks/mine']?.admin === true, '정상 항목을 읽는다');
  ok(!('/documents' in parsed), '값 타입이 어긋난 항목은 버린다');
  ok(!('tasks' in parsed), '경로가 아닌 키는 버린다');
  ok(!('/toolbox' in parsed), '빈 객체는 버린다');
  ok(
    parsed['/legacy-menu']?.users === false,
    '카탈로그에 없는 키는 지우지 않는다 (개편 중 설정 증발 방지)'
  );
}

// ----------------------------------------
console.log('[6] 실효값 해석 — 부분 설정 병합');
// ----------------------------------------
{
  // users만 저장된 경우 admin은 코드 기본값을 따라야 한다.
  const config: MenuVisibilityConfig = { '/tasks/mine': { users: false } };
  const v = resolveMenuVisibility(config, '/tasks/mine');
  // 2026-09-21: `users` 는 저장 형식(세 대상의 기본값)이고, 해석 결과는 대상별로 펼쳐진다
  ok(!v.student && !v.teacher && !v.staff && v.admin === true, '빠진 쪽은 코드 기본값으로 채운다');
}
{
  // 개발 중 메뉴를 관리자가 전체 공개로 되돌리는 경우
  const config: MenuVisibilityConfig = { '/exam-schedule': { users: true } };
  ok(isPathVisible(config, '/exam-schedule', USER), '저장값이 코드 기본값을 덮는다');
}
{
  // 관리자에게도 감추는 경우 (완전 비활성)
  const config: MenuVisibilityConfig = { '/toolbox': { users: false, admin: false } };
  ok(isPathHidden(config, '/toolbox', USER), '사용자에게 막힘');
  ok(isPathHidden(config, '/toolbox', ADMIN), '관리자에게도 막힘');
}
ok(
  (['student', 'teacher', 'staff', 'admin'] as const).every(
    (who) => resolveMenuVisibility(EMPTY, '/not-in-catalog')[who] === true,
  ),
  '카탈로그 밖 키는 전부 노출로 본다'
);
{
  const rows = resolveAllMenuVisibility(EMPTY);
  ok(rows.length === MANAGED_MENUS.length, '관리 화면 표가 전 항목을 담는다');
  ok(rows.every((r) => r.isDefault), '저장값이 없으면 전부 기본값 상태다');
  const changed = resolveAllMenuVisibility({ '/tasks/mine': { users: false } });
  ok(
    changed.find((r) => r.menu.key === '/tasks/mine')?.isDefault === false,
    '기본값과 다르면 isDefault=false'
  );
}

// ----------------------------------------
console.log('[7] 저장 payload — 기본값은 빼고 적는다');
// ----------------------------------------
{
  const draft: Record<string, MenuVisibility> = {};
  for (const menu of MANAGED_MENUS) draft[menu.key] = defaultVisibilityOf(menu);

  const payload = buildMenuVisibilityPayload(draft);
  ok(
    Object.keys(payload).length === 0,
    '전부 기본값이면 빈 JSON — 유령 설정을 남기지 않는다'
  );

  draft['/tasks/mine'] = { student: false, teacher: false, staff: false, admin: true };
  const payload2 = buildMenuVisibilityPayload(draft);
  ok(Object.keys(payload2).length === 1, '바뀐 항목만 기록한다');
  // 세 대상이 같은 값이면 구 형식과 같은 `users` 하나로 접히고, 기본값과 같은 admin 은 적지 않는다
  ok(payload2['/tasks/mine'].users === false && !('admin' in payload2['/tasks/mine']), '값이 정확하다');

  // 개발 중 메뉴를 기본값(users:false)으로 둔 채 저장 → 기록되지 않아야 한다
  ok(!('/exam-schedule' in payload2), '기본값 그대로인 개발 중 메뉴는 기록하지 않는다');

  // 반대로 공개로 바꾸면 기록된다
  draft['/exam-schedule'] = { student: true, teacher: true, staff: true, admin: true };
  ok(
    // 직원에게 닫힌 경로라 `users` 로 접지 않고 대상별로 적는다(2026-09-21)
    buildMenuVisibilityPayload(draft)['/exam-schedule']?.teacher === true,
    '기본값에서 벗어나면 기록한다'
  );

  // 왕복 검증: payload → parse → resolve 가 draft와 같아야 한다
  const roundTrip = parseMenuVisibilityConfig(buildMenuVisibilityPayload(draft));
  ok(
    MANAGED_MENUS.every((m) => {
      const a = resolveMenuVisibility(roundTrip, m.key);
      const b = draft[m.key];
      return (['student', 'teacher', 'staff', 'admin'] as const).every((who) => a[who] === b[who]);
    }),
    '저장 → 재해석 왕복이 값을 보존한다'
  );
}

// ----------------------------------------
console.log('[8] 네비 조립 시뮬레이션 — 빈 그룹·섹션 정리');
// ----------------------------------------
//
// useNavSections의 pruneNavSections는 훅 내부 함수라 직접 import 할 수 없어, 같은 규칙을
// 재현해 "메뉴를 끄면 사이드바에서 실제로 사라지는가 / 빈 껍데기가 남지 않는가"를 본다.
function prune(sections: NavSection[], config: MenuVisibilityConfig, isAdmin: boolean): NavSection[] {
  const keep = (item: NavItem) => isPathVisible(config, item.href, { isAdmin });
  return sections
    .map((section) => ({
      ...section,
      items: section.items.flatMap((entry) => {
        if (isNavGroup(entry)) {
          const children = entry.children.filter(keep);
          return children.length > 0 ? [{ ...entry, children }] : [];
        }
        return keep(entry) ? [entry] : [];
      }),
    }))
    .filter((section) => section.items.length > 0);
}

{
  const hrefsOf = (sections: NavSection[]) => new Set(flatten(sections).map((i) => i.href));

  const asUser = prune(regularNavSections, EMPTY, false);
  ok(!hrefsOf(asUser).has('/exam-schedule'), '사용자 사이드바에서 시험 시간표가 빠진다');
  ok(hrefsOf(asUser).has('/timetable'), '시간표는 남는다 (접두 충돌 회귀)');
  ok(hrefsOf(asUser).has('/course-analyze'), '같은 그룹의 다른 메뉴는 남는다');

  const asAdmin = prune(regularNavSections, EMPTY, true);
  ok(hrefsOf(asAdmin).has('/exam-schedule'), '관리자 사이드바에는 시험 시간표가 남는다');

  // 그룹 전체를 끄면 그 그룹과 섹션이 통째로 사라져야 한다(빈 껍데기 방지)
  const opsGroup = regularNavSections
    .find((s) => s.id === 'academic-ops')!
    .items.find(isNavGroup)!;
  const killAll: MenuVisibilityConfig = {};
  for (const child of opsGroup.children) killAll[child.href] = { users: false, admin: false };
  const pruned = prune(regularNavSections, killAll, false);
  ok(
    !pruned.some((s) => s.id === 'academic-ops'),
    '그룹 자식이 전부 사라지면 섹션까지 함께 제거된다'
  );
  ok(pruned.some((s) => s.id === 'tools'), '다른 섹션은 영향을 받지 않는다');

  // 학생 네비에도 같은 규칙이 적용된다
  const studentPruned = prune(studentNavSections, { '/evalog': { users: false } }, false);
  ok(!hrefsOf(studentPruned).has('/evalog'), '학생 메뉴에서도 꺼진 항목이 빠진다');
  ok(hrefsOf(studentPruned).has('/evalearn'), '학생 메뉴의 나머지는 남는다');
}

console.log(`\n총 ${pass}건 통과`);
