// 학생이 5등급제인지 9등급제인지 판정
//
// 2022 개정 교육과정으로 2025학년도 입학생부터 내신이 5등급제로 바뀌었다.
// 판정을 틀리면 적합도가 통째로 무너진다 — 9등급제 학생(내신 6.5)을 5등급제로
// 오판하면 6.5가 5.0으로 클램프된 뒤 8.8등급으로 "환산"돼 모든 대학이 위험으로 뜬다.
//
// ── 학번 접두사만으로는 안 되는 이유 ───────────────────────────────────────
// student_code 는 `YY-GCCNN` (입학연도 2자리 - 학년/반/번호)인데, **전입생은 접두사가
// 입학연도가 아니라 등록연도**가 될 수 있다. 실제 재학생 `00-00645` 는 학번 접두사가
// 25(→2025 입학→5등급제로 오판)지만 실제로는 3학년이고 생기부에 9등급 기록만 30행
// 있다(2015 개정 과목명 국어·수학·독서·문학…). 접두사 규칙 단독으로는 이 학생을
// 구제할 수 없다.
//
// ── 확정 판별자 ────────────────────────────────────────────────────────────
// **5등급제에서 석차등급은 1~5 뿐이므로 rank ≥ 6 은 구조적으로 나올 수 없다.**
// 따라서 rank ≥ 6 인 기록이 하나라도 있으면 그 학생은 9등급제 기록 보유자로 확정된다.
// (라이브 실측: 접두사 ≥ 2025 인 학생 193명 중 rank ≥ 6 을 가진 학생은 위 1명뿐이고
//  그 학생은 30행을 가진다. 오탐 여지 없음.)
//
// 역방향(rank 가 전부 ≤5 이므로 5등급제)은 **성립하지 않는다** — 성적이 우수한
// 9등급제 학생도 전 과목이 1~5등급일 수 있다(실측: 3학년 216명 중 53명이 최대 5 이하).
// 그래서 확정 증거가 없을 때만 접두사 규칙으로 되돌아간다.

/** 5등급제 전환 기준 입학연도 (2022 개정 교육과정 시행) */
export const FIVE_TIER_FROM_ADMISSION_YEAR = 2025;

/** student_code 앞 2자리 → 입학연도 (예: "00-00314" → 2024). 전입생은 부정확할 수 있음. */
export function admissionYearFromCode(code: string): number | null {
  const m = code.match(/^(\d{2})-/);
  if (!m) return null;
  return 2000 + Number(m[1]);
}

/** 학번 접두사만 쓴 1차 판정 (확정 증거가 없을 때의 폴백) */
export function isFiveTierByCode(code: string): boolean {
  const year = admissionYearFromCode(code);
  return year != null && year >= FIVE_TIER_FROM_ADMISSION_YEAR;
}

/** 판정에 필요한 최소 과목 정보 (get_wishlist_subjects 행의 부분집합) */
export interface ScaleEvidenceRecord {
  rank: number | null;
}

/**
 * 학생 기록으로 등급 척도를 확정한다.
 *
 * @param studentCode 학번
 * @param subjects    학생 과목 기록. null/미로딩이면 접두사 규칙만 사용한다.
 * @returns true = 5등급제(1·2학년), false = 9등급제(3학년 또는 9등급 기록 보유 전입생)
 */
export function resolveIsFiveTier(
  studentCode: string,
  subjects: ScaleEvidenceRecord[] | null | undefined
): boolean {
  // 확정 증거: 5등급제에서 불가능한 석차등급(≥6)이 있으면 9등급제 기록 보유자.
  if (subjects && subjects.some((s) => s.rank != null && s.rank > 5)) return false;
  return isFiveTierByCode(studentCode);
}
