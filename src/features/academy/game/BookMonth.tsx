import { useState } from 'react';
import { goalColor, movePayload, seoulDay } from '@/features/planner/plannerModel';
import type { PlannerTask } from '@/features/planner/types';
import type { PlannerWrite } from '@/features/planner/usePlannerWeek';
import { shiftMonth, usePlannerMonth } from '@/features/planner/usePlannerMonth';
import { BookPage, BookSpread } from './PlannerBook';
import { InkLine, QuillLine } from './InkLine';
import { usePlanDrag } from './usePlanDrag';
import { usePlannerTheme } from './plannerTheme';

/**
 * 별빛 플래너 — 월별 일정 쪽 (2026-10-03, 사용자 결정 «월별 일정을 다루는 기능을 따로 빼고»).
 * 종전엔 하루 쪽 왼편의 작은 달력이 «날짜 고르기» 도구였다. 이제 한 달이 한 쪽을 차지한다:
 *   왼쪽 쪽 = 월요일 시작 6주 칸 — 칸마다 그날의 일 두 개까지(목표 색 띠) · 고른 날은 진하게.
 *   오른쪽 쪽 = 고른 날의 일(인장·고치기) · 그날에 바로 적기 · 하루 계획으로 펼치기 · 이 달 목표별 실천.
 * 고른 날은 기숙사 화면의 `day` 하나를 같이 쓴다 — 하루 쪽으로 넘어가면 같은 날이 펼쳐진다.
 *
 * 계획 옮기기(2026-10-03 사용자 요청 «월별 일정에서도 DnD — 계획을 달력의 원하는 날짜로»): 오른쪽 쪽의 줄이나
 * 달력 칸 안의 계획 칩을 끌어 다른 칸에 놓는다. 이번 주 쪽과 같은 `usePlanDrag`(마우스는 바로, 휴대폰은 길게 눌러 집기).
 * 고른 날은 바꾸지 않는다 — 한 날의 계획을 여러 개 연달아 흩어 놓는 것이 흔한 쓰임이다.
 */
