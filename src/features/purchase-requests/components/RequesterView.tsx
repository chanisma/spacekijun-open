import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { ClipboardCheck, History, Loader2, MoreHorizontal, Pencil, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import {
  PurchaseItemRow,
  PurchaseOrderProgress,
  PurchaseRequest,
  PurchaseRequestPageWithRelations,
  computeRowsTotalKRW,
  getPagePeriodStatus,
} from '../types';
import {
  useDeletePurchaseRequest,
  useMyPurchaseRequests,
  useUpsertPurchaseRequest,
} from '../hooks/usePurchaseRequests';
import { STATUS_COLOR, STATUS_LABEL } from '../purchaseRequestStatus';
import { useMyPurchaseOrderProgress } from '../hooks/usePurchaseOrders';
import { BATCH_STATUS_COLOR, BATCH_STATUS_LABEL, purchaseItemKey } from '../utils/purchaseOrder';
import { resolveItemNameColumn } from '../utils/officialDocument';
import {
  MyItem,
  RowEditPlan,
  describeItemRow,
  flattenMyItems,
  planRemoveRow,
  planReplaceRow,
  summarizeMyItems,
} from '../utils/myItems';
import { LinkCell } from './LinkCell';
import { fmtKRW } from '../utils/format';
import { NewRequestPanel } from './requester/NewRequestPanel';
import { ItemEditDialog } from './requester/ItemEditDialog';
import { RequestHistoryDialog } from './requester/RequestHistoryDialog';

interface RequesterViewProps {
  page: PurchaseRequestPageWithRelations;
  canSubmit: boolean;
}

/**
 * 신청자 화면 — «내 신청 품목» 한 목록 (2026-10-13 개편).
 *
 * 종전엔 신청서마다 카드가 있고 저장된 카드는 **기본으로 접혀** 있어, "내 신청이 어떻게 됐나"를 보려면
 * 카드를 펼쳐야 했다(카드마다 이력·수정·삭제 버튼 + 상태 스테퍼). 그런데 운영 데이터는 신청 1건에
 * 품목 평균 1.4개, 대부분 1인 1건이다 — 카드라는 장치가 내용보다 컸다. 그리고 매니저는 품목마다
 * 따로 처리하므로(2026-09-02) 신청서 단위 스테퍼는 섞인 상태를 설명하지 못했다.
 *
 * 지금은 내가 신청한 **품목**이 한 목록에 있고, 줄마다 상태·사유·품의 진행이 바로 보인다.
 * 저장 단위는 그대로 신청건이다(utils/myItems 머리글 참고) — 새 신청은 아래 «새 신청» 칸에서
 * 여러 품목을 한 번에 제출하고, 줄 하나를 고치거나 지우면 그 품목이 든 신청을 다시 쓴다.
 */
export function RequesterView({ page, canSubmit }: RequesterViewProps) {
  const { toast } = useToast();
  const { data: myRequests = [], isLoading } = useMyPurchaseRequests(page.id);
  // 품의 진행 — 차수 이름·단계·확정 품명만 온다(단가·구매처는 매니저 전용)
  const { data: progress = [] } = useMyPurchaseOrderProgress(page.id);
  const upsert = useUpsertPurchaseRequest();
  const del = useDeletePurchaseRequest();

  // 새 신청 칸 — 자동으로 열지 않는다(빈 "작성중" 칸이 늘 떠 있으면 할 일처럼 보인다).
  // 단, 아직 신청한 품목이 하나도 없으면 바로 열어 둔다(그때는 그게 할 일이다).
  const [composing, setComposing] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [historyRequest, setHistoryRequest] = useState<PurchaseRequest | null>(null);

  const periodStatus = getPagePeriodStatus(page);
  const editable = canSubmit && periodStatus === 'open' && !page.is_archived;

  const nameColumn = useMemo(() => resolveItemNameColumn(page.columns), [page.columns]);
  const items = useMemo(() => flattenMyItems(myRequests, page.columns), [myRequests, page.columns]);
  const summary = useMemo(() => summarizeMyItems(items), [items]);
  const total = useMemo(
    () => computeRowsTotalKRW(items.map((i) => i.row), page.columns),
    [items, page.columns],
  );
  const orderByKey = useMemo(
    () => new Map(progress.map((p) => [purchaseItemKey(p.request_id, p.row_id), p])),
    [progress],
  );
  const editingItem = items.find((i) => i.key === editingKey) ?? null;

  const showComposer = editable && (composing || (!isLoading && items.length === 0));

  // ── 쓰기 ─────────────────────────────────────────
  const applyPlan = (plan: RowEditPlan, done: string, onDone?: () => void) => {
    if (plan.kind === 'missing') {
      toast({ title: '품목을 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.', variant: 'destructive' });
      return;
    }
    const onError = (e: unknown) =>
      toast({
        title: '저장하지 못했습니다',
        description: e instanceof Error ? e.message : '알 수 없는 오류',
        variant: 'destructive',
      });
    if (plan.kind === 'delete') {
      del.mutate(
        { requestId: plan.requestId, pageId: page.id },
        { onSuccess: () => { toast({ title: done }); onDone?.(); }, onError },
      );
      return;
    }
    upsert.mutate(
      { pageId: page.id, requestId: plan.requestId, items: plan.items },
      { onSuccess: () => { toast({ title: done }); onDone?.(); }, onError },
    );
  };

  const handleSubmitNew = (rows: PurchaseItemRow[]) => {
    upsert.mutate(
      { pageId: page.id, items: rows },
      {
        onSuccess: () => {
          setComposing(false);
          // 다른 화면에 생기는 부수효과(담당자 알림)를 알려 준다
          toast({ title: `품목 ${rows.length}개를 신청했습니다`, description: '담당 선생님께 알림이 갔습니다.' });
        },
        onError: (e: unknown) =>
          toast({
            title: '신청하지 못했습니다',
            description: e instanceof Error ? e.message : '알 수 없는 오류',
            variant: 'destructive',
          }),
      },
    );
  };

  const handleSaveEdit = (cells: PurchaseItemRow['cells']) => {
    if (!editingItem) return;
    applyPlan(planReplaceRow(editingItem.request, editingItem.row.id, cells), '품목을 고쳤습니다', () =>
      setEditingKey(null),
    );
  };

  const handleDelete = (item: MyItem<PurchaseRequest>, title: string) => {
    const decided = item.status !== 'submitted' && item.status !== 'pending';
    const message = decided
      ? `"${title}" 품목을 지울까요?\n\n담당자가 이미 «${STATUS_LABEL[item.status]}»(으)로 처리한 품목입니다. 지우면 처리 내용도 함께 사라집니다.`
      : `"${title}" 품목을 지울까요?`;
    if (!window.confirm(message)) return;
    applyPlan(planRemoveRow(item.request, item.row.id, page.columns), '품목을 지웠습니다');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const closedNotice = !editable
    ? !canSubmit
      ? '이 페이지의 신청 대상이 아닙니다.'
      : page.is_archived
      ? '보관된 페이지라 신청을 받지 않습니다.'
      : periodStatus === 'upcoming'
      ? '신청 기간이 아직 시작되지 않았습니다.'
      : '신청 기간이 끝나 품목을 추가하거나 고칠 수 없습니다.'
    : null;

  return (
    <div className="space-y-3">
      {closedNotice && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {closedNotice}
        </p>
      )}

      {items.length > 0 && (
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">
              내 신청 품목 <span className="tabular-nums text-slate-400">{summary.total}</span>
            </h3>
            <MySummaryChips counts={summary.counts} total={total} />
          </header>

          <ul className="divide-y">
            {items.map((item) => (
              <MyItemRow
                key={item.key}
                item={item}
                page={page}
                nameColumnId={nameColumn?.id}
                order={orderByKey.get(item.key)}
                editable={editable}
                busy={upsert.isPending || del.isPending}
                onEdit={() => setEditingKey(item.key)}
                onDelete={(title) => handleDelete(item, title)}
                onHistory={() => setHistoryRequest(item.request)}
              />
            ))}
          </ul>
        </section>
      )}

      {items.length === 0 && !showComposer && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
            <ShoppingCart className="h-6 w-6 text-blue-600" />
          </div>
          <p className="text-sm text-slate-600">신청한 품목이 없습니다.</p>
        </div>
      )}

      {showComposer ? (
        <NewRequestPanel
          columns={page.columns}
          submitting={upsert.isPending}
          onSubmit={handleSubmitNew}
          // 첫 신청이면 닫아도 돌아갈 목록이 없다 — 그때는 [취소]를 그리지 않는다
          onCancel={items.length > 0 ? () => setComposing(false) : undefined}
        />
      ) : (
        editable && (
          <Button
            variant="outline"
            onClick={() => setComposing(true)}
            className="h-11 w-full gap-1.5 border-dashed text-slate-700"
          >
            <Plus className="h-4 w-4" /> 품목 더 신청하기
          </Button>
        )
      )}

      <ItemEditDialog
        open={!!editingItem}
        onOpenChange={(o) => !o && setEditingKey(null)}
        columns={page.columns}
        row={editingItem?.row ?? null}
        status={editingItem?.status ?? null}
        saving={upsert.isPending || del.isPending}
        onSave={handleSaveEdit}
      />

      {historyRequest && (
        <RequestHistoryDialog
          open={!!historyRequest}
          onOpenChange={(o) => !o && setHistoryRequest(null)}
          requestId={historyRequest.id}
          currentRequest={historyRequest}
          columns={page.columns}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────
// 요약 칩 — 0 인 상태는 감춘다
// ─────────────────────────────────────────────────
const SUMMARY_CHIPS: { key: 'open' | 'approved' | 'completed' | 'rejected'; label: string; tone: string }[] = [
  { key: 'open', label: '처리 대기', tone: 'bg-amber-50 text-amber-800' },
  { key: 'approved', label: STATUS_LABEL.approved, tone: STATUS_COLOR.approved },
  { key: 'completed', label: STATUS_LABEL.completed, tone: STATUS_COLOR.completed },
  { key: 'rejected', label: STATUS_LABEL.rejected, tone: STATUS_COLOR.rejected },
];

function MySummaryChips({
  counts,
  total,
}: {
  counts: Record<'all' | 'open' | 'approved' | 'completed' | 'rejected', number>;
  total: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {SUMMARY_CHIPS.filter((c) => counts[c.key] > 0).map((c) => (
        <span key={c.key} className={`rounded-full px-2 py-0.5 font-medium tabular-nums ${c.tone}`}>
          {c.label} {counts[c.key]}
        </span>
      ))}
      {total !== null && total > 0 && (
        <span className="ml-1 font-semibold tabular-nums text-slate-700">{fmtKRW(total)}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────
// 품목 한 줄 — 제목 + 상태 / 나머지 칸 / 품의 진행 / 사유
// ─────────────────────────────────────────────────
function MyItemRow({
  item,
  page,
  nameColumnId,
  order,
  editable,
  busy,
  onEdit,
  onDelete,
  onHistory,
}: {
  item: MyItem<PurchaseRequest>;
  page: PurchaseRequestPageWithRelations;
  nameColumnId: string | undefined;
  order?: Pick<PurchaseOrderProgress, 'batch_title' | 'batch_status' | 'line_name'>;
  editable: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: (title: string) => void;
  onHistory: () => void;
}) {
  const nameColumn = page.columns.find((c) => c.id === nameColumnId);
  const { title, fields } = describeItemRow(item.row, page.columns, nameColumn);
  const shownTitle = title ?? '(물품명 없음)';

  return (
    <li className="flex gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-sm font-medium text-slate-800" title={shownTitle}>
            {shownTitle}
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[item.status]}`}
          >
            {STATUS_LABEL[item.status]}
          </span>
        </div>

        {fields.length > 0 && (
          <dl className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
            {fields.map(({ column, value }) => (
              <div key={column.id} className="flex min-w-0 max-w-full items-baseline gap-1">
                <dt className="shrink-0 text-slate-400">{column.name}</dt>
                <dd className="min-w-0 break-words text-slate-600">
                  {column.type === 'url' ? (
                    <LinkCell value={value} />
                  ) : column.type === 'number' && Number.isFinite(Number(value)) ? (
                    Number(value).toLocaleString('ko-KR')
                  ) : (
                    String(value)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {order && (
          <p
            className={`inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
              BATCH_STATUS_COLOR[order.batch_status]
            }`}
            title={`${order.batch_title} · ${BATCH_STATUS_LABEL[order.batch_status]} · ${order.line_name}`}
          >
            <ClipboardCheck className="h-3 w-3 shrink-0" />
            <span className="shrink-0 font-medium">
              {order.batch_title} {BATCH_STATUS_LABEL[order.batch_status]}
            </span>
            <span className="truncate opacity-80">· {order.line_name}</span>
          </p>
        )}

        {item.reason && (
          <p
            className={`whitespace-pre-wrap rounded-md px-2 py-1 text-xs ${
              item.status === 'rejected' ? 'bg-rose-50 text-rose-800' : 'bg-slate-50 text-slate-600'
            }`}
          >
            <span className="font-semibold">사유</span> · {item.reason}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-start gap-0.5">
        {editable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-slate-400 hover:text-slate-700"
            onClick={onEdit}
            disabled={busy}
            aria-label={`${shownTitle} 고치기`}
            title="고치기"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-slate-400 hover:text-slate-700"
              aria-label="더 보기"
              title="더 보기"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onHistory}>
              <History className="mr-2 h-3.5 w-3.5" /> 신청 수정 이력
            </DropdownMenuItem>
            {editable && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => onDelete(shownTitle)}
                  className="text-rose-600 focus:text-rose-700"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> 품목 지우기
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
