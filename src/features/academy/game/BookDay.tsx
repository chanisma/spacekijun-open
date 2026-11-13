import { useState, type ReactNode } from 'react';
import { Clock, Copy, MessageSquare, Trash2 } from 'lucide-react';
import { offsetDay, seoulDay } from '@/features/planner/plannerModel';
import type { PlannerGoal, PlannerTask } from '@/features/planner/types';
import type { PlannerWrite } from '@/features/planner/usePlannerWeek';
import { BookPage, BookSpread } from './PlannerBook';
import { InkLine, QuillLine } from './InkLine';
import { useDayTimeline } from './DayTimeline';
import { usePlannerTheme } from './plannerTheme';

/**
 * 별빛 플래너 — 하루 쪽 (2026-10-03).
 * 왼쪽 쪽 = 큰 날짜 · 앞뒤 사흘 띠 · 할 일 목록(인장·고치기·다음 날에도·돌아보기 쪽지·지우기) · 깃펜 줄.
 * 오른쪽 쪽 = 그날의 시간표(DayTimeline) — 목록의 줄을 끌어 놓고, 블록을 목록으로 끌어 오면 시간이 지워진다.
 * 같은 날 사용자 결정: 시간별 계획은 따로 된 쪽이 아니라 하루 계획에 함께 · 달력은 «월별 일정» 쪽으로 · 코인·하늘 연동은 플래너에서 뺀다.
 * 자세히 적기·고치기의 양식(장 안내가 쓰는 칸 이름 그대로)은 기숙사 화면이 `editor` 로 넘긴다 — 왼쪽 쪽의 목록 자리에 펼쳐진다.
 */
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export function BookDay({ day, tasks, windowTasks, goals, busy, readOnly, write, onChangeDay, onEdit, onNew, onCopyNext, pickMode, onPick, onCancelPick, guides, editor, newGuide }: {
  day: string; tasks: PlannerTask[]; windowTasks: PlannerTask[]; goals: PlannerGoal[]; busy: boolean; readOnly: boolean;
  write: PlannerWrite; onChangeDay: (day: string, dir: 'next' | 'prev') => void; onEdit: (task: PlannerTask) => void; onNew: () => void;
  onCopyNext: (task: PlannerTask) => void; pickMode?: boolean; onPick?: (start: string, end: string) => void; onCancelPick?: () => void;
  guides?: ReactNode; editor?: ReactNode;
  /** 장 안내 중 «＋ 계획 적기» 를 눌러야 할 때 — 단추를 반짝이고 옆에 이 말을 붙인다(아카데미 전용). */
  newGuide?: ReactNode;
}) {
  const { css, words } = usePlannerTheme();
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const time = useDayTimeline({ day, tasks, busy, readOnly, write, onEdit, pickMode, onPick });
  const today = seoulDay();
  const date = new Date(`${day}T12:00:00`);
  const done = tasks.filter(t => t.completed).length;
  const locked = busy || readOnly;
  const strip = Array.from({ length: 7 }, (_, i) => offsetDay(day, i - 3));
  const sorted = [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed) || Number(!a.start_time) - Number(!b.start_time) || (a.start_time ?? '').localeCompare(b.start_time ?? ''));
  const goalTitle = (id: string | null) => goals.find(g => g.id === id)?.title;
  const untimed = tasks.filter(t => !t.start_time).length;

  return <BookSpread>
    <BookPage side="left" label="왼쪽 쪽 · 하루 계획">
      <header className={css.weekHead}>
        <span className={css.kicker}>{words.brand} · 하루</span>
        <h3 className={css.bigDate}>{date.getMonth() + 1}월 {date.getDate()}일 <small>{WEEKDAY[date.getDay()]}요일</small>{day === today && <em>오늘</em>}</h3>
        <div className={css.weekStars} role="img" aria-label={`이 날 ${tasks.length}개 중 ${done}개 실천`}>
          {tasks.length ? tasks.map(t => <i key={t.id} data-lit={t.completed} />) : <small>아직 빈 하루예요 — 아래 {words.line}에 하나 적어 보세요.</small>}
          {tasks.length > 0 && <b>{done} / {tasks.length}</b>}
        </div>
      </header>
      <nav className={css.strip} aria-label="앞뒤 사흘">
        {strip.map(d => { const list = windowTasks.filter(t => t.task_date === d); const dd = new Date(`${d}T12:00:00`);
          return <button key={d} type="button" aria-current={d === day ? 'date' : undefined} data-today={d === today} disabled={busy} onClick={() => onChangeDay(d, d > day ? 'next' : 'prev')} aria-label={`${dd.getMonth() + 1}월 ${dd.getDate()}일 펼치기`}>
            <span>{WEEKDAY[dd.getDay()]}</span><b>{dd.getDate()}</b><i>{list.map(t => <s key={t.id} data-lit={t.completed} />)}</i>
          </button>; })}
      </nav>
      {guides && <div className={css.guideNote}>{guides}</div>}
      {editor ? <div className={css.noteCard}>{editor}</div> : <div ref={time.listRef} className={css.dayList} data-drop={time.dropToList || undefined} aria-label="이 날의 할 일">
        <div className={css.pageActions}>
          <button type="button" className={css.inkButton} disabled={locked} onClick={onNew} data-guide={newGuide ? 'active' : undefined}>＋ 계획 적기</button>
          {newGuide ?? <span>시간·목표·메모까지 적으려면</span>}
        </div>
        <ul className={css.lines} aria-label="계획 목록">
          {sorted.map(task => [
            <InkLine key={task.id} task={task} locked={locked} readOnly={readOnly} selected={time.holding === task.id} onToggle={(t, next) => write('complete', { id: t.id, completed: next }, { silent: true })} onEdit={onEdit}
              onPointerDown={readOnly ? undefined : time.beginFromList}
              actions={readOnly ? <button type="button" title="돌아보기" aria-label={`${task.title} 피드백 보기`} onClick={() => setNote(note?.id === task.id ? null : { id: task.id, text: task.feedback ?? '' })}><MessageSquare size={14} /></button> : <>
                {!task.start_time && <button type="button" title="시간 정하기 — 누른 뒤 시간표의 자리를 누르세요" aria-pressed={time.holding === task.id} aria-label={`${task.title} 시간 정하기`} disabled={busy} onClick={() => time.setHolding(h => h === task.id ? null : task.id)}><Clock size={14} /></button>}
                <button type="button" title="다음 날에도 같은 계획" aria-label={`${task.title} 다음 날에도 같은 계획`} disabled={busy} onClick={() => onCopyNext(task)}><Copy size={14} /></button>
                <button type="button" title={task.feedback ? '돌아보기 쪽지 보기·고치기' : '돌아보기 쪽지 붙이기'} data-filled={!!task.feedback} aria-label={`${task.title} 피드백 ${task.feedback ? '보기·수정' : '적기'}`} aria-expanded={note?.id === task.id} disabled={busy} onClick={() => setNote(note?.id === task.id ? null : { id: task.id, text: task.feedback ?? '' })}><MessageSquare size={14} /></button>
                <button type="button" title="지우기" aria-label={`${task.title} 지우기`} disabled={busy} onClick={() => setRemoving(removing === task.id ? null : task.id)}><Trash2 size={14} /></button>
              </>} />,
            task.related_goal_id && <li key={`${task.id}-goal`} className={css.lineMeta}>✧ {goalTitle(task.related_goal_id) ?? '이어가는 목표'}{task.feedback && note?.id !== task.id ? ` · 쪽지: ${task.feedback}` : ''}</li>,
            !task.related_goal_id && task.feedback && note?.id !== task.id && <li key={`${task.id}-fb`} className={css.lineMeta}>쪽지: {task.feedback}</li>,
            note?.id === task.id && <li key={`${task.id}-note`} className={css.stickyNote}>
              <form onSubmit={async e => { e.preventDefault(); if (await write('save_feedback', { id: task.id, comment: note.text }, { silent: true })) setNote(null); }}>
                <label>실천하며 기억할 점<textarea readOnly={readOnly} maxLength={2000} value={note.text} onChange={e => setNote({ ...note, text: e.target.value })} placeholder="무엇이 잘 됐나요? 다음에는 어떻게 바꿔 볼까요?" /></label>
                {!readOnly && <div><button type="submit" disabled={busy}>쪽지 붙이기</button><button type="button" disabled={busy} onClick={() => setNote(null)}>떼어 두기</button></div>}
              </form>
            </li>,
            removing === task.id && <li key={`${task.id}-rm`} className={css.stickyNote} data-tone="warn">
              <p>이 계획과 돌아보기 쪽지를 지울까요?</p>
              <div><button type="button" disabled={busy} onClick={async () => { if (await write('delete_task', { id: task.id }, { silent: true })) setRemoving(null); }}>계획 지우기</button><button type="button" disabled={busy} onClick={() => setRemoving(null)}>남겨 두기</button></div>
            </li>,
          ])}
        </ul>
        {!readOnly && <QuillLine label={`${date.getMonth() + 1}월 ${date.getDate()}일에 할 일 적기`} placeholder={tasks.length ? '하나 더 적기…' : words.write} disabled={busy}
          onSubmit={text => write('save_task', { title: text, task_date: day, priority: 'medium', related_goal_id: '', memo: '', start_time: '', end_time: '' }, { silent: true })} />}
        <p className={css.pageTip}>{time.holdingTask ? `«${time.holdingTask.title}» 를 들었어요 — 시간표의 자리를 누르면 그 시각에 놓여요.`
          : `가장 중요한 일은 하루 1~2개 · 쓸 수 있는 시간의 20~30%는 여유로 남겨 두세요.${tasks.filter(t => t.priority === 'high').length > 2 ? ' 중요한 일이 많네요. 꼭 끝낼 한두 개를 다시 골라 볼까요?' : ''}`}</p>
      </div>}
    </BookPage>

    <BookPage side="right" label="오른쪽 쪽 · 하루 시간표">
      {pickMode ? <div className={css.guideNote} role="status">
        <p><b>계획의 시간을 고르는 중이에요.</b> 시간표에서 시작부터 끝까지 끌거나, 시각을 눌러 한 시간을 고르세요.</p>
        <button type="button" className={css.inkButton} onClick={onCancelPick}>고르지 않고 돌아가기</button>
      </div> : <p className={css.timeHint}>{untimed ? `시간이 없는 일 ${untimed}개 — 할 일 줄을 시간표로 끌어 놓아 보세요.` : '빈자리를 위에서 아래로 끌면 그 시간에 새 계획이 생겨요.'}</p>}
      {time.timeline}
      <p className={css.pageTip}>{pickMode ? '끈 구간이 양식의 시작·마침이 돼요.' : '블록을 끌어 옮기고, 아래 손잡이로 늘여요. 할 일 목록으로 끌어 오면 시간이 지워져요.'}</p>
    </BookPage>
    <button type="button" className={`${css.corner} ${css.cornerPrev}`} disabled={busy} onClick={() => onChangeDay(offsetDay(day, -1), 'prev')} aria-label="전날로 넘기기">‹ 전날</button>
    <button type="button" className={`${css.corner} ${css.cornerNext}`} disabled={busy} onClick={() => onChangeDay(offsetDay(day, 1), 'next')} aria-label="다음 날로 넘기기">다음 날 ›</button>
  </BookSpread>;
}
