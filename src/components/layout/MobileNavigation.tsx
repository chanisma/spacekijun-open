import { useState, useEffect, useRef } from 'react';
import {
  Menu,
  Bell,
  User,
  LogOut,
  X,
  Search,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavBadges } from '@/hooks/useNavBadges';
import { navBadgeCount, navBadgeLabel, navBadgeText } from '@/lib/navBadges';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useNotifications } from '@/hooks/useNotifications';
import { MealPopup } from '@/components/meal/MealPopup';
import ActionSearchBar from '@/components/ui/action-search-bar';
import { PersonalDeviceToggle } from '@/components/profile/PersonalDeviceToggle';
import { useNavSections } from '@/hooks/useNavSections';
import { isNavGroup, type NavEntry, type NavItem } from '@/config/navigation';
import { NavGroupItem } from './NavGroupItem';
import { setViewPreference } from '@/mobile/view';

// ----------------------------------------
// 시트용 NavLinkItem (모바일 햄버거 시트 변형)
// ----------------------------------------

function SheetItemIcon({ item, isActive }: { item: NavItem; isActive: boolean }): JSX.Element {
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

interface SheetNavLinkItemProps {
  item: NavItem;
  isActive: boolean;
  isMobileViewport: boolean;
  onNavigate: () => void;
  /** 숫자 배지(0 = 없음) — `lib/navBadges` */
  badge?: number;
}

function SheetNavLinkItem({ item, isActive, isMobileViewport, onNavigate, badge = 0 }: SheetNavLinkItemProps): JSX.Element {
  const baseClasses = cn(
    'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
    isActive
      ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100'
      : 'text-gray-700 hover:bg-gray-50 active:scale-95'
  );

  const iconBox = (
    <div
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
        isActive ? 'bg-blue-100' : 'bg-gray-100',
        item.iconUrl ? '' : (isActive ? item.color : 'text-gray-500')
      )}
    >
      <SheetItemIcon item={item} isActive={isActive} />
    </div>
  );

  if (item.isExternal) {
    return (
      <a href={item.href} target={item.target} rel={item.rel} onClick={onNavigate} className={baseClasses}>
        {iconBox}
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{item.name}</span>
            {item.menu?.meta?.mobileUrl && (
              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-600">
                {isMobileViewport ? '모바일' : '데스크톱'}
              </Badge>
            )}
          </div>
          {item.menu?.meta?.mobileUrl && (
            <div className="text-xs text-muted-foreground mt-1 truncate">
              {isMobileViewport && item.menu.meta.mobileUrl
                ? item.menu.meta.mobileUrl
                : item.menu.meta?.url || item.href}
            </div>
          )}
        </div>
      </a>
    );
  }

  return (
    <Link to={item.href} onClick={onNavigate} className={baseClasses} aria-label={badge > 0 ? navBadgeLabel(item.name, badge) : undefined}>
      {iconBox}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm">{item.name}</span>
      </div>
      {badge > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold tabular-nums text-white" aria-hidden>{navBadgeText(badge)}</span>
      )}
    </Link>
  );
}

// ----------------------------------------
// MobileNavigation
// ----------------------------------------

