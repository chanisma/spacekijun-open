import { supabase } from '@/integrations/supabase/client';
import type { InquiryAiProvider, InquiryGenerationInput, InquiryGenerationJob } from '@/features/inquiry-design/types';
const db = supabase as unknown as import('@supabase/supabase-js').SupabaseClient;
// 표(`academy_generation_jobs`)·워커·claim/checkpoint RPC 는 탐구 설계와 **공유**한다.
// 가르는 것은 `surface` 하나뿐이라 타입도 한 벌이어야 한다 — 두 벌로 두면 컬럼이
// 늘 때 한쪽만 고쳐지고 그 어긋남은 런타임에야 드러난다. 기존 이름은 별칭으로 유지.
export type GenerationInput = InquiryGenerationInput;
export type GenerationJob = InquiryGenerationJob;
export async function startGeneration(input: GenerationInput, provider: InquiryAiProvider, requestKey: string): Promise<GenerationJob> {
  const { data, error } = await db.rpc('academy_generation_start', { p_request: requestKey, p_input: input, p_provider: provider });
  if (error) throw new Error(error.message || '설계 의뢰를 접수하지 못했어요.');
  return data;
}
export async function readGenerations(owner: string): Promise<GenerationJob[]> {
  // ⚠️ `surface` 를 반드시 건다 (2026-09-18). 탐구 설계가 같은 표를 쓰기 시작해,
  // 빼면 교사가 낸 탐구 설계 의뢰가 연구대의 «진행 중»으로 섞여 들어온다 —
  // 오류가 아니라 "카시안이 낯선 설계도를 준비하고 있다"로 나타난다.
  const { data, error } = await db.from('academy_generation_jobs').select('*').eq('owner_id',owner).eq('surface','academy').order('created_at',{ascending:false}).limit(5);
  if (error) throw new Error('설계 의뢰 상태를 불러오지 못했어요.');
  return data ?? [];
}
export async function retryGeneration(id: string) {
  const { error } = await db.rpc('academy_generation_retry', { p_id: id });
  if (error) throw new Error(error.message || '이 단계를 다시 시작하지 못했어요.');
}
export const generationActive = (job: GenerationJob) => ['queued','running','retry'].includes(job.status);
