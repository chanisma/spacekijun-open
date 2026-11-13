/**
 * ▲ 차수에 올리기 — 품의 정리 탭과 신청 관리 액션 바가 같은 동작을 쓴다 (2026-10-12 후속)
 *
 * 대화상자를 거치지 않는다(사용자 요구). 같은 물품끼리 한 줄로 묶어 바로 올리고,
 * 값(단가·구매처 …)은 차수 표에서 고친다.
 */
import { toast } from '@/lib/toast';
import type {
  PurchaseColumn,
  PurchaseOrderBatch,
  PurchaseOrderLine,
  PurchaseOrderLink,
} from '../../types';
import type { SelectedPurchaseItem } from '../../utils/officialDocument';
import { BATCH_STATUS_LABEL, nextBatchTitle } from '../../utils/purchaseOrder';
import { useAddItemsToBatch, useCreatePurchaseOrderBatch } from '../../hooks/usePurchaseOrders';

/** 새 차수를 만들라는 뜻 */
export const NEW_BATCH = '__new__' as const;

interface Context {
  pageId: string;
  columns: PurchaseColumn[];
  batches: PurchaseOrderBatch[];
  lines: PurchaseOrderLine[];
  links: PurchaseOrderLink[];
  createdBy?: string | null;
}

export function useAddToBatch(ctx: Context) {
  const addItems = useAddItemsToBatch();
  const createBatch = useCreatePurchaseOrderBatch();

  /** 성공하면 올린 차수 id, 취소·실패면 null */
  const run = async (
    target: string | typeof NEW_BATCH,
    selection: SelectedPurchaseItem[],
  ): Promise<string | null> => {
    if (selection.length === 0) return null;
    let batch = ctx.batches.find((b) => b.id === target) ?? null;

    if (batch && batch.status !== 'draft') {
      const ok = window.confirm(
        `'${batch.title}'는 이미 '${BATCH_STATUS_LABEL[batch.status]}'입니다.\n` +
          '올려도 신청 품목의 상태는 자동으로 바뀌지 않습니다. 그래도 올릴까요?',
      );
      if (!ok) return null;
    }

    try {
      if (!batch) {
        // 새 차수는 직전 차수의 열을 이어받는다 — 사용자가 만든 열이 차수마다 사라지지 않게
        const last = ctx.batches[ctx.batches.length - 1];
        batch = await createBatch.mutateAsync({
          pageId: ctx.pageId,
          title: nextBatchTitle(ctx.batches),
          sortOrder: ctx.batches.length,
          createdBy: ctx.createdBy ?? null,
          columns: last?.columns ?? [],
        });
      }
      const res = await addItems.mutateAsync({
        pageId: ctx.pageId,
        batchId: batch.id,
        selection,
        columns: ctx.columns,
        lines: ctx.lines,
        links: ctx.links,
      });
      const parts = [
        res.created > 0 ? `새 품목 ${res.created}줄` : '',
        res.appended > 0 ? `같은 이름 품목에 ${res.appended}개 추가` : '',
        res.moved > 0 ? `다른 품목에서 ${res.moved}개 옮김` : '',
        res.skipped > 0 ? `이미 있던 ${res.skipped}개 건너뜀` : '',
      ].filter(Boolean);
      toast.success(`'${batch.title}'에 올렸습니다 — ${parts.join(' · ') || '변경 없음'}`);
      return batch.id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '차수에 올리지 못했습니다.');
      return null;
    }
  };

  return { run, pending: addItems.isPending || createBatch.isPending };
}
