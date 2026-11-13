/**
 * 받은/보낸 수업 교체·대체 요청 목록.
 *
 * 디자인 규약 = `src/components/tasks/dialogDesign.tsx` (마이크로 라벨·상태는 색으로).
 *
 * 2026-08-14 오버홀: 8열 표 → 카드 행. 표는 좁은 화면에서 열이 뭉개졌고,
 * 정작 중요한 정보(누가·언제·무엇을)가 10px 글씨로 밀려 있었다.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  ArrowLeftRight,
  CalendarClock,
  FileText,
  Inbox,
  Loader2,
  Send,
  Stamp,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { ClassSwap } from '@/types/classSwap';
import { SwapApprovalDialog } from './SwapApprovalDialog';
import { SwapDocumentDialog } from './SwapDocumentDialog';
import { useCancelClassSwap } from '@/hooks/useClassSwapMutations';
import { NotificationService } from '@/services/notificationService';
// 결재는 2026-09-03 부터 전자서명 시스템이 흡수했다(구 approval 모듈은 남아 있으나 미사용)
import { SignatureSubjectList } from '@/features/e-signature/components/SignatureSubjectList';
import { useSignatureRequestsBySubject } from '@/features/e-signature';
import { myTurn as signatureMyTurn } from '@/features/e-signature/lib/signatureFlow';
import { isMyTurn } from '@/features/approval/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/hooks/useProfile';

/** 보강 계획서 결재의 대상 타입 — `features/approval/registry.tsx`에 등록된 값 */
const SWAP_DOCUMENT_SUBJECT = 'timetable.swap_document';

const WEEKDAY_LABELS = ['', '월', '화', '수', '목', '금', '토', '일'];
const PAGE_SIZE = 10;

