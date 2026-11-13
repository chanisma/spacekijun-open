/**
 * 교사 resource 의 등록 이메일(`resource.meta.email`)과 그 resource 에 연결된 계정의
 * 로그인 이메일(`profiles.email`)을 비교한다 (2026-10-13).
 *
 * 왜 필요한가 — 교사는 **이름만으로** 스스로 연결된다(사용자 결정으로 유지). 그래서 다른
 * 사람이 남의 이름으로 연결해도 서버는 막지 않는다. 대신 두 이메일이 어긋나는 연결을
 * 관리자 화면(교사 리소스)에 드러내 사람이 확인하게 한다.
 *
 * 어긋남이 곧 오류는 아니다 — 개인 메일로 가입한 교사, 명단 이메일이 잘못 들어간 경우도
 * 같은 모양이다. 화면은 "확인 필요"라고만 말한다.
 */

export type LinkEmailCheck =
  /** 연결된 계정이 없다 — 비교할 것이 없다 */
  | 'unlinked'
  /** 두 이메일이 같다 */
  | 'match'
  /** 명단(resource)에 이메일이 없다 — 비교할 수 없다 */
  | 'resource_missing'
  /** 두 이메일이 다르다 — 관리자 확인 필요 */
  | 'mismatch';

/** 엑셀 가져오기 흔적(`NAN`·`-`)처럼 값이 아닌 값은 "없음"으로 본다. */
const PLACEHOLDER = new Set(['', 'nan', 'null', 'undefined', '-', 'none']);

export const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return PLACEHOLDER.has(v) ? null : v;
};

export const checkLinkEmail = (
  resourceEmail: unknown,
  loginEmail: string | null | undefined,
): LinkEmailCheck => {
  const login = normalizeEmail(loginEmail);
  if (!login) return 'unlinked';
  const registered = normalizeEmail(resourceEmail);
  if (!registered) return 'resource_missing';
  return registered === login ? 'match' : 'mismatch';
};

/** 관리자가 확인해야 하는 상태인가 (요약 숫자·필터의 기준). */
export const needsEmailReview = (check: LinkEmailCheck): boolean =>
  check === 'mismatch' || check === 'resource_missing';
