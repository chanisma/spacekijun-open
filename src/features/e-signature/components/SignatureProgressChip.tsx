/**
 * 서명 진행 칩 — **업무 관리 `TaskAssigneeSummary` 와 같은 결**.
 *
 * 목록 카드에서 담당자 상황을 보여 주는 자리는 이미 앱에 규약이 있다:
 * `h-9` 한 줄 칩에 **[아이콘] [N/M 완료] ……… [내 상태 배지]**.
 * 서명도 같은 질문("몇 명 중 몇 명이 했나 · 나는 했나")에 답하므로 같은 모양을 쓴다 —
 * 화면마다 다르게 생기면 같은 앱이 여러 앱처럼 보인다.
 *
 * **명단은 카드에 펼치지 않는다.** 업무 카드가 비매니저에게 담당자 명단을 감추는 것과 같은
 * 이유이고(2026-08-11 결정), 카드에서 필요한 것은 "얼마나 왔나 · 내 차례인가"뿐이다.
 * 전체 명단은 서명 다이얼로그의 `SignerLine` 이 맡는다.
 */
import React from 'react';
import { CheckCircle2, Clock3, PenLine, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { activeOrder, groupSigners } from '../lib/signatureFlow';
import type { SignatureRequest } from '../types';

interface Props {
  request: SignatureRequest;
  meId: string | null;
  meName: string | null;
  /** 지금 내가 서명할 차례인가 — 카드가 이미 계산해 둔 값을 받는다(중복 계산 방지) */
  isMyTurn: boolean;
  className?: string;
}

export const SignatureProgressChip: React.FC<Props> = ({
  request, meId, meName, isMyTurn, className,
}) => {
  const signers = request.signers.map((s) => ({
    id: s.id, orderIndex: s.orderIndex, roleLabel: s.roleLabel,
    signerUserId: s.signerUserId, signerName: s.signerName,
    status: s.status, fields: s.fields,
  }));

  const total = signers.length;
  const done = signers.filter((s) => s.status === 'signed').length;
  const allDone = total > 0 && done === total;

  const mine = request.signers.find((s) =>
    (meId != null && s.signerUserId === meId) ||
    (s.signerUserId == null && meName != null && s.signerName === meName));

  // 지금 서명을 기다리는 사람 — "누구 때문에 멈춰 있나"가 가장 궁금한 정보다
  const active = request.status === 'pending' ? activeOrder(signers) : null;
  const waiting = active == null ? [] : groupSigners(signers)
    .find((g) => g.orderIndex === active)?.signers
    .filter((s) => s.status === 'pending')
    .map((s) => s.signerName) ?? [];

  return (
    <div
      className={cn(
        'flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border px-2 text-left',
        allDone ? 'border-emerald-200 bg-emerald-50/60' : 'bg-muted/35',
        className,
      )}
      title={waiting.length > 0 ? `${waiting.join(', ')} 서명 대기 중` : undefined}
    >
      <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-xs font-medium tabular-nums">
        {done}/{total}
        <span className="ml-1 font-normal text-muted-foreground">완료</span>
      </span>

      {/* 남은 사람 이름 — 자리가 있으면 보여 준다(없으면 조용히 접힌다) */}
      {waiting.length > 0 && (
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {waiting.join(', ')} 대기
        </span>
      )}

      {/* 내 상태 — 업무 카드와 같은 자리(오른쪽 끝), 같은 모양 */}
      {mine && (
        <span
          className={cn(
            'ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
            mine.status === 'signed'
              ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
              : mine.status === 'rejected'
                ? 'border-rose-300 bg-rose-100 text-rose-800'
                : isMyTurn
                  // 내 차례는 **눌러야 할 이유**라 파랑으로 튀게 둔다
                  ? 'border-blue-300 bg-blue-100 text-blue-800'
                  : 'border-slate-200 bg-background text-muted-foreground',
          )}
        >
          {mine.status === 'signed' ? <CheckCircle2 className="h-2.5 w-2.5" />
            : isMyTurn ? <PenLine className="h-2.5 w-2.5" />
            : <Clock3 className="h-2.5 w-2.5" />}
          {mine.status === 'signed' ? '내 서명 완료'
            : mine.status === 'rejected' ? '내가 거절'
            : isMyTurn ? '내 차례'
            : '내 순서 대기'}
        </span>
      )}
    </div>
  );
};

export default SignatureProgressChip;
