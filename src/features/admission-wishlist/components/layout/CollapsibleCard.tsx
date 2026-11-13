/**
 * 오른쪽 패널의 서랍식 카드.
 *
 * 패널에 카드가 넷이라 세로로 길어져 아래쪽(과목별 내신)은 늘 스크롤해야 닿는다.
 * 펼침 상태는 **localStorage 에 보존**한다 — 학생을 바꿀 때마다 다시 접히면 오히려 번거롭다
 * (tasks 의 이벤트 카드와 같은 방식).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'admission-wishlist-right-panel-open-v1';

function readOpenState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    // 사생활 보호 모드·저장 차단 등에서 접근 자체가 던진다
    return {};
  }
}

interface Props {
  /** localStorage 키. 카드마다 고유해야 한다 */
  id: string;
  title: React.ReactNode;
  /** 접혀 있을 때도 보여줄 짧은 요약 */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const CollapsibleCard: React.FC<Props> = ({ id, title, summary, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const stored = readOpenState()[id];
    if (typeof stored === 'boolean') setOpen(stored);
  }, [id]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readOpenState(), [id]: next }));
      } catch {
        // 저장이 막혀도 이번 세션 동작은 유지한다
      }
      return next;
    });
  }, [id]);

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-1.5 min-w-0">{title}</div>
        <div className="flex items-center gap-2 shrink-0">
          {!open && summary}
          <ChevronDown
            className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', open && 'rotate-180')}
          />
        </div>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
};

export default CollapsibleCard;
