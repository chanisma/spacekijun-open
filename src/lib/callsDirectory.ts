import { CallCategory, ExtensionEntry, ExtensionGroup } from '@/types/calls';

/**
 * 전화번호부 검색/필터 순수 로직 (React 비의존).
 *
 * 정규화가 핵심: 저장된 번호는 `000-0000-0032`인데 사용자는 보통 `2368932`처럼
 * 하이픈 없이 입력한다. 양쪽에서 하이픈·공백·괄호를 제거해 비교해야 둘 다 걸린다.
 */
export const normalizeText = (value: string): string =>
  value.toLowerCase().replace(/[\s.\-()]/g, '');

/** 한 항목이 검색어에 걸리는지 — 이름·업무·내선·전화번호·비고를 모두 본다 */
export const entryMatches = (
  entry: ExtensionEntry,
  normalizedQuery: string,
  groupTitle: string
): boolean => {
  if (!normalizedQuery) return true;

  const haystack = [
    entry.name,
    entry.duty,
    entry.extension,
    entry.phone,
    entry.note,
    groupTitle,
  ]
    .filter((part): part is string => Boolean(part))
    .map(normalizeText);

  return haystack.some((part) => part.includes(normalizedQuery));
};

export interface FilterOptions {
  query: string;
  category: CallCategory | 'all';
}

/** 카테고리 + 검색어로 그룹을 걸러낸다. 항목이 하나도 없는 그룹은 제거된다. */
export const filterDirectory = (
  groups: ExtensionGroup[],
  { query, category }: FilterOptions
): ExtensionGroup[] => {
  const normalizedQuery = normalizeText(query.trim());

  return groups
    .filter((group) => category === 'all' || group.category === category)
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) =>
        entryMatches(entry, normalizedQuery, group.title)
      ),
    }))
    .filter((group) => group.entries.length > 0);
};

/** 검색 결과 건수 */
export const countEntries = (groups: ExtensionGroup[]): number =>
  groups.reduce((total, group) => total + group.entries.length, 0);

/** `tel:` 링크에 넣을 형태 (하이픈 제거) */
export const toTelHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`;
