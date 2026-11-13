import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type {
  InterviewPrepAnswerRow,
  InterviewPrepQuestionRow,
  InterviewPrepState,
} from '../../../supabase/functions/_shared/interviewPrep';

/**
 * 생성 타입에 이 두 표가 아직 없다(마이그레이션 직후). 다른 기능들과 같은 방식으로
 * 느슨한 클라이언트를 쓰되 `any` 로 열지 않는다.
 */
const db = supabase as unknown as SupabaseClient;

/** 질문 행에서 화면이 쓰는 열만. `lease_token` 은 RPC 가 이미 빼서 준다(직접 select 도 금지). */
const QUESTION_COLUMNS =
  'id,user_id,student_id,day,kind,parent_id,question,intent,source_kind,activity_entity_id,theme_id,source_label,source_excerpt,source_ref,status,lease_until,created_at,updated_at';
const ANSWER_COLUMNS =
  'id,question_id,user_id,student_id,version,answer,evaluation,status,lease_until,created_at,updated_at';

/** 오늘의 상태. **날짜는 서버가 정한다** — 기기 시계로 만들면 자정 전후로 하루가 갈린다. */
export async function fetchInterviewPrepState(): Promise<InterviewPrepState> {
  const { data, error } = await db.rpc('interview_prep_state');
  if (error) throw error;
  return data as InterviewPrepState;
}

export interface InterviewPrepRecord {
  questions: InterviewPrepQuestionRow[];
  answers: InterviewPrepAnswerRow[];
}

/**
 * 한 사람의 면접 기록 전부.
 *
 * `userId` 는 학생 본인 화면, `studentId` 는 교사 화면(생기부 분석 탭)이 쓴다. 둘 다
 * RLS 가 최종 판정하므로 여기 필터는 **범위를 좁히는 용도**다.
 *
 * ⚠ `limit` 을 걸지 않으면 PostgREST 가 1000행에서 **조용히 자른다**. 질문이 그만큼
 * 쌓일 일은 드물지만, 답변은 버전까지 있어 먼저 찬다 — 상한을 명시하고 최신부터 받는다.
 */
export async function fetchInterviewPrepRecord(
  scope: { userId: string } | { studentId: string },
): Promise<InterviewPrepRecord> {
  const column = 'userId' in scope ? 'user_id' : 'student_id';
  const value = 'userId' in scope ? scope.userId : scope.studentId;
  const [questions, answers] = await Promise.all([
    db.from('interview_prep_questions').select(QUESTION_COLUMNS)
      .eq(column, value).order('created_at', { ascending: false }).limit(400),
    db.from('interview_prep_answers').select(ANSWER_COLUMNS)
      .eq(column, value).order('created_at', { ascending: false }).limit(800),
  ]);
  if (questions.error) throw questions.error;
  if (answers.error) throw answers.error;
  return {
    questions: (questions.data ?? []) as InterviewPrepQuestionRow[],
    answers: (answers.data ?? []) as InterviewPrepAnswerRow[],
  };
}

export type InterviewPrepRequestBody =
  | { mode: 'daily' }
  | { mode: 'practice'; activityEntityId?: string; themeId?: string }
  | { mode: 'followup'; questionId: string }
  | { mode: 'evaluate'; questionId: string; answer: string };

interface InterviewPrepReply {
  question?: InterviewPrepQuestionRow;
  answer?: InterviewPrepAnswerRow;
  error?: string;
}

/**
 * 엣지 함수 호출.
 *
 * supabase-js 가 비-2xx 를 `FunctionsHttpError` 로 감싸며 메시지를 "non-2xx status
 * code" 로 뭉갠다 — 연습 횟수 초과·학생 전용 같은 **행동 가능한 문구가 서버 본문에만**
 * 있으므로 반드시 열어 본다. 스트림은 1회만 읽히니 `clone()` 이 필수다.
 */
async function invoke(body: InterviewPrepRequestBody): Promise<InterviewPrepReply> {
  const { data, error } = await db.functions.invoke('interview-prep', { body });
  if (error) {
    let message = '면접 준비를 이어가지 못했어요. 잠시 후 다시 시도해 주세요.';
    if (error.context instanceof Response) {
      try {
        const payload = await error.context.clone().json();
        if (typeof payload?.error === 'string') message = payload.error;
      } catch { /* 본문이 JSON 이 아니면 실행 가능한 기본 문구를 유지한다. */ }
    }
    throw new Error(message);
  }
  if (data?.error && !data.question && !data.answer) throw new Error(String(data.error));
  return data as InterviewPrepReply;
}

export async function requestInterviewQuestion(
  body: Exclude<InterviewPrepRequestBody, { mode: 'evaluate' }>,
): Promise<InterviewPrepQuestionRow> {
  const reply = await invoke(body);
  if (!reply.question) throw new Error(reply.error ?? '질문을 준비하지 못했어요.');
  // 서버가 행을 failed 로 닫고 문구를 함께 준 경우 — 행은 최신이지만 실패는 실패다.
  if (reply.question.status === 'failed') throw new Error(reply.error ?? '질문을 준비하지 못했어요.');
  return reply.question;
}

export async function requestInterviewEvaluation(
  questionId: string, answer: string,
): Promise<InterviewPrepAnswerRow> {
  const reply = await invoke({ mode: 'evaluate', questionId, answer });
  if (!reply.answer) throw new Error(reply.error ?? '평가를 받지 못했어요.');
  if (reply.answer.status === 'failed') throw new Error(reply.error ?? '평가를 받지 못했어요.');
  return reply.answer;
}
