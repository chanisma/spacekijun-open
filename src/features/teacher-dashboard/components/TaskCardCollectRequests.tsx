// ========================================
// 홈 「나의 업무」 카드 안의 「입력 요청」 줄 (2026-09-27 사용자 요청)
//
// 입력 받기(collect.input)의 대상자는 **할 일 담당자가 아니다**. 카드의 할 일 목록은 담당 할 일
// (`assigned_tasks`)만 보므로, 이 줄이 없으면 대상자는 알림을 놓치는 순간 홈에서 요청을 볼 길이 없다
// (종전 발견 경로 = 알림 · 내 할 일 「입력 요청」 구획뿐).
//
// 그리기만 한다 — 무엇이 «남은 요청»인지는 `pendingCollectRequests`(lib)가, 응답은 `CollectRespondDialog` 가 맡는다.
// ⚠️ 입력 요청을 담당자로 끼워 넣지 말 것 — 대상자가 할 일의 완료 버튼까지 갖게 되어, 한 명이 누르는
//    순간 할 일이 끝나고 요청이 닫힌다(close_collect_on_task_end).
// ========================================

import { ChevronRight, ClipboardList } from 'lucide-react';
import { REQUEST_KIND_LABEL, requestKindOf, requestVerb } from '@/lib/collectInput';
import { collectDueLabel, type MyCollectRequest } from '@/lib/collectInput';

/** 카드에 그리는 최대 줄 수 — 넘치면 «내 할 일에서 N건 더» */
export const DASHBOARD_COLLECT_LIMIT = 3;

export function TaskCardCollectRequests({
  requests,
  onOpen,
  onMore,
}: {
  /** 남은 요청만(정렬됨) — `pendingCollectRequests` 결과 */
  requests: MyCollectRequest[];
  onOpen: (actionId: string) => void;
  onMore: () => void;
}) {
  if (requests.length === 0) return null;
  const visible = requests.slice(0, DASHBOARD_COLLECT_LIMIT);
  const rest = requests.length - visible.length;

  return (
    <section
      aria-label="요청"
      data-testid="dashboard-collect-requests"
      className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-2"
    >
      <div className="mb-1 flex items-center gap-1.5 px-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden />
        <span className="text-xs font-bold text-indigo-700">요청</span>
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-100 px-1.5 text-[10px] font-semibold tabular-nums text-indigo-700">
          {requests.length}
        </span>
        <span className="ml-auto truncate text-[10px] text-slate-400">담당이 아니어도 내 차례인 입력·제출</span>
      </div>
      <ul className="space-y-1">
        {visible.map((r) => {
          const context = [r.work_title, r.task_title].filter(Boolean).join(' › ');
          return (
            <li key={r.action_id}>
              <button
                type="button"
                onClick={() => onOpen(r.action_id)}
                className="flex w-full min-w-0 items-center gap-2.5 rounded-xl bg-white px-2.5 py-2 text-left shadow-sm transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label={`${REQUEST_KIND_LABEL[requestKindOf(r)]} 요청 ${r.action_title} ${requestVerb(r)}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <ClipboardList className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900" title={r.action_title}>
                    {r.action_title}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400" title={context}>
                    {[REQUEST_KIND_LABEL[requestKindOf(r)], context].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {/* 마감은 오른쪽에 — 맥락 줄 끝에 붙이면 긴 업무 이름에 잘려 휴대폰에서 사라졌다(390px 스크린샷) */}
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">
                    {r.done}/{r.total}칸
                  </span>
                  {collectDueLabel(r.due_date) && (
                    <span className="text-[10px] tabular-nums text-slate-400">
                      {collectDueLabel(r.due_date)} 까지
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          onClick={onMore}
          className="mt-1 flex w-full items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50"
        >
          내 할 일에서 {rest}건 더 보기
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </section>
  );
}
