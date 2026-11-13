/**
 * 서명 마감 고르기 (2026-10-25) — 요청 만들기 두 화면과 진행 중 요청의 «마감 바꾸기»가 함께 쓴다.
 * 마감까지 서명이 끝나지 않으면 만료되고 문서가 정리된다. 완료된 문서는 마감과 무관하게 완료 후 7일에 정리.
 * 범위·기본값은 `../types`(서버 `set_signature_due` 와 짝).
 */
import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { PURGE_DAYS, dueError, dueRange, formatPurgeDeadline } from '../types';
import { useSetSignatureDue } from '../hooks/useSignatureRequests';

const PRESETS = [3, 7, 14, 30] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');
/** `<input type="datetime-local">` 값(기기 시각) */
export const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fromLocalInput = (s: string) => new Date(s);

export function SignatureDueField({ value, onChange, createdAt, id = 'sig-due', className }: {
  value: Date;
  onChange: (d: Date) => void;
  /** 진행 중인 요청을 고칠 때 — 최대 범위의 기준 */
  createdAt?: string | null;
  id?: string;
  className?: string;
}) {
  const { min, max } = dueRange(createdAt);
  const base = createdAt ? new Date(createdAt) : new Date();
  const problem = dueError(value, createdAt);
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="flex items-center gap-1 text-xs">
        <CalendarClock className="h-3 w-3 text-slate-400" />서명 마감
      </Label>
      {/* 입력은 한 줄을 다 쓴다 — 빠른 고르기와 한 줄에 두면 시각이 잘린다 */}
      <input
        id={id}
        type="datetime-local"
        value={toLocalInput(value)}
        min={toLocalInput(min)}
        max={toLocalInput(max)}
        onChange={(e) => { if (e.target.value) onChange(fromLocalInput(e.target.value)); }}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-base sm:text-xs"
      />
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((d) => {
          const at = new Date(base.getTime() + d * DAY_MS);
          const disabled = !!dueError(at, createdAt);
          return (
            <button key={d} type="button" disabled={disabled} onClick={() => onChange(at)}
              className="h-9 rounded-md bg-slate-100 px-2 text-[11px] text-slate-600 hover:bg-slate-200 disabled:opacity-40">
              {createdAt ? `요청 후 ${d}일` : `${d}일 뒤`}
            </button>
          );
        })}
      </div>
      <p className={cn('text-[11px]', problem ? 'text-rose-600' : 'text-slate-500')}>
        {problem ?? `${formatPurgeDeadline(value)}까지 서명이 끝나지 않으면 만료되고 문서가 정리됩니다. 다 끝난 문서는 완료 후 ${PURGE_DAYS}일 뒤 정리돼요.`}
      </p>
    </div>
  );
}

/** 진행 중 요청의 마감 바꾸기 — 요청자에게만 보인다 */
export function SignatureDueEditor({ requestId, dueAt, createdAt }: { requestId: string; dueAt: string; createdAt: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => new Date(dueAt));
  useEffect(() => { if (!editing) setDraft(new Date(dueAt)); }, [dueAt, editing]);
  const save = useSetSignatureDue();

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-slate-50/60 px-3 py-2 text-xs">
        <CalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 text-slate-600">서명 마감 <b className="text-slate-800">{formatPurgeDeadline(new Date(dueAt))}</b></span>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 text-xs" onClick={() => setEditing(true)}>바꾸기</Button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border px-3 py-2">
      <SignatureDueField id={`sig-due-${requestId}`} value={draft} onChange={setDraft} createdAt={createdAt} />
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditing(false)}>취소</Button>
        <Button size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700"
          disabled={save.isPending || !!dueError(draft, createdAt)}
          onClick={() => save.mutate({ requestId, dueAt: draft.toISOString() }, { onSuccess: () => setEditing(false) })}>
          {save.isPending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  );
}
