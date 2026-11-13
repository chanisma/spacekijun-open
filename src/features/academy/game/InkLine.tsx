import { useState, type FormEvent, type PointerEvent, type ReactNode } from 'react';
import { goalColor } from '@/features/planner/plannerModel';
import type { PlannerTask } from '@/features/planner/types';
import { usePlannerTheme } from './plannerTheme';

/**
 * 별빛 플래너의 잉크 줄 한 줄 (2026-10-03) — 이번 주·하루·목표·시간표 쪽이 함께 쓴다.
 * 밀랍 인장(누르면 «쿵» 찍힘) + 깃펜 글씨(누르면 자세히 고치기) + 끝의 작은 동작들.
 * 인장은 `role="checkbox"` 라 화면 읽기·검사가 일반 체크 상자처럼 다룬다.
 */
export function InkLine({ task, locked, readOnly, onToggle, onEdit, actions, info, onPointerDown, dragging, pressing, selected, showTime = true }: {
  task: PlannerTask; locked: boolean; readOnly: boolean;
  onToggle: (task: PlannerTask, next: boolean) => void | Promise<unknown>;
  onEdit?: (task: PlannerTask) => void;
  actions?: ReactNode; dragging?: boolean; selected?: boolean;
  /** 줄 끝에 늘 보이는 작은 단추(예: 이번 주 쪽의 «정보» — `PlanInfo`). `actions` 와 달리 마우스를 올리지 않아도 보인다. */
  info?: ReactNode;
  /** 휴대폰에서 길게 누르는 중 — 곧 집힌다는 표시(`usePlanDrag`). */
  pressing?: boolean; showTime?: boolean;
  /**
   * 줄 끌기 — 이번 주(다른 요일로)·하루 쪽(시간표로) 모두 **포인터 끌기**다. HTML5 draggable 을 되살리지 말 것:
   * 이 책의 filter·3D 원근 아래에서 브라우저가 끌기 그림을 뜨다 페이지 전체가 멈췄다(2026-10-03 사용자 제보).
   */
  onPointerDown?: (event: PointerEvent<HTMLLIElement>, task: PlannerTask) => void;
}) {
  const { css } = usePlannerTheme();
  const [stamped, setStamped] = useState(false);
  const goal = task.related_goal_id;
  return <li className={css.line} data-complete={task.completed} data-dragging={dragging} data-pressing={pressing || undefined} data-selected={selected}
    onPointerDown={onPointerDown ? e => onPointerDown(e, task) : undefined} data-timeable={onPointerDown ? true : undefined}>
    <button type="button" role="checkbox" aria-checked={task.completed} className={css.seal} data-stamped={stamped} data-seal-goal={goal ?? undefined}
      style={goal ? { ['--goal' as string]: goalColor(goal) } : undefined} disabled={locked}
      aria-label={`${task.title} ${task.completed ? '완료 취소' : '완료'}`}
      onClick={() => { if (!task.completed) setStamped(true); void onToggle(task, !task.completed); }} onAnimationEnd={() => setStamped(false)}>
      <span aria-hidden="true">{task.completed ? '✦' : ''}</span>
    </button>
    <div role="button" tabIndex={readOnly || !onEdit ? -1 : 0} className={css.ink} title={onEdit && !readOnly ? '자세히 고쳐 적기' : undefined}
      onClick={() => { if (!readOnly) onEdit?.(task); }} onKeyDown={e => { if (!readOnly && onEdit && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onEdit(task); } }}>
      <span>{task.priority === 'high' && <i className={css.mark} aria-label="가장 중요한 일">★</i>}{task.title}</span>
      {showTime && task.start_time && <time>{task.start_time.slice(0, 5)}–{task.end_time?.slice(0, 5)}</time>}
    </div>
    {(info || actions) && <span className={css.lineEnd}>{info}{actions && <span className={css.nudge}>{actions}</span>}</span>}
  </li>;
}

/** 깃펜 줄 — 적고 Enter. 비우는 것은 저장이 성공했을 때만(실패하면 쓴 글이 남는다). */
export function QuillLine({ label, placeholder, disabled, onSubmit }: { label: string; placeholder: string; disabled: boolean; onSubmit: (text: string) => Promise<boolean> }) {
  const { css } = usePlannerTheme();
  const [text, setText] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || disabled) return;
    if (await onSubmit(text.trim())) setText('');
  }
  return <form className={css.quill} onSubmit={e => void submit(e)}>
    <span aria-hidden="true">✒</span>
    <input value={text} disabled={disabled} maxLength={200} placeholder={placeholder} aria-label={label} onChange={e => setText(e.target.value)} />
  </form>;
}
