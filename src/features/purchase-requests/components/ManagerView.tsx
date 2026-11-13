import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FileText,
  Loader2,
  CheckCircle2,
  ClipboardCheck,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Search,
  ShoppingBag,
  Trash2,
  Users,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useDeletePurchaseRequest,
  usePurchaseRequests,
  useUpdatePurchaseRequestItemCell,
  useUpdatePurchaseRequestStatus,
} from '../hooks/usePurchaseRequests';
import {
  PurchaseColumn,
  PurchaseItemRow,
  PurchaseRequestPageWithRelations,
  PurchaseRequestStatus,
  PurchaseRequestWithRequester,
  computeRowsTotalKRW,
} from '../types';
import { STATUS_COLOR, STATUS_LABEL, STATUS_OPTIONS } from '../purchaseRequestStatus';
import {
  STATUS_FILTER_OPTIONS,
  StatusFilter,
  countByStatusFilter,
  matchesStatusFilter,
} from '../utils/statusFilter';
import { ManagerSortKey, ManagerViewMode, ViewOptionsMenu } from './ViewOptionsMenu';
import { StatusChangePopover } from './StatusChangePopover';
import { LinkCell } from './LinkCell';
import { ItemNameCell } from './ItemNameCell';
import { OfficialDocumentDialog } from './OfficialDocumentDialog';
import { BulkItemNameDialog } from './BulkItemNameDialog';
import { SelectionActionBar } from './SelectionActionBar';
import { parseLinkDisplay, shopGroupLabel } from '../utils/linkDisplay';
import { SelectedPurchaseItem, resolveItemNameColumn } from '../utils/officialDocument';
import { getItemStatus, getItemStatusEntry, summarizeItemStatuses } from '../utils/itemStatus';
import { matchesItemQuery, matchesRequestQuery } from '../utils/itemSearch';
import { REQUESTER_SORT_KEY, STATUS_SORT_KEY, sortFlatItems } from '../utils/itemSort';
import { SortState, nextSortState } from '@/lib/tableSort';
import { SortableHeader } from './SortableHeader';
import { BulkStatusDialog } from './BulkStatusDialog';
import { toggleWithRange } from '@/lib/rangeSelection';
import { fmtDateTime, fmtKRW } from '../utils/format';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';
import { usePurchaseOrderData } from '../hooks/usePurchaseOrders';
import {
  BATCH_STATUS_COLOR,
  liveLinks,
  meaningfulItemRows,
  purchaseItemKey,
} from '../utils/purchaseOrder';
import { AddToBatchMenu } from './order/AddToBatchMenu';
import { useAddToBatch } from './order/useAddToBatch';
import type { PurchaseOrderBatchStatus } from '../types';

/** 품목 행에 붙는 품의 표시 — 어느 차수의 어느 품의 품목에 들어갔는가 */
interface OrderTag {
  lineName: string;
  batchTitle: string;
  batchStatus: PurchaseOrderBatchStatus;
}

interface ManagerViewProps {
  page: PurchaseRequestPageWithRelations;
}

type ViewMode = ManagerViewMode;
type SortKey = ManagerSortKey;

/** 품목 1행의 전역 식별자 — 신청 id 만으로는 행을 특정할 수 없다 */
const itemKey = (requestId: string, rowId: string) => `${requestId}::${rowId}`;

/** 물품명 인라인 수정 배선 — 표 3곳(품목별·신청건별·신청자별)이 같은 프롭을 받는다 */
interface NameEditProps {
  nameColumnId?: string;
  savingKey?: string | null;
  onEditName?: (requestId: string, rowId: string, value: string) => void;
}

const renderCell = (col: PurchaseColumn, value: unknown) => {
  if (value === '' || value === null || value === undefined) return <span className="text-slate-400">—</span>;
  if (col.type === 'url') {
    return <LinkCell value={value} />;
  }
  if (col.type === 'number') {
    const num = Number(value);
    return Number.isFinite(num) ? num.toLocaleString('ko-KR') : String(value);
  }
  return <span className="whitespace-pre-wrap">{String(value)}</span>;
};

// 값이 하나라도 있는 행만 "실제 품목"으로 취급 — 기준은 품의 정리와 같은 함수 하나
const meaningfulRows = (
  req: Pick<PurchaseRequestWithRequester, 'items'>,
  columns: PurchaseColumn[],
): PurchaseItemRow[] => meaningfulItemRows(req.items as PurchaseItemRow[], columns);

