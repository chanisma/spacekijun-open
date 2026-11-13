import React from 'react';
import { LayoutDashboard } from 'lucide-react';

export type DashboardViewMode = 'student' | 'class' | 'stats' | 'analysis';

interface HeaderProps {
    title?: string;
    subtitle?: string;
    viewMode: DashboardViewMode;
    onViewModeChange: (mode: DashboardViewMode) => void;
    hasData?: boolean;
    isAdmin?: boolean;
}

const baseTabs: { id: DashboardViewMode; label: string; adminOnly?: boolean }[] = [
    { id: 'student', label: '학생별 보기' },
    { id: 'class', label: '학년/학급별 보기' },
    { id: 'stats', label: '학년/학급별 통계' },
    { id: 'analysis', label: '분석' },
];

export const Header: React.FC<HeaderProps> = ({
    title = "STUDENT DASHBOARD",
    subtitle = "학생 대시보드",
    viewMode,
    onViewModeChange,
    hasData = false,
    isAdmin = false,
}) => {
    const tabs = baseTabs.filter(tab => !tab.adminOnly || isAdmin);
    return (
        <header className="px-5 py-2.5 bg-white/60 backdrop-blur-md border-b border-white/20 relative z-40 supports-[backdrop-filter]:bg-white/60 shrink-0">
            {/* min-h-[46px] = evalog 헤더의 학생 pill 높이(아바타 32px + py-1.5 + border) — 두 화면 헤더 높이 일치용 */}
            <div className="flex items-center justify-between min-h-[46px] w-full gap-4">
                {/* 왼쪽 섹션: 타이틀 */}
                <div className="flex items-center gap-6 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-r from-primary to-indigo-600 text-white px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm tracking-wide whitespace-nowrap flex items-center gap-1.5">
                            <LayoutDashboard size={12} className="text-white/90" />
                            {title}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-foreground text-sm font-bold tracking-tight whitespace-nowrap">
                                {subtitle}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 중앙 섹션: 탭 메뉴 */}
                {hasData && (
                    <div className="flex-1 flex justify-center">
                        <nav className="flex items-center gap-1 bg-white/50 backdrop-blur-sm px-2 py-1 rounded-full border border-white/40 shadow-sm">
                            {tabs.map(tab => {
                                const isActive = viewMode === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => onViewModeChange(tab.id)}
                                        className={`
                                            px-4 py-1.5 text-xs font-medium whitespace-nowrap rounded-full transition-all duration-200
                                            ${isActive
                                                ? 'text-white bg-gradient-to-r from-primary to-indigo-600 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-800 hover:bg-white/80'
                                            }
                                        `}
                                    >
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                )}

                {/* 오른쪽 섹션 */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Future controls */}
                </div>
            </div>
        </header>
    );
};
