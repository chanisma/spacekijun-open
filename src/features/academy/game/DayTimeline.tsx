import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Eraser } from 'lucide-react';
import { goalColor, seoulDay } from '@/features/planner/plannerModel';
import { layoutTimedTasks, minuteOfDay, minuteTime } from '@/features/planner/timelineModel';
import type { PlannerTask } from '@/features/planner/types';
import type { PlannerWrite } from '@/features/planner/usePlannerWeek';
import { DAY_SCALE, blockBox, durationOf, minuteAt, placeRange, snapMinute, timePayload } from './timeScale';
import { usePlannerTheme } from './plannerTheme';

/**
 * 별빛 플래너 — 하루 쪽의 시간표 (2026-10-03).
 * 처음엔 서랍 → 책의 넷째 쪽(«시간별 계획»)이었는데, 같은 날 사용자 결정으로 **하루 계획 안으로** 들어왔다:
 * 왼쪽 쪽의 할 일 목록이 곧 «쟁반»이고, 오른쪽 쪽이 06–24시 세로 시간표다.
 *   목록의 줄을 끌어 시간표에 놓기 · 블록을 끌어 옮기기 · 아래 손잡이로 늘이기 · 블록을 왼쪽 목록으로 끌어 오면 시간 지우기 ·
 *   빈자리를 위에서 아래로 끌면 그 시간에 새 계획(깃펜 칸이 그 자리에 뜬다) · 터치는 «시간 정하기»로 들고 시간표를 누른다.
 * «자세히 적기» 양식이 시간을 물으면(pickMode) 끈 구간이 양식의 시작·마침으로 돌아간다.
 * 자리 계산은 전부 timeScale.ts — 여기서는 포인터를 읽고 그리기만 한다.
 */
const SCALE = DAY_SCALE;
const COLUMN_HEIGHT = (SCALE.endHour - SCALE.startHour) * 60 * SCALE.pxPerMinute;
const HOURS = Array.from({ length: SCALE.endHour - SCALE.startHour }, (_, i) => SCALE.startHour + i);
const LAST_END = 23 * 60 + 45;
const MOVE_THRESHOLD = 4;

type Drag =
  | { kind: 'list'; task: PlannerTask; x: number; y: number; moved: boolean }
  | { kind: 'move'; task: PlannerTask; y: number; start: number; duration: number; moved: boolean }
  | { kind: 'resize'; task: PlannerTask; y: number; start: number; end: number; moved: boolean }
  | { kind: 'range'; anchor: number; y: number; moved: boolean };
interface Preview { taskId?: string; start: number; end: number; overList?: boolean }

