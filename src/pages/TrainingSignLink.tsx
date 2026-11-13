/**
 * 로그인 없는 연수 참석 서명 (`/training-sign-link/:token`, 2026-10-25).
 *
 * 전자서명의 `/sign/:token`(PublicSign)과 같은 신원 모델 — **링크가 곧 신원**이다. 그래서 «○○님의 서명란»을 먼저 크게 밝힌다.
 * 서버가 토큰으로 주는 것은 연수 이름·일시·장소·서명할 사람·서명 여부뿐이다(참석자 명단·남의 서명은 없다).
 * 서명은 로그인 서명과 같은 표(training_signature, source = 'link')에 남아 출력·서명 현황에 그대로 보인다.
 * 라우트는 `RequireAuth` 의 public 목록에 있다.
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar, Check, GraduationCap, Loader2, MapPin, PenLine, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { SignaturePad } from '@/components/signature/SignaturePad';
import type { SignatureStrokes } from '@/lib/signatureStrokes';
import { fetchTrainingByToken, signTrainingWithToken, type TrainingTokenView } from '@/services/trainingSignLinkService';

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; view: TrainingTokenView }
  | { kind: 'invalid'; reason: 'not_found' | 'expired' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; signerName: string };

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function TrainingSignLink() {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [strokes, setStrokes] = useState<SignatureStrokes | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setPhase({ kind: 'invalid', reason: 'not_found' }); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchTrainingByToken(token);
        if (cancelled) return;
        if (r.ok && r.view) setPhase({ kind: 'ready', view: r.view });
        else setPhase({ kind: 'invalid', reason: r.reason ?? 'not_found' });
      } catch (e) {
        if (!cancelled) setPhase({ kind: 'error', message: e instanceof Error ? e.message : '열 수 없습니다.' });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async () => {
    if (!token || phase.kind !== 'ready') return;
    if (!strokes) { toast.error('서명을 그려 주세요.'); return; }
    setBusy(true);
    try {
      await signTrainingWithToken(token, strokes);
      setPhase({ kind: 'done', signerName: phase.view.signerName });
    } catch (e) {
      // 서버가 사유를 한국어로 준다(기한 지남·이미 서명함·명단에서 빠짐)
      toast.error(e instanceof Error ? e.message : '서명하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (phase.kind === 'loading') {
    return <Shell><div className="flex items-center justify-center gap-2 py-16 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />불러오는 중…</div></Shell>;
  }
  if (phase.kind === 'invalid') {
    return (
      <Shell>
        <Notice tone="error" icon={ShieldAlert}
          title={phase.reason === 'expired' ? '서명 링크 기한이 지났습니다' : '유효하지 않은 링크입니다'}
          body={phase.reason === 'expired' ? '연수를 만든 분께 기한 연장을 요청해 주세요.' : '주소가 잘못됐거나 참석자 명단에서 빠진 링크입니다.'} />
      </Shell>
    );
  }
  if (phase.kind === 'error') return <Shell><Notice tone="error" title="열 수 없습니다" body={phase.message} /></Shell>;
  if (phase.kind === 'done') {
    return <Shell><Notice tone="success" icon={Check} title={`${phase.signerName}님으로 서명했습니다`} body="창을 닫으셔도 됩니다. 연수 서명 현황에 바로 반영됩니다." /></Shell>;
  }

  const v = phase.view;
  return (
    <Shell>
      <div className="space-y-3">
        {/* 누구로 서명하는지 먼저 — 로그인이 없으니 화면이 신원을 알려 주는 유일한 곳이다 */}
        <div className="rounded-xl border border-pink-200 bg-pink-50/70 p-3">
          <p className="text-[11px] font-medium text-pink-700">이 링크는 다음 분의 연수 서명란입니다</p>
          <p className="mt-0.5 text-lg font-bold text-pink-900">{v.signerName}</p>
          <p className="mt-1 text-[11px] text-pink-700/80">본인이 아니라면 서명하지 마시고 연수를 만든 분께 알려 주세요.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex min-w-0 items-start gap-2">
            <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <h1 className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-snug text-slate-800">{v.title}</h1>
          </div>
          <div className="mt-1.5 space-y-0.5 pl-6 text-[12px] text-slate-500">
            <p className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDateTime(v.startsAt)}</p>
            {v.location && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{v.location}</p>}
            {v.expiresAt && !v.signed && <p className="text-[11px] text-slate-400">서명 기한 {fmtDateTime(v.expiresAt)}</p>}
          </div>
        </div>

        {v.signed ? (
          <Notice tone="success" icon={Check} title="이미 서명하셨습니다" body="다시 서명할 필요가 없습니다." />
        ) : (
          <>
            <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-900"><PenLine className="h-4 w-4" />아래에 서명해 주세요</div>
              {/* 높이는 aspectRatio 로 준다 — className 에 h-* 를 주면 버튼 줄이 흘러나온다 */}
              <SignaturePad onChange={setStrokes} aspectRatio={1.8} />
            </div>
            <div className="sticky bottom-0 -mx-4 border-t bg-white/95 px-4 py-3 backdrop-blur"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
              <Button className="h-11 w-full bg-blue-600 hover:bg-blue-700" onClick={() => void submit()} disabled={busy || !strokes}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1 h-4 w-4" />서명하기</>}
              </Button>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

/** 앱 셸 없이 가운데 한 칸 — 로그인조차 없는 단독 화면 */
const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 px-4 py-6"><div className="mx-auto w-full max-w-md">{children}</div></div>
);

const TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
} as const;

const Notice: React.FC<{ tone: keyof typeof TONES; title: string; body?: string; icon?: React.ComponentType<{ className?: string }> }> = ({ tone, title, body, icon: Icon }) => (
  <div className={cn('rounded-xl border px-4 py-6 text-center', TONES[tone])}>
    {Icon && <Icon className="mx-auto mb-2 h-7 w-7 opacity-70" />}
    <p className="text-sm font-semibold">{title}</p>
    {body && <p className="mt-1 text-xs opacity-80">{body}</p>}
  </div>
);
