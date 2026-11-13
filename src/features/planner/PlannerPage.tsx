import { useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, BookOpenCheck, CalendarDays, CalendarRange, Sun, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { readStoredString, writeStoredString } from '@/lib/safeLocalStorage';
import { BookWeek } from '@/features/academy/game/BookWeek';
import { BookDay } from '@/features/academy/game/BookDay';
import { BookMonth } from '@/features/academy/game/BookMonth';
import { BookGoals } from '@/features/academy/game/BookGoals';
import { GoalSheetForm, TaskSheetForm } from '@/features/academy/game/PlannerSheetForms';
import { PlannerThemeProvider, type PlannerFormCss, type PlannerTheme } from '@/features/academy/game/plannerTheme';
import type { PlannerGoal, PlannerTask } from './types';
import { offsetDay, seoulDay } from './plannerModel';
import { fetchPlanner, writePlanner } from './plannerService';
import css from './plannerPaper.module.css';

/**
 * 플래너 (`/planner`, 2026-10-03 전면 개편 — 사용자 요청 «academy planner 의 기능과 UI 를 참고하여 완전히 수정»).
 *
 * 화면은 아카데미 «별빛 플래너» 의 네 쪽과 **같은 컴포넌트**다 — 이번 주 · 하루 계획(목록 + 시간표) · 월별 일정 · 나의 목표.
 * 그림만 앱 테마(`plannerPaper.module.css`)로 갈아입힌다(`PlannerThemeProvider`). 그래서 한쪽에 기능을 더하면 다른 쪽도 함께 얻는다.
 * 기록은 처음부터 같은 서버 함수(`academy_dormitory_read/write`)라 두 플래너가 같은 계획을 본다.
 * 포모도로(집중 타이머)는 2026-10-03 사용자 결정으로 화면에서 뺐다(«일단 구현하지 않음») — `usePomodoro`·`PomodoroPanel` 은 남아 있다.
 * 머리글에 기능 이름을 쓰지 않는다(CLAUDE.md UI 규약) — 머리 카드는 쪽 고르기와 아카데미 바로가기뿐.
 */
const APP_PLANNER_THEME: PlannerTheme = {
  css,
  formCss: css as unknown as PlannerFormCss,
  words: { brand: 'MY PLANNER', write: '할 일 적기…', line: '입력 줄', stamp: '완료 표시를 하면', archive: '보관하기', all: '전체' },
};

const TABS = [
  { id: 'week', label: '이번 주', icon: CalendarDays },
  { id: 'day', label: '하루 계획', icon: Sun },
  { id: 'month', label: '월별 일정', icon: CalendarRange },
  { id: 'goals', label: '나의 목표', icon: Target },
] as const;
type PlannerTab = typeof TABS[number]['id'];
const VIEW_KEY = 'planner:view:v1';

export default function PlannerPage() {
  const { user, profile, effectiveRole } = useAuth();
  const preview = profile?.role === 'admin' && effectiveRole !== 'admin';
  return <Layout><PageContainer>
    {preview ? <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-16 text-center">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-blue-100 text-blue-600"><BookOpenCheck /></div>
      <h2 className="text-base font-semibold text-slate-800">내 플래너는 본인 역할에서 열 수 있어요.</h2>
      <p className="mt-1 text-sm text-slate-500">역할 미리보기를 종료하면 관리자의 개인 계획을 작성할 수 있습니다.</p>
    </div> : user && <PlannerWorkspace key={user.id} userId={user.id} />}
  </PageContainer></Layout>;
}

export function PlannerWorkspace({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const [day, setDay] = useState(seoulDay);
  const [tab, setTabState] = useState<PlannerTab>(() => { const v = readStoredString(VIEW_KEY); return TABS.some(t => t.id === v) ? v as PlannerTab : 'week'; });
  const setTab = (next: PlannerTab) => { setTabState(next); writeStoredString(VIEW_KEY, next); };
  const [task, setTask] = useState<Partial<PlannerTask> | null>(null);
  const [goal, setGoal] = useState<Partial<PlannerGoal> | null>(null);
  /** 하루 쪽 시간표가 «작성 중인 계획의 시간을 고르는» 용도로 펼쳐졌는가 — 평소엔 끌기가 새 계획을 만든다. */
  const [pickForForm, setPickForForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const query = useQuery({
    queryKey: ['academy-dormitory', userId, 'planner', day],
    queryFn: () => fetchPlanner(day),
    enabled: !!userId, staleTime: 0, refetchInterval: 30_000, retry: 1,
    // 날짜를 바꿀 때 옛 자료를 쥐고 있어야 펼침면 전체가 «불러오는 중»으로 깜빡이지 않는다(아카데미와 같은 이유).
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const tasks = (data?.tasks.filter(t => t.task_date === day) ?? []).sort((a, b) => Number(!a.start_time) - Number(!b.start_time) || (a.start_time || '').localeCompare(b.start_time || ''));

  /** 저장 — 화면이 곧바로 바뀌는 쓰기라 성공 토스트는 띄우지 않는다(CLAUDE.md 토스트 규칙). 실패만 알린다. */
  async function write(action: string, payload: Record<string, unknown>) {
    if (lock.current) return false;
    lock.current = true; setBusy(true);
    try {
      await writePlanner(action, payload);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['academy-dormitory', userId] }),
        cache.invalidateQueries({ queryKey: ['academy-chapter', userId] }),
      ]);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장하지 못했습니다. 다시 시도해 주세요.');
      return false;
    } finally { lock.current = false; setBusy(false); }
  }
  function changeDay(next: string) { if (!next || busy) return; setDay(next); if (!pickForForm) setTask(null); }
  /** 쪽을 바꾸면 펼쳐 둔 양식은 접는다(양식은 그 쪽의 것이다). */
  function openTab(next: PlannerTab) { setTask(null); setGoal(null); setPickForForm(false); setTab(next); }
  function newTask(goalId = '') {
    setTask({ title: '', task_date: day, priority: 'medium', memo: '', start_time: '', end_time: '', related_goal_id: goalId });
    setPickForForm(false); setTab('day');
  }
  const editTask = (t: PlannerTask) => { setDay(t.task_date); setTask(t); setPickForForm(false); setTab('day'); };

  const taskForm = task && data ? <TaskSheetForm task={task} onChange={setTask} goals={data.goals} busy={busy} readOnly={false} picking={pickForForm}
    onPickTime={() => setPickForForm(true)} onInvalid={message => toast.error(message)} onCancel={() => { setTask(null); setPickForForm(false); }}
    onSubmit={async () => { if (await write('save_task', { ...task, task_date: day })) { setTask(null); setPickForForm(false); } }} /> : null;
  const goalForm = goal && data ? <GoalSheetForm goal={goal} onChange={setGoal} goals={data.goals} busy={busy} readOnly={false}
    onCancel={() => setGoal(null)} onSubmit={async () => { if (await write('save_goal', { ...goal })) setGoal(null); }} /> : null;

  return <PlannerThemeProvider value={APP_PLANNER_THEME}>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-2.5 shadow-sm">
      {/* 휴대폰에서는 쪽 고르기가 한 줄을 다 쓴다 — 줄어들기만 하면 아카데미 바로가기와 겹쳤다(390px 검사). */}
      <nav className="flex w-full gap-1 rounded-lg border border-slate-100 bg-slate-100/50 p-1 sm:w-auto" aria-label="플래너 쪽">
        {TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={tab === id} disabled={busy} onClick={() => openTab(id)}
          className={`inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors sm:flex-none sm:px-3 ${tab === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          <Icon size={14} aria-hidden="true" className="hidden sm:block" /><span className="whitespace-nowrap">{label}</span>
        </button>)}
      </nav>
      <Link to="/academy/dorm" className="ml-auto inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
        아카데미 플래너 <ArrowUpRight size={13} aria-hidden="true" />
      </Link>
    </div>

    <div className={css.book} data-book>
      <div className={css.spread}>
        {query.isPending ? <p className={css.state} role="status">플래너를 불러오는 중…</p>
          : query.isError && !data ? <div className={css.state} role="alert"><p>{query.error.message}</p><button type="button" onClick={() => void query.refetch()}>다시 시도</button></div>
          : data && (tab === 'week' ? <BookWeek userId={userId} write={write} initialDay={day} busy={busy} readOnly={false} studentCode={null}
              onOpenDay={next => { changeDay(next); setTab('day'); }} onEdit={editTask} />
            : tab === 'goals' ? <BookGoals goals={data.goals} plans={data.plans ?? []} busy={busy} readOnly={false} write={write}
              onEdit={g => setGoal(g)} onNew={preset => setGoal({ title: '', description: '', is_completed: false, horizon: preset?.horizon ?? 'short', parent_goal_id: preset?.parent_goal_id ?? null })}
              onPlanForGoal={id => newTask(id)} editor={goalForm ?? undefined} />
            : tab === 'month' ? <BookMonth userId={userId} studentCode={null} day={day} busy={busy} readOnly={false} write={write}
              onSelectDay={changeDay} onChangeMonth={next => changeDay(next)} onOpenDay={d => { changeDay(d); setTab('day'); }} onEdit={editTask} />
            : <BookDay day={day} tasks={tasks} windowTasks={data.tasks} goals={data.goals} busy={busy} readOnly={false} write={write}
              onChangeDay={next => changeDay(next)} onEdit={t => { setTask(t); setPickForForm(false); }} onNew={() => newTask()}
              pickMode={pickForForm && !!task} onPick={(start, end) => { if (task) setTask({ ...task, start_time: start, end_time: end }); setPickForForm(false); }} onCancelPick={() => setPickForForm(false)}
              onCopyNext={t => { const next = offsetDay(day, 1); setTask({ ...t, id: undefined, task_date: next, completed: false, feedback: '' }); setDay(next); }}
              editor={taskForm ?? undefined} />)}
      </div>
    </div>
  </PlannerThemeProvider>;
}
