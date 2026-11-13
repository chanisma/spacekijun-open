import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLinkDisplay } from '../utils/linkDisplay';

interface LinkCellProps {
  value: unknown;
  className?: string;
}

// URL 셀 공용 렌더러 — 원문 전체 대신 "쇼핑몰 이름" 칩으로 표시한다.
// 클릭 = 새 창, 호버 = 전체 URL 툴팁, 옆 버튼 = 주소 복사.
// ManagerView·PurchaseItemsTable(읽기)·HistoryDialog가 공유한다.
export function LinkCell({ value, className }: LinkCellProps) {
  const [copied, setCopied] = useState(false);
  const raw = String(value ?? '').trim();
  const info = parseLinkDisplay(raw);

  if (!raw) return <span className="text-slate-400">—</span>;

  // URL로 해석되지 않는 값(예: "학교 앞 문구점")은 일반 텍스트로
  if (!info.href) {
    return (
      <span className={cn('text-xs whitespace-pre-wrap', className)} title={raw}>
        {info.label}
      </span>
    );
  }

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard 권한 거부 등 — 조용히 무시 (링크 자체는 여전히 열 수 있음)
    }
  };

  return (
    <span className={cn('inline-flex items-center gap-1 max-w-full', className)}>
      <a
        href={info.href}
        target="_blank"
        rel="noreferrer"
        title={raw}
        className="inline-flex items-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 hover:border-blue-200 transition-colors max-w-[180px]"
      >
        <ExternalLink className="h-3 w-3 shrink-0" />
        <span className="truncate">{info.label}</span>
      </a>
      <button
        type="button"
        onClick={handleCopy}
        title="주소 복사"
        aria-label="주소 복사"
        className="p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}
