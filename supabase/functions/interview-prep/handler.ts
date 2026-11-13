import type { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  activityExcerpt,
  activitySourceLabel,
  askHistoryOf,
  commonTheme,
  interviewPrepEvaluatePrompt,
  interviewPrepStudentIdFor,
  interviewPrepQuestionPrompt,
  isUsableQuestion,
  koreaDay,
  loadActivityCandidates,
  KG_VERSION_SCAN_LIMIT,
  parseInterviewPrepEvaluation,
  parseInterviewPrepRequest,
  parseInterviewQuestion,
  pickCommonTheme,
  pickInterviewActivity,
  type InterviewActivityCandidate,
  type InterviewPrepAnswerRow,
  type InterviewPrepQuestionRow,
} from '../_shared/interviewPrep.ts';

export const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
export const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers });

/**
 * 모델은 단계마다 다르다 (2026-10-23 사용자 결정 — «피드백은 루나»).
 *   · 질문 만들기 = Solar Pro 4 — 고른 활동으로 문장 하나를 쓰는 짧은 일.
 *   · 답변 평가(피드백) = OpenAI gpt-6-luna — 열린 답을 루브릭으로 채점하고 근거·꼬리 질문까지
 *     쓰는 판단 과제라 더 강한 모델에 맡긴다. 평가 결과(`evaluation.model`)에 모델을 남겨,
 *     교체 전(Solar) 평가와 섞여도 어느 모델의 점수인지 가릴 수 있게 한다.
 */
const QUESTION_MODEL = 'solar-pro4';
const QUESTION_ENDPOINT = 'https://api.upstage.ai/v1/chat/completions';
export const EVALUATE_MODEL = 'gpt-6-luna';
const EVALUATE_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
/**
 * luna 는 추론 토큰과 답이 `max_completion_tokens` 를 나눠 쓴다 — 평가 본문(종전 Solar 5,200)만큼만
 * 주면 추론이 다 먹어 빈 답이 나온다. 앱의 다른 luna 경로와 같은 하한 12,000.
 */
const EVALUATE_MAX_COMPLETION_TOKENS = 12_000;
/**
 * 추론 강도 — 미지정이면 모델 기본값(medium)이라 벽시간이 길다. 문서 생성 luna 와 같은 'low'.
 * ⚠️ 면접 평가에서 아직 재지 않은 값이다 — 느리거나 점수가 흔들리면 여기부터 볼 것.
 */
const EVALUATE_REASONING_EFFORT = 'low';

async function readReply(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error('Provider unavailable');
  const body = await response.json();
  // 잘린 응답은 JSON 이 깨져 파싱에서 죽는데, 그 오류만으로는 "다시 눌러 보세요"인지
  // "입력을 줄이세요"인지 구분할 수 없다. finish_reason 이 잘림의 유일한 확정 증거다.
  if (body.choices?.[0]?.finish_reason === 'length') throw new Error('Incomplete reply');
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Empty reply');
  return JSON.parse(text);
}

const messagesOf = (system: string, payload: unknown) => [
  { role: 'system', content: system },
  { role: 'user', content: JSON.stringify(payload) },
];

/**
 * 질문 만들기 — Solar Pro 4 한 번.
 *
 * `reasoning_effort: 'none'` 은 pro4 실측에서 나온 값이다 — 이 모델은 추론이 출력
 * 예산의 대부분을 먹어서(실측 284토큰 중 281), 켜 두면 `content` 가 **빈 채**
 * `finish_reason='length'` 로 끝난다. 추출·재작성 과제라 추론이 값을 하지 않는다.
 */
async function chat(
  aiFetch: typeof fetch, key: string, system: string, payload: unknown, maxTokens: number,
): Promise<unknown> {
  return readReply(await aiFetch(QUESTION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: QUESTION_MODEL,
      reasoning_effort: 'none',
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: messagesOf(system, payload),
    }),
  }));
}

/**
 * 답변 평가 — luna 한 번. temperature 는 보내지 않는다(luna 는 기본값 1 만 받는다 — openai-proxy
 * 2026-10-20 실측). 시간 제한은 엣지 게이트웨이(약 150초)보다 먼저 포기하도록 120초.
 */
async function chatEvaluate(
  aiFetch: typeof fetch, key: string, system: string, payload: unknown,
): Promise<unknown> {
  return readReply(await aiFetch(EVALUATE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: EVALUATE_MODEL,
      reasoning_effort: EVALUATE_REASONING_EFFORT,
      max_completion_tokens: EVALUATE_MAX_COMPLETION_TOKENS,
      response_format: { type: 'json_object' },
      messages: messagesOf(system, payload),
    }),
  }));
}

