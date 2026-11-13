// 계획 항목 ↔ 품의 품목 잇기 (2026-11-10, P3)
// 구매 신청 «품의 정리»에서 만든 품목을 고른다(내가 담당인 페이지의 것만 보인다 — RLS). 이으면 계획이 «품의 중»,
// 그 차수가 «구매 완료»가 되면 «완료»로 DB 트리거가 바꾼다(budget_plan_status_from_link · budget_sync_plans_from_batch).
// 구매 신청 화면·표는 건드리지 않는다.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link2, Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import { won } from '../model/budgetMath';
import { fetchOrderLineCandidates, linkOrderLines, orderAmount } from '../services/budgetService';
import { useBudgetMutation } from '../hooks/useBudget';
import type { BudgetPlanItem } from '../types';
import { BATCH_STATUS_LABEL } from '../model/tones';

export function OrderLinkDialog({ open, onOpenChange, projectId, plan }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  plan: BudgetPlanItem | null;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const candidatesQ = useQuery({ queryKey: ['budget', 'order-candidates'], queryFn: fetchOrderLineCandidates, enabled: open });
  const save = useBudgetMutation(() => linkOrderLines({
    projectId, lineId: plan!.line_id, planItemId: plan!.id, orderLineIds: [...picked],
  }), { success: () => `품의 품목 ${picked.size}개를 이었습니다` });

  const list = useMemo(() => {
    const q = query.trim();
    return (candidatesQ.data ?? []).filter((c) => !q || `${c.name} ${c.page_title ?? ''} ${c.batch_title ?? ''} ${c.vendor ?? ''}`.includes(q));
  }, [candidatesQ.data, query]);
  const pickedSum = list.filter((c) => picked.has(c.id)).reduce((s, c) => s + (orderAmount(c) ?? 0), 0);

  const close = (o: boolean) => {
    if (!o) { setPicked(new Set()); setQuery(''); }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2">
            <TitleIconChip icon={Link2} />
            <DialogTitle className="min-w-0 truncate text-base">«{plan?.title}» 에 품의 품목 잇기</DialogTitle>
          </div>
          <DialogDescription className="pt-1 text-xs">
            구매 신청 «품의 정리»의 품목을 고르세요. 이으면 계획이 «품의 중»이 되고, 그 차수가 «구매 완료»가 되면 «완료»로 바뀝니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 px-4 py-3 sm:px-6">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="품명·페이지·차수·구매처로 찾기" className="h-10 pl-8 text-[16px] sm:text-sm" />
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
            {candidatesQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />불러오는 중</div>
            ) : list.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                이을 품의 품목이 없습니다. 구매 신청 페이지의 «품의 정리»에서 품목을 만든 뒤 이을 수 있습니다(내가 담당인 페이지만 보입니다).
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.map((c) => {
                  const amount = orderAmount(c);
                  const checked = picked.has(c.id);
                  return (
                    <li key={c.id}>
                      <label className={cn('flex min-h-[48px] cursor-pointer items-center gap-2.5 px-3 py-2', c.linked && 'opacity-60')}>
                        <Checkbox
                          checked={checked}
                          disabled={c.linked}
                          onCheckedChange={(v) => setPicked((prev) => { const n = new Set(prev); if (v === true) n.add(c.id); else n.delete(c.id); return n; })}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-800" title={c.name}>{c.name}</span>
                          <span className="block truncate text-[11px] text-slate-500">
                            {c.page_title} · {c.batch_title} ({BATCH_STATUS_LABEL[c.batch_status ?? ''] ?? c.batch_status}){c.vendor ? ` · ${c.vendor}` : ''}{c.linked ? ' · 이미 이어짐' : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-slate-700">{amount !== null ? won(amount) : '금액 없음'}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {picked.size > 0 && (
            <p className="text-xs text-slate-600">
              고른 품목 {picked.size}개 · 합계 <b className="tabular-nums">{won(pickedSum)}</b>원 {plan && pickedSum !== plan.amount && `(계획 ${won(plan.amount)}원과 ${won(Math.abs(pickedSum - plan.amount))}원 차이)`}
            </p>
          )}
        </div>
        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`} onClick={() => close(false)}>닫기</Button>
          <Button
            className="h-8 gap-1.5 bg-blue-600 px-3 text-xs hover:bg-blue-700"
            disabled={!picked.size || save.isPending || !plan}
            onClick={() => save.mutate(undefined, { onSuccess: () => close(false) })}
          >
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}잇기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
