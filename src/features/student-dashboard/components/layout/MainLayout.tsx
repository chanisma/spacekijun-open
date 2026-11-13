import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MainLayoutProps {
    header?: React.ReactNode;
    leftPanel?: React.ReactNode;
    centerPanel?: React.ReactNode;
    children?: React.ReactNode; // For backward compatibility or flexible usage
    className?: string;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
    header,
    leftPanel,
    centerPanel,
    children,
    className
}) => {
    const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);

    return (
        <div className={cn("flex flex-col h-full bg-gray-50 overflow-hidden", className)}>
            {/* 상단 헤더 */}
            {header && (
                <div className="flex-shrink-0 relative z-20">
                    {header}
                </div>
            )}

            {/* 메인 콘텐츠 영역 (Flex Row) */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* 왼쪽 패널 */}
                {leftPanel && (
                    <>
                        <div
                            className={cn(
                                "border-r border-slate-200 bg-white flex flex-col transition-all duration-300 ease-in-out relative z-10",
                                isLeftPanelOpen ? "w-[280px]" : "w-0"
                            )}
                            style={{
                                overflow: isLeftPanelOpen ? 'visible' : 'hidden'
                            }}
                        >
                            <div className="h-full overflow-hidden flex flex-col">
                                {leftPanel}
                            </div>
                        </div>

                        {/* 왼쪽 패널 토글 버튼 */}
                        <button
                            onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
                            className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-card border border-border rounded-r-lg shadow-sm hover:shadow-md text-muted-foreground hover:text-primary transition-all duration-200 -mr-5 border-l-0"
                            style={{
                                left: isLeftPanelOpen ? '280px' : '0px',
                            }}
                            title={isLeftPanelOpen ? '패널 숨기기' : '패널 보기'}
                        >
                            {isLeftPanelOpen ? (
                                <ChevronLeft className="w-3.5 h-3.5" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                            )}
                        </button>
                    </>
                )}

                {/* 중앙 패널 (또는 children) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-0 bg-white relative">
                    {centerPanel || children}
                </div>
            </div>
        </div>
    );
};
