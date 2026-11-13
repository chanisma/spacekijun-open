import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Loader2, ShoppingCart } from 'lucide-react';
import { useMyPurchaseRequestsAllPages, MyPurchaseRequestWithPage } from '../hooks/usePurchaseRequests';
import {
  PurchaseItemRow,
  PurchaseRequestStatus,
  computeRowsTotalKRW,
  summarizeItemNames,
} from '../types';
import { STATUS_COLOR, STATUS_LABEL, STATUS_OPTIONS } from '../purchaseRequestStatus';
import { summarizeItemStatuses } from '../utils/itemStatus';
import { PeriodBadge } from './PeriodBadge';
import { fmtDateTime, fmtKRW } from '../utils/format';

interface MyRequestsBoardProps {
  /** 게시판 헤더 검색창 공유 — 페이지 제목·품목 내용으로 필터 */
  searchQuery?: string;
}

// 게시판 메인의 "내 신청 모아보기" — 어떤 글에 뭘 신청했고 지금 어떤 상태인지를
// 페이지를 하나씩 열지 않고 한 화면에서 확인한다. 행 클릭 = 해당 글의 내 신청 탭으로.
export function MyRequestsBoard({ searchQuery = '' }: MyRequestsBoardProps) {
  const navigate = useNavigate();
  const { data: myRequests = [], isLoading } = useMyPurchaseRequestsAllPages();

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return myRequests;
    const q = searchQuery.toLowerCase();
    return myRequests.filter((r) => {
      if ((r.page?.title || '').toLowerCase().includes(q)) return true;
      const columns = r.page?.columns || [];
      return ((r.items as PurchaseItemRow[]) || []).some((row) =>
        columns.some((c) => {
          const v = row.cells?.[c.id];
          return v !== undefined && String(v).toLowerCase().includes(q);
        }),
      );
    });
  }, [myRequests, searchQuery]);

  // 페이지별 묶음 — 최근 수정 신청이 있는 페이지가 위로 (조회가 updated_at desc라 삽입 순서 유지)
  const groups = useMemo(() => {
    const map = new Map<string, MyPurchaseRequestWithPage[]>();
    for (const r of filtered) {
      const key = r.page?.id || r.page_id;
      const arr = map.get(key) || [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.values());
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const counts = {} as Record<PurchaseRequestStatus, number>;
    for (const r of filtered) counts[r.status] = (counts[r.status] || 0) + 1;
    return counts;
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ShoppingCart className="h-12 w-12 text-slate-300 mb-3" />
        <p className="text-sm text-slate-500">
          {searchQuery ? '검색 결과가 없습니다.' : '아직 제출한 구매 신청이 없습니다.'}
        </p>
        {!searchQuery && (
          <p className="text-xs text-slate-400 mt-1">
            신청 페이지 탭에서 진행 중인 글에 들어가 신청할 수 있습니다.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 상태 요약 칩 */}
      <div className="flex items-center gap-1.5 flex-wrap px-1">
        <span className="text-xs text-slate-500">
          총 <span className="font-semibold text-slate-700">{filtered.length}건</span>
        </span>
        {STATUS_OPTIONS.map((opt) => {
          const count = statusCounts[opt.value] || 0;
          if (count === 0) return null;
          return (
            <span
              key={opt.value}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[opt.value]}`}
            >
              {opt.label} {count}
            </span>
          );
        })}
      </div>

      {groups.map((group) => {
        const page = group[0].page;
        const pageId = page?.id || group[0].page_id;
        return (
          <div key={pageId} className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {/* 페이지(글) 헤더 */}
            <button
              type="button"
              onClick={() => navigate(`/purchase-requests/${pageId}?tab=mine`)}
              className="w-full flex items-center gap-2 px-3 py-2.5 border-b bg-slate-50/50 hover:bg-slate-100/70 transition-colors text-left flex-wrap"
            >
              <span className="font-medium text-sm text-slate-900 truncate">
                {page?.title || '(삭제된 페이지)'}
              </span>
              {page && (
                <PeriodBadge
                  periodStart={page.period_start}
                  periodEnd={page.period_end}
                  archived={page.is_archived}
                  showDday
                />
              )}
              <span className="ml-auto text-[11px] text-slate-400 inline-flex items-center gap-0.5 shrink-0">
                글 열기 <ChevronRight className="h-3 w-3" />
              </span>
            </button>

            {/* 내 신청 행들 */}
            <div className="divide-y divide-slate-100">
              {group.map((req) => {
                const columns = req.page?.columns || [];
                const rows = (req.items as PurchaseItemRow[]) || [];
                const summary = summarizeItemNames(rows, columns);
                const total = computeRowsTotalKRW(rows, columns);
                return (
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => navigate(`/purchase-requests/${pageId}?tab=mine`)}
                    className="w-full px-3 py-2 hover:bg-blue-50/40 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className={`${STATUS_COLOR[req.status]} shrink-0`}>
                        {STATUS_LABEL[req.status]}
                      </Badge>
                      <span className="text-sm text-slate-800 truncate">
                        {summary || '품목 미입력'}
                      </span>
                      {summarizeItemStatuses(req, rows).mixed && (
                        <span className="shrink-0 text-[11px] text-slate-500">품목별 처리</span>
                      )}
                      <span className="text-xs text-slate-500 shrink-0">
                        {rows.length}개 품목
                        {total !== null && total > 0 && (
                          <>
                            {' · '}
                            <span className="font-semibold text-emerald-700">{fmtKRW(total)}</span>
                          </>
                        )}
                      </span>
                      <span className="ml-auto text-[11px] text-slate-400 shrink-0">
                        {fmtDateTime(req.updated_at)}
                      </span>
                    </div>
                    {req.status_reason && (
                      <p className="mt-1 text-xs text-slate-500 truncate">
                        <span className="font-medium">{STATUS_LABEL[req.status]} 사유</span> ·{' '}
                        {req.status_reason}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
