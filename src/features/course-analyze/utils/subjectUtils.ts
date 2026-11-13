/**
 * Subject Utilities - 과목 분류 및 한글 처리 유틸리티
 * Converted from course_analyze/src/utils.js
 */

import type { SubjectCategoryName, CategorizedSubjects, SubjectConfiguration } from '../types/course.types';

// ============================================================================
// Subject Categories - 기본 과목 분류
// ============================================================================

export const DEFAULT_SUBJECT_CATEGORIES: Record<SubjectCategoryName, string[]> = {
  '국어': [
    '주제 탐구 독서', '문학과 영상',
    '고전 읽기', '화법과 작문', '독서', '언어와 매체',
    '실용 국어', '심화 국어', '언어생활 탐구',
    '매체 의사소통'
  ],
  '영어': [
    '미디어 영어', '영미 문학 읽기',
    '심화 영어 독해Ⅰ', '영어권 문화', '심화영어Ⅰ',
    '심화 영어', '심화 영어 독해와 작문'
  ],
  '수학': [
    '인공지능 수학', '기하',
    '미적분', '경제수학', '통합수학Ⅰ', '통합수학Ⅱ',
    '미적분Ⅱ', '경제 수학'
  ],
  '역사': [
    '세계사', '동아시아 역사 기행',
    '역사로 탐구하는 현대 세계'
  ],
  '사회': [
    '세계시민과 지리', '사회와 문화', '현대사회와 윤리', '경제', '정치', '도시의 미래 탐구',
    '한국지리', '한국지리 탐구', '정치와 법', '윤리와 사상', '고전과 윤리',
    '여행지리', '법과 사회', '인문학과 윤리',
    '기후변화와 지속가능한 세계', '금융과 경제생활', '윤리문제 탐구'
  ],
  '물리': [
    '물리학', '역학과 에너지',
    '물리학Ⅱ', '전자기와 양자'
  ],
  '화학': [
    '화학', '물질과 에너지',
    '화학Ⅱ', '화학 반응의 세계'
  ],
  '생명': [
    '생명과학', '세포와 물질대사',
    '생명과학Ⅱ', '생물의 유전', '고급 생명과학'
  ],
  '지구과학': [
    '지구과학', '지구시스템과학',
    '지구과학Ⅱ', '행성우주과학', '기후변화와 환경생태'
  ],
  // 아래 4개는 구 '기타' 카테고리를 학교 편제표(school_curriculum.category = 교과군)
  // 기준으로 세분한 것이다. 세분 근거와 주의사항은 파일 하단 ETC_SUBCATEGORIES 주석 참고.
  '과학기타': [
    '과학사', '융합과학 탐구', '과학의 역사와 문화'
  ],
  '외국어': [
    '중국어', '중국 문화', '중국어Ⅱ',
    '일본어', '일본 문화', '일본어Ⅱ',
    '한문', '언어생활과 한자', '한문Ⅱ'
  ],
  '기술가정정보': [
    '기술·가정', '정보', '인공지능 기초',
    '프로그래밍', '인공지능과 피지컬컴퓨팅', '정보과제연구', '소프트웨어와 생활',
    '생활과학 탐구', '가정과학', '아동발달과 부모'
  ],
  '교양': [
    '진로와 직업', '생태와 환경', '교육의 이해', '교육학', '보건',
    '논술', '인간과 철학', '삶과 종교', '논리와 사고'
  ],
  '기타': [
    '음악사', '미술사'
  ]
};

