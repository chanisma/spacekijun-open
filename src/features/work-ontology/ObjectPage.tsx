// ========================================
// 「한 장 보기」 — 객체 하나를 같은 틀로: 머리 · 할 일·단계 · 타임라인 · 작년에는 · 연결 (2026-11-08, P0 · 읽기 전용)
// → 2026-11-12 W0: 책임자·담당자에게는 **작업실**(수행 화면 — 평평한 할 일 목록 · 체크 · 서랍)로 바뀐다.
//    그 밖의 사람에게는 지금처럼 읽기. 설계 docs/plans/2026-11-12-work-room.md
//
// 설계 = docs/plans/2026-11-08-work-ontology-redesign.md §4-B · §10. 판정 = model/workObject.ts.
// P0 는 업무 한 장만(VIEWABLE_OBJECT_TYPES). 쓰기는 하지 않는다 — 고치기·진행은 기존 화면으로 보낸다.
// ⚠️ 담당자 명단은 책임자(·관리자)에게만 — 그 밖에는 인원 수만(CLAUDE.md «비매니저에게 담당자 명단 비노출»).
//    get_work_detail 은 DEFINER 라 명단을 누구에게나 주므로 **이 화면이** 가린다.
// ========================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Link2, Route as RouteIcon, SquarePen, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { WorkDetailDialog } from '@/components/tasks/WorkDetailDialog';
import { WorkEditDialog } from '@/components/tasks/WorkEditDialog';
import { TaskDetailDialog } from '@/components/tasks/TaskDetailDialog';
import { TaskEditDialog } from '@/components/tasks/TaskEditDialog';
import { OfficialDocDetailDialog, type DocRef } from './components/OfficialDocDetailDialog';
import type { Task, Work } from '@/types/tasks';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentUserResourceId } from '@/hooks/usePermissions';
import { usePageRefresh } from '@/hooks/usePageRefresh';
import { isWorkManager } from '@/lib/taskUtils';
import { todayKeyKst } from '@/lib/taskVisibility';
import { workPipelineHref } from '@/lib/workPipelineLink';
import { KNOWLEDGE_KIND_LABEL, knowledgeOriginLabel, lineageSummary, sortKnowledge } from '@/lib/workKnowledge';
import { stageNumber } from '@/lib/workPipeline';
import { cn } from '@/lib/utils';
import { Chip } from './components/chips';
import { RoomTaskList } from './components/RoomTaskList';
import { RoomDrawer } from './components/RoomDrawer';
import { WORK_ROOM_QUERY_PREFIXES, useWorkRoomData, useWorkRoomMutations } from './hooks/useWorkRoom';
import { dDayLabel, roomMetaOf, roomProgress, shortDate } from './model/workRoom';
import { LinkAddDialog } from './components/LinkAddDialog';
import { OBJECT_LINKS_KEY, useLinkMutations, useObjectLinks } from './hooks/useObjectLinks';
import { explicitEntries, mergeLinkGroups } from './model/explicitLinks';
import { WORK_OBJECT_QUERY_PREFIXES, useWorkObject } from './hooks/useWorkObject';
import { OBJECT_TYPE_LABEL, VIEWABLE_OBJECT_TYPES, WORK_HOME_PATH, isObjectType, objectHref } from './model/objectRef';
import { dueChip } from './model/todayFeed';
import {
  buildWorkLinks, buildWorkTimeline, workStages, workSummary,
  type ObjTask, type ObjWork, type TimelineDot,
} from './model/workObject';

const BUTTON_TAP = 'min-h-11 sm:min-h-9';

const WORK_STATUS: Record<string, { text: string; tone: 'progress' | 'wait' | 'late' | 'plain' }> = {
  active: { text: '진행 중', tone: 'progress' },
  pending: { text: '진행 중', tone: 'progress' }, // 옛 «대기» — 은퇴했다(2026-10-05), 진행 중으로 읽는다
  completed: { text: '완료', tone: 'plain' },
  cancelled: { text: '취소', tone: 'late' },
};

