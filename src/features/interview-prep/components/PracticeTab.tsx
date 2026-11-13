import { useMemo, useState } from 'react';
import { BookOpen, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  COMMON_QUESTION_THEMES,
  type InterviewActivityCandidate,
  type InterviewAskHistory,
  type InterviewPrepState,
} from '../../../../supabase/functions/_shared/interviewPrep';
import type { InterviewThread } from '../utils';
import { InterviewThreadView, type ThreadActions } from './InterviewThreadView';
import { AccentCard, EmptyState, SegmentFilter } from './parts';

type Filter = 'all' | 'unasked';

/**
 * [연습] — 물을 활동을 **학생이 직접 고른다**.
 *
 * 아카데미의 `<select>` + 체크박스 대신 활동 카드를 학년별로 편다. 이름만 적힌 목록에서는
 * "무엇을 아직 안 다뤘는지"가 보이지 않는데, 그것이 이 탭에 오는 유일한 이유다.
 *
 * 맨 위에 **공통 질문** 줄을 따로 둔다 — 1학년처럼 생기부가 얇은 학생에게는 이 줄이
 * 주 콘텐츠다(활동만 두면 그 학생들에게 이 화면은 빈 화면이다).
 */
export function PracticeTab({
  state, activities, history, activeThread, actions, onPractice, pendingKey, error, loading,
}: {
  state: InterviewPrepState | undefined;
  activities: InterviewActivityCandidate[];
  history: InterviewAskHistory;
  activeThread: InterviewThread | null;
  actions: ThreadActions;
  onPractice: (target: { activityEntityId: string } | { themeId: string }) => void;
  pendingKey: string | null;
  error: string | null;
  loading: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const remaining = Math.max((state?.practiceLimit ?? 5) - (state?.practiceUsed ?? 0), 0);
  const exhausted = remaining <= 0;

  const unaskedCount = useMemo(
    () => activities.filter((a) => !(history.counts[a.entityId] > 0)).length,
    [activities, history],
  );
  const visible = useMemo(
    () => (filter === 'unasked' ? activities.filter((a) => !(history.counts[a.entityId] > 0)) : activities),
    [activities, filter, history],
  );
  const byGrade = useMemo(() => {
    const map = new Map<number | null, InterviewActivityCandidate[]>();
    for (const activity of visible) {
      const list = map.get(activity.grade) ?? [];
      list.push(activity);
      map.set(activity.grade, list);
    }
    return [...map.entries()].sort(
      ([a], [b]) => (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER),
    );
  }, [visible]);

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      {activeThread && (
        <AccentCard tone="active" className="p-4 sm:p-5">
          <InterviewThreadView thread={activeThread} actions={actions} defaultOpenComposer />
        </AccentCard>
      )}

      <p className="text-[11px] text-slate-500">
        오늘 남은 연습 질문 <strong className={cn('font-semibold', exhausted ? 'text-slate-400' : 'text-blue-600')}>{remaining}개</strong>
        {exhausted && ' · 내일 다시 이어가요'}
      </p>

      {/* ── 공통 질문 ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <BookOpen className="h-4 w-4 text-blue-600" aria-hidden="true" /> 공통 질문
        </p>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">
          생기부 기록과 상관없이 어느 면접에서나 나오는 질문입니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {COMMON_QUESTION_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              disabled={exhausted || !!pendingKey}
              title={theme.guide}
              onClick={() => onPractice({ themeId: theme.id })}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingKey === `theme:${theme.id}`
                ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                : <Sparkles className="h-3 w-3" aria-hidden="true" />}
              {theme.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── 활동별 ────────────────────────────────────────────────── */}
      {loading ? (
        <p role="status" className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> 내 활동을 불러오고 있어요…
        </p>
      ) : !activities.length ? (
        <EmptyState
          icon={<BookOpen className="h-7 w-7" aria-hidden="true" />}
          title="아직 질문으로 만들 활동이 없어요"
          description="생기부 기록이 쌓이면 활동별 질문이 열립니다. 그때까지는 위의 공통 질문으로 연습해 보세요."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentFilter<Filter>
              ariaLabel="활동 범위"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: '전체', count: activities.length },
                { value: 'unasked', label: '아직 질문 안 받은 활동', count: unaskedCount },
              ]}
            />
          </div>
          {!visible.length ? (
            <EmptyState
              title="모든 활동에서 질문을 받아 봤어요"
              description="[전체]로 돌아가면 이미 다룬 활동도 다시 연습할 수 있습니다."
            />
          ) : byGrade.map(([grade, list]) => (
            <section key={grade ?? 'none'}>
              <h3 className="text-xs font-semibold text-slate-500">
                {grade ? `${grade}학년` : '학년 미상'}
                <span className="ml-1.5 font-normal text-slate-400">{list.length}개</span>
              </h3>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {list.map((activity) => {
                  const asked = history.counts[activity.entityId] ?? 0;
                  const key = activity.entityId;
                  return (
                    <li key={key} className="min-w-0">
                      <button
                        type="button"
                        disabled={exhausted || !!pendingKey}
                        onClick={() => onPractice({ activityEntityId: key })}
                        className="flex h-full w-full flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="min-w-0 max-w-full truncate text-xs font-semibold text-slate-800" title={activity.label}>
                          {activity.label}
                        </span>
                        {activity.subject && (
                          <span className="max-w-full truncate text-[11px] text-slate-400">{activity.subject}</span>
                        )}
                        <span className="mt-auto flex items-center gap-1.5 pt-1 text-[11px] text-slate-500">
                          {pendingKey === key
                            ? <><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />질문을 만들고 있어요…</>
                            : asked > 0
                              ? <>질문 {asked}개</>
                              : <span className="text-slate-400">아직 질문 없음</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
