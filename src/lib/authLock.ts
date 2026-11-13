/**
 * 인증 잠금 — **다른 탭이 얼어붙어도 이 탭이 영원히 기다리지 않게** 한다.
 *
 * ## 무엇이 문제였나 (2026-09-10, 휴대폰 실사용)
 * `auth-js` 는 세션을 만질 때마다 `navigator.locks` 로 `lock:sb-<ref>-auth-token`
 * **하나의 배타 잠금**을 잡는다. Web Locks 는 탭 단위가 아니라 **출처(origin) 단위**라
 * 같은 사이트의 모든 탭이 이 잠금을 두고 줄을 선다. 그리고 `getSession()`·`initialize()`·
 * `INITIAL_SESSION` 발행·`getUser()` 가 전부 `_acquireLock(**-1**, …)` — **타임아웃 없이
 * 영원히 기다린다**. 게다가 `_recoverAndRefresh()` 는 그 잠금을 쥔 채 토큰 갱신
 * 네트워크 요청을 하고(실패 시 백오프로 최대 30초), 이 앱의 `supabase.auth.getUser()` 도
 * 잠금 안에서 `GET /user` 를 친다.
 *
 * **데스크톱과 휴대폰이 여기서 갈린다.** 데스크톱은 배경 탭도 JS 를 계속 돌려(타이머만
 * 느려질 뿐) 잠금을 결국 놓아 준다. 모바일 브라우저는 배경 탭을 **freeze/suspend** 해
 * 태스크 큐 자체를 멈춘다 → 잠금을 해제하는 `finally` 가 **영영 실행되지 않는다**.
 * 잠금은 그 문서가 살아 있는 한 유지되므로, 얼어붙은 탭이 잠금을 쥔 채 멈춰 선다.
 *
 * 증상은 "휴대폰에서 흰 화면 → 6초 뒤 «로그인 정보를 확인하지 못했습니다»,
 * **새로고침해도 그대로**, 그런데 같은 브라우저의 다른 탭을 새로고침하면 낫는다" 였다.
 * 마지막 조각이 결정적이다 — 그 탭의 문서가 파괴되며 잠금이 풀린 것이다.
 * 저장된 로그인 정보를 지워도 낫지 않는다(잠금 **이름**은 저장소 내용과 무관하다).
 *
 * ## 어떻게 고치나
 * "영원히 기다려라(-1)"를 **유한한 대기 + 빼앗기(steal)** 로 바꾼다. Web Locks 의
 * `steal: true` 는 정확히 이 상황(보유자가 죽었거나 응답하지 않음)을 위해 규격에 있는
 * 기능이라, 보유자의 협조 없이 브라우저가 잠금을 회수해 준다. 빼앗긴 쪽의 `request`
 * 프로미스는 `AbortError` 로 거부되므로 얼어붙은 탭이 나중에 깨어나도 그냥 실패한다.
 *
 * **한 번만 손해 보고 끝난다는 점이 중요하다.** 빼앗고 나면 잠금은 정상으로 돌아오므로
 * 이후 호출은 즉시 통과한다(얼어붙은 탭은 다시 요구하지 못한다). 매 호출마다 3초씩
 * 무는 구조였다면 `getUser()` 를 수십 번 부르는 이 앱에서는 쓸 수 없었을 것이다.
 *
 * ## 왜 잠금을 그냥 없애지 않나
 * 잠금이 없으면 여러 탭이 **같은 refresh token 으로 동시에 갱신**해 회전(rotation)에
 * 걸린다. 정상 경합은 잠금이 그대로 막고, 우리는 **비정상(응답 없는 보유자)** 만
 * 걷어낸다. 3초를 넘겨 빼앗는 드문 경우도 GoTrue 의 refresh token 재사용 유예
 * (기본 10초) 안이라 두 탭이 같은 새 세션을 받는다.
 */

/**
 * 잠금을 이만큼 기다려도 못 얻으면 보유자가 얼어붙은 것으로 보고 빼앗는다.
 *
 * `RequireAuth` 가 "멈췄다" 화면을 띄우는 시간(`AUTH_STUCK_MS` = 6초)보다 **확실히 작아야**
 * 한다 — 빼앗은 뒤에도 프로필 조회가 남아 있으므로 그 여유까지 계산에 넣은 값이다.
 * (회귀 `scripts/auth-lock-test/run.mts` 가 이 부등식을 검사한다.)
 *
 * 반대로 너무 작으면 **정상적으로 갱신 중인 이웃 탭에서 잠금을 뺏는다**. 평상시 토큰 갱신은
 * 1초 안쪽이고, 3초를 넘겨 빼앗는 드문 경우도 GoTrue 의 refresh token 재사용 유예(기본 10초)
 * 안이라 두 탭이 같은 새 세션을 받는다.
 */
export const AUTH_LOCK_MAX_WAIT_MS = 3000;

/** `auth-js` 가 `e.isAcquireTimeout` 으로 판정하므로 그 모양을 그대로 맞춘다. */
export class AuthLockAcquireTimeoutError extends Error {
  readonly isAcquireTimeout = true;
  constructor(name: string) {
    super(`Acquiring an exclusive Navigator LockManager lock "${name}" timed out`);
    this.name = 'AuthLockAcquireTimeoutError';
  }
}

