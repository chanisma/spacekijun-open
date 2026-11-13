/**
 * Grade Mapping Utilities - 과목군 매핑 유틸리티
 * student_basic_info의 subject_group을 course-analyze 카테고리로 매핑
 */

import { DEFAULT_SUBJECT_CATEGORIES } from './subjectUtils';

// 데이터베이스 subject_group → course-analyze 카테고리 매핑
const SUBJECT_GROUP_TO_CATEGORY: Record<string, string> = {
  // Direct matches
  '국어': '국어',
  '영어': '영어',
  '수학': '수학',
  '한국사': '역사',

  // 사회 관련
  '사회': '사회',
  '사회(역사/도덕포함)': '사회',

  // 과학 세부 분류 → 모두 "과학"으로 통합
  '과학': '과학',
  '물리': '과학',
  '물리학': '과학',
  '화학': '과학',
  '생명': '과학',
  '생명과학': '과학',
  '지구과학': '과학',

  // 제2외국어/한문 → '외국어'
  '제2외국어/한문': '외국어',
  '제2외국어': '외국어',
  '한문': '외국어',

  // 기술·가정/정보 → '기술가정정보'
  '기술·가정/정보': '기술가정정보',
  '기술・가정/정보': '기술가정정보',
  '기술·가정': '기술가정정보',
  '기술・가정': '기술가정정보',
  '정보': '기술가정정보',
  '정보·통신': '기술가정정보',
  // 2015 교육과정의 복합 교과군. 이 군에서 석차등급이 실제로 나오는 과목은
  // 정보·기술·가정뿐이고(라이브 실측: 정보 113건·기술·가정 352건 전건 rank 보유,
  // 논술·보건·교육학·진로와 직업은 전건 rank NULL) 한문·제2외국어는 별도 군
  // '제2외국어/한문'에 있다. 따라서 '기술가정정보'로 흡수하는 것이 실제 등급과 맞는다.
  '기술・가정/제2외국어/한문/교양': '기술가정정보',
  '기술·가정/제2외국어/한문/교양': '기술가정정보',

  // 교양 → 석차등급 미산출 교과군 (subjectUtils.NO_RANK_CATEGORIES)
  '교양': '교양',

  // 체육·예술은 성취도(3단계)만 산출되어 등급 집계에 들어오지 않는다 → 잔여 버킷
  '체육': '기타',
  '예술': '기타',
};

/**
 * 데이터베이스 subject_group을 course-analyze 카테고리로 변환
 */
export function subjectGroupToCategory(subjectGroup: string): string {
  // Direct mapping check
  if (SUBJECT_GROUP_TO_CATEGORY[subjectGroup]) {
    return SUBJECT_GROUP_TO_CATEGORY[subjectGroup];
  }

  // Partial matching for compound names
  const groupLower = subjectGroup.toLowerCase();

  // 과학 관련 과목은 모두 "과학"으로 통합
  if (groupLower.includes('물리')) return '과학';
  if (groupLower.includes('화학')) return '과학';
  if (groupLower.includes('생명')) return '과학';
  if (groupLower.includes('지구')) return '과학';
  if (groupLower.includes('과학')) return '과학';
  if (groupLower.includes('역사')) return '역사';
  if (groupLower.includes('사회') || groupLower.includes('도덕')) return '사회';

  if (groupLower.includes('제2외국어') || groupLower.includes('한문')) return '외국어';
  if (groupLower.includes('정보') || groupLower.includes('기술')) return '기술가정정보';
  if (groupLower.includes('교양')) return '교양';

  // Default to 기타
  return '기타';
}

/**
 * course-analyze 카테고리 → `DatabaseGradeData.subjectGroupGrades` 조회 키.
 *
 * 과학 세부 카테고리(물리·화학·생명·지구과학)와 '과학기타'는 DB에서 하나의 '과학'
 * 교과군으로 집계되므로 조회 키를 '과학'으로 접는다. 그 외는 카테고리명 그대로.
 *
 * **단일 출처**: 예전엔 StudentEstimatedGradeTab·EstimatedGradeTab·GradeDistributionTab·
 * SubjectCountTab·InDepthTab **다섯 곳**이 각자 `SCIENCE_CATEGORIES` 배열을 복붙해 갖고
 * 있었다. 카테고리를 추가할 때 한 곳만 고치면 화면마다 다른 등급으로 순위가 매겨진다
 * (실제로 '과학기타'를 추가하며 한 곳을 놓칠 뻔했다) → 여기로 모았다.
 */
const SCIENCE_GRADE_CATEGORIES = ['물리', '화학', '생명', '지구과학', '과학기타'];

export function toDbGradeCategory(category: string): string {
  return SCIENCE_GRADE_CATEGORIES.includes(category) ? '과학' : category;
}

/**
 * 카테고리에 해당하는 subject_group 목록 반환
 */
export function categoryToSubjectGroups(category: string): string[] {
  const mapping: Record<string, string[]> = {
    '국어': ['국어'],
    '영어': ['영어'],
    '수학': ['수학'],
    '역사': ['역사', '한국사'],
    '사회': ['사회', '사회(역사/도덕포함)'],
    '물리': ['물리', '물리학'],
    '화학': ['화학'],
    '생명': ['생명', '생명과학'],
    '지구과학': ['지구과학'],
    '과학기타': ['과학'],
    '외국어': ['제2외국어/한문', '제2외국어', '한문'],
    '기술가정정보': ['기술·가정/정보', '기술·가정', '정보', '정보·통신', '기술・가정/제2외국어/한문/교양'],
    '교양': ['교양'],
    '기타': ['체육', '예술']
  };

  return mapping[category] || [];
}

/**
 * 알려진 과목군인지 확인
 */
export function isKnownSubjectGroup(group: string): boolean {
  return Object.keys(SUBJECT_GROUP_TO_CATEGORY).includes(group);
}

/**
 * course-analyze 카테고리 목록 반환
 */
export function getCourseAnalyzeCategories(): string[] {
  return Object.keys(DEFAULT_SUBJECT_CATEGORIES);
}
