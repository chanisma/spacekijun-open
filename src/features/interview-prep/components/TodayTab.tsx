import { Loader2, MessageCircleQuestion, Sparkles } from 'lucide-react';
import type { InterviewPrepState } from '../../../../supabase/functions/_shared/interviewPrep';
import { isInFlight, type InterviewThread } from '../utils';
import { InterviewThreadView, type ThreadActions } from './InterviewThreadView';
import { AccentCard, EmptyState } from './parts';

/**
 * [오늘] — 하루 한 번의 질문 하나.
 *
 * **들어오는 것만으로 질문이 생성되지 않는다.** 재학생 630명이 홈을 열 때마다 LLM 이
 * 돌면 비용도 대기 시간도 감당되지 않고, 대부분은 그날 답하지 않는다. 아카데미의
 * "오늘의 만남"과 같은 이유로 **누를 때** 만든다.
 */
export function TodayTab({
  state, thread, actions, onStart, starting, error,
}: {
  state: InterviewPrepState | undefined;
  thread: InterviewThread | null;
  actions: ThreadActions;
  onStart: () => void;
  starting: boolean;
  error: string | null;
}) {
  const daily = state?.daily ?? null;
  const generating = starting || isInFlight(daily);

  if (!daily) {
    return (
      <>
        {error && <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <EmptyState
          title="오늘의 면접 질문을 받아 보세요"
          description="내 생기부에서 아직 다루지 않은 활동을 하나 골라 면접 질문을 만들어 드려요. 하루에 한 번, 한 문제씩입니다."
          action={(
            <button
              type="button"
              disabled={generating}
              onClick={onStart}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {generating
                ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />질문을 만들고 있어요…</>
                : <><Sparkles className="h-4 w-4" aria-hidden="true" />오늘의 질문 받기</>}
            </button>
          )}
        />
      </>
    );
  }

  const answered = !!thread && thread.answers.some((a) => a.status === 'ready');

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <AccentCard tone={answered ? 'done' : 'active'} className="p-4 sm:p-5">
        {thread ? (
          <InterviewThreadView thread={thread} actions={actions} defaultOpenComposer />
        ) : (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            오늘의 질문을 불러오고 있어요…
          </p>
        )}
      </AccentCard>
      {answered && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <MessageCircleQuestion className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
          더 연습하고 싶다면 [연습] 탭에서 활동을 직접 골라 질문을 받을 수 있어요.
        </p>
      )}
    </div>
  );
}
