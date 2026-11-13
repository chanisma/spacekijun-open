/**
 * 서명 화면 — 문서를 보고, 자기 칸을 확인하고, 서명한다.
 *
 * ── 왜 2단인가 ─────────────────────────────────────────────────────────────
 * 처음엔 서명 패드를 **푸터**에 넣었는데 세 가지가 잘못됐다:
 *   ① `DIALOG_FOOTER_CLASS` 는 `flex justify-end` — 버튼 한 줄용이라 패드·QR·의견을
 *      넣으면 부풀고 정렬이 어긋난다
 *   ② 문서와 서명 영역이 **같은 세로 스크롤**을 공유해, 긴 문서에서 서명하려면 끝까지
 *      내려가야 하고 그러면 정작 서명할 내용이 화면 밖으로 나간다
 *   ③ 내려받기·출력이 "내 차례가 아닐 때만" 보였다 — 서명하려는 사람이 문서를 못 받았다
 *
 * 지금은 **왼쪽 문서(스크롤) · 오른쪽 서명 패널(고정)**이다. 문서를 보면서 서명하고,
 * 푸터는 원래 용도인 버튼 줄로 되돌렸다(다운로드·출력은 **항상** 있다).
 * 좁은 화면에서는 세로로 쌓인다.
 */
import { SignatureDueEditor } from './SignatureDueField';
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, Download, ExternalLink, FileCheck2, Loader2, PenLine, Trash2, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { SignaturePad } from '@/components/signature/SignaturePad';
import { SignatureStrokesView } from '@/components/signature/SignatureStrokesView';
import { SignQrCode } from '@/components/signature/SignQrCode';
import type { SignatureStrokes } from '@/lib/signatureStrokes';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS,
} from '@/components/tasks/dialogDesign';
import { DocumentPageView } from './DocumentPageView';
import { SignatureFieldOverlay, type FieldMark } from './SignatureFieldOverlay';
import { SignerLine } from './SignerLine';
import { myTurn } from '../lib/signatureFlow';
import type { PageBoxPlacement } from '../lib/signatureField';
import {
  daysUntilPurge, formatPurgeDeadline, purgeDeadline, REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, type SignatureRequest,
} from '../types';
import { useActOnSignatureRequest, useDeleteSignatureRequest } from '../hooks/useSignatureRequests';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSignatureDocument } from '../hooks/useSignatureDocument';
import { useSignLinks, findMyLink } from '../hooks/useSignLinks';
import { publicSignPath } from '../services/signatureTokenService';
import { SignLinkShare } from './SignLinkShare';
import { ExportPanel } from './ExportPanel';

