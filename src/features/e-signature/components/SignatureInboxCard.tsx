/**
 * 서명 대기함 — "지금 내 차례인" 서명만 모은다.
 *
 * 서명자는 원본 화면(문서를 올린 사람의 목록)을 열 이유가 없으므로, 기능을 붙이기만 해서는
 * 아무도 서명하지 않는다. **이 카드가 유일한 발견 경로다**(결재함과 같은 이유).
 *
 * 대기 중인 것이 없으면 `null` 을 반환해 카드 자체가 사라진다 — 부모 그리드에서 한 줄을
 * 통째로 차지하는 배치라 구멍이 남지 않는다.
 */
import React from 'react';
import { FileSignature } from 'lucide-react';
import { format } from 'date-fns';
import { DashboardCardShell } from '@/features/teacher-dashboard/components/DashboardCardShell';
import { useAuth } from '@/components/auth/AuthProvider';
import { SignatureSignDialog } from './SignatureSignDialog';
import { myTurn, groupSigners } from '../lib/signatureFlow';
import { useSignatureRequests } from '../hooks/useSignatureRequests';
import { SOURCE_KIND_LABEL, type SignatureRequest } from '../types';

export function SignatureInboxCard({ className }: { className?: string }) {
  const { user, profile } = useAuth();
  const { data: requests = [] } = useSignatureRequests();
  const [selected, setSelected] = React.useState<SignatureRequest | null>(null);

  const me = React.useMemo(
    () => ({ userId: user?.id ?? null, name: profile?.name ?? null }),
    [user?.id, profile?.name],
  );

  const pending = React.useMemo(
    () => requests.filter((r) =>
      myTurn(
        r.signers.map((s) => ({
          id: s.id, orderIndex: s.orderIndex, roleLabel: s.roleLabel,
          signerUserId: s.signerUserId, signerName: s.signerName,
          status: s.status, fields: s.fields,
        })),
        r.status, me,
      ).isMyTurn,
    ),
    [requests, me],
  );

  // 목록이 갱신되면 열려 있는 다이얼로그도 따라가야 한다(서명 직후 상태 반영)
  const selectedLive = selected
    ? requests.find((r) => r.id === selected.id) ?? selected
    : null;

  if (pending.length === 0) return null;

  return (
    <>
      <DashboardCardShell
        title="서명 대기"
        icon={FileSignature}
        accent="violet"
        description="내가 서명할 차례인 문서입니다."
        badge={
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
            {pending.length}건
          </span>
        }
        className={className}
      >
        <div className="divide-y divide-slate-100">
          {pending.slice(0, 5).map((request) => {
            // 같은 그룹에 나 말고 누가 더 있는지 = 동시 서명인지 알려 준다
            const groups = groupSigners(request.signers.map((s) => ({
              id: s.id, orderIndex: s.orderIndex, roleLabel: s.roleLabel,
              signerUserId: s.signerUserId, signerName: s.signerName,
              status: s.status, fields: s.fields,
            })));
            const myGroup = groups.find((g) =>
              g.signers.some((s) =>
                (me.userId != null && s.signerUserId === me.userId) ||
                (s.signerUserId == null && me.name != null && s.signerName === me.name)),
            );
            const together = (myGroup?.signers.length ?? 1) - 1;

            return (
              <button
                key={request.id}
                type="button"
                onClick={() => setSelected(request)}
                className="teacher-dashboard-row flex w-full items-start gap-3 rounded-lg px-1 py-3 text-left"
              >
                <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-violet-500" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {SOURCE_KIND_LABEL[request.sourceKind]}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-800">{request.title}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {request.requesterName} 요청 · {format(new Date(request.createdAt), 'M월 d일')}
                    {together > 0 && ` · 동시 서명 ${together + 1}명`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </DashboardCardShell>

      <SignatureSignDialog
        request={selectedLive}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
      />
    </>
  );
}

export default SignatureInboxCard;
