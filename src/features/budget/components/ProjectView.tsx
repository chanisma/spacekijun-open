// 사업 상세 (2026-11-10) — 숫자 넷 + 탭(운영 · 추경 · 일정 · 기록)
import { useState } from 'react';
import {
  ArrowLeft, FileSpreadsheet, MoreHorizontal, Pencil, Trash2, Users, Eye, Archive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  daysLeftInFiscal, fiscalProgress, percent, projectFigures, won,
} from '../model/budgetMath';
import { displayProjectName } from '../model/parseBudgetCard';
import { deleteProject, updateProject } from '../services/budgetService';
import { useBudgetMutation, useBudgetProject } from '../hooks/useBudget';
import { KIND_LABEL, type BudgetPlanItem, type BudgetProjectSummary } from '../types';
import { BudgetBar, BudgetLegend } from './BudgetBar';
import { OperationsTab } from './OperationsTab';
import { RevisionTab } from './RevisionTab';
import { ScheduleTab } from './ScheduleTab';
import { HistoryTab } from './HistoryTab';
import { MembersDialog } from './MembersDialog';
import { CardUploadDialog } from './CardUploadDialog';
import { ProjectFormDialog } from './ProjectFormDialog';
import { WorkLinksRow } from './WorkLinksRow';
import { PrevYearPanel } from './PrevYearPanel';
import { KIND_TONE } from '../model/tones';

const TAB_VALUES = ['ops', 'revision', 'schedule', 'history'] as const;
type TabValue = (typeof TAB_VALUES)[number];