export function ManagerView({ page }: ManagerViewProps) {
  const { toast } = useToast();
  const { data: requests = [], isLoading } = usePurchaseRequests(page.id);
  // 품의 정리(2026-10-12) — 품목 행의 '어느 품의에 담겼나' 표시와 [▲ 품의 차수에 올리기]에 쓴다.
  // 품의 정리 탭과 같은 쿼리 키라 한 번만 읽힌다.
  const { data: orderData } = usePurchaseOrderData(page.id);
  const { data: myResourceId } = useCurrentResourceId();
  const orderLinks = useMemo(
    () => liveLinks(orderData?.links ?? [], requests),
    [orderData?.links, requests],
  );
  const orderTagByKey = useMemo(() => {
    const map = new Map<string, OrderTag>();
    if (!orderData) return map;
    const lineById = new Map(orderData.lines.map((l) => [l.id, l]));
    const batchById = new Map(orderData.batches.map((b) => [b.id, b]));
    for (const link of orderLinks) {
      const line = lineById.get(link.line_id);
      const batch = line ? batchById.get(line.batch_id) : undefined;
      if (!line || !batch) continue;
      map.set(purchaseItemKey(link.request_id, link.row_id), {
        lineName: line.name,
        batchTitle: batch.title,
        batchStatus: batch.status,
      });
    }
    return map;
  }, [orderData, orderLinks]);
  const deleteRequest = useDeletePurchaseRequest();
  const updateStatus = useUpdatePurchaseRequestStatus();
  const [viewMode, setViewMode] = useState<ViewMode>('per_item');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated_desc');
  const [groupByShop, setGroupByShop] = useState(false);
  // 표에는 핵심 열만 — 필수(required) 컬럼 기준. 전체 내용은 행 클릭 상세 or [전체 열] 토글
  const [showAllColumns, setShowAllColumns] = useState(false);
  // 상세 모달은 **참조만** 들고 실제 값은 쿼리에서 다시 찾는다 — 스냅샷을 들고 있으면
  // 모달 안에서 물품명을 고쳐도 화면이 옛 값을 계속 보여준다.
  const [detailRef, setDetailRef] = useState<{ reqId: string; rowId: string } | null>(null);
  // 일괄 상태 변경 — 신청건별/신청자별 뷰에서 체크한 신청 id 집합
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  // 상태·사유 입력은 액션 바가 아니라 모달이 갖는다(바는 버튼만 남긴다)
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  // 품목 표 열 정렬. null = 기본 순서(위의 '정렬' 드롭다운 결과)
  const [itemSort, setItemSort] = useState<SortState | null>(null);
  // 품목별 뷰에서 체크한 품목 — 공문에 담을 단위가 '신청건'이 아니라 '품목'인 경우
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set());
  const [docOpen, setDocOpen] = useState(false);
  const [docSelection, setDocSelection] = useState<SelectedPurchaseItem[]>([]);
  const [bulkNameOpen, setBulkNameOpen] = useState(false);
  const [bulkNamePending, setBulkNamePending] = useState(false);
  // Shift 범위 선택의 앵커 — 마지막으로 '그냥 클릭'한 항목. 인덱스가 아니라 키로 들고
  // 있어야 정렬·필터로 목록이 흔들려도 엉뚱한 구간을 잡지 않는다.
  const requestAnchorRef = useRef<string | null>(null);
  const itemAnchorRef = useRef<string | null>(null);
  // 물품명 저장 중 표시 — 어느 셀이 저장 중인지 하나만 추적(한 번에 한 셀만 편집한다)
  const [savingNameKey, setSavingNameKey] = useState<string | null>(null);
  const updateItemCell = useUpdatePurchaseRequestItemCell();

  const urlColumn = useMemo(() => page.columns.find((c) => c.type === 'url'), [page.columns]);
  // 매니저가 고쳐 쓸 수 있는 열. 못 찾으면 편집 UI 자체를 내지 않는다.
  const nameColumn = useMemo(() => resolveItemNameColumn(page.columns), [page.columns]);

  const handleEditName = (requestId: string, rowId: string, value: string) => {
    if (!nameColumn) return;
    const key = itemKey(requestId, rowId);
    setSavingNameKey(key);
    updateItemCell.mutate(
      { requestId, rowIds: [rowId], columnId: nameColumn.id, value, pageId: page.id },
      {
        onSuccess: () => toast({ title: '물품명을 수정했습니다.' }),
        onError: (e: unknown) =>
          toast({
            title: '물품명 수정 실패',
            description: e instanceof Error ? e.message : '알 수 없는 오류',
            variant: 'destructive',
          }),
        onSettled: () => setSavingNameKey((prev) => (prev === key ? null : prev)),
      },
    );
  };

  const nameEditProps: NameEditProps = {
    nameColumnId: nameColumn?.id,
    savingKey: savingNameKey,
    onEditName: handleEditName,
  };

  const detailItem = useMemo(() => {
    if (!detailRef) return null;
    const req = requests.find((r) => r.id === detailRef.reqId);
    const row = ((req?.items as PurchaseItemRow[]) || []).find((r) => r.id === detailRef.rowId);
    return req && row ? { req, row } : null;
  }, [detailRef, requests]);

  // 핵심 열 = 필수 컬럼 (기본 양식: 물품명·주소·가격·개수 — 상세 옵션·비고 숨김).
  // 필수 컬럼이 없는 커스텀 페이지는 숨길 기준이 없으므로 전체 표시.
  const coreColumns = useMemo(() => {
    const required = page.columns.filter((c) => c.required);
    return required.length > 0 ? required : page.columns;
  }, [page.columns]);
  const hasHiddenColumns = coreColumns.length < page.columns.length;
  const displayColumns = showAllColumns || !hasHiddenColumns ? page.columns : coreColumns;

  const handleDeleteRequest = (req: PurchaseRequestWithRequester) => {
    const name = req.requester?.name || '신청자';
    const itemCount = meaningfulRows(req, page.columns).length;
    if (
      !window.confirm(
        `${name} 님의 신청 내역(${itemCount}건)을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`,
      )
    )
      return;
    deleteRequest.mutate(
      { requestId: req.id, pageId: page.id },
      {
        onSuccess: () => {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(req.id);
            return next;
          });
          toast({
            title: '삭제 완료',
            description: `${name} 님의 신청이 삭제되었습니다.`,
          });
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : '삭제 중 오류';
          toast({ title: '삭제 실패', description: msg, variant: 'destructive' });
        },
      },
    );
  };

  const filteredSorted = useMemo(() => {
    let list = [...requests];
    // 품목별 뷰에서는 상태 필터가 **품목**에 걸린다(아래 flatItems). 여기서 신청건을 먼저
    // 걸러 버리면 "pending 신청 안의 approved 품목"이 통째로 사라진다.
    if (statusFilter !== 'all' && viewMode !== 'per_item') {
      list = list.filter((r) => matchesStatusFilter(r.status, statusFilter));
    }
    // 검색어 해석(쉼표 = OR)은 품목 판정과 **같은 함수**를 쓴다 — 한쪽만 다르게 읽으면
    // 뷰를 바꿀 때 결과 개수가 설명 없이 달라진다.
    if (search.trim()) {
      list = list.filter((r) =>
        matchesRequestQuery(
          (r.items as PurchaseItemRow[]) || [],
          page.columns,
          search,
          r.requester?.name || '',
        ),
      );
    }

    list.sort((a, b) => {
      switch (sortKey) {
        case 'updated_asc':
          return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        case 'requester_asc':
          return (a.requester?.name || '').localeCompare(b.requester?.name || '', 'ko');
        case 'item_count_desc':
          return ((b.items as PurchaseItemRow[]).length || 0) - ((a.items as PurchaseItemRow[]).length || 0);
        case 'total_desc': {
          const ta = computeRowsTotalKRW((a.items as PurchaseItemRow[]) || [], page.columns) ?? 0;
          const tb = computeRowsTotalKRW((b.items as PurchaseItemRow[]) || [], page.columns) ?? 0;
          return tb - ta;
        }
        case 'updated_desc':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });

    return list;
  }, [requests, statusFilter, search, sortKey, page.columns, viewMode]);

  // 신청자별로 묶을 때 사용 (그룹 헤더용 — 같은 사람의 다건 신청을 시각적으로 묶음)
  const groupedByRequester = useMemo(() => {
    const map = new Map<string, PurchaseRequestWithRequester[]>();
    for (const r of filteredSorted) {
      const key = r.requester?.id || r.requester_id || 'unknown';
      const arr = map.get(key) || [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.values());
  }, [filteredSorted]);

  // 품목별 통합 뷰 — 모든 신청의 행을 한 표로 펼침
  /**
   * 품목별 뷰의 필터는 **품목 단위**로 건다.
   *
   * `filteredSorted` 는 신청건 단위라 한 행만 맞아도 그 신청이 통째로 통과한다. 신청건별
   * 뷰에서는 그게 맞지만, 품목별 뷰에서 그대로 펼치면 **"GPT" 를 검색했는데 GPT 를 신청한
   * 사람의 다른 품목까지 나온다**(2026-09-02 사용자 보고). 상태 필터도 같은 이유로
   * 품목 상태를 봐야 부분 승인이 제대로 걸러진다.
   *
   * **신청자 이름이 맞으면 그 사람의 품목을 모두 남긴다** — 신청자는 모든 행이 공유하는
   * 속성이라 "이 선생님 것 보기"가 자연스러운 해석이다.
   */
  const flatItems = useMemo(() => {
    const perItem = viewMode === 'per_item';
    const rows = filteredSorted.flatMap((req) =>
      meaningfulRows(req, page.columns)
        .filter((row) => {
          if (!perItem) return true;
          if (!matchesStatusFilter(getItemStatus(req, row.id), statusFilter)) return false;
          return matchesItemQuery(row, page.columns, search, req.requester?.name || '');
        })
        .map((row) => ({ req, row })),
    );
    // 열 정렬은 **여기서** 건다 — 표 안에서 걸면 CSV·공문·전체 선택이 화면과 다른 순서를 쓴다
    return sortFlatItems(rows, itemSort, page.columns, ({ req, row }) =>
      getItemStatus(req, row.id),
    );
  }, [filteredSorted, page.columns, statusFilter, viewMode, search, itemSort]);

  // 쇼핑몰별 그룹 — URL 컬럼의 도메인 기준. 품목 많은 순, '기타'는 맨 뒤
  const shopGroups = useMemo(() => {
    if (!urlColumn) return [];
    const map = new Map<string, { req: PurchaseRequestWithRequester; row: PurchaseItemRow }[]>();
    for (const item of flatItems) {
      const label = shopGroupLabel(parseLinkDisplay(item.row.cells?.[urlColumn.id]));
      const arr = map.get(label) || [];
      arr.push(item);
      map.set(label, arr);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === '기타') return 1;
      if (b[0] === '기타') return -1;
      return b[1].length - a[1].length;
    });
  }, [flatItems, urlColumn]);

  const totalItems = flatItems.length;

  // 품목 수(totalItems)와 **같은 모집단**을 더한다 — 품목별 뷰에서 필터가 걸리면
  // 신청건 합계를 쓰면 "3개 품목 / 합계 68,000원" 처럼 앞뒤가 안 맞는 요약이 나온다.
  const totalPrice = useMemo(
    () =>
      computeRowsTotalKRW(
        flatItems.map((i) => i.row),
        page.columns,
      ),
    [flatItems, page.columns],
  );

  const uniqueRequesters = useMemo(() => {
    const set = new Set<string>();
    for (const r of requests) set.add(r.requester?.id || r.requester_id);
    return set.size;
  }, [requests]);

  // 상태 분포는 필터와 무관하게 전체 기준 — 칩 클릭이 곧 필터.
  // 세는 단위는 보고 있는 뷰를 따른다(품목별 = 품목 수, 그 외 = 신청 건수).
  // 미결 두 상태(제출됨·검토중)는 '처리 대기' 하나로 센다 — 단계 탭 숫자와 같은 정의(utils/statusFilter).
  const statusCounts = useMemo(() => {
    if (viewMode === 'per_item') {
      return countByStatusFilter(
        requests.flatMap((r) => meaningfulRows(r, page.columns).map((row) => getItemStatus(r, row.id))),
      );
    }
    return countByStatusFilter(requests.map((r) => r.status));
  }, [requests, viewMode, page.columns]);

  /**
   * 처음 열 때 처리할 것이 있으면 '처리 대기'만 보여준다(2026-10-13). 매니저가 이 화면에 오는 이유가
   * 대개 "새로 들어온 것 처리"이고, 단계 탭의 ●N 을 보고 왔을 때 같은 N 개가 바로 보여야 한다.
   * **처음 한 번만** — 매니저가 '전체'로 바꾼 뒤 데이터가 다시 읽혀도 되돌리지 않는다.
   */
  const autoFilterDoneRef = useRef(false);
  useEffect(() => {
    if (autoFilterDoneRef.current || isLoading) return;
    autoFilterDoneRef.current = true;
    if (statusCounts.open > 0) setStatusFilter('open');
  }, [isLoading, statusCounts.open]);

  const handleExportCsv = () => {
    const headers = ['신청자', '신청번호', '행번호', ...page.columns.map((c) => c.name), '상태', '최종 수정'];
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    // **화면에 보이는 품목만** 내보낸다 — 내려받은 파일이 화면과 다르면 그게 더 큰 사고다.
    // (신청건 뷰에서는 품목 필터가 걸리지 않으므로 flatItems = 그 신청들의 전 품목)
    const requestOrder = new Map(filteredSorted.map((r, i) => [r.id, i + 1]));
    const rowNoByRequest = new Map<string, number>();
    const lines = [headers.map(escape).join(',')];
    flatItems.forEach(({ req, row }) => {
      const rowNo = (rowNoByRequest.get(req.id) ?? 0) + 1;
      rowNoByRequest.set(req.id, rowNo);
      const cells = page.columns.map((c) => row.cells?.[c.id] ?? '');
      lines.push(
        [
          req.requester?.name || '',
          requestOrder.get(req.id) ?? '',
          rowNo,
          ...cells,
          // 행 단위 CSV 이므로 신청건이 아니라 **그 품목의** 상태를 적는다
          STATUS_LABEL[getItemStatus(req, row.id)],
          fmtDateTime(req.updated_at),
        ]
          .map(escape)
          .join(','),
      );
    });
    const csv = '﻿' + lines.join('\n'); // BOM for Excel Korean
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page.title}-신청내역.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── 일괄 상태 변경 ──────────────────────────────
  // Shift+클릭 = 앵커부터 여기까지를 클릭한 항목의 새 상태로 통일 (파일 탐색기와 동일)
  const toggleSelect = (id: string, shiftKey = false) => {
    setSelectedIds((prev) => {
      const { selected, anchorKey } = toggleWithRange({
        keys: orderedRequestIds,
        selected: prev,
        key: id,
        anchorKey: requestAnchorRef.current,
        shiftKey,
      });
      requestAnchorRef.current = anchorKey;
      return selected;
    });
  };

  // 신청건 Shift 범위의 기준 순서. 신청자별 뷰는 그룹 순서대로 펼친 것이 화면 순서다.
  const orderedRequestIds = useMemo(
    () =>
      viewMode === 'grouped_by_requester'
        ? groupedByRequester.flat().map((r) => r.id)
        : filteredSorted.map((r) => r.id),
    [viewMode, groupedByRequester, filteredSorted],
  );

  const allVisibleSelected =
    filteredSorted.length > 0 && filteredSorted.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(filteredSorted.map((r) => r.id)));
  };

  // ── 품목 선택 (품목별 뷰) ─────────────────────────
  // orderedKeys 는 **클릭이 일어난 표**의 순서다 — 쇼핑몰별 묶기에서는 표가 여러 개라
  // 전체 순서를 쓰면 눈에 보이지 않는 행까지 범위에 들어간다.
  const toggleSelectItem = (key: string, shiftKey = false, orderedKeys: string[] = []) => {
    setSelectedItemKeys((prev) => {
      const { selected, anchorKey } = toggleWithRange({
        keys: orderedKeys,
        selected: prev,
        key,
        anchorKey: itemAnchorRef.current,
        shiftKey,
      });
      itemAnchorRef.current = anchorKey;
      return selected;
    });
  };

  const allItemsSelected =
    flatItems.length > 0 &&
    flatItems.every(({ req, row }) => selectedItemKeys.has(itemKey(req.id, row.id)));

  const toggleSelectAllItems = () => {
    setSelectedItemKeys(
      allItemsSelected
        ? new Set()
        : new Set(flatItems.map(({ req, row }) => itemKey(req.id, row.id))),
    );
  };

  // ── 공문 만들기 ───────────────────────────────────
  // 선택 단위가 뷰마다 다르지만(품목 / 신청건) 공문은 언제나 **품목 목록**을 받는다.
  // 신청건 선택은 여기서 그 신청의 품목 전부로 펼친다.
  const toDocSelection = (): SelectedPurchaseItem[] => {
    if (viewMode === 'per_item') {
      return flatItems
        .filter(({ req, row }) => selectedItemKeys.has(itemKey(req.id, row.id)))
        .map(({ req, row }) => ({
          requestId: req.id,
          requesterName: req.requester?.name || '',
          row,
        }));
    }
    return filteredSorted
      .filter((req) => selectedIds.has(req.id))
      .flatMap((req) =>
        meaningfulRows(req, page.columns).map((row) => ({
          requestId: req.id,
          requesterName: req.requester?.name || '',
          row,
        })),
      );
  };

  /** 선택한 품목을 신청 단위로 묶는다 — items 는 JSONB 라 신청당 한 번만 읽고 쓴다 */
  const selectedItemsByRequest = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const { req, row } of flatItems) {
      if (!selectedItemKeys.has(itemKey(req.id, row.id))) continue;
      const arr = map.get(req.id) || [];
      arr.push(row.id);
      map.set(req.id, arr);
    }
    return map;
  }, [flatItems, selectedItemKeys]);

  /** 일괄 변경 다이얼로그에 보여줄 '현재 물품명' 목록 (표시 순서) */
  const selectedItemNames = useMemo(() => {
    if (!nameColumn) return [];
    return flatItems
      .filter(({ req, row }) => selectedItemKeys.has(itemKey(req.id, row.id)))
      .map(({ row }) => String(row.cells?.[nameColumn.id] ?? ''));
  }, [flatItems, selectedItemKeys, nameColumn]);

  const handleBulkRename = async (value: string) => {
    if (!nameColumn) return;
    setBulkNamePending(true);
    let ok = 0;
    let fail = 0;
    for (const [requestId, rowIds] of selectedItemsByRequest) {
      try {
        const res = await updateItemCell.mutateAsync({
          requestId,
          rowIds,
          columnId: nameColumn.id,
          value,
          pageId: page.id,
        });
        ok += res.updated;
      } catch {
        fail += rowIds.length;
      }
    }
    setBulkNamePending(false);
    setBulkNameOpen(false);
    // 선택은 그대로 둔다 — 방금 바꾼 것을 이어서 공문에 담거나 상태를 바꾸는 흐름이 자연스럽다
    toast({
      title: '물품명 일괄 변경',
      description:
        fail === 0
          ? `품목 ${ok}개의 물품명을 '${value}'(으)로 바꿨습니다.`
          : `${ok}개 성공, ${fail}개 실패했습니다.`,
      variant: fail === 0 ? 'default' : 'destructive',
    });
  };

  /**
   * 선택 → ▲ 품의 차수에 올리기 (대화상자 없이 바로). 선택 단위는 공문과 같다(신청건 선택은
   * 품목으로 펼침). 올린 뒤 선택을 지운다 — 같은 품목을 두 번 올리는 실수를 막는다.
   */
  const addToBatch = useAddToBatch({
    pageId: page.id,
    columns: page.columns,
    batches: orderData?.batches ?? [],
    lines: orderData?.lines ?? [],
    links: orderLinks,
    createdBy: myResourceId ?? null,
  });
  const handleAddToBatch = async (target: string) => {
    const items = toDocSelection();
    if (items.length === 0) {
      toast({ title: '선택된 품목이 없습니다.', variant: 'destructive' });
      return;
    }
    const batchId = await addToBatch.run(target, items);
    if (batchId) {
      setSelectedItemKeys(new Set());
      setSelectedIds(new Set());
    }
  };

  const openOfficialDocument = () => {
    const items = toDocSelection();
    if (items.length === 0) {
      toast({ title: '선택된 품목이 없습니다.', variant: 'destructive' });
      return;
    }
    setDocSelection(items);
    setDocOpen(true);
  };

  const handleBulkApply = async (status: PurchaseRequestStatus, reason: string | null) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkPending(true);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        // rowIds 생략 = 그 신청의 모든 품목
        await updateStatus.mutateAsync({ requestId: id, status, reason, pageId: page.id });
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkPending(false);
    setBulkStatusOpen(false);
    setSelectedIds(new Set());
    toast({
      title: '일괄 상태 변경',
      description:
        fail === 0
          ? `${ok}건을 '${STATUS_LABEL[status]}'(으)로 변경했습니다.`
          : `${ok}건 성공, ${fail}건 실패했습니다.`,
      variant: fail === 0 ? 'default' : 'destructive',
    });
  };

  /**
   * 선택한 **품목들**의 상태를 한 번에 바꾼다 (품목별 뷰).
   * 서버 호출은 신청 단위라 같은 신청의 품목을 묶어 한 번에 보낸다 —
   * 품목마다 호출하면 같은 신청의 meta 를 연속으로 read-modify-write 하게 된다.
   */
  const handleBulkItemApply = async (status: PurchaseRequestStatus, reason: string | null) => {
    if (selectedItemsByRequest.size === 0) return;

    setBulkPending(true);
    let ok = 0;
    let fail = 0;
    for (const [requestId, rowIds] of selectedItemsByRequest) {
      try {
        await updateStatus.mutateAsync({ requestId, status, reason, rowIds, pageId: page.id });
        ok += rowIds.length;
      } catch {
        fail += rowIds.length;
      }
    }
    setBulkPending(false);
    setBulkStatusOpen(false);
    setSelectedItemKeys(new Set());
    toast({
      title: '품목 일괄 상태 변경',
      description:
        fail === 0
          ? `품목 ${ok}개를 '${STATUS_LABEL[status]}'(으)로 변경했습니다.`
          : `${ok}개 성공, ${fail}개 실패했습니다.`,
      variant: fail === 0 ? 'default' : 'destructive',
    });
  };

  const selectionCount = viewMode === 'per_item' ? selectedItemKeys.size : selectedIds.size;

  /** 머리글 클릭 → 오름차순 → 내림차순 → 해제 */
  const handleItemSort = (key: string) => setItemSort((prev) => nextSortState(prev, key));

  /** 액션 바의 [상태 변경] — 보고 있는 뷰의 선택 단위로 갈라진다 */
  const handleBulkStatusApply = (status: PurchaseRequestStatus, reason: string | null) =>
    viewMode === 'per_item' ? handleBulkItemApply(status, reason) : handleBulkApply(status, reason);

  return (
    <Card>
      {/* 툴바 두 줄 (2026-10-13 개편) — 검색 + [보기 ▾] / 상태 필터 + 요약 한 줄.
          종전의 제목·보기 3종 버튼·통계 4칸·정렬·묶기·열·CSV 를 걷어 표를 위로 올렸다.
          설정은 [보기] 메뉴에, 통계는 오른쪽 한 줄 요약에 남아 있다. */}
      <CardHeader className="space-y-2.5 pb-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="물품명·내용·신청자 검색 (쉼표로 여러 개)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <ViewOptionsMenu
            viewMode={viewMode}
            onViewMode={setViewMode}
            sortKey={sortKey}
            onSortKey={setSortKey}
            groupByShop={groupByShop}
            onGroupByShop={setGroupByShop}
            canGroupByShop={viewMode === 'per_item' && !!urlColumn}
            showAllColumns={showAllColumns}
            onShowAllColumns={setShowAllColumns}
            hasHiddenColumns={hasHiddenColumns}
            onExportCsv={handleExportCsv}
          />
        </div>

        {requests.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <StatusFilterPills counts={statusCounts} value={statusFilter} onChange={setStatusFilter} />
            <p className="text-xs tabular-nums text-slate-500">
              신청자 {uniqueRequesters}명 · 신청 {requests.length}건 ·{' '}
              {/* 필터가 걸리면 '전체 7' 옆의 '품목 3개' 가 모순처럼 읽힌다 — 걸러진 수라고 밝힌다 */}
              {statusFilter !== 'all' || search.trim() ? '보이는 품목' : '품목'} {totalItems}개
              {totalPrice !== null && (
                <>
                  {' · '}
                  <span className="font-semibold text-slate-700">{fmtKRW(totalPrice)}</span>
                </>
              )}
            </p>
          </div>
        )}
      </CardHeader>

      <CardContent
        className={`space-y-3 ${
          selectedItemKeys.size > 0 || selectedIds.size > 0 ? "pb-24 md:pb-20" : ""
        }`}
      >
        {/* 선택 액션 바 — 품목별 뷰는 품목, 신청건별·신청자별 뷰는 신청건 단위로 고른다.
            상태 변경이 **고른 단위에만** 적용된다(품목별에서는 형제 품목을 건드리지 않는다).
            바는 화면 아래에 떠 있다 — 흐름에 두면 체크하는 순간 표가 밀려 연속 체크가 어긋난다.
            주된 다음 단계 둘(상태 변경 · 품의에 올리기)만 버튼으로 두고 나머지는 ⋯ 안에 둔다(2026-10-13). */}
        <SelectionActionBar open={selectionCount > 0}>
          <span className="text-sm font-medium text-slate-800">
            {selectionCount}
            {viewMode === 'per_item' ? '개 품목' : '건'} 선택
          </span>
          <Button size="sm" onClick={() => setBulkStatusOpen(true)} className="h-8 bg-blue-600 hover:bg-blue-700">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> 상태 변경
          </Button>
          <AddToBatchMenu
            batches={orderData?.batches ?? []}
            pending={addToBatch.pending}
            onPick={handleAddToBatch}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 w-8 bg-white p-0" aria-label="다른 작업" title="다른 작업">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={openOfficialDocument}>
                <FileText className="mr-2 h-3.5 w-3.5" /> 품의 없이 바로 공문 만들기
              </DropdownMenuItem>
              {/* 물품명 열을 못 찾은 커스텀 페이지에서는 항목 자체를 내지 않는다 */}
              {viewMode === 'per_item' && nameColumn && (
                <DropdownMenuItem onSelect={() => setBulkNameOpen(true)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> 물품명 일괄 변경
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedItemKeys(new Set());
              setSelectedIds(new Set());
            }}
            className="h-8 text-slate-500"
          >
            선택 해제
          </Button>
        </SelectionActionBar>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-500">
            아직 제출된 신청이 없습니다.
          </div>
        ) : filteredSorted.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            {statusFilter === 'open' && !search.trim()
              ? '처리 대기 중인 신청이 없습니다. '
              : '조건에 맞는 신청이 없습니다. '}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setSearch('');
              }}
              className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
            >
              전체 보기
            </button>
          </div>
        ) : viewMode === 'per_item' ? (
          <div className="space-y-3">
            <label className="flex items-center gap-2 px-1 text-xs text-slate-600 cursor-pointer w-fit">
              <Checkbox checked={allItemsSelected} onCheckedChange={toggleSelectAllItems} />
              표시된 품목 전체 선택
            </label>
            {groupByShop && urlColumn ? (
              <div className="space-y-4">
                {shopGroups.map(([label, items]) => {
                  const subtotal = computeRowsTotalKRW(
                    items.map((i) => i.row),
                    page.columns,
                  );
                  return (
                    <div key={label} className="space-y-1.5">
                      <div className="flex items-center gap-2 px-1 flex-wrap">
                        <ShoppingBag className="h-4 w-4 text-blue-600" />
                        <span className="font-semibold text-sm">{label}</span>
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                          {items.length}개 품목
                        </Badge>
                        {subtotal !== null && subtotal > 0 && (
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-semibold">
                            {fmtKRW(subtotal)}
                          </Badge>
                        )}
                      </div>
                      <FlatItemsTable
                        items={items}
                        columns={displayColumns}
                        pageId={page.id}
                        onRowClick={(item) => setDetailRef({ reqId: item.req.id, rowId: item.row.id })}
                        selectedKeys={selectedItemKeys}
                        onToggleSelect={toggleSelectItem}
                        sort={itemSort}
                        onSort={handleItemSort}
                        orderTagByKey={orderTagByKey}
                        {...nameEditProps}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <FlatItemsTable
                items={flatItems}
                columns={displayColumns}
                pageId={page.id}
                onRowClick={(item) => setDetailRef({ reqId: item.req.id, rowId: item.row.id })}
                selectedKeys={selectedItemKeys}
                onToggleSelect={toggleSelectItem}
                sort={itemSort}
                onSort={handleItemSort}
                orderTagByKey={orderTagByKey}
                {...nameEditProps}
              />
            )}
          </div>
        ) : viewMode === 'per_request' ? (
          <div className="space-y-3">
            <label className="flex items-center gap-2 px-1 text-xs text-slate-600 cursor-pointer w-fit">
              <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} />
              표시된 신청 전체 선택
            </label>
            {filteredSorted.map((req, idx) => (
              <RequestTable
                key={req.id}
                request={req}
                index={idx + 1}
                columns={page.columns}
                displayColumns={displayColumns}
                pageId={page.id}
                onDelete={() => handleDeleteRequest(req)}
                onRowClick={(row) => setDetailRef({ reqId: req.id, rowId: row.id })}
                selectable
                selected={selectedIds.has(req.id)}
                onToggleSelect={(shiftKey) => toggleSelect(req.id, shiftKey)}
                {...nameEditProps}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2 px-1 text-xs text-slate-600 cursor-pointer w-fit">
              <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} />
              표시된 신청 전체 선택
            </label>
            {groupedByRequester.map((group) => {
              const first = group[0];
              const groupTotal = group.reduce((sum, req) => {
                const t = computeRowsTotalKRW((req.items as PurchaseItemRow[]) || [], page.columns);
                return sum + (t ?? 0);
              }, 0);
              const groupItemCount = group.reduce(
                (n, req) => n + meaningfulRows(req, page.columns).length,
                0,
              );
              return (
                <div key={first.requester?.id || first.requester_id} className="space-y-2">
                  <div className="flex items-center gap-2 px-1 flex-wrap">
                    <Users className="h-4 w-4 text-emerald-600" />
                    <span className="font-semibold">{first.requester?.name || '—'}</span>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                      신청 {group.length}건 · 항목 {groupItemCount}
                    </Badge>
                    {groupTotal > 0 && (
                      <Badge
                        variant="secondary"
                        className="bg-emerald-50 text-emerald-700 font-semibold"
                      >
                        합계 {fmtKRW(groupTotal)}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2 pl-4 border-l-2 border-emerald-100">
                    {group.map((req, idx) => (
                      <RequestTable
                        key={req.id}
                        request={req}
                        index={idx + 1}
                        columns={page.columns}
                        displayColumns={displayColumns}
                        pageId={page.id}
                        onDelete={() => handleDeleteRequest(req)}
                        onRowClick={(row) => setDetailRef({ reqId: req.id, rowId: row.id })}
                        compactHeader
                        selectable
                        selected={selectedIds.has(req.id)}
                        onToggleSelect={(shiftKey) => toggleSelect(req.id, shiftKey)}
                        {...nameEditProps}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* 품목 전체 내용 다이얼로그 — 표는 핵심 열만 보이므로 행 클릭으로 전부 확인 */}
      <Dialog open={!!detailItem} onOpenChange={(o) => !o && setDetailRef(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap text-base">
              품목 전체 내용
              {detailItem && (
                <ItemStatusBadge
                  req={detailItem.req}
                  row={detailItem.row}
                  pageId={page.id}
                  nameColumnId={nameColumn?.id}
                />
              )}
            </DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <Users className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">{detailItem.req.requester?.name || '—'}</span>
                <span className="text-[11px] text-slate-400 ml-auto">
                  최종 수정 {fmtDateTime(detailItem.req.updated_at)}
                </span>
              </div>

              {(() => {
                // 품목에 붙은 사유가 우선 — 신청 전체 사유는 개별 지정 전 폴백이다
                const entry = getItemStatusEntry(detailItem.req, detailItem.row.id);
                const status = entry?.status ?? detailItem.req.status;
                const reason = entry ? entry.reason : detailItem.req.status_reason;
                if (!reason) return null;
                return (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <span className="font-semibold">{STATUS_LABEL[status]} 사유</span>
                    <span className="mx-1.5">·</span>
                    <span className="whitespace-pre-wrap">{reason}</span>
                    {entry?.by && (
                      <span className="ml-1.5 text-slate-400">— {entry.by}</span>
                    )}
                  </div>
                );
              })()}

              <div className="rounded-lg border divide-y">
                {page.columns.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 px-3 py-2">
                    <span className="w-28 shrink-0 text-xs text-slate-500 pt-0.5">{c.name}</span>
                    <div className="min-w-0 text-sm break-words">
                      {c.id === nameColumn?.id ? (
                        <ItemNameCell
                          value={detailItem.row.cells?.[c.id]}
                          canEdit
                          saving={savingNameKey === itemKey(detailItem.req.id, detailItem.row.id)}
                          onSave={(next) =>
                            handleEditName(detailItem.req.id, detailItem.row.id, next)
                          }
                        />
                      ) : (
                        renderCell(c, detailItem.row.cells?.[c.id])
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <OfficialDocumentDialog
        open={docOpen}
        onOpenChange={setDocOpen}
        page={page}
        selection={docSelection}
      />

      <BulkStatusDialog
        open={bulkStatusOpen}
        onOpenChange={setBulkStatusOpen}
        count={viewMode === 'per_item' ? selectedItemKeys.size : selectedIds.size}
        unitLabel={viewMode === 'per_item' ? '개 품목' : '건'}
        affectsWholeRequest={viewMode !== 'per_item'}
        pending={bulkPending}
        onApply={handleBulkStatusApply}
      />

      <BulkItemNameDialog
        open={bulkNameOpen}
        onOpenChange={setBulkNameOpen}
        currentNames={selectedItemNames}
        pending={bulkNamePending}
        onApply={handleBulkRename}
      />

    </Card>
  );
}

// 품목 행의 품의 표시 — 담기지 않았으면 아무것도 그리지 않는다(빈 칸이 곧 '아직 안 담김')
function OrderTagChip({ tag }: { tag?: OrderTag }) {
  if (!tag) return null;
  const text = `${tag.batchTitle} · ${tag.lineName}`;
  return (
    <span
      className={`mt-1 flex max-w-[180px] items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] ${
        BATCH_STATUS_COLOR[tag.batchStatus]
      }`}
      title={`품의: ${text}`}
    >
      <ClipboardCheck className="h-3 w-3 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────
// 상태 필터 알약 (2026-10-13) — 앱 공통 세그먼트 필터 모양. 활성은 색으로 뜻을 말한다.
// 0개인 상태는 감춘다(누르면 빈 표가 되는 칩을 두지 않는다). 단 지금 고른 칩은 남긴다 —
// 고른 칩이 사라지면 무엇으로 걸러졌는지 화면에서 안 보인다.
// ─────────────────────────────────────────────────
const FILTER_ACTIVE: Record<StatusFilter, string> = {
  all: 'bg-white text-slate-800 shadow-sm',
  open: 'bg-amber-100 text-amber-900 shadow-sm',
  approved: 'bg-emerald-100 text-emerald-900 shadow-sm',
  completed: 'bg-indigo-100 text-indigo-900 shadow-sm',
  rejected: 'bg-rose-100 text-rose-900 shadow-sm',
};

function StatusFilterPills({
  counts,
  value,
  onChange,
}: {
  counts: Record<StatusFilter, number>;
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="상태로 거르기"
      className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-slate-100 bg-slate-100/50 p-1"
    >
      {STATUS_FILTER_OPTIONS.map((opt) => {
        const count = counts[opt.value];
        const active = value === opt.value;
        if (count === 0 && opt.value !== 'all' && !active) return null;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active ? FILTER_ACTIVE[opt.value] : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'
            }`}
          >
            {opt.label}
            <span className={`tabular-nums ${active ? '' : 'text-slate-400'}`}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────
// 품목별 통합 테이블 — 모든 신청의 행을 한 표로 (신청자·상태 컬럼 포함)
// 관리자의 실제 업무 단위는 "주문할 품목"이므로 이 뷰가 기본이다.
// ─────────────────────────────────────────────────
interface FlatItemsTableProps extends NameEditProps {
  items: { req: PurchaseRequestWithRequester; row: PurchaseItemRow }[];
  columns: PurchaseColumn[];
  pageId: string;
  onRowClick?: (item: { req: PurchaseRequestWithRequester; row: PurchaseItemRow }) => void;
  /** 공문에 담을 품목 선택 — 없으면 체크박스 열 자체를 그리지 않는다 */
  selectedKeys?: Set<string>;
  /** orderedKeys = 이 표의 행 순서 (Shift 범위 선택 기준) */
  onToggleSelect?: (key: string, shiftKey: boolean, orderedKeys: string[]) => void;
  /** 열 정렬 — 없으면 머리글이 평범한 글자로 남는다 */
  sort?: SortState | null;
  onSort?: (key: string) => void;
  /** 품목 키 → 담긴 품의 (품의 정리, 2026-10-12). 없으면 표시하지 않는다 */
  orderTagByKey?: Map<string, OrderTag>;
}

// 행 안의 링크·버튼·입력(상태 팝오버, LinkCell, 물품명 편집 등) 클릭은 상세 열기로 취급하지 않는다
const isInteractiveTarget = (e: React.MouseEvent): boolean =>
  !!(e.target as HTMLElement).closest('a, button, input, label, [role="dialog"], [role="checkbox"]');

function FlatItemsTable({
  items,
  columns,
  pageId,
  onRowClick,
  selectedKeys,
  onToggleSelect,
  sort,
  onSort,
  nameColumnId,
  savingKey,
  onEditName,
  orderTagByKey,
}: FlatItemsTableProps) {
  const selectable = !!selectedKeys && !!onToggleSelect;
  const colSpan = columns.length + 3 + (selectable ? 1 : 0);
  // Shift 범위는 **이 표 안에서만** 잡는다
  const orderedKeys = useMemo(
    () => items.map(({ req, row }) => itemKey(req.id, row.id)),
    [items],
  );

  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-auto max-h-[70vh]">
      <table className="w-full text-xs md:text-sm border-collapse">
        <thead>
          <tr className="text-left text-slate-600 border-b">
            {selectable && <th className="sticky top-0 z-10 bg-slate-50 px-2 py-2 w-8" />}
            <th className="sticky top-0 z-10 bg-slate-50 px-2 py-2 w-10">#</th>
            <th className="sticky top-0 z-10 bg-slate-50 px-2 py-2 whitespace-nowrap">
              {onSort ? (
                <SortableHeader sortKey={REQUESTER_SORT_KEY} sort={sort ?? null} onSort={onSort}>
                  신청자
                </SortableHeader>
              ) : (
                <>신청자</>
              )}
            </th>
            {columns.map((c) => (
              <th key={c.id} className="sticky top-0 z-10 bg-slate-50 px-2 py-2 whitespace-nowrap">
                {onSort ? (
                  <SortableHeader
                    sortKey={c.id}
                    sort={sort ?? null}
                    onSort={onSort}
                    align={c.type === 'number' ? 'right' : 'left'}
                  >
                    {c.name}
                  </SortableHeader>
                ) : (
                  c.name
                )}
              </th>
            ))}
            <th className="sticky top-0 z-10 bg-slate-50 px-2 py-2 whitespace-nowrap">
              {onSort ? (
                <SortableHeader sortKey={STATUS_SORT_KEY} sort={sort ?? null} onSort={onSort}>
                  상태
                </SortableHeader>
              ) : (
                <>상태</>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="text-center py-4 text-slate-400">
                품목이 없습니다.
              </td>
            </tr>
          ) : (
            items.map(({ req, row }, idx) => {
              const key = itemKey(req.id, row.id);
              const selected = selectedKeys?.has(key) ?? false;
              return (
                <tr
                  key={key}
                  className={`${
                    selected ? 'bg-blue-50/60' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                  } ${onRowClick ? 'cursor-pointer hover:bg-blue-50/40 transition-colors' : ''}`}
                  title={onRowClick ? '클릭하면 전체 내용을 봅니다' : undefined}
                  onClick={(e) => {
                    if (!onRowClick || isInteractiveTarget(e)) return;
                    onRowClick({ req, row });
                  }}
                >
                  {selectable && (
                    <td className="px-2 py-1.5">
                      <Checkbox
                        checked={selected}
                        // onCheckedChange 는 이벤트를 안 준다 → Shift 판정을 위해 onClick 사용
                        onClick={(e) => onToggleSelect?.(key, e.shiftKey, orderedKeys)}
                        aria-label="품목 선택 (Shift+클릭으로 범위 선택)"
                      />
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-slate-500">{idx + 1}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap font-medium text-slate-800">
                    {req.requester?.name || '—'}
                  </td>
                  {columns.map((c) => (
                    <td key={c.id} className="px-2 py-1.5 align-top">
                      {c.id === nameColumnId && onEditName ? (
                        <ItemNameCell
                          value={row.cells?.[c.id]}
                          canEdit
                          saving={savingKey === key}
                          onSave={(next) => onEditName(req.id, row.id, next)}
                        />
                      ) : (
                        renderCell(c, row.cells?.[c.id])
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <ItemStatusBadge req={req} row={row} pageId={pageId} nameColumnId={nameColumnId} />
                    <OrderTagChip tag={orderTagByKey?.get(key)} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// 품목 1행의 상태 배지 + 변경 팝오버.
// 신청건이 아니라 **이 품목만** 바꾼다 — 신청건 상태는 서버가 나머지 품목까지 보고 파생한다.
function ItemStatusBadge({
  req,
  row,
  pageId,
  nameColumnId,
}: {
  req: PurchaseRequestWithRequester;
  row: PurchaseItemRow;
  pageId: string;
  nameColumnId?: string;
}) {
  const entry = getItemStatusEntry(req, row.id);
  const label = String(row.cells?.[nameColumnId ?? ''] ?? '').trim() || '이 품목';
  return (
    <StatusChangePopover
      requestId={req.id}
      pageId={pageId}
      status={entry?.status ?? req.status}
      reason={entry ? entry.reason : req.status_reason}
      rowIds={[row.id]}
      scopeLabel={label}
      compact
      inherited={!entry}
    />
  );
}

// ─────────────────────────────────────────────────
// 신청 1건 = 표 1개 (헤더 + 항목 표)
// ─────────────────────────────────────────────────
interface RequestTableProps extends NameEditProps {
  request: PurchaseRequestWithRequester;
  index: number;
  /** 전체 컬럼 — 합계 계산용 (가격·개수 컬럼이 표시 열에서 빠져도 합계 유지) */
  columns: PurchaseColumn[];
  /** 표에 실제로 그릴 열 — 미지정 시 전체 */
  displayColumns?: PurchaseColumn[];
  pageId: string;
  onDelete: () => void;
  onRowClick?: (row: PurchaseItemRow) => void;
  compactHeader?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (shiftKey: boolean) => void;
}

function RequestTable({
  request,
  index,
  columns,
  displayColumns,
  pageId,
  onDelete,
  onRowClick,
  compactHeader = false,
  selectable = false,
  selected = false,
  onToggleSelect,
  nameColumnId,
  savingKey,
  onEditName,
}: RequestTableProps) {
  const items = (request.items as PurchaseItemRow[]) || [];
  const total = computeRowsTotalKRW(items, columns);
  const cols = displayColumns ?? columns;
  // 품목 상태가 갈려 있으면 신청건 배지 하나로는 설명이 안 된다 — 분포를 함께 적는다
  const statusSummary = summarizeItemStatuses(request, items);

  return (
    <div
      className={`border rounded-lg bg-white shadow-sm ${
        selected ? 'border-blue-300 ring-1 ring-blue-200' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b bg-slate-50/50 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {selectable && (
            <Checkbox
              checked={selected}
              onClick={(e) => onToggleSelect?.(e.shiftKey)}
              aria-label="신청 선택 (Shift+클릭으로 범위 선택)"
            />
          )}
          {!compactHeader && (
            <>
              <Users className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-medium truncate">{request.requester?.name || '—'}</span>
            </>
          )}
          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
            #{index}
          </Badge>
          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
            {items.length}건
          </Badge>
          {total !== null && (
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-semibold">
              {fmtKRW(total)}
            </Badge>
          )}
          <StatusChangePopover
            requestId={request.id}
            pageId={pageId}
            status={request.status}
            reason={request.status_reason}
            scopeLabel={`이 신청의 품목 ${items.length}개 전체`}
          />
          {statusSummary.mixed && (
            <span className="flex items-center gap-1">
              {STATUS_OPTIONS.map((opt) =>
                statusSummary.counts[opt.value] > 0 ? (
                  <Badge
                    key={opt.value}
                    variant="secondary"
                    className={`${STATUS_COLOR[opt.value]} px-1.5 py-0 text-[10px]`}
                    title={`${opt.label} ${statusSummary.counts[opt.value]}개`}
                  >
                    {opt.label} {statusSummary.counts[opt.value]}
                  </Badge>
                ) : null,
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-slate-500">{fmtDateTime(request.updated_at)}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-slate-600"
                title="신청 관리"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" /> 이 신청 내역 삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs md:text-sm border-collapse">
          <thead>
            <tr className="text-left text-slate-600 border-b bg-slate-50/30">
              <th className="px-2 py-1.5 w-10">#</th>
              {cols.map((c) => (
                <th key={c.id} className="px-2 py-1.5 whitespace-nowrap">
                  {c.name}
                </th>
              ))}
              <th className="px-2 py-1.5 whitespace-nowrap">상태</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={cols.length + 2}
                  className="text-center py-3 text-slate-400"
                >
                  항목이 없습니다.
                </td>
              </tr>
            ) : (
              items.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} ${
                    onRowClick ? 'cursor-pointer hover:bg-blue-50/40 transition-colors' : ''
                  }`}
                  title={onRowClick ? '클릭하면 전체 내용을 봅니다' : undefined}
                  onClick={(e) => {
                    if (!onRowClick || isInteractiveTarget(e)) return;
                    onRowClick(row);
                  }}
                >
                  <td className="px-2 py-1.5 text-slate-500">{idx + 1}</td>
                  {cols.map((c) => (
                    <td key={c.id} className="px-2 py-1.5 align-top">
                      {c.id === nameColumnId && onEditName ? (
                        <ItemNameCell
                          value={row.cells?.[c.id]}
                          canEdit
                          saving={savingKey === itemKey(request.id, row.id)}
                          onSave={(next) => onEditName(request.id, row.id, next)}
                        />
                      ) : (
                        renderCell(c, row.cells?.[c.id])
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 whitespace-nowrap align-top">
                    <ItemStatusBadge
                      req={request}
                      row={row}
                      pageId={pageId}
                      nameColumnId={nameColumnId}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
