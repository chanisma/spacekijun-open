/**
 * 면접 준비 (`/interview-prep`) — 학생 전용.
 *
 * 아카데미의 두 기능을 합쳐 옮긴 것이다(2026-09-18 사용자 결정, 로판 컨셉 제거):
 *   **오늘의 만남** 하루 한 번이라는 습관은 있으나 평가가 없고 질문이 잡담형이었다
 *   **교수 면담** 루브릭 평가는 있으나 습관도 축적도 없었다(휘발성 — 화면을 떠나면 사라짐)
 * 여기서는 **하루 한 번 → 루브릭 평가 → 누적**이 한 흐름이다.
 *
 * ── 교사는 어디서 보는가 ──────────────────────────────────────────────────
 * 교사가 이 화면을 열면 **테스트 학생(00-00001)의 생기부로 직접 체험**한다(2026-09-23 —
 * 기록은 교사 본인 계정에 쌓인다). 학생 답변 열람은 여기가 아니라 **생기부 분석 › 면접
 * 준비 탭**이다(`features/evalog/.../StudentInterviewRecord`) — 활동 타임라인·역량분석과 같은
 * 맥락에 놓여야 "이 세특을 방어할 수 있나"라는 질문에 답이 된다.
 *
 * 화면 폭은 `narrow` — 긴 글을 쓰고 읽는 화면이라 한 줄이 길어지면 오히려 나쁘다.
 */
import { useMemo, useState } from 'react';
import { HelpCircle, MessageCircleQuestion } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { useAuth } from '@/components/auth/AuthProvider';
import { askHistoryOf, INTERVIEW_PREP_DEMO_STUDENT_ID } from '../../../supabase/functions/_shared/interviewPrep';
import {
  studentCodeOf,
  useInterviewActivities,
  useInterviewPrepState,
  useInterviewPrepThreads,
  useRequestEvaluation,
  useRequestQuestion,
} from './hooks';
import { removeStored } from '@/lib/safeLocalStorage';
import { draftKey, flattenThreads } from './utils';
import { PracticeTab } from './components/PracticeTab';
import { RecordTab } from './components/RecordTab';
import { TodayTab } from './components/TodayTab';
import { SegmentFilter, Toolbar } from './components/parts';
import { InterviewPrepGuideDialog } from './components/guide/InterviewPrepGuideDialog';
import type { ThreadActions } from './components/InterviewThreadView';

type Tab = 'today' | 'practice' | 'record';

