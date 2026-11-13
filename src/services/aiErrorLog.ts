import { supabase } from '@/integrations/supabase/client';

/**
 * AI 호출 실패를 DB 에 남긴다 (2026-09-12 사용자 제안).
 *
 * **왜 필요했나**: 2026-09-12 에 AI 종합 분석이 두 가지 이유로 죽었는데 둘 다 화면에서
 * 원인을 볼 수 없었다 — ①편성 조회의 uuid 캐스트 오류가 500 으로만 보였고
 * ②Solar 가 예산 소진으로 빈 본문을 돌려준 것이 `?? '{}'` 에 삼켜져 **성공처럼 끝났다**.
 * 엣지 함수 콘솔 로그는 24시간만 남고 검색이 어렵다.
 *
 * **담지 않는 것**: 프롬프트·응답 본문. 학생 기록이 통째로 들어가 개인정보가 로그로 샌다.
 * 담는 것은 "언제·어느 기능·어느 모델이·무슨 메시지로" 뿐이다.
 */
export interface AiErrorLogInput {
  /** 어느 기능인가 — `inquiry-design`·`creative-activities` 처럼 기능 폴더 이름을 쓴다. */
  feature: string;
  /** 그 안의 어느 동작인가 — `analysis`·`comprehensive.prepare` 등. */
  action?: string | null;
  provider?: string | null;
  model?: string | null;
  /** 대상 학생의 **학적 코드**(이름이 아니다). */
  studentId?: string | null;
  error: unknown;
  /** 진단 부수 정보. **프롬프트를 넣지 말 것.** */
  detail?: Record<string, unknown>;
}

/** 메시지 상한. 스택을 통째로 담는 자리가 아니다. */
const MESSAGE_MAX = 1000;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * **절대 던지지 않는다.** 로그를 남기려다 실패해서 원래 오류 처리가 깨지면,
 * 진단을 도우려던 코드가 진단을 더 어렵게 만든다. 실패는 콘솔에만 남긴다.
 */
export async function logAiError(input: AiErrorLogInput): Promise<void> {
  try {
    const message = messageOf(input.error).slice(0, MESSAGE_MAX);
    await (supabase as unknown as {
      from: (t: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: unknown }> };
    })
      .from('ai_error_log')
      .insert({
        feature: input.feature,
        action: input.action ?? null,
        provider: input.provider ?? null,
        model: input.model ?? null,
        student_id: input.studentId ?? null,
        message,
        detail: input.detail ?? {},
      });
  } catch (loggingError) {
    // eslint-disable-next-line no-console
    console.warn('[aiErrorLog] 기록 실패(무시):', loggingError);
  }
}
