import {
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
} from 'lucide-react';
import * as React from 'react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavBadges } from '@/hooks/useNavBadges';
import { navBadgeCount, navBadgeLabel, navBadgeText } from '@/lib/navBadges';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipWrapper } from '@/components/ui/tooltip-wrapper';
import { Link, useLocation } from 'react-router-dom';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSidebar } from '@/contexts/SidebarContext';
import { useNavSections } from '@/hooks/useNavSections';
import { isNavGroup, type NavEntry, type NavItem } from '@/config/navigation';
import { NavGroupItem } from './NavGroupItem';

// ----------------------------------------
// Item Icon (이미지 → 폴백 lucide 아이콘)
// state 기반 폴백 — innerHTML 등 imperative DOM 조작 없음
// ----------------------------------------

function ItemIcon({ item }: { item: NavItem }): JSX.Element {
  const [imgError, setImgError] = useState(false);
  const Icon = item.icon;

  if (item.iconUrl && !imgError) {
    return (
      <img
        src={item.iconUrl}
        alt={item.name}
        className="h-4 w-4"
        onError={() => setImgError(true)}
      />
    );
  }
  return <Icon className="h-4 w-4" />;
}

// ----------------------------------------
// NavLinkItem (sidebar 변형)
// ----------------------------------------

interface NavLinkItemProps {
  item: NavItem;
  isExpanded: boolean;
  showContent: boolean;
  isActive: boolean;
  isMobileViewport: boolean;
  /** 숫자 배지(0 = 없음) — `lib/navBadges` */
  badge?: number;
}

function NavLinkItem({ item, isExpanded, showContent, isActive, isMobileViewport, badge = 0 }: NavLinkItemProps): JSX.Element {
  const showTooltip = !isExpanded;

  const iconBox = (
    <div
      className={cn(
        'relative flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0',
        'transition-colors duration-200 ease-in-out',
        isActive ? 'bg-gray-700 text-white' : 'bg-gray-100 group-hover:bg-gray-700 group-hover:text-white',
        isExpanded ? 'mr-3' : 'mx-auto',
        item.iconUrl ? '' : (!isActive && (item.color || 'text-gray-500'))
      )}
      style={{
        transitionProperty: 'margin, background-color, color',
        transitionDuration: '300ms, 200ms, 200ms',
        transitionTimingFunction: 'ease-in-out',
      }}
    >
      <ItemIcon item={item} />
      {/* 접힌 사이드바에서는 이름이 없으니 숫자를 아이콘 모서리에 단다 */}
      {badge > 0 && !isExpanded && (
        <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-semibold tabular-nums text-white ring-2 ring-white" aria-hidden>
          {navBadgeText(badge)}
        </span>
      )}
    </div>
  );

  // 외부 링크 분기
  if (item.isExternal) {
    const tooltipText = `${item.name}${
      item.menu?.meta?.mobileUrl || item.menu?.meta?.url
        ? ` - ${isMobileViewport && item.menu?.meta?.mobileUrl ? item.menu.meta.mobileUrl : item.menu?.meta?.url || item.href}`
        : ''
    }`;

    const content = (
      <Button
        variant="ghost"
        className={cn(
          'group w-full rounded-lg h-12 transition-all duration-300 ease-in-out',
          isExpanded ? 'justify-start gap-3 px-3' : 'justify-center px-0',
          'hover:bg-transparent active:scale-95'
        )}
        asChild
      >
        <a href={item.href} target={item.target} rel={item.rel}>
          {iconBox}
          {isExpanded && (
            <div className={cn('flex items-center flex-1 transition-opacity duration-200', showContent ? 'opacity-100' : 'opacity-0')}>
              <div className="flex-1 text-left">
                <span className="font-medium text-sm">{item.name}</span>
              </div>
              {item.menu?.meta?.mobileUrl && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {isMobileViewport ? '모바일' : '데스크톱'}
                </Badge>
              )}
            </div>
          )}
        </a>
      </Button>
    );

    return (
      <div data-menu-item>
        <TooltipWrapper enabled={showTooltip} tooltip={tooltipText}>
          {content}
        </TooltipWrapper>
      </div>
    );
  }

  // 내부 링크
  const content = (
    <Button
      variant="ghost"
      className={cn(
        'group w-full rounded-lg h-12 transition-all duration-300 ease-in-out',
        isExpanded ? 'justify-start gap-3 px-3' : 'justify-center px-0',
        isActive ? 'bg-transparent text-blue-700 shadow-sm' : 'text-gray-700 hover:bg-transparent active:scale-95'
      )}
      asChild
    >
      <Link to={item.href} aria-label={badge > 0 ? navBadgeLabel(item.name, badge) : undefined}>
        {iconBox}
        {isExpanded && (
          <span className={cn('font-medium text-sm transition-opacity duration-200', showContent ? 'opacity-100' : 'opacity-0')}>
            {item.name}
          </span>
        )}
        {isExpanded && badge > 0 && (
          <span className={cn('ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold tabular-nums text-white transition-opacity duration-200', showContent ? 'opacity-100' : 'opacity-0')} aria-hidden>
            {navBadgeText(badge)}
          </span>
        )}
      </Link>
    </Button>
  );

  return (
    <div data-menu-item>
      <TooltipWrapper enabled={showTooltip} tooltip={navBadgeLabel(item.name, badge)}>
        {content}
      </TooltipWrapper>
    </div>
  );
}

