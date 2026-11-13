// 업무 작업실 — 메모·작업 수·쓰기 묶음 (2026-11-12, W0)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  addRoomTask, addWorkNote, deleteRoomTask, deleteWorkNote, fetchActionCounts, fetchWorkNotes,
  setRoomTaskStatus, updateRoomTask, updateWorkRoomMeta,
} from '../services/workRoomService';
import type { PersonOption } from '@/lib/candidateToWork';

export const WORK_ROOM_KEY = 'work-room';
export const WORK_ROOM_QUERY_PREFIXES = [[WORK_ROOM_KEY]] as const;

export function useWorkRoomData(workId: string | null, taskIds: string[], enabled: boolean) {
  const notesQ = useQuery({
    queryKey: [WORK_ROOM_KEY, 'notes', workId],
    queryFn: () => fetchWorkNotes(workId!),
    enabled: enabled && !!workId,
  });
  const actionsQ = useQuery({
    queryKey: [WORK_ROOM_KEY, 'actions', workId, taskIds.join(',')],
    queryFn: () => fetchActionCounts(taskIds),
    enabled: enabled && !!workId && taskIds.length > 0,
  });
  return { notes: notesQ.data ?? [], notesLoading: notesQ.isLoading, actionCounts: actionsQ.data ?? {}, actionsLoaded: taskIds.length === 0 || actionsQ.isSuccess };
}

export function useWorkRoomMutations(workId: string | null) {
  const qc = useQueryClient();
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['work-detail-jsonb', workId] }),
    qc.invalidateQueries({ queryKey: [WORK_ROOM_KEY] }),
    qc.invalidateQueries({ queryKey: ['work-object'] }),
    qc.invalidateQueries({ queryKey: ['my-tasks-jsonb'] }),
  ]);
  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : '저장하지 못했습니다');

  const addTask = useMutation({
    mutationFn: (v: { title: string; due: string | null; assignee: PersonOption; myResourceId: string }) => addRoomTask({ workId: workId!, ...v }),
    onSuccess: refresh, onError,
  });
  const check = useMutation({
    mutationFn: (v: { taskId: string; myResourceId: string; done: boolean; title: string }) => setRoomTaskStatus(v.taskId, v.myResourceId, v.done),
    onSuccess: async (_r, v) => {
      await refresh();
      // 흔한 동작이라 확인창 대신 토스트 [되돌리기](CLAUDE.md «확인창은 되돌릴 수 없는 것만»)
      if (v.done) {
        toast.success(`«${v.title}» 끝`, { action: { label: '되돌리기', onClick: () => check.mutate({ ...v, done: false }) } });
      }
    },
    onError,
  });
  const updateTask = useMutation({
    mutationFn: (v: { taskId: string; title?: string; due_date?: string | null }) => updateRoomTask(v.taskId, v),
    onSuccess: refresh, onError,
  });
  const removeTask = useMutation({ mutationFn: (taskId: string) => deleteRoomTask(taskId), onSuccess: refresh, onError });
  const updateMeta = useMutation({
    mutationFn: (v: { meta: Record<string, unknown> | null; targetDate?: string | null; goal?: string | null }) => updateWorkRoomMeta(workId!, v.meta, v),
    onSuccess: refresh, onError,
  });
  const addNote = useMutation({ mutationFn: (text: string) => addWorkNote(workId!, text), onSuccess: refresh, onError });
  const removeNote = useMutation({ mutationFn: (id: string) => deleteWorkNote(id), onSuccess: refresh, onError });

  return { addTask, check, updateTask, removeTask, updateMeta, addNote, removeNote };
}
