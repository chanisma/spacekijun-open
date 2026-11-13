/**
 * 브라우저 알림 회귀 — `npx tsx --tsconfig tsconfig.app.json scripts/browser-notification-test/run.mts`
 *
 * (`--tsconfig` 를 빠뜨리면 `@/` 별칭이 해석되지 않는다 — 루트 tsconfig 는 solution 파일이다.)
 *
 * ## 왜 이 기능에 회귀가 필요한가
 * 브라우저 알림이 깨지는 방식은 거의 전부 **조용하다**. 예외도 안 나고 화면도 멀쩡한데
 * 알림만 오지 않아, 알림이 원래 뜸하게 오는 기능이라 며칠 뒤에야 눈치챈다. 특히:
 *
 *  1. **표시 경로 순서** — 안드로이드 크롬은 `new Notification()` 이 `TypeError` 다.
 *     서비스 워커를 먼저 쓰지 않으면 **데스크톱에서는 멀쩡하고 휴대폰에서만** 죽는다.
 *     정작 이 기능을 만든 이유가 휴대폰인데, 개발은 데스크톱에서 한다.
 *  2. **클릭 메시지 타입 문자열** — `public/sw.js` 와 `src/lib/browserNotifications.ts`
 *     두 파일이 같은 문자열을 각자 들고 있다. 갈라지면 알림은 뜨는데 눌러도 아무 일이
 *     없다(그 상태에서 오류는 어디에도 안 남는다).
 *  3. **브리지 중복 마운트** — 마운트 개수만큼 realtime 채널이 열려 같은 알림이 여러 번
 *     소리를 낸다. `tag` 병합은 화면만 합칠 뿐이라 눈으로는 한 개로 보인다.
 *  4. **서비스 워커의 fetch 핸들러** — 실수로 추가되면 네트워크를 가로채기 시작해
 *     배포된 새 번들 대신 낡은 자산이 나간다. 알림과 무관한 사고가 알림 코드에서 난다.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass += 1;
    return;
  }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

// --- 가짜 브라우저 ----------------------------------------------------------

interface ShownNotification {
  title: string;
  options: Record<string, unknown>;
}

interface FakeEnv {
  swShown: ShownNotification[];
  ctorShown: ShownNotification[];
  /** 마지막으로 만든 생성자 알림 — onclick 배선을 확인하는 데 쓴다. */
  lastCtorInstance: { onclick: (() => void) | null; closed: boolean } | null;
  registerCalls: number;
  storage: Map<string, string>;
  windowFocused: number;
}

interface EnvOptions {
  /** `'Notification' in window` 여부. iOS 일반 탭은 false 다. */
  hasNotification?: boolean;
  permission?: NotificationPermission;
  userAgent?: string;
  /** 홈 화면에 설치된 PWA 로 실행 중인가. */
  standalone?: boolean;
  serviceWorker?: 'ok' | 'register-fails' | 'show-fails' | 'absent';
  constructorThrows?: boolean;
  storage?: Record<string, string>;
  maxTouchPoints?: number;
}