/**
 * 구 '기타' 카테고리를 세분한 하위 카테고리 목록 (2026-08-25).
 *
 * **분류 정본 = 학교 편제표 `school_curriculum.category`(교과군)** 이고, 생기부
 * `academic_development[].subject_group` 실측으로 교차 검증했다. 이름이 주는 인상과
 * 다른 것이 두 개 있으니 되돌리지 말 것:
 *   - '생활과학 탐구' = **기술·가정/정보** 교과군이다(과학 아님). 실제 생기부 22건이
 *     전부 subject_group='기술·가정/정보'로 기록된다 → '과학기타'에 넣으면 예상등급이
 *     과학 등급으로 계산되는데 실제 성적은 기술·가정/정보 교과군에 쌓여 어긋난다.
 *   - '융합과학 탐구' = **과학** 교과군이다 → '과학기타'.
 *
 * '기타'는 이제 잔여 버킷(예술 등)이며, 카탈로그에 없는 새 과목도 여기로 떨어진다.
 */
export const ETC_SUBCATEGORIES = ['과학기타', '외국어', '기술가정정보', '교양'] as const;

/**
 * 석차등급이 산출되지 않는 카테고리 — 예상등급 계산에서 제외한다.
 *
 * 교양 교과군(진로와 직업·생태와 환경·교육의 이해·보건·논술·인간과 철학·삶과 종교…)은
 * 2022 개정 교육과정에서 **이수/미이수(P)** 로만 기록된다. 근거 2종:
 *   1. 편제표 `school_curriculum.grading_type = '이수/미이수'` (2025 입학 코호트 행)
 *   2. 라이브 생기부 실측 — 논술·보건·인간과 철학·삶과 종교·교육학·진로와 직업의
 *      `rank`가 **전 건(1,000건 이상) NULL**, achievement는 'P' 또는 빈 문자열
 *
 * 주의: 등급이 안 나오는 과목이 교양만인 것은 아니다(예술·체육 = 성취도 3단계,
 * 2015 교육과정 잔여 진로선택 과목 일부도 3단계). 다만 그것들은 **카테고리 단위로
 * 갈라지지 않아**(같은 '수학'에 5등급 과목과 3단계 과목이 공존) 여기서 처리할 수 없고,
 * 편제표의 grading_type이 2026 입학 코호트 행에는 전부 비어 있어 런타임 판정도 불가하다.
 * 확실히 입증된 교양만 제외한다.
 */
export const NO_RANK_CATEGORIES: ReadonlySet<string> = new Set(['교양']);

/**
 * 해당 카테고리가 석차등급 산출 대상인지 여부.
 */
export function isRankedCategory(category: string): boolean {
  return !NO_RANK_CATEGORIES.has(category);
}

// ============================================================================
// Science Hierarchy - 과학 선수과목 체계
// ============================================================================

export const SCIENCE_HIERARCHY: Record<string, string[]> = {
  '물리': ['물리학', '역학과 에너지', '물리학Ⅱ', '전자기와 양자'],
  '화학': ['화학', '물질과 에너지', '화학Ⅱ', '화학 반응의 세계'],
  '생명': ['생명과학', '세포와 물질대사', '생명과학Ⅱ', '생물의 유전', '고급 생명과학'],
  '지구과학': ['지구과학', '지구시스템과학', '지구과학Ⅱ', '행성우주과학']
};

// ============================================================================
// Korean Consonant Utilities - 한글 초성 처리
// ============================================================================

const KOREAN_CONSONANTS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const HANGUL_START = 0xAC00; // '가'
const HANGUL_END = 0xD7A3;   // '힣'

/**
 * 한글 이름에서 초성을 추출합니다.
 */
export function getConsonant(name: string | null | undefined): string | null {
  if (!name || name.length === 0) return null;

  const charCode = name.charCodeAt(0) - HANGUL_START;
  if (charCode < 0 || charCode > (HANGUL_END - HANGUL_START)) return null;

  const consonantIndex = Math.floor(charCode / 588);
  return KOREAN_CONSONANTS[consonantIndex] ?? null;
}

/**
 * 초성 필터에 사용할 자음 목록을 반환합니다.
 */
export function getFilterConsonants(): string[] {
  // 실제로 많이 사용되는 성씨 초성만 반환
  return ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
}

