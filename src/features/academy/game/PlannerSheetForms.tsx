import type { PlannerGoal, PlannerTask } from '@/features/planner/types';
import { GOAL_LABELS, goalHorizon, goalTree, validPlanTimes } from '@/features/planner/plannerModel';
import { usePlannerTheme } from './plannerTheme';

/**
 * 플래너의 «자세히 적기» 양식 두 장 — 계획 · 목표 (2026-10-03 기숙사 화면에서 꺼냄).
 * 아카데미 «별빛 플래너» 와 일반 플래너(`/planner`)가 함께 쓴다 — 칸·검증·문구가 한 벌이어야
 * 두 플래너에서 같은 계획이 같은 모양으로 저장된다. 모양(클래스)은 테마의 `formCss` 가 정한다.
 * 저장은 부르는 쪽이 한다(아카데미 = 기숙사 기록 · 장 안내, 일반 = 토스트).
 */

/**
 * 계획 양식의 목표 고르기 — 장기 목표마다 묶음(optgroup)으로, 그 안에 장기 목표 자신과 단기 목표들.
 * 보관한 목표는 이미 골라져 있을 때만 보인다(고를 수는 없다).
 */
export function goalPickerGroups(goals: PlannerGoal[], current: string | null) {
  const visible = (g: PlannerGoal) => !g.is_archived || g.id === current;
  const label = (g: PlannerGoal) => g.title + (g.is_completed ? ' · 이룬 목표' : '') + (g.is_archived ? ' · 보관함' : '');
  const tree = goalTree(goals);
  const groups = tree.longs.filter(visible).map(long => <optgroup key={long.id} label={GOAL_LABELS.long + ' · ' + long.title}>
    <option value={long.id} disabled={long.is_archived}>{label(long)} ({GOAL_LABELS.long})</option>
    {tree.childrenOf(long.id).filter(visible).map(g => <option key={g.id} value={g.id} disabled={g.is_archived}>{label(g)}</option>)}
  </optgroup>);
  const loose = tree.loose.filter(visible);
  if (!loose.length) return groups;
  const options = loose.map(g => <option key={g.id} value={g.id} disabled={g.is_archived}>{label(g)}</option>);
  return [...groups, tree.longs.length ? <optgroup key="loose" label={GOAL_LABELS.short}>{options}</optgroup> : options];
}

export function TaskSheetForm({ task, onChange, goals, busy, readOnly, picking, onPickTime, requireTime, onSubmit, onCancel, onInvalid }: {
  task: Partial<PlannerTask>; onChange: (next: Partial<PlannerTask>) => void; goals: PlannerGoal[];
  busy: boolean; readOnly: boolean; picking: boolean; onPickTime: () => void;
  /** 장 안내(제1장 «목표를 위한 첫 실천»)는 시간을 꼭 받는다. */
  requireTime?: boolean;
  onSubmit: () => void; onCancel: () => void; onInvalid: (message: string) => void;
}) {
  const { formCss: css } = usePlannerTheme();
  return <form className={css.form} onSubmit={e => { e.preventDefault(); if (!validPlanTimes(task.start_time || '', task.end_time || '')) { onInvalid('시작과 종료 시간을 함께 적고, 종료를 더 늦게 정해 주세요.'); return; } onSubmit(); }}>
    <label>무엇을 해볼까요?<input required maxLength={200} value={task.title || ''} onChange={e => onChange({ ...task, title: e.target.value })} /></label>
    {/* 어떤 목표의 계획인가 — «이어갈 계획»(창가의 하늘의 별 잇기)은 2026-10-03 사용자 결정으로 걷었다. 고칠 때도 바꿀 수 있다(plan_write 20261003170000). */}
    <label>어떤 목표의 계획인가요?<select aria-label="어떤 목표의 계획인가요?" value={task.related_goal_id || ''} onChange={e => onChange({ ...task, related_goal_id: e.target.value, ...(task.id ? {} : { plan_id: undefined }) })}><option value="">목표 없이 작은 실천</option>{goalPickerGroups(goals, task.related_goal_id ?? null)}</select></label>
    <div className={css.timeFields}>
      <label>시작<input type="time" required={requireTime} value={task.start_time || ''} onChange={e => onChange({ ...task, start_time: e.target.value })} /></label>
      <label>마침<input type="time" required={requireTime} value={task.end_time || ''} onChange={e => onChange({ ...task, end_time: e.target.value })} /></label>
      <button type="button" className={css.pickTime} disabled={busy} aria-pressed={picking} onClick={onPickTime}><span aria-hidden="true">◷</span>시간표에서 고르기</button>
    </div>
    <small>시간을 비우면 언제든 실천할 수 있어요. 옆 쪽 시간표에서 빈자리를 끌어 시작·마침을 한 번에 정할 수도 있어요.</small>
    <label>중요도<select value={task.priority || 'medium'} onChange={e => onChange({ ...task, priority: e.target.value })}><option value="high">★ 가장 중요한 일</option><option value="medium">차근차근 해볼게요</option><option value="low">여유가 있다면</option></select></label>
    <label>나에게 남기는 메모<textarea maxLength={2000} value={task.memo || ''} onChange={e => onChange({ ...task, memo: e.target.value })} /></label>
    <div className={css.actions}><button disabled={busy || readOnly}>플래너에 기록</button><button type="button" disabled={busy} onClick={onCancel}>접기</button></div>
  </form>;
}

