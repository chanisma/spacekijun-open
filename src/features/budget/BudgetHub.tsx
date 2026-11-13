// 업무 관리 › 예산 (2026-11-10) — 사업 목록과 사업 상세를 주소로 고른다
//   /tasks/budget                    목록(올해)
//   /tasks/budget?year=2025          다른 해
//   /tasks/budget?project=<id>&tab=  사업 상세(운영·추경·일정·기록)
// 설계 = docs/plans/2026-11-10-budget-management.md
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, Plus, AlertTriangle, Eye, Clock, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';
import {
  daysLeftInFiscal, fiscalProgress, fiscalYearOf, percent, projectFigures, won, type PlanLike,
} from './model/budgetMath';
import { displayProjectName } from './model/parseBudgetCard';
import { useBudgetProjects, useBudgetYears } from './hooks/useBudget';
import { KIND_LABEL, type BudgetProjectSummary } from './types';
import { BudgetBar, BudgetLegend } from './components/BudgetBar';
import { CardUploadDialog } from './components/CardUploadDialog';
import { ProjectFormDialog } from './components/ProjectFormDialog';
import { ProjectView } from './components/ProjectView';
import { KIND_TONE } from './model/tones';

type Scope = 'mine' | 'all';

export function BudgetHub({ onGuide }: { onGuide?: () => void }) {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = useMemo(() => new Date(), []);
  const currentYear = fiscalYearOf(today);
  const year = Number(params.get('year')) || currentYear;
  const projectId = params.get('project');
  const [scope, setScope] = useState<Scope>('mine');
  const [purposeOnly, setPurposeOnly] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: projects = [], isLoading } = useBudgetProjects(year);
  const { data: years = [] } = useBudgetYears();
  const { data: lastYearProjects = [] } = useBudgetProjects(year - 1);
  const yearOptions = [...new Set([currentYear + 1, currentYear, ...years, year])].sort((a, b) => b - a);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k); else next.set(k, v);
    }
    setParams(next, { replace: false });
  };

  if (projectId) {
    return (
      <ProjectView
        projectId={projectId}
        yearProjects={projects}
        today={today}
        tab={params.get('tab')}
        onTabChange={(t) => setParam({ tab: t === 'ops' ? null : t })}
        onBack={() => setParam({ project: null, tab: null })}
      />
    );
  }

  const visible = projects
    .filter((p) => (scope === 'mine' ? !!p.myRole : true))
    .filter((p) => (purposeOnly ? p.kind === 'purpose' : true));
  const progress = fiscalProgress(year, today);
  const daysLeft = daysLeftInFiscal(year, today);
  const mineCount = projects.filter((p) => p.myRole).length;

  return (
    <div className="space-y-4">
      {/* 머리글 = 필터·동작만(기능명·아이콘 없음, UI 규약 §1) */}
      <div className="rounded-xl border border-slate-200/70 bg-white px-2 py-2 shadow-[0_1px_2px_0_rgb(15_23_42/0.04)] sm:px-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setParam({ year: Number(v) === currentYear ? null : v })}>
            <SelectTrigger className="h-8 w-32 text-xs sm:text-sm" aria-label="학년도"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}학년도</SelectItem>)}
            </SelectContent>
          </Select>
          {isAdmin && (
            <div className="flex gap-1 rounded-lg border border-slate-100 bg-slate-100/50 p-1" role="group" aria-label="범위">
              {(['mine', 'all'] as Scope[]).map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={scope === s}
                  onClick={() => setScope(s)}
                  className={cn('h-7 px-2 text-xs sm:px-3', scope === s ? 'bg-white font-medium text-blue-700 shadow-sm hover:bg-white' : 'text-slate-500')}
                >
                  {s === 'mine' ? `내 사업 ${mineCount}` : `전체 ${projects.length}`}
                </Button>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={purposeOnly}
            onClick={() => setPurposeOnly((v) => !v)}
            className={cn('h-8 px-2 text-xs', purposeOnly ? 'bg-violet-50 text-violet-700 hover:bg-violet-50' : 'text-slate-500')}
          >
            목적사업만
          </Button>
          <div className="ml-auto flex items-center gap-1.5">
            {/* 사용 방법 = 액션 묶음 맨 왼쪽(앱 전역 규약) */}
            {onGuide && (
              <Button variant="ghost" size="sm" onClick={onGuide} title="사용 방법" className="h-8 shrink-0 gap-1.5 px-2 text-xs text-slate-500 hover:text-slate-700">
                <HelpCircle className="h-3.5 w-3.5" /><span className="hidden lg:inline">사용 방법</span>
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setUploadOpen(true)}>
              <FileSpreadsheet className="h-3.5 w-3.5" />사업관리카드 올리기
            </Button>
            <Button size="sm" className="h-8 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">사업 만들기</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <BudgetLegend progressLabel={`오늘 진도 ${percent(progress)}`} />
        {year === currentYear && <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Clock className="h-3 w-3" />회계연도 마감까지 {daysLeft}일</span>}
      </div>

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
      ) : visible.length === 0 ? (
        <EmptyState year={year} hasOthers={projects.length > visible.length} onUpload={() => setUploadOpen(true)} onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} progress={progress} daysLeft={year === currentYear ? daysLeft : null}
              onOpen={() => setParam({ project: p.id })} />
          ))}
        </div>
      )}

      <CardUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        year={year}
        projects={projects}
        onDone={(ids) => { if (ids.length === 1) setParam({ project: ids[0] }); }}
      />
      <ProjectFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        year={year}
        previousYearProjects={lastYearProjects.filter((p) => p.myRole)}
        onCreated={(id) => setParam({ project: id })}
      />
    </div>
  );
}

