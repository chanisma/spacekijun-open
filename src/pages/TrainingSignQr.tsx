/**
 * 내 연수 서명 QR (`/training-sign-qr/:meetingId`, 2026-10-25) — 연수 알림을 누르면 오는 곳.
 *
 * 사용자 결정: 알림에서는 링크 대신 **QR 만** 준다. PC 로 알림을 연 선생님이 휴대폰으로 찍어 로그인 없이 서명한다.
 * QR 은 내 토큰(서버가 참석자 본인에게는 자기 것만 준다)의 `/training-sign-link/:token`.
 * 이 기능 전에 만든 연수나 참석자가 아니면 일정표로 안내한다.
 */
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Check, Loader2, PenTool, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignQrCode } from '@/components/signature/SignQrCode';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { fetchTrainingSignLinks, trainingSignLinkPath } from '@/services/trainingSignLinkService';

export default function TrainingSignQr() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const { profile } = useProfile();

  const meeting = useQuery({
    queryKey: ['training-sign-qr', 'meeting', meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const { data, error } = await supabase.from('meeting').select('id, kind, starts_at, meta').eq('id', meetingId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const links = useQuery({
    queryKey: ['training-sign-links', meetingId],
    enabled: !!meetingId,
    retry: false,
    queryFn: () => fetchTrainingSignLinks(meetingId!),
  });

  const title = String((meeting.data?.meta as Record<string, unknown> | undefined)?.title ?? '연수');
  const mine = links.data?.links.find((l) => l.signerName === profile?.name) ?? null;
  const loading = meeting.isLoading || links.isLoading;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-3">
        <div className="rounded-xl border border-pink-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-pink-700"><QrCode className="h-3.5 w-3.5" />내 연수 서명 QR</p>
          <h1 className="mt-1 break-words text-base font-semibold text-slate-800">{title}</h1>
          {meeting.data?.starts_at && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
              <Calendar className="h-3 w-3" />
              {new Date(meeting.data.starts_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />불러오는 중…</div>
        ) : mine?.signed ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-emerald-800">
            <Check className="mx-auto mb-2 h-7 w-7 opacity-70" />
            <p className="text-sm font-semibold">이미 서명하셨습니다</p>
          </div>
        ) : mine ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-sm text-slate-700">휴대폰 카메라로 찍으면 <b>로그인 없이</b> 서명 화면이 열립니다.</p>
            <div className="flex justify-center">
              <SignQrCode path={trainingSignLinkPath(mine.token)} size={220} label={`${mine.signerName} 서명`} showCopy={false} isCredentialLink />
            </div>
            {links.data?.expiresAt && (
              <p className="text-[11px] text-slate-400">
                {new Date(links.data.expiresAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}까지 쓸 수 있습니다
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
            <p>{links.data && !links.data.enabled ? '이 연수는 서명 링크가 없습니다(기능 도입 전에 만든 연수).' : '이 연수의 서명 대상이 아니거나 링크를 열 수 없습니다.'}</p>
            <p className="text-xs text-slate-400">일정표에서 연수를 열어 서명할 수 있습니다.</p>
          </div>
        )}

        <div className="flex justify-center gap-2">
          {/* 이 기기에서 바로 — 같은 로그인 없는 서명 화면(옛 로그인 서명 화면이 아니다, 2026-10-25 이후 연수는 링크 서명만) */}
          {mine && !mine.signed && (
            <Button asChild variant="outline" className="h-10">
              <Link to={trainingSignLinkPath(mine.token)}><PenTool className="mr-1.5 h-4 w-4" />이 기기에서 서명</Link>
            </Button>
          )}
          <Button asChild variant="ghost" className="h-10"><Link to="/schedule" state={meetingId ? { scheduleId: meetingId } : undefined}>일정 보기</Link></Button>
        </div>
      </div>
    </div>
  );
}
