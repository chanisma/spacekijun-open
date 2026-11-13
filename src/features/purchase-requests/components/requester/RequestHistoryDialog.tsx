import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { History, Loader2 } from 'lucide-react';
import {
  PurchaseColumn,
  PurchaseItemRow,
  PurchaseRequest,
  PurchaseRequestStatus,
  computeRowsTotalKRW,
} from '../../types';
import { usePurchaseRequestHistory } from '../../hooks/usePurchaseRequests';
import { STATUS_COLOR, STATUS_LABEL } from '../../purchaseRequestStatus';
import { LinkCell } from '../LinkCell';
import { fmtDateTime, fmtKRW } from '../../utils/format';

// ─────────────────────────────────────────────────
// 수정 이력 다이얼로그
// ─────────────────────────────────────────────────
interface HistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  currentRequest: PurchaseRequest;
  columns: PurchaseColumn[];
}

export function RequestHistoryDialog({
  open,
  onOpenChange,
  requestId,
  currentRequest,
  columns,
}: HistoryDialogProps) {
  const { data: history = [], isLoading } = usePurchaseRequestHistory(requestId, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            수정 이력
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* 현재 버전 */}
            <HistoryEntry
              label="현재 버전"
              snapshotAt={currentRequest.updated_at}
              items={(currentRequest.items as PurchaseItemRow[]) || []}
              status={currentRequest.status}
              reason={currentRequest.status_reason}
              columns={columns}
              isCurrent
            />

            {history.length === 0 ? (
              <div className="text-center py-6 text-sm text-slate-500 border border-dashed rounded-md">
                이전 수정 이력이 없습니다.
              </div>
            ) : (
              history.map((entry, idx) => (
                <HistoryEntry
                  key={entry.id}
                  label={`이전 버전 ${history.length - idx}`}
                  snapshotAt={entry.snapshot_at}
                  items={entry.items as PurchaseItemRow[]}
                  status={entry.status}
                  reason={entry.status_reason}
                  columns={columns}
                />
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface HistoryEntryProps {
  label: string;
  snapshotAt: string;
  items: PurchaseItemRow[];
  status: PurchaseRequestStatus;
  reason?: string | null;
  columns: PurchaseColumn[];
  isCurrent?: boolean;
}

function HistoryEntry({
  label,
  snapshotAt,
  items,
  status,
  reason,
  columns,
  isCurrent = false,
}: HistoryEntryProps) {
  const total = computeRowsTotalKRW(items, columns);
  const realItems = items.filter((r) =>
    columns.some((c) => {
      const v = r.cells?.[c.id];
      return v !== '' && v !== null && v !== undefined;
    }),
  );

  return (
    <details
      open={isCurrent}
      className={`border rounded-lg ${
        isCurrent ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <summary className="px-3 py-2 cursor-pointer flex items-center gap-2 flex-wrap list-none">
        <Badge
          variant="secondary"
          className={
            isCurrent ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
          }
        >
          {label}
        </Badge>
        <Badge variant="secondary" className="bg-slate-100 text-slate-700">
          {realItems.length}건
        </Badge>
        {total !== null && (
          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
            {fmtKRW(total)}
          </Badge>
        )}
        <Badge variant="secondary" className={STATUS_COLOR[status]}>
          {STATUS_LABEL[status]}
        </Badge>
        <span className="text-xs text-slate-500 ml-auto">{fmtDateTime(snapshotAt)}</span>
      </summary>
      {reason && (
        <div className="border-t px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold">사유</span>
          <span className="mx-1.5">·</span>
          <span className="whitespace-pre-wrap">{reason}</span>
        </div>
      )}
      <div className="border-t overflow-x-auto">
        <table className="w-full text-xs md:text-sm border-collapse">
          <thead>
            <tr className="text-left text-slate-600 border-b bg-slate-50/30">
              <th className="px-2 py-1.5 w-10">#</th>
              {columns.map((c) => (
                <th key={c.id} className="px-2 py-1.5 whitespace-nowrap">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {realItems.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="text-center py-3 text-slate-400"
                >
                  항목이 없습니다.
                </td>
              </tr>
            ) : (
              realItems.map((row, idx) => (
                <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                  <td className="px-2 py-1.5 text-slate-500">{idx + 1}</td>
                  {columns.map((c) => {
                    const v = row.cells?.[c.id];
                    if (v === '' || v === null || v === undefined) {
                      return (
                        <td key={c.id} className="px-2 py-1.5 align-top text-slate-400">
                          —
                        </td>
                      );
                    }
                    if (c.type === 'url') {
                      return (
                        <td key={c.id} className="px-2 py-1.5 align-top">
                          <LinkCell value={v} />
                        </td>
                      );
                    }
                    if (c.type === 'number') {
                      const num = Number(v);
                      return (
                        <td key={c.id} className="px-2 py-1.5 align-top">
                          {Number.isFinite(num) ? num.toLocaleString('ko-KR') : String(v)}
                        </td>
                      );
                    }
                    return (
                      <td
                        key={c.id}
                        className="px-2 py-1.5 align-top whitespace-pre-wrap"
                      >
                        {String(v)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}


