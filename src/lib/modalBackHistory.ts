/**
 * 휴대폰 뒤로가기 = 맨 위 모달 닫기 (2026-09-22).
 *
 * ── 무엇을 하나 ────────────────────────────────────────────────────────────
 * 모달이 열리면 **URL 이 같은** 기록 항목을 하나 쌓는다(`history.pushState`).
 * 그러면 휴대폰의 뒤로가기(안드로이드 버튼·제스처, iOS 스와이프)는 이전 페이지가
 * 아니라 그 항목을 꺼내고, 우리는 그 신호를 받아 **맨 위 모달만** 닫는다.
 * 기록 항목은 모달을 가리키지 않는다 — **깊이 표시**일 뿐이다(`__modalDepth: n`).
 *
 * ── 규칙은 하나뿐이다: "기록 깊이 = 열린 모달 수" ───────────────────────────
 * 모든 경우를 따로 처리하지 않고, 무슨 일이 생기면 `reconcile()` 이 둘을 맞춘다.
 *   - 모달이 열림            → 깊이가 모자라다 → push
 *   - X·Esc·저장으로 닫힘    → 깊이가 남는다   → `history.go(-n)` 으로 되돌림
 *   - 뒤로가기               → 깊이가 줄었다   → 넘치는 모달에 닫기 요청
 *   - 닫기를 거부(저장 중 등) → 깊이가 모자라다 → 다시 push (뒤로가기가 흡수된다)
 *   - 모달 A 닫고 B 열기(한 틱) → 깊이 불변    → **기록을 건드리지 않는다**
 *   - 모달 안에서 다른 화면으로 이동 → 남은 항목은 고아 → 거기 닿으면 한 칸 더 뒤로
 * 깊이 표시만 쌓기 때문에 "형제 모달로 갈아타기"(`SpecSubmissionComposerDialog`
 * 패턴)가 공짜로 된다 — 항목에 모달 id 를 적었다면 매번 back + push 가 필요했다.
 *
 * ── 라우터에게는 보이지 않게 한다 ──────────────────────────────────────────
 * 우리 항목은 바로 아래 항목의 `history.state`(react-router 의 `usr`·`key`·`idx`)를
 * 그대로 복사한다. 그래서 둘 사이의 popstate 는 라우터가 받아도 **값이 같은 위치**를
 * 계산할 뿐이지만, 받게 두면 새 location 객체가 만들어져 `useSearchParams` 값이
 * 바뀐 것처럼 보인다 — `?task=id` 로 모달을 여는 화면은 **뒤로가기로 닫자마자
 * 그 effect 가 다시 돌아 모달을 되연다**. 그래서 라우터가 볼 위치가 지금과 값까지
 * 같을 때만 `stopImmediatePropagation()` 으로 삼킨다(캡처 단계 · 앱 시작 시 등록이라
 * 라우터 리스너보다 먼저 받는다). URL 이 바뀌는 popstate 는 절대 삼키지 않는다.
 *
 * ── 조용히 틀리는 자리 ──────────────────────────────────────────────────────
 * ① `history.go()` 는 비동기다. 그 사이 push 하면 순서가 브라우저마다 다르다 →
 *    되돌리는 중(`pending`)에는 아무것도 하지 않고 popstate 를 기다린다.
 * ② 뒤로가기로 닫기를 요청해도 소비처가 거부할 수 있다(`onOpenChange` 가드,
 *    `onEscapeKeyDown` 에서 preventDefault). 닫혔다고 가정하고 기록을 버리면
 *    **다음 뒤로가기가 페이지를 떠난다**(작성 중이던 내용 유실) → 렌더 뒤 다시 맞춘다.
 * ③ 새로고침하면 `history.state` 의 깊이 표시가 남는다. 되돌리면 이전 문서로
 *    가는 전체 페이지 로드가 되므로 시작할 때 **지운다**(`replaceState`).
 * ④ 크롬은 사용자 조작 없이 쌓인 기록을 뒤로가기 버튼이 건너뛴다(history
 *    manipulation intervention). 딥링크로 **자동으로 열린** 모달은 뒤로가기가
 *    종전처럼 이전 페이지로 갈 수 있다 — 우리가 막을 수 있는 것이 아니다.
 *
 * 대상은 **터치가 주 입력인 기기**(`pointer: coarse` — 휴대폰·태블릿)뿐이다.
 * 데스크톱의 뒤로가기는 종전 그대로 페이지를 이동한다(요청 범위 = 모바일).
 *
 * 단일 출처 — React 쪽 연결은 `components/ui/modal-back.tsx`, 라우터 동기화는
 * `ModalBackRouterSync`, 회귀는 `scripts/modal-back-test/run.mts`.
 */

/** 우리 기록 항목을 알아보는 표시. 값 = 이 항목이 나타내는 모달 깊이(1부터). */
export const MODAL_DEPTH_KEY = '__modalDepth';