interface Props {
  request: SignatureRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REASON_TEXT: Record<string, string> = {
  'not-assigned': '이 문서의 서명자가 아닙니다. 확인만 할 수 있습니다.',
  'already-acted': '이미 처리했습니다.',
  'waiting-turn': '앞 순서의 서명이 끝나면 차례가 됩니다.',
  closed: '종료된 요청입니다.',
};

export const SignatureSignDialog: React.FC<Props> = ({ request, open, onOpenChange }) => {
  const { user, profile } = useAuth();
  const act = useActOnSignatureRequest();
  const remove = useDeleteSignatureRequest();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [strokes, setStrokes] = useState<SignatureStrokes | null>(null);
  const [comment, setComment] = useState('');

  const {
    source, signed, isLoading, download, print, isBuilding,
    archive, authenticateAndArchive, archivePhase, resetArchivePhase,
    driveArchive, isRequester, filesGone,
  } = useSignatureDocument(request, open);


  // 서명 링크(토큰) — 요청자는 전원 것, 서명자는 자기 것만 온다(서버가 범위를 정한다)
  const { links } = useSignLinks(request?.id ?? null, open);
  const myLink = findMyLink(links, profile?.name);

  // 다이얼로그를 다시 열 때 이전 상태가 남아 있으면 안 된다
  useEffect(() => {
    if (!open) { setStrokes(null); setComment(''); resetArchivePhase(); }
  }, [open, resetArchivePhase]);

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

  const marks: FieldMark[] = useMemo(() => {
    if (!request) return [];
    return request.signers.flatMap((s) =>
      s.fields
        .filter((f): f is PageBoxPlacement => f.kind === 'page-box')
        .map((f, i) => ({
          key: `${s.id}:${i}`,
          placement: f,
          signerName: s.signerName,
          signed: s.status === 'signed',
          // 내 칸만 강조 — 여러 칸 중 어디에 찍히는지 바로 보이게
          highlight: turn?.signer?.id === s.id,
        })),
    );
  }, [request, turn?.signer?.id]);

  if (!request) return null;

  const submit = async (action: 'sign' | 'reject') => {
    if (action === 'sign' && !strokes) {
      toast.error('서명을 그려 주세요.');
      return;
    }
    await act.mutateAsync({
      requestId: request.id,
      action,
      signature: action === 'sign' ? strokes : null,
      comment: comment.trim() || null,
    });
    onOpenChange(false);
  };

  const myFieldCount = turn?.signer?.fields.length ?? 0;
  const signedCount = request.signers.filter((s) => s.status === 'signed').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* overflow 는 안쪽 패널이 맡는다 — Content 에 두면 안에서 열리는 팝오버가 잘린다 */}
      <DialogContent className="flex h-[92vh] max-w-6xl flex-col gap-0 p-0">
        <DialogHeader className={cn(DIALOG_HEADER_CLASS, 'shrink-0 rounded-t-lg pb-3')}>
          <div className="flex min-w-0 items-center gap-2">
            <DialogTitle className="min-w-0 truncate text-sm" title={request.title}>
              {request.title}
            </DialogTitle>
            <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[11px]', REQUEST_STATUS_TONE[request.status])}>
              {REQUEST_STATUS_LABEL[request.status]}
            </span>
          </div>
          <p className="truncate text-[11px] text-slate-500" title={request.sourceName}>
            {request.requesterName} 요청 · {request.sourceName}
          </p>
        </DialogHeader>

