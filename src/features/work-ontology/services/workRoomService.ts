// 업무 작업실 — 쓰기 (2026-11-12, W0)
//
// 업무·할 일은 기존 표 그대로(work · task), 만들기는 업무 후보·공문과 같은 `createWorkFromCandidate`(한 벌).
// 완료는 상태 쓰기 단일 출처 `set_task_assignee_status` — 체크 가능 판정은 model/workRoom.roomCheckBlock.
// 메모·링크 = 표 work_note(20261112100000).
import { supabase } from '@/integrations/supabase/client';
import { createWorkFromCandidate } from '@/services/candidateWorkService';
import type { PersonOption } from '@/lib/candidateToWork';
import { academicYearOfDate, noteFromInput } from '../model/workRoom';

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any };

function fail(e: { message?: string; details?: string; hint?: string } | null, fallback: string): never {
  throw new Error([e?.message, e?.details, e?.hint].filter(Boolean).join(' ') || fallback);
}

/** 한 줄로 시작 — 책임자 = 나, 할 일 없이(작업실에서 바로 적는다) */
export async function startWork(input: { name: string; targetDate: string | null; goal: string; me: PersonOption; today: string }): Promise<string> {
  const name = input.name.replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('무슨 일인지 한 줄 적어 주세요.');
  const res = await createWorkFromCandidate({
    work: {
      name,
      description: input.goal.trim(),
      keywords: [],
      meta: {
        year: academicYearOfDate(input.targetDate ?? input.today),
        ...(input.targetDate ? { targetDate: input.targetDate } : {}),
        ...(input.goal.trim() ? { goal: input.goal.trim() } : {}),
        startedIn: 'work_room',
      },
    },
    managers: [input.me],
    tasks: [],
  });
  return res.workId;
}

/** 할 일 하나 — 일회성, 담당 = 나(기본) */
export async function addRoomTask(input: { workId: string; title: string; due: string | null; assignee: PersonOption; myResourceId: string }): Promise<void> {
  const title = input.title.trim();
  if (!title) throw new Error('할 일을 적어 주세요.');
  const { error } = await db.from('task').insert({
    event_id: input.workId,
    title,
    description: '',
    type: 'one_time',
    order_index: 0,
    due_date: input.due,
    keywords: [],
    status: 'pending',
    created_by: input.myResourceId,
    meta: { assignees: [{ id: input.assignee.id, name: input.assignee.name, status: 'pending', assigned_at: new Date().toISOString() }] },
  });
  if (error) fail(error, '할 일을 더하지 못했습니다');
}

export async function setRoomTaskStatus(taskId: string, myResourceId: string, done: boolean): Promise<void> {
  const { error } = await db.rpc('set_task_assignee_status', {
    p_task_id: taskId, p_assignee_resource_id: myResourceId, p_status: done ? 'completed' : 'pending',
  });
  if (error) fail(error, '상태를 바꾸지 못했습니다');
}

export async function updateRoomTask(taskId: string, patch: { title?: string; due_date?: string | null }): Promise<void> {
  const next: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new Error('할 일 이름이 비었습니다.');
    next.title = t;
  }
  if (patch.due_date !== undefined) next.due_date = patch.due_date;
  const { error } = await db.from('task').update(next).eq('id', taskId);
  if (error) fail(error, '할 일을 고치지 못했습니다');
}

export async function deleteRoomTask(taskId: string): Promise<void> {
  const { error, count } = await db.from('task').delete({ count: 'exact' }).eq('id', taskId);
  if (error) fail(error, '할 일을 지우지 못했습니다');
  if (count === 0) throw new Error('지우지 못했습니다(권한이 없거나 이미 지워졌습니다).');
}

/** 목표일·목표 한 줄 — work.meta 의 두 칸만 바꾼다(나머지 meta 는 그대로) */
export async function updateWorkRoomMeta(workId: string, currentMeta: Record<string, unknown> | null, patch: { targetDate?: string | null; goal?: string | null }): Promise<void> {
  const meta: Record<string, unknown> = { ...(currentMeta ?? {}) };
  if (patch.targetDate !== undefined) { if (patch.targetDate) meta.targetDate = patch.targetDate; else delete meta.targetDate; }
  if (patch.goal !== undefined) { if (patch.goal?.trim()) meta.goal = patch.goal.trim(); else delete meta.goal; }
  const { error } = await db.from('work').update({ meta }).eq('id', workId);
  if (error) fail(error, '업무를 고치지 못했습니다');
}

// ---------- 서랍: 메모·링크 ----------

export interface WorkNote {
  id: string;
  work_id: string;
  kind: 'note' | 'link';
  body: string;
  url: string | null;
  created_by: string;
  created_at: string;
}

export async function fetchWorkNotes(workId: string): Promise<WorkNote[]> {
  const { data, error } = await db.from('work_note')
    .select('id, work_id, kind, body, url, created_by, created_at')
    .eq('work_id', workId)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) fail(error, '메모를 불러오지 못했습니다');
  return (data ?? []) as WorkNote[];
}

export async function addWorkNote(workId: string, text: string): Promise<void> {
  const n = noteFromInput(text);
  if (!n) throw new Error('적을 내용이 없습니다.');
  const { error } = await db.from('work_note').insert({ work_id: workId, kind: n.kind, body: n.body, url: n.url });
  if (error) fail(error, '메모를 남기지 못했습니다');
}

export async function deleteWorkNote(id: string): Promise<void> {
  const { error } = await db.from('work_note').delete().eq('id', id);
  if (error) fail(error, '메모를 지우지 못했습니다');
}

/** 작업이 걸린 할 일(보관 제외) — 체크 대신 «내 할 일»로 보낸다 */
export async function fetchActionCounts(taskIds: string[]): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};
  const { data, error } = await db.from('task_action').select('task_id').in('task_id', taskIds).is('archived_at', null);
  if (error) fail(error, '작업 목록을 불러오지 못했습니다');
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ task_id: string }>) out[r.task_id] = (out[r.task_id] ?? 0) + 1;
  return out;
}
