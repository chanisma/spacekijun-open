// 업무 작업실 — 서랍: 링크 · 메모 (2026-11-12, W0, 표 work_note)
// 한 줄 입력 하나 — 주소가 들어 있으면 링크, 아니면 메모. 링크는 위, 메모는 시간순.
import { useState } from 'react';
import { ExternalLink, StickyNote, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/components/auth/AuthProvider';
import type { WorkNote } from '../services/workRoomService';
import type { useWorkRoomMutations } from '../hooks/useWorkRoom';

function when(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}

export function RoomDrawer({ notes, loading, isManager, m }: {
  notes: WorkNote[]; loading: boolean; isManager: boolean; m: ReturnType<typeof useWorkRoomMutations>;
}) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const links = notes.filter((n) => n.kind === 'link');
  const memos = notes.filter((n) => n.kind === 'note');
  const canRemove = (n: WorkNote) => isManager || n.created_by === user?.id;

  const RemoveBtn = ({ n }: { n: WorkNote }) => canRemove(n) ? (
    <button
      type="button" aria-label="지우기" title="지우기" disabled={m.removeNote.isPending}
      onClick={() => m.removeNote.mutate(n.id)}
      className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-600 sm:h-7 sm:w-7"
    >
      <X className="h-3.5 w-3.5" aria-hidden />
    </button>
  ) : null;

  return (
    <section aria-label="서랍" className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <h2 className="mb-2 text-sm font-semibold text-slate-500">서랍 · 링크와 메모</h2>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) m.addNote.mutate(text, { onSuccess: () => setText('') }); }}>
        <Input
          value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} disabled={m.addNote.isPending}
          placeholder="메모 한 줄, 또는 «이름 주소»로 링크"
          aria-label="메모나 링크 남기기" className="text-base sm:text-sm"
        />
      </form>
      {loading ? <p className="py-2 text-xs text-slate-500">불러오는 중…</p> : notes.length === 0 ? (
        <p className="py-2 text-xs text-slate-500">신청 주소, 주최 측 담당, 떠오른 것을 여기에 — 마무리할 때 기록이 됩니다.</p>
      ) : (
        <>
          {links.length > 0 && (
            <ul className="mt-2">
              {links.map((n) => (
                <li key={n.id} className="flex min-w-0 items-center">
                  <a href={n.url ?? '#'} target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-sm text-blue-700 hover:bg-blue-50 sm:min-h-8" title={n.url ?? undefined}>
                    <ExternalLink className="h-3.5 w-3.5 flex-none" aria-hidden />
                    <span className="truncate">{n.body}</span>
                  </a>
                  <RemoveBtn n={n} />
                </li>
              ))}
            </ul>
          )}
          {memos.length > 0 && (
            <ul className="mt-2 space-y-1">
              {memos.map((n) => (
                <li key={n.id} className="flex min-w-0 items-start gap-2">
                  <StickyNote className="mt-1 h-3.5 w-3.5 flex-none text-amber-500" aria-hidden />
                  <span className="min-w-0 flex-1 text-sm text-slate-800">
                    <span className="whitespace-pre-line break-words">{n.body}</span>
                    <span className="block text-[11px] text-slate-400">{when(n.created_at)}</span>
                  </span>
                  <RemoveBtn n={n} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
