/**
 * 연수 서명 링크 (2026-10-25) — 참석자마다 로그인 없이 서명하는 링크.
 *
 * 이 기능 이후 만든 연수만 링크가 있다(연수 생성 트리거가 참석자별 토큰을 만든다 — SQL `20261025190000`).
 * 링크가 곧 신원이므로 목록은 만든 사람·관리자만, 참석자는 자기 것만 받는다(서버 `get_training_sign_links`).
 * 로그인 없는 화면은 `/training-sign-link/:token` — `get_training_by_token`·`sign_training_with_token` 만 anon 에 열려 있다.
 *
 * 판별 유니온을 쓰지 않는다 — 이 저장소는 strictNullChecks 가 꺼져 좁히기가 동작하지 않는다(signatureTokenService 와 같다).
 */
import { supabase } from '@/integrations/supabase/client';

export const trainingSignLinkPath = (token: string) => `/training-sign-link/${token}`;
export const trainingSignQrPath = (meetingId: string) => `/training-sign-qr/${meetingId}`;

export interface TrainingTokenView {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  signerName: string;
  signed: boolean;
  expiresAt: string | null;
}

export interface TrainingTokenLookup {
  ok: boolean;
  view: TrainingTokenView | null;
  reason: 'not_found' | 'expired' | null;
}

export async function fetchTrainingByToken(token: string): Promise<TrainingTokenLookup> {
  const { data, error } = await supabase.rpc('get_training_by_token' as never, { p_token: token } as never);
  if (error) throw error;
  const raw = data as unknown as Record<string, unknown> | null;
  if (!raw || raw.ok !== true) {
    return { ok: false, view: null, reason: raw?.reason === 'expired' ? 'expired' : 'not_found' };
  }
  return {
    ok: true,
    reason: null,
    view: {
      title: String(raw.title ?? '연수'),
      startsAt: String(raw.starts_at ?? ''),
      endsAt: String(raw.ends_at ?? ''),
      location: (raw.location as string | null) ?? null,
      signerName: String(raw.signer_name ?? ''),
      signed: raw.signed === true,
      expiresAt: (raw.expires_at as string | null) ?? null,
    },
  };
}

export async function signTrainingWithToken(token: string, strokes: unknown): Promise<void> {
  const { error } = await supabase.rpc('sign_training_with_token' as never, {
    p_token: token,
    p_strokes: strokes as never,
    // 감사용 — 이 서명이 어느 기기에서 왔는가
    p_user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
  } as never);
  if (error) throw error;
}

export interface TrainingSignLink {
  signerName: string;
  token: string;
  signed: boolean;
}

export interface TrainingSignLinks {
  /** false = 이 기능 전에 만든 연수(링크 없음) */
  enabled: boolean;
  /** 만든 사람·관리자 — 전원의 링크와 기한 바꾸기 */
  canManage: boolean;
  expiresAt: string | null;
  expiresCustom: boolean;
  defaultExpiresAt: string | null;
  links: TrainingSignLink[];
}

export async function fetchTrainingSignLinks(meetingId: string): Promise<TrainingSignLinks> {
  const { data, error } = await supabase.rpc('get_training_sign_links' as never, { p_meeting_id: meetingId } as never);
  if (error) throw error;
  const raw = (data ?? {}) as unknown as Record<string, unknown>;
  const links = Array.isArray(raw.links) ? (raw.links as Array<Record<string, unknown>>) : [];
  return {
    enabled: raw.enabled === true,
    canManage: raw.can_manage === true,
    expiresAt: (raw.expires_at as string | null) ?? null,
    expiresCustom: raw.expires_custom === true,
    defaultExpiresAt: (raw.default_expires_at as string | null) ?? null,
    links: links.map((l) => ({ signerName: String(l.signer_name ?? ''), token: String(l.token ?? ''), signed: l.signed === true })),
  };
}

/** 기한 바꾸기 — null = 기본(연수 마지막 날 + 7일)으로 되돌리기 */
export async function setTrainingSignLinkExpiry(meetingId: string, expiresAt: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_training_sign_link_expiry' as never, {
    p_meeting_id: meetingId, p_expires_at: expiresAt,
  } as never);
  if (error) throw error;
}
