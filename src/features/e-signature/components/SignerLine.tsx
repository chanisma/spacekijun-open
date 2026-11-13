/**
 * 서명 진행 상황 — 그룹 단위로 보여 준다.
 *
 * 결재의 결재선과 달리 **한 칸에 여러 명**이 들어갈 수 있어야 한다(동시 서명).
 * 그래서 가로 한 줄이 아니라 "그룹 → 사람들" 두 층이다. 그룹 사이의 `›` 가 순서를,
 * 그룹 안의 나열이 동시성을 나타낸다.
 */
import React from 'react';
import { Check, ChevronRight, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SignatureStrokesView } from '@/components/signature/SignatureStrokesView';
import { activeOrder, groupSigners, signProgress } from '../lib/signatureFlow';
import { signerColor } from '../lib/signerColor';
import type { SignatureRequest } from '../types';

interface Props {
  request: SignatureRequest;
  meId?: string | null;
  meName?: string | null;
  /** 좁은 자리(목록 행)에서는 서명 그림 없이 이름만 */
  compact?: boolean;
}

export const SignerLine: React.FC<Props> = ({ request, meId, meName, compact }) => {
  const signers = request.signers.map((s) => ({
    id: s.id, orderIndex: s.orderIndex, roleLabel: s.roleLabel,
    signerUserId: s.signerUserId, signerName: s.signerName,
    status: s.status, fields: s.fields,
  }));
  const groups = groupSigners(signers);
  const active = request.status === 'pending' ? activeOrder(signers) : null;
  const progress = signProgress(signers);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
        <span>
          서명 <strong className="text-slate-700">{progress.signed}</strong>/{progress.total}
        </span>
        {progress.waitingOn.length > 0 && request.status === 'pending' && (
          <span className="text-blue-600">
            {progress.waitingOn.join(' · ')} 대기 중
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {groups.map((group, gi) => (
          <React.Fragment key={group.orderIndex}>
            {gi > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />}
            <div
              className={cn(
                'flex flex-wrap items-center gap-1 rounded-lg border px-1.5 py-1',
                group.orderIndex === active
                  ? 'border-blue-200 bg-blue-50/60'
                  : 'border-slate-200 bg-white',
              )}
            >
              {group.signers.map((s) => {
                const full = request.signers.find((x) => x.id === s.id)!;
                const isMe =
                  (meId != null && s.signerUserId === meId) ||
                  (s.signerUserId == null && meName != null && s.signerName === meName);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]',
                      s.status === 'signed' ? 'bg-emerald-50 text-emerald-700'
                        : s.status === 'rejected' ? 'bg-rose-50 text-rose-700'
                        : 'bg-slate-50 text-slate-600',
                    )}
                    title={full.comment ?? undefined}
                  >
                    {/* 서명자 색 — 문서 위 칸 색과 같아 "누구 자리"가 이어진다 */}
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: signerColor(s.signerName) }}
                    />
                    {s.roleLabel && <span className="text-slate-400">{s.roleLabel}</span>}
                    <span className={cn('font-medium', isMe && 'underline decoration-dotted')}>
                      {s.signerName}
                    </span>

                    {s.status === 'signed'
                      ? (compact
                          ? <Check className="h-3 w-3" />
                          : <SignatureStrokesView value={full.signature} className="ml-0.5 h-4 w-10" />)
                      : s.status === 'rejected'
                        ? <X className="h-3 w-3" />
                        : <Clock className="h-3 w-3 text-slate-300" />}
                  </div>
                );
              })}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default SignerLine;