const STATUS_META: Record<ClassSwap['status'], { label: string; className: string }> = {
  pending: { label: '대기', className: 'bg-amber-50 text-amber-700 ring-amber-100' },
  approved: { label: '승인', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  rejected: { label: '거절', className: 'bg-rose-50 text-rose-700 ring-rose-100' },
  cancelled: { label: '취소', className: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export function SwapRequestList() {
  const { resourceId } = useCurrentResourceId();
  const queryClient = useQueryClient();
  const [selectedSwap, setSelectedSwap] = useState<ClassSwap | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [selectedSwapIds, setSelectedSwapIds] = useState<Set<string>>(new Set());
  const incomingObserverRef = useRef<HTMLDivElement>(null);
  const outgoingObserverRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'incoming' | 'outgoing' | 'documents'>('incoming');

  const cancelSwapMutation = useCancelClassSwap();

  // 결재 탭 배지 = "내가 결재할 차례인" 건수. 받은 요청 탭이 대기 건수를 다는 것과 같은 기준
  // (배지는 눌러야 할 이유를 뜻한다). 목록 자체와 같은 캐시를 쓰므로 요청이 늘지 않는다.
  const { user } = useAuth();
  const { profile } = useProfile();
  const { data: swapDocSignatures = [] } = useSignatureRequestsBySubject(SWAP_DOCUMENT_SUBJECT);
  const myTurnDocs = useMemo(
    () => swapDocSignatures.filter((r) => signatureMyTurn(
      r.signers.map((s) => ({
        id: s.id, orderIndex: s.orderIndex, roleLabel: s.roleLabel,
        signerUserId: s.signerUserId, signerName: s.signerName,
        status: s.status, fields: s.fields,
      })),
      r.status,
      { userId: user?.id ?? null, name: profile?.name ?? null },
    ).isMyTurn).length,
    [swapDocSignatures, user?.id, profile?.name]
  );

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['swap-requests', resourceId],
    // v5 는 initialPageParam 이 있어야 pageParam 타입이 number 로 좁혀진다
    // (없으면 unknown 이라 아래 산술이 전부 타입 오류였다).
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<{ swaps: ClassSwap[]; nextPage: number | null }> => {
      if (!resourceId) return { swaps: [], nextPage: null };

      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await (supabase as any)
        .from('class_swap')
        .select('*', { count: 'exact' })
        .or(`requester_resource_id.eq.${resourceId},approver_resource_id.eq.${resourceId}`)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('교체 요청 조회 오류:', error);
        throw error;
      }

      const hasMore = count ? to < count - 1 : false;

      return { swaps: data as ClassSwap[], nextPage: hasMore ? pageParam + 1 : null };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!resourceId,
    refetchInterval: 30000,
  });

  const allSwaps = useMemo(() => data?.pages.flatMap((page) => page.swaps) ?? [], [data]);

  const incomingRequests = useMemo(
    () => allSwaps.filter((swap) => swap.approver_resource_id === resourceId),
    [allSwaps, resourceId]
  );
  const outgoingRequests = useMemo(
    () => allSwaps.filter((swap) => swap.requester_resource_id === resourceId),
    [allSwaps, resourceId]
  );
  const pendingIncoming = useMemo(
    () => incomingRequests.filter((swap) => swap.status === 'pending').length,
    [incomingRequests]
  );

  useEffect(() => {
    // 결재 탭은 무한 스크롤 대상이 아니다(별도 쿼리). 비활성 TabsContent는 언마운트되므로
    // ref가 비어 있어도 안전하지만, 어느 탭이 관측 대상인지는 명시해 둔다.
    const observerRef =
      activeTab === 'incoming'
        ? incomingObserverRef
        : activeTab === 'outgoing'
          ? outgoingObserverRef
          : null;
    const target = observerRef?.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.unobserve(target);
  }, [activeTab, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleApproveRequest = (swap: ClassSwap) => {
    setSelectedSwap(swap);
    setApprovalDialogOpen(true);
  };

  const handleCancelRequest = (swap: ClassSwap) => {
    cancelSwapMutation.mutate(swap.id, {
      onSuccess: async () => {
        try {
          await NotificationService.notifyClassSwapCancelled(
            swap.id,
            swap.approver_resource_id,
            swap.meta.requester_name || '',
            swap.meta.requester_section_name || '',
            swap.meta.approver_section_name || '',
            swap.approver_swap_date
          );
        } catch (notificationError) {
          console.error('Failed to send notification:', notificationError);
        }
      },
    });
  };

  const handleToggleSwapSelection = (swapId: string) => {
    setSelectedSwapIds((prev) => {
      const next = new Set(prev);
      if (next.has(swapId)) next.delete(swapId);
      else next.add(swapId);
      return next;
    });
  };

  const selectedSwaps = useMemo(
    () => outgoingRequests.filter((swap) => selectedSwapIds.has(swap.id)),
    [outgoingRequests, selectedSwapIds]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        교체 요청을 불러오는 중
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'incoming' | 'outgoing' | 'documents')}
        className="flex h-full flex-col"
      >
        {/* 좁은 화면에서는 문서 버튼이 탭을 밀어 글자를 뭉갠다 → 아래 줄로 내린다 */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <TabsList className="grid h-9 w-full grid-cols-3 bg-slate-100 p-1 sm:w-auto sm:flex-1">
            <TabsTrigger
              value="incoming"
              className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Inbox className="h-3.5 w-3.5" />
              받은 요청
              {pendingIncoming > 0 && (
                <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold tabular-nums text-amber-700">
                  {pendingIncoming}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="outgoing"
              className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Send className="h-3.5 w-3.5" />
              보낸 요청
              <span className="tabular-nums text-slate-400">{outgoingRequests.length}</span>
            </TabsTrigger>
            <TabsTrigger
              value="documents"
              className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Stamp className="h-3.5 w-3.5" />
              결재 문서
              {myTurnDocs > 0 && (
                <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold tabular-nums text-amber-700">
                  {myTurnDocs}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {activeTab === 'outgoing' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDocumentDialogOpen(true)}
              disabled={selectedSwapIds.size === 0}
              className="h-9 w-full shrink-0 gap-1.5 text-xs sm:w-auto"
            >
              <FileText className="h-3.5 w-3.5" />
              보강 계획서
              {selectedSwapIds.size > 0 && (
                <span className="tabular-nums">({selectedSwapIds.size})</span>
              )}
            </Button>
          )}
        </div>

        <TabsContent value="incoming" className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {incomingRequests.length === 0 ? (
            <EmptyState icon={Inbox} label="받은 교체 요청이 없습니다" />
          ) : (
            <>
              <ul className="space-y-1.5">
                {incomingRequests.map((swap) => (
                  <SwapRow
                    key={swap.id}
                    swap={swap}
                    variant="incoming"
                    onApprove={handleApproveRequest}
                  />
                ))}
              </ul>
              <div ref={incomingObserverRef} className="h-4" />
              {isFetchingNextPage && <LoadingMore />}
            </>
          )}
        </TabsContent>

        <TabsContent value="outgoing" className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {outgoingRequests.length === 0 ? (
            <EmptyState icon={Send} label="보낸 교체 요청이 없습니다" />
          ) : (
            <>
              <p className="mb-2 px-0.5 text-[11px] text-slate-400">
                왼쪽 체크박스로 고른 요청을 보강 계획서로 만들 수 있습니다.
              </p>
              <ul className="space-y-1.5">
                {outgoingRequests.map((swap) => (
                  <SwapRow
                    key={swap.id}
                    swap={swap}
                    variant="outgoing"
                    onCancel={handleCancelRequest}
                    selected={selectedSwapIds.has(swap.id)}
                    onToggleSelection={handleToggleSwapSelection}
                    cancelling={cancelSwapMutation.isPending}
                  />
                ))}
              </ul>
              <div ref={outgoingObserverRef} className="h-4" />
              {isFetchingNextPage && <LoadingMore />}
            </>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <SignatureSubjectList
            subjectType={SWAP_DOCUMENT_SUBJECT}
            emptyHint="'보낸 요청' 탭에서 교체 건을 고른 뒤 [보강 계획서] → [결재 상신]으로 올릴 수 있습니다."
          />
        </TabsContent>
      </Tabs>

      {selectedSwap && (
        <SwapApprovalDialog
          open={approvalDialogOpen}
          onOpenChange={setApprovalDialogOpen}
          swap={selectedSwap}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['swap-requests'] });
          }}
        />
      )}

      <SwapDocumentDialog
        open={documentDialogOpen}
        onOpenChange={setDocumentDialogOpen}
        selectedSwaps={selectedSwaps}
      />
    </div>
  );
}

/* ────────────────────────────── 부품 ────────────────────────────── */

function LoadingMore() {
  return (
    <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-400">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      더 불러오는 중
    </div>
  );
}

function EmptyState({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-4 w-4 text-slate-400" />
      </span>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

interface SwapRowProps {
  swap: ClassSwap;
  variant: 'incoming' | 'outgoing';
  onApprove?: (swap: ClassSwap) => void;
  onCancel?: (swap: ClassSwap) => void;
  selected?: boolean;
  onToggleSelection?: (swapId: string) => void;
  cancelling?: boolean;
}

function SwapRow({
  swap,
  variant,
  onApprove,
  onCancel,
  selected,
  onToggleSelection,
  cancelling,
}: SwapRowProps) {
  const isSubstitute = swap.meta.type === 'substitute';
  const status = STATUS_META[swap.status] ?? STATUS_META.pending;
  const counterpart = variant === 'incoming' ? swap.meta.requester_name : swap.meta.approver_name;

  return (
    <li className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-slate-300">
      <div className="flex items-start gap-2.5">
        {variant === 'outgoing' && (
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelection?.(swap.id)}
            aria-label="보강 계획서에 포함"
            className="mt-0.5 h-4 w-4 shrink-0"
          />
        )}

        <span
          className={cn(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            isSubstitute ? 'bg-indigo-50 text-indigo-500' : 'bg-blue-50 text-blue-500'
          )}
          title={isSubstitute ? '대체' : '교체'}
        >
          {isSubstitute ? (
            <UserCheck className="h-3.5 w-3.5" />
          ) : (
            <ArrowLeftRight className="h-3.5 w-3.5" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium text-slate-800">
              {counterpart} 선생님
            </span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1',
                status.className
              )}
            >
              {status.label}
            </span>
            {/* 결강에서 온 요청 — 개인일정은 "개인 사정" 까지만 말한다(내용은 싣지 않는다) */}
            {swap.meta.absence_kind && (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-100">
                {swap.meta.absence_kind === 'personal' ? '개인 사정' : '출장'}
              </span>
            )}
          </div>

          <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
            <SlotLine
              date={swap.requester_swap_date}
              weekday={swap.requester_original_weekday}
              period={swap.requester_original_period}
              subject={swap.meta.requester_section_name}
            />
            {!isSubstitute && (
              <SlotLine
                date={swap.approver_swap_date}
                weekday={swap.approver_original_weekday}
                period={swap.approver_original_period}
                subject={swap.meta.approver_section_name}
              />
            )}
          </div>

          {(swap.meta.reason || (swap.status === 'rejected' && swap.meta.rejection_reason)) && (
            <div className="mt-1.5 space-y-0.5">
              {swap.meta.reason && (
                <p className="truncate text-[11px] text-slate-500" title={swap.meta.reason}>
                  <span className="font-medium text-slate-600">사유</span> {swap.meta.reason}
                </p>
              )}
              {swap.status === 'rejected' && swap.meta.rejection_reason && (
                <p
                  className="truncate text-[11px] text-rose-500"
                  title={swap.meta.rejection_reason}
                >
                  <span className="font-medium">거절</span> {swap.meta.rejection_reason}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0">
          {variant === 'incoming' && (
            <Button
              onClick={() => onApprove?.(swap)}
              size="sm"
              variant="ghost"
              className={cn(
                'h-7 px-2 text-xs',
                swap.status === 'pending'
                  ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                  : 'text-slate-500 hover:bg-slate-100'
              )}
            >
              {swap.status === 'pending' ? '검토' : '보기'}
            </Button>
          )}
          {variant === 'outgoing' && (swap.status === 'pending' || swap.status === 'approved') && (
            <Button
              onClick={() => onCancel?.(swap)}
              size="sm"
              variant="ghost"
              disabled={cancelling}
              className="h-7 gap-1 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <XCircle className="h-3 w-3" />
              취소
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function SlotLine({
  date,
  weekday,
  period,
  subject,
}: {
  date: string;
  weekday: number;
  period: number;
  subject?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <CalendarClock className="h-3 w-3 shrink-0 text-slate-300" />
      <span className="whitespace-nowrap tabular-nums">
        {format(new Date(date), 'M/d', { locale: ko })} ({WEEKDAY_LABELS[weekday]}) {period}교시
      </span>
      <span className="truncate" title={subject}>
        {subject}
      </span>
    </div>
  );
}
