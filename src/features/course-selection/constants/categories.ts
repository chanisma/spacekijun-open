export const SUBJECT_CATEGORIES = {
  KOR: { name: '국어', type: 'required', maxSelections: 3, minSelections: 1, displayOrder: 1, description: '국어 영역 과목' },
  ENG: { name: '영어', type: 'required', maxSelections: 3, minSelections: 1, displayOrder: 2, description: '영어 영역 과목' },
  MATH: { name: '수학', type: 'required', maxSelections: 3, minSelections: 1, displayOrder: 3, description: '수학 영역 과목' },
  HIS: { name: '역사', type: 'elective', maxSelections: 2, minSelections: 0, displayOrder: 4, description: '역사 영역 과목' },
  SOC: { name: '사회', type: 'elective', maxSelections: 4, minSelections: 0, displayOrder: 5, description: '사회 영역 과목' },
  PHY: { name: '물리', type: 'elective', maxSelections: 3, minSelections: 0, displayOrder: 6, description: '물리 영역 과목' },
  CHE: { name: '화학', type: 'elective', maxSelections: 3, minSelections: 0, displayOrder: 7, description: '화학 영역 과목' },
  BIO: { name: '생명', type: 'elective', maxSelections: 3, minSelections: 0, displayOrder: 8, description: '생명과학 영역 과목' },
  EARTH: { name: '지구과학', type: 'elective', maxSelections: 3, minSelections: 0, displayOrder: 9, description: '지구과학 영역 과목' },
  ETC: { name: '기타', type: 'elective', maxSelections: 5, minSelections: 0, displayOrder: 10, description: '기타 영역 과목 (예술·체육·교양·제2외국어 등)' },
} as const;

export type CategoryCode = keyof typeof SUBJECT_CATEGORIES;
export type CategoryType = 'required' | 'elective';

export const CATEGORY_CODES = Object.keys(SUBJECT_CATEGORIES) as CategoryCode[];

export function getCategoryByName(name: string): CategoryCode | null {
  for (const [code, c] of Object.entries(SUBJECT_CATEGORIES)) {
    if (c.name === name) return code as CategoryCode;
  }
  return null;
}
