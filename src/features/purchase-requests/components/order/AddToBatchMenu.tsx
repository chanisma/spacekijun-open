/**
 * 신청 관리 선택 액션 바의 [▲ 품의 차수에 올리기] — 차수를 고르면 바로 올라간다(대화상자 없음).
 */
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowUp, ChevronDown, Loader2, Plus } from 'lucide-react';
import type { PurchaseOrderBatch } from '../../types';
import { BATCH_STATUS_LABEL, nextBatchTitle } from '../../utils/purchaseOrder';
import { NEW_BATCH } from './useAddToBatch';

export function AddToBatchMenu({
  batches,
  pending,
  onPick,
}: {
  batches: PurchaseOrderBatch[];
  pending: boolean;
  onPick: (target: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          className="h-8 bg-white"
          title="고른 신청 품목을 품의 차수에 올립니다. 같은 물품끼리 한 줄로 묶이고, 값은 품의 정리 탭의 표에서 고칩니다."
        >
          {pending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowUp className="mr-1 h-3.5 w-3.5" />
          )}
          품의 차수에 올리기
          <ChevronDown className="ml-1 h-3 w-3 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {batches.length > 0 && <DropdownMenuLabel className="text-[11px]">올릴 차수</DropdownMenuLabel>}
        {batches.map((b) => (
          <DropdownMenuItem key={b.id} onSelect={() => onPick(b.id)}>
            <span className="min-w-0 flex-1 truncate">{b.title}</span>
            <span className="ml-2 shrink-0 text-[10px] text-slate-400">{BATCH_STATUS_LABEL[b.status]}</span>
          </DropdownMenuItem>
        ))}
        {batches.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => onPick(NEW_BATCH)}>
          <Plus className="mr-2 h-3.5 w-3.5" /> 새 차수 ({nextBatchTitle(batches)})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
