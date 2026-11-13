import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Loader2, Pencil } from 'lucide-react';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import {
  EMPTY_ITEM_NAME_LABEL,
  isAlreadyUnified,
  suggestUnifiedName,
  summarizeNameCounts,
} from '../utils/itemNameBulk';

interface BulkItemNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 선택한 품목들의 **현재** 물품명 (표시 순서) */
  currentNames: string[];
  pending: boolean;
  onApply: (name: string) => void;
}

/**
 * 선택한 품목들의 물품명을 하나로 통일한다 (2026-09-02).
 *
 * 매니저가 발주 직전에 하는 일의 대부분이 표기 통일이라, 행마다 연필을 눌러 고치는
 * 대신 골라서 한 번에 바꾼다. **바꾸기 전에 무엇이 무엇으로 바뀌는지 먼저 보여준다** —
 * 되돌리기가 없는 조작이라(이력엔 남지만 UI 에서 복원 버튼이 없다) 눈으로 확인시키는
 * 편이 안전하다.
 */
export function BulkItemNameDialog({
  open,
  onOpenChange,
  currentNames,
  pending,
  onApply,
}: BulkItemNameDialogProps) {
  const [value, setValue] = useState('');

  const counts = useMemo(() => summarizeNameCounts(currentNames), [currentNames]);

  // 열 때마다 '가장 많이 쓰인 표기'로 채운다 — 대개 그게 통일하려는 이름이다
  useEffect(() => {
    if (open) setValue(suggestUnifiedName(currentNames));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = value.trim();
  const unchanged = isAlreadyUnified(currentNames, trimmed);
  const canApply = !!trimmed && !unchanged && !pending && currentNames.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
            <TitleIconChip icon={Pencil} tone="blue" />
            <span className="truncate">물품명 일괄 변경</span>
            <Badge variant="secondary" className="bg-slate-100 text-slate-700">
              {currentNames.length}개
            </Badge>
          </DialogTitle>
          <DialogDescription className="pt-1 text-xs text-slate-500">
            선택한 품목의 물품명을 하나로 통일합니다. 신청자가 적은 내용이 바뀌므로 확인 후
            적용하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-4 py-4 sm:px-6">
          <div className="space-y-1.5">
            <SectionLabel icon={ArrowRight}>바뀌는 내용</SectionLabel>
            <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
              {counts.map((entry) => {
                const same = entry.name === trimmed;
                return (
                  <div
                    key={entry.name}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs ${
                      same ? 'text-slate-400' : ''
                    }`}
                  >
                    <span
                      className={`min-w-0 flex-1 truncate ${
                        entry.name === EMPTY_ITEM_NAME_LABEL ? 'text-slate-400' : ''
                      }`}
                      title={entry.name}
                    >
                      {entry.name}
                    </span>
                    <Badge variant="secondary" className="shrink-0 bg-slate-100 text-[10px] text-slate-600">
                      {entry.count}
                    </Badge>
                    {/* 이미 목표 이름인 항목은 '그대로'라고 밝힌다 — 몇 건이 실제로 바뀌는지 보이게 */}
                    <span className="w-10 shrink-0 text-right text-[10px]">
                      {same ? '그대로' : '변경'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-slate-600">통일할 물품명</span>
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canApply) {
                  e.preventDefault();
                  onApply(trimmed);
                }
              }}
              placeholder="예: 보드마카(검정)"
              className="h-9 text-sm"
            />
          </label>

          {unchanged && (
            <p className="text-[11px] text-slate-400">선택한 품목이 이미 모두 이 이름입니다.</p>
          )}
        </div>

        <div className={DIALOG_FOOTER_CLASS}>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`}
          >
            취소
          </Button>
          <Button
            onClick={() => onApply(trimmed)}
            disabled={!canApply}
            className={`${FOOTER_BUTTON_CLASS} bg-blue-600 text-white hover:bg-blue-700`}
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {currentNames.length}개 변경
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
