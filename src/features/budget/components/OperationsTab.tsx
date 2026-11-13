// 사업 상세 › 운영 (2026-11-10) — 산출내역 표 + 줄을 펼치면 계획 항목
// 숫자는 모두 budgetMath 가 계산한다. 카드에서 온 값은 회색, 손으로 고친 값은 점(다음 카드 반영 때 덮인다).
// 입력칸은 바뀐 값만 blur 에 저장(구매 신청 «품의 정리» OrderSheet 와 같은 규약), Esc = 되돌리기.
import { Fragment, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, Lock, LockOpen, MoreHorizontal, Plus, Trash2, AlertTriangle, CircleDot, Link2, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  fiscalMonths, lineFigures, planTiming, won, type PlanStatus,
} from '../model/budgetMath';
import { createLine, createPlan, deleteLine, deletePlan, orderAmount, unlinkOrderLine, updateLine, updatePlan } from '../services/budgetService';
import { useBudgetMutation } from '../hooks/useBudget';
import { PLAN_STATUS_LABEL, type BudgetLine, type BudgetOrderLink, type BudgetPlanItem, type BudgetProjectDetail } from '../types';
import { BATCH_STATUS_LABEL } from '../model/tones';
import { BudgetBar } from './BudgetBar';
import { OrderLinkDialog } from './OrderLinkDialog';

const NO_MONTH = '__none__';

const STATUS_TONE: Record<PlanStatus, string> = {
  planned: 'border-slate-200 bg-slate-50 text-slate-600',
  in_order: 'border-blue-200 bg-blue-50 text-blue-700',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-600 line-through',
};

/** 숫자 입력 — 쉼표 표시, blur 에 바뀐 값만 저장 */
export function AmountInput({ value, onCommit, disabled, className, ariaLabel }: {
  value: number; onCommit: (n: number) => void; disabled?: boolean; className?: string; ariaLabel: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? won(value);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(/[^\d-]/g, ''));
    setDraft(null);
    if (Number.isFinite(n) && n !== value) onCommit(Math.max(0, Math.round(n)));
  };
  return (
    <Input
      inputMode="numeric"
      aria-label={ariaLabel}
      disabled={disabled}
      value={shown}
      onFocus={(e) => { setDraft(String(value)); requestAnimationFrame(() => e.target.select()); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setDraft(null); (e.target as HTMLInputElement).blur(); }
      }}
      className={cn('h-8 text-right text-[16px] tabular-nums sm:text-sm', className)}
    />
  );
}