        {/* ── 본문: 문서 | 서명 패널 ── */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* 문서 — 여기만 스크롤한다 */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100/60 px-4 py-3">
            {filesGone ? (
              /*
                파일이 서버에 없다 — Drive 로 옮겼거나 기한이 지나 정리됐다.
                미리보기를 시도하면 400 이 나므로 아예 부르지 않고 **어디로 갔는지** 말한다.
              */
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-slate-400">
                <FileCheck2 className="h-9 w-9 text-slate-300" />
                {driveArchive ? (
                  <>
                    <p className="text-sm text-slate-600">Google Drive로 옮겨졌습니다</p>
                    <p className="text-xs">이 서버에는 문서가 남아 있지 않습니다.</p>
                    {driveArchive.link && (
                      <a href={driveArchive.link} target="_blank" rel="noreferrer"
                         className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline">
                        <ExternalLink className="h-3 w-3" />Drive에서 열기
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-600">보관 기한이 지나 정리됐습니다</p>
                    <p className="text-xs">서명 기록은 남아 있지만 문서는 다시 볼 수 없습니다.</p>
                  </>
                )}
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />문서를 여는 중…
              </div>
            ) : (
              <DocumentPageView
                source={signed ?? source}
                sourceKind={request.sourceKind}
                renderOverlay={(page) => (
                  // 완성본에는 서명이 이미 그려져 있으므로 칸 테두리를 겹치지 않는다
                  signed ? null : <SignatureFieldOverlay page={page} marks={marks} />
                )}
              />
            )}
          </div>

          {/* 서명 패널 — 고정 폭. 문서가 아무리 길어도 여기는 늘 보인다 */}
          <aside className="flex shrink-0 flex-col gap-3 overflow-y-auto border-t bg-white px-4 py-3 lg:w-[340px] lg:border-l lg:border-t-0">
            {request.message && (
              <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-900">
                {request.message}
              </p>
            )}

            <SignerLine request={request} meId={user?.id ?? null} meName={profile?.name ?? null} />

            {/* 서명 마감 — 요청자는 바꿀 수 있고, 서명자는 언제까지인지 본다 */}
            {request.status === 'pending' && !request.purgedAt && (isRequester ? (
              <SignatureDueEditor requestId={request.id} dueAt={request.dueAt} createdAt={request.createdAt} />
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <CalendarClock className="h-3.5 w-3.5 text-slate-400" />서명 마감 <b className="text-slate-700">{formatPurgeDeadline(new Date(request.dueAt))}</b>
              </p>
            ))}

            {/* 요청자만 — 서명자에게 링크를 보내 로그인 없이 서명하게 한다 */}
            {isRequester && request.status === 'pending' && links.length > 0 && (
              <SignLinkShare links={links} />
            )}

            {/*
              완료된 문서라면 **항상** 보인다. 별도 [내보내기] 버튼으로 열게 하면 한 단계가
              더 생기는데, 서명이 끝난 문서에서 할 일은 보관·내려받기뿐이라 감출 이유가 없다.
            */}
            {request.status === 'completed' && (
              <ExportPanel
                phase={archivePhase}
                archived={driveArchive}
                isBuilding={isBuilding}
                daysLeft={daysUntilPurge(request)}
                deadline={purgeDeadline(request)}
                filesGone={filesGone}
                printable={request.sourceKind !== 'hwpx'}
                onArchive={() => { void archive(); }}
                onAuthenticate={() => { void authenticateAndArchive(); }}
                onDownload={() => { void download(); }}
                onPrint={() => { void print(); }}
              />
            )}

            {/*
              삭제는 **요청자만**. 취소와 달리 기록까지 없애므로 패널 맨 아래 눈에 덜 띄는
              자리에 둔다 — 자주 쓸 동작이 아니고, 잘못 누르면 되돌릴 수 없다.
            */}
            {isRequester && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 self-start px-2 text-[11px] text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-1 h-3 w-3" />요청 삭제
              </Button>
            )}

            {turn?.isMyTurn ? (
              <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
                  <PenLine className="h-3.5 w-3.5" />
                  서명할 차례입니다
                </div>
                <p className="text-[11px] text-slate-600">
                  왼쪽 문서에서 <strong className="text-blue-700">강조된 칸</strong>
                  {myFieldCount > 1 ? ` ${myFieldCount}곳` : ''}에
                  비율을 유지한 채 들어갑니다.
                </p>

                {/*
                  **높이 클래스를 주면 안 된다.** `SignaturePad` 의 루트는 캔버스 박스와
                  버튼 줄(한 획 취소·지우기)을 담는 `space-y-2` 컨테이너라, `h-24` 같은
                  고정 높이를 걸면 캔버스가 그것을 넘겨 **버튼 줄이 밖으로 흘러나와
                  아래 요소와 겹친다**(실제로 QR 블록 위에 겹쳤다).
                  높이는 `aspectRatio`(폭÷높이)로 조절한다.
                */}
                <SignaturePad onChange={setStrokes} aspectRatio={2.6} />

                {/*
                  마우스로 그린 획은 각져서 실제 사인과 다르다 — 휴대폰으로 쓰라고 QR.
                  **토큰 링크가 있으면 그것을 쓴다**(휴대폰에서 로그인이 필요 없다).
                  없으면 로그인이 필요한 종전 경로로 떨어진다.
                */}
                <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2">
                  <SignQrCode
                    path={myLink ? publicSignPath(myLink.token) : `/signature-sign/${request.id}`}
                    size={60}
                    showCopy={false}
                    // 토큰 링크는 **가진 사람이 곧 서명자**라 확대 모달에 경고가 필요하다.
                    // 로그인 경로는 서버가 본인을 다시 확인하므로 경고하지 않는다.
                    isCredentialLink={!!myLink}
                  />
                  <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-slate-500">
                    마우스 서명이 어색하면 QR을 찍어 <strong className="text-slate-600">휴대폰에서 손으로</strong> 서명하세요.
                    {myLink
                      ? ' 휴대폰에서 로그인하지 않아도 됩니다.'
                      : ' 휴대폰에서 로그인이 필요합니다.'}
                  </p>
                </div>

                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder="의견 (선택)"
                  className="min-h-[46px] bg-white text-xs"
                />

                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => submit('reject')}
                    disabled={act.isPending}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />거절
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    onClick={() => submit('sign')}
                    disabled={act.isPending || !strokes}
                  >
                    {act.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <><Check className="mr-1 h-3.5 w-3.5" />서명</>}
                  </Button>
                </div>
              </div>
            ) : (
              turn?.reason && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  {REASON_TEXT[turn.reason]}
                </p>
              )
            )}
          </aside>
        </div>

