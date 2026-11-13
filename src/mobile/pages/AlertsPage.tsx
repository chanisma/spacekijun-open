import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bot, CheckCheck, Monitor } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from '@/lib/toast';
import { getTimeAgo } from '@/lib/timeUtils';
import { cn } from '@/lib/utils';
import { MobileLoading } from '../MobileShell';
import { openFullView } from '../MobileGate';
import { DESK_MESSAGE_TYPE } from '../data/deskMessages';
import { agentRequestPath } from '../data/agentRequests';

interface Alert { id: string; type: string; title: string; message: string; is_read: boolean; created_at: string; meta: Record<string, unknown> | null }

/** 스페이스기전 알림 — 업무·공지·결재 등(쪽지와 쿨메신저 알림은 뺀다). 누르면 읽음. 작업 요청은 «에이전트에게 맡기기»로 에이전트 탭에 */
export default function AlertsPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  const key = ['m-alerts', user?.id];
  const { data, isLoading, error } = useQuery({
    queryKey: key, enabled: !!user, refetchInterval: 30 * 1000,
    queryFn: async () => {
      const { data: rows, error: failed } = await supabase.from('notification_events')
        .select('id, type, title, message, is_read, created_at, meta')
        .not('type', 'in', `(${DESK_MESSAGE_TYPE},coolmessenger)`)
        .order('created_at', { ascending: false }).limit(80);
      if (failed) throw failed;
      return (rows ?? []) as Alert[];
    },
  });
  const done = () => { void client.invalidateQueries({ queryKey: key }); void client.invalidateQueries({ queryKey: ['m-unread'] }); };
  const read = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error: failed } = await supabase.from('notification_events').update({ is_read: true } as never).in('id', ids);
      if (failed) throw failed;
    },
    onSuccess: done,
    onError: (failed: Error) => toast.error(failed.message),
  });

  if (isLoading) return <MobileLoading label="알림을 불러오는 중…" />;
  if (error) return <p className="rounded-2xl bg-white p-5 text-center text-sm text-rose-600 shadow-sm">알림을 불러오지 못했습니다.</p>;
  const unread = (data ?? []).filter((item) => !item.is_read).map((item) => item.id);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-slate-500">안 읽은 알림 {unread.length}개</span>
        <div className="flex gap-3">
          <button className="flex items-center gap-1 text-xs text-slate-500" onClick={() => openFullView('/notifications')}><Monitor className="h-3.5 w-3.5" />웹사이트에서 보기</button>
          <button className="flex items-center gap-1 text-xs font-semibold text-blue-600 disabled:opacity-40" disabled={!unread.length}
                  onClick={() => read.mutate(unread)}><CheckCheck className="h-3.5 w-3.5" />모두 읽음</button>
        </div>
      </div>
      {!data?.length ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">알림이 없습니다.</p>
      ) : data.map((item) => (
        <div key={item.id} className={cn('rounded-2xl bg-white shadow-sm', !item.is_read && 'ring-1 ring-blue-200')}>
          <button onClick={() => !item.is_read && read.mutate([item.id])} className="block w-full p-3 text-left">
            <div className="flex items-start gap-2">
              {!item.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                <div className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-600">{item.message}</div>
                <div className="mt-1 text-[10px] text-slate-400">{getTimeAgo(item.created_at)}</div>
              </div>
            </div>
          </button>
          {item.type === 'agent_request' && (
            <div className="px-3 pb-3">
              <button onClick={() => { if (!item.is_read) read.mutate([item.id]); navigate(agentRequestPath(item.meta)); }}
                      className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white active:bg-blue-700">
                <Bot className="h-4 w-4" />에이전트에게 맡기기
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
