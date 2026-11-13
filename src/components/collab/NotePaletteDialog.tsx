import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Palette, Plus, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { useUpdateBoardPalette } from '@/hooks/useCollabBoards';
import { toast } from '@/lib/toast';
import {
  DEFAULT_NOTE_PALETTE,
  MAX_PALETTE_LABEL_LENGTH,
  MAX_PALETTE_SIZE,
  contrastRatio,
  isValidNoteColor,
  normalizeNoteColor,
  readableInk,
  resolveNoteColorStyle,
  validatePalette,
  type NotePaletteEntry,
} from '@/lib/collabNoteColors';

interface NotePaletteDialogProps {
  boardId: string;
  boardTitle: string;
  palette: NotePaletteEntry[];
  /** 색별 노트 개수(정규화 hex 키) — 쓰이고 있는 색을 지울 때 경고하기 위해 */
  usage?: Record<string, number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 새 색을 추가할 때 제안할 기본값. 이미 쓰인 색은 건너뛴다(중복은 저장이 막힌다). */
const SUGGESTED = [
  '#fff176', '#90caf9', '#a5d6a7', '#f48fb1', '#ffcc80', '#ce93d8',
  '#80cbc4', '#ef9a9a', '#b0bec5', '#ffffff', '#fff59d', '#9fa8da',
];

function nextSuggestedColor(used: string[]): string {
  const taken = new Set(used.map(normalizeNoteColor));
  return SUGGESTED.find((c) => !taken.has(c)) ?? '#e2e8f0';
}

/**
 * 노트 색 팔레트 편집 — **보드 관리자 전용**.
 *
 * 규칙 두 가지가 화면의 모양을 정한다.
 *  · 색은 RGB 팔레트로 **자유롭게** 정한다 → 미리 정해진 목록에서 고르는 UI 가 아니다.
 *  · 이름(= 범례 항목)은 **선택**이다 → 이름 없는 색도 그대로 쓸 수 있다.
 *
 * 그리고 **같은 색은 두 번 쓸 수 없다**. 중복을 허용하면 범례에서 한 색이
 * 두 가지 뜻을 갖게 되고, 색 필터가 어느 쪽인지 답할 수 없다.
 * 검증은 저장 직전이 아니라 **입력하는 동안** 보여 준다 — 저장을 누른 뒤에야
 * 어느 줄이 문제인지 알려 주면 12줄짜리 표에서 찾아 헤매게 된다.
 */
export function NotePaletteDialog({
  boardId,
  boardTitle,
  palette,
  usage = {},
  open,
  onOpenChange,
}: NotePaletteDialogProps) {
  const [entries, setEntries] = useState<NotePaletteEntry[]>(palette);
  const { mutate: savePalette, isPending } = useUpdateBoardPalette();

  /**
   * **열리는 순간에만** 현재 값으로 초기화한다(닫고 다시 열면 편집 중이던 것은 버린다).
   *
   * `[open, palette]` 로 두면 안 된다 — 부모가 다시 그릴 때마다(노트 높이 측정,
   * 쿼리 갱신 등) palette 배열의 정체가 바뀌어 **편집 중인 입력이 통째로 되돌아간다**.
   * 오류는 나지 않고 "글자를 치면 사라지는" 증상으로만 보인다.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setEntries(palette.map((e) => ({ ...e })));
    wasOpen.current = open;
  }, [open, palette]);

  const errors = useMemo(() => validatePalette(entries), [entries]);
  const errorByIndex = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of errors) if (e.index >= 0 && !map.has(e.index)) map.set(e.index, e.message);
    return map;
  }, [errors]);
  const globalErrors = errors.filter((e) => e.index < 0).map((e) => e.message);

  /** 지우려는 색을 쓰고 있는 노트가 있으면 그 사실을 말해 준다(막지는 않는다). */
  const usageOf = (color: string) => usage[normalizeNoteColor(color)] ?? 0;

  const update = (index: number, patch: Partial<NotePaletteEntry>) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const handleSave = () => {
    if (errors.length > 0) return;
    savePalette(
      { boardId, palette: entries },
      {
        onSuccess: () => {
          toast.success('색상 범례를 저장했습니다');
          onOpenChange(false);
        },
        onError: (error: Error) => {
          toast.error(error.message || '색상 범례를 저장하지 못했습니다');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        DialogContent 에 overflow 를 주지 않는다 — 이 저장소의 usePortalContainer 가
        팝오버·셀렉트를 Content 안으로 포털하므로 여기에 overflow 가 있으면 잘린다
        (CLAUDE.md Gotchas). 스크롤은 안쪽 패널이 맡는다.
      */}
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-[560px]">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TitleIconChip icon={Palette} />
            노트 색상 범례
          </DialogTitle>
          <DialogDescription className="pt-1 text-xs text-slate-500">
            <span className="font-medium text-slate-600">{boardTitle}</span> 에서 쓸 색을 정합니다.
            이름을 붙인 색만 헤더 범례에 표시되고, 이름 없는 색도 노트에 그대로 쓸 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
          <SectionLabel icon={Palette}>
            색 {entries.length}/{MAX_PALETTE_SIZE}
          </SectionLabel>

          <div className="space-y-2">
            {entries.map((entry, index) => {
              const valid = isValidNoteColor(entry.color);
              const hex = valid ? normalizeNoteColor(entry.color) : '#ffffff';
              const style = resolveNoteColorStyle(hex);
              const rowError = errorByIndex.get(index);
              const inUse = usageOf(entry.color);

              return (
                <div
                  key={index}
                  className={[
                    'rounded-xl border bg-white/60 p-2.5',
                    rowError ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200',
                  ].join(' ')}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {/* 색 고르기 — 브라우저 기본 RGB 팔레트. 미리 정해진 목록이 아니다. */}
                    <label
                      className="relative h-9 w-9 flex-shrink-0 cursor-pointer rounded-lg ring-1 ring-inset"
                      style={{ background: style.swatch, boxShadow: `inset 0 0 0 1px ${style.border}` }}
                      title="색 고르기"
                    >
                      <input
                        type="color"
                        value={hex}
                        onChange={(e) => update(index, { color: e.target.value })}
                        disabled={isPending}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label={`${index + 1}번째 색`}
                      />
                    </label>

                    <Input
                      value={entry.color}
                      onChange={(e) => update(index, { color: e.target.value })}
                      disabled={isPending}
                      spellCheck={false}
                      className="h-9 w-[7.5rem] flex-shrink-0 font-mono text-xs"
                      placeholder="#rrggbb"
                      aria-label="색 값"
                    />

                    <Input
                      value={entry.label ?? ''}
                      onChange={(e) => update(index, { label: e.target.value })}
                      disabled={isPending}
                      maxLength={MAX_PALETTE_LABEL_LENGTH}
                      className="h-9 min-w-0 flex-1 text-xs"
                      placeholder="이름 (선택) — 예: 진행 중"
                      aria-label="색 이름"
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      onClick={() => setEntries((prev) => prev.filter((_, i) => i !== index))}
                      title={inUse > 0 ? `노트 ${inUse}개가 이 색을 쓰고 있습니다` : '색 삭제'}
                      className="h-9 w-9 flex-shrink-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {(rowError || inUse > 0) && (
                    <p className={`mt-1.5 pl-11 text-[11px] ${rowError ? 'text-rose-600' : 'text-slate-400'}`}>
                      {rowError ??
                        `노트 ${inUse}개가 이 색을 쓰고 있습니다 — 지워도 노트 색은 그대로 남습니다`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || entries.length >= MAX_PALETTE_SIZE}
              onClick={() =>
                setEntries((prev) => [
                  ...prev,
                  { color: nextSuggestedColor(prev.map((e) => e.color)) },
                ])
              }
              className="h-8 gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              색 추가
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => setEntries(DEFAULT_NOTE_PALETTE.map((e) => ({ ...e })))}
              className="h-8 gap-1.5 text-xs text-slate-500"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              기본 색으로
            </Button>
          </div>

          {globalErrors.length > 0 && (
            <Alert variant="destructive" className="py-2">
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription className="text-xs">{globalErrors.join(' · ')}</AlertDescription>
            </Alert>
          )}

          {/* 미리보기 — 자유 색을 허용하면 "글자가 안 보이는 색"을 고를 수 있다.
              고른 자리에서 바로 확인시키는 것이 유일한 방어다. */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <SectionLabel icon={Palette}>미리보기</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {entries.filter((e) => isValidNoteColor(e.color)).map((entry, index) => {
                const hex = normalizeNoteColor(entry.color);
                const style = resolveNoteColorStyle(hex);
                const ratio = contrastRatio(hex, readableInk(hex));
                return (
                  <div
                    key={`${hex}-${index}`}
                    className="min-w-[7rem] rounded-lg px-3 py-2 text-xs shadow-sm ring-1 ring-inset"
                    style={{
                      background: style.background,
                      color: style.text,
                      boxShadow: `inset 0 0 0 1px ${style.border}`,
                    }}
                  >
                    <div className="font-semibold">{entry.label || '이름 없음'}</div>
                    <div className="opacity-70">노트 미리보기</div>
                    {ratio < 4.5 && (
                      <div className="mt-1 font-medium opacity-80">⚠ 글자 대비 낮음</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`}
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || errors.length > 0}
            className="h-8 gap-1.5 bg-blue-600 px-3 text-xs hover:bg-blue-700"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
