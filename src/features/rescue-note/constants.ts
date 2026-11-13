export const RESCUE_VISIBILITY = {
  TEAM: 'team',
  COUNSELOR_AUTHOR: 'counselor_author',
  AUTHOR_ONLY: 'author_only',
} as const;
export type RescueVisibility = typeof RESCUE_VISIBILITY[keyof typeof RESCUE_VISIBILITY];

export const RESCUE_STATUS = {
  OPEN: 'open',
  MONITORING: 'monitoring',
  CLOSED: 'closed',
} as const;
export type RescueStatus = typeof RESCUE_STATUS[keyof typeof RESCUE_STATUS];

export const RESCUE_ROLE = {
  COUNSELOR: 'counselor',
  STAFF_ADMIN: 'staff_admin',
} as const;
export type RescueRole = typeof RESCUE_ROLE[keyof typeof RESCUE_ROLE];

export const VISIBILITY_LABELS: Record<RescueVisibility, string> = {
  team: '케어팀 전체',
  counselor_author: '상담교사 + 작성자만',
  author_only: '작성자 본인만',
};

export const STATUS_LABELS: Record<RescueStatus, string> = {
  open: '주의',
  monitoring: '관찰',
  closed: '해제',
};

export const STATUS_COLORS: Record<RescueStatus, string> = {
  open: 'bg-red-500',
  monitoring: 'bg-amber-500',
  closed: 'bg-gray-400',
};

/**
 * 태그 키 → 카드 뱃지용 축약 라벨.
 * 메인 패널 학생 카드에서 태그를 모두 표시할 때 공간을 아끼기 위한 핵심 키워드.
 * 여기에 없는 키는 정의의 전체 label을 그대로 사용한다 (신규 태그 안전 처리).
 */
export const TAG_SHORT_LABELS: Record<string, string> = {
  livelihood_benefit: '생계',
  medical_benefit: '의료',
  housing_benefit: '주거',
  edu_subsidy: '교육',
  single_parent: '한부모',
  near_poverty: '차상위',
  psycho_emotional: '심리',
  school_maladjust: '부적응',
  family_env: '가족',
  friend_relation: '친구',
  positive_resource: '긍정자원',
  academic_career: '학업진로',
  scholarship: '장학금',
};

/** 태그 정의로부터 축약 라벨을 얻는다. 매핑이 없으면 전체 label로 폴백. */
export function shortTagLabel(key: string, fullLabel: string): string {
  return TAG_SHORT_LABELS[key] ?? fullLabel;
}
