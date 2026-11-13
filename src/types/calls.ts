// 샘플고 교내 전화(내선) 디렉터리 타입
// 출처: "0. 샘플고 전화번호 목록260703.hwpx" (2026-07-03 기준)

export type CallCategory =
  | 'admin' // 운영실 (교장실·교무실·교목실 등)
  | 'grade' // 학년 교무실 (부장 + 각 반)
  | 'staff' // 담당자별 업무 내선
  | 'facility' // 부속실 (보건실·상담실·도서관 등)
  | 'office' // 행정실
  | 'dorm' // 기숙사
  | 'cafeteria'; // 식생활관

export interface ExtensionEntry {
  /** 그룹 내에서 고유한 식별자 */
  id: string;
  /** 표시 이름 — 부서/공간명 또는 담당자 이름 */
  name: string;
  /** 내선번호 */
  extension?: string;
  /** 외부에서 거는 직통 번호 */
  phone?: string;
  /** 담당 업무 (담당자 항목에서만 사용) */
  duty?: string;
  /** 번호 대신 안내가 필요한 경우 (예: "3학년 교무실 이용") */
  note?: string;
  /** 팩스 전용 항목 */
  isFax?: boolean;
  /** 부장·실장 등 대표 항목 강조 */
  isLead?: boolean;
}

export interface ExtensionGroup {
  id: string;
  title: string;
  category: CallCategory;
  /** 카드 부제 */
  description?: string;
  entries: ExtensionEntry[];
}

/** 카테고리 필터 탭 정의 */
export interface CallCategoryFilter {
  id: CallCategory | 'all';
  label: string;
}