// ----------------------------------------
// Sidebar
// ----------------------------------------

export const Sidebar = (): JSX.Element => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { isExpanded, toggleSidebar } = useSidebar();
  const { sections } = useNavSections();
  const badges = useNavBadges();

  // 사이드바 내용 표시 지연 (펼칠 때 150ms 후 텍스트 페이드인)
  const [showContent, setShowContent] = React.useState(isExpanded);

  React.useEffect(() => {
    if (isExpanded) {
      const timer = setTimeout(() => setShowContent(true), 150);
      return () => clearTimeout(timer);
    } else {
      setShowContent(false);
    }
  }, [isExpanded]);

  const renderEntry = (entry: NavEntry): JSX.Element => {
    if (isNavGroup(entry)) {
      const childActive = entry.children.some((child) => child.href === location.pathname);
      return (
        <NavGroupItem
          key={`group:${entry.name}`}
          group={entry}
          variant={isExpanded ? 'sidebar-expanded' : 'sidebar-collapsed'}
          isAnyChildActive={childActive}
          currentPath={location.pathname}
          onExpandSidebar={!isExpanded ? toggleSidebar : undefined}
        >
          {entry.children.map((child) => (
            <NavLinkItem
              key={child.href}
              item={child}
              isExpanded={isExpanded}
              showContent={showContent}
              isActive={location.pathname === child.href}
              isMobileViewport={isMobile}
              badge={navBadgeCount(badges, child.href)}
            />
          ))}
        </NavGroupItem>
      );
    }

    return (
      <NavLinkItem
        key={entry.href}
        item={entry}
        isExpanded={isExpanded}
        showContent={showContent}
        isActive={location.pathname === entry.href}
        isMobileViewport={isMobile}
        badge={navBadgeCount(badges, entry.href)}
      />
    );
  };

  return (
    <div
      className={cn(
        // h-full: 부모(Layout의 h-dvh)에 맞춘다. h-screen(=100vh)을 쓰면 웹뷰·모바일처럼
        // 100vh > 100dvh인 환경에서 부모를 넘쳐 Layout 최상위에 스크롤바가 하나 더 생긴다.
        'flex h-full flex-col border-r bg-muted/40 transition-all duration-300 ease-in-out',
        isExpanded ? 'w-64' : 'w-16'
      )}
    >
      {/* Header with toggle button */}
      <div className="flex items-center justify-end p-3 border-b min-h-[56px]">
        <div
          className={cn(
            'absolute left-3 transition-opacity duration-200',
            isExpanded && showContent ? 'opacity-100' : 'opacity-0'
          )}
        >
          <h2 className="text-lg font-semibold text-gray-800">메뉴</h2>
        </div>
        <TooltipWrapper enabled={!isExpanded} tooltip={`${isExpanded ? '사이드바 접기' : '사이드바 펼치기'} (Ctrl+B)`}>
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="group h-8 w-8 rounded-lg hover:bg-transparent">
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gray-100 flex-shrink-0 group-hover:bg-gray-700 group-hover:text-white transition-colors duration-200 ease-in-out">
              {isExpanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </div>
          </Button>
        </TooltipWrapper>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className={cn(isExpanded ? 'space-y-5' : 'space-y-4')}>
          {sections.map((section, sectionIdx) => {
            const showLabel = isExpanded && section.label.length > 0;

            return (
              <div key={section.id}>
                {showLabel && (
                  <h3
                    className={cn(
                      'px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider transition-opacity duration-200',
                      'text-gray-400',
                      showContent ? 'opacity-100' : 'opacity-0'
                    )}
                  >
                    {section.label}
                  </h3>
                )}
                {/* 접힘 모드: 섹션 사이 얇은 구분선 (첫 섹션 제외) */}
                {!isExpanded && sectionIdx > 0 && section.items.length > 0 && (
                  <div className="mx-3 mb-3 h-px bg-gray-200/70" />
                )}
                <div className="space-y-1.5">
                  {section.items.map((entry) => renderEntry(entry))}
                </div>
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="border-t p-3">
        <TooltipWrapper enabled={!isExpanded} tooltip="개인정보처리방침">
          <Link
            to="/privacy"
            className={cn(
              'group flex h-10 items-center rounded-lg text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900',
              isExpanded ? 'px-2' : 'justify-center'
            )}
          >
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100', isExpanded && 'mr-3')}>
              <ShieldCheck className="h-4 w-4" />
            </span>
            {isExpanded && showContent && <span>개인정보처리방침</span>}
          </Link>
        </TooltipWrapper>
      </div>
    </div>
  );
};
