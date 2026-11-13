/**
 * 시험 회차의 "현재로부터 떨어진 거리(개월)"로 가중치를 계산한다.
 * 반감기 6개월: 6개월 전 시험의 가중치는 0.5, 12개월 전은 0.25.
 */

export const HALF_LIFE_MONTHS = 6;

export function recencyWeight(monthsAgo: number): number {
  if (monthsAgo <= 0) return 1;
  return Math.pow(0.5, monthsAgo / HALF_LIFE_MONTHS);
}

export function monthsBetween(
  year: number,
  month: number,
  refDate: Date = new Date()
): number {
  const refYear = refDate.getFullYear();
  const refMonth = refDate.getMonth() + 1;
  return (refYear - year) * 12 + (refMonth - month);
}
