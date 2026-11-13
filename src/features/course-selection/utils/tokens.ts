/**
 * Design tokens — mockup의 oklch 컬러 시스템을 그대로 가져옴.
 * shadcn 컴포넌트와 병행 사용할 수 있도록 inline style용 객체로 export.
 *
 * 사용 원칙:
 * - 일반 버튼·입력은 shadcn 사용 (다른 페이지와 톤 통일)
 * - 과목군 컬러칩(SubjectTag), 정원 바(CapacityBar) 등 mockup 고유 요소만 이 토큰 사용
 */

export const T = {
  fontMono: '"JetBrains Mono", ui-monospace, "SF Mono", Consolas, monospace',

  // surfaces
  bg: 'oklch(99% 0.004 280)',
  surface: '#ffffff',
  surfaceMuted: 'oklch(97.5% 0.005 280)',
  surfaceSunk: 'oklch(96% 0.006 280)',

  // borders
  border: 'oklch(93% 0.006 280)',
  borderStrong: 'oklch(88% 0.008 280)',
  borderFocus: 'oklch(75% 0.12 280)',

  // text
  ink: 'oklch(22% 0.02 280)',
  inkMuted: 'oklch(48% 0.02 280)',
  inkDim: 'oklch(62% 0.015 280)',

  // primary (indigo/violet) — Tailwind violet-600에 가까움
  primary: 'oklch(54% 0.18 282)',
  primaryHover: 'oklch(48% 0.20 282)',
  primarySoft: 'oklch(95% 0.04 282)',
  primarySoftInk: 'oklch(42% 0.16 282)',

  // semantic
  success: 'oklch(56% 0.13 150)',
  successSoft: 'oklch(94% 0.06 150)',
  successSoftInk: 'oklch(38% 0.13 150)',
  warning: 'oklch(70% 0.14 75)',
  warningSoft: 'oklch(95% 0.06 75)',
  warningSoftInk: 'oklch(42% 0.14 60)',
  danger: 'oklch(58% 0.18 25)',
  dangerSoft: 'oklch(95% 0.04 25)',
  dangerSoftInk: 'oklch(42% 0.16 25)',

  // radii
  r1: 6,
  r2: 8,
  r3: 12,
  r4: 16,
} as const;

// 과목군 색상 맵 — mockup과 동일
export const SUBJECT_COLORS: Record<string, { bg: string; ink: string; dot: string }> = {
  국어: { bg: 'oklch(94% 0.04 320)', ink: 'oklch(40% 0.16 320)', dot: 'oklch(60% 0.18 320)' },
  수학: { bg: 'oklch(94% 0.05 155)', ink: 'oklch(40% 0.15 155)', dot: 'oklch(58% 0.16 155)' },
  영어: { bg: 'oklch(94% 0.04 235)', ink: 'oklch(40% 0.16 235)', dot: 'oklch(58% 0.16 235)' },
  사회: { bg: 'oklch(94% 0.05 75)', ink: 'oklch(42% 0.14 65)', dot: 'oklch(64% 0.14 70)' },
  과학: { bg: 'oklch(94% 0.04 25)', ink: 'oklch(42% 0.16 25)', dot: 'oklch(60% 0.18 25)' },
  체예: { bg: 'oklch(94% 0.04 195)', ink: 'oklch(40% 0.13 200)', dot: 'oklch(58% 0.13 200)' },
  교양: { bg: 'oklch(94% 0.005 280)', ink: 'oklch(40% 0.02 280)', dot: 'oklch(60% 0.015 280)' },
  기타: { bg: 'oklch(94% 0.02 260)', ink: 'oklch(40% 0.04 260)', dot: 'oklch(60% 0.04 260)' },
};

export function categoryColor(cat: string | null | undefined) {
  return SUBJECT_COLORS[cat ?? ''] ?? SUBJECT_COLORS['교양'];
}
