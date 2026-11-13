import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Bug } from 'lucide-react';
import { Student } from '../../types';
import { PDFDebugDialog } from '../dev/PDFDebugDialog';

interface MainLayoutProps {
  children?: React.ReactNode;
  leftPanel: React.ReactNode;
  centerPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  header?: React.ReactNode;
  selectedStudent?: Student | null;
  showPDFDebug: boolean;
  setShowPDFDebug: (show: boolean) => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  leftPanel,
  centerPanel,
  rightPanel,
  header,
  selectedStudent,
  showPDFDebug,
  setShowPDFDebug
}) => {
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing) {
      const newWidth = window.innerWidth - mouseMoveEvent.clientX;
      // 왼쪽 패널(280px) + 최소 중앙 패널(200px) = 480px를 제외한 나머지가 최대 너비
      const maxWidth = Math.min(800, window.innerWidth - 480);
      if (newWidth >= 320 && newWidth <= maxWidth) {
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

  return (
    <div className={`flex flex-col h-full bg-gray-50 ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      {/* 상단 헤더 */}
      {header && (
        <div className="flex-shrink-0 relative">
          {header}
        </div>
      )}

      {/* 메인 콘텐츠 영역 */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 왼쪽 패널 - 학생 목록 */}
        <div
          className={'border-r border-gray-200 bg-white flex flex-col transition-all duration-300 ease-in-out ' + (isLeftPanelOpen ? 'w-[280px]' : 'w-0')}
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
          className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-white border border-gray-200/80 rounded-r-lg shadow-sm hover:shadow-md text-slate-400 hover:text-brand-600 transition-all duration-200 -mr-5 border-l-0"
          style={{
            left: isLeftPanelOpen ? '280px' : '0px',
            opacity: 0.8
          }}
          title={isLeftPanelOpen ? '학생 목록 숨기기' : '학생 목록 보기'}
        >
          {isLeftPanelOpen ? (
            <ChevronLeft className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {/* 중앙 패널 - 평가 자료 */}
        <div className="flex-1 flex flex-col overflow-auto custom-scrollbar bg-white" id="center-panel-scroll">
          {centerPanel}
        </div>

        {/* 오른쪽 패널 토글 버튼 */}
        <button
          onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
          className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-white border border-gray-200/80 rounded-l-lg shadow-sm hover:shadow-md text-slate-400 hover:text-brand-600 transition-all duration-200 -ml-5 border-r-0"
          style={{
            right: isRightPanelOpen ? rightPanelWidth : 0,
            opacity: 0.8
          }}
          title={isRightPanelOpen ? '워크시트 숨기기' : '워크시트 보기'}
        >
          {isRightPanelOpen ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>

        {/* 오른쪽 패널 - 워크시트 */}
        <div
          className={`border-l border-gray-200 bg-gray-50 flex flex-col relative transition-[width] duration-0 ease-linear`}
          style={{
            width: isRightPanelOpen ? rightPanelWidth : 0,
            overflow: isRightPanelOpen ? 'visible' : 'hidden'
          }}
        >
          {/* Resize Handel */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-500/50 z-30 transition-colors"
            onMouseDown={startResizing}
          />
          <div className="h-full overflow-hidden">
            {rightPanel}
          </div>
        </div>
      </div>

      {/* PDF 디버그 다이얼로그 */}
      <PDFDebugDialog
        student={selectedStudent || null}
        open={showPDFDebug}
        onOpenChange={setShowPDFDebug}
      />
    </div>
  );
};

export default MainLayout;
