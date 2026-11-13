/**
 * 인증 잠금 회귀 — `npx tsx scripts/auth-lock-test/run.mts`
 *
 * 사고가 **둘**이다. 둘 다 오류를 내지 않고 **흰 화면**으로 끝나며, 새로고침해도 낫지 않는다.
 *
 * ## ① 같은 탭 안의 순환 대기 (2026-09-04, 실제 재현)
 * `AuthProvider` 의 `onAuthStateChange` 콜백이 `async` 였고 그 안에서 `await loadProfile(...)`
 * 을 했다. auth-js 는 이 콜백을 **인증 잠금을 쥔 채 await** 하는데(`_notifyAllSubscribers`),
 * `loadProfile` 안의 `supabase.from(...)` 은 내부적으로 `_getAccessToken()` →
 * `auth.getSession()` → **같은 잠금**을 다시 요구한다. 잠금 대기에 타임아웃이 없어
 * (`acquireTimeout: -1`) 영구히 매달린다 → `setLoading(false)` 가 영영 실행되지 않는다.
 *
 * **액세스 토큰이 유효할 때는 재현되지 않는다.** 그때는 `INITIAL_SESSION` 만 나고 그 경로는
 * 콜백을 await 하지 않아 잠금이 먼저 풀린다. 토큰이 만료된 뒤 부팅해야 `_recoverAndRefresh`
 * → `TOKEN_REFRESHED` 가 잠금 안에서 await 되며 걸린다. 그래서 증상이 "한참 자리를 비웠다
 * 돌아오면 흰 화면, 새로고침해도 그대로, localStorage 지우면 해결"이었다.
 *
 * ## ② 다른 탭이 잠금을 쥔 채 얼어붙음 (2026-09-10, 휴대폰 실사용)
 * Web Locks 는 탭이 아니라 **출처(origin) 단위**라 같은 사이트의 모든 탭이 하나의
 * `lock:sb-<ref>-auth-token` 을 두고 줄을 선다. 모바일 브라우저는 배경 탭을 freeze 해
 * 태스크 큐를 멈추므로, 그 탭이 잠금을 쥔 채 얼어붙으면 **해제하는 `finally` 가 영영
 * 실행되지 않는다**. 다른 탭은 `-1`(무한 대기)로 서 있다가 통째로 멈춘다.
 *
 * 증상이 ①과 똑같아 보이지만 **결정적 차이**가 있다 — 이번엔 저장된 로그인 정보를 지워도
 * 낫지 않고(잠금 **이름**은 저장소 내용과 무관하다), **다른 탭을 새로고침하면** 낫는다
 * (그 문서가 파괴되며 잠금이 풀린다). 사용자가 우연히 발견한 이 사실이 원인을 특정했다.
 *
 * 수정 = `src/lib/authLock.ts` — 유한 대기 후 `steal` 로 빼앗는다.
 *
 * ## 왜 Node 기본 실행으로는 못 잡나
 * auth-js 는 `navigator.locks` 가 없으면 **lockNoOp** 으로 떨어진다. 폴리필 없이 돌리면
 * 시나리오가 전부 통과해 버린다(실제로 그렇게 한 번 놓쳤다). 아래에서 `signal`·
 * `ifAvailable`·`steal` 까지 구현한 진짜 배타 잠금을 폴리필하는 이유다.
 */
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ── 브라우저와 같은 배타 잠금 폴리필 ──────────────────────────────────────
// 규격에서 우리가 의존하는 부분만 구현한다: 배타 큐잉 · `signal` 로 **대기 중** 취소 ·
// `ifAvailable` 은 못 얻으면 콜백에 null · `steal` 은 현재 보유자를 강제 회수하고
// 그쪽 `request` 프로미스를 AbortError 로 거부.
type Waiter = {
  callback: (lock: unknown) => unknown;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  detach?: () => void;
};
type Grant = { stolen: boolean; reject: (e: unknown) => void };

const abortError = () => Object.assign(new Error('The lock request was aborted'), { name: 'AbortError' });

class MockLockManager {
  private held = new Map<string, Grant>();
  private queue = new Map<string, Waiter[]>();

  reset() { this.held.clear(); this.queue.clear(); }
  isHeld(name: string) { return this.held.has(name); }

