/**
 * 등급 표시 형식 단일 출처
 *
 * 종전에는 화면마다 `toFixed(1)` / `toFixed(2)`가 섞여 있어, 같은 학생의 같은 성적이
 * 탭에 따라 `2.1`과 `2.14`로 다르게 보였다. 규약을 하나로 고정한다:
 *
 *   **소수점 셋째 자리에서 반올림하여 두 자리로 표시** (예: 1.23)
 *
 * 새 화면에서 `toFixed`를 직접 쓰지 말고 이 모듈을 쓸 것.
 */

/** 등급 표시 소수 자릿수. 셋째 자리에서 반올림 = 두 자리 표기. */
export const GRADE_FRACTION_DIGITS = 2;

/**
 * 등급 값 표시.
 *
 * 이 도메인에서 등급 `0`은 "1등급보다 좋다"가 아니라 **성적 없음**을 뜻한다
 * (`getEffectiveGrade`가 미보유 학생에게 0을 돌려준다). 그래서 0 이하는 값이 아니라
 * 빈칸으로 취급한다 — 0.00으로 찍으면 최상위권처럼 보인다.
 */
export function formatGrade(
  value: number | null | undefined,
  fallback: string = '-',
): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return fallback;
  return value.toFixed(GRADE_FRACTION_DIGITS);
}

/**
 * 등급 차이(±) 표시.
 *
 * 차이는 0과 음수가 **정상 값**이므로 `formatGrade`의 "0 = 없음" 규칙을 쓰면 안 된다.
 * 부호를 항상 붙여 방향(개선/악화)이 한눈에 읽히게 한다.
 */
export function formatGradeDelta(
  value: number | null | undefined,
  fallback: string = '-',
): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  const text = value.toFixed(GRADE_FRACTION_DIGITS);
  return value >= 0 ? `+${text}` : text;
}

/* ─────────────────────────── 부분 평균 판정 ─────────────────────────── */

export interface PartialAverageScope {
  /** 평균 계산에 실제로 들어간 개수 (= 분모) */
  covered: number;
  /** 화면이 함께 보여주는 모집단 크기 (수강 인원·전체 과목 수 등) */
  total: number;
  /** 세는 단위 */
  unit?: string;
  /** 무엇이 없어서 빠졌는지 */
  missingLabel?: string;
}

/**
 * 이 평균이 "부분 평균"인가 — 즉 화면에 적힌 모집단보다 작은 분모로 계산됐는가.
 *
 * 온전한 분모에도 표식을 붙이면 표식이 곧 배경이 되어 읽히지 않으므로,
 * **정말 줄어든 경우에만** true. 수가 성립하지 않으면(NaN·total 0) 판단을 포기하고 false —
 * 근거 없이 "부분"이라고 말하는 것이 침묵보다 나쁘다.
 */
export function isPartialAverage(covered: number, total: number): boolean {
  if (!Number.isFinite(covered) || !Number.isFinite(total)) return false;
  if (total <= 0) return false;
  return covered < total;
}

/** 부분 평균 표식의 툴팁 문장 단일 출처. */
export function partialAverageTitle({
  covered,
  total,
  unit = '명',
  missingLabel = '성적',
}: PartialAverageScope): string {
  return `부분 평균: 전체 ${total}${unit} 중 ${missingLabel}이 있는 ${covered}${unit}만으로 계산했습니다 (${total - covered}${unit} 제외).`;
}
