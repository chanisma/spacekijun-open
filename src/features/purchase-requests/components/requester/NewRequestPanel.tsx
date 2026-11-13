import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Send } from 'lucide-react';
import { PurchaseColumn, PurchaseItemRow, computeRowsTotalKRW } from '../../types';
import { PurchaseItemsTable } from '../PurchaseItemsTable';
import { meaningfulItemRows } from '../../utils/purchaseOrder';
import { missingRequiredColumns } from '../../utils/myItems';
import { fmtKRW } from '../../utils/format';

/** 제출 전 검사 — 빈 줄은 버리고, 남은 줄마다 필수 칸을 본다 */
export function validateNewRows(rows: PurchaseItemRow[], columns: PurchaseColumn[]): string | null {
  const meaningful = meaningfulItemRows(rows, columns);
  if (meaningful.length === 0) return '품목을 하나 이상 적어 주세요.';
  for (let i = 0; i < meaningful.length; i++) {
    const missing = missingRequiredColumns(meaningful[i].cells, columns);
    if (missing.length > 0) return `${i + 1}번째 품목의 "${missing[0].name}"을(를) 적어 주세요.`;
  }
  return null;
}

/**
 * 새 신청 작성 칸 (2026-10-13 신청자 화면 개편).
 *
 * **제출 한 번 = 신청 한 건 = 담당자 알림 한 번**이다(알림이 INSERT 트리거). 그래서 여러 품목을
 * 이 칸에서 한꺼번에 적어 내게 하고, 제출하면 목록에 품목들이 합류한다. 목록에 품목을 하나씩
 * 끼워 넣는 방식(기존 신청에 행 추가)은 쓰지 않는다 — UPDATE 라 담당자에게 알림이 가지 않는다.
 */
export function NewRequestPanel({
  columns,
  submitting,
  onSubmit,
  onCancel,
}: {
  columns: PurchaseColumn[];
  submitting: boolean;
  onSubmit: (rows: PurchaseItemRow[]) => void;
  /** 없으면 [취소]를 그리지 않는다 — 첫 신청일 때는 돌아갈 화면이 없다 */
  onCancel?: () => void;
}) {
  const [rows, setRows] = useState<PurchaseItemRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const meaningful = useMemo(() => meaningfulItemRows(rows, columns), [rows, columns]);
  const total = useMemo(() => computeRowsTotalKRW(meaningful, columns), [meaningful, columns]);

  const handleSubmit = () => {
    const err = validateNewRows(rows, columns);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onSubmit(meaningful);
  };

  const handleCancel = () => {
    if (meaningful.length > 0 && !window.confirm('적던 품목을 버리고 닫을까요?')) return;
    onCancel?.();
  };

  return (
    <section className="rounded-2xl border border-blue-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-blue-100 bg-blue-50/50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">새 신청</h3>
        <p className="text-xs text-slate-500">
          여러 품목을 한 번에 적어 제출할 수 있습니다. 제출하면 담당 선생님께 알림이 갑니다.
        </p>
      </div>
      <div className="p-3 sm:p-4">
        <PurchaseItemsTable columns={columns} rows={rows} onChange={setRows} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-slate-50/50 px-4 py-3">
        {error && <p className="mr-auto text-xs font-medium text-rose-600">{error}</p>}
        {!error && meaningful.length > 0 && (
          <p className="mr-auto text-xs tabular-nums text-slate-500">
            품목 {meaningful.length}개
            {total !== null && total > 0 && <> · {fmtKRW(total)}</>}
          </p>
        )}
        {onCancel && (
          <Button variant="ghost" size="sm" className="h-9 text-slate-600" onClick={handleCancel}>
            취소
          </Button>
        )}
        <Button
          size="sm"
          className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          제출
        </Button>
      </div>
    </section>
  );
}
