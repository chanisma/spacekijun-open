// ========================================
// 입력 받기(collect.input) 서버 호출 — 전부 RPC
// 쓰기는 서버 함수가 권한·잠금·값을 다시 검증한다. 여기서 표를 직접 읽지 않는다
// (가시성 판정이 서버 get_collect_board 한 곳에 있어야 한다).
// ========================================

import { supabase } from '@/integrations/supabase/client';
import type { AudienceAxis, AudienceResolution, AudienceRule } from '@/lib/audienceRule';
import type { CollectBoard, CollectValues, MyCollectRequest } from '@/lib/collectInput';

// RPC 오류는 서버가 한국어 메시지로 던진다(권한·잠금·값 검증) — 그대로 화면에 올린다
function fail(error: { message?: string } | null): never {
  throw new Error(error?.message ?? '요청을 처리하지 못했습니다.');
}

export async function resolveAudience(rule: AudienceRule, axis: AudienceAxis): Promise<AudienceResolution> {
  const { data, error } = await supabase.rpc('resolve_audience', {
    p_rule: rule as never,
    p_axis: axis,
  });
  if (error) fail(error);
  return data as unknown as AudienceResolution;
}

/**
 * 할 일 맥락이 있는 미리보기(2026-10-01) — «이 할 일의 담당자» 조건을 그 할 일의 지금 담당자로 풀어 계산한다.
 * 보내기·명단 다시 계산도 서버에서 같은 함수(expand_task_audience)를 거치므로 미리보기와 결과가 같다.
 */
export async function resolveTaskAudience(rule: AudienceRule, taskId: string, axis: AudienceAxis): Promise<AudienceResolution> {
  const { data, error } = await supabase.rpc('resolve_task_audience', {
    p_rule: rule as never,
    p_task_id: taskId,
    p_axis: axis,
  });
  if (error) fail(error);
  return data as unknown as AudienceResolution;
}

export async function updateCollectConfig(actionId: string, config: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('update_collect_config', {
    p_action_id: actionId,
    p_config: config as never,
  });
  if (error) fail(error);
  return data as unknown as { ok: boolean; warning: string | null };
}

export interface StartCollectResult {
  targets: number;
  people: number;
  unlinked: number;
  no_units: number;
  notified: number;
  academic_year: number;
  semester: number;
}

export async function startCollectRequest(actionId: string): Promise<StartCollectResult> {
  const { data, error } = await supabase.rpc('start_collect_request', { p_action_id: actionId });
  if (error) fail(error);
  return data as unknown as StartCollectResult;
}

export interface CollectSyncDiff {
  added: { name: string; unit_label: string; resource_id: string | null; reasons: string[] }[];
  removed: { id: string; name: string; unit_label: string; resource_id: string | null }[];
  applied: boolean;
  no_units: number;
}

export async function syncCollectTargets(actionId: string, apply: boolean): Promise<CollectSyncDiff> {
  const { data, error } = await supabase.rpc('sync_collect_targets', { p_action_id: actionId, p_apply: apply });
  if (error) fail(error);
  return data as unknown as CollectSyncDiff;
}

export async function submitCollectResponse(input: {
  actionId: string;
  unitKey: string;
  dimensionKey: string;
  values: CollectValues;
}): Promise<{ values: CollectValues; complete: boolean }> {
  const { data, error } = await supabase.rpc('submit_collect_response', {
    p_action_id: input.actionId,
    p_unit_key: input.unitKey,
    p_dimension_key: input.dimensionKey,
    p_values: input.values as never,
  });
  if (error) fail(error);
  return data as unknown as { values: CollectValues; complete: boolean };
}

export async function setCollectRequestStatus(actionId: string, status: 'open' | 'closed') {
  const { error } = await supabase.rpc('set_collect_request_status', { p_action_id: actionId, p_status: status });
  if (error) fail(error);
}

export async function remindCollectPending(actionId: string): Promise<number> {
  const { data, error } = await supabase.rpc('remind_collect_pending', { p_action_id: actionId });
  if (error) fail(error);
  return (data as number) ?? 0;
}

export async function getCollectBoard(actionId: string): Promise<CollectBoard> {
  const { data, error } = await supabase.rpc('get_collect_board', { p_action_id: actionId });
  if (error) fail(error);
  return data as unknown as CollectBoard;
}

export async function listMyCollectRequests(): Promise<MyCollectRequest[]> {
  const { data, error } = await supabase.rpc('my_collect_requests');
  if (error) fail(error);
  return (data as unknown as MyCollectRequest[]) ?? [];
}

/** 보낸 요청이 있는 작업인가 — 있으면 지우지 않고 보관한다(서버 트리거가 삭제를 막는다) */
export async function hasCollectRequest(actionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('collect_request')
    .select('action_id')
    .eq('action_id', actionId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/**
 * 여러 작업의 요청 상태 — 업무 목록의 «작업 줄»(2026-10-06). 왕복 2번(요청 · 명단)으로 끝낸다.
 * RLS 가 책임자·대상에게만 행을 주므로, 못 읽은 작업은 결과에 없다(«요청 전»으로 읽지 말 것 — 화면이 가른다).
 * 명단은 1,000행 상한에 잘리지 않게 끝까지 넘겨 받는다(잘리면 사람 수가 조용히 줄어든다).
 */
export async function listActionRequestStates(actionIds: string[]): Promise<{
  requests: Array<{ action_id: string; status: 'open' | 'closed' }>;
  targets: Array<{ action_id: string; resource_id: string | null; holder_name: string; removed_at: string | null }>;
}> {
  if (actionIds.length === 0) return { requests: [], targets: [] };
  const { data: requests, error } = await supabase
    .from('collect_request')
    .select('action_id, status')
    .in('action_id', actionIds);
  if (error) throw error;
  const sent = (requests ?? []).map((row) => row.action_id as string);
  const targets: Array<{ action_id: string; resource_id: string | null; holder_name: string; removed_at: string | null }> = [];
  const PAGE = 1000;
  for (let from = 0; sent.length > 0; from += PAGE) {
    const { data, error: targetError } = await supabase
      .from('collect_target')
      .select('id, action_id, resource_id, holder_name, removed_at')
      .in('action_id', sent)
      .order('id')
      .range(from, from + PAGE - 1);
    if (targetError) throw targetError;
    targets.push(...((data ?? []) as typeof targets));
    if (!data || data.length < PAGE) break;
  }
  return { requests: (requests ?? []) as Array<{ action_id: string; status: 'open' | 'closed' }>, targets };
}
