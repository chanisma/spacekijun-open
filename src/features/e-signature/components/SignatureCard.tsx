/**
 * 서명 요청 카드.
 *
 * 목록을 표(행)가 아니라 카드로 두는 이유 — 한 건에 담긴 것이 **제목·상태·서명 진행·기한**
 * 네 층이라 한 줄로 눌러 담으면 어느 것도 읽히지 않는다. 카드는 세로를 쓸 수 있다.
 *
 * 카드가 답해야 하는 질문은 셋이다:
 *   ① 내가 지금 해야 할 일이 있는가 (`내 차례` 배지 — 가장 눈에 띄어야 한다)
 *   ② 어디까지 왔는가 (서명 진행)
 *   ③ 언제까지 둬도 되는가 (정리 기한 — 지나면 복구 불가라 경고가 필요하다)
 */
import React from 'react';
import { AlertTriangle, Clock, FileSignature } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SignatureProgressChip } from './SignatureProgressChip';
import {
  daysUntilPurge, formatDaysLeft, formatPurgeDeadline, purgeDeadline,
  REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, SOURCE_KIND_LABEL,
  type SignatureRequest,
} from '../types';

interface Props {
  request: SignatureRequest;
  isMyTurn: boolean;
  meId: string | null;
  meName: string | null;
  onClick: () => void;
}

export const SignatureCard: React.FC<Props> = ({ request, isMyTurn, meId, meName, onClick }) => {
  const daysLeft = daysUntilPurge(request);
  const deadline = purgeDeadline(request);
  const purged = !!request.purgedAt;
  const archived = !!(request.meta as Record<string, unknown>)?.drive;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-2 rounded-xl border bg-white p-3 text-left transition-all',
        'hover:border-slate-300 hover:shadow-sm',
        // 내 차례인 카드는 테두리로 구분한다 — 배지 하나로는 목록에서 훑을 때 놓친다
        isMyTurn ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200',
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <FileSignature className={cn('mt-0.5 h-4 w-4 shrink-0',
          isMyTurn ? 'text-blue-600' : 'text-slate-300')} />
        <div className="min-w-0 flex-1">
          {/* 제목은 길다 — 두 줄까지 받고 그 뒤 자른다(한 줄 truncate 는 정보를 너무 잃는다) */}
          <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-slate-800"
             title={request.title}>
            {request.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-400">
            <span>{SOURCE_KIND_LABEL[request.sourceKind]}</span>
            <span className="text-slate-300">·</span>
            <span>{request.requesterName}</span>
            <span className="text-slate-300">·</span>
            <span>{new Date(request.createdAt).toLocaleDateString('ko-KR')}</span>
          </div>
        </div>

        {/*
          '내 차례'는 아래 진행 칩이 이미 말하므로 여기서 반복하지 않는다.
          같은 사실을 두 번 적으면 정작 다른 정보(요청 상태)가 묻힌다.
        */}
        <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px]',
          REQUEST_STATUS_TONE[request.status])}>
          {REQUEST_STATUS_LABEL[request.status]}
        </span>
      </div>

      {/*
        진행 표시는 업무 관리 `TaskAssigneeSummary` 와 같은 결의 한 줄 칩이다 —
        명단은 펼치지 않고 "N/M 완료 · 누구 대기 · 내 상태"만 담는다.
        전체 명단은 카드를 눌러 여는 서명 다이얼로그가 맡는다.
      */}
      <SignatureProgressChip
        request={request}
        meId={meId}
        meName={meName}
        isMyTurn={isMyTurn}
      />

      {/* 기한·보관 상태 — 지나면 복구가 불가능하므로 목록에서도 보여야 한다 */}
      {(purged || archived || daysLeft != null) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 pt-1.5 text-[10px]">
          {archived ? (
            <span className="text-emerald-700">Drive에 보관됨</span>
          ) : purged ? (
            <span className="text-slate-400">문서 정리됨 · 다시 받을 수 없음</span>
          ) : daysLeft != null && deadline ? (
            /* 카드는 좁으므로 날짜는 접고 남은 기간을 앞세운다. 정확한 시각은 title 로 */
            <span
              className={cn(
                'inline-flex items-center gap-1',
                daysLeft <= 2 ? 'font-medium text-rose-600'
                  : daysLeft <= 4 ? 'text-amber-700' : 'text-slate-400',
              )}
              title={request.status === 'pending' ? `${formatPurgeDeadline(deadline)}까지 서명이 끝나지 않으면 만료·정리됩니다` : `${formatPurgeDeadline(deadline)}에 정리됩니다`}
            >
              {daysLeft <= 2 ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {request.status === 'pending' ? '마감' : '정리'} {formatDaysLeft(daysLeft)}
              <span className="text-slate-400">· {formatPurgeDeadline(deadline).split(' ')[0]} {formatPurgeDeadline(deadline).split(' ')[1]}</span>
            </span>
          ) : null}
        </div>
      )}
    </button>
  );
};

export default SignatureCard;
