/**
 * 탐구 설계 — 서버 작업 큐 접수·조회 (2026-09-18).
 *
 * 화면을 켜 둔 채 기다릴 필요가 없게 한다. 「설계하기」는 이제 LLM 을 **동기로**
 * 부르지 않고 `academy_generation_jobs` 에 의뢰를 넣는다. 처리는 워커
 * (`academy-generation-worker`)가 design → graph → save 세 단계로 나눠 하고,
 * 완료되면 `student_inquiry_designs` 에 draft 가 생긴다 — 종전 자동 초안과
 * **같은 자리·같은 모양**이라 화면은 기존 `resumeDesign` 으로 그것을 연다.
 *
 * ── 아카데미 연구대와 무엇을 공유하는가 ─────────────────────────────────────
 * 표·워커·claim/checkpoint RPC·cron 을 전부 공유하고 **접수 RPC 만 다르다**.
 * 아카데미의 `academy_generation_start` 는 학생 범위를 호출자에게서 강제로
 * 유도하므로(학생=이메일 prefix, 교직원=고정 체험 학생) 교사가 임의 학생을 고르는
 * 이 화면을 표현할 수 없다. `inquiry_generation_start` 는 학생을 인자로 받고
 * 이 기능이 이미 쓰는 `inquiry_design_can_access_student()` 로 판정한다.
 *
 * ⚠️ 조회에 **`surface` 를 반드시 건다**. 빼면 아카데미 의뢰가 이 화면의 진행
 * 상황으로 섞여 들어온다(오류가 아니라 "낯선 설계도가 뜬다"로 나타난다).
 */
import { supabase } from '@/integrations/supabase/client';
import type {
  InquiryAiProvider,
  InquiryGenerationInput,
  InquiryGenerationJob,
  InquiryQuota,
} from '../types';

// 스키마 없는 클라이언트로 캐스팅한다 — `academy_generation_jobs` 와 새 RPC 들은
// 생성된 타입(`integrations/supabase/types.ts`)에 아직 없다. academy 쪽
// `game/generationService.ts` 와 같은 방식이다.
const db = supabase as unknown as import('@supabase/supabase-js').SupabaseClient;

const JOBS_TABLE = 'academy_generation_jobs';
export const INQUIRY_SURFACE = 'inquiry-design';

/**
 * 하루 의뢰 한도. **서버(`inquiry_generation_start`)의 20 과 짝**이고 둘은 함께
 * 움직여야 한다 — 클라만 올리면 서버가 거부하고, 서버만 올리면 배지가 거짓말을 한다.
 */
export const INQUIRY_REQUEST_DAILY_LIMIT = 20;

/** 아직 끝나지 않은 의뢰인가. 화면은 이걸로 버튼을 잠그고 폴링을 켠다. */
export function inquiryGenerationActive(job: InquiryGenerationJob): boolean {
  return job.status === 'queued' || job.status === 'running' || job.status === 'retry';
}

/**
 * 이 의뢰 카드를 지금 보여 줄 것인가 (2026-09-23).
 *
 * **완료 카드는 초안이 «아직 있을 때만» 뜬다.** `draft_id` 는 `student_inquiry_designs`
 * 를 가리키는 **text 컬럼이고 FK 가 없다**(실측: 이 표의 FK 는 `owner_id` 하나뿐).
 * 그래서 초안이 사라져도 의뢰 행은 그대로 남아 «설계가 완성됐어요»를 계속 말한다.
 * 초안이 사라지는 길이 둘이고 **둘 다 정상 동작**이다:
 *   ① 이력에서 설계를 삭제 — 사용자가 지운 것이 화면에 남는다.
 *   ② 저장으로 승격 — `saveInquiryDesign` 이 초안을 지우고 `draftDesignId` 를 null 로
 *      되돌리는데, 그 null 이 곧 이 카드를 감추던 `openedDraftId` 조건을 **풀어 버린다**
 *      (저장 직후 유령 카드가 되살아난다).
 * 존재를 화면이 **직접 확인**하게 두면 두 길이 한 번에 막히고, 이미 생긴 유령 행
 * (실측 2026-09-23: 완료 3건 중 1건)도 마이그레이션 없이 사라진다.
 *
 * 진행 중·실패는 초안과 무관하므로 그대로 보여 준다 — 실패 카드에는 [다시 시도]가 있다.
 */
