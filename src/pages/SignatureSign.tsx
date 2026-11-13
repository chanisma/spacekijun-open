/**
 * 휴대폰 전자서명 페이지 (`/signature-sign/:requestId`).
 *
 * QR 로 여는 화면이라 **앱 셸(사이드바·헤더) 없이 단독**으로 렌더한다.
 * 로그인 필수 — 라우트를 public 화이트리스트에 넣지 않았으므로 `RequireAuth` 가 막고,
 * 로그인 후 이 주소로 되돌아온다(`sessionStorage` 경유). 결재·연수 서명 페이지와 같은 구조.
 *
 * 권한 판정은 화면이 아니라 서버가 한다: `act_on_signature_request` 가 요청 행을 잠그고
 * "지금 차례인 서명자 본인"인지, 서명이 있는지 다시 검증한다.
 *
 * **문서 미리보기를 넣지 않는다** — 휴대폰 화면에서 A4 를 읽는 것은 어차피 어렵고,
 * rhwp WASM·pdfjs 를 모바일 회선에서 받는 비용이 크다. 여기서 하는 일은 하나,
 * **손가락으로 사인하는 것**이다. 무엇에 서명하는지는 제목·요청자·진행 현황으로 밝힌다.
 */
import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, FileSignature, Loader2, PenLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { SignaturePad } from '@/components/signature/SignaturePad';
import type { SignatureStrokes } from '@/lib/signatureStrokes';
import { SignerLine } from '@/features/e-signature/components/SignerLine';
import { myTurn } from '@/features/e-signature/lib/signatureFlow';
import {
  useActOnSignatureRequest, useSignatureRequest,
} from '@/features/e-signature/hooks/useSignatureRequests';
import {
  REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, SOURCE_KIND_LABEL,
} from '@/features/e-signature/types';

