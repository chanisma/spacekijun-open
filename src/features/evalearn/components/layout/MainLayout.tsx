import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MainLayoutProps {
  header: React.ReactNode;
  leftPanel: React.ReactNode;
  centerPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  header,
  leftPanel,
  centerPanel,
  rightPanel,
}) => {
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing) {
        const newWidth = window.innerWidth - mouseMoveEvent.clientX;
        const maxWidth = Math.min(800, window.innerWidth - 480);
        if (newWidth >= 280 && newWidth <= maxWidth) {
          setRightPanelWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  return (
    <div className={`flex flex-col h-full bg-gray-50 ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      {/* 상단 헤더 */}
      <div className="flex-shrink-0 relative">
        {header}
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 왼쪽 패널 - 학생 목록 (evalog와 동일하게 카드 없이 페이지에 밀착) */}
        <div
          className={
            'shrink-0 border-r border-gray-200 bg-white flex flex-col transition-all duration-300 ease-in-out ' +
            (isLeftPanelOpen ? 'w-[280px]' : 'w-0')
          }
          style={{ overflow: isLeftPanelOpen ? 'visible' : 'hidden' }}
        >
          <div className="h-full overflow-hidden flex flex-col">{leftPanel}</div>
        </div>

        {/* 왼쪽 패널 토글 버튼 */}
        <button
          onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
          className="absolute top-1/2 -translate-y-1/2 z-30 w-5 h-10 flex items-center justify-center bg-white border border-gray-200/80 rounded-r-lg shadow-sm hover:shadow-md text-slate-400 hover:text-brand-600 transition-all duration-200 -mr-5 border-l-0"
          style={{
            left: isLeftPanelOpen ? '280px' : '0px',
            opacity: 0.8,
          }}
          title={isLeftPanelOpen ? '학생 목록 숨기기' : '학생 목록 보기'}
          aria-label={isLeftPanelOpen ? '학생 목록 숨기기' : '학생 목록 보기'}
        >
          {isLeftPanelOpen ? (
            <ChevronLeft className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {/* 중앙 패널 - 분석 콘텐츠 */}
        <div className="min-w-0 flex-1 flex flex-col overflow-auto custom-scrollbar bg-white" id="center-panel-scroll">
          {centerPanel}
        </div>

        {/* 오른쪽 패널 토글 버튼 */}
        <button
          onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
          className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-white border border-gray-200/80 rounded-l-lg shadow-sm hover:shadow-md text-slate-400 hover:text-brand-600 transition-all duration-200 -ml-5 border-r-0"
          style={{
            right: isRightPanelOpen ? rightPanelWidth : 0,
            opacity: 0.8,
          }}
          title={isRightPanelOpen ? '메모 숨기기' : '메모 보기'}
        >
          {isRightPanelOpen ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>

        {/* 오른쪽 패널 - 메모/분석 기록 */}
        <div
          className="border-l border-gray-200 bg-gray-50 flex flex-col relative transition-[width] duration-0 ease-linear"
          style={{
            width: isRightPanelOpen ? rightPanelWidth : 0,
            overflow: isRightPanelOpen ? 'visible' : 'hidden',
          }}
        >
          {/* Resize Handle */}
          <div
            ref={resizeRef}
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-500/50 z-30 transition-colors"
            onMouseDown={startResizing}
          />
          <div className="h-full overflow-hidden">{rightPanel}</div>
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
