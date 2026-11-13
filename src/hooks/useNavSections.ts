import { useMemo } from 'react';
import { Globe, Monitor, LinkIcon } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/hooks/useProfile';
import { useVisibleIframeMenus, type ExternalMenu } from '@/hooks/useIframeMenus';
import { useIsMobile } from '@/hooks/useIsMobile';
import { getMenuUrl } from '@/utils/urlUtils';
import type { AppRole } from '@/lib/roles';
import { canRoleSeePath } from '@/lib/routeAccess';
import { useMenuVisibility } from '@/hooks/useMenuVisibility';
import { findManagedMenuForPath, isPathVisible, type MenuVisibilityConfig } from '@/lib/menuVisibility';
import { useUnifiedAuth } from '@/services/hooks/useUnifiedAuth';
import { useRescueAccess } from '@/features/rescue-note/hooks/useRescueAccess';
import { pickMobileBottomItems } from '@/lib/navMobileLayout';
import { useMenuLayout } from '@/hooks/useMenuLayout';
import { applyNavLayout, cloneNavSections } from '@/lib/navLayout';
import { injectTeacherDynamicItems } from '@/lib/navAssembly';
import {
  commonNavItems,
  DEFAULT_NAV_PLACEMENT,
  homeroomNavSections,
  isNavGroup,
  placeNavItem,
  regularNavSections,
  studentNavSections,
  type NavEntry,
  type NavGroup,
  type NavItem,
  type NavSection,
} from '@/config/navigation';

interface UseNavSectionsResult {
  sections: NavSection[];
  /** 검색·현재 페이지 판정 등에서 쓰는 평면 배열 (group은 children으로 평탄화) */
  flatItems: NavItem[];
  /**
   * 모바일 하단 바 — 메뉴 순서와 **따로** 정한다(관리자 설정 `mobileBottom`, 없으면 기본값).
   * 판정 = `@/lib/navMobileLayout`(2026-10-25 — 종전엔 `flatItems.slice(0, 5)` 라 시트 순서를 비틀었다)
   */
  mobileBottomItems: NavItem[];
  /** 역할/프로필 미결정 상태이면 true — UI는 스켈레톤 또는 빈 렌더 처리 */
  loading: boolean;
}

/**
 * Sidebar / 모바일 햄버거 시트가 공유하는 네비게이션 빌더.
 *
 * - 교사: regularNavSections / homeroomNavSections를 깊은 복사한 뒤
 *   iframe/link 외부 메뉴는 별도 [외부 연결] 섹션에 NavGroup("외부 메뉴")으로 래핑하여 [관리] 위에 삽입
 * - 학생: studentNavSections(오늘/분석/신청 섹션)를 깊은 복사 + showStudent 외부 메뉴·admin 미리보기
 *   항목은 [더보기] 섹션에 추가
 * - 모바일 시트도 같은 순서다 — 하단 바는 `mobileBottomItems` 가 따로 고른다
 */