/**
 * 질문 후보가 될 활동을 모은다.
 *
 * 버전 선택 규칙은 `loadActivityCandidates` 가 갖는다 — **화면도 같은 함수를 쓴다**.
 * 규칙이 갈리면 학생이 고른 활동을 서버가 못 찾는 상태가 된다(위 함수 주석 참고).
 */
async function loadCandidates(
  db: SupabaseClient, studentId: string,
): Promise<InterviewActivityCandidate[]> {
  const { data: versions, error } = await db.from('student_kg_versions')
    .select('id,version').eq('student_id', studentId)
    .order('version', { ascending: false }).limit(KG_VERSION_SCAN_LIMIT);
  if (error) throw error;
  const found = await loadActivityCandidates(versions ?? [], async (versionId) => {
    const { data: rows, error: rowError } = await db.from('student_kg_entities')
      .select('entity_id,label,type,properties')
      .eq('kg_version_id', versionId).eq('type', 'Activity').limit(500);
    if (rowError) throw rowError;
    return rows ?? [];
  });
  return found?.candidates ?? [];
}

/** 본인 질문 이력(활동·주제별 횟수). RLS 가 본인 행만 주므로 user_id 필터는 방어다. */
async function loadHistory(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from('interview_prep_questions')
    .select('activity_entity_id,theme_id,created_at,status')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return askHistoryOf(data ?? []);
}

