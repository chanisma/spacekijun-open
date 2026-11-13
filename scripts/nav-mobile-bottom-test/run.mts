/**
 * 모바일 하단 바 회귀 — `npx tsx scripts/nav-mobile-bottom-test/run.mts`
 *
 * 2026-10-25 개편: 하단 바는 **메뉴 순서의 부산물이 아니다**(종전 `flatItems.slice(0, 5)` 는 맨 앞 섹션에
 * 메뉴를 끼우면 5번째 칸이 조용히 밀렸고, 그걸 막으려 모바일 시트의 순서를 데스크톱과 다르게 비틀었다).
 * 이제 하단 바 = href 목록(관리자 설정 `menu_layout.<kind>.mobileBottom` 또는 기본값), 시트 = 데스크톱 순서.
 * 이 검사는 **실제로 쓰이는 함수**를 그대로 부른다.
 */
import {
  isNavGroup,
  regularNavSections,
  studentNavSections,
  type NavItem,
  type NavSection,
} from '../../src/config/navigation';
import {
  DEFAULT_MOBILE_BOTTOM_HREFS,
  MOBILE_BOTTOM_MAX,
  isDefaultMobileBottom,
  normalizeMobileBottom,
  pickMobileBottomItems,
} from '../../src/lib/navMobileLayout';
import { parseNavLayoutConfig } from '../../src/lib/navLayout';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

const flat = (sections: NavSection[]): NavItem[] =>
  sections.flatMap((s) => s.items.flatMap((i) => (isNavGroup(i) ? i.children : [i])));
const names = (items: NavItem[]) => items.map((i) => i.name).join(' · ');
const sectionNames = (sections: NavSection[], id: string): string[] =>
  (sections.find((s) => s.id === id)?.items ?? []).map((i) => i.name);

// ── 1. 학생 데스크톱 사이드바(= 이제 모바일 시트도 같은 순서) ─────────────────
console.log('1. 학생 메뉴 — [오늘] 끝은 플래너 계열, 아카데미는 [탐구]');
{
  const today = sectionNames(studentNavSections, 'student-today');
  const collab = today.indexOf('협업 보드');
  check('플래너가 협업 보드 바로 다음', collab >= 0 && today.indexOf('플래너') === collab + 1, today.join(' · '));
  const inquiry = sectionNames(studentNavSections, 'student-inquiry');
  // 동아리(2026-11-11) — 창체 아카이브 바로 아래: 활동을 남기는 곳 옆에 그 활동의 그릇
  check('[탐구] = 탐구 설계 · 창체 아카이브 · 동아리 · 요즘 세상 · 아카데미 · 코드 공유',
    inquiry.join() === '탐구 설계,창체 아카이브,동아리,요즘 세상,별빛 탐구 아카데미,코드 공유', inquiry.join(' · '));
  const ids = studentNavSections.map((s) => s.id);
  check('[탐구]가 [분석] 바로 위', ids.indexOf('student-inquiry') === ids.indexOf('student-analytics') - 1, ids.join(' · '));
  check('입시 정보는 [분석]에 있다', sectionNames(studentNavSections, 'student-analytics').includes('입시 정보'));
}

// ── 2. 기본 하단 바 ──────────────────────────────────────────────────────────
console.log('2. 기본 하단 바 — 학생 / 교사');
{
  const student = pickMobileBottomItems(flat(studentNavSections), null, 'student');
  check('학생 = 홈 · 시간표 · 스케줄 · 요즘 세상 · 입시 정보',
    names(student) === '홈 대시보드 · 시간표 · 스케줄 · 요즘 세상 · 입시 정보', names(student));
  const teacher = pickMobileBottomItems(flat(regularNavSections), undefined, 'teacher');
  // 2026-11-12 «내 할 일» 자리를 업무노트가 이어받았다
  check('교사 = 홈 · 시간표 · 스케줄 · 업무노트 · 입시 정보',
    names(teacher) === '홈 대시보드 · 시간표 · 스케줄 · 업무노트 · 입시 정보', names(teacher));
  for (const kind of ['teacher', 'student'] as const) {
    const hrefs = new Set(flat(kind === 'student' ? studentNavSections : regularNavSections).map((i) => i.href));
    for (const href of DEFAULT_MOBILE_BOTTOM_HREFS[kind]) check(`기본 '${href}' 가 ${kind} 메뉴에 실재`, hrefs.has(href));
    check(`${kind} 기본은 ${MOBILE_BOTTOM_MAX}칸 이하`, DEFAULT_MOBILE_BOTTOM_HREFS[kind].length <= MOBILE_BOTTOM_MAX);
  }
}

