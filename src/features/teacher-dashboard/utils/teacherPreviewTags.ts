import type { ResourceTag } from '@/hooks/useResourceTags';

export type TeacherTagCategory = 'responsibility' | 'homeroom' | 'grade' | 'subject' | 'other';

export const teacherTagCategoryLabels: Record<TeacherTagCategory, string> = {
  responsibility: '보직·담당 역할',
  homeroom: '담임 학급',
  grade: '학년 수업 역할',
  subject: '교과',
  other: '기타',
};

export const teacherTagCategoryOrder: TeacherTagCategory[] = [
  'responsibility',
  'homeroom',
  'grade',
  'subject',
  'other',
];

export function getTeacherTagCategory(tag: Pick<ResourceTag, 'name' | 'description'>): TeacherTagCategory {
  const name = tag.name.trim();
  const description = tag.description ?? '';

  if (/(부장|관리자|담당|상담|운영|위기|연수|발급)/.test(name)) return 'responsibility';
  if (/^\d학년 \d+반$/.test(name) || /담임/.test(name)) return 'homeroom';
  if (/^\d학년 수업$/.test(name)) return 'grade';
  if (/교과 교사/.test(description)) return 'subject';
  return 'other';
}

export function summarizeTeacherPreviewTags(tagNames: string[]): string {
  if (tagNames.length === 0) return '일반 교사 · 태그 없음';
  if (tagNames.length === 1) return tagNames[0];
  return `${tagNames[0]} 외 ${tagNames.length - 1}`;
}
