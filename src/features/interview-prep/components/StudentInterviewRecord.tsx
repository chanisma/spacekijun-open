import { useMemo } from 'react';
import { Loader2, MessageCircleQuestion } from 'lucide-react';
import { askHistoryOf } from '../../../../supabase/functions/_shared/interviewPrep';
import { useInterviewActivities, useInterviewPrepThreads } from '../hooks';
import { evaluationsOf, flattenThreads } from '../utils';
import { RecordTab } from './RecordTab';

/**
 * 교사가 보는 학생 면접 기록 — **생기부 분석 › 면접 준비 탭**의 본체.
 *
 * ── 왜 여기인가 (2026-09-18 사용자 결정) ────────────────────────────────────
 * 학생은 날짜축("오늘 뭘 답할까")으로, 교사는 **활동축**("이 세특을 방어할 수 있나")으로
 * 같은 데이터를 본다. 활동 타임라인·역량분석 옆에 놓여야 그 질문에 답이 되므로
 * 별도 교사 메뉴를 만들지 않고 이 탭 하나로 둔다.
 *
 * **읽기 전용이다.** 1차에서 교사 코멘트·질문 출제는 넣지 않았다 — 교사가 먼저 해야
 * 할 일은 학생의 답변을 읽는 것이고, 쓰기를 붙이면 알림·권한 설계가 따라온다.
 *
 * 화면은 학생의 [기록] 탭과 **같은 부품**(`RecordTab`)이다. 갈라 두면 루브릭 표기와
 * 버전 표시가 두 벌이 되고, 그 어긋남은 오류 없이 "화면마다 다르게 보인다"로만 난다.
 */
export function StudentInterviewRecord({ studentCode }: { studentCode: string }) {
  const record = useInterviewPrepThreads(studentCode ? { studentId: studentCode } : null);
  const activities = useInterviewActivities(studentCode);

  // 매 렌더마다 새 배열이 되지 않게 한 번 기억한다(아래 useMemo 들이 이것에 걸려 있다).
  const threads = useMemo(() => record.data ?? [], [record.data]);
  const history = useMemo(
    () => askHistoryOf(flattenThreads(threads).map((node) => node.question)),
    [threads],
  );
  const answerCount = useMemo(() => evaluationsOf(threads).length, [threads]);
  const lastAt = threads[0]?.question.created_at ?? null;

  if (record.isPending || activities.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> 면접 기록을 불러오고 있어요…
      </p>
    );
  }
  if (record.isError) {
    return (
      <p role="alert" className="py-10 text-sm text-rose-600">
        면접 기록을 불러오지 못했습니다.{' '}
        <button type="button" onClick={() => void record.refetch()} className="font-semibold underline">
          다시 시도
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5 font-semibold text-slate-700">
          <MessageCircleQuestion className="h-4 w-4 text-blue-600" aria-hidden="true" />
          면접 준비
        </span>
        <span>질문 {threads.length}개 · 평가받은 답변 {answerCount}개</span>
        {lastAt && (
          <span className="text-slate-400">
            최근 {new Date(lastAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
          </span>
        )}
      </p>
      <RecordTab
        threads={threads}
        activities={activities.data ?? []}
        history={history.activities}
        readOnly
        emptyDescription="이 학생은 아직 면접 질문에 답하지 않았습니다. 학생 메뉴의 [면접 준비]에서 하루에 한 번 질문을 받을 수 있습니다."
      />
    </div>
  );
}