/** 통계는 진단용이다 — 이 값이 0 이 아니면 어딘가에서 탭이 얼어붙고 있다는 뜻. */
export const authLockStats = { steals: 0, timeouts: 0 };

type LockManagerLike = {
  request: (
    name: string,
    options: { mode?: 'exclusive' | 'shared'; ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<unknown>,
  ) => Promise<unknown>;
};

const getLockManager = (): LockManagerLike | null => {
  if (typeof navigator === 'undefined') return null;
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === 'function' ? locks : null;
};

/** `ifAvailable` 로 못 얻었을 때를 값으로 구분하기 위한 표식. */
const NOT_ACQUIRED = Symbol('auth-lock-not-acquired');

export type AuthLockFn = <R>(name: string, acquireTimeout: number, fn: () => Promise<R>) => Promise<R>;

/**
 * `@supabase/auth-js` 의 `LockFunc` 를 만든다.
 *
 * 대기 상한을 인자로 뺀 이유는 **회귀 테스트를 빠르게 돌리기 위해서**다(실제 3초를 매번
 * 기다리면 테스트가 느려지고, 그러면 안 돌리게 된다). 운영 기본값은 아래 `browserAuthLock`.
 */
export function createAuthLock({ maxWaitMs = AUTH_LOCK_MAX_WAIT_MS } = {}): AuthLockFn {
  return async function authLock<R>(
    name: string,
    /** 음수 = "영원히"(우리는 상한을 둔다) · 0 = "즉시 얻을 수 있을 때만" · 양수 = 그만큼만 대기. */
    acquireTimeout: number,
    fn: () => Promise<R>,
  ): Promise<R> {
    const locks = getLockManager();

    // Web Locks 미지원(예: iOS 15.4 미만) — auth-js 의 기본 폴백(lockNoOp)과 같이
    // 잠금 없이 실행한다. 잠금이 없다고 인증이 막혀서는 안 된다.
    if (!locks) return await fn();

    // 0 = 자동 갱신 틱이 쓰는 경로. **반드시 isAcquireTimeout 오류로 실패해야** 한다 —
    // 여기서 기다리면 30초마다 도는 틱이 줄을 서서 잠금 경합을 스스로 키운다.
    if (acquireTimeout === 0) {
      const result = (await locks.request(
        name,
        { mode: 'exclusive', ifAvailable: true },
        async (lock) => (lock ? await fn() : NOT_ACQUIRED),
      )) as R | typeof NOT_ACQUIRED;
      if (result === NOT_ACQUIRED) throw new AuthLockAcquireTimeoutError(name);
      return result;
    }

    const waitMs = acquireTimeout > 0 ? Math.min(acquireTimeout, maxWaitMs) : maxWaitMs;

    // `entered` 는 오탐 방지용이다. `fn()` 안에서 난 오류를 "잠금을 못 얻었다"로 오해하면
    // **작업을 두 번 실행**하게 된다(토큰 갱신이 두 번 나가는 최악의 경우).
    let entered = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), waitMs);
    try {
      return (await locks.request(name, { mode: 'exclusive', signal: controller.signal }, async () => {
        entered = true;
        return await fn();
      })) as R;
    } catch (error) {
      if (entered) throw error;

      // 호출자가 유한 타임아웃을 요구했다면 약속대로 타임아웃으로 알린다.
      if (acquireTimeout > 0) {
        authLockStats.timeouts += 1;
        throw new AuthLockAcquireTimeoutError(name);
      }

      authLockStats.steals += 1;
      console.warn(
        `[authLock] "${name}" 을 ${waitMs}ms 기다려도 얻지 못해 빼앗습니다. ` +
          '다른 탭이 배경에서 얼어붙은 채 잠금을 쥐고 있을 가능성이 큽니다(모바일에서 흔함).',
        error,
      );
      return await stealAndRun(locks, name, fn);
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * 잠금을 빼앗아 실행한다.
 *
 * `steal` 은 `signal`·`ifAvailable` 과 **함께 쓸 수 없다**(규격상 TypeError). 그래서
 * 대기와 빼앗기를 두 단계로 나눈 것이다. 빼앗기조차 실패하는 브라우저에서는 잠금 없이
 * 진행한다 — 여기서 포기하면 사용자는 다시 흰 화면을 본다.
 */
async function stealAndRun<R>(locks: LockManagerLike, name: string, fn: () => Promise<R>): Promise<R> {
  let entered = false;
  try {
    return (await locks.request(name, { mode: 'exclusive', steal: true }, async () => {
      entered = true;
      return await fn();
    })) as R;
  } catch (error) {
    if (entered) throw error;
    console.warn(`[authLock] "${name}" 빼앗기에 실패해 잠금 없이 진행합니다.`, error);
    return await fn();
  }
}

/** 운영에서 쓰는 잠금. `src/integrations/supabase/client.ts` 가 이걸 넘긴다. */
export const browserAuthLock: AuthLockFn = createAuthLock();