  request(name: string, options: any, callback?: any): Promise<unknown> {
    if (typeof options === 'function') { callback = options; options = {}; }
    const opts = options ?? {};
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { callback, resolve, reject };

      if (opts.steal) {
        const current = this.held.get(name);
        if (current) {
          current.stolen = true;
          this.held.delete(name);
          current.reject(abortError());
        }
        this.run(name, waiter);
        return;
      }

      if (!this.held.has(name)) { this.run(name, waiter); return; }

      if (opts.ifAvailable) {
        Promise.resolve().then(() => waiter.callback(null)).then(resolve, reject);
        return;
      }

      const list = this.queue.get(name) ?? [];
      list.push(waiter);
      this.queue.set(name, list);

      const signal: AbortSignal | undefined = opts.signal;
      if (!signal) return;
      const drop = () => {
        const i = list.indexOf(waiter);
        if (i >= 0) { list.splice(i, 1); reject(abortError()); }
      };
      if (signal.aborted) { drop(); return; }
      signal.addEventListener('abort', drop, { once: true });
      waiter.detach = () => signal.removeEventListener('abort', drop);
    });
  }

  async query() { return { held: [...this.held.keys()], pending: [] }; }

  private run(name: string, waiter: Waiter) {
    const grant: Grant = { stolen: false, reject: waiter.reject };
    this.held.set(name, grant);
    Promise.resolve()
      .then(() => waiter.callback({ name, mode: 'exclusive' }))
      .then(
        (v) => { if (!grant.stolen) waiter.resolve(v); },
        (e) => { if (!grant.stolen) waiter.reject(e); },
      )
      .then(() => {
        // 빼앗긴 뒤라면 잠금은 이미 남의 것이다 — 지우지도, 다음 사람을 부르지도 않는다.
        if (grant.stolen) return;
        if (this.held.get(name) === grant) this.held.delete(name);
        const list = this.queue.get(name);
        const next = list?.shift();
        if (next) { next.detach?.(); this.run(name, next); }
      });
  }
}

const manager = new MockLockManager();
const g = globalThis as Record<string, unknown>;
Object.defineProperty(g, 'navigator', { value: { locks: manager }, configurable: true, writable: true });
Object.defineProperty(g, 'window', { value: g, configurable: true, writable: true });
g.document = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

// navigator 를 심은 뒤에 불러야 auth-js 가 navigatorLock 경로를 고른다.
const { GoTrueClient } = await import('@supabase/auth-js');
const { createAuthLock, AUTH_LOCK_MAX_WAIT_MS, AuthLockAcquireTimeoutError } = await import('../../src/lib/authLock');

const STORAGE_KEY = 'sb-probe-auth-token';
const LOCK_NAME = `lock:${STORAGE_KEY}`;

const makeStorage = (session: unknown) => {
  const map = new Map<string, string>();
  if (session) map.set(STORAGE_KEY, JSON.stringify(session));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
};

