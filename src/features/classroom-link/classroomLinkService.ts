/**
 * 교실 기기 QR 세팅 — 프리셋 저장(표 `classroom_preset`, RLS = 본인만)과
 * 휴대폰 승인(Edge Function `classroom-link`). 상세 docs/features/classroom-link.md
 */
import { supabase } from '@/integrations/supabase/client';
import type { ClassroomPreset, PresetDraft } from './presetItems';

export const PRESETS_KEY = ['classroom-presets'];

const presetTable = () => supabase.from('classroom_preset' as never);
const COLUMNS = 'id, title, section_name, items, auto_end_minutes, sort_order, last_used_at, updated_at';

export async function listPresets(): Promise<ClassroomPreset[]> {
  const { data, error } = await presetTable()
    .select(COLUMNS)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ClassroomPreset[];
}

export async function savePreset(draft: PresetDraft, id?: string, sortOrder = 0): Promise<void> {
  const row = {
    title: draft.title.trim(),
    section_name: draft.section_name || null,
    items: draft.items,
    auto_end_minutes: draft.auto_end_minutes,
  };
  const { error } = id
    ? await presetTable().update(row as never).eq('id', id)
    : await presetTable().insert({ ...row, sort_order: sortOrder } as never);
  if (error) throw error;
}

export async function deletePreset(id: string): Promise<void> {
  const { error } = await presetTable().delete().eq('id', id);
  if (error) throw error;
}

// ── 휴대폰 승인 ─────────────────────────────────────────────

export type LinkStatus = 'pending' | 'expired' | 'approved' | 'active' | 'ended' | 'cancelled' | 'taken' | 'unknown';

export interface LinkInfo {
  status: LinkStatus;
  /** session = 수업 시작 QR, drive = 수업 중 «드라이브 다시 연결» QR */
  purpose?: 'session' | 'drive';
  device_name?: string;
  platform?: 'windows' | 'android';
  expires_at?: string;
  ends_at?: string | null;
  preset_id?: string | null;
}

const ERROR_TEXT: Record<string, string> = {
  authentication_required: '스페이스기전에 다시 로그인해 주세요.',
  origin_not_allowed: '스페이스기전 웹에서만 승인할 수 있습니다.',
  link_expired: 'QR 이 만료됐습니다. 교실 화면에 새로 뜬 QR 을 다시 찍어 주세요.',
  preset_not_found: '세팅을 찾지 못했습니다. «교실 기기»에서 다시 확인해 주세요.',
  not_allowed: '교직원 계정만 교실 기기를 세팅할 수 있습니다.',
  google_token_required: '구글 드라이브 허용이 필요합니다. 단추를 다시 눌러 구글 창에서 허용해 주세요.',
  not_session_teacher: '이 기기에서 수업 중인 선생님만 드라이브를 다시 연결할 수 있습니다.',
  use_website_mfa_login: '2단계 인증 계정은 스페이스기전 화면 항목을 교실 기기에 넘길 수 없습니다.',
  session_creation_failed: '로그인 정보를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
  rate_limited: '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.',
  type_expired: 'QR 이 만료됐거나 이미 보냈습니다. 교실 화면에서 다시 눌러 QR 을 새로 찍어 주세요.',
  not_active: '이 교실 기기는 지금 수업 중이 아닙니다.',
  invalid_payload: '암호화하지 못했습니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.',
};

export class ClassroomLinkError extends Error {
  constructor(public code: string) {
    super(ERROR_TEXT[code] ?? '교실 기기와 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('classroom-link', { body });
  if (error) {
    let code = 'server_error';
    try {
      const context = (error as { context?: Response }).context;
      if (context) code = ((await context.json()) as { error?: string }).error ?? code;
    } catch {
      /* 본문이 없으면 일반 오류 */
    }
    throw new ClassroomLinkError(code);
  }
  return data as T;
}

export const inspectLink = (code: string) => call<LinkInfo>({ action: 'inspect', code });

/**
 * presetId = null 이면 «드라이브 다시 연결»(구글 토큰만).
 * keepGoogle: 그 교실 PC 의 수업용 브라우저(구글 로그인)를 암호화해 남길지 — 끄면 서버가 열쇠를 지운다(A+, 2026-10-14).
 */
export const approveLink = (code: string, presetId: string | null, googleToken: string | null, keepGoogle = true) =>
  call<{ device_name: string; ends_at: string; title: string }>({
    action: 'approve', code, keep_google: keepGoogle,
    ...(presetId ? { preset_id: presetId } : {}), ...(googleToken ? { google_token: googleToken } : {}),
  });

/** 대기 중이면 거절, 승인 뒤면 «수업 끝» — 교실 기기는 다음 확인(30초 안)에 정리한다 */
export const stopLink = (code: string) => call<{ status: LinkStatus }>({ action: 'stop', code });

// ── 교실 기기 화면(/classroom) — 내 연결 현황 · 보관한 구글 로그인 ────────────────────

export interface ClassroomOverview {
  /** 지금 연결된 교실 — code 로 원격 «수업 끝»(stopLink) */
  active: { code: string; device_name: string; title: string | null; section_name: string | null; approved_at: string; ends_at: string }[];
  recent: { device_name: string; title: string | null; section_name: string | null; approved_at: string; ended_at: string }[];
  /** 교실 PC 별 구글 로그인 보관(A+) — 지우면 그 PC 의 보관 파일은 열 수 없게 된다 */
  logins: { ref: string; device_name: string; created_at: string; last_used_at: string }[];
}

export const OVERVIEW_KEY = ['classroom-overview'];

export async function fetchOverview(): Promise<ClassroomOverview> {
  const { data, error } = await supabase.rpc('my_classroom_overview' as never);
  if (error) throw error;
  return (data ?? { active: [], recent: [], logins: [] }) as unknown as ClassroomOverview;
}

export async function forgetClassroomLogin(ref: string): Promise<void> {
  const { error } = await supabase.rpc('forget_my_classroom_login' as never, { p_ref: ref } as never);
  if (error) throw error;
}

// ── 휴대폰으로 구글 비밀번호 입력(2026-10-14) — 암호문만 오간다(typeCrypto.ts) ──────────────
export interface TypeInfo { status: 'pending' | 'sent' | 'expired' | 'not_session_teacher'; device_name?: string; expires_at?: string }

export const inspectType = (code: string) => call<TypeInfo>({ action: 'type_inspect', code });

export const submitType = (code: string, payload: { epk: string; iv: string; ct: string }) =>
  call<{ status: 'sent'; device_name: string }>({ action: 'type_submit', code, payload });