const DOT_CLASS: Record<TimelineDot, string> = {
  doc: 'bg-amber-500', calendar: 'bg-teal-500', task: 'bg-blue-500', done: 'bg-emerald-500', agent: 'bg-violet-500', plain: 'bg-slate-300',
};

function TaskStatusChip({ task, today }: { task: ObjTask; today: string }) {
  if (task.status === 'completed') return <Chip tone="plain" className="!bg-emerald-50 !text-emerald-700 !border-transparent">완료</Chip>;
  if (task.status === 'cancelled') return <Chip tone="late">취소</Chip>;
  const c = dueChip(today, task.due_date ?? null);
  return c ? <Chip tone={c.tone}>{c.text}</Chip> : <Chip tone="wait">마감 없음</Chip>;
}

function assigneesOf(task: ObjTask): Array<{ id?: string; name?: string; status?: string }> {
  const a = (task.meta as { assignees?: unknown } | null)?.assignees;
  return Array.isArray(a) ? (a as Array<{ id?: string; name?: string; status?: string }>) : [];
}

function TaskLine({ task, today, stage, showNames, focused }: {
  /** undefined = 단계 칸을 그리지 않는다(단계가 없는 업무) · null = 단계 밖(일회성) */
  task: ObjTask; today: string; stage: string | null | undefined; showNames: boolean; focused: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { if (focused) ref.current?.scrollIntoView({ block: 'center' }); }, [focused]);
  const people = assigneesOf(task);
  const done = people.filter((p) => p.status === 'completed').length;
  return (
    <li ref={ref} className={cn('flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 py-2 first:border-t-0', focused && '-mx-2 rounded-lg bg-blue-50 px-2')}>
      {stage !== undefined && <span className="w-12 flex-none text-[11px] text-slate-400">{stage ?? '단계 밖'}</span>}
      <TaskStatusChip task={task} today={today} />
      <span className="min-w-0 flex-1 truncate text-sm text-slate-800" title={task.title}>{task.title}</span>
      {/* 휴대폰은 담당자를 다음 줄로(긴 명단이 제목을 한 글자로 짓누른다 — 실측), 데스크톱은 오른쪽에서 자른다 */}
      <span className="min-w-0 basis-full truncate text-xs text-slate-500 sm:max-w-[45%] sm:basis-auto" title={showNames ? people.map((p) => p.name).filter(Boolean).join(', ') : undefined}>
        {people.length === 0 ? '담당 없음'
          : showNames ? `${people.slice(0, 3).map((p) => p.name ?? '?').join(', ')}${people.length > 3 ? ` 외 ${people.length - 3}명` : ''} · ${done}/${people.length}`
          : `담당 ${people.length}명`}
      </span>
    </li>
  );
}

