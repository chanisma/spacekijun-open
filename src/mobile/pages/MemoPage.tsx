import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { MobileLoading } from '../MobileShell';
import { MEMO_LIMIT, STICKY_COLORS, createMemo, deleteMemo, listMemos, updateMemo, type Memo } from '../data/memos';

const when = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 스티커 메모 — 데스크 바탕화면의 메모와 같은 것. 누르면 고치고, + 로 새로 쓴다 */
export default function MemoPage() {
  const { resourceId } = useCurrentResourceId();
  const client = useQueryClient();
  const key = ['m-memos', resourceId];
  const { data: memos, isLoading, error } = useQuery({
    queryKey: key, enabled: !!resourceId, queryFn: () => listMemos(resourceId!), refetchInterval: 60 * 1000,
  });
  const [open, setOpen] = useState<Memo | 'new' | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: key });

  if (isLoading || !resourceId) return <MobileLoading label="메모를 불러오는 중…" />;
  if (error) return <p className="rounded-2xl bg-white p-5 text-center text-sm text-rose-600 shadow-sm">메모를 불러오지 못했습니다. {(error as Error).message}</p>;

  return (
    <div className="space-y-3">
      {!memos?.length ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">아직 메모가 없습니다. 아래 + 로 써 보세요.<br />데스크의 스티커 메모와 같은 곳에 저장됩니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {memos.map((memo) => (
            <button key={memo.id} onClick={() => setOpen(memo)} style={{ background: memo.color }}
                    className="flex h-36 flex-col rounded-2xl p-3 text-left shadow-sm ring-1 ring-black/5">
              <span className="line-clamp-1 text-sm font-semibold text-slate-900">{memo.title}</span>
              <span className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs text-slate-700">{memo.content.split(/\r?\n/).slice(1).join('\n')}</span>
              <span className="mt-auto text-[10px] text-slate-600">{when(memo.updated_at)}</span>
            </button>
          ))}
        </div>
      )}
      <button onClick={() => setOpen('new')} aria-label="새 메모"
              className="fixed bottom-[calc(env(safe-area-inset-bottom)+76px)] right-4 z-10 rounded-full bg-blue-600 p-4 text-white shadow-lg">
        <Plus className="h-6 w-6" />
      </button>
      {open && <MemoEditor resourceId={resourceId} memo={open === 'new' ? null : open} onClose={() => { setOpen(null); void refresh(); }} />}
    </div>
  );
}

function MemoEditor({ resourceId, memo, onClose }: { resourceId: string; memo: Memo | null; onClose: () => void }) {
  const [content, setContent] = useState(memo?.content ?? '');
  const [color, setColor] = useState(memo?.color ?? STICKY_COLORS[0]);
  const changed = content !== (memo?.content ?? '') || color !== (memo?.color ?? STICKY_COLORS[0]);
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  const save = useMutation({
    mutationFn: () => (memo ? updateMemo(resourceId, memo.id, content, color) : createMemo(resourceId, content, color)),
    onSuccess: () => { toast.success('메모를 저장했습니다'); onClose(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: () => deleteMemo(resourceId, memo!.id),
    onSuccess: () => { toast.success('메모를 삭제했습니다'); onClose(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const close = () => {
    if (changed && !window.confirm('저장하지 않은 내용이 있습니다. 닫을까요?')) return;
    onClose();
  };
  return (
    <div className="fixed inset-0 z-30 flex flex-col pt-[env(safe-area-inset-top)]" style={{ background: color }}>
      <div className="flex items-center justify-between px-3 py-2">
        <button onClick={close} className="rounded-full p-2" aria-label="닫기"><X className="h-5 w-5" /></button>
        <div className="flex gap-1.5">
          {STICKY_COLORS.map((swatch) => (
            <button key={swatch} onClick={() => setColor(swatch)} aria-label="색 고르기" style={{ background: swatch }}
                    className={cn('h-6 w-6 rounded-full ring-1 ring-black/20', swatch === color && 'ring-2 ring-slate-900')} />
          ))}
        </div>
        {memo ? (
          <button onClick={() => window.confirm('이 메모를 삭제할까요? 데스크에서도 사라집니다.') && remove.mutate()} className="rounded-full p-2" aria-label="삭제">
            <Trash2 className="h-5 w-5" />
          </button>
        ) : <span className="w-9" />}
      </div>
      <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={MEMO_LIMIT} autoFocus={!memo}
                placeholder="첫 줄이 제목이 됩니다" className="flex-1 resize-none bg-transparent px-4 py-2 text-base text-slate-900 outline-none" />
      <div className="px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2">
        <button onClick={() => save.mutate()} disabled={!changed || save.isPending || (!memo && !content.trim())}
                className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-40">
          {save.isPending ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  );
}
