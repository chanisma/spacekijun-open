import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MainLayoutProps {
    header?: React.ReactNode;
    leftPanel?: React.ReactNode;
    centerPanel?: React.ReactNode;
    rightPanel?: React.ReactNode;
    className?: string;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
    header,
    leftPanel,
    centerPanel,
    rightPanel,
    className
}) => {
    const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

    // Resizable Right Panel State
    const [rightPanelWidth, setRightPanelWidth] = useState(320);
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = useCallback(() => {
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((mouseMoveEvent: MouseEvent) => {
        if (isResizing) {
            const newWidth = window.innerWidth - mouseMoveEvent.clientX;
            const maxWidth = Math.min(800, window.innerWidth - 480);
            if (newWidth >= 280 && newWidth <= maxWidth) {
                setRightPanelWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener("mousemove", resize);
            window.addEventListener("mouseup", stopResizing);
        }
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    return (
        <div className={cn("flex flex-col h-full overflow-hidden", className)}>
            {/* Header */}
            {header && (
                <div className="flex-shrink-0 relative z-20">
                    {header}
                </div>
            )}

            {/* Main Content Area */}
            <div className={cn(
                "flex flex-1 overflow-hidden relative",
                isResizing ? "cursor-col-resize select-none" : ""
            )}>

                {/* Left Panel (Config) */}
                {leftPanel && (
                    <>
                        <div
                            className={cn(
                                "border-r border-border bg-card flex flex-col transition-all duration-300 ease-in-out relative z-10",
                                isLeftPanelOpen ? "w-[320px]" : "w-0"
                            )}
                            style={{
                                overflow: isLeftPanelOpen ? 'visible' : 'hidden'
                            }}
                        >
                            <div className="h-full overflow-y-auto flex flex-col custom-scrollbar">
                                {leftPanel}
                            </div>
                        </div>

                        {/* Left Panel Toggle Button */}
                        <button
                            onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
                            className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-card border border-border rounded-r-lg shadow-sm hover:shadow-md text-muted-foreground hover:text-primary transition-all duration-200 -mr-5 border-l-0"
                            style={{
                                left: isLeftPanelOpen ? '320px' : '0px',
                            }}
                            title={isLeftPanelOpen ? '설정 숨기기' : '설정 보기'}
                        >
                            {isLeftPanelOpen ? (
                                <ChevronLeft className="w-3.5 h-3.5" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                            )}
                        </button>
                    </>
                )}

                {/* Center Panel (Grid) */}
                <div className="flex-1 overflow-hidden bg-muted/30 relative flex flex-col">
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                        {centerPanel}
                    </div>
                </div>

                {/* Right Panel (Preview/Stats) */}
                {rightPanel && (
                    <>
                        {/* Right Panel Toggle Button */}
                        <button
                            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
                            className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-card border border-border rounded-l-lg shadow-sm hover:shadow-md text-muted-foreground hover:text-primary transition-all duration-200 -ml-5 border-r-0"
                            style={{
                                right: isRightPanelOpen ? rightPanelWidth : 0,
                            }}
                            title={isRightPanelOpen ? '통계 숨기기' : '통계 보기'}
                        >
                            {isRightPanelOpen ? (
                                <ChevronRight className="w-3.5 h-3.5" />
                            ) : (
                                <ChevronLeft className="w-3.5 h-3.5" />
                            )}
                        </button>

                        <div
                            className={cn(
                                "border-l border-border bg-card flex flex-col relative z-10",
                                !isRightPanelOpen && "w-0 border-l-0" // Completely hide when closed
                            )}
                            style={{
                                width: isRightPanelOpen ? rightPanelWidth : 0,
                                transition: isResizing ? 'none' : 'width 300ms ease-in-out',
                                overflow: isRightPanelOpen ? 'visible' : 'hidden'
                            }}
                        >
                            {/* Resize Handle */}
                            {isRightPanelOpen && (
                                <div
                                    className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 z-30 transition-colors"
                                    onMouseDown={startResizing}
                                />
                            )}

                            <div className="h-full overflow-y-auto flex flex-col custom-scrollbar">
                                {rightPanel}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
