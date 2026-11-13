import { supabase } from '@/integrations/supabase/client';
import { aiLogTag } from '@/services/aiLogTag';
import type {
  ComprehensiveGenerateRequest,
  ComprehensiveGenerateResponse,
  ComprehensivePrepareResponse,
  InquiryAiProvider,
} from '../types';

const fn = supabase as unknown as {
  functions: {
    invoke: (
      name: string,
      args: { body: Record<string, unknown> }
    ) => Promise<{ data: any; error: any }>;
  };
};

interface PrepareArgs {
  academyExperience?: boolean;
  studentId: string;
  kgVersionId?: string;
  currentGrade?: number;
  // Optional teacher-supplied guidance forwarded to the analyzer LLM.
  userGuidance?: string;
  // 보완 방향 분석 + 그래프 정리 검증을 돌릴 공급자. 생략하면 서버가 'openai'.
  // 예전엔 이 필드가 없어서 준비 단계가 항상 OpenAI로만 갔다.
  aiProvider?: InquiryAiProvider;
}

export async function prepareComprehensiveAnalysis(
  args: PrepareArgs
): Promise<ComprehensivePrepareResponse> {
  const { data, error } = await fn.functions.invoke('inquiry-comprehensive', {
    body: { mode: 'prepare', ...args, aiLog: aiLogTag('AI 종합 분석 준비') },
  });
  if (error) {
    // supabase-js wraps non-2xx as FunctionsHttpError; the parsed JSON body
    // sits on `error.context.body` for some versions, but reliably surfaces
    // through the second `data` arg only on 2xx. For quota (429) the readable
    // message is what the user needs to see.
    const quotaTail =
      data?.quota && typeof data.quota.used === 'number'
        ? ` (${data.quota.used}/${data.quota.limit})`
        : '';
    // supabase-js 는 비-2xx 를 `FunctionsHttpError` 로 감싸며 메시지를
    // "Edge Function returned a non-2xx status code" 로 뭉갠다 — 504(벽시간 초과)와
    // 500(서버 오류)이 화면에서 구분되지 않아 다음 행동이 갈린다.
    // 상태 코드는 `error.context`(원본 Response)에만 있다.
    const status = (error as { context?: { status?: number } })?.context?.status;
    // 500 은 서버가 **본문에 이유를 담아** 돌려준 것이다. supabase-js 가 그 본문을
    // 열지 않고 "non-2xx" 로 뭉개므로 여기서 직접 읽는다 — 이 은폐가 진단을 세 번 막았다.
    // 스트림은 한 번만 읽히므로 `clone()` 이 필수다.
    let serverMessage = '';
    const response = (error as { context?: Response })?.context;
    if (response && typeof response.clone === 'function') {
      try {
        const body = await response.clone().json();
        serverMessage = String(body?.message ?? body?.error ?? '');
      } catch {
        /* 본문이 JSON 이 아니면(504 처럼 게이트웨이가 만든 응답) 아래 상태 코드 안내로 간다 */
      }
    }
    const timedOut = status === 504 || status === 408;
    const msg = serverMessage
      || (timedOut
        ? '분석이 서버 제한 시간(약 150초) 안에 끝나지 않았습니다. 잠시 뒤 다시 시도하거나 분석 AI를 바꿔 보세요.'
        : data?.message || data?.error || error.message || 'prepare failed');
    throw new Error(`${msg}${status ? ` (HTTP ${status})` : ''}${quotaTail}`);
  }
  if (data?.error) {
    const quotaTail =
      data.quota && typeof data.quota.used === 'number'
        ? ` (${data.quota.used}/${data.quota.limit})`
        : '';
    throw new Error(`${String(data.message || data.error)}${quotaTail}`);
  }
  return data as ComprehensivePrepareResponse;
}

export async function generateComprehensiveAnalysis(
  args: ComprehensiveGenerateRequest
): Promise<ComprehensiveGenerateResponse> {
  const { data, error } = await fn.functions.invoke('inquiry-comprehensive', {
    body: { mode: 'generate', ...args, aiLog: aiLogTag('AI 종합 분석 생성') },
  });
  if (error) {
    throw new Error(error.message || 'generate failed');
  }
  if (data?.error) {
    throw new Error(String(data.error));
  }
  return data as ComprehensiveGenerateResponse;
}

/**
 * 종합 분석 이력 삭제 (2026-09-12 사용자 요청).
 *
 * RPC 가 아니라 직접 DELETE 인 이유: `inq_rec_delete_accessible` 정책이 이미
 * `inquiry_design_can_access_student()` 로 판정하고 있어 서버가 이미 정본이다.
 * 하위 행이 없는 단일 테이블이라 정리할 것도 없다(설계 쪽은 sources/entities/relations 가
 * 딸려 있어 `delete_inquiry_design` RPC 를 쓴다 — 그쪽과 모양이 다른 것은 그 때문이다).
 */
export async function deleteComprehensiveAnalysis(recommendationId: string): Promise<void> {
  const { error } = await (supabase as unknown as {
    from: (t: string) => { delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> } };
  })
    .from('student_inquiry_recommendations')
    .delete()
    .eq('id', recommendationId);
  if (error) throw error instanceof Error ? error : new Error(String((error as { message?: string })?.message ?? error));
}

export type { InquiryAiProvider };