export function useDayTimeline({ day, tasks, busy, readOnly, write, onEdit, pickMode, onPick }: {
  day: string; tasks: PlannerTask[]; busy: boolean; readOnly: boolean; write: PlannerWrite;
  onEdit: (task: PlannerTask) => void; pickMode?: boolean; onPick?: (start: string, end: string) => void;
}) {
  const { css } = usePlannerTheme();
  const columnRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** 왼쪽 쪽의 할 일 목록 — 블록을 여기로 끌어 오면 시간이 지워진다. */
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string } | null>(null);
  const [holding, setHolding] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null);
  const [draftText, setDraftText] = useState('');
  /** 저장이 돌아오기 전까지 블록이 옛 자리로 튀지 않게 잠깐 쥐고 있는 값. */
  const [pending, setPending] = useState<Record<string, { start: string; end: string }>>({});
  const locked = busy || readOnly;
  const today = seoulDay();

  const shown = useMemo(() => tasks.map(t => pending[t.id] ? { ...t, start_time: pending[t.id].start || null, end_time: pending[t.id].end || null } : t), [tasks, pending]);
  const blocks = layoutTimedTasks(shown);
  const holdingTask = shown.find(t => t.id === holding) ?? null;

  useEffect(() => { setPending({}); }, [tasks]);
  useEffect(() => { setHolding(null); setDraft(null); }, [day]);
  // 처음 펼치면 첫 계획(없으면 8시, 오늘이면 지금 한 시간 전) 근처로 — 06시부터 보이면 아침 빈칸만 한가득이다.
  useLayoutEffect(() => {
    const first = Math.min(...blocks.map(b => b.start), day === today ? minuteOfDay(new Date().toTimeString().slice(0, 5)) - 60 : 8 * 60);
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (first - SCALE.startHour * 60) * SCALE.pxPerMinute - 24);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  async function saveTime(task: PlannerTask, start: string, end: string) {
    setPending(p => ({ ...p, [task.id]: { start, end } }));
    const ok = await write('save_task', timePayload(task, start, end), { silent: true });
    if (!ok) setPending(p => { const next = { ...p }; delete next[task.id]; return next; });
  }
  function place(task: PlannerTask, minute: number) {
    const range = placeRange(minute, durationOf(task), SCALE);
    setHolding(null);
    void saveTime(task, range.start, range.end);
  }
  function openRange(from: number, to: number) {
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const range = placeRange(lo, Math.max(SCALE.step, hi - lo), SCALE);
    if (pickMode) { onPick?.(range.start, range.end); return; }
    if (readOnly) return;
    setDraft({ start: minuteOfDay(range.start), end: minuteOfDay(range.end) });
    setDraftText('');
  }
  /** 빈자리를 누르거나 시각 단추를 눌렀을 때 — 든 계획이 있으면 놓고, 없으면 그 시각에 한 시간짜리 새 계획. */
  function tapMinute(minute: number) {
    if (holdingTask && !pickMode) { place(holdingTask, minute); return; }
    openRange(minute, minute + 60);
  }

  const minuteFromY = (clientY: number) => minuteAt(clientY - (columnRef.current?.getBoundingClientRect().top ?? 0), SCALE);
  const inside = (el: HTMLElement | null, x: number, y: number) => { const r = el?.getBoundingClientRect(); return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  const resizedEnd = (d: { start: number; end: number; y: number }, clientY: number) => Math.max(d.start + SCALE.step, Math.min(LAST_END, snapMinute(d.end + (clientY - d.y) / SCALE.pxPerMinute, SCALE.step)));

  function begin(event: ReactPointerEvent, drag: Drag) {
    if (event.button !== 0) return;
    dragRef.current = drag;
    const move = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      if (!d.moved && Math.abs(e.clientY - d.y) < MOVE_THRESHOLD && (d.kind !== 'list' || Math.abs(e.clientX - d.x) < MOVE_THRESHOLD)) return;
      d.moved = true;
      if (d.kind === 'list') {
        setGhost({ x: e.clientX, y: e.clientY, title: d.task.title });
        if (inside(columnRef.current, e.clientX, e.clientY)) { const r = placeRange(minuteFromY(e.clientY), durationOf(d.task), SCALE); setPreview({ taskId: d.task.id, start: minuteOfDay(r.start), end: minuteOfDay(r.end) }); }
        else setPreview(null);
      } else if (d.kind === 'move') {
        const r = placeRange(d.start + (e.clientY - d.y) / SCALE.pxPerMinute, d.duration, SCALE);
        setPreview({ taskId: d.task.id, start: minuteOfDay(r.start), end: minuteOfDay(r.end), overList: inside(listRef.current, e.clientX, e.clientY) });
      } else if (d.kind === 'resize') {
        setPreview({ taskId: d.task.id, start: d.start, end: resizedEnd(d, e.clientY) });
      } else {
        const now = minuteFromY(e.clientY);
        setPreview({ start: Math.min(d.anchor, now), end: Math.max(d.anchor, now) + SCALE.step });
      }
    };
    const finish = (e: PointerEvent, cancelled: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      const d = dragRef.current; dragRef.current = null;
      setGhost(null); setPreview(null);
      if (!d || cancelled) return;
      if (d.kind === 'list') {
        // 움직이지 않은 누름은 줄의 원래 동작(고쳐 적기)에 맡긴다.
        if (d.moved && inside(columnRef.current, e.clientX, e.clientY)) place(d.task, minuteFromY(e.clientY));
      } else if (d.kind === 'move') {
        if (!d.moved) { onEdit(d.task); return; }
        if (inside(listRef.current, e.clientX, e.clientY)) { void saveTime(d.task, '', ''); return; }
        const r = placeRange(d.start + (e.clientY - d.y) / SCALE.pxPerMinute, d.duration, SCALE);
        void saveTime(d.task, r.start, r.end);
      } else if (d.kind === 'resize') {
        if (d.moved) void saveTime(d.task, minuteTime(d.start), minuteTime(resizedEnd(d, e.clientY)));
      } else {
        if (!d.moved) { tapMinute(d.anchor); return; }
        openRange(d.anchor, minuteFromY(e.clientY) + SCALE.step);
      }
    };
    const up = (e: PointerEvent) => finish(e, false);
    const cancel = (e: PointerEvent) => finish(e, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }
  /** 왼쪽 목록의 줄에서 끌기 시작 — 단추(인장·작은 동작) 위에서는 시작하지 않는다. */
  function beginFromList(event: ReactPointerEvent, task: PlannerTask) {
    if (locked || pickMode || (event.target as HTMLElement).closest('button, input, textarea, form')) return;
    begin(event, { kind: 'list', task, x: event.clientX, y: event.clientY, moved: false });
  }

  async function saveDraft() {
    if (!draft || !draftText.trim()) return;
    const ok = await write('save_task', { title: draftText.trim(), task_date: day, priority: 'medium', related_goal_id: '', memo: '', start_time: minuteTime(draft.start), end_time: minuteTime(draft.end) }, { silent: true });
    if (ok) { setDraft(null); setDraftText(''); }
  }

  const nowLine = day === today ? minuteOfDay(new Date().toTimeString().slice(0, 5)) : null;
  const box = (start: number, end: number) => ({ top: (start - SCALE.startHour * 60) * SCALE.pxPerMinute, height: Math.max(14, (end - start) * SCALE.pxPerMinute) });
  const placing = preview?.taskId && !blocks.some(b => b.task.id === preview.taskId) ? preview : null;

  const timeline = <>
    <div ref={scrollRef} className={css.timeScroll} aria-label="하루 시간표">
      <div className={css.timeGrid} style={{ height: COLUMN_HEIGHT }}>
        <ol className={css.hours} aria-label="시각">
          {HOURS.map(h => <li key={h} style={{ top: (h - SCALE.startHour) * 60 * SCALE.pxPerMinute }}>
            <button type="button" disabled={!pickMode && locked} onClick={() => tapMinute(h * 60)}
              aria-label={pickMode ? `${h}시부터 한 시간 고르기` : holdingTask ? `${holdingTask.title} ${h}시에 놓기` : `${h}시에 새 계획 적기`}>{String(h).padStart(2, '0')}</button>
          </li>)}
        </ol>
        <div ref={columnRef} className={css.column} data-pick={pickMode || undefined} data-holding={!!holdingTask || undefined} role="presentation"
          onPointerDown={e => { if ((locked && !pickMode) || e.target !== e.currentTarget) return; begin(e, { kind: 'range', anchor: minuteFromY(e.clientY), y: e.clientY, moved: false }); }}>
          {HOURS.map(h => <i key={h} className={css.hourRule} style={{ top: (h - SCALE.startHour) * 60 * SCALE.pxPerMinute }} />)}
          {nowLine !== null && nowLine >= SCALE.startHour * 60 && <i className={css.nowRule} style={{ top: (nowLine - SCALE.startHour * 60) * SCALE.pxPerMinute }} aria-label={`지금 ${minuteTime(nowLine)}`} />}
          {blocks.map(({ task, column, columns }) => {
            const live = preview?.taskId === task.id ? preview : null;
            const fixed = blockBox(task, SCALE);
            if (!live && fixed.hidden) return null;
            const b = live ? box(live.start, live.end) : fixed;
            const label = live ? `${minuteTime(live.start)}–${minuteTime(live.end)}` : `${task.start_time!.slice(0, 5)}–${task.end_time!.slice(0, 5)}`;
            const start = minuteOfDay(task.start_time!.slice(0, 5));
            return <div key={task.id} className={css.block} data-complete={task.completed} data-live={!!live || undefined} data-leaving={live?.overList || undefined}
              style={{ top: b.top, height: b.height, left: `calc(${(column / columns) * 100}% + 2px)`, width: `calc(${100 / columns}% - 4px)`, ...(task.related_goal_id ? { ['--goal' as string]: goalColor(task.related_goal_id) } : {}) }}
              aria-label={`${task.title} ${label}`}
              onPointerDown={e => { if (locked || pickMode || (e.target as HTMLElement).closest('button')) return; e.stopPropagation(); begin(e, { kind: 'move', task, y: e.clientY, start, duration: durationOf(task), moved: false }); }}>
              <button type="button" role="checkbox" aria-checked={task.completed} className={css.blockSeal} disabled={locked} aria-label={`${task.title} ${task.completed ? '완료 취소' : '완료'}`}
                onClick={() => void write('complete', { id: task.id, completed: !task.completed }, { silent: true })}>{task.completed ? '✦' : ''}</button>
              <span className={css.blockTitle}>{task.title}</span>
              <time>{label}</time>
              {!readOnly && <span className={css.blockTools}>
                <button type="button" disabled={locked} aria-label={`${task.title} 15분 앞당기기`} onClick={() => { const r = placeRange(start - 15, durationOf(task), SCALE); void saveTime(task, r.start, r.end); }}><ChevronUp size={12} /></button>
                <button type="button" disabled={locked} aria-label={`${task.title} 15분 늦추기`} onClick={() => { const r = placeRange(start + 15, durationOf(task), SCALE); void saveTime(task, r.start, r.end); }}><ChevronDown size={12} /></button>
                <button type="button" disabled={locked} aria-label={`${task.title} 시간 지우기`} onClick={() => void saveTime(task, '', '')}><Eraser size={12} /></button>
              </span>}
              {!readOnly && <span className={css.blockHandle} aria-hidden="true"
                onPointerDown={e => { if (locked || pickMode) return; e.stopPropagation(); begin(e, { kind: 'resize', task, y: e.clientY, start, end: minuteOfDay(task.end_time!.slice(0, 5)), moved: false }); }} />}
            </div>;
          })}
          {preview && !preview.taskId && <div className={css.rangeGhost} style={box(preview.start, preview.end)}><time>{minuteTime(preview.start)}–{minuteTime(preview.end)}</time></div>}
          {placing && <div className={css.rangeGhost} style={box(placing.start, placing.end)}><time>{minuteTime(placing.start)}–{minuteTime(placing.end)}</time></div>}
          {draft && <form className={css.draftBlock} style={box(draft.start, draft.end)} onSubmit={e => { e.preventDefault(); void saveDraft(); }} onPointerDown={e => e.stopPropagation()}>
            <time>{minuteTime(draft.start)}–{minuteTime(draft.end)}</time>
            <input autoFocus value={draftText} maxLength={200} disabled={busy} placeholder="이 시간에 할 일…" aria-label={`${minuteTime(draft.start)}부터 할 일 적기`}
              onChange={e => setDraftText(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setDraft(null); } }} />
            <span><button type="submit" disabled={busy || !draftText.trim()}>적기</button><button type="button" onClick={() => setDraft(null)}>그만두기</button></span>
          </form>}
        </div>
      </div>
    </div>
    {ghost && createPortal(<div className={css.dragGhost} style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">{ghost.title}</div>, document.body)}
  </>;

  return { timeline, listRef, beginFromList, holding, holdingTask, setHolding, dropToList: !!preview?.overList };
}
