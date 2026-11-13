// 외부 메뉴 배치(placement) 해석기 회귀 — `npx tsx scripts/nav-placement-test/run.mts`
//
// useNavSections가 하는 "깊은 복사 → placeNavItem" 절차를 그대로 재현해,
// 관리 UI가 제시하는 배치 후보가 전부 실제 대상으로 해석되는지 검증한다.
// (카탈로그와 섹션/그룹 id가 어긋나면 메뉴가 조용히 기본 서랍으로 폴백해버려
//  화면상으로는 "설정이 안 먹는" 것처럼만 보이므로 기계 검증이 필요하다.)
import {
  DEFAULT_NAV_PLACEMENT,
  isNavGroup,
  placeNavItem,
  regularNavSections,
  studentNavPlacements,
  studentNavSections,
  teacherNavPlacements,
  type NavItem,
  type NavSection,
} from '../../src/config/navigation';

let pass = 0;
function ok(cond: boolean, name: string): void {
  if (!cond) { console.error('  ✗', name); process.exit(1); }
  console.log('  ✓', name); pass++;
}

// useNavSections 교사 경로와 동일한 깊은 복사(그룹 children까지 새 배열)
function cloneTeacher(): NavSection[] {
  return regularNavSections.map((section) => ({
    ...section,
    items: section.items.map((item) => (isNavGroup(item) ? { ...item, children: [...item.children] } : item)),
  }));
}

// 학생 섹션에는 그룹이 없어 items 얕은 복사면 충분(useNavSections와 동일)
function cloneStudent(): NavSection[] {
  return studentNavSections.map((section) => ({ ...section, items: [...section.items] }));
}

const item = (name: string): NavItem => ({ name, href: `/iframe/${name}`, icon: null as any });

console.log('[1] 교사 배치 후보가 전부 실제 대상으로 해석됨');
for (const option of teacherNavPlacements) {
  if (option.value === DEFAULT_NAV_PLACEMENT) continue;
  ok(placeNavItem(cloneTeacher(), option.value, item(option.value)), option.value);
}

console.log('[2] 학생 배치 후보가 전부 실제 대상으로 해석됨');
for (const option of studentNavPlacements) {
  if (option.value === DEFAULT_NAV_PLACEMENT) continue;
  ok(placeNavItem(cloneStudent(), option.value, item(option.value)), option.value);
}

console.log('[3] 올바른 위치에 삽입됨');
{
  const sections = cloneTeacher();

  placeNavItem(sections, 'section:tools', item('도구메뉴'));
  const tools = sections.find((s) => s.id === 'tools')!;
  ok(tools.items[tools.items.length - 1].name === '도구메뉴', '섹션 items 끝에 append');

  placeNavItem(sections, 'group:academic-ops-hub', item('허브메뉴'));
  const opsGroup = sections.find((s) => s.id === 'academic-ops')!.items[0];
  ok(
    isNavGroup(opsGroup) && opsGroup.children[opsGroup.children.length - 1].name === '허브메뉴',
    '학사 운영 허브 children 끝에 append'
  );

  placeNavItem(sections, 'group:analytics-hub', item('분석메뉴'));
  const anaGroup = sections.find((s) => s.id === 'analytics')!.items[0];
  ok(
    isNavGroup(anaGroup) && anaGroup.children[anaGroup.children.length - 1].name === '분석메뉴',
    '입시 분석 허브 children 끝에 append'
  );
}

console.log('[4] 대상이 없으면 false → 호출자가 기본 외부 메뉴 서랍으로 폴백');
{
  const sections = cloneTeacher();
  // [학습]은 admin에게만 동적 주입되므로 일반 교사 트리엔 없다 = 폴백 대상
  ok(placeNavItem(sections, 'section:learning', item('x')) === false, 'admin 전용 미주입 섹션');
  ok(placeNavItem(sections, 'group:nope', item('x')) === false, '없는 그룹 id');
  ok(placeNavItem(sections, 'garbage', item('x')) === false, '형식 불명 값');
  ok(placeNavItem(sections, DEFAULT_NAV_PLACEMENT, item('x')) === false, "기본값 'external'은 미배치");
}

console.log('[5] 원본 상수 오염 없음(깊은 복사 전제 확인)');
{
  const toolsBefore = regularNavSections.find((s) => s.id === 'tools')!.items.length;
  const opsHub = regularNavSections.find((s) => s.id === 'academic-ops')!.items[0];
  const opsBefore = isNavGroup(opsHub) ? opsHub.children.length : -1;

  for (let i = 0; i < 3; i++) {
    const sections = cloneTeacher();
    placeNavItem(sections, 'section:tools', item(`t${i}`));
    placeNavItem(sections, 'group:academic-ops-hub', item(`h${i}`));
  }

  ok(regularNavSections.find((s) => s.id === 'tools')!.items.length === toolsBefore, '섹션 items 길이 불변');
  ok((isNavGroup(opsHub) ? opsHub.children.length : -1) === opsBefore, '그룹 children 길이 불변');
}

console.log(`\n전체 ${pass}건 PASS`);
