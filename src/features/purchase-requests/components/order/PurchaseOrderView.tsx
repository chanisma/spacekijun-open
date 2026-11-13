/**
 * 「품의 정리」 탭 (2026-10-12) — 신청과 공문 사이의 매니저 작업 공간
 *
 *   ┌ 품의 차수 표 (엑셀처럼 셀에서 바로 고친다 · 열은 사용자가 더한다)
 *   │        ▲ 올리기   ▼ 내리기   ⇲ 합치기
 *   └ 아직 안 담긴 신청 품목 (체크 → ▲)
 *
 * 같은 날 후속(사용자 요구): 「품의에 담기」 대화상자를 없앴다. 고르고 ▲ 를 누르면 같은 물품끼리
 * 한 줄로 묶여 바로 올라가고, 단가·구매처 같은 값은 표에서 고친다.
 *
 * 화면은 그리기만 한다. 금액·묶기·셀 해석·공문 변환은 utils/purchaseOrder.ts,
 * 차수 상태가 신청 품목에 미치는 영향은 서버 RPC 가 정한다.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardCheck,
  Combine,
  FileText,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';
import { toggleWithRange } from '@/lib/rangeSelection';
import type {
  PurchaseOrderBatch,
  PurchaseOrderBatchStatus,
  PurchaseOrderColumn,
  PurchaseOrderLine,
  PurchaseOrderLink,
  PurchaseRequestPageWithRelations,
  PurchaseRequestStatus,
} from '../../types';
import { STATUS_COLOR, STATUS_LABEL } from '../../purchaseRequestStatus';
import { usePurchaseRequests } from '../../hooks/usePurchaseRequests';
import {
  useCreatePurchaseOrderBatch,
  useCreatePurchaseOrderLine,
  useDeletePurchaseOrderBatch,
  useMergePurchaseOrderLines,
  usePurchaseOrderData,
  useRemovePurchaseOrderLines,
  useSetPurchaseOrderBatchStatus,
  useUnlinkPurchaseOrderItem,
  useUpdatePurchaseOrderBatch,
  useUpdatePurchaseOrderLines,
} from '../../hooks/usePurchaseOrders';
import { getItemStatus } from '../../utils/itemStatus';
import {
  OfficialDocumentItem,
  SelectedPurchaseItem,
  formatKrw,
  resolveColumnRoles,
} from '../../utils/officialDocument';
import {
  BATCH_STATUS_COLOR,
  BATCH_STATUS_LABEL,
  BATCH_STATUS_ORDER,
  EMPTY_LINE_INPUT,
  batchStatusEffect,
  buildLinePatch,
  itemQty,
  linesToDocumentItems,
  liveLinks,
  linksByLine,
  meaningfulItemRows,
  nextBatchTitle,
  purchaseItemKey,
  resolveOrderColumns,
  sumLines,
} from '../../utils/purchaseOrder';
import { OfficialDocumentDialog } from '../OfficialDocumentDialog';
import { OrderSheet, type CellCommit } from './OrderSheet';
import { useAddToBatch } from './useAddToBatch';

interface PurchaseOrderViewProps {
  page: PurchaseRequestPageWithRelations;
}

interface FlatItem {
  key: string;
  requesterName: string;
  name: string;
  detail: string;
  status: PurchaseRequestStatus;
  item: SelectedPurchaseItem;
}

const byOrder = (a: PurchaseOrderLine, b: PurchaseOrderLine) =>
  a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

export function PurchaseOrderView({ page }: PurchaseOrderViewProps) {
  const { data: requests = [], isLoading: requestsLoading } = usePurchaseRequests(page.id);
  const { data, isLoading: orderLoading } = usePurchaseOrderData(page.id);
  const { data: myResourceId } = useCurrentResourceId();

  const batches = useMemo(() => data?.batches ?? [], [data?.batches]);
  const lines = useMemo(() => data?.lines ?? [], [data?.lines]);
  const links = useMemo(() => liveLinks(data?.links ?? [], requests), [data?.links, requests]);

  const createBatch = useCreatePurchaseOrderBatch();
  const updateBatch = useUpdatePurchaseOrderBatch();
  const deleteBatch = useDeletePurchaseOrderBatch();
  const setBatchStatus = useSetPurchaseOrderBatchStatus();
  const updateLines = useUpdatePurchaseOrderLines();
  const createLine = useCreatePurchaseOrderLine();
  const removeLines = useRemovePurchaseOrderLines();
  const mergeLines = useMergePurchaseOrderLines();
  const unlinkItem = useUnlinkPurchaseOrderItem();
  const addToBatch = useAddToBatch({
    pageId: page.id,
    columns: page.columns,
    batches,
    lines,
    links,
    createdBy: myResourceId ?? null,
  });

  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [itemSelected, setItemSelected] = useState<Set<string>>(new Set());
  const [itemAnchor, setItemAnchor] = useState<string | null>(null);
  const [lineSelected, setLineSelected] = useState<Set<string>>(new Set());
  const [showRejected, setShowRejected] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [statusPending, setStatusPending] = useState(false);

  // 처음엔 아직 끝나지 않은 첫 차수, 없으면 마지막 차수를 연다. 지운 차수를 보고 있었으면 다시 고른다
  useEffect(() => {
    if (batches.length === 0) {
      if (activeBatchId) setActiveBatchId(null);
      return;
    }
    if (activeBatchId && batches.some((b) => b.id === activeBatchId)) return;
    const open = batches.find((b) => b.status !== 'purchased');
    setActiveBatchId((open ?? batches[batches.length - 1]).id);
  }, [batches, activeBatchId]);

  // 차수를 바꾸면 표 선택을 비운다 — 안 보이는 행이 ▼ 대상에 남으면 엉뚱한 차수에서 지워진다
  useEffect(() => setLineSelected(new Set()), [activeBatchId]);

  const roles = useMemo(() => resolveColumnRoles(page.columns), [page.columns]);

  /** 모든 신청 품목 (신청 최근 수정순 → 행 순서) */
  const allItems = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    for (const req of requests) {
      for (const row of meaningfulItemRows(req.items, page.columns)) {
        out.push({
          key: purchaseItemKey(req.id, row.id),
          requesterName: req.requester?.name || '',
          name: String(row.cells?.[roles.name?.id ?? ''] ?? '').trim(),
          detail: [roles.spec, roles.note]
            .map((c) => (c ? String(row.cells?.[c.id] ?? '').trim() : ''))
            .filter(Boolean)
            .join(' · '),
          status: getItemStatus(req, row.id),
          item: { requestId: req.id, requesterName: req.requester?.name || '', row },
        });
      }
    }
    return out;
  }, [requests, page.columns, roles]);

  const itemByKey = useMemo(() => new Map(allItems.map((i) => [i.key, i])), [allItems]);
  const linkedKeys = useMemo(
    () => new Set(links.map((l) => purchaseItemKey(l.request_id, l.row_id))),
    [links],
  );
  const unlinkedAll = useMemo(() => allItems.filter((i) => !linkedKeys.has(i.key)), [allItems, linkedKeys]);
  const rejectedUnlinked = unlinkedAll.filter((i) => i.status === 'rejected').length;
  const unlinked = useMemo(
    () => (showRejected ? unlinkedAll : unlinkedAll.filter((i) => i.status !== 'rejected')),
    [unlinkedAll, showRejected],
  );

  // 올라간(또는 숨겨진) 품목은 선택에서 지운다
  useEffect(() => {
    const visible = new Set(unlinked.map((i) => i.key));
    setItemSelected((prev) => {
      const next = new Set([...prev].filter((k) => visible.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [unlinked]);

  const requesterNameByRequest = useMemo(
    () => new Map(requests.map((r) => [r.id, r.requester?.name || ''])),
    [requests],
  );
  const byLine = useMemo(() => linksByLine(links), [links]);

  const activeBatch = batches.find((b) => b.id === activeBatchId) ?? null;
  const activeColumns = useMemo(
    () => resolveOrderColumns(activeBatch?.columns),
    [activeBatch?.columns],
  );
  const activeLines = useMemo(
    () => lines.filter((l) => l.batch_id === activeBatchId).sort(byOrder),
    [lines, activeBatchId],
  );
  const activeTotal = sumLines(activeLines);
  const selectedLines = activeLines.filter((l) => lineSelected.has(l.id));

  const docItems = useMemo<OfficialDocumentItem[]>(
    () => linesToDocumentItems(activeLines, links, requesterNameByRequest),
    [activeLines, links, requesterNameByRequest],
  );

  const describeItem = (requestId: string, rowId: string) => {
    const it = itemByKey.get(purchaseItemKey(requestId, rowId));
    return it ? { requester: it.requesterName, name: it.name } : null;
  };

  const fail = (e: unknown, fallback: string) =>
    toast.error(e instanceof Error ? e.message : fallback);

  // ── 차수 ─────────────────────────────────────────
  const handleAddBatch = async () => {
    try {
      const last = batches[batches.length - 1];
      const created = await createBatch.mutateAsync({
        pageId: page.id,
        title: nextBatchTitle(batches),
        sortOrder: batches.length,
        createdBy: myResourceId ?? null,
        columns: last?.columns ?? [],
      });
      setActiveBatchId(created.id);
    } catch (e) {
      fail(e, '차수를 만들지 못했습니다.');
    }
  };

  const handleRename = async (batch: PurchaseOrderBatch, title: string) => {
    setRenaming(false);
    const next = title.trim();
    if (!next || next === batch.title) return;
    try {
      await updateBatch.mutateAsync({ pageId: page.id, batchId: batch.id, patch: { title: next } });
    } catch (e) {
      fail(e, '이름을 바꾸지 못했습니다.');
    }
  };

  const handleDeleteBatch = async (batch: PurchaseOrderBatch) => {
    const lineCount = lines.filter((l) => l.batch_id === batch.id).length;
    const msg =
      lineCount > 0
        ? `'${batch.title}'와 그 안의 품의 품목 ${lineCount}개를 지웁니다.\n연결된 신청 품목은 지워지지 않고 '아직 안 담긴' 쪽으로 돌아갑니다(신청 상태도 그대로).`
        : `'${batch.title}'를 지울까요?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteBatch.mutateAsync({ pageId: page.id, batchId: batch.id });
    } catch (e) {
      fail(e, '차수를 지우지 못했습니다.');
    }
  };

  const handleStatus = async (batch: PurchaseOrderBatch, to: PurchaseOrderBatchStatus) => {
    if (batch.status === to) return;
    const effect = batchStatusEffect(batch.status, to);
    if (!window.confirm(`'${batch.title}'를 '${BATCH_STATUS_LABEL[to]}'(으)로 바꿉니다.\n${effect ?? ''}`)) {
      return;
    }
    setStatusPending(true);
    try {
      const { updatedItems } = await setBatchStatus.mutateAsync({
        pageId: page.id,
        batchId: batch.id,
        status: to,
      });
      // 다른 탭(신청 관리·신청자 화면)에 생기는 부수효과라 알린다
      if (updatedItems > 0) toast.success(`신청 품목 ${updatedItems}개의 상태를 함께 바꿨습니다.`);
    } catch (e) {
      fail(e, '상태를 바꾸지 못했습니다.');
    } finally {
      setStatusPending(false);
    }
  };

  // ── 표 ───────────────────────────────────────────
  const handleCommit = (commits: CellCommit[]) => {
    const lineById = new Map(activeLines.map((l) => [l.id, l]));
    const updates = commits.flatMap((c) => {
      const line = lineById.get(c.lineId);
      return line ? [{ lineId: line.id, patch: buildLinePatch(line, c.cells) }] : [];
    });
    if (updates.length === 0) return;
    updateLines.mutate(
      { pageId: page.id, updates },
      { onError: (e) => fail(e, '저장하지 못했습니다. 값을 되돌렸습니다.') },
    );
  };

  const handleColumnsChange = (columns: PurchaseOrderColumn[]) => {
    if (!activeBatch) return;
    updateBatch.mutate(
      { pageId: page.id, batchId: activeBatch.id, patch: { columns } },
      { onError: (e) => fail(e, '열을 바꾸지 못했습니다.') },
    );
  };

  const handleCreateLine = (name: string) => {
    if (!activeBatch) return;
    createLine.mutate(
      {
        pageId: page.id,
        batchId: activeBatch.id,
        values: { ...EMPTY_LINE_INPUT, name },
        sortOrder: activeLines.reduce((m, l) => Math.max(m, l.sort_order + 1), 0),
      },
      { onError: (e) => fail(e, '품목을 만들지 못했습니다.') },
    );
  };

  const handleUnlink = (link: PurchaseOrderLink, line: PurchaseOrderLine) => {
    const it = itemByKey.get(purchaseItemKey(link.request_id, link.row_id));
    unlinkItem.mutate(
      {
        pageId: page.id,
        linkId: link.id,
        line,
        qtyDelta: it ? -itemQty(it.item.row, page.columns) : 0,
      },
      { onError: (e) => fail(e, '빼지 못했습니다.') },
    );
  };

  // ── ▲ ▼ 합치기 ───────────────────────────────────
  const handleUp = async () => {
    const selection = unlinked.filter((i) => itemSelected.has(i.key)).map((i) => i.item);
    const batchId = await addToBatch.run(activeBatch?.id ?? '__new__', selection);
    if (batchId) {
      setActiveBatchId(batchId);
      setItemSelected(new Set());
    }
  };

  const handleDown = async () => {
    if (selectedLines.length === 0) return;
    const linkedCount = selectedLines.reduce((n, l) => n + (byLine.get(l.id)?.length ?? 0), 0);
    const msg =
      `선택한 품의 품목 ${selectedLines.length}개를 차수에서 내립니다(품목과 적어 둔 값이 지워집니다).` +
      (linkedCount > 0 ? `\n연결된 신청 품목 ${linkedCount}개는 '아직 안 담긴' 쪽으로 돌아갑니다.` : '');
    if (!window.confirm(msg)) return;
    try {
      await removeLines.mutateAsync({ pageId: page.id, lineIds: selectedLines.map((l) => l.id) });
      setLineSelected(new Set());
    } catch (e) {
      fail(e, '내리지 못했습니다.');
    }
  };

  const handleMerge = async () => {
    if (selectedLines.length < 2) return;
    const [keep] = [...selectedLines].sort(byOrder);
    if (
      !window.confirm(
        `선택한 ${selectedLines.length}개 품목을 맨 위 '${keep.name}' 하나로 합칩니다.\n` +
          '연결된 신청 품목은 모두 그쪽으로 옮기고, 수량은 모두 적혀 있을 때만 더합니다. 나머지 품목의 다른 값은 지워집니다.',
      )
    ) {
      return;
    }
    try {
      await mergeLines.mutateAsync({ pageId: page.id, lines: selectedLines });
      setLineSelected(new Set([keep.id]));
    } catch (e) {
      fail(e, '합치지 못했습니다.');
    }
  };

  if (requestsLoading || orderLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const itemOrder = unlinked.map((i) => i.key);
  const allItemsSelected = unlinked.length > 0 && unlinked.every((i) => itemSelected.has(i.key));
  const toggleItem = (key: string, shiftKey: boolean) => {
    const { selected, anchorKey } = toggleWithRange({
      keys: itemOrder,
      selected: itemSelected,
      key,
      anchorKey: itemAnchor,
      shiftKey,
    });
    setItemSelected(selected);
    setItemAnchor(anchorKey);
  };
  const upTarget = activeBatch?.title ?? nextBatchTitle(batches);
  const busy = addToBatch.pending || removeLines.isPending || mergeLines.isPending;

  return (
    <div className="space-y-3">
      {/* ── 요약 한 줄 (2026-10-13 — 통계 4칸 → 한 줄) ──────
          '아직 안 담긴 품목' 은 단계 탭 ② 의 숫자와 같은 정의다(utils/managerSteps). */}
      <p className="px-1 text-xs tabular-nums text-slate-500">
        신청 품목 {allItems.length}개 · 품의에 담김 {linkedKeys.size}개 ·{' '}
        <span className={(unlinkedAll.length - rejectedUnlinked) > 0 ? 'font-semibold text-amber-800' : ''}>
          아직 안 담김 {(unlinkedAll.length - rejectedUnlinked)}개
        </span>{' '}
        · 차수 {batches.length}개
      </p>

      {/* ── 품의 차수 ─────────────────────────────────── */}
      <Card className="relative overflow-hidden">
        {activeBatch && (
          <div
            className={`absolute inset-x-0 top-0 h-1 ${
              activeBatch.status === 'purchased'
                ? 'bg-emerald-500'
                : activeBatch.status === 'submitted'
                ? 'bg-blue-500'
                : 'bg-slate-300'
            }`}
          />
        )}
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <CardTitle className="mr-1 flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-emerald-600" />
              품의 차수
            </CardTitle>
            {batches.map((b) => {
              const t = sumLines(lines.filter((l) => l.batch_id === b.id));
              const active = b.id === activeBatchId;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setActiveBatchId(b.id)}
                  className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-left text-xs transition-colors ${
                    active
                      ? 'border-blue-300 bg-blue-50/60 ring-1 ring-blue-200'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate font-medium text-slate-800" title={b.title}>
                    {b.title}
                  </span>
                  <Badge
                    variant="secondary"
                    className={`${BATCH_STATUS_COLOR[b.status]} shrink-0 px-1.5 py-0 text-[10px]`}
                  >
                    {BATCH_STATUS_LABEL[b.status]}
                  </Badge>
                  {t.total > 0 && (
                    <span className="shrink-0 tabular-nums text-slate-500">{formatKrw(t.total)}</span>
                  )}
                </button>
              );
            })}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleAddBatch}
              disabled={createBatch.isPending}
              className="h-7 px-2 text-xs text-slate-500"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> 새 차수
            </Button>
          </div>

          {activeBatch && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              {renaming ? (
                <Input
                  autoFocus
                  defaultValue={activeBatch.title}
                  onBlur={(e) => handleRename(activeBatch, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenaming(false);
                  }}
                  className="h-8 w-48 text-[16px] sm:text-sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setRenaming(true)}
                  className="group inline-flex min-w-0 items-center gap-1 text-sm font-semibold text-slate-800"
                  title="이름 바꾸기"
                >
                  <span className="truncate">{activeBatch.title}</span>
                  <Pencil className="h-3 w-3 shrink-0 text-slate-300 group-hover:text-slate-500" />
                </button>
              )}
              <BatchStepper
                status={activeBatch.status}
                disabled={statusPending}
                onChange={(to) => handleStatus(activeBatch, to)}
              />
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  size="sm"
                  onClick={() => setDocOpen(true)}
                  disabled={activeLines.length === 0}
                  className="h-8 bg-blue-600 hover:bg-blue-700"
                >
                  <FileText className="mr-1 h-3.5 w-3.5" /> 공문 만들기
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteBatch(activeBatch)}
                  className="h-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  title="차수 지우기"
                  aria-label="차수 지우기"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-2">
          {!activeBatch ? (
            <EmptyState
              icon={ClipboardCheck}
              title="아직 품의 차수가 없습니다"
              body="아래 신청 품목을 골라 ▲ 를 누르면 1차 품의가 만들어지고 바로 올라갑니다."
            />
          ) : (
            <>
              <OrderSheet
                batchId={activeBatch.id}
                columns={activeColumns}
                lines={activeLines}
                linksByLine={byLine}
                describeItem={describeItem}
                selected={lineSelected}
                onToggleSelect={(id) =>
                  setLineSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onToggleAll={() =>
                  setLineSelected(
                    activeLines.every((l) => lineSelected.has(l.id))
                      ? new Set()
                      : new Set(activeLines.map((l) => l.id)),
                  )
                }
                onCommit={handleCommit}
                onCreateLine={handleCreateLine}
                onUnlink={handleUnlink}
                onColumnsChange={handleColumnsChange}
              />
              <p className="text-[11px] text-slate-400">
                칸을 눌러 바로 고칩니다 · Enter·↑↓ 로 위아래 이동 · 엑셀에서 여러 칸을 복사해 붙이면 그 칸부터
                채웁니다 · 열 이름을 누르면 이름 바꾸기·이동·빼기, [+]로 열 추가
              </p>
              {activeTotal.missing > 0 && (
                <p className="flex items-center gap-1 text-[11px] text-amber-700">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  단가나 수량이 빈 품목 {activeTotal.missing}개는 합계에 들어가지 않았습니다. 공문의 소요
                  예산도 그만큼 빠집니다.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── ▲ ▼ ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2">
        <Button
          size="sm"
          onClick={handleUp}
          disabled={itemSelected.size === 0 || busy}
          className="h-9 gap-1.5 bg-blue-600 px-4 hover:bg-blue-700"
          title={`아래에서 고른 신청 품목을 '${upTarget}'에 올립니다. 같은 물품끼리 한 줄로 묶입니다.`}
        >
          {addToBatch.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          {upTarget}에 올리기{itemSelected.size > 0 && ` (${itemSelected.size})`}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDown}
          disabled={selectedLines.length === 0 || busy}
          className="h-9 gap-1.5 bg-white px-4"
          title="표에서 고른 품의 품목을 내립니다. 연결된 신청 품목은 아래로 돌아갑니다."
        >
          <ArrowDown className="h-4 w-4" /> 내리기{selectedLines.length > 0 && ` (${selectedLines.length})`}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleMerge}
          disabled={selectedLines.length < 2 || busy}
          className="h-9 gap-1.5 px-3 text-slate-600"
          title="표에서 고른 품목들을 맨 위 품목 하나로 합칩니다 (예: 'GPT' + 'ChatGPT Plus')"
        >
          <Combine className="h-4 w-4" /> 합치기
        </Button>
      </div>

      {/* ── 아직 안 담긴 신청 품목 ───────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4 text-amber-600" />
              아직 안 담긴 신청 품목
              <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                {unlinked.length}
              </Badge>
            </CardTitle>
            {rejectedUnlinked > 0 && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                <Checkbox checked={showRejected} onCheckedChange={(v) => setShowRejected(!!v)} />
                불가 처리된 {rejectedUnlinked}개도 보기
              </label>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {unlinked.length === 0 ? (
            <EmptyState
              icon={Check}
              title={allItems.length === 0 ? '아직 신청이 없습니다' : '모든 신청 품목이 품의에 담겼습니다'}
              body={allItems.length === 0 ? '신청이 들어오면 여기에 나타납니다.' : ''}
            />
          ) : (
            <>
              <label className="flex w-fit cursor-pointer items-center gap-2 px-1 text-xs text-slate-600">
                <Checkbox
                  checked={allItemsSelected}
                  onCheckedChange={() =>
                    setItemSelected(allItemsSelected ? new Set() : new Set(unlinked.map((i) => i.key)))
                  }
                />
                전체 선택 <span className="text-slate-400">· Shift+클릭으로 범위 선택</span>
              </label>
              <div className="max-h-[50vh] overflow-y-auto rounded-lg border bg-white">
                {unlinked.map((i) => {
                  const on = itemSelected.has(i.key);
                  return (
                    <div
                      key={i.key}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => toggleItem(i.key, e.shiftKey)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          toggleItem(i.key, e.shiftKey);
                        }
                      }}
                      className={`flex min-w-0 cursor-pointer select-none items-start gap-2 border-b px-3 py-2 text-xs last:border-b-0 ${
                        on ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <Checkbox checked={on} tabIndex={-1} className="pointer-events-none mt-0.5" />
                      <span className="w-16 shrink-0 truncate font-medium text-slate-700" title={i.requesterName}>
                        {i.requesterName || '—'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-slate-800" title={i.name}>
                          {i.name || '(물품명 없음)'}
                        </span>
                        {i.detail && (
                          <span className="block truncate text-[11px] text-slate-500" title={i.detail}>
                            {i.detail}
                          </span>
                        )}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`${STATUS_COLOR[i.status]} shrink-0 px-1.5 py-0 text-[10px]`}
                      >
                        {STATUS_LABEL[i.status]}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {activeBatch && (
        <OfficialDocumentDialog
          open={docOpen}
          onOpenChange={setDocOpen}
          page={page}
          selection={[]}
          orderItems={docItems}
          orderLabel={activeBatch.title}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────
function BatchStepper({
  status,
  disabled,
  onChange,
}: {
  status: PurchaseOrderBatchStatus;
  disabled?: boolean;
  onChange: (to: PurchaseOrderBatchStatus) => void;
}) {
  const current = BATCH_STATUS_ORDER.indexOf(status);
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-100 bg-slate-100/50 p-1">
      {BATCH_STATUS_ORDER.map((s, i) => {
        const active = s === status;
        const done = i < current;
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onChange(s)}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
              active
                ? s === 'purchased'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : s === 'submitted'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-800 shadow-sm'
                : done
                ? 'text-slate-600 hover:bg-white/70'
                : 'text-slate-400 hover:bg-white/70 hover:text-slate-600'
            }`}
            title={`'${BATCH_STATUS_LABEL[s]}'(으)로 바꾸기`}
          >
            {done && <Check className="h-3 w-3" />}
            {BATCH_STATUS_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
        <Icon className="h-6 w-6 text-blue-600" />
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {body && <p className="mt-1 text-xs text-slate-500">{body}</p>}
    </div>
  );
}
