/**
 * 로그인 없는 QR 서명 — 토큰 경로.
 *
 * 일반 경로와 **완전히 다른 인증 모델**이다:
 *
 *   일반  로그인이 신원을 증명하고 서버가 `auth.uid()` 로 "차례인 본인"을 재검증한다.
 *         링크(`/signature-sign/:requestId`)는 아무 권한도 주지 않는다.
 *   토큰  **링크가 곧 자격증명이다.** 링크를 가진 사람이 그 서명자로 취급된다.
 *
 * 그래서 피해 범위를 서버가 구조적으로 묶는다 — 토큰은 ①**서명자 1행**에만 유효하고
 * ②**서명·거절하면 즉시 죽고**(그 행이 pending 이 아니게 된다) ③**만료**가 있다.
 * 서명 기록에는 `auth_method = 'token'` 이 남아 로그인 서명과 구분된다(증거력이 다르다).
 *
 * 조회 응답에 **문서도 다른 서명자 명단도 없다** — 링크를 주운 사람에게 문서가 통째로
 * 열리면 안 되고, 서명하러 온 사람에게 필요한 것은 "무엇에, 누구로 서명하는가" 뿐이다.
 */
import { supabase } from '@/integrations/supabase/client';
import type { SourceKind } from '../types';

/** 토큰으로 볼 수 있는 최소 정보 */
export interface TokenSignatureView {
  title: string;
  message: string | null;
  sourceName: string;
  sourceKind: SourceKind;
  requesterName: string;
  requestStatus: 'pending' | 'completed' | 'rejected' | 'cancelled';
  /** 이 링크가 가리키는 서명자 — 화면에 반드시 보여 준다("누구로 서명하는가") */
  signerName: string;
  roleLabel: string | null;
  signerStatus: 'pending' | 'signed' | 'rejected';
  signedCount: number;
  totalCount: number;
  isMyTurn: boolean;
}

/**
 * 조회 결과.
 *
 * 판별 유니온(`{ok:true;view} | {ok:false;reason}`)을 쓰지 않는 이유 —
 * 이 저장소는 `strict: false`(따라서 `strictNullChecks` 도 off)라 **좁히기가 동작하지 않아**
 * `result.reason` 이 타입 오류가 된다. 두 필드를 다 두고 null 로 구분한다.
 */
export interface TokenLookupResult {
  ok: boolean;
  view: TokenSignatureView | null;
  reason: 'not_found' | 'expired' | null;
}

export async function fetchSignatureByToken(token: string): Promise<TokenLookupResult> {
  const { data, error } = await supabase.rpc('get_signature_by_token' as never, {
    p_token: token,
  } as never);
  if (error) throw error;

  const raw = data as unknown as Record<string, unknown> | null;
  if (!raw || raw.ok !== true) {
    return { ok: false, view: null, reason: raw?.reason === 'expired' ? 'expired' : 'not_found' };
  }

  return {
    ok: true,
    reason: null,
    view: {
      title: String(raw.title ?? ''),
      message: (raw.message as string | null) ?? null,
      sourceName: String(raw.source_name ?? ''),
      sourceKind: raw.source_kind as SourceKind,
      requesterName: String(raw.requester_name ?? ''),
      requestStatus: raw.request_status as TokenSignatureView['requestStatus'],
      signerName: String(raw.signer_name ?? ''),
      roleLabel: (raw.role_label as string | null) ?? null,
      signerStatus: raw.signer_status as TokenSignatureView['signerStatus'],
      signedCount: Number(raw.signed_count ?? 0),
      totalCount: Number(raw.total_count ?? 0),
      isMyTurn: raw.is_my_turn === true,
    },
  };
}

export async function signWithToken(
  token: string,
  action: 'sign' | 'reject',
  signature: unknown,
  comment?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('sign_signature_with_token' as never, {
    p_token: token,
    p_action: action,
    p_signature: (signature ?? null) as never,
    p_comment: comment ?? null,
    // 감사용 — 나중에 "이 서명이 어디서 왔는가"를 되짚을 단서
    p_user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
  } as never);
  if (error) throw error;
}

export interface SignLink {
  signerId: string;
  signerName: string;
  status: 'pending' | 'signed' | 'rejected';
  token: string;
  expiresAt: string;
}

/**
 * 요청자가 서명 링크를 꺼낸다(QR 을 그리려면 원문 토큰이 필요하다).
 * **요청자·admin 만** — 서명자끼리 서로의 토큰을 보면 남의 칸에 서명할 수 있다.
 */
export async function fetchSignLinks(requestId: string): Promise<SignLink[]> {
  const { data, error } = await supabase.rpc('get_signature_sign_links' as never, {
    p_request_id: requestId,
  } as never);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    signerId: String(r.signer_id),
    signerName: String(r.signer_name),
    status: r.status as SignLink['status'],
    token: String(r.token),
    expiresAt: String(r.expires_at),
  }));
}

/** 로그인 없이 여는 공개 서명 경로. `RequireAuth` 화이트리스트와 짝이다. */
export function publicSignPath(token: string): string {
  return `/sign/${token}`;
}
