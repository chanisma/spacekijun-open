import { useMemo, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  interviewCoverage,
  type InterviewActivityCandidate,
  type InterviewAskHistory,
} from '../../../../supabase/functions/_shared/interviewPrep';
import {
  groupThreadsByActivity, latestEvaluatedAnswer, weakestCriteria, type InterviewThread,
} from '../utils';
import { InterviewThreadView, type ThreadActions } from './InterviewThreadView';
import { AccentCard, CoverageBar, EmptyState, RubricRow, SegmentFilter } from './parts';

type Sort = 'recent' | 'activity';

/**
 * [기록] — 나의 예상 질문집.
 *
 * 아카데미의 면담은 **휘발성**이라("이 화면을 떠나면 사라집니다") 다듬어 온 과정이
 * 남지 않았다. 면접 준비에서 그 과정이 곧 성과이므로 여기서는 버전째로 쌓아 둔다.
 *
 * `readOnly` 를 주면 교사 화면(생기부 분석 [면접 준비] 탭)이 된다 — 같은 부품이다.
 */
export function RecordTab({
  threads, activities, history, actions, readOnly, emptyDescription,
}: {
  threads: InterviewThread[];
  activities: InterviewActivityCandidate[];
  history: InterviewAskHistory;
  actions?: ThreadActions;
  readOnly?: boolean;
  emptyDescription?: string;
}) {
  const [sort, setSort] = useState<Sort>(readOnly ? 'activity' : 'recent');
  const [showUncovered, setShowUncovered] = useState(false);

  const coverage = useMemo(() => interviewCoverage(activities, history), [activities, history]);
  const groups = useMemo(() => groupThreadsByActivity(threads), [threads]);
  const weak = useMemo(() => weakestCriteria(threads, 2), [threads]);
  const uncovered = useMemo(
    () => activities.filter((a) => !(history.counts[a.entityId] > 0)),
    [activities, history],
  );

  if (!threads.length) {
    return (
      <EmptyState
        icon={<History className="h-7 w-7" aria-hidden="true" />}
        title="아직 기록이 없어요"
        description={emptyDescription ?? '[오늘] 탭에서 첫 질문을 받아 보세요. 답변과 피드백이 여기에 쌓입니다.'}
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <CoverageBar coverage={coverage} />
        {weak.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3">
            <span className="text-xs font-semibold text-slate-700">아직 약한 기준</span>
            {weak.map((row) => (
              <RubricRow key={row.id} label={row.label} score={Math.round(row.average)} />
            ))}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentFilter<Sort>
          ariaLabel="기록 정렬"
          value={sort}
          onChange={setSort}
          options={[{ value: 'recent', label: '날짜순' }, { value: 'activity', label: '활동별' }]}
        />
        {uncovered.length > 0 && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-500">
            <input
              type="checkbox"
              checked={showUncovered}
              onChange={(e) => setShowUncovered(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            아직 질문 안 받은 활동 {uncovered.length}개도 보기
          </label>
        )}
      </div>

      {sort === 'recent' ? (
        <ul className="space-y-3">
          {threads.map((thread) => (
            <li key={thread.question.id}>
              <AccentCard
                tone={latestEvaluatedAnswer(thread) ? 'done' : 'idle'}
                className="p-4"
              >
                <InterviewThreadView thread={thread} actions={actions} />
              </AccentCard>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => (
            <li key={group.key}>
              <ActivityGroupCard group={group} actions={actions} />
            </li>
          ))}
        </ul>
      )}

      {/* 질문을 받지 않은 활동도 보여준다 — 교사에게는 "학생이 피하고 있는 활동"이
          상담 실마리이고, 학생에게는 다음에 무엇을 할지가 된다. */}
      {showUncovered && (
        <section className="rounded-2xl border border-dashed bg-slate-50/60 p-4">
          <p className="text-xs font-semibold text-slate-600">아직 질문을 받지 않은 활동</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {uncovered.map((activity) => (
              <li
                key={activity.entityId}
                title={activity.label}
                className="max-w-full truncate rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500"
              >
                {activity.grade ? `${activity.grade}학년 · ` : ''}{activity.label}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ActivityGroupCard({
  group, actions,
}: { group: ReturnType<typeof groupThreadsByActivity>[number]; actions?: ThreadActions }) {
  const [open, setOpen] = useState(false);
  return (
    <AccentCard tone={group.answeredCount > 0 ? 'done' : 'idle'}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-800" title={group.label}>
            {group.label}
          </span>
          <span className="block text-[11px] text-slate-400">
            질문 {group.threads.length}개 · 평가받은 답변 {group.answeredCount}개
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="space-y-4 border-t px-4 py-4">
          {group.threads.map((thread) => (
            <InterviewThreadView key={thread.question.id} thread={thread} actions={actions} />
          ))}
        </div>
      )}
    </AccentCard>
  );
}