function TextInput({ value, onCommit, disabled, placeholder, ariaLabel }: {
  value: string; onCommit: (s: string) => void; disabled?: boolean; placeholder?: string; ariaLabel: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      aria-label={ariaLabel}
      disabled={disabled}
      placeholder={placeholder}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return;
        const t = draft.trim();
        setDraft(null);
        if (t && t !== value) onCommit(t);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setDraft(null); (e.target as HTMLInputElement).blur(); }
      }}
      className="h-8 min-w-0 text-[16px] sm:text-sm"
    />
  );
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${y.slice(2)}년 ${Number(m)}월`;
}

interface Props {
  detail: BudgetProjectDetail;
  canEdit: boolean;
  today: Date;
}

export function OperationsTab({ detail, canEdit, today }: Props) {
  const { project, lines, plans, orderLinks } = detail;
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [linkPlan, setLinkPlan] = useState<BudgetPlanItem | null>(null);
  const linksByPlan = useMemo(() => {
    const m = new Map<string, BudgetOrderLink[]>();
    for (const l of orderLinks) if (l.plan_item_id) m.set(l.plan_item_id, [...(m.get(l.plan_item_id) ?? []), l]);
    return m;
  }, [orderLinks]);
  const plansByLine = useMemo(() => {
    const m = new Map<string, BudgetPlanItem[]>();
    for (const p of plans) m.set(p.line_id, [...(m.get(p.line_id) ?? []), p]);
    return m;
  }, [plans]);
  const months = useMemo(() => fiscalMonths(project.fiscal_year), [project.fiscal_year]);

  const lineUpdate = useBudgetMutation(({ id, patch }: { id: string; patch: Parameters<typeof updateLine>[1] }) => updateLine(id, patch));
  const lineCreate = useBudgetMutation(() => createLine({ project_id: project.id, name: '새 산출내역', sort_order: lines.length + 1 }));
  const lineDelete = useBudgetMutation((id: string) => deleteLine(id), { success: () => '산출내역을 지웠습니다' });
  const planCreate = useBudgetMutation((line: BudgetLine) => createPlan({
    project_id: project.id, line_id: line.id, title: '새 계획', amount: 0,
    planned_month: months.find((m) => m >= `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`) ?? null,
    sort_order: (plansByLine.get(line.id)?.length ?? 0) + 1,
  }));
  const planUpdate = useBudgetMutation(({ id, patch }: { id: string; patch: Parameters<typeof updatePlan>[1] }) => updatePlan(id, patch));
  const planDelete = useBudgetMutation((id: string) => deletePlan(id));
  const orderUnlink = useBudgetMutation((orderLineId: string) => unlinkOrderLine(orderLineId));
  const planListProps = {
    months, year: project.fiscal_year, today, canEdit, linksByPlan,
    onUpdate: (id: string, patch: Parameters<typeof updatePlan>[1]) => planUpdate.mutate({ id, patch }),
    onDelete: (id: string) => planDelete.mutate(id),
    onLinkOrder: (p: BudgetPlanItem) => setLinkPlan(p),
    onUnlinkOrder: (orderLineId: string) => orderUnlink.mutate(orderLineId),
  };

  const toggle = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (!lines.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        산출내역이 없습니다. 사업관리카드를 올리거나{canEdit ? ' 아래에서 직접 더하세요.' : ' 담당자가 등록할 때까지 기다려 주세요.'}
        {canEdit && (
          <div className="mt-3">
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => lineCreate.mutate(undefined)}>
              <Plus className="h-3.5 w-3.5" />산출내역 더하기
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 휴대폰 — 줄마다 카드(표는 가로로 밀려 산출내역 이름이 잘린다, 2026-11-10 스크린샷) */}
      <ul className="space-y-2 sm:hidden">
        {lines.map((line) => {
          const linePlans = plansByLine.get(line.id) ?? [];
          const f = lineFigures(line, linePlans);
          const expanded = open.has(line.id);
          return (
            <li key={line.id} className={cn('rounded-xl border border-slate-200 bg-white px-3 py-2.5', line.closed && 'bg-slate-50/70')}>
              <button type="button" onClick={() => toggle(line.id)} aria-expanded={expanded} className="flex w-full min-w-0 items-start gap-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800">{line.name}</span>
                  <span className="block text-[11px] text-slate-400">
                    {line.expense_item ?? '직접 등록'}{line.closed ? ' · 마감' : ''}{line.missing_from_card ? ' · 카드에 없음' : ''}
                    {linePlans.length ? ` · 계획 ${linePlans.filter((p) => p.status !== 'cancelled').length}` : ''}
                  </span>
                </span>
                {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
              </button>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
                <div className="flex justify-between"><dt className="text-slate-500">예산</dt><dd>{won(f.budget)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">원인행위</dt><dd>{won(f.wonin)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">남은 계획</dt><dd className="text-blue-700">{won(f.remainingPlan)}</dd></div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">{f.unassigned < 0 ? '계획 초과' : '미배정'}</dt>
                  <dd className={cn('font-medium', f.unassigned < 0 ? 'text-rose-600' : 'text-slate-800')}>{won(Math.abs(f.unassigned))}</dd>
                </div>
              </dl>
              {f.pending > 0 && <p className="mt-1 text-[11px] text-amber-700">결재 대기 {won(f.pending)}</p>}
              <BudgetBar className="mt-2" budget={f.budget} wonin={f.wonin} remainingPlan={f.remainingPlan} height="sm" />
              {expanded && (
                <div className="mt-2 space-y-2 border-t border-dashed border-slate-100 pt-2">
                  <PlanList {...planListProps} plans={linePlans} closed={line.closed} onAdd={() => planCreate.mutate(line)} />
                  {canEdit && (
                    <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-slate-600" onClick={() => lineUpdate.mutate({ id: line.id, patch: { closed: !line.closed } })}>
                      {line.closed ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}{line.closed ? '마감 풀기' : '마감 — 더 쓸 계획 없음'}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white sm:block">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-slate-50/80 text-[11px] font-medium text-slate-500">
            <tr>
              <th className="w-8" />
              <th className="px-2 py-2 text-left">산출내역</th>
              <th className="w-28 px-2 py-2 text-right">예산현액</th>
              <th className="w-28 px-2 py-2 text-right">품의</th>
              <th className="w-28 px-2 py-2 text-right">원인행위</th>
              <th className="w-28 px-2 py-2 text-right">남은 계획</th>
              <th className="w-28 px-2 py-2 text-right">미배정</th>
              <th className="w-36 px-2 py-2">집행</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const linePlans = plansByLine.get(line.id) ?? [];
              const f = lineFigures(line, linePlans);
              const expanded = open.has(line.id);
              const fromCard = line.origin === 'card';
              return (
                <Fragment key={line.id}>
                  <tr className={cn('border-t border-slate-100 align-middle', line.closed && 'bg-slate-50/60 text-slate-500')}>
                    <td className="pl-2">
                      <button
                        type="button"
                        onClick={() => toggle(line.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-expanded={expanded}
                        aria-label={`${line.name} 계획 ${expanded ? '접기' : '펼치기'}`}
                      >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="max-w-0 px-2 py-1.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {fromCard || !canEdit ? (
                          <span className="truncate font-medium text-slate-800" title={line.name}>{line.name}</span>
                        ) : (
                          <TextInput value={line.name} ariaLabel="산출내역 이름" onCommit={(name) => lineUpdate.mutate({ id: line.id, patch: { name } })} />
                        )}
                        {line.closed && <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] text-slate-500">마감</Badge>}
                        {line.missing_from_card && (
                          <Badge variant="outline" className="h-5 shrink-0 border-amber-200 px-1.5 text-[10px] text-amber-700" title="마지막으로 올린 카드에 없던 줄입니다">카드에 없음</Badge>
                        )}
                        {linePlans.length > 0 && !expanded && (
                          <span className="shrink-0 text-[11px] text-slate-400">계획 {linePlans.filter((p) => p.status !== 'cancelled').length}</span>
                        )}
                      </div>
                      <div className="truncate text-[11px] text-slate-400">{line.expense_item ?? (fromCard ? '' : '직접 등록')}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fromCard || !canEdit ? won(f.budget) : (
                        <AmountInput value={line.budget_amount} ariaLabel="예산현액" onCommit={(n) => lineUpdate.mutate({ id: line.id, patch: { budget_amount: n } })} />
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                      {won(f.pumui)}
                      {f.pending > 0 && <div className="text-[10px] text-amber-600" title="품의했지만 아직 원인행위가 되지 않은 금액">대기 {won(f.pending)}</div>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {line.manual_override && <CircleDot className="h-3 w-3 text-amber-500" aria-label="손으로 고친 값 — 다음 카드 반영 때 카드 값으로 바뀝니다" />}
                        {won(f.wonin)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-blue-700">{f.remainingPlan ? won(f.remainingPlan) : <span className="text-slate-300">—</span>}</td>
                    <td className={cn('px-2 py-1.5 text-right font-medium tabular-nums', f.unassigned < 0 ? 'text-rose-600' : f.unassigned > 0 ? 'text-slate-800' : 'text-slate-300')}>
                      {f.unassigned < 0 && <AlertTriangle className="mr-1 inline h-3 w-3" aria-label="계획이 예산을 넘었습니다" />}
                      {won(f.unassigned)}
                    </td>
                    <td className="px-2 py-1.5">
                      <BudgetBar budget={f.budget} wonin={f.wonin} remainingPlan={f.remainingPlan} height="sm" />
                    </td>
                    <td className="pr-2">
                      {canEdit && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" aria-label={`${line.name} 메뉴`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => lineUpdate.mutate({ id: line.id, patch: { closed: !line.closed } })}>
                              {line.closed ? <LockOpen className="mr-2 h-3.5 w-3.5" /> : <Lock className="mr-2 h-3.5 w-3.5" />}
                              {line.closed ? '마감 풀기' : '마감 — 더 쓸 계획 없음'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { planCreate.mutate(line); setOpen((p) => new Set(p).add(line.id)); }}>
                              <Plus className="mr-2 h-3.5 w-3.5" />계획 더하기
                            </DropdownMenuItem>
                            {!fromCard && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-rose-600 focus:text-rose-700"
                                  onClick={() => {
                                    if (window.confirm(`«${line.name}» 줄과 그 계획 ${linePlans.length}개를 지울까요?`)) lineDelete.mutate(line.id);
                                  }}
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />산출내역 지우기
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-t border-dashed border-slate-100 bg-slate-50/40">
                      <td />
                      <td colSpan={8} className="px-2 py-2">
                        <PlanList {...planListProps} plans={linePlans} closed={line.closed} onAdd={() => planCreate.mutate(line)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-slate-600" onClick={() => lineCreate.mutate(undefined)}>
          <Plus className="h-3.5 w-3.5" />산출내역 직접 더하기
        </Button>
      )}
      <OrderLinkDialog open={!!linkPlan} onOpenChange={(o) => { if (!o) setLinkPlan(null); }} projectId={project.id} plan={linkPlan} />
    </div>
  );
}

function PlanList({ plans, months, year, today, canEdit, closed, linksByPlan, onAdd, onUpdate, onDelete, onLinkOrder, onUnlinkOrder }: {
  plans: BudgetPlanItem[];
  months: string[];
  year: number;
  today: Date;
  canEdit: boolean;
  closed: boolean;
  linksByPlan: Map<string, BudgetOrderLink[]>;
  onAdd: () => void;
  onUpdate: (id: string, patch: Parameters<typeof updatePlan>[1]) => void;
  onDelete: (id: string) => void;
  onLinkOrder: (plan: BudgetPlanItem) => void;
  onUnlinkOrder: (orderLineId: string) => void;
}) {
  if (!plans.length) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-1 text-xs text-slate-500">
        {closed ? '마감된 줄입니다 — 계획은 남은 돈 계산에 넣지 않습니다.' : '아직 계획이 없습니다. 남은 돈은 모두 «미배정»으로 셉니다.'}
        {canEdit && !closed && (
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={onAdd}><Plus className="h-3 w-3" />계획 더하기</Button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {closed && <p className="text-[11px] text-slate-500">마감된 줄 — 아래 계획은 남은 돈 계산에 넣지 않습니다.</p>}
      <ul className="space-y-1">
        {plans.map((p) => {
          const timing = planTiming(p, year, today);
          const actions = (plan: BudgetPlanItem) => (
            <>
              <Button variant="ghost" size="icon" className="h-11 w-11 text-slate-400 hover:text-blue-600 sm:h-8 sm:w-8" aria-label={`${plan.title} 에 품의 품목 잇기`} title="품의 품목 잇기" onClick={() => onLinkOrder(plan)}>
                <Link2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-11 w-11 text-slate-400 hover:text-rose-600 sm:h-8 sm:w-8" aria-label={`${plan.title} 지우기`} onClick={() => onDelete(plan.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          );
          return (
            // 휴대폰 = [이름 · 잇기 · 지우기] 한 줄 + [금액 · 월 · 상태] 한 줄(셋이 1/3씩),
            // 넓은 화면 = 한 줄(sm:contents 로 안쪽 묶음을 펼치고, 단추는 맨 끝 칸에)
            <li key={p.id} className="grid min-w-0 gap-1.5 rounded-lg bg-white p-1.5 sm:grid-cols-[minmax(0,1fr)_7.5rem_7rem_6.5rem_4.25rem] sm:items-center sm:bg-transparent sm:p-0">
              <div className="flex min-w-0 items-center gap-1 sm:contents">
                <div className="min-w-0 flex-1">
                  {canEdit ? (
                    <TextInput value={p.title} ariaLabel="계획 항목" onCommit={(title) => onUpdate(p.id, { title })} />
                  ) : (
                    <span className="block truncate text-sm text-slate-700" title={p.title}>{p.title}</span>
                  )}
                </div>
                {canEdit && <div className="flex shrink-0 sm:hidden">{actions(p)}</div>}
              </div>
              <div className="grid min-w-0 grid-cols-3 gap-1.5 sm:contents">
              {canEdit ? (
                <AmountInput value={p.amount} ariaLabel="계획 금액" onCommit={(amount) => onUpdate(p.id, { amount })} />
              ) : (
                <span className="text-right text-sm tabular-nums">{won(p.amount)}</span>
              )}
              <Select
                value={p.planned_month ?? NO_MONTH}
                onValueChange={(v) => onUpdate(p.id, { planned_month: v === NO_MONTH ? null : v })}
                disabled={!canEdit}
              >
                <SelectTrigger
                  className={cn('h-8 text-xs', timing === 'overdue' && 'border-amber-300 text-amber-700', timing === 'outOfYear' && 'border-rose-300 text-rose-600')}
                  aria-label="예정 월"
                  title={timing === 'overdue' ? '지난 달인데 아직 «계획» 상태입니다' : timing === 'outOfYear' ? '회계연도 밖입니다 — 2월 말까지 써야 합니다' : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MONTH}>월 미정</SelectItem>
                  {months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
                  {p.planned_month && !months.includes(p.planned_month) && (
                    <SelectItem value={p.planned_month}>{monthLabel(p.planned_month)} (회계연도 밖)</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Select value={p.status} onValueChange={(v) => onUpdate(p.id, { status: v as PlanStatus })} disabled={!canEdit}>
                <SelectTrigger className={cn('h-8 border text-xs', STATUS_TONE[p.status])} aria-label="계획 상태"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PLAN_STATUS_LABEL) as PlanStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{PLAN_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>
              <div className="hidden items-center justify-end sm:flex">{canEdit && actions(p)}</div>
              {(linksByPlan.get(p.id) ?? []).length > 0 && (
                <ul className="flex flex-wrap gap-1 sm:col-span-5">
                  {(linksByPlan.get(p.id) ?? []).map((l) => {
                    const amount = orderAmount(l.order);
                    return (
                      <li key={l.order_line_id} className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-blue-100 bg-blue-50/60 py-0.5 pl-2 pr-0.5 text-[11px] text-blue-800">
                        {l.order ? (
                          <Link to={`/purchase-requests/${l.order.page_id}`} className="min-w-0 truncate hover:underline" title={`${l.order.page_title ?? ''} · ${l.order.batch_title ?? ''}`}>
                            품의 · {l.order.name}{amount !== null ? ` ${won(amount)}` : ''} · {BATCH_STATUS_LABEL[l.order.batch_status ?? ''] ?? l.order.batch_status}
                          </Link>
                        ) : <span className="text-slate-500">품의 품목(볼 수 없음)</span>}
                        {canEdit && (
                          <button type="button" onClick={() => onUnlinkOrder(l.order_line_id)} className="flex h-6 w-6 items-center justify-center rounded-full text-blue-400 hover:bg-blue-100 hover:text-blue-700" aria-label="품의 연결 끊기">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && !closed && (
        <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-slate-600" onClick={onAdd}><Plus className="h-3 w-3" />계획 더하기</Button>
      )}
    </div>
  );
}