export function InterviewPrepPage() {
  const { user, profile } = useAuth();
  const studentCode = studentCodeOf(profile?.role, user?.email);
  // 교사·관리자는 테스트 학생의 생기부로 체험한다(서버가 같은 규칙으로 학적 코드를 정한다).
  const isDemo = !!profile && profile.role !== 'student' && studentCode === INTERVIEW_PREP_DEMO_STUDENT_ID;
  const state = useInterviewPrepState();
  const record = useInterviewPrepThreads(user ? { userId: user.id } : null);
  const activities = useInterviewActivities(studentCode);
  const askQuestion = useRequestQuestion();
  const evaluate = useRequestEvaluation();

  const [tab, setTab] = useState<Tab>('today');
  const [guideOpen, setGuideOpen] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [pending, setPending] = useState<ThreadActions['pending']>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `record.data ?? []` 를 그대로 쓰면 매 렌더마다 새 배열이라 아래 useMemo 가 전부
  // 무효화된다(로딩 중에는 항상 새 `[]`). 목록 자체를 한 번 기억해 둔다.
  const threads = useMemo(() => record.data ?? [], [record.data]);
  const flat = useMemo(() => flattenThreads(threads), [threads]);
  const history = useMemo(
    () => askHistoryOf(flat.map((node) => node.question)),
    [flat],
  );
  const dailyThread = useMemo(
    () => flat.find((node) => node.question.id === state.data?.daily?.id) ?? null,
    [flat, state.data?.daily?.id],
  );
  const activeThread = useMemo(
    () => flat.find((node) => node.question.id === activeQuestionId) ?? null,
    [flat, activeQuestionId],
  );

  const actions: ThreadActions = {
    pending,
    onEvaluate: (questionId, answer) => {
      setError(null);
      setPending({ questionId, kind: 'evaluate' });
      evaluate.mutateAsync({ questionId, answer })
        // 제출에 성공했으면 초안을 지운다. 남겨 두면 "고쳐서 다시 받기"가 초안을 먼저
        // 읽어, 이미 서버에 저장된 답변 대신 같은 글을 또 보여준다(구분이 안 된다).
        .then(() => removeStored(draftKey(questionId)))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : '평가를 받지 못했어요.'))
        .finally(() => setPending(null));
    },
    onFollowUp: (questionId) => {
      setError(null);
      setPending({ questionId, kind: 'followup' });
      askQuestion.mutateAsync({ mode: 'followup', questionId })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : '질문을 준비하지 못했어요.'))
        .finally(() => setPending(null));
    },
  };

  const startDaily = () => {
    setError(null);
    askQuestion.mutateAsync({ mode: 'daily' })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '질문을 준비하지 못했어요.'));
  };

  const startPractice = (target: { activityEntityId: string } | { themeId: string }) => {
    setError(null);
    setPendingKey('activityEntityId' in target ? target.activityEntityId : `theme:${target.themeId}`);
    askQuestion.mutateAsync({ mode: 'practice', ...target })
      // 만든 질문을 바로 그 자리에 편다 — 목록으로 돌아가 다시 찾게 하지 않는다.
      .then((question) => setActiveQuestionId(question.id))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '질문을 준비하지 못했어요.'))
      .finally(() => setPendingKey(null));
  };

  const summary = state.data
    ? `질문 ${state.data.questionCount}개 · 답변한 날 ${state.data.answeredDays}일`
      + (activities.data?.length ? ` · 내 활동 ${activities.data.length}개` : '')
    : '내 생기부에서 면접 질문을 만들어 연습합니다';

  return (
    <Layout>
      <PageContainer width="narrow">
        <Toolbar
          icon={<MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />}
          title="면접 준비"
          summary={summary}
        >
          {/* [사용 방법]은 액션 묶음의 **맨 왼쪽**이고 그 왼쪽에는 아무 버튼도 두지
              않는다 — 탭 전환기도 오른쪽이다(2026-09-04 사용자 규약). */}
          <button
            type="button"
            title="사용 방법"
            onClick={() => setGuideOpen(true)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden lg:inline">사용 방법</span>
          </button>
          <SegmentFilter<Tab>
            ariaLabel="면접 준비 탭"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'today', label: '오늘' },
              { value: 'practice', label: '연습' },
              { value: 'record', label: '기록' },
            ]}
          />
        </Toolbar>

        {isDemo ? (
          // 교사에게는 "누구의 생기부로 질문이 나오는가"를 상시 알린다 — 모르면 엉뚱한
          // 활동 질문이 나온 것으로 보인다.
          <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-800">
            교사 체험 모드 — 테스트 학생({INTERVIEW_PREP_DEMO_STUDENT_ID})의 생기부로 질문을 받습니다.
            기록은 선생님 계정에 저장되며, 생기부 분석의 {INTERVIEW_PREP_DEMO_STUDENT_ID} [면접 준비] 탭에도 함께 보입니다.
            학생들의 답변은 생기부 분석 › 면접 준비 탭에서 보세요.
          </p>
        ) : (
          /* 교사 열람은 숨기지 않고 상시 알린다 — 나중에 알게 되면 신뢰를 잃는다. */
          <p className="text-[11px] text-slate-400">
            답변과 피드백은 내 계정에 저장되고, 선생님이 생기부 분석 화면에서 함께 볼 수 있어요.
            연습용 AI 피드백이며 실제 입시 점수가 아닙니다.
          </p>
        )}

        {tab === 'today' && (
          <TodayTab
            state={state.data}
            thread={dailyThread}
            actions={actions}
            onStart={startDaily}
            starting={askQuestion.isPending && !pendingKey && !pending}
            error={error}
          />
        )}
        {tab === 'practice' && (
          <PracticeTab
            state={state.data}
            activities={activities.data ?? []}
            history={history.activities}
            activeThread={activeThread}
            actions={actions}
            onPractice={startPractice}
            pendingKey={pendingKey}
            error={error}
            loading={activities.isPending}
          />
        )}
        {tab === 'record' && (
          <RecordTab
            threads={threads}
            activities={activities.data ?? []}
            history={history.activities}
            actions={actions}
          />
        )}

        {record.isError && (
          <p role="alert" className="text-xs text-rose-600">
            기록을 불러오지 못했어요.{' '}
            <button type="button" onClick={() => void record.refetch()} className="font-semibold underline">
              다시 시도
            </button>
          </p>
        )}

        <InterviewPrepGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
      </PageContainer>
    </Layout>
  );
}

export default InterviewPrepPage;
