/**
 * 특정 기능에 붙은 서명 요청 목록 — 탭에 끼워 넣는 부품.
 *
 * 대시보드 카드는 "내 차례"만 보여 주므로 **상신자가 자기 문서의 진행 상황을 볼 곳이 없다**.
 * 이 목록이 그 공백을 메운다 — RLS 범위(내가 요청 ∪ 내가 서명자) 전체를 보여 준다.
 *
 * 행을 누르면 서명 화면이 열리므로 확인·서명·내려받기·출력이 여기서 끝난다.
 */
import React, { useMemo, useState } from 'react';
import { FileSignature } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { SignatureSignDialog } from './SignatureSignDialog';
import { SignerLine } from './SignerLine';
import { myTurn } from '../lib/signatureFlow';
import { useSignatureRequestsBySubject } from '../hooks/useSignatureRequests';
import {
  REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, SOURCE_KIND_LABEL, type SignatureRequest,
} from '../types';

interface Props {
  subjectType: string;
  /** 비우면 그 종류 전체 */
  subjectId?: string;
  emptyHint?: string;
  className?: string;
}

export const SignatureSubjectList: React.FC<Props> = ({
  subjectType, subjectId, emptyHint, className,
}) => {
  const { user, profile } = useAuth();
  const { data: requests = [], isLoading } = useSignatureRequestsBySubject(subjectType, subjectId);
  const [selected, setSelected] = useState<SignatureRequest | null>(null);

  const me = useMemo(
    () => ({ userId: user?.id ?? null, name: profile?.name ?? null }),
    [user?.id, profile?.name],
  );

  const selectedLive = selected
    ? requests.find((r) => r.id === selected.id) ?? selected
    : null;

  if (isLoading) {
    return <p className="py-8 text-center text-xs text-slate-400">불러오는 중…</p>;
  }
  if (requests.length === 0) {
    return (
      <div className={cn('flex flex-col items-center gap-2 py-10 text-center text-slate-400', className)}>
        <FileSignature className="h-8 w-8 text-slate-300" />
        <p className="max-w-sm text-xs">{emptyHint ?? '아직 서명 요청이 없습니다.'}</p>
      </div>
    );
  }

  return (
    <>
      <ul className={cn('divide-y divide-gray-50', className)}>
        {requests.map((r) => {
          const mine = myTurn(
            r.signers.map((s) => ({
              id: s.id, orderIndex: s.orderIndex, roleLabel: s.roleLabel,
              signerUserId: s.signerUserId, signerName: s.signerName,
              status: s.status, fields: s.fields,
            })),
            r.status, me,
          ).isMyTurn;

          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelected(r)}
                className="flex w-full flex-col gap-1 px-2 py-2.5 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800" title={r.title}>
                    {r.title}
                  </span>
                  {mine && (
                    <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                      내 차례
                    </span>
                  )}
                  <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px]', REQUEST_STATUS_TONE[r.status])}>
                    {REQUEST_STATUS_LABEL[r.status]}
                  </span>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                  <span className="shrink-0">{SOURCE_KIND_LABEL[r.sourceKind]}</span>
                  <span className="shrink-0">{r.requesterName}</span>
                  <span className="shrink-0">· {new Date(r.createdAt).toLocaleDateString('ko-KR')}</span>
                </div>
                <SignerLine request={r} meId={me.userId} meName={me.name} compact />
              </button>
            </li>
          );
        })}
      </ul>

      <SignatureSignDialog
        request={selectedLive}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
      />
    </>
  );
};

export default SignatureSubjectList;
