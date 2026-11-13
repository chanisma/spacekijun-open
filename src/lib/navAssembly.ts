/**
 * 네비의 **기본 배치** 조립 (2026-09-21) — 순수 함수. `useNavSections`(실제 사이드바)와
 * Admin ▸ 메뉴 관리(편집 화면)가 **같은 것**을 보기 위해 훅에서 뽑아냈다.
 *
 * 훅 안에 두면 관리 화면이 주입 규칙을 베껴 쓰게 되고, 그러면 "관리 화면에는 보이는데 실제로는
 * 다른 자리에 있는" 메뉴가 생긴다(모바일 하단 5칸 판정을 `navMobileLayout.ts` 로 뽑은 것과 같은 이유).
 *
 * 순서: 코드 기본 배치 → **권한별 동적 주입(여기)** → 저장된 배치(`navLayout.ts`) → 모바일 재배치 →
 * 외부 메뉴 배치 → 역할·노출 설정으로 가지치기.
 */
import {
  commonNavItems,
  isNavGroup,
  regularNavSections,
  studentNavSections,
  type NavSection,
} from '@/config/navigation';
import { cloneNavSections, type NavKind } from '@/lib/navLayout';

export interface TeacherNavFlags {
  /**
   * 위기 노트 — 담임·상담교사·업무담당자에게만. **학생별 돌봄 권한**(`can_care_student`)이라는
   * 자료 권한에서 나오는 것이라 메뉴 관리의 스위치로 대신할 수 없다(끄는 것은 된다).
   */
  rescueNote: boolean;
}

/** 교사 네비에 권한별 메뉴를 주입한다. **입력은 깊은 복사본**이어야 한다(제자리에서 고친다) */
export function injectTeacherDynamicItems(sections: NavSection[], flags: TeacherNavFlags): NavSection[] {
  const opsGroup = sections.find((s) => s.id === 'academic-ops')?.items[0];
  const ops = opsGroup && isNavGroup(opsGroup) ? opsGroup : null;

  // 위기 노트 → [학사 운영] 허브의 끝 (허브가 NavGroup 이라 섹션이 아닌 children 에 넣어야 토글 안에 든다)
  if (flags.rescueNote && ops) ops.children.push(commonNavItems.rescueNote);

  // ── 예전엔 admin 에게만 주입하던 메뉴 — 지금은 **늘 넣고 노출 설정이 거른다** (2026-09-21) ──
  // 코드 기본값이 "관리자만"(`menuRegistry.ts` 의 `defaultVisibleToUsers: false`)이라 동작은 종전과 같고,
  // 관리자가 메뉴 관리에서 교사에게 열 수 있게 됐다. 두 라우트는 원래 교사에게 열려 있었다.

  // 시간표 생성 → 시험 시간표 바로 뒤
  if (ops) {
    const examIdx = ops.children.findIndex((c) => c.href === commonNavItems.examSchedule.href);
    if (examIdx >= 0) ops.children.splice(examIdx + 1, 0, commonNavItems.timetableGenerator);
    else ops.children.push(commonNavItems.timetableGenerator);
  }

  // 지식 그래프 메뉴는 현재 비활성 — 기능이 탐구 설계(/inquiry-design)에 포함됨.
  // 라우트·항목 정의는 유지하므로 재노출하려면 여기서 입시 분석 허브 children 에 넣으면 된다.

  // 간격반복 학습 → [학생 메뉴] 끝 (구 [학습] 섹션을 흡수)
  const studentMenus = sections.find((s) => s.id === 'student-menus');
  if (studentMenus) studentMenus.items.push(commonNavItems.spacedRepetition);
  else sections.push({ id: 'student-menus', label: '학생 메뉴', items: [commonNavItems.spacedRepetition] });

  return sections;
}

/**
 * 관리 화면이 편집하는 기본 배치 — **주입될 수 있는 메뉴를 전부 넣은** 모습이다.
 * 권한 때문에 어떤 사용자에게는 없는 메뉴도 관리자는 옮길 수 있어야 한다.
 */
export function buildManageableBase(kind: NavKind): NavSection[] {
  if (kind === 'student') return cloneNavSections(studentNavSections);
  return injectTeacherDynamicItems(cloneNavSections(regularNavSections), { rescueNote: true });
}
