/**
 * 토스트 색 팔레트 — 순수 데이터 단일 출처(의존성 0, 회귀 테스트가 그대로 읽는다).
 *
 * 앱의 상태 색 어휘를 그대로 쓴다(CLAUDE.md "3. 색"):
 *   에메랄드=완료 · 로즈=실패/취소 · 앰버=경고 · 블루=정보 · 슬레이트=중립
 *
 * ## ⚠️ 왜 CSS 파일이 아니라 인라인 스타일인가 (2026-09-12, 실제로 한 번 틀렸다)
 * sonner 는 자기 CSS 를 **런타임에 `<style>` 로 주입**하고, 그 안에서 팔레트를
 * `[data-sonner-toaster][data-theme=light]` (특이도 0-2-0) 로 정의한다.
 * `index.css` 에 `html body [data-sonner-toaster]` (0-1-2) 로 적으면 — 길어 보여도 —
 * **특이도가 낮아 진다**(클래스·속성 개수를 먼저 비교한다). 실측에서 우리 값이
 * 통째로 무시되고 sonner 기본색이 그려지고 있었는데, **오류도 경고도 없고 색이
 * 비슷해 눈으로도 구분되지 않았다**. 정적 검사("index.css 에 변수가 있는가")도
 * 통과한다 — 변수는 실제로 거기 있었으니까.
 *
 * 인라인 `style` 로 넘기면 스타일시트 규칙보다 항상 우선하므로 이 싸움 자체가 없어진다.
 * 새 토큰을 더할 때도 여기 적고 `sonner.tsx` 가 그대로 펼치게 할 것.
 */

export interface ToastToneColors {
  /** 카드 배경 */
  bg: string;
  /** 테두리 */
  border: string;
  /** 글자·아이콘 (배경 대비 4.5:1 이상) */
  text: string;
}

/** sonner 가 쓰는 CSS 변수 접두사와 같은 이름이어야 한다. */
export const TOAST_PALETTE: Record<'normal' | 'success' | 'error' | 'warning' | 'info', ToastToneColors> = {
  normal:  { bg: '#ffffff', border: '#e2e8f0', text: '#1e293b' }, // white / slate-200 / slate-800
  success: { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' }, // emerald-50 / 200 / 700
  error:   { bg: '#fff1f2', border: '#fecdd3', text: '#be123c' }, // rose-50 / 200 / 700
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#b45309' }, // amber-50 / 200 / 700
  info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' }, // blue-50 / 200 / 700
};

/** `<Toaster style={...}>` 에 그대로 넘길 CSS 변수 묶음. */
export function toastPaletteStyle(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [tone, c] of Object.entries(TOAST_PALETTE)) {
    out[`--${tone}-bg`] = c.bg;
    out[`--${tone}-border`] = c.border;
    out[`--${tone}-text`] = c.text;
  }
  return out;
}
