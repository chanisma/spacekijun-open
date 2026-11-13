// ========================================
// 「업무노트」 = 옛 «내 할 일»을 품은 수행 + 대시보드 화면 (2026-11-12 — «내 할 일»과 합침, 사용자 결정)
//
// 왼쪽 = 서명·결재(내 차례) → 「요청」 → 내 업무(업무 안에 내 할 일 · 담당만 맡은 일은 작게) — 완료·제출은 이 자리에서
//        (할 일 행·상세 창은 옛 «내 할 일»과 **같은 부품** MyTaskInbox·TaskDetailDialog — «제출 없이 완료» 가드가 한 곳에 남는다).
// 오른쪽 = 요약 숫자 · 오늘 일정 · 공문 제안(한 줄씩, 누르면 펼침) · 할 일 계획표.
// /my-tasks 는 여기로 넘어온다(?task=·?collect= 딥링크 그대로). 시기를 축으로 보는 것은 업무 관리 › 타임라인.
// 판정 = model/todayFeed.ts(서명·결재·공문·요약) · components/tasks/taskInboxUtils.ts(할 일).
// ========================================

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, GanttChartSquare, Plus, RefreshCw } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { usePageRefresh } from '@/hooks/usePageRefresh';
import { useWorksJsonb } from '@/hooks/useTasksJsonb';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { TASK_LINK_NOT_FOUND_MESSAGE, taskPagePath } from '@/lib/taskTabs';
import { MyTaskInbox, MyTaskPlanner, type InboxManagedWork } from '@/components/tasks/MyTaskInbox';
import { TaskHeader } from '@/components/tasks/TaskHeader';
import { TaskGuideDialog } from '@/components/tasks/guide/TaskGuideDialog';
import { TaskDetailDialog } from '@/components/tasks/TaskDetailDialog';
import { TaskEditDialog } from '@/components/tasks/TaskEditDialog';
import type { InboxFilter } from '@/components/tasks/taskInboxUtils';
import type { Task, Work } from '@/types/tasks';
import { CollectRespondDialog } from '@/features/task-workflow/components/collect/CollectRespondDialog';
import { COLLECT_KEY, useMyCollectRequests } from '@/features/task-workflow/hooks/useCollectInput';
import { SignatureSignDialog } from '@/features/e-signature/components/SignatureSignDialog';
import { useSignatureRequests } from '@/features/e-signature/hooks/useSignatureRequests';
import { ApprovalActDialog } from '@/features/approval/components/ApprovalActDialog';
import { useMyPendingApprovals } from '@/features/approval/hooks/useApprovals';
import type { OfficialDoc } from '@/features/official-docs/officialDocService';
import type { PersonOption } from '@/lib/candidateToWork';
import { Chip } from './components/chips';
import { DocSuggestionActions } from './components/DocSuggestionActions';
import { StartWorkDialog } from './components/StartWorkDialog';
import { MY_WORKS_KEY, useMyActiveWorks } from './hooks/useMyWorks';
import { TODAY_FEED_QUERY_PREFIXES, useTodayFeed, type TodayMeeting } from './hooks/useTodayFeed';
import { objectHref } from './model/objectRef';
import { dueChip, type TodayItem } from './model/todayFeed';
import { dDayLabel, roomProgress } from './model/workRoom';

const PANEL = 'rounded-xl border border-slate-200 bg-white px-3.5 py-3';
const PANEL_TITLE = 'mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-500';