export function ProjectView({ projectId, yearProjects, onBack, today, tab, onTabChange }: {
  projectId: string;
  yearProjects: BudgetProjectSummary[];
  onBack: () => void;
  today: Date;
  tab: string | null;
  onTabChange: (tab: string) => void;
}) {
  const { data: detail, isLoading, error } = useBudgetProject(projectId);
  const [membersOpen, setMembersOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const remove = useBudgetMutation(() => deleteProject(projectId), { success: () => '사업을 지웠습니다' });
  const archive = useBudgetMutation((archived: boolean) => updateProject(projectId, { archived }), {
    success: (_, archived) => (archived ? '사업을 보관했습니다' : '보관을 풀었습니다'),
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (error || !detail) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
        <p>사업을 찾지 못했습니다. 지워졌거나 담당자가 아닐 수 있습니다.</p>
        <Button size="sm" variant="outline" onClick={onBack}>목록으로</Button>
      </div>
    );
  }

  const { project, lines, plans, members, imports } = detail;
  const canEdit = !!detail.myRole;
  const plansByLine = new Map<string, BudgetPlanItem[]>();
  for (const p of plans) plansByLine.set(p.line_id, [...(plansByLine.get(p.line_id) ?? []), p]);
  const fig = projectFigures(lines, plansByLine);
  const progress = fiscalProgress(project.fiscal_year, today);
  const daysLeft = daysLeftInFiscal(project.fiscal_year, today);
  const owner = members.find((m) => m.role === 'owner');
  const activeTab: TabValue = (TAB_VALUES as readonly string[]).includes(tab ?? '') ? (tab as TabValue) : 'ops';

  return (
    <div className="space-y-4">
      {/* 머리글 — 기능명·아이콘 없이 사업과 동작만 (UI 규약 §1) */}
      <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-3 shadow-[0_1px_2px_0_rgb(15_23_42/0.04)] sm:px-4">
        <div className="flex flex-wrap items-start gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-slate-500" onClick={onBack} aria-label="사업 목록으로">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={cn('h-5 shrink-0 px-1.5 text-[10px]', KIND_TONE[project.kind])}>{KIND_LABEL[project.kind]}</Badge>
              <h2 className="min-w-0 truncate text-base font-semibold text-slate-900" title={project.name}>{displayProjectName(project.name)}</h2>
              {!canEdit && <Badge variant="outline" className="h-5 shrink-0 gap-1 px-1.5 text-[10px] text-slate-500"><Eye className="h-3 w-3" />읽기 전용</Badge>}
              {project.archived && <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">보관됨</Badge>}
            </div>
            <p className="truncate text-xs text-slate-500">
              {project.fiscal_year}학년도{project.group_name ? ` · ${project.group_name}` : ''}{project.department ? ` · ${project.department}` : ''}
              {owner?.name ? ` · 담당 ${owner.name}` : ''}{members.length > 1 ? ` 외 ${members.length - 1}명` : ''}
              {imports[0] ? ` · 카드 ${imports[0].card_date ?? new Date(imports[0].imported_at).toLocaleDateString('ko-KR')}` : ' · 카드 없음'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {canEdit && (
              <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => setUploadOpen(true)}>
                <FileSpreadsheet className="h-3.5 w-3.5" /><span className="hidden sm:inline">카드 올리기</span>
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-slate-600" onClick={() => setMembersOpen(true)}>
              <Users className="h-3.5 w-3.5" /><span className="hidden sm:inline">담당자</span>
            </Button>
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-500" aria-label="사업 메뉴"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-3.5 w-3.5" />사업 정보 고치기</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => archive.mutate(!project.archived)}>
                    <Archive className="mr-2 h-3.5 w-3.5" />{project.archived ? '보관 풀기' : '보관 — 목록에서 숨기기'}
                  </DropdownMenuItem>
                  {detail.myRole === 'owner' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-rose-600 focus:text-rose-700"
                        onClick={() => {
                          if (window.confirm(`«${displayProjectName(project.name)}» 사업과 산출내역·계획·추경 기록을 모두 지울까요? 되돌릴 수 없습니다.`)) {
                            remove.mutate(undefined, { onSuccess: onBack });
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />사업 지우기
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="mt-2 pl-11"><WorkLinksRow projectId={project.id} canEdit={canEdit} /></div>

        {/* 숫자 넷 */}
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kpi label="예산현액" value={won(fig.budget)} sub={project.kind === 'purpose' ? '목적사업 — 총액 고정' : undefined} />
          <Kpi label="원인행위" value={won(fig.wonin)} sub={`집행률 ${percent(fig.executionRate)} · 진도 ${percent(progress)}`}
            tone={fig.executionRate + 0.15 < progress ? 'warn' : undefined} />
          <Kpi label="남은 계획" value={won(fig.remainingPlan)} sub={fig.pending ? `결재 대기 ${won(fig.pending)}` : undefined} tone="plan" />
          <Kpi
            label={fig.unassigned < 0 ? '계획 초과' : '미배정'}
            value={won(Math.abs(fig.unassigned))}
            sub={project.kind === 'purpose' && fig.unassigned > 0 ? `${daysLeft}일 안에 계획 없으면 반납` : fig.unassigned < 0 ? `${fig.overPlannedLines}줄이 예산을 넘음` : undefined}
            tone={fig.unassigned < 0 ? 'danger' : project.kind === 'purpose' && fig.unassigned > 0 ? 'warn' : undefined}
          />
        </div>
        <div className="mt-3 space-y-1.5">
          <BudgetBar budget={fig.budget} wonin={fig.wonin} remainingPlan={fig.remainingPlan} progress={progress} />
          <BudgetLegend progressLabel={`오늘 진도 ${percent(progress)} · 마감까지 ${daysLeft}일`} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="h-9">
          <TabsTrigger value="ops" className="text-xs sm:text-sm">운영</TabsTrigger>
          <TabsTrigger value="revision" className="text-xs sm:text-sm">추경</TabsTrigger>
          <TabsTrigger value="schedule" className="text-xs sm:text-sm">일정</TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm">기록</TabsTrigger>
        </TabsList>
        <TabsContent value="ops" className="mt-3 space-y-3">
          <OperationsTab detail={detail} canEdit={canEdit} today={today} />
          <PrevYearPanel detail={detail} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="revision" className="mt-3"><RevisionTab detail={detail} canEdit={canEdit} /></TabsContent>
        <TabsContent value="schedule" className="mt-3"><ScheduleTab detail={detail} today={today} /></TabsContent>
        <TabsContent value="history" className="mt-3"><HistoryTab detail={detail} /></TabsContent>
      </Tabs>

      <MembersDialog open={membersOpen} onOpenChange={setMembersOpen} detail={detail} />
      <CardUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        year={project.fiscal_year}
        projects={yearProjects}
        focusProjectId={project.id}
      />
      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} year={project.fiscal_year} project={project} />
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'danger' | 'plan' }) {
  return (
    <div className={cn(
      'min-w-0 rounded-lg border px-3 py-2',
      tone === 'danger' ? 'border-rose-200 bg-rose-50/60' : tone === 'warn' ? 'border-amber-200 bg-amber-50/50' : 'border-slate-100 bg-slate-50/50',
    )}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={cn('truncate text-lg font-semibold tabular-nums',
        tone === 'danger' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-800' : tone === 'plan' ? 'text-blue-700' : 'text-slate-900')}>
        {value}
      </div>
      {sub && <div className="truncate text-[11px] text-slate-500" title={sub}>{sub}</div>}
    </div>
  );
}