export function GoalSheetForm({ goal, onChange, goals, busy, readOnly, requireReason, onSubmit, onCancel }: {
  goal: Partial<PlannerGoal>; onChange: (next: Partial<PlannerGoal>) => void; goals: PlannerGoal[];
  busy: boolean; readOnly: boolean;
  /** 장 안내(제3장 «내가 직접 할 수 있는 작은 목표»)는 세운 이유를 꼭 받는다. */
  requireReason?: boolean;
  onSubmit: () => void; onCancel: () => void;
}) {
  const { formCss: css } = usePlannerTheme();
  const longs = goals.filter(g => goalHorizon(g) === 'long' && !g.is_archived && g.id !== goal.id);
  return <form className={css.form} onSubmit={e => { e.preventDefault(); onSubmit(); }}>
    <label>알아가고 싶거나 달성하고 싶은 목표<input required maxLength={200} value={goal.title || ''} onChange={e => onChange({ ...goal, title: e.target.value })} /></label>
    <fieldset className={css.horizonPick}><legend>어떤 목표인가요?</legend>{(['long', 'short'] as const).map(h => <label key={h}>
      <input type="radio" name="goal-horizon" checked={goalHorizon(goal) === h} disabled={!!goal.id && h === 'short' && goals.some(g => g.parent_goal_id === goal.id)} onChange={() => onChange({ ...goal, horizon: h, parent_goal_id: h === 'long' ? null : goal.parent_goal_id ?? null })} />
      {GOAL_LABELS[h]}<small>{h === 'long' ? '몇 달·몇 년을 두고 가는 큰 그림' : '이번 달·이번 학기에 닿을 걸음'}</small>
    </label>)}</fieldset>
    {goalHorizon(goal) === 'short' && longs.length > 0 && <label>묶을 {GOAL_LABELS.long}<select aria-label={`묶을 ${GOAL_LABELS.long}`} value={goal.parent_goal_id ?? ''} onChange={e => onChange({ ...goal, parent_goal_id: e.target.value || null })}><option value="">묶지 않음</option>{longs.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label>}
    <label>이 목표를 세운 이유<textarea required={requireReason} maxLength={2000} value={goal.description || ''} onChange={e => onChange({ ...goal, description: e.target.value })} /></label>
    <small>“매일 영어 단어 10개 외우기”처럼 스스로 확인할 수 있는 행동으로 적어 보세요.</small>
    <div className={css.actions}><button disabled={busy || readOnly}>목표 기록</button><button type="button" disabled={busy} onClick={onCancel}>접기</button></div>
  </form>;
}
