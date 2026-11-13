/**
 * 학생판 카드 아래 — «이세계에서는 사회인» 3D 모델 설치 파일(구글 드라이브). 규칙 = `src/lib/gameModelDownload.ts`.
 * 학생은 받기만, 실제 관리자는 이 카드에서 링크를 바꾼다(관리자 미리보기와 무관하게 `canEdit` = isRealAdmin).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, ExternalLink, Loader2, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GAME_MODEL_SETTING_KEY, GAME_MODEL_TITLE, parseGameModelDownload, validateDriveUrl } from '@/lib/gameModelDownload';

const QUERY_KEY = ['system-setting', GAME_MODEL_SETTING_KEY] as const;

export function GameModelCard({ canEdit, userId }: { canEdit: boolean; userId: string | null }) {
  const cache = useQueryClient();
  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('system_settings').select('setting_value').eq('setting_key', GAME_MODEL_SETTING_KEY).maybeSingle();
      if (error) throw error;
      return parseGameModelDownload(data?.setting_value);
    },
    staleTime: 5 * 60 * 1000,
  });
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const checked = validateDriveUrl(url);

  const save = useMutation({
    mutationFn: async () => {
      if ('reason' in checked) throw new Error(checked.reason);
      if (!userId) throw new Error('로그인이 필요해요.');
      const value = { url: checked.url, note: note.trim().slice(0, 200), updatedAt: new Date().toISOString() } as unknown as Json;
      const { data: existing, error: readError } = await supabase.from('system_settings').select('id').eq('setting_key', GAME_MODEL_SETTING_KEY).maybeSingle();
      if (readError) throw readError;
      // created_by 보존 — upsert 대신 조회 → update/insert. RLS 가 막으면 오류가 아니라 0행이다
      const { data, error } = existing
        ? await supabase.from('system_settings').update({ setting_value: value, updated_at: new Date().toISOString() }).eq('id', existing.id).select('id')
        : await supabase.from('system_settings').insert([{ setting_key: GAME_MODEL_SETTING_KEY, setting_value: value, description: '학생 데스크톱 메뉴 — «이세계에서는 사회인» 3D 모델 설치 파일 구글 드라이브 링크', created_by: userId }]).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('저장 권한이 없어요. (관리자만 바꿀 수 있어요)');
    },
    onSuccess: () => {
      setEditing(false);
      void cache.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const info = q.data ?? null;
  const openEditor = () => { setUrl(info?.url ?? ''); setNote(info?.note ?? ''); setEditing(true); };

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5" data-game-model>
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Box className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-800">{GAME_MODEL_TITLE}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            스페이스기전 학생 독의 게임 «이세계에서는 사회인»에 쓰는 3D 모델이에요. 파일이 커서 구글 드라이브에서 받아요 — 학교·집의 Wi-Fi 에서 받아 주세요.
          </p>
          {info?.note && <p className="mt-1 text-xs text-slate-600">{info.note}</p>}
        </div>
        {canEdit && !editing && (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={openEditor}><Pencil className="h-3.5 w-3.5" /> 링크 바꾸기</Button>
        )}
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/file/d/…/view" aria-label="구글 드라이브 공유 링크" className="text-xs" />
          <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="한 줄 안내(선택) — 예: 1.2판 · 약 800MB" aria-label="한 줄 안내" className="text-xs" />
          {url.trim() && 'reason' in checked && <p className="text-[11px] text-rose-600">{checked.reason}</p>}
          <p className="text-[11px] text-slate-500">드라이브에서 파일 공유를 «링크가 있는 모든 사용자»(또는 학교 도메인)로 열어 둔 뒤 그 링크를 붙여 넣어 주세요.</p>
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditing(false)} disabled={save.isPending}>취소</Button>
            <Button size="sm" className="h-8 gap-1 bg-blue-600 text-xs hover:bg-blue-700" disabled={!checked.ok || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} 저장
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {q.isPending ? (
            <p className="text-xs text-muted-foreground">불러오는 중…</p>
          ) : info ? (
            <Button asChild className="h-10 gap-1.5 bg-blue-600 hover:bg-blue-700">
              <a href={info.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> 구글 드라이브에서 받기</a>
            </Button>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{canEdit ? '아직 링크가 없어요 — «링크 바꾸기»로 넣어 주세요.' : '아직 준비 중이에요. 곧 여기서 받을 수 있어요.'}</p>
          )}
        </div>
      )}
    </section>
  );
}
