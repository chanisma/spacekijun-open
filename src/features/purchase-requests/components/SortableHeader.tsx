import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { SortState } from '@/lib/tableSort';

interface SortableHeaderProps {
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
}

/**
 * 정렬 가능한 표 머리글 (2026-09-02).
 *
 * 클릭 순환 = **오름차순 → 내림차순 → 해제**. 세 번째 클릭으로 원래 순서에 돌아올 수
 * 있으므로 별도 리셋 버튼이 필요 없다.
 *
 * **정렬 중이 아닐 때도 아이콘 자리를 비워 두지 않는다**(흐린 `ChevronsUpDown`) —
 * 아이콘이 나타났다 사라지면 머리글 폭이 흔들려 표 전체가 미세하게 움직인다.
 * 이 화면은 이미 "선택할 때 표가 밀린다"는 문제를 한 번 겪었다.
 */
export function SortableHeader({
  sortKey,
  sort,
  onSort,
  children,
  align = 'left',
}: SortableHeaderProps) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort?.direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`group inline-flex w-full items-center gap-1 rounded px-0.5 py-0.5 text-left transition-colors hover:text-slate-900 ${
        align === 'right' ? 'justify-end' : ''
      } ${active ? 'text-slate-900' : ''}`}
      title={
        !active
          ? '클릭하면 오름차순 정렬'
          : sort?.direction === 'asc'
            ? '클릭하면 내림차순 정렬'
            : '클릭하면 정렬 해제'
      }
    >
      <span className="truncate">{children}</span>
      <Icon
        className={`h-3 w-3 shrink-0 ${
          active ? 'text-blue-600' : 'text-slate-300 group-hover:text-slate-400'
        }`}
      />
    </button>
  );
}
