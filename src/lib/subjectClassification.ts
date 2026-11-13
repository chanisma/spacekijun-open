// ========================================
// 교과 분류 — 클라이언트 단일 출처
// 판정 규칙(원본 라벨 정규화·폴백)은 DB 함수 subject_group_of 한 곳에 있다.
// 여기에는 교과(군) 목록과 표시용 이름만 둔다 — 규칙을 베끼지 말 것.
// 짝 = supabase/migrations/20260923150000_subject_classification.sql
// ========================================

/** 2022 개정 교과(군) 10종. 순서 = 표시 순서 (DB subject_group_names() 와 같아야 한다) */
export const SUBJECT_GROUPS = [
  '국어',
  '수학',
  '영어',
  '사회(역사/도덕 포함)',
  '과학',
  '체육',
  '예술',
  '기술·가정/정보',
  '제2외국어/한문',
  '교양',
] as const;

export type SubjectGroup = (typeof SUBJECT_GROUPS)[number];

export function isSubjectGroup(value: unknown): value is SubjectGroup {
  return typeof value === 'string' && (SUBJECT_GROUPS as readonly string[]).includes(value);
}

/**
 * 교과 묶음 7종 — 교과(군) 위의 한 층(2026-09-24 사용자 결정). 순서 = 표시 순서
 * (DB subject_cluster_names() 와 같아야 한다). 묶음은 교과(군)에서 유도하고 과목 예외만 저장한다.
 */
export const SUBJECT_CLUSTERS = [
  '어문학과',
  '영어',
  '수학',
  '사회(역사/도덕 포함)',
  '과학',
  '예체능',
  '교양',
] as const;

export type SubjectCluster = (typeof SUBJECT_CLUSTERS)[number];

/** 교과(군) → 묶음 (DB subject_cluster_of_group 와 같아야 한다 — 회귀가 대조한다) */
export const GROUP_TO_CLUSTER: Record<SubjectGroup, SubjectCluster> = {
  '국어': '어문학과',
  '제2외국어/한문': '어문학과',
  '영어': '영어',
  '수학': '수학',
  '사회(역사/도덕 포함)': '사회(역사/도덕 포함)',
  '과학': '과학',
  '기술·가정/정보': '예체능',
  '체육': '예체능',
  '예술': '예체능',
  '교양': '예체능',
};

/**
 * 여러 교과(군)를 묶는 묶음 — 대상 규칙 편집기가 교과(군) 칩 앞에 따로 보여 준다.
 * (교과(군) 하나와 같은 묶음을 또 보이면 같은 칩이 두 번 나온다)
 */
export const MULTI_GROUP_CLUSTERS: SubjectCluster[] = SUBJECT_CLUSTERS.filter(
  (c) => Object.values(GROUP_TO_CLUSTER).filter((v) => v === c).length > 1,
);

export function groupsOfCluster(cluster: string): SubjectGroup[] {
  return SUBJECT_GROUPS.filter((g) => GROUP_TO_CLUSTER[g] === cluster);
}

/** 좁은 자리(칩)용 짧은 이름 */
export function shortSubjectGroup(group: string): string {
  switch (group) {
    case '사회(역사/도덕 포함)':
      return '사회';
    case '기술·가정/정보':
      return '기가·정보';
    case '제2외국어/한문':
      return '제2외국어·한문';
    default:
      return group;
  }
}

/** subject_group_catalog 의 판정 출처 */
export type SubjectGroupSource = 'manual' | 'auto' | 'fallback' | 'none';

export const SUBJECT_GROUP_SOURCE_LABEL: Record<SubjectGroupSource, string> = {
  manual: '직접 지정',
  auto: '자동',
  fallback: '원본 라벨로 판정',
  none: '미분류',
};

export interface SubjectGroupCatalogRow {
  subject_name: string;
  subject_group: string | null;
  subject_cluster: string | null;
  /** 과목 단위 묶음 예외(NULL = 교과(군)에서 유도) */
  cluster_override: string | null;
  source: SubjectGroupSource;
  taught_grades: number[];
  teacher_count: number;
  curriculum_labels: string[];
}