const WEEK = ['월', '화', '수', '목', '금', '토', '일'];
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export function BookMonth({ userId, studentCode, day, busy, readOnly, write, onSelectDay, onChangeMonth, onOpenDay, onEdit }: {
  userId: string; studentCode: string | null; day: string; busy: boolean; readOnly: boolean; write: PlannerWrite;
  onSelectDay: (day: string) => void; onChangeMonth: (day: string, dir: 'next' | 'prev') => void; onOpenDay: (day: string) => void; onEdit: (task: PlannerTask) => void;
}) {
  const { css, words } = usePlannerTheme();
  const month = usePlannerMonth({ userId, day, studentCode });
  const today = seoulDay();
  const ym = day.slice(0, 7);
  const inMonth = month.tasks.filter(t => t.task_date.startsWith(ym));
  const done = inMonth.filter(t => t.completed).length;
  const of = (d: string) => month.tasks.filter(t => t.task_date === d).sort((a, b) => Number(a.completed) - Number(b.completed) || (a.start_time ?? '99').localeCompare(b.start_time ?? '99'));
  const picked = of(day);
  const date = new Date(`${day}T12:00:00`);
  const locked = busy || readOnly;
  const [moved, setMoved] = useState<string | null>(null);
  const drag = usePlanDrag({ disabled: locked, onDrop: async (task, to) => {
    const d = new Date(`${to}T12:00:00`);
    if (await write('save_task', movePayload(task, to), { silent: true })) setMoved(`«${task.title}» 을(를) ${d.getMonth() + 1}월 ${d.getDate()}일로 옮겼어요.`);
  } });
  const goalRows = month.goals.filter(g => !g.is_archived).map(g => ({ goal: g, list: inMonth.filter(t => t.related_goal_id === g.id) })).filter(r => r.list.length);

  return <BookSpread>
    <BookPage side="left" label="왼쪽 쪽 · 한 달의 칸">
      <header className={css.weekHead}>
        <span className={css.kicker}>{words.brand} · 월별 일정</span>
        <h3>{Number(ym.slice(0, 4))}년 {Number(ym.slice(5, 7))}월{today.startsWith(ym) && <em>이번 달</em>}</h3>
        <p className={css.ribbonNote}>{month.isPending ? '이 달의 기록을 펼치고 있어요…' : inMonth.length ? `이 달 ${inMonth.length}개 중 ${done}개 실천` : '아직 이 달에 적은 일이 없어요. 날짜를 골라 적어 보세요.'}</p>
      </header>
      <div className={css.monthGrid} role="grid" aria-label={`${Number(ym.slice(5, 7))}월 달력`}>
        {WEEK.map(w => <span key={w} className={css.monthHead} role="columnheader">{w}</span>)}
        {month.days.map(d => { const list = of(d); const dd = new Date(`${d}T12:00:00`);
          return <button key={d} type="button" role="gridcell" className={css.monthCell} aria-pressed={d === day} data-out={!d.startsWith(ym) || undefined} data-today={d === today || undefined} data-drop-day={d} data-drop={drag.overDay === d || undefined}
            aria-label={`${dd.getMonth() + 1}월 ${dd.getDate()}일${list.length ? ` · 할 일 ${list.length}개` : ''}`} disabled={busy} onClick={() => onSelectDay(d)} onDoubleClick={() => onOpenDay(d)}>
            <b>{dd.getDate()}</b>
            {list.slice(0, 2).map(t => <span key={t.id} data-complete={t.completed} data-drag-chip={locked ? undefined : true} data-dragging={drag.dragging === t.id || undefined} onPointerDown={locked ? undefined : e => drag.begin(e, t)} style={t.related_goal_id ? { ['--goal' as string]: goalColor(t.related_goal_id) } : undefined}>{t.title}</span>)}
            {list.length > 2 && <small>+{list.length - 2}</small>}
          </button>; })}
      </div>
      {!today.startsWith(ym) && <button type="button" className={css.inkButton} disabled={busy} onClick={() => onChangeMonth(today, today > day ? 'next' : 'prev')}>이번 달로 돌아가기</button>}
    </BookPage>

    <BookPage side="right" label="오른쪽 쪽 · 고른 날">
      <header className={css.weekHead}>
        <span className={css.kicker}>고른 날</span>
        <h3>{date.getMonth() + 1}월 {date.getDate()}일 <small className={css.daySmall}>{WEEKDAY[date.getDay()]}요일</small>{day === today && <em>오늘</em>}</h3>
      </header>
      {picked.length ? <ul className={css.lines} aria-label="고른 날의 할 일">
        {picked.map(t => <InkLine key={t.id} task={t} locked={locked} readOnly={readOnly} onToggle={(task, next) => write('complete', { id: task.id, completed: next }, { silent: true })} onEdit={onEdit}
          dragging={drag.dragging === t.id} pressing={drag.pressing === t.id} onPointerDown={locked ? undefined : drag.begin} />)}
      </ul> : <p className={css.paperState}>이 날은 비어 있어요.</p>}
      {!readOnly && picked.length > 0 && <p className={css.dragHint}>줄을 끌어 왼쪽 달력의 다른 날에 놓으면 옮겨져요. 휴대폰은 길게 눌러 집어요.</p>}
      {moved && <p className={css.ribbonNote} role="status">{moved}</p>}
      {!readOnly && <QuillLine label={`${date.getMonth() + 1}월 ${date.getDate()}일에 할 일 적기`} placeholder="이 날에 할 일 적기…" disabled={busy}
        onSubmit={text => write('save_task', { title: text, task_date: day, priority: 'medium', related_goal_id: '', memo: '', start_time: '', end_time: '' }, { silent: true })} />}
      <button type="button" className={css.inkButton} disabled={busy} onClick={() => onOpenDay(day)}>이 날 하루 계획 펼치기</button>
      {goalRows.length > 0 && <section className={css.monthGoals} aria-label="이 달 목표별 실천">
        <h4>이 달 목표별 실천</h4>
        <ul>{goalRows.map(({ goal, list }) => <li key={goal.id} style={{ ['--goal' as string]: goalColor(goal.id) }}>
          <span>{goal.title}</span><b>{list.filter(t => t.completed).length} / {list.length}</b>
          <i style={{ ['--fill' as string]: `${Math.round(list.filter(t => t.completed).length / list.length * 100)}%` }} />
        </li>)}</ul>
      </section>}
    </BookPage>
    {drag.ghostLayer}
    <button type="button" className={`${css.corner} ${css.cornerPrev}`} disabled={busy} onClick={() => onChangeMonth(shiftMonth(day, -1), 'prev')} aria-label="지난 달로 넘기기">‹ 지난 달</button>
    <button type="button" className={`${css.corner} ${css.cornerNext}`} disabled={busy} onClick={() => onChangeMonth(shiftMonth(day, 1), 'next')} aria-label="다음 달로 넘기기">다음 달 ›</button>
  </BookSpread>;
}