function ProjectCard({ project, progress, daysLeft, onOpen }: {
  project: BudgetProjectSummary; progress: number; daysLeft: number | null; onOpen: () => void;
}) {
  const plansByLine = new Map<string, PlanLike[]>();
  for (const p of project.plans) plansByLine.set(p.line_id, [...(plansByLine.get(p.line_id) ?? []), p]);
  const fig = projectFigures(project.lines, plansByLine);
  const returnRisk = project.kind === 'purpose' && fig.unassigned > 0;
  const behind = fig.executionRate + 0.15 < progress && fig.budget > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-w-0 flex-col gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-[0_1px_2px_0_rgb(15_23_42/0.04)] transition hover:border-blue-200 hover:shadow-sm"
    >
      <div className="flex min-w-0 items-start gap-2">
        <Badge variant="outline" className={cn('mt-0.5 h-5 shrink-0 px-1.5 text-[10px]', KIND_TONE[project.kind])}>{KIND_LABEL[project.kind]}</Badge>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900 group-hover:text-blue-700" title={project.name}>{displayProjectName(project.name)}</div>
          <div className="truncate text-[11px] text-slate-500">
            {project.group_name ?? project.department ?? ''}{project.lines.length ? `${project.group_name || project.department ? ' · ' : ''}${project.lines.length}줄` : ''}
            {project.lastImportAt ? ` · 카드 ${new Date(project.lastImportAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}` : ''}
          </div>
        </div>
        {!project.myRole && <Badge variant="outline" className="h-5 shrink-0 gap-1 px-1.5 text-[10px] text-slate-500"><Eye className="h-3 w-3" />읽기</Badge>}
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums text-slate-900">{won(fig.budget)}</div>
          <div className="text-[11px] tabular-nums text-slate-500">집행 {percent(fig.executionRate)}</div>
        </div>
      </div>
      <BudgetBar budget={fig.budget} wonin={fig.wonin} remainingPlan={fig.remainingPlan} progress={progress} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-slate-500">
        <span>원인행위 <b className="font-medium text-slate-700">{won(fig.wonin)}</b></span>
        <span>남은 계획 <b className="font-medium text-blue-700">{won(fig.remainingPlan)}</b></span>
        <span>{fig.unassigned < 0 ? '계획 초과' : '미배정'} <b className={cn('font-medium', fig.unassigned < 0 ? 'text-rose-600' : 'text-slate-700')}>{won(Math.abs(fig.unassigned))}</b></span>
        {returnRisk && daysLeft !== null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">
            <AlertTriangle className="h-3 w-3" />계획 없는 돈 — {daysLeft}일 뒤 반납
          </span>
        )}
        {behind && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">진도보다 집행이 늦음</span>}
        {fig.pendingLines > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">결재 대기 {fig.pendingLines}줄</span>}
      </div>
    </button>
  );
}

function EmptyState({ year, hasOthers, onUpload, onCreate }: { year: number; hasOthers: boolean; onUpload: () => void; onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
      <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-700">{year}학년도에 맡은 사업이 없습니다</p>
      <p className="mt-1 text-xs text-slate-500">
        에듀파인에서 «사업관리카드(예산)»를 엑셀로 받아 올리면 사업과 산출내역, 품의·원인행위 금액이 한 번에 들어옵니다.
        {hasOthers && ' (관리자 «전체»에는 다른 사업이 있습니다)'}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button size="sm" className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={onUpload}><FileSpreadsheet className="h-3.5 w-3.5" />사업관리카드 올리기</Button>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={onCreate}><Plus className="h-3.5 w-3.5" />직접 만들기</Button>
      </div>
    </div>
  );
}