        {/* ── 푸터 ──
            완료된 문서의 동작은 오른쪽 [보관 및 내보내기] 패널이 전부 맡으므로 푸터가 비어
            있어도 된다. 진행 중인 문서만 "원본 내려받기"가 필요하다(아직 서명본이 없다). */}
        {request.status !== 'completed' && (
          <div className={cn(DIALOG_FOOTER_CLASS, 'shrink-0 rounded-b-lg')}>
            <Button
              variant="ghost" size="sm" className={FOOTER_BUTTON_CLASS}
              onClick={download} disabled={isBuilding}
            >
              {isBuilding
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                : <Download className="mr-1 h-3.5 w-3.5" />}
              원본 내려받기
            </Button>
          </div>
        )}
      </DialogContent>

      {/*
        삭제 확인 — **무엇이 사라지는지 숫자로** 말한다.
        "정말 삭제하시겠습니까?"만으로는 이미 받은 서명이 함께 없어진다는 사실이 전달되지 않는다.
      */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">서명 요청을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-xs">
                <p className="break-words font-medium text-slate-700">{request.title}</p>
                <ul className="list-disc space-y-0.5 pl-4 text-slate-600">
                  <li>서명자 {request.signers.length}명의 기록이 사라집니다
                    {signedCount > 0 && (
                      <strong className="text-rose-600"> (이미 받은 서명 {signedCount}건 포함)</strong>
                    )}
                  </li>
                  <li>문서 원본{request.signedPath ? '과 서명본' : ''}이 서버에서 지워집니다</li>
                  {driveArchive && (
                    <li className="text-emerald-700">
                      Google Drive에 보관된 파일은 <strong>그대로 남습니다</strong>
                    </li>
                  )}
                </ul>
                <p className="font-medium text-rose-600">되돌릴 수 없습니다.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">취소</AlertDialogCancel>
            <AlertDialogAction
              className="h-8 bg-rose-600 text-xs hover:bg-rose-700"
              disabled={remove.isPending}
              onClick={async (e) => {
                // Radix 의 Action 은 **누르는 즉시** 확인 모달을 닫는다. 그대로 두면
                // ①삭제가 실패해도 모달이 사라져 아무 일도 없던 것처럼 보이고
                // ②삭제 성공 시 확인 모달과 바깥 모달이 같은 커밋에서 언마운트된다.
                // `preventDefault()` 로 기본 닫기를 막고(composeEventHandlers 규약)
                // 우리가 닫는 시점을 정한다.
                e.preventDefault();
                await remove.mutateAsync(request);
                setConfirmDelete(false);
                // 바깥 모달은 **다음 프레임**에 닫는다 — 두 모달 레이어를 같은 커밋에서
                // 언마운트시키지 않는 것이 중첩 모달의 기본 규약이다(docs/nested-modal-pitfalls.md).
                requestAnimationFrame(() => onOpenChange(false));
              }}
            >
              {remove.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

/** 이미 한 서명을 칸 안에 미리 보여 주는 조각(목록·현황에서 재사용) */
export const SignaturePreview: React.FC<{ value: unknown }> = ({ value }) => (
  <SignatureStrokesView value={value} className="h-full w-full" />
);

export default SignatureSignDialog;
