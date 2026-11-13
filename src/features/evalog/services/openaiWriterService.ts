/**
 * OpenAI Writer Service for Evalog
 * Supabase Edge Function 프록시를 통한 문장 생성 서비스
 */

import { Student } from '../types';
import { supabase } from '@/integrations/supabase/client';
import { aiChat, reasoningEffortFor } from '@/services/aiChat';

/** 게이트웨이(약 150초)보다 낮게 — 504 대신 우리 메시지가 나가게 한다. */
const WRITER_TIMEOUT_MS = 120000;

export interface CurrentEvaluation {
  homeroom?: {
    autonomy?: string;
    career?: string;
    behavior?: string;
  };
  subject?: {
    content?: string;
  };
  club?: {
    content?: string;
  };
}

/**
 * AI 프롬프트에 실릴 학생 맥락.
 * **이름·학번·재적상태는 담지 않는다**(2026-07-27) — 프롬프트에 쓰이지 않는데 객체에만
 * 남아 있으면 누군가 무심코 끼워 넣기 쉽다. 생성에 필요한 것은 기록 본문뿐이다.
 */
export interface StudentContext {
  // 학생부 데이터
  attendance?: string;
  academicRecords?: string;
  creativeActivities?: string;
  behaviorCharacteristics?: string;
  volunteerActivities?: string;
  readingActivities?: string;
  // 현재 작성 중인 평가
  currentEvaluation?: CurrentEvaluation;
}

export interface WriterRequest {
  prompt: string;
  useStudentData: boolean;
  studentContext?: StudentContext;
}

export interface WriterResponse {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * Student 객체에서 컨텍스트 추출
 */
export function extractStudentContext(student: Student): StudentContext {
  // 출결 정보 추출
  const attendanceInfo = student.section2_attendance
    ?.map(a => `${a.grade}학년: 수업일수 ${a.schoolDays}일, 결석 ${a.absenceDays || 0}일`)
    .join(', ') || '';

  // 창의적 체험활동 추출
  const creativeInfo = student.section5_creative_activities
    ?.map(c => `[${c.activity_type}] ${c.content?.slice(0, 100)}...`)
    .join('\n') || '';

  // 행동특성 추출
  const behaviorInfo = student.section8_behavior_characteristics
    ?.map(b => `${b.grade}학년: ${b.content?.slice(0, 150)}...`)
    .join('\n') || '';

  // 봉사활동 추출
  const volunteerInfo = student.volunteer_activities
    ?.map(v => `${v.content} (${v.hours}시간)`)
    .join(', ') || '';

  // 교과 세특 추출
  const academicInfo = student.section6_academic_development
    ?.slice(0, 3)
    .map(a => `[${a.subject}] ${a.content?.slice(0, 100)}...`)
    .join('\n') || '';

  // 독서활동 추출
  const readingInfo = student.reading
    ?.map(r => `[${r.grade}학년${r.semester}학기/${r.related}] ${r.content}`)
    .join('\n') || '';

  return {
    attendance: attendanceInfo,
    academicRecords: academicInfo,
    creativeActivities: creativeInfo,
    behaviorCharacteristics: behaviorInfo,
    volunteerActivities: volunteerInfo,
    readingActivities: readingInfo,
  };
}

/**
 * 현재 작성 중인 평가 내용 포맷팅
 */
function formatCurrentEvaluation(evaluation: CurrentEvaluation): string {
  const parts: string[] = [];

  if (evaluation.homeroom) {
    const homeroomParts: string[] = [];
    if (evaluation.homeroom.autonomy?.trim()) {
      homeroomParts.push(`[자율활동] ${evaluation.homeroom.autonomy}`);
    }
    if (evaluation.homeroom.career?.trim()) {
      homeroomParts.push(`[진로활동] ${evaluation.homeroom.career}`);
    }
    if (evaluation.homeroom.behavior?.trim()) {
      homeroomParts.push(`[행동특성] ${evaluation.homeroom.behavior}`);
    }
    if (homeroomParts.length > 0) {
      parts.push(`담임 평가:\n${homeroomParts.join('\n')}`);
    }
  }

  if (evaluation.subject?.content?.trim()) {
    parts.push(`교과 세특 (작성 중):\n${evaluation.subject.content}`);
  }

  if (evaluation.club?.content?.trim()) {
    parts.push(`동아리 활동 (작성 중):\n${evaluation.club.content}`);
  }

  if (parts.length === 0) return '';

  return `현재 작성 중인 평가 내용:\n${parts.join('\n\n')}`;
}

/**
 * 시스템 프롬프트 생성
 */
function buildSystemPrompt(useStudentData: boolean, studentContext?: StudentContext): string {
  let systemPrompt = `당신은 한국 고등학교 학생부 작성을 돕는 전문 AI 어시스턴트.
교사가 요청하는 내용에 맞는 답변을 작성.`;

  if (useStudentData && studentContext) {
    systemPrompt += `

현재 작성 대상 학생 정보:

${studentContext.attendance ? `출결 현황:\n${studentContext.attendance}` : ''}

${studentContext.academicRecords ? `교과 세부능력특기사항 (일부):\n${studentContext.academicRecords}` : ''}

${studentContext.creativeActivities ? `창의적 체험활동:\n${studentContext.creativeActivities}` : ''}

${studentContext.behaviorCharacteristics ? `행동특성 및 종합의견:\n${studentContext.behaviorCharacteristics}` : ''}

${studentContext.readingActivities ? `독서활동:\n${studentContext.readingActivities}` : ''};`
  }

  systemPrompt += `

${studentContext?.currentEvaluation ? `작성 중인 내용:\n${formatCurrentEvaluation(studentContext.currentEvaluation)}` : ''}

주어진 정보를 참고하여 사용자의 요청에 맞는 답변 작성`;

  return systemPrompt;
}

/**
 * OpenAI API를 통한 문장 생성 (Edge Function 프록시)
 */
export async function generateText(request: WriterRequest): Promise<WriterResponse> {
  try {
    const systemPrompt = buildSystemPrompt(request.useStudentData, request.studentContext);

    // 공급자는 aiChat 기본값(Solar). OpenAI로 돌리려면 provider: 'openai' 추가.
    const content = await aiChat({
      systemPrompt,
      userPrompt: request.prompt,
      temperature: 1.0,
      // 생성 과제 — 추론 강도는 `aiChat` 의 표가 정한다(지금 generation 칸은 비어 있어
      // 엣지 기본값 'low' 가 그대로 적용된다). ⚠️ `maxCompletionTokens` 는 **solar 경로에서
      // 조용히 무시된다**(상한이 없어 피해는 없지만 이 값으로 판단하지 말 것).
      reasoningEffort: reasoningEffortFor('generation'),
      timeoutMs: WRITER_TIMEOUT_MS,
      maxCompletionTokens: 10000,
      errorPrefix: '문장 생성 실패',
    });

    return {
      success: true,
      content: content.trim(),
    };
  } catch (error: any) {
    console.error('OpenAI API Error:', error);
    return {
      success: false,
      error: error.message || '문장 생성 중 오류가 발생했습니다.',
    };
  }
}

/**
 * API 키 유효성 검사 (서버 측 검증)
 */
export async function validateApiKey(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('openai-proxy', {
      body: { action: 'validateApiKey' },
    });

    if (error || data?.error) return false;
    return true;
  } catch {
    return false;
  }
}
