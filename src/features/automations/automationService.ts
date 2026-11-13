// ========================================
// 자동화 업무 — 데이터 계층 (2026-10-23)
//
// 표: automation(RLS = 주인·관리자) · automation_run(읽기만, 쓰기 = RPC) · automation_grant · automation_config.
// 승인·미리보기·시험 발송·회차 취소는 RPC 로만 — 승인 칸은 트리거가 직접 쓰기를 거부한다.
// 설계 = docs/plans/2026-10-23-automation-scheduler.md
// ========================================
import { supabase } from '@/integrations/supabase/client';
import type { CoolmsgConfig, RunStatus } from '@/lib/automationConfig';
import type { ScheduleSpec } from '@/lib/automationCron';

export interface Automation {
  id: string;
  owner_id: string;
  kind: 'coolmsg.send';
  title: string;
  schedule_cron: string;
  schedule_spec: ScheduleSpec | null;
  skip_closed_days: boolean;
  starts_on: string | null;
  ends_on: string | null;
  grace_minutes: number;
  config: CoolmsgConfig;
  enabled: boolean;
  paused: boolean;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationRun {
  id: string;
  automation_id: string | null;
  automation_title: string;
  owner_id: string;
  is_test: boolean;
  scheduled_for: string;
  expires_at: string;
  status: RunStatus;
  skip_reason: string | null;
  title: string | null;
  body: string | null;
  recipients: Array<{ resource_id: string; name: string }>;
  claimed_at: string | null;
  finished_at: string | null;
  message_key: number | null;
  arrival: string | null;
  error: string | null;
  created_at: string;
}

export interface AutomationPreview {
  date: string;
  closed_reason: string | null;
  per_recipient: boolean;
  recipients: Array<{ resource_id: string; name: string }>;
  recipient_count: number;
  over_limit: boolean;
  max_recipients_per_run: number;
  messages: Array<{ to: { resource_id: string; name: string } | null; title: string; body: string }>;
  sender: string;
}

export interface AutomationConfigRow {
  paused_all: boolean;
  max_recipients_per_run: number;
  max_runs_per_day: number;
  updated_at: string;
}

export type AutomationDraft = Pick<
  Automation,
  'title' | 'schedule_cron' | 'schedule_spec' | 'skip_closed_days' | 'starts_on' | 'ends_on' | 'grace_minutes' | 'config'
> & { kind?: Automation['kind'] };

export const AUTOMATIONS_KEY = ['automations'] as const;
export const automationRunsKey = (id: string | null) => ['automation-runs', id ?? 'all'] as const;
export const AUTOMATION_CONFIG_KEY = ['automation-config'] as const;
export const AUTOMATION_GRANT_KEY = ['automation-my-grant'] as const;

// 생성 타입에 아직 없는 표 — 적용 후 types.ts 를 다시 만들면 캐스팅을 걷어 낸다
const table = (name: string) => supabase.from(name as never);
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);

export async function listAutomations(): Promise<Automation[]> {
  const { data, error } = await table('automation').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Automation[];
}

export async function createAutomation(draft: AutomationDraft): Promise<Automation> {
  const { data, error } = await table('automation')
    .insert({ ...draft, kind: draft.kind ?? 'coolmsg.send' } as never)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Automation;
}

/** 반복·받는 사람·본문을 고치면 서버 트리거가 승인을 풀고 끈다 — 다시 승인해야 나간다 */
export async function updateAutomation(id: string, draft: AutomationDraft): Promise<Automation> {
  const { data, error } = await table('automation').update(draft as never).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return data as unknown as Automation;
}

export async function setAutomationPaused(id: string, paused: boolean): Promise<void> {
  const { data, error } = await table('automation').update({ paused } as never).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  // RLS 가 막으면 오류가 아니라 0행이다
  if ((data ?? []).length !== 1) throw new Error('바꾸지 못했습니다(권한 확인).');
}

export async function deleteAutomation(id: string): Promise<void> {
  const { data, error } = await table('automation').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== 1) throw new Error('지우지 못했습니다(권한 확인).');
}

export async function approveAutomation(id: string): Promise<void> {
  const { error } = await rpc('automation_approve', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function previewAutomation(id: string, date?: string): Promise<AutomationPreview> {
  const { data, error } = await rpc('automation_preview', { p_id: id, ...(date ? { p_date: date } : {}) });
  if (error) throw new Error(error.message);
  return data as AutomationPreview;
}

export async function testSendAutomation(id: string): Promise<string> {
  const { data, error } = await rpc('automation_test_send', { p_id: id });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function cancelAutomationRun(runId: string): Promise<void> {
  const { error } = await rpc('automation_cancel_run', { p_run_id: runId });
  if (error) throw new Error(error.message);
}

export async function listAutomationRuns(automationId: string | null, limit = 100): Promise<AutomationRun[]> {
  let q = table('automation_run').select('*').order('scheduled_for', { ascending: false }).limit(limit);
  if (automationId) q = q.eq('automation_id', automationId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AutomationRun[];
}

/** 자동화마다 마지막 회차 하나 — 목록 카드의 «마지막 결과» */
export async function listLatestRuns(ids: string[]): Promise<Map<string, AutomationRun>> {
  const out = new Map<string, AutomationRun>();
  if (ids.length === 0) return out;
  const { data, error } = await table('automation_run')
    .select('*')
    .in('automation_id', ids)
    .eq('is_test', false)
    .order('scheduled_for', { ascending: false })
    .limit(ids.length * 5);
  if (error) throw new Error(error.message);
  for (const run of (data ?? []) as unknown as AutomationRun[]) {
    if (run.automation_id && !out.has(run.automation_id)) out.set(run.automation_id, run);
  }
  return out;
}

export async function fetchAutomationConfig(): Promise<AutomationConfigRow | null> {
  const { data, error } = await table('automation_config').select('paused_all, max_recipients_per_run, max_runs_per_day, updated_at').maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as unknown as AutomationConfigRow | null;
}

/** 내가 «쿨메신저 쪽지» 자동화를 만들 수 있는가 — 허용 표에서 내 행(RLS 가 내 것·관리자만 보인다) */
export async function fetchMyGrant(myResourceIds: string[]): Promise<boolean> {
  if (myResourceIds.length === 0) return false;
  const { data, error } = await table('automation_grant')
    .select('resource_id')
    .in('resource_id', myResourceIds)
    .eq('kind', 'coolmsg.send')
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