export async function handleInterviewPrep(
  db: SupabaseClient,
  writer: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
  raw: unknown,
  aiFetch: typeof fetch = fetch,
): Promise<Response> {
  let input: ReturnType<typeof parseInterviewPrepRequest>;
  try { input = parseInterviewPrepRequest(raw); }
  catch (e) { return json({ error: (e as Error).message }, 400); }

  const { data: profile, error: profileError } = await db
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError) return json({ error: '권한을 확인하지 못했어요.' }, 503);
  // 학생은 본인 생기부(이메일 prefix), 교사·관리자는 **고정된 테스트 학생**으로 체험한다
  // (2026-09-23 사용자 결정). 학적 코드는 서버가 역할에서 유도한다 — 요청 본문의 값은
  // 받지 않으므로 교사가 다른 학생의 생기부로 질문을 만들 수 없다. 기록은 교사 본인
  // 계정(user_id)에 쌓인다. 직원은 학생 정보 차단 역할이라 여전히 거부한다.
  const studentId = interviewPrepStudentIdFor(profile?.role, user.email);
  if (!studentId) {
    return json({ error: '학생·교사 계정에서 이용할 수 있어요.' }, 403);
  }
  // 키는 그 단계가 쓰는 공급자의 것만 요구한다 — 한쪽 키가 없다고 다른 단계까지 막지 않는다
  if (input.mode === 'evaluate') {
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiKey) return json({ error: '면접 준비 AI 가 아직 준비되지 않았어요.' }, 503);
    try {
      return await evaluate(db, writer, user.id, input, openAiKey, aiFetch);
    } catch (e) {
      console.error('interview_prep_failed', e instanceof Error ? e.message : e);
      return json({ error: '질문을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 502);
    }
  }
  const key = Deno.env.get('SOLAR_API_KEY') ?? Deno.env.get('UPSTAGE_API_KEY');
  if (!key) return json({ error: '면접 준비 AI 가 아직 준비되지 않았어요.' }, 503);

  try {
    if (input.mode === 'followup') return await followUp(db, writer, user.id, studentId, input);
    return await createQuestion(db, writer, user.id, studentId, input, key, aiFetch);
  } catch (e) {
    console.error('interview_prep_failed', e instanceof Error ? e.message : e);
    return json({ error: '질문을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 502);
  }
}

// ---------------------------------------------------------------------------
// 질문 만들기 (오늘의 질문 · 연습)
// ---------------------------------------------------------------------------
async function createQuestion(
  db: SupabaseClient, writer: SupabaseClient, userId: string, studentId: string,
  input: ReturnType<typeof parseInterviewPrepRequest>, key: string, aiFetch: typeof fetch,
): Promise<Response> {
  const [candidates, history] = await Promise.all([
    loadCandidates(db, studentId),
    loadHistory(db, userId),
  ]);
  const seed = `${userId}:${koreaDay()}`;

  let activity: InterviewActivityCandidate | null = null;
  let theme: ReturnType<typeof commonTheme> = null;
  if (input.activityEntityId) {
    activity = candidates.find((c) => c.entityId === input.activityEntityId) ?? null;
    if (!activity) {
      return json({ error: '선택한 활동을 찾을 수 없어요. 목록을 새로 고쳐 주세요.' }, 400);
    }
  } else if (input.themeId) {
    theme = commonTheme(input.themeId);
  } else {
    activity = pickInterviewActivity(candidates, history.activities, seed);
    // 생기부가 아직 얇은 학생(1학년 등)은 활동이 0개다. 빈 화면 대신 공통 질문으로 연다.
    if (!activity) theme = pickCommonTheme(history.themes, seed);
  }
  if (!activity && !theme) return json({ error: '질문 주제를 정하지 못했어요.' }, 400);

  const claimArgs = activity
    ? {
      p_activity: activity.entityId,
      p_theme: null,
      p_source_kind: 'activity',
      p_source_label: activitySourceLabel(activity),
      p_source_excerpt: activityExcerpt(activity),
      p_source_ref: {
        kgEntityId: activity.entityId,
        grade: activity.grade,
        semester: activity.semester,
        subject: activity.subject,
        category: activity.category,
        sourceActivityIds: activity.sourceActivityIds,
      },
    }
    : {
      p_activity: null,
      p_theme: theme!.id,
      p_source_kind: 'common',
      p_source_label: `공통 질문 · ${theme!.label}`,
      p_source_excerpt: null,
      p_source_ref: { themeId: theme!.id },
    };

  const { data: claim, error: claimError } = await writer.rpc('interview_prep_claim_question', {
    p_user: userId, p_student: studentId, p_kind: input.mode, p_parent: null, ...claimArgs,
  });
  // 연습 횟수 초과 같은 규칙 위반은 서버가 문구를 갖고 있다(P0001). 그대로 전한다.
  if (claimError) return json({ error: claimError.message ?? '질문을 준비하지 못했어요.' }, 409);
  if (!claim.claimed) return json({ question: claim.question });

  const row = claim.question as InterviewPrepQuestionRow;
  const finish = (question: string | null, intent: string | null) =>
    writer.rpc('interview_prep_finish_question', {
      p_id: row.id, p_token: claim.token, p_question: question, p_intent: intent,
    });

  try {
    const system = interviewPrepQuestionPrompt({
      sourceKind: activity ? 'activity' : 'common',
      themeGuide: theme?.guide ?? null,
    });
    const payload = activity
      ? {
        activity: {
          label: activity.label,
          grade: activity.grade,
          semester: activity.semester,
          subject: activity.subject ?? activity.category,
          researchQuestion: activity.researchQuestion,
          // 인용은 8줄까지. 더 실어도 질문 하나를 만드는 데 값을 하지 않는다.
          evidence: activity.evidence.slice(0, 8),
        },
      }
      : { theme: { label: theme!.label, guide: theme!.guide } };
    const parsed = parseInterviewQuestion(await chat(aiFetch, key, system, payload, 900));
    if (!isUsableQuestion(parsed)) throw new Error('Unusable question');
    const { data, error } = await finish(parsed.question, parsed.intent);
    if (error) throw error;
    return json({ question: data });
  } catch (e) {
    console.error('interview_prep_question_failed', e instanceof Error ? e.message : e);
    // 행을 failed 로 닫는다. 남겨 두면 임대가 만료될 때까지 화면이 "준비 중"에 멈춘다.
    const { data } = await finish(null, null);
    return json({ error: '질문을 준비하지 못했어요. 다시 시도해 주세요.', question: data }, 502);
  }
}

// ---------------------------------------------------------------------------
// 꼬리 질문 — **LLM 을 부르지 않는다**
// ---------------------------------------------------------------------------
//
// 후속 질문은 직전 평가가 이미 `followUp` 으로 만들어 두었다. 다시 생성하면 학생이
// 화면에서 읽은 질문과 **다른 문장**이 저장돼, 눌렀더니 딴 걸 묻는 상태가 된다.
async function followUp(
  db: SupabaseClient, writer: SupabaseClient, userId: string, studentId: string,
  input: ReturnType<typeof parseInterviewPrepRequest>,
): Promise<Response> {
  const { data: parent, error: parentError } = await db
    .from('interview_prep_questions')
    .select('id,kind,source_kind,activity_entity_id,theme_id,source_label,source_excerpt,source_ref')
    .eq('id', input.questionId).eq('user_id', userId).maybeSingle();
  if (parentError) throw parentError;
  if (!parent) return json({ error: '질문을 다시 불러와 주세요.' }, 404);

  const { data: answers, error: answerError } = await db
    .from('interview_prep_answers')
    .select('evaluation')
    .eq('question_id', parent.id).eq('status', 'ready')
    .order('version', { ascending: false }).limit(1);
  if (answerError) throw answerError;
  const followUpText = typeof answers?.[0]?.evaluation?.followUp === 'string'
    ? answers[0].evaluation.followUp.trim()
    : '';
  if (!followUpText) return json({ error: '이어질 질문이 아직 없어요. 먼저 답변을 평가받아 주세요.' }, 400);

  const { data: claim, error: claimError } = await writer.rpc('interview_prep_claim_question', {
    p_user: userId,
    p_student: studentId,
    p_kind: 'followup',
    p_parent: parent.id,
    // 같은 활동 아래 묶이도록 근거를 물려받는다 — 기록 탭이 활동별로 접어 보여준다.
    p_activity: parent.activity_entity_id,
    p_theme: parent.theme_id,
    p_source_kind: parent.source_kind,
    p_source_label: parent.source_label,
    p_source_excerpt: parent.source_excerpt,
    p_source_ref: parent.source_ref ?? {},
  });
  if (claimError) return json({ error: claimError.message ?? '질문을 준비하지 못했어요.' }, 409);
  if (!claim.claimed) return json({ question: claim.question });

  const { data, error } = await writer.rpc('interview_prep_finish_question', {
    p_id: (claim.question as InterviewPrepQuestionRow).id,
    p_token: claim.token,
    p_question: followUpText.slice(0, 1500),
    p_intent: '앞선 답변의 근거와 성찰을 한 걸음 더 확인합니다.',
  });
  if (error) throw error;
  return json({ question: data });
}

// ---------------------------------------------------------------------------
// 답변 평가
// ---------------------------------------------------------------------------
async function evaluate(
  db: SupabaseClient, writer: SupabaseClient, userId: string,
  input: ReturnType<typeof parseInterviewPrepRequest>, key: string, aiFetch: typeof fetch,
): Promise<Response> {
  const { data: question, error: questionError } = await db
    .from('interview_prep_questions')
    .select('id,question,intent,source_kind,source_label,source_excerpt')
    .eq('id', input.questionId).eq('user_id', userId).maybeSingle();
  if (questionError) throw questionError;
  if (!question?.question) return json({ error: '질문을 다시 불러와 주세요.' }, 404);

  const { data: claim, error: claimError } = await writer.rpc('interview_prep_claim_answer', {
    p_user: userId, p_question: question.id, p_answer: input.answer,
  });
  if (claimError) return json({ error: claimError.message ?? '평가를 시작하지 못했어요.' }, 409);
  if (!claim.claimed) return json({ answer: claim.answer });

  const row = claim.answer as InterviewPrepAnswerRow;
  const finish = (evaluation: unknown) => writer.rpc('interview_prep_finish_answer', {
    p_id: row.id, p_token: claim.token, p_evaluation: evaluation,
  });

  try {
    const payload = {
      question: question.question,
      intent: question.intent,
      // 기록 발췌를 함께 준다 — **그리고 프롬프트가 대조를 지시한다.** 자료만 실어
      // 보내고 쓰라고 하지 않으면 모델이 쓸 수도 안 쓸 수도 있어, 학생이 기록에 없는
      // 이야기로 좋은 점수를 받고 실제 면접에서 막힌다(2026-09-18 사용자 지적).
      record: question.source_excerpt
        ? { label: question.source_label, excerpt: question.source_excerpt }
        : null,
      answer: row.answer,
    };
    const parsed = parseInterviewPrepEvaluation(
      await chatEvaluate(aiFetch, key, interviewPrepEvaluatePrompt(), payload),
    );
    // 어느 모델의 점수인지 남긴다 — 교체 전(Solar) 평가와 섞여도 가릴 수 있게
    const { data, error } = await finish({ ...parsed, model: EVALUATE_MODEL });
    if (error) throw error;
    return json({ answer: data });
  } catch (e) {
    console.error('interview_prep_evaluate_failed', e instanceof Error ? e.message : e);
    const { data } = await finish(null);
    return json({
      error: '평가를 받지 못했어요. 답변은 저장돼 있으니 다시 시도해 주세요.',
      answer: data,
    }, 502);
  }
}