export default function ObjectPage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // 고치기·기록 → 그 자리에서 기존 창(2026-11-12 — 종전엔 업무 관리 화면으로 넘어가 창이 열렸다)
  const [workDetailOpen, setWorkDetailOpen] = useState(false);
  const [workEditOpen, setWorkEditOpen] = useState(false);
  const [taskDetail, setTaskDetail] = useState<Task | null>(null);
  const [taskEdit, setTaskEdit] = useState<Task | null>(null);
  const [docRef, setDocRef] = useState<DocRef | null>(null);
  const focusTaskId = params.get('task');
  const { isAdmin, user, profile } = useAuth();
  const [linkOpen, setLinkOpen] = useState(false);
  const { data: myResourceId } = useCurrentUserResourceId();
  const today = todayKeyKst();
  const viewable = isObjectType(type) && VIEWABLE_OBJECT_TYPES.includes(type);
  const { work, isLoading, error, events, history, neighbors, knowledge } = useWorkObject(viewable && type === 'work' ? id ?? null : null);
  const linksQ = useObjectLinks(viewable && type === 'work' ? 'work' : null, id ?? null);
  const { unlink } = useLinkMutations();
  const pageRefresh = usePageRefresh([...WORK_OBJECT_QUERY_PREFIXES, [OBJECT_LINKS_KEY], ...WORK_ROOM_QUERY_PREFIXES] as never);

  const obj: ObjWork | null = work ? {
    id: work.id, name: work.name, status: work.status, meta: work.meta, created_at: work.created_at,
    tasks: (work.tasks ?? []) as unknown as ObjTask[],
  } : null;

  const view = useMemo(() => {
    if (!obj) return null;
    return {
      stages: workStages(obj),
      timeline: buildWorkTimeline(obj, events, history, today),
      links: mergeLinkGroups(
        buildWorkLinks(obj, neighbors, knowledge?.lineage ?? [], (wid) => objectHref('work', wid)),
        explicitEntries(
          { type: 'work', id: obj.id },
          linksQ.data?.rows ?? [],
          (t, oid) => linksQ.data?.resolved.get(`${t}:${oid}`) ?? null,
          { userId: user?.id ?? null, isAdmin },
        ),
      ),
      summary: workSummary(obj, today),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work, events, history, neighbors, knowledge, today, linksQ.data, user?.id, isAdmin]);
  // 이미 이어진 상대 — 연결 추가 창에서 «이어짐»
  const linkedTargets = useMemo(() => new Set([
    ...(view?.links ?? []).flatMap((g) => g.entries.map((e) => e.targetKey).filter((k): k is string => !!k)),
    ...neighbors.map((n) => `work:${n.workId}`),
  ]), [view, neighbors]);

  const isManager = !!work && (isAdmin || isWorkManager((work as { manager_id?: string }).manager_id, work.meta, myResourceId ?? null));
  // 작업실 = 책임자 ∨ 이 업무 할 일의 담당자. 그 밖에는 읽기 화면
  const isAssignee = !!myResourceId && (obj?.tasks ?? []).some((t) => assigneesOf(t).some((a) => a.id === myResourceId));
  const isRoom = !!work && (isManager || isAssignee);
  const me = myResourceId && profile?.name ? { id: myResourceId, name: profile.name } : null;
  const taskIds = useMemo(() => (obj?.tasks ?? []).map((t) => t.id), [work]); // eslint-disable-line react-hooks/exhaustive-deps
  const room = useWorkRoomData(work?.id ?? null, taskIds, isRoom);
  const roomM = useWorkRoomMutations(work?.id ?? null);
  const roomMeta = roomMetaOf(work?.meta);
  const progress = roomProgress(obj?.tasks ?? [], myResourceId ?? null);

  if (!viewable) {
    return (
      <Layout><PageContainer width="narrow">
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
          {isObjectType(type) ? `«${OBJECT_TYPE_LABEL[type]}» 한 장 보기는 아직 열리지 않았습니다(연결 층과 함께 엽니다).` : '알 수 없는 주소입니다.'}
          <Link to={WORK_HOME_PATH} className="ml-1 text-blue-700 underline">업무노트로</Link>
        </p>
      </PageContainer></Layout>
    );
  }

  // 할 일 상세 창(완료·제출 — 옛 «내 할 일»과 같은 창) = 책임자 · 그 할 일의 담당자. 담당자 명단이 보이는 창이라
  // 그 밖의 사람에게는 열지 않고 목록에서 그 할 일을 짚는다(2026-11-12 — 작업실에서 할 일을 누르면 창).
  // 기록 줄: 공문 = 공문 상세 창 · 할 일 = 위와 같음 · 작년에서 이어짐 = 그 업무 한 장 · 업무 전체의 줄 = 책임자에게 업무 상세.
  const openTask = (taskId: string) => {
    const t = obj?.tasks.find((x) => x.id === taskId);
    if (!t || !obj) return;
    const mine = !!myResourceId && assigneesOf(t).some((a) => a.id === myResourceId);
    if (isManager || mine) { setTaskDetail({ ...(t as unknown as Task), event_id: obj.id }); return; }
    const next = new URLSearchParams(params);
    next.set('task', taskId);
    setParams(next, { replace: true });
  };
  const entryAction = (e: { taskId?: string | null; href?: string | null; doc?: { docNo: string | null; title: string } | null }): { run: () => void; label: string } | null => {
    if (e.doc?.docNo) return { run: () => setDocRef({ docNo: e.doc!.docNo, title: e.doc!.title }), label: '공문 자세히' };
    if (e.taskId && obj?.tasks.some((t) => t.id === e.taskId)) {
      return { run: () => openTask(e.taskId!), label: '할 일 자세히' };
    }
    if (e.href) return { run: () => navigate(e.href!), label: '그 업무 한 장 보기' };
    if (isManager && !e.taskId) return { run: () => setWorkDetailOpen(true), label: '업무 자세히' };
    return null;
  };
  const refreshAfterEdit = () => {
    void qc.invalidateQueries({ queryKey: ['work-object'] });
    void qc.invalidateQueries({ queryKey: ['work-detail-jsonb'] });
    void qc.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });
  };

  const status = WORK_STATUS[work?.status ?? ''] ?? WORK_STATUS.active;
  const knowledgeItems = sortKnowledge(knowledge?.items ?? []).slice(0, 6);
  const lineageNote = lineageSummary(knowledge?.lineage);

  return (
    <Layout>
      <PageContainer>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 backdrop-blur-md">
          <Button asChild variant="ghost" size="sm" className={BUTTON_TAP}>
            <Link to={WORK_HOME_PATH}><ArrowLeft className="mr-1 h-4 w-4" aria-hidden />업무노트</Link>
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className={BUTTON_TAP} onClick={() => pageRefresh.refresh()} disabled={pageRefresh.refreshing}>새로고침</Button>
          {isManager && work && (
            <>
              <Button variant="outline" size="sm" className={BUTTON_TAP} onClick={() => setWorkDetailOpen(true)}>
                <SquarePen className="mr-1.5 h-4 w-4" aria-hidden />{isRoom ? '자세히 고치기' : '고치기'}
              </Button>
              {/* 작업실에서는 단계가 둘 이상인 업무에만(구조는 나중 — 설계 원칙 ①) */}
              {(!isRoom || (view?.stages.stages.length ?? 0) > 1) && (
                <Button asChild size="sm" variant={isRoom ? 'outline' : 'default'} className={cn(BUTTON_TAP, !isRoom && 'bg-blue-600 hover:bg-blue-700')}>
                  <Link to={workPipelineHref(work.id, focusTaskId)}><RouteIcon className="mr-1.5 h-4 w-4" aria-hidden />단계별 진행</Link>
                </Button>
              )}
            </>
          )}
        </div>

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">업무를 불러오지 못했습니다 — {error.message}</p>
        ) : isLoading || !obj || !view ? (
          <p className="px-1 py-6 text-center text-sm text-slate-500">{isLoading ? '불러오는 중…' : '업무를 찾지 못했습니다. 지워졌거나 볼 수 없는 업무일 수 있습니다.'}</p>
        ) : (
          <>
            <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
              <p className="text-xs text-slate-500">
                업무{work?.meta?.department ? ` · ${work.meta.department}` : ''}{work?.meta?.year ? ` · ${work.meta.year}학년도` : ''}
              </p>
              <h1 className="mt-1 flex flex-wrap items-baseline gap-x-3 break-keep text-xl font-bold text-slate-900">
                {obj.name}
                {isRoom && roomMeta.targetDate && (
                  <span className={cn('text-base font-semibold', (dDayLabel(today, roomMeta.targetDate) ?? '').startsWith('D+') ? 'text-slate-400' : 'text-rose-700')}>
                    {dDayLabel(today, roomMeta.targetDate)} · {shortDate(roomMeta.targetDate)}
                  </span>
                )}
              </h1>
              {isRoom && roomMeta.goal && <p className="mt-1 text-sm text-slate-700">{roomMeta.goal}</p>}
              {isRoom && isManager && (
                <label className="mt-2 flex w-fit items-center gap-2 text-xs text-slate-500">
                  목표일
                  <input
                    type="date" value={roomMeta.targetDate ?? ''} aria-label="목표일"
                    onChange={(e) => roomM.updateMeta.mutate({ meta: (work?.meta ?? null) as Record<string, unknown> | null, targetDate: e.target.value || null })}
                    className="min-h-11 rounded-md border border-slate-200 px-2 text-base text-slate-700 sm:min-h-8 sm:text-xs"
                  />
                </label>
              )}
              {isRoom && progress.total > 0 && (
                <div className="mt-3 flex items-center gap-2" role="img" aria-label={`할 일 ${progress.total}개 중 ${progress.done}개 끝`}>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                  </span>
                  <span className="text-xs tabular-nums text-slate-600">{progress.done}/{progress.total}</span>
                </div>
              )}
              <div className={cn('mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600', isRoom && 'hidden')}>
                <Chip tone={status.tone}>{status.text}</Chip>
                <span>할 일 {view.summary.total}개 중 {view.summary.done}개 끝남</span>
                {view.summary.nextDue && <span>· 다음 마감 {dueChip(today, view.summary.nextDue)?.text}</span>}
                {view.summary.overdue > 0 && <Chip tone="late">기한 지난 마감 {view.summary.overdue}</Chip>}
                {!isManager && <span className="text-xs text-slate-400">· 담당자 이름은 책임자에게만 보입니다</span>}
              </div>
            </header>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-4">
                {isRoom && (
                  <RoomTaskList
                    tasks={obj.tasks} today={today} targetDate={roomMeta.targetDate ?? null} me={me} isManager={isManager}
                    actionCounts={room.actionCounts} actionsLoaded={room.actionsLoaded} focusTaskId={focusTaskId} m={roomM} onOpen={openTask}
                  />
                )}
                {/* 휴대폰은 한 줄로 쌓이므로 서랍을 할 일 바로 아래에(기록 아래로 밀리지 않게) — 데스크톱은 오른쪽 칸 */}
                {isRoom && <div className="lg:hidden"><RoomDrawer notes={room.notes} loading={room.notesLoading} isManager={isManager} m={roomM} /></div>}
                {/* 할 일 · 단계 — 작업실이 아닐 때(읽기) */}
                <section aria-label="할 일과 단계" className={cn('rounded-2xl border border-slate-200 bg-white px-4 py-3', isRoom && 'hidden')}>
                  <h2 className="mb-2 text-sm font-semibold text-slate-500">할 일 · 단계</h2>
                  {view.stages.stages.length > 1 && (
                    <ol className="mb-3 flex gap-1 overflow-x-auto" aria-label="단계 줄">
                      {view.stages.stages.map((s, i) => {
                        const st = view.stages.states[i];
                        return (
                          <li key={s.order} className={cn('min-w-[7.5rem] flex-1 border-t-4 px-2 pb-1 pt-1.5 text-xs',
                            st === 'done' ? 'border-emerald-500 text-slate-500' : st === 'current' ? 'border-blue-500 text-blue-700' : 'border-slate-300 text-slate-500')}>
                            <span className="block truncate font-semibold text-slate-700" title={s.tasks.map((t) => t.title).join(', ')}>
                              {stageNumber(i)} {s.tasks[0]?.title}{s.tasks.length > 1 ? ` 외 ${s.tasks.length - 1}` : ''}
                            </span>
                            {st === 'done' ? '끝남' : st === 'current' ? '지금' : '예정'}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  <ul>
                    {view.stages.stages.flatMap((s, i) => s.tasks.map((t) => (
                      <TaskLine key={t.id} task={t} today={today} stage={view.stages.stages.length > 1 ? `${i + 1}단계` : undefined} showNames={isManager} focused={t.id === focusTaskId} />
                    )))}
                    {view.stages.oneTime.map((t) => (
                      <TaskLine key={t.id} task={t} today={today} stage={view.stages.stages.length > 1 ? null : undefined} showNames={isManager} focused={t.id === focusTaskId} />
                    ))}
                  </ul>
                  {obj.tasks.length === 0 && <p className="py-3 text-sm text-slate-500">아직 할 일이 없습니다.</p>}
                </section>

                {/* 타임라인 */}
                <section aria-label="타임라인" className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <h2 className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold text-slate-500">
                    {isRoom ? '기록' : '타임라인'} <span className="text-xs font-normal text-slate-400">{isRoom ? '하는 동안 저절로 남습니다' : '공문 · 할 일 · 상태 · 마감을 한 줄에'} — 사람은 역할로만</span>
                  </h2>
                  {view.timeline.length === 0 ? <p className="py-2 text-sm text-slate-500">기록이 없습니다.</p> : (
                    <ol className="relative">
                      {view.timeline.map((e, i) => {
                        const act = entryAction(e);
                        const cells = (
                          <>
                            <span className={cn('pt-0.5 text-right text-xs tabular-nums', e.future ? 'font-semibold text-teal-800' : 'text-slate-500')}>
                              {e.date.slice(5).replace('-', '/')}
                            </span>
                            <span className="relative flex justify-center">
                              <span className={cn('mt-1.5 h-2.5 w-2.5 rounded-full', DOT_CLASS[e.dot])} />
                              {i < view.timeline.length - 1 && <span className="absolute top-5 h-[calc(100%-0.5rem)] w-px bg-slate-200" aria-hidden />}
                            </span>
                            <span className={cn('min-w-0 text-sm text-slate-800', e.taskId && e.taskId === focusTaskId && 'font-semibold')}>
                              <span className="break-keep">{e.text}</span>
                              {(e.sub || e.future) && <span className="block text-xs text-slate-500">{[e.sub, e.future ? '앞으로' : null].filter(Boolean).join(' · ')}</span>}
                            </span>
                            <span className="flex justify-end pt-0.5">{act && <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600" aria-hidden />}</span>
                          </>
                        );
                        const grid = 'grid w-full grid-cols-[3.25rem_1rem_minmax(0,1fr)_1rem] gap-2 py-1.5';
                        return (
                          <li key={e.key} className={cn(e.future && 'opacity-75')}>
                            {act ? (
                              <button type="button" onClick={act.run} title={act.label} className={cn(grid, 'group -mx-1.5 w-[calc(100%+0.75rem)] rounded-lg px-1.5 text-left hover:bg-slate-50 max-sm:min-h-11')}>
                                {cells}
                              </button>
                            ) : <div className={grid}>{cells}</div>}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>

                {/* 작년에는 — 업무 수행 지식(계보 포함), 읽기만 */}
                {knowledge?.can_view && (knowledgeItems.length > 0 || lineageNote) && (
                  <section aria-label="작년에는" className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <h2 className="mb-1 text-sm font-semibold text-slate-500">작년에는 · 업무 지식</h2>
                    {lineageNote && <p className="mb-2 text-xs text-slate-500">{lineageNote}</p>}
                    <ul className="space-y-2">
                      {knowledgeItems.map((k) => (
                        <li key={k.knowledge_id} className="border-l-[3px] border-blue-300 pl-3">
                          <p className="text-sm font-medium text-slate-800">{k.title}</p>
                          <p className="line-clamp-3 whitespace-pre-line text-sm text-slate-700">{k.body}</p>
                          <p className="text-xs text-slate-500">{KNOWLEDGE_KIND_LABEL[k.kind]} · {knowledgeOriginLabel(k)}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              <div className="min-w-0 space-y-4">
              {isRoom && <div className="hidden lg:block"><RoomDrawer notes={room.notes} loading={room.notesLoading} isManager={isManager} m={roomM} /></div>}
              {/* 연결 */}
              <aside aria-label="연결" className="h-fit rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <h2 className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-500">
                  연결
                  <Button type="button" variant="ghost" size="sm" className="min-h-11 text-blue-700 sm:min-h-8" onClick={() => setLinkOpen(true)}>
                    <Link2 className="mr-1 h-4 w-4" aria-hidden />연결 추가
                  </Button>
                </h2>
                {view.links.length === 0 ? (
                  <p className="text-sm text-slate-500">아직 이어진 것이 없습니다. 공문·업무 흐름·지난 업무 가져오기로 생긴 연결이 여기 모입니다.</p>
                ) : view.links.map((g) => (
                  <div key={g.key} className="mb-3 last:mb-0">
                    <p className="mb-1 text-[11px] text-slate-500">{g.title} {g.entries.length}</p>
                    <ul>
                      {g.entries.map((e) => {
                        // 두 줄 — 이름 한 줄(말줄임) + 설명 한 줄(말줄임). 종전엔 설명이 줄어들지 않아(flex-none) 긴 공문이 칸을 뚫었다
                        const body = (
                          <>
                            <Chip tone={g.key === 'doc' ? 'doc' : g.key === 'schedule' ? 'calendar' : 'plain'} className="flex-none self-start">{e.badge}</Chip>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate" title={e.label}>{e.label}</span>
                              {e.sub && <span className="block truncate text-[11px] text-slate-400" title={e.sub}>{e.sub}</span>}
                            </span>
                          </>
                        );
                        const rowCls = 'flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm text-slate-800 hover:bg-slate-50 sm:min-h-9';
                        const row = e.linkId ? linksQ.data?.rows.find((r) => r.id === e.linkId) : undefined;
                        return (
                          <li key={e.key} className="flex min-w-0 items-center">
                            {e.doc && (e.doc.id || e.doc.docNo) ? (
                              <button type="button" onClick={() => setDocRef({ id: e.doc!.id ?? null, docNo: e.doc!.docNo ?? null, title: e.label })} className={rowCls} title="공문 자세히">{body}</button>
                            ) : e.href ? (
                              <Link to={e.href} className={rowCls}>{body}</Link>
                            ) : (
                              <span className={cn(rowCls, 'hover:bg-transparent')}>{body}</span>
                            )}
                            {e.removable && row && (
                              <button
                                type="button"
                                aria-label={`«${e.label}» 연결 끊기`}
                                title="연결 끊기"
                                disabled={unlink.isPending}
                                onClick={() => unlink.mutate({
                                  id: row.id,
                                  restore: { fromType: row.from_type, fromId: row.from_id, toType: row.to_type, toId: row.to_id, kind: row.kind, note: row.note },
                                })}
                                className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 sm:h-8 sm:w-8"
                              >
                                <X className="h-4 w-4" aria-hidden />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </aside>
              </div>
            </div>
            <LinkAddDialog open={linkOpen} onOpenChange={setLinkOpen} workId={obj.id} existing={linkedTargets} />
            <OfficialDocDetailDialog docRef={docRef} onOpenChange={(o) => { if (!o) setDocRef(null); }} />
            {isRoom && (
              <TaskDetailDialog
                task={taskDetail}
                open={!!taskDetail}
                onOpenChange={(o) => { if (!o) { setTaskDetail(null); refreshAfterEdit(); } }}
                onEdit={isManager ? (t) => { setTaskDetail(null); setTaskEdit(t); } : undefined}
              />
            )}
            {isManager && (
              <>
                <WorkDetailDialog
                  work={work as unknown as Work}
                  open={workDetailOpen}
                  onOpenChange={(o) => { setWorkDetailOpen(o); if (!o) refreshAfterEdit(); }}
                  onEdit={() => { setWorkDetailOpen(false); setWorkEditOpen(true); }}
                />
                <WorkEditDialog work={work as unknown as Work} open={workEditOpen} onOpenChange={(o) => { setWorkEditOpen(o); if (!o) refreshAfterEdit(); }} />
                <TaskEditDialog
                  workId={obj.id}
                  task={taskEdit}
                  open={!!taskEdit}
                  onOpenChange={(o) => { if (!o) { setTaskEdit(null); refreshAfterEdit(); } }}
                />
              </>
            )}
          </>
        )}
      </PageContainer>
    </Layout>
  );
}