export const MobileNavigation = (): JSX.Element => {
  const [isOpen, setIsOpen] = useState(false);
  const { data: notifications = [] } = useNotifications();
  const unreadCount = notifications.filter(notification => !notification.is_read).length;
  const [showSearchModal, setShowSearchModal] = useState(false);
  const bottomNavRef = useRef<HTMLDivElement>(null);
  const [touchStart, setTouchStart] = useState<{ y: number; time: number } | null>(null);
  const [mouseStart, setMouseStart] = useState<{ y: number; time: number } | null>(null);
  const [navOffset, setNavOffset] = useState(0);
  const [, setNavHeight] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, hasNameRegistered, isStudentView, profile: authProfile } = useAuth();
  const isMobile = useIsMobile();
  // 시트 = 데스크톱 사이드바와 같은 순서, 하단 바 = 따로 고른 칸(2026-10-25 사용자 결정)
  const { sections, flatItems, mobileBottomItems } = useNavSections();
  const badges = useNavBadges();

  const isStudent = isStudentView;
  const currentPage = flatItems.find((item) => item.href === location.pathname);
  const closeSheet = (): void => setIsOpen(false);

  // 하단 nav 높이 측정 → CSS 변수로 전달
  useEffect(() => {
    const el = bottomNavRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const h = Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      setNavHeight(h);
      document.documentElement.style.setProperty('--mobile-nav-height', `${h}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 전역 마우스 이벤트 처리 (드래그가 요소 밖으로 나가는 경우)
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent): void => {
      if (mouseStart) {
        const deltaY = mouseStart.y - e.clientY;
        if (deltaY > 10) {
          e.preventDefault();
        }
        const offset = Math.min(Math.max(deltaY * 0.5, 0), 30);
        setNavOffset(offset);
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent): void => {
      if (!mouseStart) return;
      const deltaY = mouseStart.y - e.clientY;
      const deltaTime = Date.now() - mouseStart.time;
      if (deltaY > 50 && deltaTime < 500) {
        setShowSearchModal(true);
      }
      setNavOffset(0);
      setMouseStart(null);
    };

    if (mouseStart) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [mouseStart]);

  // 스와이프 / 드래그 핸들러
  const handleTouchStart = (e: React.TouchEvent): void => {
    const touch = e.touches[0];
    setTouchStart({ y: touch.clientY, time: Date.now() });
  };

  const handleTouchMove = (e: React.TouchEvent): void => {
    if (touchStart) {
      const touch = e.touches[0];
      const deltaY = touchStart.y - touch.clientY;
      if (deltaY > 10) e.preventDefault();
      const offset = Math.min(Math.max(deltaY * 0.5, 0), 30);
      setNavOffset(offset);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent): void => {
    if (!touchStart) return;
    const touch = e.changedTouches[0];
    const deltaY = touchStart.y - touch.clientY;
    const deltaTime = Date.now() - touchStart.time;
    if (deltaY > 50 && deltaTime < 500) {
      setShowSearchModal(true);
    }
    setNavOffset(0);
    setTouchStart(null);
  };

  const handleMouseDown = (e: React.MouseEvent): void => {
    setMouseStart({ y: e.clientY, time: Date.now() });
  };

  const handleMouseMove = (e: React.MouseEvent): void => {
    if (mouseStart) {
      const deltaY = mouseStart.y - e.clientY;
      if (deltaY > 10) e.preventDefault();
      const offset = Math.min(Math.max(deltaY * 0.5, 0), 30);
      setNavOffset(offset);
    }
  };

  const handleMouseUp = (e: React.MouseEvent): void => {
    if (!mouseStart) return;
    const deltaY = mouseStart.y - e.clientY;
    const deltaTime = Date.now() - mouseStart.time;
    if (deltaY > 50 && deltaTime < 500) {
      setShowSearchModal(true);
    }
    setNavOffset(0);
    setMouseStart(null);
  };

  // 시트 안에서 한 entry(NavItem 또는 NavGroup) 렌더
  const renderSheetEntry = (entry: NavEntry): JSX.Element => {
    if (isNavGroup(entry)) {
      const childActive = entry.children.some((child) => child.href === location.pathname);
      return (
        <NavGroupItem
          key={`group:${entry.name}`}
          group={entry}
          variant="sheet"
          isAnyChildActive={childActive}
          currentPath={location.pathname}
          onChildNavigate={closeSheet}
        >
          {entry.children.map((child) => (
            <SheetNavLinkItem
              key={child.href}
              item={child}
              isActive={location.pathname === child.href}
              isMobileViewport={isMobile}
              onNavigate={closeSheet}
              badge={navBadgeCount(badges, child.href)}
            />
          ))}
        </NavGroupItem>
      );
    }
    return (
      <SheetNavLinkItem
        key={entry.href}
        item={entry}
        isActive={location.pathname === entry.href}
        isMobileViewport={isMobile}
        onNavigate={closeSheet}
        badge={navBadgeCount(badges, entry.href)}
      />
    );
  };

  return (
    <>
      {/* 모바일 상단 네비게이션 바 */}
      <div className="md:hidden bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 py-3">
          {/* 현재 페이지 정보 */}
          <div className="flex items-center gap-3">
            {currentPage && (
              <>
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100',
                    currentPage.iconUrl ? '' : currentPage.color
                  )}
                >
                  <CurrentPageIcon item={currentPage} />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">{currentPage.name}</h1>
                  <p className="text-xs font-semibold text-gray-600">
                    {isStudent ? 'SPACEKIJUN FOR STUDENT' : 'SPACEKIJUN'}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* 상단 오른쪽 버튼들 */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-10 w-10 p-0" onClick={() => navigate('/search')}>
              <Search className="h-5 w-5" />
            </Button>

            <MealPopup />

            {!isStudent && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-10 p-0 relative"
                onClick={() => navigate('/notifications')}
                aria-label={unreadCount > 0 ? `알림, 읽지 않은 알림 ${unreadCount}개` : '알림'}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                )}
              </Button>
            )}

            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="h-10 w-10 p-0">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">메뉴 열기</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 flex flex-col">
                {/* 제목은 화면에서 빼되 지우지는 않는다 — Radix Dialog.Content 는
                    Title 자손을 요구하고, 없으면 스크린리더에 이름 없는 창이 된다. */}
                <SheetHeader className="sr-only">
                  <SheetTitle>메뉴</SheetTitle>
                </SheetHeader>

                {/* 사용자 정보 — 프로필 이미지가 없어 아바타 원은 두지 않는다.
                    오른쪽은 개인기기(자동 로그인) ON/OFF. */}
                <div className="mt-3 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 p-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {user?.email?.split('@')[0] || '사용자'}
                      </p>
                      <p className="truncate text-xs text-gray-600">{user?.email}</p>
                    </div>
                    <PersonalDeviceToggle />
                  </div>
                </div>

                {/* 네비게이션 메뉴 (섹션 + 분석 허브 sub-menu) */}
                <ScrollArea className="flex-1">
                  <nav className="space-y-3 px-1 pb-3 pt-3">
                    {sections.map((section) => {
                      const showLabel = section.label.length > 0;
                      return (
                        <div key={section.id}>
                          {showLabel && (
                            <h3 className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                              {section.label}
                            </h3>
                          )}
                          <div className="space-y-0.5">
                            {section.items.map((entry) => renderSheetEntry(entry))}
                          </div>
                        </div>
                      );
                    })}
                  </nav>
                </ScrollArea>

                {/* 하단 로그아웃 */}
                <div className="space-y-2 border-t pt-3">
                  <div className="space-y-0.5">
                    <Button
                      variant="ghost"
                      asChild
                      className="h-8 w-full justify-start gap-2 px-3 text-xs font-normal text-gray-500"
                    >
                      <Link to="/profile" onClick={closeSheet}>
                        <User className="h-3.5 w-3.5" />
                        프로필 · 개인기기 설정
                        {/* 이름 미등록 경고는 종전 톱니바퀴에 붙어 있었다.
                            버튼이 사라져도 신호는 남긴다 — 여기서 /profile 로 고칠 수 있다. */}
                        {hasNameRegistered === false && (
                          <span className="ml-1 h-2 w-2 rounded-full bg-orange-500" />
                        )}
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      asChild
                      className="h-8 w-full justify-start gap-2 px-3 text-xs font-normal text-gray-500"
                    >
                      <Link to="/privacy" onClick={closeSheet}>
                        <ShieldCheck className="h-3.5 w-3.5" />
                        개인정보처리방침
                      </Link>
                    </Button>
                    {/* 가벼운 모바일 화면(/m, 2026-10-29)으로 — «전체 웹사이트로 보기»로 온 휴대폰이 돌아가는 길. 교직원만 */}
                    {!isStudent && authProfile?.role !== 'student' && (
                      <Button
                        variant="ghost"
                        className="h-8 w-full justify-start gap-2 px-3 text-xs font-normal text-gray-500"
                        onClick={() => { setViewPreference('mobile'); window.location.assign('/m'); }}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        모바일 화면
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      signOut();
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center gap-3 h-12 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <LogOut className="h-5 w-5" />
                    로그아웃
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* 모바일 하단 퀵 네비게이션 — 관리자 설정(menu_layout.mobileBottom) 또는 기본 5칸 */}
      <div
        ref={bottomNavRef}
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-inset-bottom cursor-pointer select-none transition-transform duration-75 ease-out"
        style={{ transform: `translateY(-${navOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div className="flex justify-center pt-1 pb-2">
          <div className="w-8 h-1 bg-gray-300 rounded-full"></div>
        </div>
        <div className="flex items-center justify-around pb-3">
          {mobileBottomItems.map((item) => {
            const isActive = location.pathname === item.href;
            const badge = item.isExternal ? 0 : navBadgeCount(badges, item.href);
            const linkClasses = cn(
              'flex flex-col items-center gap-1 px-1.5 py-1 rounded-lg transition-all duration-200 active:scale-95',
              isActive ? 'text-blue-600' : 'text-gray-500'
            );
            const inner = (
              <>
                <div
                  className={cn(
                    'relative flex items-center justify-center w-7 h-7 rounded-lg transition-colors',
                    isActive ? 'bg-blue-100' : 'hover:bg-gray-100'
                  )}
                >
                  <BottomNavIcon item={item} />
                  {badge > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-semibold tabular-nums text-white ring-2 ring-white" aria-hidden>{navBadgeText(badge)}</span>
                  )}
                </div>
                <span className="text-xs font-medium">{item.name}</span>
              </>
            );

            // 외부 링크(type='link') 메뉴는 href가 절대 URL이라 react-router Link로 열 수 없다.
            // (관리자가 외부 메뉴를 상단 카테고리에 배치하면 하단 5칸에 들어올 수 있음)
            if (item.isExternal) {
              return (
                <a key={item.name} href={item.href} target={item.target} rel={item.rel} className={linkClasses}>
                  {inner}
                </a>
              );
            }

            return (
              <Link key={item.name} to={item.href} className={linkClasses} aria-label={badge > 0 ? navBadgeLabel(item.name, badge) : undefined}>
                {inner}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ActionSearchBar 모달 (모바일 전용) */}
      {showSearchModal && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={() => setShowSearchModal(false)}
          />

          <Button
            variant="ghost"
            size="sm"
            className="absolute top-4 right-4 z-30 h-10 w-10 p-0 bg-white/10 backdrop-blur-md hover:bg-white/20 text-white rounded-full"
            onClick={() => setShowSearchModal(false)}
          >
            <X className="h-5 w-5" />
            <span className="sr-only">닫기</span>
          </Button>

          <div className="absolute top-24 left-4 right-4 z-20">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden p-4">
              <div className="[&_input]:!h-12 [&_input]:!text-base [&_input]:!rounded-xl">
                <ActionSearchBar
                  compact
                  autoFocus
                  onClose={() => setShowSearchModal(false)}
                  onScheduleCreate={
                    isStudent
                      ? undefined
                      : () => {
                          setShowSearchModal(false);
                          navigate('/schedule?create=true');
                        }
                  }
                  onWorkCreate={
                    isStudent
                      ? undefined
                      : () => {
                          setShowSearchModal(false);
                          navigate('/tasks/mine?create=true');
                        }
                  }
                  onDocumentUpload={
                    isStudent
                      ? undefined
                      : () => {
                          setShowSearchModal(false);
                          navigate('/documents?upload=true');
                        }
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ----------------------------------------
// 상단/하단 nav 아이콘 헬퍼 (state 기반 폴백)
// ----------------------------------------

function CurrentPageIcon({ item }: { item: NavItem }): JSX.Element {
  const [imgError, setImgError] = useState(false);
  const Icon = item.icon;
  if (item.iconUrl && !imgError) {
    return (
      <img
        src={item.iconUrl}
        alt={item.name}
        className="h-5 w-5"
        onError={() => setImgError(true)}
      />
    );
  }
  return <Icon className="h-5 w-5" />;
}

function BottomNavIcon({ item }: { item: NavItem }): JSX.Element {
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
