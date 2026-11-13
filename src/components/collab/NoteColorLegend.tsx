import { Palette, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  labeledPaletteEntries,
  normalizeNoteColor,
  resolveNoteColorStyle,
  type NotePaletteEntry,
} from '@/lib/collabNoteColors';

interface NoteColorLegendProps {
  palette: NotePaletteEntry[];
  /** 색별 노트 개수 — 키는 정규화된 hex */
  counts: Record<string, number>;
  totalCount: number;
  /** null = 전체 */
  selected: string | null;
  onSelect: (color: string | null) => void;
  /** 보드 소유자·admin 일 때만 [색상 설정] 진입점을 준다 */
  canManage?: boolean;
  onManage?: () => void;
}

/**
 * 보드 상세 헤더의 색 범례 + 색 필터.
 *
 * 범례에 서는 것은 **이름이 붙은 색**뿐이다. 이름 없는 색은 고를 수는 있어도
 * 범례에 두면 "무채색 · 이름 없음" 칩이 줄줄이 생겨 정작 뜻을 가진 색을 가린다.
 *
 * 색 자체가 데이터이므로(dataviz 규약) 칩은 색 동그라미 **와** 이름을 함께 둔다 —
 * 색만 있으면 색각 이상 사용자에게 아무 정보도 주지 못하고, 이름만 있으면
 * 노트 카드의 색과 이어지지 않는다.
 */
export function NoteColorLegend({
  palette,
  counts,
  totalCount,
  selected,
  onSelect,
  canManage = false,
  onManage,
}: NoteColorLegendProps) {
  const entries = labeledPaletteEntries(palette);

  // 이름 붙은 색이 하나도 없으면 범례가 할 말이 없다.
  // 다만 소유자에게는 "여기서 정할 수 있다"를 알려야 기능이 발견된다.
  if (entries.length === 0) {
    if (!canManage || !onManage) return null;
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onManage}
        className="h-8 gap-1.5 px-2 text-xs text-slate-500 hover:text-slate-800"
      >
        <Palette className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">색상 범례 설정</span>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-100/50 p-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={[
          'h-7 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
          selected === null
            ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
            : 'text-slate-500 hover:bg-white/60 hover:text-slate-800',
        ].join(' ')}
      >
        전체 <span className="text-slate-400">{totalCount}</span>
      </button>

      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {entries.map((entry) => {
          const hex = normalizeNoteColor(entry.color);
          const active = selected !== null && normalizeNoteColor(selected) === hex;
          const style = resolveNoteColorStyle(hex);
          const count = counts[hex] ?? 0;

          return (
            <button
              key={hex}
              type="button"
              onClick={() => onSelect(active ? null : hex)}
              title={`${entry.label} · ${count}개`}
              className={[
                'inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap transition-colors',
                active
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-300'
                  : 'text-slate-500 hover:bg-white/60 hover:text-slate-800',
              ].join(' ')}
            >
              {/* 색 동그라미 + 이름을 함께 둔다 — 색만 있으면 색각 이상 사용자에게
                  아무 정보도 주지 못하고, 이름만 있으면 노트 카드와 이어지지 않는다 */}
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ background: style.swatch, boxShadow: `inset 0 0 0 1px ${style.border}` }}
                aria-hidden
              />
              <span className="truncate">{entry.label}</span>
              <span className="text-slate-400">{count}</span>
            </button>
          );
        })}
      </div>

      {canManage && onManage && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onManage}
          title="색상 범례 설정"
          className="h-7 w-7 flex-shrink-0 text-slate-400 hover:bg-white/60 hover:text-slate-700"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