export function useNavSections(): UseNavSectionsResult {
  const { user, isStudentView, isAdmin, isAdminUI, effectiveRole } = useAuth();
  const { profile, loading } = useProfile();
  const { user: authUser } = useUnifiedAuth();
  const { data: iframeMenus, loading: iframeLoading } = useVisibleIframeMenus();
  const rescueAccess = useRescueAccess();
  const isMobile = useIsMobile();
  // 관리자가 Admin ▸ 메뉴 관리에서 끈 메뉴는 여기서 걷어낸다. 설정을 아직 못 읽었으면
  // 빈 설정 = 카탈로그 코드 기본값이 적용되므로 "개발 중" 메뉴는 그 사이에도 안 보인다.
  const { config: menuVisibility } = useMenuVisibility();
  // 관리자가 바꾼 범례·메뉴 위치. 못 읽었으면 빈 설정 = 코드의 기본 배치 그대로다.
  const { config: menuLayout } = useMenuLayout();

  const sections = useMemo<NavSection[]>(() => {
    // 역할 미결정 상태 — 비워둔다.
    if (loading || (user && !profile)) {
      return [];
    }

    // ---------- 학생 ----------
    if (isStudentView) {
      // 카테고리(섹션 라벨)화된 학생 네비 — 깊은 복사로 원본 오염 방지.
      // 저장된 배치(범례·메뉴 위치)를 얹는다 — 외부 메뉴 배치보다 먼저(외부 메뉴는 끝에 붙는다).
      const studentSections: NavSection[] = applyNavLayout(
        cloneNavSections(studentNavSections),
        menuLayout.student,
      );

      // 외부 iframe/link(showStudent) → meta.studentPlacement가 가리키는 섹션에 배치하고,
      // 지정이 없거나 대상 섹션이 없으면 [더보기] 섹션의 외부 메뉴 그룹으로 모은다.
      const extraItems: NavEntry[] = [];
      if (!iframeLoading && iframeMenus && iframeMenus.length > 0) {
        const studentMenus = iframeMenus.filter((menu) => menu.meta?.showStudent === true);
        const leftovers = distributeExternalMenus(
          studentSections,
          studentMenus,
          isMobile,
          (menu) => menu.meta?.studentPlacement
        );
        if (leftovers.length > 0) {
          extraItems.push(buildExternalGroup(leftovers));
        }
      }
      // admin이 학생 미리보기 중이면: 간격반복 학습(admin 전용) + 관리자 진입점 노출
      if (isAdmin) {
        extraItems.push(commonNavItems.spacedRepetition);
        extraItems.push(commonNavItems.admin);
      }
      if (extraItems.length > 0) {
        studentSections.push({ id: 'student-extra', label: '더보기', items: extraItems });
      }

      return pruneNavSections(studentSections, effectiveRole, menuVisibility, isAdmin);
    }

    // ---------- 교사 ----------
    const meta = authUser?.primaryResource?.meta;
    const isHomeroomTeacher = Boolean(meta?.grade && meta?.class_number);
    const baseSections = isHomeroomTeacher ? homeroomNavSections : regularNavSections;

    // 기본 배치 = 코드 + 권한별 동적 주입(위기 노트·시간표 생성·간격반복). 판정은 `@/lib/navAssembly`
    // 단일 출처 — Admin ▸ 메뉴 관리가 같은 함수로 편집 화면을 그린다.
    // 시간표 생성·간격반복 학습은 예전엔 admin 에게만 주입했지만 지금은 늘 넣고 **노출 설정이 거른다**
    // (코드 기본값 = 관리자만). 교사 미리보기 중에는 isAdmin 이 false 라 교사 스위치를 따른다.
    const assembled = injectTeacherDynamicItems(cloneNavSections(baseSections), {
      rescueNote: rescueAccess.canSeeMenu,
    });

    // 관리자가 저장한 배치를 얹는다.
    const cloned: NavSection[] = applyNavLayout(assembled, menuLayout.teacher);

    // 외부 iframe/link 메뉴 배치.
    // meta.placement가 가리키는 섹션/그룹에 넣고, 지정이 없거나(기본값) 대상을 못 찾으면
    // 기존처럼 [외부 연결] 섹션 + "외부 메뉴" 서랍(NavGroup)으로 묶는다.
    // [관리] 섹션 바로 위에 삽입 → 결과 순서: ...학습(admin), 외부 연결, 관리
    if (!iframeLoading && iframeMenus && iframeMenus.length > 0) {
      const leftovers = distributeExternalMenus(
        cloned,
        iframeMenus,
        isMobile,
        (menu) => menu.meta?.placement
      );
      if (leftovers.length > 0) {
        const externalSection: NavSection = {
          id: 'external',
          label: '외부 연결',
          items: [buildExternalGroup(leftovers)],
        };
        const adminIdx = cloned.findIndex((s) => s.id === 'admin');
        if (adminIdx >= 0) {
          cloned.splice(adminIdx, 0, externalSection);
        } else {
          cloned.push(externalSection);
        }
      }
    }

    // 역할(직원)로 닫힌 경로 + 관리자가 비활성화한 메뉴를 함께 걷어낸다.
    // 라우트 가드가 이미 막지만, 보이는데 눌러도 홈으로 튕기는 건 고장처럼 보인다.
    return pruneNavSections(cloned, effectiveRole, menuVisibility, isAdmin);
  }, [
    authUser?.primaryResource?.meta,
    loading,
    user,
    profile,
    iframeMenus,
    iframeLoading,
    isMobile,
    menuVisibility,
    menuLayout,
    isStudentView,
    isAdmin,
    isAdminUI,
    effectiveRole,
    rescueAccess.canSeeMenu,
  ]);

  const flatItems = useMemo<NavItem[]>(
    () =>
      sections.flatMap((section) =>
        section.items.flatMap((item) => (isNavGroup(item) ? item.children : [item]))
      ),
    [sections]
  );

  const navKind = isStudentView ? 'student' : 'teacher';
  const mobileBottomItems = useMemo<NavItem[]>(
    () => pickMobileBottomItems(flatItems, menuLayout[navKind]?.mobileBottom, navKind),
    [flatItems, menuLayout, navKind],
  );

  return { sections, flatItems, mobileBottomItems, loading: loading || (!!user && !profile) };
}

