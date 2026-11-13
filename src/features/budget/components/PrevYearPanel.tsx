// 작년 참고 (2026-11-10, P5) — 작년 같은 사업의 줄별 예산·최종 원인행위·계획을 옆에 두고, 계획을 골라 가져온다.
// 사용자 결정: «작년 사업을 기본적으로 참고, 원하면 전체 혹은 부분을 가져온다. 기본 출발은 사업관리카드 올리기».
// 계보 = budget_project.rolled_over_from(업무 «지난 업무 가져오기»와 같은 발상). 없으면 같은 열쇠(card_key)의 작년 사업을 찾아 잇자고 권한다.
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, History, Import, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { won } from '../model/budgetMath';
import { displayProjectName, normalizeCardName } from '../model/parseBudgetCard';
import { createPlan, updateProject } from '../services/budgetService';
import { useBudgetMutation, useBudgetProject, useBudgetProjects } from '../hooks/useBudget';
import { PLAN_STATUS_LABEL, type BudgetPlanItem, type BudgetProjectDetail } from '../types';

/** 'YYYY-MM-01' → 1년 뒤 */
function nextYearMonth(m: string | null): string | null {
  if (!m) return null;
  return `${Number(m.slice(0, 4)) + 1}${m.slice(4)}`;
}

export function PrevYearPanel({ detail, canEdit }: { detail: BudgetProjectDetail; canEdit: boolean }) {
  const { project, lines } = detail;
  const [open, setOpen] = useState(false);
  const prevId = project.rolled_over_from;
  const { data: prev } = useBudgetProject(prevId);
  const { data: lastYear = [] } = useBudgetProjects(project.fiscal_year - 1);
  const suggestion = !prevId
    ? lastYear.find((p) => (p.card_key ?? normalizeCardName(p.name)) === (project.card_key ?? normalizeCardName(project.name)))
    : null;

  const connect = useBudgetMutation((id: string) => updateProject(project.id, { rolled_over_from: id }), { success: () => '작년 사업과 이었습니다' });
  const importPlans = useBudgetMutation(async (items: { plan: BudgetPlanItem; lineId: string }[]) => {
    for (const { plan, lineId } of items) {
      await createPlan({
        project_id: project.id, line_id: lineId, title: plan.title, amount: plan.amount, planned_month: nextYearMonth(plan.planned_month),
      });
    }
    return items.length;
  }, { success: (n) => `작년 계획 ${n}개를 가져왔습니다(상태는 «계획»)` });

  // 작년 줄 → 올해 줄(이름 정규화로 짝)
  const matchOf = useMemo(() => {
    const m = new Map<string, string>();
    if (!prev) return m;
    for (const pl of prev.lines) {
      const hit = lines.find((l) => normalizeCardName(l.name) === normalizeCardName(pl.name));
      if (hit) m.set(pl.id, hit.id);
    }
    return m;
  }, [prev, lines]);

  if (!prevId) {
    if (!suggestion || !canEdit) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        <History className="h-3.5 w-3.5 text-slate-400" />
        작년({project.fiscal_year - 1}) 같은 사업 «{displayProjectName(suggestion.name)}»이 있습니다.
        <Button size="sm" variant="outline" className="ml-auto h-8 gap-1.5 text-xs" onClick={() => connect.mutate(suggestion.id)}>
          <Link2 className="h-3.5 w-3.5" />작년 사업과 잇기
        </Button>
      </div>
    );
  }
  if (!prev) return null;

  const plansByLine = new Map<string, BudgetPlanItem[]>();
  for (const p of prev.plans) if (p.status !== 'cancelled') plansByLine.set(p.line_id, [...(plansByLine.get(p.line_id) ?? []), p]);
  const importable = prev.plans
    .filter((p) => p.status !== 'cancelled' && matchOf.has(p.line_id))
    .map((plan) => ({ plan, lineId: matchOf.get(plan.line_id)! }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        <History className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-sm font-medium text-slate-700">작년 참고</span>
        <span className="min-w-0 truncate text-xs text-slate-500">
          {prev.project.fiscal_year} · {displayProjectName(prev.project.name)} · 예산 {won(prev.lines.reduce((s, l) => s + l.budget_amount, 0))} · 원인행위 {won(prev.lines.reduce((s, l) => s + l.wonin, 0))}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-100 px-3 py-2">
          {canEdit && importable.length > 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => importPlans.mutate(importable)} disabled={importPlans.isPending}>
                <Import className="h-3.5 w-3.5" />작년 계획 전체 가져오기 ({importable.length})
              </Button>
            </div>
          )}
          <ul className="divide-y divide-slate-100">
            {prev.lines.map((pl) => {
              const target = matchOf.get(pl.id);
              const lp = plansByLine.get(pl.id) ?? [];
              return (
                <li key={pl.id} className="py-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className={cn('min-w-0 truncate font-medium', target ? 'text-slate-800' : 'text-slate-400')} title={pl.name}>{pl.name}</span>
                    <span className="tabular-nums text-slate-500">예산 {won(pl.budget_amount)} · 원인행위 {won(pl.wonin)} ({pl.budget_amount ? Math.round((pl.wonin / pl.budget_amount) * 100) : 0}%)</span>
                    {!target && <span className="text-[11px] text-slate-400">올해 같은 줄 없음</span>}
                    {canEdit && target && lp.length > 0 && (
                      <Button size="sm" variant="ghost" className="ml-auto h-8 gap-1 text-xs text-blue-700"
                        onClick={() => importPlans.mutate(lp.map((plan) => ({ plan, lineId: target })))}>
                        <Import className="h-3 w-3" />이 줄 계획 가져오기
                      </Button>
                    )}
                  </div>
                  {lp.length > 0 && (
                    <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-slate-500">
                      {lp.map((p) => (
                        <li key={p.id} className="flex min-w-0 gap-2">
                          <span className="w-12 shrink-0">{p.planned_month ? `${Number(p.planned_month.slice(5, 7))}월` : '월 미정'}</span>
                          <span className="min-w-0 truncate">{p.title}</span>
                          <span className="ml-auto shrink-0 tabular-nums">{won(p.amount)} · {PLAN_STATUS_LABEL[p.status]}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
