import { ReactNode } from 'react';

interface SelectionActionBarProps {
  /** 선택이 있을 때만 띄운다 */
  open: boolean;
  children: ReactNode;
}

/**
 * 다중 선택 액션 바 — **화면 아래에 떠 있다** (2026-09-02).
 *
 * 왜 흐름(flow)에서 뺐나: 종전엔 표 **위**에 끼어드는 일반 요소라, 체크박스를 하나 누르는
 * 순간 바가 생기면서 표 전체가 아래로 밀렸다. 연속으로 체크하려면 매번 커서를 다시
 * 맞춰야 했고, 바의 높이가 줄바꿈에 따라 달라져 "자리를 미리 비워 두는" 방식으로도
 * 정확히 막을 수 없다. `fixed` 로 띄우면 레이아웃이 아예 움직이지 않는다.
 *
 * 위치: 모바일 하단 네비(`--mobile-nav-height`, fixed z-40) **위**에 올려 겹치지 않게 한다.
 * 바깥 래퍼는 `pointer-events-none` 이라 바가 없는 자리의 클릭을 가로채지 않는다.
 */
export function SelectionActionBar({ open, children }: SelectionActionBarProps) {
  if (!open) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--mobile-nav-height,96px)+8px)] z-40 flex justify-center px-3 md:bottom-4">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm duration-200 animate-in fade-in slide-in-from-bottom-2">
        {children}
      </div>
    </div>
  );
}