const fakeFetch = (async (url: string) => {
  if (String(url).includes('/token')) {
    return new Response(JSON.stringify({
      access_token: 'new', refresh_token: 'new-r', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'u1', email: 'a@b.c', app_metadata: {}, user_metadata: {}, aud: '', created_at: '' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as unknown as typeof fetch;

const session = (expiresAt: number) => ({
  access_token: 'stored', refresh_token: 'stored-r', token_type: 'bearer',
  expires_in: 3600, expires_at: expiresAt,
  user: { id: 'u1', email: 'a@b.c', app_metadata: {}, user_metadata: {}, aud: '', created_at: '' },
});

/** 회귀 테스트를 빠르게 돌리기 위한 짧은 상한. 운영 기본값은 아래 정적 가드가 검사한다. */
const TEST_WAIT_MS = 80;
const testLock = createAuthLock({ maxWaitMs: TEST_WAIT_MS });

/**
 * `style: 'await'` = ① 사고 당시 형태, `'deferred'` = 현행 수정 형태.
 * `frozenNeighbor` = ② 다른 탭이 잠금을 쥔 채 얼어붙은 상태.
 */
async function boots(
  sess: unknown,
  style: 'await' | 'deferred',
  opts: { lock?: unknown; frozenNeighbor?: boolean } = {},
): Promise<boolean> {
  manager.reset();
  if (opts.frozenNeighbor) {
    // 콜백이 영원히 끝나지 않는다 = freeze 된 탭. 빼앗기면 AbortError 로 거부되므로 삼킨다.
    manager.request(LOCK_NAME, { mode: 'exclusive' }, () => new Promise(() => {})).catch(() => {});
  }

  const client = new GoTrueClient({
    url: 'https://example.supabase.co/auth/v1',
    storageKey: STORAGE_KEY,
    storage: makeStorage(sess),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    fetch: fakeFetch,
    ...(opts.lock ? { lock: opts.lock as never } : {}),
  });

  let loadingCleared = false;
  const profileLoaded = new Promise<void>((resolve) => {
    client.onAuthStateChange(((event: string) => {
      if (style === 'await') {
        // ① 사고 당시: async 콜백 + 잠금 안에서 supabase 호출 await
        return (async () => {
          await client.getSession();          // = supabase.from(...) 의 내부 동작
          loadingCleared = true;
          resolve();
        })();
      }
      // 현행: 동기 콜백 + 무거운 작업은 매크로태스크로 미룸
      setTimeout(() => {
        void (async () => {
          await client.getSession();
          loadingCleared = true;
          resolve();
        })();
      }, 0);
      return undefined;
    }) as never);
  });

  // AuthProvider.initializeAuth 와 같은 모양
  const init = (async () => { await client.getSession(); })();

  const finished = await Promise.race([
    Promise.all([init, profileLoaded]).then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), 2500)),
  ]);
  try { client.stopAutoRefresh(); } catch { /* noop */ }
  return finished && loadingCleared;
}

const now = Math.floor(Date.now() / 1000);

// ══ ① 같은 탭 안의 순환 대기 ═══════════════════════════════════════════════
check('[사고①] 토큰 유효하면 await 형태도 부팅된다 — 그래서 눈에 안 띄었다',
  await boots(session(now + 3600), 'await') === true);
check('[사고①] **토큰 만료 + await 형태 = 매달린다**',
  await boots(session(now - 3600), 'await') === false);
check('[사고①] 세션이 없으면 await 형태도 부팅된다 — localStorage 를 지우면 낫던 이유',
  await boots(null, 'await') === true);

check('[수정①] 토큰 유효 → 부팅', await boots(session(now + 3600), 'deferred') === true);
check('[수정①] **토큰 만료 → 부팅** (교착 해소)', await boots(session(now - 3600), 'deferred') === true);
check('[수정①] 세션 없음 → 부팅', await boots(null, 'deferred') === true);
check('[수정①] 만료 직전(경계) → 부팅', await boots(session(now + 5), 'deferred') === true);

// ══ ② 다른 탭이 잠금을 쥔 채 얼어붙음 ══════════════════════════════════════
const quiet = console.warn;
console.warn = () => {};

check('[사고②] **얼어붙은 이웃 탭이 있으면 기본 잠금으로는 부팅 자체가 불가능하다**',
  await boots(session(now + 3600), 'deferred', { frozenNeighbor: true }) === false);
check('[사고②] 세션이 없어도(=저장된 로그인 정보를 지워도) 마찬가지다 — 잠금 이름은 저장소와 무관',
  await boots(null, 'deferred', { frozenNeighbor: true }) === false);

check('[수정②] 얼어붙은 이웃이 있어도 부팅된다 (토큰 유효)',
  await boots(session(now + 3600), 'deferred', { frozenNeighbor: true, lock: testLock }) === true);
check('[수정②] **얼어붙은 이웃 + 만료 토큰**(실사용 조합)에서도 부팅된다',
  await boots(session(now - 3600), 'deferred', { frozenNeighbor: true, lock: testLock }) === true);
check('[수정②] 얼어붙은 이웃 + 세션 없음 → 부팅',
  await boots(null, 'deferred', { frozenNeighbor: true, lock: testLock }) === true);

// ── 잠금 함수 자체의 계약 ────────────────────────────────────────────────
manager.reset();
check('[계약] 경합이 없으면 곧바로 실행한다',
  (await testLock(LOCK_NAME, -1, async () => 'ok')) === 'ok');

manager.reset();
{
  // 배타성은 그대로여야 한다 — 두 탭이 동시에 토큰을 갱신하면 refresh token 회전에 걸린다.
  const trace: string[] = [];
  const slow = testLock(LOCK_NAME, -1, async () => {
    trace.push('a:in');
    await new Promise((r) => setTimeout(r, 20));
    trace.push('a:out');
  });
  const fast = testLock(LOCK_NAME, -1, async () => { trace.push('b:in'); });
  await Promise.all([slow, fast]);
  check('[계약] **정상 경합에서는 여전히 배타적이다** (겹쳐 실행되지 않는다)',
    trace.join(',') === 'a:in,a:out,b:in', trace.join(','));
}

manager.reset();
{
  const started = Date.now();
  manager.request(LOCK_NAME, { mode: 'exclusive' }, () => new Promise(() => {})).catch(() => {});
  const value = await testLock(LOCK_NAME, -1, async () => 'stolen');
  const elapsed = Date.now() - started;
  check('[계약] 얼어붙은 보유자에게서 빼앗아 실행한다', value === 'stolen');
  check('[계약] 상한만큼만 기다린다 (무한 대기가 아니다)', elapsed >= TEST_WAIT_MS && elapsed < 1500, `${elapsed}ms`);
}

manager.reset();
{
  // 자동 갱신 틱(acquireTimeout 0)은 **기다리면 안 된다** — 30초마다 도는 틱이 줄을 서면
  // 잠금 경합을 스스로 키운다. auth-js 는 `e.isAcquireTimeout` 을 보고 조용히 건너뛴다.
  manager.request(LOCK_NAME, { mode: 'exclusive' }, () => new Promise(() => {})).catch(() => {});
  let thrown: unknown = null;
  let ran = false;
  try { await testLock(LOCK_NAME, 0, async () => { ran = true; }); } catch (e) { thrown = e; }
  check('[계약] acquireTimeout 0 은 경합 시 즉시 실패한다', !ran && thrown !== null);
  check('[계약] 그 오류는 isAcquireTimeout 이다 (auth-js 가 이걸로 판정한다)',
    !!(thrown as { isAcquireTimeout?: boolean })?.isAcquireTimeout);
  check('[계약] acquireTimeout 0 은 절대 빼앗지 않는다 (보유자가 그대로다)', manager.isHeld(LOCK_NAME));
}

manager.reset();
check('[계약] acquireTimeout 0 도 잠금이 비어 있으면 실행한다',
  (await testLock(LOCK_NAME, 0, async () => 'free')) === 'free');

manager.reset();
{
  // 잠금을 얻은 **뒤** fn 이 던진 오류를 "못 얻었다"로 오해하면 작업을 두 번 돌린다.
  // 토큰 갱신이 두 번 나가는 최악의 경우라 반드시 구분해야 한다.
  let runs = 0;
  let caught: unknown = null;
  try {
    await testLock(LOCK_NAME, -1, async () => { runs += 1; throw new Error('boom'); });
  } catch (e) { caught = e; }
  check('[계약] **fn 의 오류는 재실행하지 않고 그대로 던진다**',
    runs === 1 && (caught as Error)?.message === 'boom', `runs=${runs}`);
}

manager.reset();
{
  // 규격상 취소는 **대기 중**일 때만 유효하다. 잠금을 얻은 뒤 타이머가 늦게 터져도
  // 실행에 영향이 없어야 한다(여기서는 fn 이 상한보다 오래 걸리는 경우).
  const value = await testLock(LOCK_NAME, -1, async () => {
    await new Promise((r) => setTimeout(r, TEST_WAIT_MS * 3));
    return 'slow-ok';
  });
  check('[계약] fn 이 상한보다 오래 걸려도 중단되지 않는다', value === 'slow-ok');
}

{
  // Web Locks 미지원(iOS 15.4 미만) — 잠금이 없다고 인증이 막혀서는 안 된다.
  const nav = g.navigator as { locks?: unknown };
  const saved = nav.locks;
  nav.locks = undefined;
  const value = await testLock(LOCK_NAME, -1, async () => 'no-locks');
  nav.locks = saved;
  check('[계약] Web Locks 가 없으면 잠금 없이 실행한다', value === 'no-locks');
}

console.warn = quiet;

// ══ ③ 소스 정적 가드 ═══════════════════════════════════════════════════════
// 런타임 재현은 느리고 조건이 까다롭다. 형태 자체를 못 박아 두면 리뷰에서 바로 걸린다.
const src = readFileSync('src/components/auth/AuthProvider.tsx', 'utf8');
const callbackHead = src.slice(src.indexOf('supabase.auth.onAuthStateChange'));
const callbackBody = callbackHead.slice(0, callbackHead.indexOf('const initializeAuth'));
check('onAuthStateChange 콜백이 async 가 아니다 — 이것만으로 콜백 최상위 await 는 문법적으로 불가능해진다',
  !/onAuthStateChange\(\s*(\/\/[^\n]*\n\s*)*async\s/.test(callbackHead.slice(0, 400)));

// `runOutsideAuthLock(...)` 안쪽을 도려낸 뒤에도 `await loadProfile` 이 남아 있으면
// 잠금을 쥔 채 기다린다는 뜻이다. (안쪽의 await 는 정상이므로 그대로 세면 오탐이 난다.)
const stripDeferred = (body: string): string => {
  let out = '';
  let i = 0;
  while (i < body.length) {
    const at = body.indexOf('runOutsideAuthLock(', i);
    if (at === -1) { out += body.slice(i); break; }
    out += body.slice(i, at);
    let depth = 0;
    let j = body.indexOf('(', at);
    for (; j < body.length; j += 1) {
      if (body[j] === '(') depth += 1;
      else if (body[j] === ')') { depth -= 1; if (depth === 0) break; }
    }
    i = j + 1;
  }
  return out;
};
check('잠금을 쥔 채 loadProfile 을 await 하지 않는다 (미루기 블록 제외하고 검사)',
  !/await\s+loadProfile\(/.test(stripDeferred(callbackBody)));
check('미루기 블록 안에서는 여전히 loadProfile 을 기다린다 (loading 순서 보존)',
  /runOutsideAuthLock\([\s\S]{0,400}await\s+loadProfile\(/.test(callbackBody));
check('무거운 작업을 잠금 밖으로 미루는 헬퍼를 쓴다',
  src.includes('runOutsideAuthLock'));
check('미루기는 매크로태스크(setTimeout)다 — 마이크로태스크면 같은 교착에 걸린다',
  /runOutsideAuthLock[\s\S]{0,400}setTimeout/.test(src));

const clientSrc = readFileSync('src/integrations/supabase/client.ts', 'utf8');
check('supabase 클라이언트가 커스텀 잠금을 넘긴다 — 안 넘기면 다시 무한 대기가 기본값이다',
  /lock:\s*browserAuthLock/.test(clientSrc) && clientSrc.includes("from '@/lib/authLock'"));
check('인증 요청에만 타임아웃을 건다 (업로드·긴 쿼리를 끊지 않는다)',
  clientSrc.includes("'/auth/v1/'") && /AUTH_REQUEST_TIMEOUT_MS/.test(clientSrc));

const requireAuthSrc = readFileSync('src/components/auth/RequireAuth.tsx', 'utf8');
const stuckMs = Number(/AUTH_STUCK_MS\s*=\s*(\d+)/.exec(requireAuthSrc)?.[1] ?? NaN);
check('RequireAuth 의 "멈췄다" 임계값을 읽을 수 있다', Number.isFinite(stuckMs), String(stuckMs));
check('**잠금 대기 상한 < 멈춤 화면 임계값** — 아니면 정상 복구가 오류 화면으로 보인다',
  AUTH_LOCK_MAX_WAIT_MS < stuckMs, `${AUTH_LOCK_MAX_WAIT_MS} vs ${stuckMs}`);
check('빼앗은 뒤 프로필을 불러올 여유가 남는다 (임계값의 절반 이하)',
  AUTH_LOCK_MAX_WAIT_MS * 2 <= stuckMs, `${AUTH_LOCK_MAX_WAIT_MS} vs ${stuckMs}`);
check('타임아웃 오류 클래스가 isAcquireTimeout 을 노출한다',
  new AuthLockAcquireTimeoutError('x').isAcquireTimeout === true);

console.log(`${pass} passed, ${fail} failed`);
console.log(fail === 0 ? 'OK' : 'FAILED');
process.exit(fail === 0 ? 0 : 1);
