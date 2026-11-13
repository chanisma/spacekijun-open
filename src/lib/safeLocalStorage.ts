/**
 * localStorage 를 **부팅을 막지 않는 방식으로** 읽는다.
 *
 * 왜 필요한가 — `localStorage` 는 두 가지로 앱을 통째로 죽일 수 있고, 둘 다 조용하다.
 *  1. **접근 자체가 던진다.** 시크릿 창·사이트 데이터 차단·iframe 샌드박스에서는
 *     `localStorage` 프로퍼티를 **읽기만 해도** `SecurityError` 가 난다(getItem 이 아니라
 *     `window.localStorage` 접근에서). try/catch 없이 쓰면 그 자리에서 트리가 죽는다.
 *  2. **값이 깨져 있다.** `JSON.parse` 가 던지는데, 저장된 값은 새로고침해도 그대로라
 *     **매번 같은 자리에서 같은 예외**가 난다 → 백색 화면이 영구화된다. 사용자가 직접
 *     localStorage 를 비우기 전에는 절대 낫지 않는다.
 *
 * 그래서 읽기는 실패를 값으로 돌려주고, **깨진 키는 스스로 지운다**(자가 치유).
 * 렌더 단계에서 쓰는 값(useState 초기화 등)은 반드시 이 함수를 거칠 것.
 */

/** 원문 읽기. 접근이 막혀 있으면 null. 절대 던지지 않는다. */
export function readStoredString(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 쓰기. 실패해도 조용히 무시한다(용량 초과·프라이빗 모드). */
export function writeStoredString(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 저장 못 해도 기능은 계속돼야 한다 */
  }
}

export function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

/**
 * JSON 읽기. 파싱에 실패하면 **그 키를 지우고** fallback 을 돌려준다 —
 * 지우지 않으면 다음 새로고침에서 똑같이 실패해 백색 화면이 영원히 남는다.
 *
 * `validate` 를 주면 모양까지 확인한다. 타입이 바뀐 옛 값(예: 예전엔 문자열, 지금은 객체)도
 * 파싱은 성공하므로, 모양 검사가 없으면 깨진 값이 그대로 화면까지 흘러간다.
 */
export function readStoredJson<T>(
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T,
): T {
  const raw = readStoredString(key);
  if (raw === null) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[safeLocalStorage] "${key}" 값이 JSON 이 아니라 삭제합니다:`, raw);
    removeStored(key);
    return fallback;
  }

  if (validate && !validate(parsed)) {
    console.warn(`[safeLocalStorage] "${key}" 값의 모양이 예상과 달라 삭제합니다:`, parsed);
    removeStored(key);
    return fallback;
  }

  return parsed as T;
}

/** JSON 쓰기. 직렬화 불가(순환 참조 등)해도 앱을 죽이지 않는다. */
export function writeStoredJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

/**
 * 로그인 관련 저장값만 지운다 — "localStorage 를 통째로 지우면 낫더라"를 안전한 한 번의
 * 동작으로 만든 것. 사이드바 펼침 상태 같은 무관한 설정까지 날리지 않는다.
 *
 * Supabase 세션 키는 프로젝트 ref 가 들어간 `sb-<ref>-auth-token` 형태라 이름을 하드코딩할 수
 * 없다 → 패턴으로 찾는다.
 */
export function clearStoredAuthState(): string[] {
  const removed: string[] = [];
  try {
    const keys = Object.keys(window.localStorage);
    for (const key of keys) {
      const isSupabaseAuth = /^sb-.*-auth-token(-code-verifier)?$/.test(key);
      const isAppAuth =
        key === 'auth_login_timestamp' ||
        key.startsWith('gdrive_') ||
        key.startsWith('google_') ||
        key === 'privacy_consent_verification';
      if (isSupabaseAuth || isAppAuth) {
        removeStored(key);
        removed.push(key);
      }
    }
  } catch {
    /* 접근이 막혀 있으면 지울 것도 없다 */
  }
  return removed;
}
