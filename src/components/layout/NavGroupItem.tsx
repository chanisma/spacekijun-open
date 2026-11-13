import * as React from 'react';
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { TooltipWrapper } from '@/components/ui/tooltip-wrapper';
import type { NavGroup, NavItem } from '@/config/navigation';

export type NavGroupVariant = 'sidebar-expanded' | 'sidebar-collapsed' | 'sheet';

interface NavGroupItemProps {
  group: NavGroup;
  variant: NavGroupVariant;
  /** 자식 중 하나가 현재 경로면 true — 자동 펼침 + 부모 활성 표시 */
  isAnyChildActive: boolean;
  currentPath: string;
  /** Collapsed 사이드바에서 클릭 시 사이드바를 펼치는 콜백 */
  onExpandSidebar?: () => void;
  /** Sheet 안에서 자식 클릭 시 시트 닫기 등 */
  onChildNavigate?: () => void;
  /** sidebar-expanded / sheet 변형에서 인라인 자식 렌더 (호출자가 자식 NavLinkItem들을 미리 만들어 전달) */
  children?: React.ReactNode;
}

/**
 * 분석 허브 같은 sub-menu를 표현하는 컴포넌트.
 *
 * 변형:
 *  - sidebar-expanded: 인라인 Collapsible, 자식이 부모 아래로 들여쓰기 펼침
 *  - sidebar-collapsed: 아이콘만, 호버 시 우측 HoverCard로 자식 노출 + 클릭=사이드바 펼침
 *  - sheet: 모바일 햄버거 시트용 인라인 Collapsible (sidebar-expanded와 유사, 모서리·들여쓰기만 다름)
 */
export function NavGroupItem({
  group,
  variant,
  isAnyChildActive,
  currentPath,
  onExpandSidebar,
  onChildNavigate,
  children,
}: NavGroupItemProps): JSX.Element {
  const Icon = group.icon;
  const [open, setOpen] = useState<boolean>(isAnyChildActive);

  // 자식 라우트로 이동하면 자동 펼침
  useEffect(() => {
    if (isAnyChildActive) setOpen(true);
  }, [isAnyChildActive]);

  // ---------- sidebar-collapsed: 아이콘 + Hover Popover ----------
  if (variant === 'sidebar-collapsed') {
    const handleClick = (): void => {
      if (onExpandSidebar) {
        onExpandSidebar();
        setOpen(true);
      }
    };

    return (
      <HoverCard openDelay={120} closeDelay={150}>
        <HoverCardTrigger asChild>
          <div data-menu-item>
            <TooltipWrapper enabled={false} tooltip={group.name}>
              <Button
                variant="ghost"
                onClick={handleClick}
                className={cn(
                  'group w-full rounded-lg h-12 transition-all duration-300 ease-in-out',
                  'justify-center px-0',
                  isAnyChildActive
                    ? 'bg-transparent text-blue-700'
                    : 'text-gray-700 hover:bg-transparent active:scale-95'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0',
                    'transition-colors duration-200 ease-in-out mx-auto',
                    isAnyChildActive
                      ? 'bg-gray-700 text-white'
                      : cn('bg-gray-100 group-hover:bg-gray-700 group-hover:text-white', group.color || 'text-gray-500')
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </Button>
            </TooltipWrapper>
          </div>
        </HoverCardTrigger>
        <HoverCardContent side="right" align="start" sideOffset={8} className="w-56 p-2">
          <div className="px-2 pb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {group.name}
          </div>
          <div className="space-y-0.5">
            {group.children.map((child) => {
              const isActive = currentPath === child.href;
              return (
                <Link
                  key={child.href}
                  to={child.href}
                  className={cn(
                    'flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors',
                    isActive ? 'bg-gray-100 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0',
                      isActive ? 'bg-gray-700 text-white' : cn('bg-gray-100', child.color || 'text-gray-500')
                    )}
                  >
                    <PopoverChildIcon item={child} />
                  </div>
                  <span className="text-sm font-medium">{child.name}</span>
                </Link>
              );
            })}
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  // ---------- sidebar-expanded / sheet: 인라인 Collapsible ----------
  const isSheet = variant === 'sheet';

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-menu-item>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'group w-full rounded-lg transition-all duration-300 ease-in-out',
            isSheet
              ? 'h-auto justify-start gap-3 px-3 py-2 rounded-lg'
              : 'h-12 justify-start gap-3 px-3',
            isAnyChildActive
              ? isSheet
                ? 'bg-blue-50/40 text-blue-700'
                : 'bg-transparent text-blue-700'
              : 'text-gray-700 hover:bg-transparent active:scale-95'
          )}
        >
          <div
            className={cn(
              'flex items-center justify-center rounded-lg flex-shrink-0 transition-colors duration-200 ease-in-out',
              'w-8 h-8',
              isAnyChildActive
                ? 'bg-gray-700 text-white'
                : cn('bg-gray-100 group-hover:bg-gray-700 group-hover:text-white', group.color || 'text-gray-500')
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <span className="flex-1 text-left text-sm font-medium">{group.name}</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-gray-400 transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          'overflow-hidden',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
        )}
      >
        <div
          className={cn(
            'space-y-1 mt-1',
            isSheet ? 'pl-3' : 'pl-6'
          )}
          onClick={onChildNavigate}
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * 자식 NavItem이 현재 경로와 매칭되는지 검사하는 헬퍼.
 * NavGroupItem 사용처에서 isAnyChildActive 계산 시 사용.
 */
export function isAnyChildActive(group: NavGroup, currentPath: string): boolean {
  return group.children.some((child) => child.href === currentPath);
}

/**
 * Collapsed 사이드바의 hover popover 안에서 자식 NavItem 아이콘 렌더.
 * iconUrl(외부 메뉴의 커스텀 이미지)이 있으면 우선 표시하고, 로드 실패 시
 * lucide 컴포넌트로 폴백. Sidebar.tsx의 ItemIcon과 동일 패턴 (popover용 사이즈만 다름).
 */
function PopoverChildIcon({ item }: { item: NavItem }): JSX.Element {
  const [imgError, setImgError] = useState(false);
  const Icon = item.icon;
  if (item.iconUrl && !imgError) {
    return (
      <img
        src={item.iconUrl}
        alt={item.name}
        className="h-3.5 w-3.5"
        onError={() => setImgError(true)}
      />
    );
  }
  return <Icon className="h-3.5 w-3.5" />;
}
