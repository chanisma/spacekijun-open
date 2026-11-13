/**
 * 로그인 없는 QR 서명 (`/sign/:token`).
 *
 * ── 이 화면의 신원 모델 ─────────────────────────────────────────────────────
 * 로그인이 없으므로 서버는 `auth.uid()` 로 사람을 알 수 없다. **링크가 곧 신원**이다.
 * 그래서 화면이 가장 먼저 하는 일은 **"○○님으로 서명합니다"를 크게 밝히는 것**이다 —
 * 남의 링크를 잘못 열었을 때 알아챌 유일한 방법이고, 서명은 신원 그 자체라 확인 없이
 * 그리게 두면 안 된다.
 *
 * 문서 미리보기는 없다. 서버가 토큰으로 주는 것에 문서가 아예 포함되지 않는다 —
 * 링크를 주운 사람에게 문서가 통째로 열리면 안 되기 때문이고, 모바일에서 A4 를 읽는
 * 것도 어차피 어렵다. 무엇에 서명하는지는 제목·요청자·파일명으로 밝힌다.
 *
 * 라우트는 `RequireAuth` 의 public 화이트리스트에 있다(로그인 강제 없음).
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, FileSignature, Loader2, PenLine, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { SignaturePad } from '@/components/signature/SignaturePad';
import type { SignatureStrokes } from '@/lib/signatureStrokes';
import {
  fetchSignatureByToken, signWithToken, type TokenSignatureView,
} from '@/features/e-signature/services/signatureTokenService';
import {
  REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, SOURCE_KIND_LABEL,
} from '@/features/e-signature/types';

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; view: TokenSignatureView }
  | { kind: 'invalid'; reason: 'not_found' | 'expired' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; action: 'sign' | 'reject'; signerName: string };

export default function PublicSign() {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [strokes, setStrokes] = useState<SignatureStrokes | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setPhase({ kind: 'invalid', reason: 'not_found' }); return; }
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchSignatureByToken(token);
        if (cancelled) return;
        if (result.ok && result.view) setPhase({ kind: 'ready', view: result.view });
        else setPhase({ kind: 'invalid', reason: result.reason ?? 'not_found' });
      } catch (e) {
        if (cancelled) return;
        console.error('서명 링크 조회 실패', e);
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : '열 수 없습니다.' });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (action: 'sign' | 'reject') => {
    if (!token || phase.kind !== 'ready') return;
    if (action === 'sign' && !strokes) { toast.error('서명을 그려 주세요.'); return; }

    setBusy(true);
    try {
      await signWithToken(token, action, action === 'sign' ? strokes : null, comment.trim() || null);
      setPhase({ kind: 'done', action, signerName: phase.view.signerName });
    } catch (e) {
      // 서버가 한국어로 사유를 준다(차례 아님·이미 처리함·만료 등) — 그대로 보여 준다
      toast.error(e instanceof Error ? e.message : '처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (phase.kind === 'loading') {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />불러오는 중…
        </div>
      </Shell>
    );
  }

  if (phase.kind === 'invalid') {
    return (
      <Shell>
        <Notice
          tone="error"
          icon={ShieldAlert}
          title={phase.reason === 'expired' ? '서명 링크가 만료됐습니다' : '유효하지 않은 링크입니다'}
          body={phase.reason === 'expired'
            ? '요청하신 분께 새 링크를 받아 주세요.'
            : '주소가 잘못됐거나 이미 사용된 링크입니다.'}
        />
      </Shell>
    );
  }

  if (phase.kind === 'error') {
    return <Shell><Notice tone="error" title="열 수 없습니다" body={phase.message} /></Shell>;
  }

  if (phase.kind === 'done') {
    return (
      <Shell>
        <Notice
          tone={phase.action === 'sign' ? 'success' : 'warn'}
          icon={phase.action === 'sign' ? Check : X}
          title={phase.action === 'sign' ? `${phase.signerName}님으로 서명했습니다` : '거절했습니다'}
          body="창을 닫으셔도 됩니다. 결과는 요청자에게 전달됩니다."
        />
      </Shell>
    );
  }

  const v = phase.view;

  return (
    <Shell>
      <div className="space-y-3">
        {/*
          **누구로 서명하는지 먼저 밝힌다.**
          로그인이 없으니 화면이 신원을 알려 주는 유일한 곳이다. 남의 링크를 잘못 열었을 때
          알아챌 방법이 이것뿐이고, 서명은 신원 그 자체라 확인 없이 그리게 두면 안 된다.
        */}
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
          <p className="text-[11px] font-medium text-violet-700">이 링크는 다음 분의 서명란입니다</p>
          <p className="mt-0.5 text-lg font-bold text-violet-900">
            {v.signerName}
            {v.roleLabel && <span className="ml-1.5 text-sm font-medium text-violet-600">({v.roleLabel})</span>}
          </p>
          <p className="mt-1 text-[11px] text-violet-700/80">
            본인이 아니라면 서명하지 마시고 요청자에게 알려 주세요.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex min-w-0 items-start gap-2">
            <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <h1 className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-snug text-slate-800">
              {v.title}
            </h1>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6 text-[11px] text-slate-500">
            <span className={cn('rounded border px-1.5 py-0.5', REQUEST_STATUS_TONE[v.requestStatus])}>
              {REQUEST_STATUS_LABEL[v.requestStatus]}
            </span>
            <span>{v.requesterName} 요청</span>
            <span className="text-slate-300">·</span>
            <span>{SOURCE_KIND_LABEL[v.sourceKind]}</span>
            <span className="text-slate-300">·</span>
            <span>서명 {v.signedCount}/{v.totalCount}</span>
          </div>
          {/* 파일명은 길고 줄바꿈 기회가 없는 한 단어일 수 있다 — break-all 로 접는다 */}
          <p className="mt-1 break-all pl-6 text-[11px] text-slate-400">{v.sourceName}</p>
        </div>

        {v.message && (
          <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-900">
            {v.message}
          </p>
        )}

        {v.isMyTurn ? (
          <>
            <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
                <PenLine className="h-4 w-4" />
                아래에 서명해 주세요
              </div>
              {/* 높이는 aspectRatio 로 준다 — className 에 h-* 를 주면 버튼 줄이 흘러나온다 */}
              <SignaturePad onChange={setStrokes} aspectRatio={1.8} />
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="의견 (선택)"
                className="bg-white text-sm"
              />
            </div>

            {/* 서명 패드가 커서 스크롤이 생긴다 — 버튼은 하단에 고정해 한 손으로 닿게 */}
            <div
              className="sticky bottom-0 -mx-4 border-t bg-white/95 px-4 py-3 backdrop-blur"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  onClick={() => submit('reject')}
                  disabled={busy}
                >
                  <X className="mr-1 h-4 w-4" />거절
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={() => submit('sign')}
                  disabled={busy || !strokes}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <><Check className="mr-1 h-4 w-4" />서명하기</>}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Notice
            tone="info"
            title={v.signerStatus !== 'pending' ? '이미 처리하셨습니다'
              : v.requestStatus !== 'pending' ? '종료된 요청입니다'
              : '아직 차례가 아닙니다'}
            body={v.signerStatus === 'pending' && v.requestStatus === 'pending'
              ? '앞 순서의 서명이 끝나면 이 링크로 다시 들어와 주세요.'
              : undefined}
          />
        )}
      </div>
    </Shell>
  );
}

/** 앱 셸 없이 가운데 한 칸 — 로그인조차 없는 단독 화면이라 사이드바가 없다 */
const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 px-4 py-6">
    <div className="mx-auto w-full max-w-md">{children}</div>
  </div>
);

const TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-slate-200 bg-white text-slate-600',
} as const;

const Notice: React.FC<{
  tone: keyof typeof TONES;
  title: string;
  body?: string;
  icon?: React.ComponentType<{ className?: string }>;
}> = ({ tone, title, body, icon: Icon }) => (
  <div className={cn('rounded-xl border px-4 py-6 text-center', TONES[tone])}>
    {Icon && <Icon className="mx-auto mb-2 h-7 w-7 opacity-70" />}
    <p className="text-sm font-semibold">{title}</p>
    {body && <p className="mt-1 text-xs opacity-80">{body}</p>}
  </div>
);
