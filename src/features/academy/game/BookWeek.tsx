import { useState } from 'react';
import { usePlanDrag } from './usePlanDrag';
import { Trash2 } from 'lucide-react';
import { InkLine, QuillLine } from './InkLine';
import { PlanInfo } from './PlanInfo';
import { usePlannerWeek, type PlannerWrite } from '@/features/planner/usePlannerWeek';
import { offsetDay, weekLabel } from '@/features/planner/plannerModel';
import type { PlannerTask } from '@/features/planner/types';
import { usePlannerTheme } from './plannerTheme';

/**
 * 별빛 플래너 — 한 주 펼침면 (2026-10-03 사용자 요청: «오버홀 급 · 조작하는 재미 · 시각적 매력»).
 *
 * 왼쪽 쪽 = 이번 주의 별(진행 별자리) + 월·화·수, 오른쪽 쪽 = 목·금·토·일 — 실제 주간 플래너의 펼침면.
 * 조작: 깃펜 줄에 적고 Enter · 밀랍 인장을 «찍어» 완료 · 줄을 다른 요일로 끌어 옮기기 · 페이지 모서리로 주 넘기기.
 * 목표 리본(목표로 거르기 + 별자리 실)은 2026-10-04 사용자 결정으로 뺐다 — 대신 줄 옆 «i» 단추에 마우스를 올리면
 * 그 계획의 목표·날짜·시간·중요도·메모가 보인다(`PlanInfo`).
 * 읽기·옮기기·적기·가져오기는 일반 플래너와 같은 `usePlannerWeek` — 그림만 다르다.
 */
const LEFT = 3; // 왼쪽 쪽에 놓는 요일 수(월·화·수)

