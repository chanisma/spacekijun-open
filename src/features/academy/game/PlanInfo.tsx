import { useId } from 'react';
import { GOAL_LABELS, goalColor } from '@/features/planner/plannerModel';
import type { PlannerGoal, PlannerTask } from '@/features/planner/types';
import { usePlannerTheme } from './plannerTheme';

const PRIORITY: Record<string, string> = { high: '가장 중요한 일', medium: '보통', low: '여유 있게' };

/**
 * 계획 줄 옆 «정보» 단추 (2026-10-04 사용자 요청 — 이번 주 쪽의 목표 거르기를 없애고, 계획 옆 작은 단추에
 * 마우스를 올리면 정보가 보이게).
 *
 * 카드는 CSS 로만 펼친다 — 단추에 마우스를 올리거나(hover) 포커스가 가면(키보드 Tab · 휴대폰 탭) 보인다.
 * 그래서 마우스가 없는 휴대폰에서도 탭 한 번이면 열린다(Radix Tooltip 은 터치를 무시해 이 저장소에서 금지 — CLAUDE.md §4).
 * 카드에 제목은 다시 적지 않는다 — 바로 옆 줄에 있고, 두 번 적으면 «제목으로 찾기»가 둘을 찾는다.
 * 카드는 화면 읽기 프로그램에도 `aria-describedby` 로 같은 내용을 읽어 준다.
 */
export function PlanInfo({ task, goals }: { task: PlannerTask; goals: PlannerGoal[] }) {
  const { css } = usePlannerTheme();
  const id = useId();
  const goal = task.related_goal_id ? goals.find(g => g.id === task.related_goal_id) : null;
  const date = new Date(`${task.task_date}T12:00:00`);
  const day = `${date.getMonth() + 1}월 ${date.getDate()}일 ${['일', '월', '화', '수', '목', '금', '토'][date.getDay()]}요일`;
  const time = task.start_time ? `${task.start_time.slice(0, 5)}${task.end_time ? `–${task.end_time.slice(0, 5)}` : ''}` : '시간 미정';
  return <span className={css.planInfo}>
    <button type="button" className={css.planInfoButton} aria-label={`${task.title} 정보`} aria-describedby={id}>i</button>
    <span id={id} role="tooltip" className={css.planInfoCard}>
      <span><em>{goal ? GOAL_LABELS[goal.horizon === 'long' ? 'long' : 'short'] : '목표'}</em>
        {goal ? <><i style={{ background: goalColor(goal.id) ?? undefined }} aria-hidden="true" />{goal.title}{goal.is_completed ? ' · 이룸' : goal.is_archived ? ' · 보관함' : ''}</> : '이어진 목표 없음'}</span>
      <span><em>날짜</em>{day}</span>
      <span><em>시간</em>{time}</span>
      <span><em>중요도</em>{PRIORITY[task.priority] ?? task.priority}</span>
      <span><em>상태</em>{task.completed ? '완료' : '예정'}</span>
      {task.memo?.trim() && <span className={css.planInfoMemo}><em>메모</em>{task.memo.trim()}</span>}
    </span>
  </span>;
}
