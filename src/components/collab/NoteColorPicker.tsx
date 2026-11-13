import {
  noteColorName,
  normalizeNoteColor,
  resolveNoteColorStyle,
  type NotePaletteEntry,
} from '@/lib/collabNoteColors';

interface NoteColorPickerProps {
  /** 보드가 정한 색 목록. 보드에 설정이 없으면 기본 7색이 들어온다 */
  palette: NotePaletteEntry[];
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

/**
 * 노트 색 고르기 — **네 화면이 공유**한다
 * (`AddNoteCard`·`StickyNote` 수정 · 학생용 2벌).
 *
 * 종전엔 색 배열이 그 네 곳에 복붙돼 있어서, 보드 팔레트를 붙이려면 네 번 고쳐야 했고
 * 하나를 빠뜨리면 **같은 보드가 화면마다 다른 색 목록**을 내놓았다.
 *
 * 이름이 붙은 색은 아래에 이름을 적는다 — 색만 보고 "이게 무슨 뜻이었지"를
 * 기억하게 만들면 범례를 정해 둔 의미가 없다.
 */
export function NoteColorPicker({
  palette,
  value,
  onChange,
  disabled = false,
  size = 'md',
}: NoteColorPickerProps) {
  const current = normalizeNoteColor(value);
  const dot = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const selectedName = noteColorName(current, palette);
  const selectedEntry = palette.find((p) => normalizeNoteColor(p.color) === current);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {palette.map((entry) => {
          const hex = normalizeNoteColor(entry.color);
          const style = resolveNoteColorStyle(hex);
          const active = hex === current;

          return (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              disabled={disabled}
              title={entry.label ?? hex}
              aria-label={entry.label ?? hex}
              aria-pressed={active}
              className={[
                dot,
                'rounded-full transition-all hover:scale-110 disabled:opacity-50',
                active ? 'ring-2 ring-primary ring-offset-2' : '',
              ].join(' ')}
              style={{
                background: style.swatch,
                boxShadow: `inset 0 0 0 1px ${style.border}`,
              }}
            />
          );
        })}
      </div>

      {/* 고른 색의 이름. 이름 없는 색이면 굳이 hex 를 읽게 하지 않는다. */}
      {selectedEntry?.label && (
        <p className="text-[11px] text-muted-foreground">
          선택: <span className="font-medium text-slate-600">{selectedName}</span>
        </p>
      )}
    </div>
  );
}
