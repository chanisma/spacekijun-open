// 업무 작업실 — 할 일 목록 (2026-11-12, W0)
// 평평한 목록 · 날짜로만 묶는다 · 엔터로 추가 · 체크로 끝(작업이 걸린 할 일은 «내 할 일»로).
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, PenLine, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import type { PersonOption } from '@/lib/candidateToWork';
import {
  CHECK_BLOCK_HINT, ROOM_BUCKET_LABEL, groupRoomTasks, isRoomTaskDone, parseQuickAdd, roomCheckBlock, shortDate,
  type RoomTask,
} from '../model/workRoom';
import { dueChip } from '../model/todayFeed';
import { Chip } from './chips';
import type { useWorkRoomMutations } from '../hooks/useWorkRoom';

type Mutations = ReturnType<typeof useWorkRoomMutations>;

interface Props {
  tasks: RoomTask[];
  today: string;
  targetDate: string | null;
  me: PersonOption | null;
  isManager: boolean;
  actionCounts: Record<string, number>;
  actionsLoaded: boolean;
  focusTaskId: string | null;
  m: Mutations;
  /** 할 일을 누르면 상세 창(완료·제출) — 책임자·그 할 일의 담당자만(2026-11-12 사용자 결정). 없으면 누를 수 없다 */
  onOpen?: (taskId: string) => void;
}

function assigneeNames(task: RoomTask, myId: string | null): string[] {
  const a = (task.meta as { assignees?: Array<{ id?: string; name?: string }> } | null)?.assignees;
  return Array.isArray(a) ? a.filter((p) => p.id !== myId).map((p) => p.name ?? '?') : [];
}