// ── 3. 하단 바는 메뉴 순서와 독립 ────────────────────────────────────────────
console.log('3. 맨 앞 범례에 메뉴를 끼워도 하단 바가 밀리지 않는다');
{
  const sections = regularNavSections.map((s) => ({ ...s, items: [...s.items] }));
  sections[0].items.unshift({ name: '새 메뉴', href: '/new-thing', icon: sections[0].items[0].icon as NavItem['icon'], color: '' } as NavItem);
  const bottom = pickMobileBottomItems(flat(sections), null, 'teacher');
  check('새 메뉴가 하단에 끼지 않는다', !bottom.some((i) => i.href === '/new-thing'), names(bottom));
  check('그대로 5칸', bottom.length === 5);
}

// ── 4. 관리자 설정 ───────────────────────────────────────────────────────────
console.log('4. 관리자 설정 — 순서·누락·폴백');
{
  const items = flat(regularNavSections);
  const custom = pickMobileBottomItems(items, ['/collab', '/', '/documents'], 'teacher');
  check('고른 순서 그대로', names(custom) === '협업 보드 · 홈 대시보드 · 서류함', names(custom));
  const missing = pickMobileBottomItems(items, ['/', '/nope', '/schedule'], 'teacher');
  check('없는 메뉴는 건너뛰고 당긴다', names(missing) === '홈 대시보드 · 스케줄', names(missing));
  const none = pickMobileBottomItems(items, ['/nope'], 'teacher');
  check('하나도 없으면 메뉴 앞 5개로', none.length === 5 && none[0].href === items[0].href, names(none));
  // 직원처럼 시간표가 걸러진 사람 — 칸이 당겨진다
  const staff = pickMobileBottomItems(items.filter((i) => i.href !== '/timetable'), null, 'teacher');
  check('걸러진 메뉴는 빠진다', !staff.some((i) => i.href === '/timetable') && staff.length === 4, names(staff));
}

// ── 5. 저장값 정리 ───────────────────────────────────────────────────────────
console.log('5. 저장값 — 정리·기본값 판정·파싱');
{
  check('중복·비문자열 제거', JSON.stringify(normalizeMobileBottom(['/', '/', 3, '', '/a'])) === '["/","/a"]');
  check('상한 5', normalizeMobileBottom(['/1', '/2', '/3', '/4', '/5', '/6'])?.length === 5);
  check('빈 배열 = null', normalizeMobileBottom([]) === null);
  check('기본값과 같으면 기본', isDefaultMobileBottom([...DEFAULT_MOBILE_BOTTOM_HREFS.teacher], 'teacher'));
  check('순서가 다르면 기본 아님', !isDefaultMobileBottom(['/timetable', '/', '/schedule', '/my-tasks', '/ipsi'], 'teacher'));
  const parsed = parseNavLayoutConfig({ student: { mobileBottom: ['/', '/planner', 7] }, teacher: { mobileBottom: 'x' } });
  check('menu_layout 에서 읽힌다', JSON.stringify(parsed.student?.mobileBottom) === '["/","/planner"]', JSON.stringify(parsed));
  check('모양이 틀리면 버린다', parsed.teacher === undefined, JSON.stringify(parsed.teacher));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
