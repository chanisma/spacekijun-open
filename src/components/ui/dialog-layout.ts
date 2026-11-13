/** Keep sizing/position on the surface; scroll/layout/padding belong to its viewport. */
export function splitDialogClasses(className = '') {
  const surface: string[] = [];
  const viewport: string[] = [];
  for (const token of className.split(/\s+/).filter(Boolean)) {
    // Arbitrary descendant selectors must still target the outer close button, etc.
    if (token.startsWith('[')) { surface.push(token); continue; }
    const utility = token.slice(token.lastIndexOf(':') + 1);
    if (/^(?:!?p[xytrblse]?-|gap(?:-[xy])?-|space-[xy]-|overflow(?:-[xy])?-|grid(?:-|$)|flex(?:-|$)|items-|justify-|content-)/.test(utility)) viewport.push(token);
    else surface.push(token);
  }
  return { surface: surface.join(' '), viewport: viewport.join(' '),
    customPadding: viewport.some((token) => /(?:^|:)!?p[xytrblse]?-/.test(token)) };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 휴대폰에서 어떤 모양으로 뜰지 (2026-09-20)
 *
 * 사용자 규칙: **입력 한두 개짜리 모달은 지금처럼 가운데 떠도 괜찮고, 내용이
 * 복잡하면 화면을 통째로 쓰는 편이 낫다.** 문제는 "복잡한가"를 화면마다 사람이
 * 다시 판단하면 70개 모달이 제각각이 된다는 것이다.
 *
 * 그래서 **작성자가 이미 선언해 둔 데스크톱 크기에서 유도**한다 — 모달에
 * `max-w-2xl`·`max-h-[90vh]` 를 준 사람은 그때 이미 "내용이 많다"고 말한 것이다.
 * 이 함수가 그 선언을 읽어 `fullscreen`/`center` 를 정하고, 유도가 틀리는
 * 몇 곳만 `mobile` prop 으로 못 박는다(= 목록을 손으로 관리하지 않는다).
 *
 * ⚠️ 판정 입력은 **호출부가 넘긴 className 뿐**이다. `DialogContent` 기본값의
 * `max-w-lg` 를 세면 className 없는 모달까지 전부 전체화면이 된다.
 * ──────────────────────────────────────────────────────────────────────────── */

export type MobileDialogPresentation = 'center' | 'sheet' | 'fullscreen';

/**
 * CSS 와 JS 가 같은 값을 써야 하는 경계.
 *
 * `modal.css` 의 미디어 쿼리와 `useIsMobileModal()` 이 여기서 갈린다. 두 값이
 * 어긋나면 **JS 는 시트로 그리는데 CSS 는 가운데 모달로 배치**하는(또는 그 반대)
 * 상태가 되는데, 오류가 나지 않고 화면만 이상해진다 → 회귀가 일치를 검사한다.
 *
 * 640px 을 고른 이유: 저장소의 기존 `sm:max-w-*` 가 전부 이 경계에서 켜진다.
 * 즉 640 미만에서는 그 선언들이 애초에 적용되지 않아 규칙이 충돌하지 않는다.
 */
export const MOBILE_MODAL_BREAKPOINT = 640;

/** Tailwind 기본 `max-w-*` 스케일(px). */
const NAMED_MAX_WIDTHS: Record<string, number> = {
  xs: 320, sm: 384, md: 448, lg: 512, xl: 576,
  '2xl': 672, '3xl': 768, '4xl': 896, '5xl': 1024,
  '6xl': 1152, '7xl': 1280, prose: 656,
  none: Number.POSITIVE_INFINITY, full: Number.POSITIVE_INFINITY, screen: Number.POSITIVE_INFINITY,
};

/** 이 폭(= `max-w-lg`) 이상을 선언했으면 "내용이 많다"로 읽는다. */
const WIDE_ENOUGH_PX = 512;
/** 이 세로 비율(vh/dvh) 이상을 선언했으면 "이미 화면을 거의 다 쓴다"로 읽는다. */
const TALL_ENOUGH_PCT = 80;
/** 고정 높이(px)로 선언한 경우의 같은 기준 — 휴대폰 세로 뷰포트가 대개 600~900px. */
const TALL_ENOUGH_PX = 520;

/** `[600px]` `[90vh]` `[92dvh]` 처럼 **단위 하나짜리** 임의값만 읽는다. */
function parseArbitrarySize(value: string): { px?: number; pct?: number } | null {
  const match = /^\[(\d+(?:\.\d+)?)(px|rem|em|vw|vh|dvh|svh|lvh)\]$/.exec(value);
  if (!match) return null;            // `[calc(100vw-2rem)]` 같은 식은 크기 선언이 아니다
  const amount = Number(match[1]);
  if (match[2] === 'px') return { px: amount };
  if (match[2] === 'rem' || match[2] === 'em') return { px: amount * 16 };
  return { pct: amount };
}

/**
 * 모달의 휴대폰 표시 방식을 정한다.
 *
 * @param className 호출부가 `DialogContent` 에 넘긴 클래스(런타임에 이미 합쳐진 문자열)
 * @param explicit  `mobile` prop. `'auto'`/undefined 면 유도한다
 */
export function resolveMobilePresentation(
  className = '',
  explicit?: MobileDialogPresentation | 'auto',
): MobileDialogPresentation {
  if (explicit && explicit !== 'auto') return explicit;

  for (const raw of className.split(/\s+/).filter(Boolean)) {
    // 변형 접두(`sm:`·`data-[state=open]:`)를 떼고 마지막 유틸리티만 본다.
    // `sm:max-w-3xl` 도 세는 이유: 640 미만에서 적용되지 않더라도 **작성자가 선언한
    // 내용량**은 같다(모바일 전용으로 작게 만든 모달이 아니다).
    const token = raw.slice(raw.lastIndexOf(':') + 1).replace(/^!/, '');

    const width = /^max-w-(.+)$/.exec(token);
    if (width) {
      const named = NAMED_MAX_WIDTHS[width[1]];
      if (named !== undefined) { if (named >= WIDE_ENOUGH_PX) return 'fullscreen'; continue; }
      const size = parseArbitrarySize(width[1]);
      if (size?.px !== undefined && size.px >= WIDE_ENOUGH_PX) return 'fullscreen';
      if (size?.pct !== undefined && size.pct >= TALL_ENOUGH_PCT) return 'fullscreen';
      continue;
    }

    // `w-[98vw]` 처럼 뷰포트를 거의 다 쓰겠다고 적은 경우만 본다.
    // (`w-[calc(100%-1.5rem)]` 은 기본값이라 신호가 아니다.)
    const rawWidth = /^w-(\[.+\])$/.exec(token);
    if (rawWidth) {
      const size = parseArbitrarySize(rawWidth[1]);
      if (size?.pct !== undefined && size.pct >= TALL_ENOUGH_PCT) return 'fullscreen';
      continue;
    }

    const height = /^(?:max-)?h-(.+)$/.exec(token);
    if (height) {
      if (height[1] === 'screen' || height[1] === 'full') return 'fullscreen';
      const size = parseArbitrarySize(height[1]);
      if (size?.pct !== undefined && size.pct >= TALL_ENOUGH_PCT) return 'fullscreen';
      if (size?.px !== undefined && size.px >= TALL_ENOUGH_PX) return 'fullscreen';
    }
  }

  return 'center';
}
