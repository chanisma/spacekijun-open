/**
 * 모달이 닫힌 뒤 `body` 가 클릭 불가로 갇히는 것을 푸는 안전망.
 *
 * ── 무엇이 잘못될 수 있나 ──────────────────────────────────────────────────
 * Radix 의 `DismissableLayer` 는 모달이 열리면 `document.body.style.pointerEvents`
 * 를 `'none'` 으로 바꾸고, **모듈 스코프 변수** 에 원래 값을 적어 뒀다가 마지막
 * 레이어가 닫힐 때 되돌린다. 상태가 모듈 스코프이므로 **`@radix-ui/react-dismissable-layer`
 * 사본이 둘이면 변수도 둘** 이고, 두 사본은 서로의 레이어를 보지 못한다:
 *
 *   1. Dialog 가 열린다      → 사본① "지금 아무도 없네" → 원본 `''` 저장, body = none
 *   2. AlertDialog 가 열린다 → 사본② "지금 아무도 없네" → 원본 **`'none'`** 저장(오염)
 *   3. 둘이 같이 닫힌다      → 사본①이 `''` 복구 → 사본②가 **`'none'` 으로 되돌림**
 *
 * 마지막에 쓴 쪽이 이겨서 `body { pointer-events: none }` 이 남고, **새로고침 전까지
 * 사이트 전체가 클릭되지 않는다.** 오류도 경고도 없다.
 *
 * ── 진짜 수정은 package.json 의 `overrides` 다 ─────────────────────────────
 * 사본을 하나로 합치는 것이 근본 해결이고, 그 상태는
 * `scripts/modal-layer-test/run.mts` 가 지킨다. 이 파일은 **2차선**이다 —
 * Radix 패키지를 새로 추가하면 의존성이 다시 갈라질 수 있고(사본이 갈라져도
 * 빌드·타입 검사는 통과한다), 애니메이션 도중 강제 언마운트처럼 사본과 무관한
 * 경로도 같은 증상을 만들 수 있다.
 *
 * ── 왜 이렇게 판정하나 ─────────────────────────────────────────────────────
 * "열린 모달이 하나도 없는데 body 가 none" 은 정상 상태가 아니다. 열린 모달은
 * DOM 에 `[role="dialog"|"alertdialog"][data-state="open"]` 로 반드시 남으므로
 * 이것을 세면 된다. 판정을 되돌리는 방향으로만 작동하므로(막지 않고 풀어 주기만
 * 한다) 잘못 발동해도 최악이 "모달 뒤 배경이 클릭된다" 이고, 그마저도 오버레이가
 * 전면을 덮고 있어 실제로는 막힌다. 반대 방향의 실수(정상인데 막아 버리기)는
 * 애초에 불가능하다.
 */

/** 열린 모달을 세는 선택자. Radix 는 열린 콘텐츠에 `data-state="open"` 을 남긴다. */
export const OPEN_MODAL_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

/**
 * 순수 판정 — "지금 body 를 풀어 줘야 하는가".
 *
 * @param bodyPointerEvents `document.body.style.pointerEvents` 의 현재 값
 * @param openModalCount    DOM 에 남아 있는 열린 모달 수
 */
export function shouldReleasePointerEvents(
  bodyPointerEvents: string,
  openModalCount: number,
): boolean {
  return bodyPointerEvents === 'none' && openModalCount === 0;
}

/**
 * Radix 의 닫기 애니메이션(기본 200ms)이 끝나기를 기다렸다가 검사한다.
 * 너무 짧으면 아직 사라지는 중인 모달을 "없다" 로 세어 헛발동하고,
 * 너무 길면 사용자가 클릭이 죽었다고 느끼는 시간이 길어진다.
 */
const SETTLE_MS = 350;

/**
 * 안전망을 설치한다(앱 진입점에서 1회). 해제 함수를 돌려준다.
 *
 * `body` 의 `style` 속성 변화를 관찰한다 — 갇히는 순간은 언제나 "누군가 body 의
 * style 에 마지막으로 `none` 을 쓴 직후" 이므로, 폴링 없이 그 시점만 잡으면 된다.
 */
export function installModalPointerEventsGuard(): () => void {
  if (typeof document === 'undefined') return () => {};

  const body = document.body;
  let timer: number | null = null;

  const check = () => {
    timer = null;
    const openModals = document.querySelectorAll(OPEN_MODAL_SELECTOR).length;
    if (!shouldReleasePointerEvents(body.style.pointerEvents, openModals)) return;

    body.style.removeProperty('pointer-events');
    // 조용히 고치면 원인을 영영 못 찾는다. 이것이 보이면 사본이 갈라진 것이므로
    // `npx tsx scripts/modal-layer-test/run.mts` 로 확인할 것.
    console.warn(
      '[modal] 열린 모달이 없는데 body 가 pointer-events:none 이라 해제했습니다. ' +
      'Radix 레이어 모듈 사본이 갈라졌을 수 있습니다 — scripts/modal-layer-test 를 확인하세요.',
    );
  };

  const observer = new MutationObserver(() => {
    // 애니메이션이 끝난 뒤 한 번만 본다(연속 변경은 마지막 것으로 합친다)
    if (body.style.pointerEvents !== 'none') return;
    if (timer != null) window.clearTimeout(timer);
    timer = window.setTimeout(check, SETTLE_MS);
  });

  observer.observe(body, { attributes: true, attributeFilter: ['style'] });

  return () => {
    observer.disconnect();
    if (timer != null) window.clearTimeout(timer);
  };
}