export function inquiryGenerationVisible(
  job: InquiryGenerationJob,
  input: { openedDraftId: string | null; draftIds: ReadonlySet<string> },
): boolean {
  if (inquiryGenerationActive(job)) return true;
  if (job.status === 'failed') return true;
  if (job.status !== 'completed') return false;
  if (!job.draft_id) return false;
  // 이미 화면에 펼쳐 둔 초안에는 「열기」를 권하지 않는다.
  if (job.draft_id === input.openedDraftId) return false;
  return input.draftIds.has(job.draft_id);
}

/**
 * 의뢰 접수. `requestKey` 는 **호출부가 보관**하는 uuid 다 — 응답을 잃어버린 뒤
 * 다시 눌러도 같은 키면 서버가 같은 행을 돌려주므로 의뢰가 둘로 갈라지지 않는다.
 */
export async function startInquiryGeneration(
  input: InquiryGenerationInput,
  provider: InquiryAiProvider,
  requestKey: string,
): Promise<InquiryGenerationJob> {
  const { data, error } = await db.rpc('inquiry_generation_start', {
    p_request: requestKey,
    p_student_id: input.studentId,
    p_input: input,
    p_provider: provider,
  });
  if (error) throw new Error(error.message || '설계 의뢰를 접수하지 못했습니다.');
  return data as InquiryGenerationJob;
}

/** 이 사용자가 **이 학생에 대해** 낸 최근 의뢰들(최신 순). */
export async function readInquiryGenerations(
  ownerId: string,
  studentId: string,
): Promise<InquiryGenerationJob[]> {
  const { data, error } = await db
    .from(JOBS_TABLE)
    .select('*')
    .eq('owner_id', ownerId)
    .eq('surface', INQUIRY_SURFACE)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw new Error('설계 의뢰 상태를 불러오지 못했습니다.');
  return (data ?? []) as InquiryGenerationJob[];
}

/** 멈춘 단계부터 다시. 서버가 `status='failed' ∧ restarts<3` 을 재검증한다. */
export async function retryInquiryGeneration(id: string): Promise<void> {
  const { error } = await db.rpc('academy_generation_retry', { p_id: id });
  if (error) throw new Error(error.message || '이 단계를 다시 시작하지 못했습니다.');
}

/**
 * 오늘 이 학생의 의뢰 수.
 *
 * 종전 배지는 `count_inquiry_analysis_calls`(= LLM 캐시 표의 오늘 행 수)였는데,
 * 설계가 큐로 옮겨가면 그 표에는 행이 생기지 않는다 — 장부도 함께 옮겨야
 * 배지가 **조용히 0 에 멈추지** 않는다.
 */
export async function fetchInquiryRequestQuota(studentId: string): Promise<InquiryQuota> {
  const { data, error } = await db.rpc('count_inquiry_generation_requests', {
    p_student_id: studentId,
  });
  if (error) throw error;
  const used = typeof data === 'number' ? data : 0;
  return {
    used,
    limit: INQUIRY_REQUEST_DAILY_LIMIT,
    remaining: Math.max(INQUIRY_REQUEST_DAILY_LIMIT - used, 0),
  };
}

/** 단계 → 사람이 읽는 이름. 워커는 design → graph → save 순으로 지나간다. */
export const INQUIRY_STAGE_LABEL: Record<InquiryGenerationJob['stage'], string> = {
  design: '탐구 내용 작성',
  graph: '지식 지도 연결',
  save: '초안 보관',
};

export const INQUIRY_STAGE_ORDER: InquiryGenerationJob['stage'][] = ['design', 'graph', 'save'];
