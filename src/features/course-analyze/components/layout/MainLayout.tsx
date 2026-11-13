import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MainLayoutProps {
    children?: React.ReactNode;
    leftPanel: React.ReactNode;
    centerPanel: React.ReactNode;
    rightPanel?: React.ReactNode;
    header?: React.ReactNode;
}

const LEFT_PANEL_WIDTH = 256;
const MIN_CENTER_WIDTH = 200;
const RIGHT_PANEL_MIN_WIDTH = 320;
const RIGHT_PANEL_MAX_WIDTH = 800;
/** 이 폭 미만(= Tailwind md 미만)에서는 왼쪽 패널이 본문을 밀지 않고 위에 겹치는 서랍이 된다 */
const MOBILE_QUERY = '(max-width: 767px)';

function useIsNarrow(): boolean {
    const [narrow, setNarrow] = useState(
        () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
    );
    useEffect(() => {
        const mq = window.matchMedia(MOBILE_QUERY);
        const on = () => setNarrow(mq.matches);
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);
    return narrow;
}

/**
 * 휴대폰에서 학생 목록 서랍을 여는 입구는 헤더에 있다(떠 있는 버튼은 사이트 하단 메뉴에 가려졌다).
 * 헤더는 이 레이아웃 안에서 그려지므로 컨텍스트로 여닫기를 넘긴다.
 */
interface LeftPanelControl {
    isNarrow: boolean;
    isLeftPanelOpen: boolean;
    openLeftPanel: () => void;
}
const LeftPanelContext = createContext<LeftPanelControl | null>(null);
export function useLeftPanelControl(): LeftPanelControl | null {
    return useContext(LeftPanelContext);
}

const MainLayout: React.FC<MainLayoutProps> = ({
    leftPanel,
    centerPanel,
    rightPanel,
    header,
}) => {
    const isNarrow = useIsNarrow();
    // 휴대폰에서는 닫힌 채로 시작한다 — 256px 패널이 390px 화면의 2/3를 가려 본문이 안 보였다
    const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(
        () => !(typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches),
    );
    // 데스크톱 ↔ 휴대폰 폭을 넘나들면 그 폭의 기본 상태로 맞춘다
    const firstNarrowSync = useRef(true);
    useEffect(() => {
        if (firstNarrowSync.current) { firstNarrowSync.current = false; return; }
        setIsLeftPanelOpen(!isNarrow);
    }, [isNarrow]);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(!!rightPanel);
    const [rightPanelWidth, setRightPanelWidth] = useState(320);
    const [isResizing, setIsResizing] = useState(false);

    // Right panel existence check
    useEffect(() => {
        if (!rightPanel) {
            setIsRightPanelOpen(false);
        } else {
            setIsRightPanelOpen(true);
        }
    }, [rightPanel]);

    const startResizing = useCallback(() => {
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((mouseMoveEvent: MouseEvent) => {
        if (isResizing) {
            const newWidth = window.innerWidth - mouseMoveEvent.clientX;
            const maxWidth = Math.min(
                RIGHT_PANEL_MAX_WIDTH,
                window.innerWidth - LEFT_PANEL_WIDTH - MIN_CENTER_WIDTH,
            );
            if (newWidth >= RIGHT_PANEL_MIN_WIDTH && newWidth <= maxWidth) {
                setRightPanelWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    // 휴대폰: 이 레이아웃은 높이를 고정하지 않고 사이트 본문(<main>)이 스크롤한다.
    // 안쪽 칸에서 따로 스크롤하면 헤더·탭 세 줄이 화면 윗부분을 늘 차지해 본문이 작은 창 안에 갇혔다.
    return (
        <LeftPanelContext.Provider value={{ isNarrow, isLeftPanelOpen, openLeftPanel: () => setIsLeftPanelOpen(true) }}>
        <div className={`flex flex-col ${isNarrow ? '' : 'h-full'} bg-gray-50 ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
            {/* Header */}
            {header && (
                <div className="flex-shrink-0 relative">
                    {header}
                </div>
            )}

            {/* Main Content Area */}
            <div className={`flex flex-1 relative ${isNarrow ? '' : 'overflow-hidden'}`}>
                {/* 휴대폰: 서랍이 열렸을 때 본문을 덮는 배경 — 누르면 닫힌다 */}
                {isNarrow && isLeftPanelOpen && (
                    <button
                        type="button"
                        aria-label="학생 목록 닫기"
                        onClick={() => setIsLeftPanelOpen(false)}
                        className="fixed inset-0 z-[60] bg-slate-900/30"
                    />
                )}

                {/* Left Panel — 데스크톱은 본문 옆 칸, 휴대폰은 본문 위에 겹치는 서랍 */}
                <div
                    className={`border-r border-gray-200 bg-white flex flex-col transition-all duration-300 ease-in-out ${
                        isNarrow ? `fixed inset-y-0 left-0 z-[70] ${isLeftPanelOpen ? 'shadow-xl' : 'border-r-0'}` : ''
                    }`}
                    style={{
                        width: isLeftPanelOpen ? (isNarrow ? `min(${LEFT_PANEL_WIDTH}px, 85vw)` : LEFT_PANEL_WIDTH) : 0,
                        overflow: isLeftPanelOpen ? 'visible' : 'hidden'
                    }}
                >
                    <div className="h-full overflow-hidden flex flex-col">
                        {leftPanel}
                    </div>
                </div>

                {/* Left Panel Toggle Button — 휴대폰은 헤더의 [학생 목록] 버튼이 대신한다 */}
                {!isNarrow && (
                <button
                    onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
                    className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-white border border-gray-200/80 rounded-r-lg shadow-sm hover:shadow-md text-slate-400 hover:text-brand-600 transition-all duration-200 -mr-5 border-l-0"
                    style={{
                        left: isLeftPanelOpen ? LEFT_PANEL_WIDTH : 0,
                        opacity: 0.8
                    }}
                    title={isLeftPanelOpen ? 'Hide list' : 'Show list'}
                >
                    {isLeftPanelOpen ? (
                        <ChevronLeft className="w-3.5 h-3.5" />
                    ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                    )}
                </button>
                )}

                {/* Center Panel */}
                <div className={`flex-1 min-w-0 flex flex-col bg-white ${isNarrow ? '' : 'overflow-auto custom-scrollbar'}`} id="center-panel-scroll">
                    {centerPanel}
                </div>

                {/* Right Panel Toggle Button (Only if rightPanel exists) */}
                {rightPanel && (
                    <>
                        <button
                            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
                            className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-white border border-gray-200/80 rounded-l-lg shadow-sm hover:shadow-md text-slate-400 hover:text-brand-600 transition-all duration-200 -ml-5 border-r-0"
                            style={{
                                right: isRightPanelOpen ? rightPanelWidth : 0,
                                opacity: 0.8
                            }}
                            title={isRightPanelOpen ? 'Hide panel' : 'Show panel'}
                        >
                            {isRightPanelOpen ? (
                                <ChevronRight className="w-3.5 h-3.5" />
                            ) : (
                                <ChevronLeft className="w-3.5 h-3.5" />
                            )}
                        </button>

                        {/* Right Panel */}
                        <div
                            className={`border-l border-gray-200 bg-gray-50 flex flex-col relative transition-[width] duration-0 ease-linear`}
                            style={{
                                width: isRightPanelOpen ? rightPanelWidth : 0,
                                overflow: isRightPanelOpen ? 'visible' : 'hidden'
                            }}
                        >
                            {/* Resize Handle */}
                            <div
                                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-500/50 z-30 transition-colors"
                                onMouseDown={startResizing}
                            />
                            <div className="h-full overflow-hidden">
                                {rightPanel}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
        </LeftPanelContext.Provider>
    );
};

export default MainLayout;
