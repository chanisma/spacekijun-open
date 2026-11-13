/**
 * localStorage 안전 읽기 회귀 — `npx tsx scripts/safe-storage-test/run.mts`
 *
 * 이 모듈이 막는 것은 **영구 백색 화면**이다. 부팅 경로(Provider 층)에서 저장된 값을
 * 읽다 예외가 나면 그 위에 ErrorBoundary 가 없어 트리가 통째로 언마운트되고, 원인이
 * 저장된 값이라 **새로고침해도 같은 자리에서 또 터진다**. 그래서 두 가지를 못 박는다.
 *  · 어떤 입력에도 던지지 않는다(접근 차단 포함)
 *  · 깨진 값은 **스스로 지운다** — 안 지우면 다음 부팅에서 똑같이 실패한다
 */
import {
  readStoredString,
  readStoredJson,
  writeStoredJson,
  clearStoredAuthState,
} from '../../src/lib/safeLocalStorage';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

// --- 가짜 localStorage ------------------------------------------------------
function installStorage(initial: Record<string, string> = {}, mode: 'ok' | 'throw' = 'ok') {
  const map = new Map(Object.entries(initial));
  const store = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
  };
  const target = mode === 'throw'
    ? { get localStorage(): never { throw new DOMException('Access is denied', 'SecurityError'); } }
    : { localStorage: store };
  (globalThis as Record<string, unknown>).window = target;
  // Object.keys(window.localStorage) 가 동작하도록 실제 키를 프록시로 노출
  if (mode === 'ok') {
    (target as { localStorage: unknown }).localStorage = new Proxy(store, {
      ownKeys: () => [...map.keys()],
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
  }
  return map;
}

// 콘솔 경고를 삼켜 테스트 출력이 지저분해지지 않게 한다
const realWarn = console.warn;
console.warn = () => {};

// --- 정상 경로 --------------------------------------------------------------
installStorage({ a: '"hello"', flag: 'true', obj: '{"x":1}' });
check('문자열 원문 읽기', readStoredString('a') === '"hello"');
check('없는 키는 null', readStoredString('nope') === null);
check('JSON 불리언 읽기', readStoredJson('flag', false) === true);
check('JSON 객체 읽기', JSON.stringify(readStoredJson('obj', {})) === '{"x":1}');
check('없는 키는 fallback', readStoredJson('nope', 'fb') === 'fb');

// --- 깨진 값은 스스로 지운다 (핵심) ----------------------------------------
let map = installStorage({ 'sidebar-expanded': 'undefined' });
check('JSON 이 아니면 fallback', readStoredJson('sidebar-expanded', true) === true);
check('JSON 이 아니면 그 키를 지운다 (재부팅에서 또 터지지 않게)',
  !map.has('sidebar-expanded'));

map = installStorage({ 'sidebar-expanded': '[object Object]' });
check('"[object Object]" 도 안전', readStoredJson('sidebar-expanded', true) === true);
check('"[object Object]" 키도 삭제', !map.has('sidebar-expanded'));

map = installStorage({ 'sidebar-expanded': '' });
check('빈 문자열도 안전', readStoredJson('sidebar-expanded', true) === true);

// --- 모양이 다르면(파싱은 성공) 역시 지운다 --------------------------------
map = installStorage({ 'sidebar-expanded': '"true"' }); // 옛 버전이 문자열로 저장한 경우
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
check('타입이 다르면 fallback', readStoredJson('sidebar-expanded', true, isBool) === true);
check('타입이 다르면 키 삭제', !map.has('sidebar-expanded'));

map = installStorage({ 'sidebar-expanded': 'false' });
check('올바른 타입은 그대로 통과', readStoredJson('sidebar-expanded', true, isBool) === false);
check('올바른 값은 지우지 않는다', map.has('sidebar-expanded'));

// --- 접근 자체가 막힌 경우 (시크릿 창·사이트 데이터 차단) -------------------
installStorage({}, 'throw');
let threw = false;
try {
  check('접근 차단 시 원문은 null', readStoredString('any') === null);
  check('접근 차단 시 JSON 은 fallback', readStoredJson('any', 'fb') === 'fb');
  writeStoredJson('any', { a: 1 });   // 던지면 안 된다
  clearStoredAuthState();             // 던지면 안 된다
} catch {
  threw = true;
}
check('접근이 막혀도 절대 던지지 않는다', !threw);

// --- 로그인 정보만 골라 지운다 ---------------------------------------------
map = installStorage({
  'sb-your-project-ref-auth-token': '{"access_token":"x"}',
  'sb-your-project-ref-auth-token-code-verifier': 'abc',
  'auth_login_timestamp': '1700000000000',
  'gdrive_access_token': 'g',
  'google_token_expiry': '123',
  'privacy_consent_verification': '{}',
  'sidebar-expanded': 'true',
  'task-mywork-expanded-events-v1': '["a"]',
});
const removed = clearStoredAuthState();
check('Supabase 세션 키를 지운다', !map.has('sb-your-project-ref-auth-token'));
check('PKCE verifier 도 지운다', !map.has('sb-your-project-ref-auth-token-code-verifier'));
check('앱 로그인 타임스탬프를 지운다', !map.has('auth_login_timestamp'));
check('구글 토큰을 지운다', !map.has('gdrive_access_token') && !map.has('google_token_expiry'));
check('동의 캐시를 지운다', !map.has('privacy_consent_verification'));
check('무관한 UI 설정은 남긴다 (사이드바)', map.has('sidebar-expanded'));
check('무관한 UI 설정은 남긴다 (업무 펼침)', map.has('task-mywork-expanded-events-v1'));
check('지운 키 목록을 돌려준다', removed.length === 6, `${removed.length}개`);

console.warn = realWarn;
console.log(`${pass} passed, ${fail} failed`);
console.log(fail === 0 ? 'OK' : 'FAILED');
process.exit(fail === 0 ? 0 : 1);