// ============================================================================
// Subject Classification - 과목 분류 함수
// ============================================================================

/**
 * 과목명을 비교용으로 정규화합니다.
 * 공백·중점(·/・)·슬래시를 제거하여 같은 과목의 표기 변형을 동일하게 취급합니다.
 * (예: '경제 수학'≡'경제수학', '기술·가정'≡'기술・가정'≡'기술가정')
 *
 * 배열에 저장된 표시용 문자열은 그대로 두고, 매칭할 때만 이 함수를 거칩니다.
 */
export function normalizeSubjectName(name: string): string {
  return name.replace(/[\s·・/]/g, '');
}

/**
 * 정규화 매칭으로 과목이 속한 카테고리를 찾습니다. 없으면 null.
 */
export function findSubjectCategory(
  subject: string,
  categories: Record<string, string[]>
): string | null {
  const target = normalizeSubjectName(subject);
  for (const category in categories) {
    if (categories[category].some(s => normalizeSubjectName(s) === target)) {
      return category;
    }
  }
  return null;
}

/**
 * 과목 목록을 카테고리별로 분류합니다.
 */
export function classifySubjectsByCategories(
  subjects: string[],
  categories: Record<string, string[]> = DEFAULT_SUBJECT_CATEGORIES
): CategorizedSubjects {
  const categorized: CategorizedSubjects = {};

  subjects.forEach(subject => {
    const category = findSubjectCategory(subject, categories) ?? '기타';
    if (!categorized[category]) categorized[category] = [];
    categorized[category].push(subject);
  });

  return categorized;
}

/**
 * SubjectConfiguration을 기존 subjectCategories 형식으로 변환합니다.
 */
export function convertSubjectConfiguration(
  config: SubjectConfiguration | null
): Record<string, string[]> {
  if (!config || !config.categories) {
    return DEFAULT_SUBJECT_CATEGORIES;
  }

  const convertedCategories: Record<string, string[]> = {};

  // categories에서 각 카테고리별로 subjects 배열 추출
  for (const [categoryName, categoryData] of Object.entries(config.categories)) {
    if (categoryData && categoryData.subjects) {
      convertedCategories[categoryName] = [...categoryData.subjects];
    }
  }

  // uncategorized 과목들을 '기타' 카테고리에 추가
  if (config.uncategorized && config.uncategorized.length > 0) {
    if (!convertedCategories['기타']) {
      convertedCategories['기타'] = [];
    }
    convertedCategories['기타'].push(...config.uncategorized);
  }

  return convertedCategories;
}

/**
 * SubjectConfiguration에 정의된 과목만 필터링합니다.
 */
export function filterSubjectsByConfiguration(
  subjects: string[],
  config: SubjectConfiguration | null
): string[] {
  if (!config || !config.categories) {
    return subjects;
  }

  // Get all valid subjects from configuration
  const validSubjects = new Set<string>();

  // Add subjects from all categories
  Object.values(config.categories).forEach(category => {
    if (category.subjects && Array.isArray(category.subjects)) {
      category.subjects.forEach(subject => validSubjects.add(subject));
    }
  });

  // Add uncategorized subjects
  if (config.uncategorized && Array.isArray(config.uncategorized)) {
    config.uncategorized.forEach(subject => validSubjects.add(subject));
  }

  return subjects.filter(subject => validSubjects.has(subject));
}

/**
 * 카테고리 표시 순서를 반환합니다.
 */
export function getCategoryDisplayOrder(): SubjectCategoryName[] {
  return [
    '국어', '영어', '수학', '역사', '사회',
    '물리', '화학', '생명', '지구과학', '과학기타',
    '외국어', '기술가정정보', '교양', '기타',
  ];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 디바운스 함수 - 연속적인 이벤트 호출을 제한합니다.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
  immediate = false
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(this: unknown, ...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };

    const callNow = immediate && !timeout;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
  };
}