/** 되돌리기(`history.go`)가 끝나기를 기다리는 최대 시간. 넘으면 기다림을 푼다. */
const PENDING_TIMEOUT_MS = 1000;

export interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
  go(delta: number): void;
}

export interface PopStateEventLike {
  stopImmediatePropagation(): void;
}

/** 브라우저 의존부. 앱은 `window` 를, 회귀는 가짜 세션 기록을 넣는다. */
export interface ModalBackEnv {
  history: HistoryLike;
  /** 지금 URL 의 pathname + search + hash */
  currentPath(): string;
  /** popstate 를 **캡처 단계**로 구독한다. 해제 함수를 돌려준다. */
  addPopStateListener(listener: (event: PopStateEventLike) => void): () => void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  queueMicrotask(fn: () => void): void;
  /** 이 기기에서 기능을 켤 것인가 — 모달이 **열리는 순간** 판정한다. */
  isEnabled(): boolean;
}

export interface ModalBackRegistration {
  /** 모달 인스턴스 id(`nextModalBackId()`). 렌더 중에 정해져 있어야 안쪽 모달이 부모로 가리킬 수 있다. */
  id: number;
  /** 바깥 모달의 id. 동시에 열릴 때 안쪽이 먼저 등록돼도 순서를 바로잡는다. */
  parentId: number | null;
  /** 뒤로가기로 닫아 달라는 요청. 거부해도 된다(그러면 기록을 다시 쌓는다). */
  requestClose: () => void;
}

type Entry = ModalBackRegistration;

type RouterLocation = { path: string; key: string };

type StateObject = Record<string, unknown>;

const asObject = (state: unknown): StateObject =>
  state && typeof state === 'object' ? (state as StateObject) : {};

/** 이 기록 항목이 나타내는 모달 깊이. 우리 항목이 아니면 0. */
export function readModalDepth(state: unknown): number {
  const depth = asObject(state)[MODAL_DEPTH_KEY];
  return typeof depth === 'number' && Number.isInteger(depth) && depth > 0 ? depth : 0;
}

/** react-router 가 이 항목에 붙인 key. 첫 항목은 key 가 없어 라우터도 'default' 로 읽는다. */
export function readRouterKey(state: unknown): string {
  const key = asObject(state).key;
  return typeof key === 'string' ? key : 'default';
}

export function withModalDepth(state: unknown, depth: number): StateObject {
  return { ...asObject(state), [MODAL_DEPTH_KEY]: depth };
}

export function withoutModalDepth(state: unknown): StateObject {
  const { [MODAL_DEPTH_KEY]: _removed, ...rest } = asObject(state);
  return rest;
}

export interface ModalBackHistory {
  /** 열린 모달을 등록한다. 기능이 꺼진 기기면 false(아무것도 하지 않는다). */
  register(registration: ModalBackRegistration): boolean;
  unregister(id: number): void;
  /** 라우터가 지금 그리고 있는 위치. `ModalBackRouterSync` 가 알려 준다. */
  noteRouterLocation(path: string, key: string): void;
  /** popstate 구독을 시작하고 새로고침으로 남은 깊이 표시를 지운다. 해제 함수를 돌려준다. */
  install(): () => void;
  /** 회귀·진단용 — 지금 열린(등록된) 모달 수 */
  readonly openCount: number;
}