function setupEnv(options: EnvOptions = {}): FakeEnv {
  const {
    hasNotification = true,
    permission = 'granted',
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126',
    standalone = false,
    serviceWorker = 'ok',
    constructorThrows = false,
    storage = {},
    maxTouchPoints = 0,
  } = options;

  const env: FakeEnv = {
    swShown: [],
    ctorShown: [],
    lastCtorInstance: null,
    registerCalls: 0,
    storage: new Map(Object.entries(storage)),
    windowFocused: 0,
  };

  const localStorageStub = {
    getItem: (k: string) => (env.storage.has(k) ? env.storage.get(k)! : null),
    setItem: (k: string, v: string) => {
      env.storage.set(k, v);
    },
    removeItem: (k: string) => {
      env.storage.delete(k);
    },
  };

  class FakeNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = async () => FakeNotification.permission;
    onclick: (() => void) | null = null;
    closed = false;
    constructor(title: string, opts: Record<string, unknown>) {
      if (constructorThrows) throw new TypeError('Illegal constructor');
      env.ctorShown.push({ title, options: opts });
      env.lastCtorInstance = this;
    }
    close() {
      this.closed = true;
    }
  }

  const registration = {
    showNotification: async (title: string, opts: Record<string, unknown>) => {
      if (serviceWorker === 'show-fails') throw new Error('showNotification 실패');
      env.swShown.push({ title, options: opts });
    },
  };

  const serviceWorkerStub = {
    register: async () => {
      env.registerCalls += 1;
      if (serviceWorker === 'register-fails') throw new Error('등록 실패');
      return registration;
    },
    get ready() {
      return Promise.resolve(registration);
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const navigatorStub: Record<string, unknown> = { userAgent, maxTouchPoints };
  if (serviceWorker !== 'absent') navigatorStub.serviceWorker = serviceWorkerStub;
  if (standalone) navigatorStub.standalone = true;

  const windowStub: Record<string, unknown> = {
    localStorage: localStorageStub,
    navigator: navigatorStub,
    matchMedia: (query: string) => ({ matches: standalone && query.includes('standalone') }),
    focus: () => {
      env.windowFocused += 1;
    },
  };
  if (hasNotification) windowStub.Notification = FakeNotification;

  const define = (key: string, value: unknown) =>
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

  define('window', windowStub);
  define('navigator', navigatorStub);
  define('document', { visibilityState: 'hidden', hasFocus: () => false });
  if (hasNotification) define('Notification', FakeNotification);
  else define('Notification', undefined);

  return env;
}

/**
 * 모듈을 **새 인스턴스로** 불러온다. `browserNotifications` 는 서비스 워커 등록 결과를
 * 모듈 스코프에 기억하므로, 시나리오마다 새로 받지 않으면 앞 시나리오의 등록이 남는다.
 * (제품 코드에 테스트 전용 reset 을 뚫지 않기 위한 방법이다.)
 */
let moduleVersion = 0;
async function freshLib() {
  moduleVersion += 1;
  return (await import(`../../src/lib/browserNotifications.ts?v=${moduleVersion}`)) as typeof import(
    '../../src/lib/browserNotifications'
  );
}

// --- A. 지원 판정 -----------------------------------------------------------

{
  setupEnv({ hasNotification: false, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' });
  const lib = await freshLib();
  const support = lib.getBrowserNotificationSupport();
  check('iOS 일반 탭 = 미지원', support.supported === false);
  check(
    'iOS 일반 탭 안내에 설치 방법이 있다',
    (support.message ?? '').includes('홈 화면'),
    // 여기서 "지원하지 않습니다"로 끝내면 사용자가 할 수 있는 일이 없다.
    support.message ?? '(null)',
  );
}

{
  setupEnv({
    hasNotification: false,
    userAgent: 'Mozilla/5.0 (Macintosh)',
    maxTouchPoints: 5,
  });
  const lib = await freshLib();
  check(
    'iPadOS 데스크톱 UA 도 iOS 로 잡는다',
    (lib.getBrowserNotificationSupport().message ?? '').includes('홈 화면'),
  );
}

{
  setupEnv({ hasNotification: false, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/126' });
  const lib = await freshLib();
  const support = lib.getBrowserNotificationSupport();
  check('데스크톱 미지원 안내는 설치 얘기를 하지 않는다', !(support.message ?? '').includes('홈 화면'));
  check('미지원이면 permission 은 unsupported', lib.getBrowserNotificationPermission() === 'unsupported');
}

{
  setupEnv({ hasNotification: true, permission: 'default' });
  const lib = await freshLib();
  const support = lib.getBrowserNotificationSupport();
  check('지원되면 supported=true', support.supported === true);
  check('지원되면 안내 문구가 없다', support.message === null);
  check('권한 미결정은 default', lib.getBrowserNotificationPermission() === 'default');
}

// --- B. 표시 경로 (안드로이드 회귀의 핵심) -----------------------------------

{
  const env = setupEnv({ serviceWorker: 'ok' });
  const lib = await freshLib();
  const via = await lib.showBrowserNotification({ title: '제목', body: '내용' });
  check('서비스 워커가 있으면 서비스 워커로 띄운다', via === 'service-worker', via);
  check('서비스 워커 경로에서 알림이 실제로 표시됐다', env.swShown.length === 1);
  check(
    '서비스 워커 경로에서는 생성자를 부르지 않는다',
    env.ctorShown.length === 0,
    // 순서가 뒤집히면 안드로이드에서만 죽고 데스크톱은 멀쩡하다.
    `생성자 호출 ${env.ctorShown.length}회`,
  );
}

{
  const env = setupEnv({ serviceWorker: 'absent' });
  const lib = await freshLib();
  const via = await lib.showBrowserNotification({ title: '제목' });
  check('서비스 워커가 없으면 생성자로 후퇴한다', via === 'constructor', via);
  check('생성자 경로에서 알림이 표시됐다', env.ctorShown.length === 1);
}

{
  const env = setupEnv({ serviceWorker: 'register-fails' });
  const lib = await freshLib();
  const via = await lib.showBrowserNotification({ title: '제목' });
  check('워커 등록이 실패해도 알림은 뜬다', via === 'constructor', via);
  check('등록 실패 시 생성자가 쓰였다', env.ctorShown.length === 1);
}

{
  const env = setupEnv({ serviceWorker: 'show-fails' });
  const lib = await freshLib();
  const via = await lib.showBrowserNotification({ title: '제목' });
  check('워커 표시가 실패해도 생성자로 후퇴한다', via === 'constructor', via);
  check('표시 실패 시 생성자가 쓰였다', env.ctorShown.length === 1);
}

{
  const env = setupEnv({ serviceWorker: 'absent', constructorThrows: true });
  const lib = await freshLib();
  let threw = false;
  let via: string | undefined;
  try {
    via = await lib.showBrowserNotification({ title: '제목' });
  } catch {
    threw = true;
  }
  // 알림을 못 띄운 것이 앱을 멈출 이유는 없다.
  check('모든 경로가 실패해도 예외를 전파하지 않는다', !threw);
  check('모두 실패하면 failed 를 돌려준다', via === 'failed', String(via));
  check('실패했으므로 표시된 알림이 없다', env.ctorShown.length === 0 && env.swShown.length === 0);
}

{
  const env = setupEnv({ permission: 'denied' });
  const lib = await freshLib();
  const via = await lib.showBrowserNotification({ title: '제목' });
  check('권한이 없으면 아무것도 띄우지 않는다', via === 'failed', via);
  check('권한이 없으면 서비스 워커를 등록조차 하지 않는다', env.registerCalls === 0);
}

// --- C. 페이로드 ------------------------------------------------------------

{
  const env = setupEnv({ serviceWorker: 'ok' });
  const lib = await freshLib();
  await lib.showBrowserNotification({
    title: '새 업무',
    body: '내용',
    tag: 'notification-abc',
    destination: { to: '/tasks', state: { taskId: 'abc' } },
  });
  const opts = env.swShown[0]?.options ?? {};
  check('tag 가 전달된다 (다중 탭 중복 병합의 근거)', opts.tag === 'notification-abc');
  check('body 가 전달된다', opts.body === '내용');
  check('아이콘이 설정된다', typeof opts.icon === 'string' && (opts.icon as string).length > 0);
  const data = opts.data as { destination?: { to?: string; state?: Record<string, unknown> } };
  check('목적지가 data 로 전달된다 (클릭 이동의 유일한 근거)', data?.destination?.to === '/tasks');
  check('react-router state 도 함께 실린다', data?.destination?.state?.taskId === 'abc');
}

{
  const env = setupEnv({ serviceWorker: 'absent' });
  const lib = await freshLib();
  let clicked: unknown = 'not-called';
  await lib.showBrowserNotification({
    title: '제목',
    destination: { to: '/signatures' },
    onClick: (destination) => {
      clicked = destination;
    },
  });
  env.lastCtorInstance?.onclick?.();
  check(
    '생성자 알림 클릭이 목적지와 함께 콜백을 부른다',
    (clicked as { to?: string })?.to === '/signatures',
    JSON.stringify(clicked),
  );
  check('클릭하면 창에 포커스를 준다', env.windowFocused === 1);
  check('클릭하면 알림을 닫는다', env.lastCtorInstance?.closed === true);
}

// --- D. 사용자 설정 ---------------------------------------------------------

{
  setupEnv();
  const lib = await freshLib();
  // 권한을 일부러 허용한 사람이 원하는 상태는 "받겠다"이다.
  check('설정 기본값은 켜짐', lib.isBrowserNotificationEnabled() === true);

  lib.setBrowserNotificationEnabled(false);
  check('끄면 꺼진 상태로 읽힌다', lib.isBrowserNotificationEnabled() === false);

  lib.setBrowserNotificationEnabled(true);
  check('다시 켜면 켜진 상태로 읽힌다', lib.isBrowserNotificationEnabled() === true);
}

{
  setupEnv({ storage: { 'spacekijun-browser-notifications-v1': '{깨진 값' } });
  const lib = await freshLib();
  check('저장값이 깨져 있으면 기본값으로 자가 치유한다', lib.isBrowserNotificationEnabled() === true);
}

{
  setupEnv({ storage: { 'spacekijun-browser-notifications-v1': '"yes"' } });
  const lib = await freshLib();
  // 파싱은 성공하지만 모양이 다른 값(옛 버전이 남긴 값 등)도 걸러야 한다.
  check('저장값 모양이 다르면 기본값으로 돌아간다', lib.isBrowserNotificationEnabled() === true);
}

// 진리표: 실제로 알림이 뜨려면 권한 ∧ 설정 둘 다여야 한다.
for (const permission of ['granted', 'denied'] as const) {
  for (const enabled of [true, false]) {
    setupEnv({ permission, storage: { 'spacekijun-browser-notifications-v1': String(enabled) } });
    const lib = await freshLib();
    const expected = permission === 'granted' && enabled;
    check(
      `표시 여부: 권한=${permission} 설정=${enabled} → ${expected}`,
      lib.shouldShowBrowserNotifications() === expected,
    );
  }
}

// --- E. 소스 규약 (정적) ----------------------------------------------------

const swSource = readFileSync(resolve(ROOT, 'public/sw.js'), 'utf8');
const libSource = readFileSync(resolve(ROOT, 'src/lib/browserNotifications.ts'), 'utf8');
const appSource = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8');
const hookSource = readFileSync(resolve(ROOT, 'src/hooks/useBrowserNotifications.ts'), 'utf8');

check('서비스 워커에 notificationclick 핸들러가 있다', swSource.includes("'notificationclick'"));

check(
  '서비스 워커가 fetch 를 가로채지 않는다',
  !/addEventListener\(\s*['"]fetch['"]/.test(swSource),
  // 캐싱을 시작하면 배포한 새 번들 대신 낡은 자산이 나간다.
  'sw.js 에 fetch 핸들러가 생겼다',
);

{
  // 두 파일이 같은 문자열을 각자 들고 있다. 갈라지면 알림은 뜨는데 눌러도 아무 일이 없다.
  const libMessageType = libSource.match(/NOTIFICATION_CLICK_MESSAGE\s*=\s*'([^']+)'/)?.[1];
  check('lib 에서 클릭 메시지 타입을 읽을 수 있다', !!libMessageType, String(libMessageType));
  check(
    '서비스 워커와 lib 의 클릭 메시지 타입이 같다',
    !!libMessageType && swSource.includes(libMessageType),
    String(libMessageType),
  );
}

{
  const mounts = appSource.match(/<BrowserNotificationBridge\s*\/>/g)?.length ?? 0;
  check(
    '브리지는 App 에 정확히 한 번 마운트된다',
    mounts === 1,
    // 개수만큼 realtime 채널이 열려 같은 알림이 여러 번 소리를 낸다.
    `${mounts}회`,
  );
}

check(
  '구독이 내 resource_id 로 서버에서 걸러진다',
  hookSource.includes('resource_id=eq.'),
  // 보안은 RLS 가 맡지만, 필터가 없으면 남의 알림까지 브로드캐스트로 받아 버린다.
);

check(
  '구독 테이블이 notification_events 다',
  hookSource.includes("table: 'notification_events'"),
);

check(
  '이펙트가 resourceId 에만 의존한다 (매 렌더 재구독 방지)',
  /\}, \[resourceId\]\);/.test(hookSource),
  // 의존성이 매 렌더 바뀌면 채널을 다시 열고, 그 사이 도착한 알림이 유실된다.
);

// --- 결과 ------------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