// ----------------------------------------
// Helpers
// ----------------------------------------

/**
 * 볼 수 없는 메뉴를 걷어낸다 — 사유는 둘이고 판정 자리는 하나다.
 *
 *  1. **역할**: 직원(staff)에게 닫힌 경로 (`routeAccess.ts`)
 *  2. **활성화 설정**: 관리자가 Admin ▸ 메뉴 관리에서 끈 메뉴 (`menuVisibility.ts`)
 *
 * 둘을 한 번에 훑는 이유는 빈 껍데기 정리 때문이다. 따로 두 번 돌리면 첫 패스가
 * 남긴 빈 그룹을 두 번째 패스가 다시 지워야 해 정리 로직이 두 곳으로 갈라진다.
 *
 * 외부 메뉴(절대 URL)는 학교 밖 링크라 두 판정 모두 통과시킨다. 자식이 전부 사라진
 * 그룹과 항목이 전부 사라진 섹션은 빈 껍데기가 남지 않게 함께 제거한다.
 */
function pruneNavSections(
  sections: NavSection[],
  role: AppRole | null,
  menuVisibility: MenuVisibilityConfig,
  isAdmin: boolean
): NavSection[] {
  // 관리 대상 메뉴는 노출 설정 하나가 판정한다 — 직원 차단도 그 설정의 **코드 기본값**이 됐다
  // (2026-09-21). 카탈로그 밖 경로(관리 대상이 아닌 내부 링크)에만 종전의 역할 차단을 그대로 쓴다.
  const keep = (item: NavItem) =>
    isPathVisible(menuVisibility, item.href, { isAdmin, role }) &&
    (findManagedMenuForPath(item.href) ? true : canRoleSeePath(role, item.href));

  return sections
    .map((section) => ({
      ...section,
      items: section.items.flatMap<NavEntry>((entry) => {
        if (isNavGroup(entry)) {
          const children = entry.children.filter(keep);
          return children.length > 0 ? [{ ...entry, children }] : [];
        }
        return keep(entry) ? [entry] : [];
      }),
    }))
    .filter((section) => section.items.length > 0);
}


/**
 * 외부 메뉴들을 각자의 배치(placement) 대상에 분배하고, 배치되지 않은 것만 돌려준다.
 *
 * - 배치 키가 없거나 'external'이면 → 폴백(반환값)
 * - 'section:<id>' / 'group:<id>'인데 현재 네비에 그 대상이 없으면 → 폴백
 *   (권한 때문에 섹션이 주입되지 않은 사용자에게 메뉴가 통째로 사라지는 것 방지)
 *
 * 호출자는 반환된 폴백 항목들을 "외부 메뉴" 서랍으로 묶어 원하는 위치에 넣는다.
 * sections는 이미 깊은 복사된 상태여야 한다 (원본 상수 오염 방지).
 */
function distributeExternalMenus(
  sections: NavSection[],
  menus: ExternalMenu[],
  isMobile: boolean,
  placementOf: (menu: ExternalMenu) => string | undefined
): NavItem[] {
  const leftovers: NavItem[] = [];

  for (const menu of menus) {
    const item = buildIframeNavItem(menu, isMobile);
    const placement = placementOf(menu) || DEFAULT_NAV_PLACEMENT;

    if (placement === DEFAULT_NAV_PLACEMENT || !placeNavItem(sections, placement, item)) {
      leftovers.push(item);
    }
  }

  return leftovers;
}

/**
 * 외부 메뉴(iframe/link) 자식들을 분석 허브식 NavGroup으로 묶음.
 * NavGroupItem이 sidebar-expanded/collapsed/sheet 변형을 자동 처리하므로
 * 그룹화만으로 subcategory UI(접힘/hover popover/inline collapsible)가 활성화됨.
 */
function buildExternalGroup(children: NavItem[]): NavGroup {
  return {
    kind: 'group',
    id: 'external-menu',
    name: '외부 메뉴',
    icon: Globe,
    color: 'text-slate-600',
    children,
  };
}

function buildIframeNavItem(menu: any, isMobile: boolean): NavItem {
  return {
    name: menu.name,
    href: menu.type === 'iframe' ? `/iframe/${menu.id}` : getMenuUrl(menu, isMobile),
    icon: menu.type === 'iframe' ? Monitor : LinkIcon,
    iconUrl: menu.meta?.iconUrl,
    color: 'text-slate-600',
    isExternal: menu.type === 'link',
    target: menu.type === 'link' ? '_blank' : undefined,
    rel: menu.type === 'link' ? 'noopener noreferrer' : undefined,
    menu,
  };
}
