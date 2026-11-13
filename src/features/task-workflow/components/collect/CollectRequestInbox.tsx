// ========================================
// 내 할 일 「요청」 구획
// 나에게 온 입력·제출 요청(할 일 담당자와 무관) — 열린 요청만, 마감일 순.
// 판정(대상·완료)은 서버 my_collect_requests 가 한다. 2026-10-01: 제출 요청도 같은 목록(D3).
// 2026-10-05: 무엇을 여기 둘지는 placeInboxRequests(lib)가 정한다 — 할 일 행이 맡는 제출 요청은 오지 않고,
//   다 낸 요청은 남은 것과 섞지 않고 아래에 접는다(머리 숫자 = 보이는 줄 수).
// ========================================

import { useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardList, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { collectDueDay, collectDueLabel, REQUEST_KIND_LABEL, requestKindOf, requestProgressLabel, type MyCollectRequest } from '@/lib/collectInput';
import { INBOX_CHIP, INBOX_CHIP_TONE } from '@/components/tasks/inboxChip';

interface Props {
  /** 남은 요청(마감일 순) */
  requests: MyCollectRequest[];
  /** 다 낸 요청 — 마감 전이면 고치러 다시 들어갈 수 있어 지우지 않고 접어 둔다 */
  doneRequests?: MyCollectRequest[];
  onOpen: (actionId: string) => void;
}

export function CollectRequestInbox({ requests, doneRequests = [], onOpen }: Props) {
  const [showDone, setShowDone] = useState(false);
  if (requests.length === 0 && doneRequests.length === 0) return null;
  const today = format(new Date(), 'yyyy-MM-dd');
  const doneToggle = doneRequests.length > 0 && (
    <button
      type="button"
      aria-expanded={showDone}
      onClick={() => setShowDone((v) => !v)}
      className="flex w-full items-center gap-1.5 px-3.5 py-2 text-left text-xs text-slate-500 transition-colors hover:bg-slate-50/80 hover:text-slate-700 sm:px-5"
    >
      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showDone && 'rotate-180')} aria-hidden />
      다 낸 요청 {doneRequests.length}건 {showDone ? '접기' : '보기'}
    </button>
  );

  // 남은 요청이 없으면 구획 머리·카드 없이 한 줄만 — «요청 0» 머리가 남으면 할 일이 남은 것처럼 읽힌다
  if (requests.length === 0) {
    return (
      <section aria-label="다 낸 요청" className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        {doneToggle}
        {showDone && <RequestRows requests={doneRequests} today={today} onOpen={onOpen} className="border-t border-slate-100" />}
      </section>
    );
  }

  return (
    <section aria-label="요청">
      <h2 className="mb-2 flex items-center gap-1.5 px-1">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
        <span className="text-xs font-semibold tracking-tight text-indigo-700">요청</span>
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-100 px-1.5 text-[10px] font-medium tabular-nums text-indigo-700">
          {requests.length}
        </span>
      </h2>
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1 bg-indigo-500" />
        {/* 행 모양은 아래 할 일 목록과 한 벌이다(2026-10-05) — 같은 여백·같은 글자 단·같은 칩.
            종전엔 36px 아이콘 타일·medium 제목이라 바로 아래 목록과 다른 앱처럼 보였다. */}
        <RequestRows requests={requests} today={today} onOpen={onOpen} />
        {doneToggle && <div className="border-t border-slate-100">{doneToggle}</div>}
        {showDone && <RequestRows requests={doneRequests} today={today} onOpen={onOpen} className="border-t border-slate-100" />}
      </div>
    </section>
  );
}

function RequestRows({ requests, today, onOpen, className }: { requests: MyCollectRequest[]; today: string; onOpen: (actionId: string) => void; className?: string }) {
  return (
    <ul className={cn('divide-y divide-slate-100', className)}>
      {requests.map((r) => {
        const complete = r.total > 0 && r.done >= r.total;
        const context = [r.work_title, r.task_title].filter(Boolean).join(' › ');
        const dueDay = collectDueDay(r.due_date);
        const dueLabel = collectDueLabel(r.due_date);
        const urgency = complete || !dueDay ? null : dueDay < today ? 'overdue' : dueDay === today ? 'today' : null;
        const KindIcon = requestKindOf(r) === 'input' ? ClipboardList : Inbox;
        return (
          <li key={r.action_id}>
            <button
              type="button"
              onClick={() => onOpen(r.action_id)}
              className="group/row flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50/80 sm:gap-4 sm:px-5"
            >
              <span className="flex h-5 w-4 shrink-0 items-center justify-center">
                <KindIcon className={cn('h-4 w-4', complete ? 'text-emerald-600' : 'text-indigo-500')} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold leading-5 tracking-tight text-slate-900" title={r.action_title}>{r.action_title}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-500" title={context}>
                  <span className="min-w-0 truncate">{REQUEST_KIND_LABEL[requestKindOf(r)]}{context && ` · ${context}`}</span>
                  {dueLabel && (urgency
                    ? <span className={cn(INBOX_CHIP, 'tabular-nums', INBOX_CHIP_TONE[urgency])}>{dueLabel} 까지</span>
                    : <span className="shrink-0 tabular-nums text-slate-600">· {dueLabel} 까지</span>)}
                </span>
              </span>
              <span className={cn(INBOX_CHIP, 'tabular-nums', complete ? INBOX_CHIP_TONE.done : INBOX_CHIP_TONE.request)}>
                {requestProgressLabel(r)}
              </span>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover/row:text-slate-500" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