export function BookWeek({ userId, write, initialDay, busy, readOnly, studentCode, onOpenDay, onEdit, onFlip }: {
  userId: string; write: PlannerWrite; initialDay: string; busy: boolean; readOnly: boolean; studentCode: string | null;
  onOpenDay: (day: string) => void; onEdit: (task: PlannerTask) => void; onFlip?: (dir: 'next' | 'prev') => void;
}) {
  const { css, words } = usePlannerTheme();
  const week = usePlannerWeek({ userId, initialDay, write, studentCode, readOnly, busy });
  const { start, days, today, query, goals, tasks, done, overdue, locked, notice, byDay } = week;
  /** 지우기 확인 중인 줄 — 같은 쪽지 모양의 확인을 그 줄 아래에 붙인다(2026-10-03 사용자 요청 «이번 주에서도 지울 수 있게»). */
  const [removing, setRemoving] = useState<string | null>(null);
  const [turn, setTurn] = useState<'next' | 'prev' | null>(null);

  function flip(dir: 'next' | 'prev' | 'this') {
    if (busy) return;
    // 넘기기 «전에» 알린다 — 책이 지금 쪽의 사본을 떠서 넘기는 장을 만든다(상태를 바꾼 뒤면 이미 새 쪽이다).
    const towards = dir === 'prev' || (dir === 'this' && start > today) ? 'prev' : 'next';
    onFlip?.(towards);
    setTurn(onFlip ? null : towards);
    if (dir === 'prev') week.prevWeek(); else if (dir === 'next') week.nextWeek(); else week.thisWeek();
  }
  /**
   * 줄을 다른 요일로 끌어 옮기기 — 포인터 끌기(`usePlanDrag`, 월별 일정 쪽과 공용).
   * 종전 HTML5 끌기에서 페이지 전체가 멈췄다(2026-10-03 사용자 제보 — 이 책의 filter·3D 원근 아래에서 끌기 그림 뜨기).
   * 마우스는 바로, 휴대폰은 길게 눌러 집는다.
   */
  const drag = usePlanDrag({ disabled: locked || readOnly || busy, onDrop: (task, day) => void week.move(task, day) });
  const dragging = drag.dragging, dropDay = drag.overDay;

  const range = `${Number(days[0].slice(5, 7))}.${Number(days[0].slice(8))} – ${Number(days[6].slice(5, 7))}.${Number(days[6].slice(8))}`;
  const dayBlock = (day: string) => {
    const list = byDay(day);
    const date = new Date(`${day}T12:00:00`);
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return <article key={day} className={css.dayBlock} data-today={day === today} data-past={day < today} data-drop={dropDay === day} aria-label={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 ${weekday}요일`} data-drop-day={day}>
      <button type="button" className={css.dayTitle} onClick={() => onOpenDay(day)} title="이 날의 하루 쪽 펼치기">
        <b>{Number(day.slice(8))}</b><span>{weekday}</span>{day === today && <em>오늘</em>}{list.length > 0 && <small>{list.filter(t => t.completed).length}/{list.length}</small>}
      </button>
      <ul className={css.lines}>
        {list.map(task => [<InkLine key={task.id} task={task} locked={locked} readOnly={readOnly} onToggle={(t, next) => week.toggle(t, next)}
          onEdit={onEdit} info={<PlanInfo task={task} goals={goals} />} dragging={dragging === task.id} pressing={drag.pressing === task.id} onPointerDown={readOnly ? undefined : drag.begin}
          actions={readOnly ? undefined : <>
            <button type="button" aria-label={`${task.title} 하루 앞으로`} disabled={busy} onClick={() => void week.move(task, offsetDay(day, -1))}>‹</button>
            <button type="button" aria-label={`${task.title} 하루 뒤로`} disabled={busy} onClick={() => void week.move(task, offsetDay(day, 1))}>›</button>
            <button type="button" title="지우기" aria-label={`${task.title} 지우기`} aria-expanded={removing === task.id} disabled={busy} onClick={() => setRemoving(r => r === task.id ? null : task.id)}><Trash2 size={13} /></button>
          </>} />,
          removing === task.id && <li key={`${task.id}-rm`} className={css.stickyNote} data-tone="warn">
            <p>«{task.title}» 계획과 돌아보기 쪽지를 지울까요?</p>
            <div><button type="button" disabled={busy} onClick={async () => { if (await write('delete_task', { id: task.id }, { silent: true })) setRemoving(null); }}>계획 지우기</button><button type="button" disabled={busy} onClick={() => setRemoving(null)}>남겨 두기</button></div>
          </li>])}
      </ul>
      {!readOnly && <QuillLine label={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일에 할 일 적기`} placeholder={list.length ? '하나 더 적기…' : words.write} disabled={busy} onSubmit={text => week.add(day, text)} />}
    </article>;
  };

  return <div className={`${css.spreadInner} ${css.weekSpread}`} key={start} data-turn={turn ?? undefined} onAnimationEnd={e => { if (e.target === e.currentTarget) setTurn(null); }}>
    <section className={`${css.page} ${css.left}`} data-book-page="left" aria-label="왼쪽 쪽 · 이번 주의 별과 월·화·수">
      <header className={css.weekHead}>
        <span className={css.kicker}>{words.brand} · {range}</span>
        <h3>{weekLabel(start)}{days.includes(today) && <em>이번 주</em>}</h3>
        <div className={css.weekStars} role="img" aria-label={`이번 주 ${tasks.length}개 중 ${done}개 실천`}>
          {tasks.length ? tasks.map(t => <i key={t.id} data-lit={t.completed} />) : <small>아직 적힌 일이 없어요 — 아래 {words.line}에 하나 적어 보세요.</small>}
          {tasks.length > 0 && <b>{done} / {tasks.length}</b>}
        </div>
        {overdue.length > 0 && !readOnly && <p className={css.overdue}>지난 날에 남은 일 {overdue.length}개 <button type="button" disabled={busy} onClick={() => void week.bringOverdue()}>오늘로 옮겨 적기</button></p>}
        {notice && <p className={css.ribbonNote} role="status">{notice}</p>}
      </header>
      {query.isPending ? <p className={css.paperState} role="status">책장을 펼치는 중…</p> : query.isError && !query.data ? <p className={css.paperState} role="alert">이 주의 쪽을 펼치지 못했어요. <button type="button" onClick={() => void query.refetch()}>다시 펼치기</button></p> : days.slice(0, LEFT).map(dayBlock)}
    </section>
    <section className={`${css.page} ${css.right}`} data-book-page="right" aria-label="오른쪽 쪽 · 목·금·토·일">
      {!query.isPending && !(query.isError && !query.data) && days.slice(LEFT).map(dayBlock)}
      {!days.includes(today) && <button type="button" className={css.backToToday} disabled={busy} onClick={() => flip('this')}>이번 주로 돌아가기</button>}
    </section>
    <button type="button" className={`${css.corner} ${css.cornerPrev}`} disabled={busy} onClick={() => flip('prev')} aria-label="지난 주로 넘기기">‹ 지난 주</button>
    <button type="button" className={`${css.corner} ${css.cornerNext}`} disabled={busy} onClick={() => flip('next')} aria-label="다음 주로 넘기기">다음 주 ›</button>
    {drag.ghostLayer}
  </div>;
}