/** 서명·결재 한 줄 — 다음 사람을 막고 있으니 맨 위에, 버튼은 그 기능의 기존 창 */
function SignRow({ item, onSign, onApprove }: { item: TodayItem; onSign: (id: string) => void; onApprove: (id: string) => void }) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2 sm:px-5">
      <Chip tone="sign">{item.source === 'approval' ? '결재' : '서명'}</Chip>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900" title={item.title}>{item.title}</span>
      {item.context.note && <span className="hidden min-w-0 truncate text-xs text-slate-500 sm:inline">{item.context.note}</span>}
      <Button
        size="sm" className="min-h-11 bg-blue-600 px-3 text-xs hover:bg-blue-700 sm:h-8 sm:min-h-0"
        onClick={() => (item.action.kind === 'signature' ? onSign(item.action.id) : item.action.kind === 'approval' ? onApprove(item.action.id) : undefined)}
      >{item.action.label}</Button>
    </li>
  );
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function TodayMeetings({ meetings }: { meetings: TodayMeeting[] }) {
  if (meetings.length === 0) return null;
  return (
    <section aria-label="오늘 일정" className={PANEL}>
      <h2 className={PANEL_TITLE}>오늘 일정 <span className="text-slate-900">{meetings.length}</span></h2>
      <ul className="divide-y divide-slate-100">
        {meetings.map((m) => (
          <li key={m.id} className="flex min-w-0 items-center gap-3 py-1.5 text-sm">
            <span className="w-24 flex-none text-xs tabular-nums text-teal-800">{m.allDay ? '하루 종일' : `${hhmm(m.startsAt)}–${hhmm(m.endsAt)}`}</span>
            <span className="min-w-0 truncate text-slate-800" title={m.title}>{m.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 공문 제안 — 오늘 일정처럼 한 줄씩(기한 · 제목), 누르면 그 자리에서 «왜 나에게»·AI 요약·버튼 셋이 펼쳐진다 */
function SuggestionsPanel({ items, docsById, me, loading }: {
  items: TodayItem[]; docsById: Map<string, OfficialDoc>; me: PersonOption | null; loading: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!loading && items.length === 0) return null;
  return (
    <section id="today-suggestions" aria-label="공문 제안" className={cn(PANEL, 'scroll-mt-4')}>
      <h2 className={PANEL_TITLE}>
        공문 제안 <span className="text-slate-900">{loading ? '…' : items.length}</span>
        <span className="text-xs font-normal text-slate-400">결재권자가 나</span>
      </h2>
      {loading && items.length === 0 ? <p className="py-1 text-xs text-slate-500">확인하는 중…</p> : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => {
            const open = openKey === item.key;
            const doc = item.action.kind === 'docDecision' ? docsById.get(item.action.id) : undefined;
            return (
              <li key={item.key} className="py-1">
                <button
                  type="button" aria-expanded={open} onClick={() => setOpenKey(open ? null : item.key)}
                  className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md text-left text-sm hover:bg-slate-50 sm:min-h-8"
                >
                  <span className={cn('w-14 flex-none text-xs tabular-nums', item.due ? 'text-amber-800' : 'text-slate-400')}>
                    {item.due ? `${Number(item.due.slice(5, 7))}/${Number(item.due.slice(8, 10))}` : '기한 없음'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-800" title={item.title}>{item.title}</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 flex-none text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden />
                </button>
                {open && (
                  <div className="mb-1 mt-1 space-y-2 rounded-lg bg-slate-50 px-2.5 py-2">
                    {item.context.note && <p className="text-[11px] text-slate-500">{item.context.note}</p>}
                    {(item.why || item.summary) && (
                      <p className="text-xs leading-relaxed text-slate-700">
                        {item.why && <span className="font-medium">{item.why}</span>}
                        {item.why && item.summary && <span className="text-slate-400"> — </span>}
                        {item.summary && <span>AI 요약: {item.summary}</span>}
                      </p>
                    )}
                    {doc && <DocSuggestionActions doc={doc} me={me} compact />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function TodayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { today, feed, meetings, docsLoading, me, docsById } = useTodayFeed();
  const pageRefresh = usePageRefresh([...TODAY_FEED_QUERY_PREFIXES, ['works-jsonb'], [...MY_WORKS_KEY], ['signature-requests'], ['approvals'], [COLLECT_KEY]] as never);
  const { data: signatureRequests = [] } = useSignatureRequests();
  const { data: approvals = [] } = useMyPendingApprovals();
  const [signId, setSignId] = useState<string | null>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const signRequest = signId ? signatureRequests.find((r) => r.id === signId) ?? null : null;
  const approval = approvalId ? approvals.find((a) => a.id === approvalId) ?? null : null;

  // ---- 옛 «내 할 일»(수행) ----
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('todo');
  const [guideOpen, setGuideOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskEditOpen, setTaskEditOpen] = useState(false);
  const { data: workData } = useWorksJsonb();
  const works = (workData ?? []) as Work[];
  // 입력 요청 — 할 일 담당자와 무관하게 나에게 온 입력 받기(2026-09-23)
  const { data: collectRequests = [] } = useMyCollectRequests();
  const [collectActionId, setCollectActionId] = useState<string | null>(null);
  const { data: myWorks = [] } = useMyActiveWorks(me?.id ?? null);

  const openTask = (task: Task) => { setSelectedTask(task); setTaskDetailOpen(true); };

  // ?collect=<작업 id> 딥링크(알림) — 1회 소비 후 URL 에서 제거
  useEffect(() => {
    const actionId = searchParams.get('collect');
    if (!actionId) return;
    setCollectActionId(actionId);
    searchParams.delete('collect');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // ?task=<id> 딥링크 — 업무 관리와 같은 규약(1회 소비 후 URL 에서 제거). 못 찾으면 말한다(2026-10-06)
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId || !workData || workData.length === 0) return;
    let opened = false;
    for (const work of workData) {
      const found = (work.tasks || []).find((t: Task) => t.id === taskId);
      if (found) {
        openTask({ ...found, event_id: found.event_id ?? work.id });
        opened = true;
        break;
      }
    }
    if (!opened) toast.info(TASK_LINK_NOT_FOUND_MESSAGE);
    searchParams.delete('task');
    setSearchParams(searchParams, { replace: true });
  }, [workData, searchParams, setSearchParams]);

  // 내가 책임자인 업무 — 머리에 진척(끝낸 할 일/전체)과 목표일 D-day
  const managedWorks: InboxManagedWork[] = useMemo(() => myWorks.map((w) => {
    const p = roomProgress(w.tasks, me?.id ?? null);
    const d = dDayLabel(today, w.targetDate);
    const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
    const meta: ReactNode = (
      <>
        {p.total > 0 && (
          <span className="flex items-center gap-1" title={`할 일 ${p.total}개 중 ${p.done}개 끝`}>
            <span className="h-1 w-10 overflow-hidden rounded-full bg-slate-200"><span className="block h-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
            {p.done}/{p.total}
          </span>
        )}
        {d && <span className={cn(d.startsWith('D+') ? 'text-slate-400' : /^D-(day|[0-2])$/.test(d) ? 'font-semibold text-rose-700' : 'text-slate-600')}>{d}</span>}
      </>
    );
    return { id: w.id, name: w.name, sortDate: w.targetDate, meta };
  }), [myWorks, me?.id, today]);

  // 서명·결재(내 차례)만 피드에서 — 할 일·요청은 아래 목록이 맡는다(같은 일을 두 번 보이지 않게)
  const signItems = useMemo(() => [...feed.now, ...feed.week, ...feed.later].filter((i) => i.source === 'signature' || i.source === 'approval'), [feed]);
  const busy = feed.busiestDay ? dueChip(today, feed.busiestDay.date) : null;
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // 요약 = 한 줄(2026-11-12 사용자 요청) — «이름 숫자»를 이어 쓰고, 누르면 그 자리로
  const Stat = ({ label, value, tone, target }: { label: string; value: ReactNode; tone?: string; target?: string }) => {
    const body = <><span className="text-slate-500">{label}</span> <span className={cn('font-semibold tabular-nums text-slate-900', tone)}>{value}</span></>;
    return target ? (
      <button type="button" onClick={() => jump(target)} className="min-h-11 rounded-md px-1 hover:bg-slate-50 sm:min-h-7">{body}</button>
    ) : <span className="px-1">{body}</span>;
  };

  const headerActions = (
    <>
      <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-xs sm:px-3 sm:text-sm" onClick={() => pageRefresh.refresh()} disabled={pageRefresh.refreshing} title="새로고침">
        <RefreshCw className={cn('h-3.5 w-3.5', pageRefresh.refreshing && 'animate-spin')} aria-hidden /><span className="hidden sm:inline">새로고침</span>
      </Button>
      <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-xs sm:px-3 sm:text-sm" title="업무 관리 › 타임라인">
        <Link to={taskPagePath('timeline')}><GanttChartSquare className="h-3.5 w-3.5" aria-hidden /><span className="hidden sm:inline">타임라인</span></Link>
      </Button>
      {me && (
        <Button size="sm" className="h-8 shrink-0 gap-1.5 bg-blue-600 px-2 text-xs text-white hover:bg-blue-700 sm:px-3 sm:text-sm" onClick={() => setStartOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />새 업무
        </Button>
      )}
    </>
  );

  return (
    <Layout>
      <div className="space-y-4">
        {/* 머리글 — 기능명·아이콘 없이 필터·액션만(CLAUDE.md §1). 옛 «내 할 일» 머리글 그대로 + 새로고침·타임라인·새 업무 */}
        <TaskHeader
          mode="myTasks"
          inboxFilter={inboxFilter}
          onInboxFilterChange={setInboxFilter}
          onGuide={() => setGuideOpen(true)}
          extraActions={headerActions}
        />

        {/* 넓은 화면 = 두 칸. 휴대폰 = 할 일 먼저(수행 화면) → 요약 → 오늘 일정 → 공문 → 계획표 — DOM 순서가 휴대폰 순서 */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
            {signItems.length > 0 && (
              <section aria-label="서명·결재 — 내 차례" className="overflow-hidden rounded-2xl border border-violet-200 bg-white">
                <h2 className="px-3.5 pt-2.5 text-xs font-semibold text-violet-700 sm:px-5">서명·결재 — 내 차례 {signItems.length}</h2>
                <ul className="divide-y divide-slate-100">
                  {signItems.map((item) => <SignRow key={item.key} item={item} onSign={setSignId} onApprove={setApprovalId} />)}
                </ul>
              </section>
            )}
            <div id="my-inbox" className="scroll-mt-4">
              <MyTaskInbox
                layout="byWork"
                filter={inboxFilter}
                works={works}
                managedWorks={managedWorks}
                workHref={(id) => objectHref('work', id)}
                taskHref={(t) => objectHref('work', t.event_id ?? '', t.id)}
                onTaskDetail={openTask}
                collectRequests={collectRequests}
                onOpenCollect={setCollectActionId}
              />
            </div>
          </div>
          <aside className="min-w-0 space-y-3 lg:col-start-2 lg:row-start-1">
            <div aria-label="요약" className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
              <Stat label="지금" value={feed.now.length} target="my-inbox" />
              <span className="text-slate-300" aria-hidden>·</span>
              <Stat label="이번 주" value={feed.week.length} target="my-inbox" />
              <span className="text-slate-300" aria-hidden>·</span>
              <Stat label="기한 지남" value={feed.overdue} tone={feed.overdue > 0 ? 'text-rose-700' : undefined} target="my-inbox" />
              <span className="text-slate-300" aria-hidden>·</span>
              <Stat
                label="공문"
                value={docsLoading ? <span className="font-normal text-slate-400">…</span> : feed.suggestions.length}
                tone={feed.suggestions.length > 0 ? 'text-amber-800' : undefined}
                target={feed.suggestions.length > 0 ? 'today-suggestions' : undefined}
              />
              {busy && feed.busiestDay && (
                <>
                  <span className="text-slate-300" aria-hidden>·</span>
                  <Stat label="몰리는 날" value={<>{busy.text} <span className="font-normal text-slate-500">{feed.busiestDay.count}건</span></>} />
                </>
              )}
            </div>
            <TodayMeetings meetings={meetings} />
            <SuggestionsPanel items={feed.suggestions} docsById={docsById} me={me} loading={docsLoading} />
            {/* 계획표는 늘 둔다(2026-11-12 — 접기 버튼 없음, 사용자 요청) */}
            <MyTaskPlanner works={works} collectRequests={collectRequests} onTaskDetail={openTask} onOpenCollect={setCollectActionId} />
          </aside>
        </div>

        <TaskDetailDialog
          task={selectedTask}
          open={taskDetailOpen}
          onOpenChange={setTaskDetailOpen}
          onEdit={(task) => { setEditingTask(task); setTaskEditOpen(true); }}
        />
        <CollectRespondDialog actionId={collectActionId} open={collectActionId !== null} onOpenChange={(o) => !o && setCollectActionId(null)} />
        <TaskEditDialog workId={selectedTask?.event_id || ''} task={editingTask} open={taskEditOpen} onOpenChange={setTaskEditOpen} />
        <SignatureSignDialog request={signRequest} open={!!signRequest} onOpenChange={(v) => { if (!v) setSignId(null); }} />
        {approval && <ApprovalActDialog open={!!approval} onOpenChange={(v) => { if (!v) setApprovalId(null); }} request={approval} />}
        {me && <StartWorkDialog open={startOpen} onOpenChange={setStartOpen} me={me} today={today} />}
      </div>
      <TaskGuideDialog tab="myTasks" open={guideOpen} onOpenChange={setGuideOpen} />
    </Layout>
  );
}