export function createModalBackHistory(env: ModalBackEnv): ModalBackHistory {
  let stack: Entry[] = [];
  let routerLocation: RouterLocation | null = null;
  /** 마지막으로 확인한 현재 항목의 깊이 — popstate 가 "우리 항목에서/으로" 인지 가른다 */
  let lastDepth = readModalDepth(env.history.state);
  let pending = false;
  let pendingTimer: unknown = null;
  let microtaskQueued = false;

  const clearPending = () => {
    pending = false;
    if (pendingTimer != null) env.clearTimeout(pendingTimer);
    pendingTimer = null;
  };

  function reconcile() {
    if (pending) return; // ① 되돌리는 중 — popstate 가 오면 다시 부른다
    const current = readModalDepth(env.history.state);
    const want = stack.length;
    lastDepth = current;
    if (want > current) {
      for (let depth = current + 1; depth <= want; depth += 1) {
        env.history.pushState(withModalDepth(env.history.state, depth), '');
      }
      lastDepth = want;
    } else if (want < current) {
      pending = true;
      // popstate 가 끝내 안 오면(브라우저 이상) 기다림만 푼다. 자동 재시도는 하지 않는다 —
      // 재시도가 또 실패하면 1초마다 go() 를 부르는 고리가 된다.
      pendingTimer = env.setTimeout(clearPending, PENDING_TIMEOUT_MS);
      env.history.go(want - current);
    }
  }

  const scheduleReconcile = () => {
    if (microtaskQueued) return;
    microtaskQueued = true;
    env.queueMicrotask(() => {
      microtaskQueued = false;
      reconcile();
    });
  };

  function onPopState(event: PopStateEventLike) {
    const depth = readModalDepth(env.history.state);
    const touchesOurEntry = depth > 0 || lastDepth > 0;
    const routerWouldNotMove = routerLocation != null
      && routerLocation.path === env.currentPath()
      && routerLocation.key === readRouterKey(env.history.state);
    if (touchesOurEntry && routerWouldNotMove) event.stopImmediatePropagation();

    lastDepth = depth;
    // 우리가 부른 go() 의 도착인가. 그렇다면 **아무것도 닫지 않는다** — 되돌리는 사이
    // 새 모달이 열렸을 수 있고(닫고 곧바로 다른 모달 열기), 그 모달은 이 깊이 위에
    // 있지만 사용자는 뒤로가기를 누른 적이 없다. 부족한 깊이는 아래 reconcile 이 쌓는다.
    const oursArrived = pending;
    clearPending();

    if (!oursArrived) {
      // 사용자의 뒤로가기 — 이 깊이보다 위에 있던 모달을 맨 위부터 닫는다(보통 하나)
      const above = stack.slice(depth);
      for (let index = above.length - 1; index >= 0; index -= 1) {
        try {
          above[index].requestClose();
        } catch (error) {
          console.error('[modal-back] 닫기 요청 실패', error);
        }
      }
    }
    // ② 닫기가 렌더를 거쳐 등록 해제로 이어진 **뒤에** 맞춘다. 거부했다면 여기서 다시 쌓인다.
    env.setTimeout(reconcile, 0);
  }

  return {
    register(entry) {
      if (!env.isEnabled()) return false;
      if (stack.some((item) => item.id === entry.id)) return true;
      // 바깥과 안쪽이 함께 열리면 React 가 안쪽 effect 를 먼저 돌린다.
      // 안쪽(나를 부모로 가리키는 항목) 앞에 끼워 "맨 위 = 안쪽"을 지킨다.
      const childIndex = stack.findIndex((item) => item.parentId === entry.id);
      const next = [...stack];
      next.splice(childIndex < 0 ? next.length : childIndex, 0, entry);
      stack = next;
      scheduleReconcile();
      return true;
    },
    unregister(id) {
      const next = stack.filter((item) => item.id !== id);
      if (next.length === stack.length) return;
      stack = next;
      scheduleReconcile();
    },
    noteRouterLocation(path, key) {
      routerLocation = { path, key };
      // 라우터의 replace 가 우리 항목을 덮어 깊이 표시가 사라졌을 수 있다 → 다시 맞춘다
      scheduleReconcile();
    },
    install() {
      // ③ 새로고침으로 남은 깊이 표시 — 되돌리지 말고 지운다
      if (readModalDepth(env.history.state) > 0) {
        env.history.replaceState(withoutModalDepth(env.history.state), '');
      }
      lastDepth = 0;
      return env.addPopStateListener(onPopState);
    },
    get openCount() {
      return stack.length;
    },
  };
}

// ── 앱 싱글턴 ────────────────────────────────────────────────────────────────

const TOUCH_PRIMARY_QUERY = '(pointer: coarse)';

/** 휴대폰·태블릿처럼 터치가 주 입력인가. 터치스크린 노트북(주 입력 = 마우스)은 제외. */
export function isTouchPrimaryDevice(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(TOUCH_PRIMARY_QUERY).matches;
}

let lastModalId = 0;

/** 모달 인스턴스 id 를 하나 발급한다(렌더 중 `useState` 초깃값으로 쓴다). */
export function nextModalBackId(): number {
  lastModalId += 1;
  return lastModalId;
}

let singleton: ModalBackHistory | null = null;

export function getModalBackHistory(): ModalBackHistory | null {
  if (singleton) return singleton;
  if (typeof window === 'undefined' || typeof window.history?.pushState !== 'function') return null;
  singleton = createModalBackHistory({
    history: window.history,
    currentPath: () => `${window.location.pathname}${window.location.search}${window.location.hash}`,
    addPopStateListener: (listener) => {
      const handler = (event: PopStateEvent) => listener(event);
      window.addEventListener('popstate', handler, { capture: true });
      return () => window.removeEventListener('popstate', handler, { capture: true });
    },
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    queueMicrotask: (fn) => window.queueMicrotask(fn),
    isEnabled: isTouchPrimaryDevice,
  });
  return singleton;
}

let uninstall: (() => void) | null = null;

/**
 * 앱 진입점(`main.tsx`)에서 **React 렌더 전에** 1회 설치한다 — 라우터보다 먼저
 * popstate 를 받아야 삼킬 수 있다(캡처 단계라 순서가 뒤여도 먼저 받지만, 캡처/버블
 * 순서를 다르게 처리했던 구형 사파리까지 확실히 하려고 등록 자체를 먼저 한다).
 */
export function installModalBackHistory(): () => void {
  if (uninstall) return uninstall;
  const manager = getModalBackHistory();
  if (!manager) return () => {};
  const dispose = manager.install();
  uninstall = () => {
    dispose();
    uninstall = null;
  };
  return uninstall;
}
