import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Pencil } from 'lucide-react';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { PurchaseColumn, PurchaseItemRow, PurchaseRequestStatus } from '../../types';
import { STATUS_LABEL } from '../../purchaseRequestStatus';
import { isOpenStatus } from '../../utils/statusFilter';
import { missingRequiredColumns, normalizeCellValue } from '../../utils/myItems';

/**
 * 신청한 품목 하나 고치기 (2026-10-13 신청자 화면 개편).
 *
 * 종전엔 신청서 카드를 펼쳐 [수정] → 표 전체가 편집 모드가 되는 방식이었다. 품목 하나를 고치려고
 * 신청서 전체를 여닫는 구조라, 이제는 품목 줄의 ✎ 에서 **그 품목의 칸만** 연다.
 * 저장은 여전히 그 품목이 든 신청을 다시 쓰고(행 id 유지 — `planReplaceRow`), 필수 칸 규칙은
 * 새 신청과 같은 함수(`missingRequiredColumns`)를 쓴다.
 */
export function ItemEditDialog({
  open,
  onOpenChange,
  columns,
  row,
  status,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: PurchaseColumn[];
  row: PurchaseItemRow | null;
  status: PurchaseRequestStatus | null;
  saving: boolean;
  onSave: (cells: PurchaseItemRow['cells']) => void;
}) {
  const [cells, setCells] = useState<PurchaseItemRow['cells']>({});
  const [error, setError] = useState<string | null>(null);

  // 열 때마다 그 품목의 현재 값으로 채운다 — 직전에 다른 품목을 고치던 값이 남지 않게
  useEffect(() => {
    if (open && row) {
      setCells({ ...row.cells });
      setError(null);
    }
  }, [open, row]);

  const setValue = (col: PurchaseColumn, raw: string) => {
    setCells((prev) => ({
      ...prev,
      [col.id]: col.type === 'number' ? (raw === '' ? '' : Number(raw)) : raw,
    }));
  };

  const handleSave = () => {
    const normalized: PurchaseItemRow['cells'] = { ...cells };
    for (const col of columns) {
      const v = normalized[col.id];
      if (v !== undefined) normalized[col.id] = normalizeCellValue(col, v);
    }
    const missing = missingRequiredColumns(normalized, columns);
    if (missing.length > 0) {
      setError(`"${missing[0].name}"은(는) 꼭 적어야 합니다.`);
      return;
    }
    onSave(normalized);
  };

  // 이미 결정된 품목을 고치면 담당자가 결정한 뒤에 내용이 바뀐다 — 저장을 막지는 않되 미리 알린다
  const decided = status !== null && !isOpenStatus(status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TitleIconChip icon={Pencil} />
            품목 고치기
          </DialogTitle>
        </DialogHeader>

        <form
          className="space-y-3 px-4 py-4 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          {decided && status && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              담당자가 이미 «{STATUS_LABEL[status]}»(으)로 처리한 품목입니다. 고치면 담당자에게 바뀐 내용이
              보이지만 처리 상태는 그대로 남습니다.
            </p>
          )}
          {columns.map((col) => {
            const value = cells[col.id];
            return (
              <label key={col.id} className="block space-y-1">
                <span className="text-xs font-medium text-slate-600">
                  {col.name}
                  {col.required && <span className="ml-0.5 text-rose-500">*</span>}
                </span>
                <Input
                  type={col.type === 'number' ? 'number' : col.type === 'url' ? 'url' : 'text'}
                  inputMode={col.type === 'number' ? 'decimal' : undefined}
                  value={value === undefined || value === null ? '' : String(value)}
                  placeholder={col.type === 'url' ? '구매 링크 붙여넣기' : ''}
                  onChange={(e) => setValue(col, e.target.value)}
                  className="h-9"
                />
              </label>
            );
          })}
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
          {/* Enter 로 저장되게 — 실제 버튼은 푸터에 있다 */}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>

        <div className={DIALOG_FOOTER_CLASS}>
          <Button
            variant="ghost"
            className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            className={`${FOOTER_BUTTON_CLASS} bg-blue-600 hover:bg-blue-700`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            저장
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