export default function SignatureSign() {
  const { requestId } = useParams<{ requestId: string }>();
  const { user, profile } = useAuth();
  const act = useActOnSignatureRequest();

  const [strokes, setStrokes] = useState<SignatureStrokes | null>(null);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState<'signed' | 'rejected' | null>(null);

  const { data: request, isLoading } = useSignatureRequest(requestId ?? null);

  const turn = useMemo(
    () => request
      ? myTurn(
          request.signers.map((s) => ({
            id: s.id, orderIndex: s.orderIndex, roleLabel: s.roleLabel,
            signerUserId: s.signerUserId, signerName: s.signerName,
            status: s.status, fields: s.fields,
          })),
          request.status,
          { userId: user?.id ?? null, name: profile?.name ?? null },
        )
      : null,
    [request, user?.id, profile?.name],
  );

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />불러오는 중…
        </div>
      </Shell>
    );
  }

  if (!request) {
    return (
      <Shell>
        <Notice
          tone="error"
          title="문서를 찾을 수 없습니다"
          body="링크가 잘못됐거나 열람 권한이 없습니다."
        />
      </Shell>
    );
  }

  // 서명 직후 — 목록으로 돌아갈 곳이 없는 화면이라 끝났다는 것을 분명히 말한다
  if (done) {
    return (
      <Shell>
        <Notice
          tone={done === 'signed' ? 'success' : 'warn'}
          title={done === 'signed' ? '서명했습니다' : '거절했습니다'}
          body={
            done === 'signed'
              ? '창을 닫으셔도 됩니다. 결과는 요청자에게 전달됩니다.'
              : '창을 닫으셔도 됩니다. 거절 사유가 요청자에게 전달됩니다.'
          }
        />
      </Shell>
    );
  }

  const submit = async (action: 'sign' | 'reject') => {
    if (action === 'sign' && !strokes) return;
    await act.mutateAsync({
      requestId: request.id,
      action,
      signature: action === 'sign' ? strokes : null,
      comment: comment.trim() || null,
    });
    setDone(action === 'sign' ? 'signed' : 'rejected');
  };

  const reasonText: Record<string, string> = {
    'not-assigned': '이 문서의 서명자가 아닙니다.',
    'already-acted': '이미 처리하셨습니다.',
    'waiting-turn': '앞 순서의 서명이 끝나면 차례가 됩니다.',
    closed: '종료된 요청입니다.',
  };

  return (
    <Shell>
      <div className="space-y-3">
        {/*
          제목 줄 — 상태 배지를 제목 **옆**에 두지 않는다. 휴대폰 폭(≈416px)에서 배지가
          고정 폭을 먹어 제목만 압축된다. 배지는 아래 메타 줄로 내린다.
        */}
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex min-w-0 items-start gap-2">
            <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
            <h1 className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-snug text-slate-800">
              {request.title}
            </h1>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6 text-[11px] text-slate-500">
            <span className={cn('rounded border px-1.5 py-0.5', REQUEST_STATUS_TONE[request.status])}>
              {REQUEST_STATUS_LABEL[request.status]}
            </span>
            <span>{request.requesterName} 요청</span>
            <span className="text-slate-300">·</span>
            <span>{SOURCE_KIND_LABEL[request.sourceKind]}</span>
          </div>
          {/* 파일명은 길고 줄바꿈 기회가 없는 한 단어일 수 있다 — break-all 로 접는다 */}
          <p className="mt-1 break-all pl-6 text-[11px] text-slate-400">{request.sourceName}</p>
        </div>

        {request.message && (
          <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-900">
            {request.message}
          </p>
        )}

        {/*
          **서명 영역을 진행 현황보다 먼저 둔다.**
          QR 을 찍고 들어온 사람의 목적은 하나 — 서명이다. 명단·진행률을 지나 스크롤해야
          패드에 닿으면 그 목적이 뒤로 밀린다. 현황은 참고 정보라 아래로 내린다.
        */}
        {turn?.isMyTurn ? (
          <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
              <PenLine className="h-4 w-4" />
              서명할 차례입니다
            </div>
            <p className="text-[11px] text-slate-600">
              아래 칸에 손가락이나 펜으로 서명하세요.
            </p>
            {/*
              모바일은 세로가 넉넉하다 — 패드를 크게 준다.
              단 **높이 클래스가 아니라 `aspectRatio`** 로 준다: 루트가 캔버스와 버튼 줄을
              함께 담는 컨테이너라, 고정 높이를 걸면 버튼 줄이 밖으로 흘러나와 겹친다.
            */}
            <SignaturePad onChange={setStrokes} aspectRatio={1.8} />
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="의견 (선택)"
              className="bg-white text-sm"
            />
          </div>
        ) : (
          <Notice
            tone="info"
            title="지금은 서명할 수 없습니다"
            body={turn?.reason ? reasonText[turn.reason] : ''}
          />
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            진행 현황
          </p>
          <SignerLine request={request} meId={user?.id ?? null} meName={profile?.name ?? null} />
        </div>

        {/*
          동작 버튼은 **화면 하단에 고정**한다. 서명 패드가 커서 스크롤이 생기는데,
          그때마다 버튼을 찾아 내려가야 하면 한 손으로 쓰기 어렵다.
          `pb-[env(safe-area-inset-bottom)]` 은 홈 인디케이터가 있는 기기에서 버튼이 가리는 것을 막는다.
        */}
        {turn?.isMyTurn && (
          <div className="sticky bottom-0 -mx-4 border-t bg-white/95 px-4 py-3 backdrop-blur"
               style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => submit('reject')}
                disabled={act.isPending}
              >
                <X className="mr-1 h-4 w-4" />거절
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={() => submit('sign')}
                disabled={act.isPending || !strokes}
              >
                {act.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Check className="mr-1 h-4 w-4" />서명하기</>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

/** 앱 셸 없이 가운데 한 칸 — 휴대폰 전용 화면이라 사이드바가 없다 */
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
}> = ({ tone, title, body }) => (
  <div className={cn('rounded-xl border px-4 py-5 text-center', TONES[tone])}>
    <p className="text-sm font-semibold">{title}</p>
    {body && <p className="mt-1 text-xs opacity-80">{body}</p>}
  </div>
);