export function RoomTaskList({ tasks, today, targetDate, me, isManager, actionCounts, actionsLoaded, focusTaskId, m, onOpen }: Props) {
  const [draft, setDraft] = useState('');
  const [showDone, setShowDone] = useState(false);
  const groups = groupRoomTasks(tasks, today, me?.id ?? null);
  const preview = draft.trim() ? parseQuickAdd(draft, today, targetDate) : null;

  const submit = () => {
    if (!preview || !me || !preview.title) return;
    m.addTask.mutate({ title: preview.title, due: preview.due, assignee: me, myResourceId: me.id }, { onSuccess: () => setDraft('') });
  };

  return (
    <section aria-label="할 일" className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <h2 className="mb-1 text-sm font-semibold text-slate-500">할 일</h2>
      {groups.length === 0 && <p className="py-2 text-sm text-slate-500">아직 할 일이 없습니다. 아래에 떠오르는 것부터 한 줄씩 적어 보세요.</p>}
      {groups.map((g) => {
        const collapsed = g.bucket === 'done' && !showDone;
        return (
          <div key={g.bucket} className="mt-2">
            {g.bucket === 'done' ? (
              <button type="button" onClick={() => setShowDone((v) => !v)} className="flex min-h-9 items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
                {collapsed ? <ChevronRight className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                {ROOM_BUCKET_LABEL.done} {g.tasks.length}
              </button>
            ) : (
              <p className={cn('text-xs font-medium', g.bucket === 'now' ? 'text-rose-700' : 'text-slate-500')}>{ROOM_BUCKET_LABEL[g.bucket]} {g.tasks.length}</p>
            )}
            {!collapsed && (
              <ul>
                {g.tasks.map((t) => (
                  <RoomTaskRow
                    key={t.id} task={t} today={today} targetDate={targetDate} me={me} isManager={isManager}
                    actionCount={actionCounts[t.id] ?? 0} actionsLoaded={actionsLoaded} focused={t.id === focusTaskId} m={m} onOpen={onOpen}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {me && (
        <form className="mt-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label className="relative block">
            <Plus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={200}
              placeholder="할 일 한 줄 (예: 포스터 인쇄 금)"
              aria-label="할 일 추가" className="pl-9 text-base sm:text-sm" disabled={m.addTask.isPending}
            />
          </label>
          <p className="mt-1 min-h-4 text-[11px] text-slate-500">
            {preview?.title
              ? <>엔터로 추가 — «{preview.title}»{preview.due ? ` · ${shortDate(preview.due)}까지` : ' · 날짜 없음'}</>
              : <>날짜 말: 오늘 · 내일 · 금 · 11/13 · 11월 13일{targetDate ? ' · D-1 · 당일' : ''}</>}
          </p>
        </form>
      )}
    </section>
  );
}

function RoomTaskRow({ task, today, targetDate, me, isManager, actionCount, actionsLoaded, focused, m, onOpen }: {
  task: RoomTask; today: string; targetDate: string | null; me: PersonOption | null; isManager: boolean;
  actionCount: number; actionsLoaded: boolean; focused: boolean; m: Mutations; onOpen?: (taskId: string) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { if (focused) ref.current?.scrollIntoView({ block: 'center' }); }, [focused]);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const done = isRoomTaskDone(task, me?.id ?? null);
  const block = actionsLoaded ? roomCheckBlock(task, me?.id ?? null, actionCount) : 'has_actions';
  const chip = done ? null : dueChip(today, task.due_date ?? null);
  const others = isManager ? assigneeNames(task, me?.id ?? null) : [];
  const canEdit = isManager && actionCount === 0;
  // 상세 창 = 책임자 · 이 할 일의 담당자(담당자 명단이 보이는 창이라 그 밖에는 열지 않는다)
  const mine = !!me && ((task.meta as { assignees?: Array<{ id?: string }> } | null)?.assignees ?? []).some((a) => a.id === me.id);
  const canOpen = !!onOpen && (isManager || mine);
  // 지우기는 확인창 대신 [되돌리기] — 같은 이름·마감·담당으로 다시 만든다(작업이 없는 할 일만 지울 수 있다)
  const remove = () => {
    const owner = (task.meta as { assignees?: Array<{ id?: string; name?: string }> } | null)?.assignees?.[0];
    m.removeTask.mutate(task.id, {
      onSuccess: () => toast.success(`«${task.title}» 지움`, owner?.id && me ? {
        action: { label: '되돌리기', onClick: () => m.addTask.mutate({ title: task.title, due: task.due_date?.slice(0, 10) ?? null, assignee: { id: owner.id!, name: owner.name ?? '' }, myResourceId: me.id }) },
      } : undefined),
    });
  };

  const startEdit = () => {
    if (!canEdit) return;
    setText(`${task.title}${task.due_date ? ` ${shortDate(task.due_date.slice(0, 10)).replace(/\(.\)$/, '')}` : ''}`);
    setEditing(true);
  };
  const saveEdit = () => {
    const p = parseQuickAdd(text, today, targetDate);
    setEditing(false);
    if (!p.title || (p.title === task.title && p.due === (task.due_date?.slice(0, 10) ?? null))) return;
    m.updateTask.mutate({ taskId: task.id, title: p.title, due_date: p.due });
  };

  return (
    <li ref={ref} className={cn('flex min-w-0 items-center gap-2 border-t border-slate-100 py-1 first:border-t-0', focused && '-mx-2 rounded-lg bg-blue-50 px-2')}>
      {block === null ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`«${task.title}» ${done ? '끝냄 취소' : '끝'}`}
          disabled={m.check.isPending}
          onClick={() => me && m.check.mutate({ taskId: task.id, myResourceId: me.id, done: !done, title: task.title })}
          className="flex h-11 w-11 flex-none items-center justify-center sm:h-9 sm:w-9"
        >
          <span className={cn('flex h-5 w-5 items-center justify-center rounded border-2', done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 hover:border-blue-500')}>
            {done && <Check className="h-3.5 w-3.5" aria-hidden />}
          </span>
        </button>
      ) : block === 'not_assignee' ? (
        <span className="flex h-11 w-11 flex-none items-center justify-center sm:h-9 sm:w-9" title={CHECK_BLOCK_HINT[block]}>
          <span className={cn('h-5 w-5 rounded border-2 border-dashed', done ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200')} />
        </span>
      ) : (
        <button
          type="button" onClick={() => canOpen && onOpen!(task.id)} disabled={!canOpen}
          title={CHECK_BLOCK_HINT[block]}
          className="flex h-11 flex-none items-center rounded-md px-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:text-slate-400 sm:h-9"
        >
          {done ? '완료' : '열어서 진행'}
        </button>
      )}

      {editing ? (
        <Input
          autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={saveEdit} maxLength={200}
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
          aria-label="할 일 고치기" className="h-9 min-w-0 flex-1 text-base sm:text-sm"
        />
      ) : (
        <button
          type="button" onClick={() => canOpen && onOpen!(task.id)} disabled={!canOpen}
          className={cn('min-h-11 min-w-0 flex-1 rounded-md text-left text-sm hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent sm:min-h-9', done ? 'text-slate-400 line-through' : 'text-slate-800')}
          title={canOpen ? `${task.title} — 눌러서 자세히(완료·제출)` : task.title}
        >
          <span className="block truncate">{task.title}</span>
          {others.length > 0 && <span className="block truncate text-[11px] text-slate-500">담당 {others.join(', ')}</span>}
        </button>
      )}

      {!editing && chip && <Chip tone={chip.tone} className="flex-none">{chip.text}</Chip>}
      {!editing && canEdit && !done && (
        <button
          type="button" aria-label={`«${task.title}» 이름·마감 고치기`} title="고치기 — 끝에 날짜를 붙이면 마감도 바뀝니다"
          onClick={startEdit}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-700 sm:h-8 sm:w-8"
        >
          <PenLine className="h-4 w-4" aria-hidden />
        </button>
      )}
      {!editing && isManager && actionCount === 0 && !done && (
        <button
          type="button" aria-label={`«${task.title}» 지우기`} title="지우기"
          disabled={m.removeTask.isPending}
          onClick={remove}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-600 sm:h-8 sm:w-8"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </li>
  );
}
