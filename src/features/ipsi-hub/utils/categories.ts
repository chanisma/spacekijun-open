// ipsi-hub 카테고리 단일 소스.
// 필터 칩(CategoryFilterChips)과 추가/수정 다이얼로그(AddVideoDialog/EditVideoDialog)가
// 모두 여기를 참조해, "새로 추가한 영상이 필터 칩에 안 잡히는" 불일치를 방지한다.
//
// 값은 실제 DB(educational_videos.category / educational_news.category)에 존재하는
// 카테고리에 맞춘다. DB 변경 없이 UI만 정렬하는 정책.

// 영상 카테고리: 실제 데이터는 '입시'(다수), '진학'(소수)
export const VIDEO_CATEGORIES = ['입시', '진학'] as const;

// 뉴스 카테고리: 실제 데이터 — 수시/정시/진로/대입/전형분석/학생부/기타
export const NEWS_CATEGORIES = [
  '수시',
  '정시',
  '진로',
  '대입',
  '전형분석',
  '학생부',
  '기타',
] as const;

// 영상 추가/수정 다이얼로그의 선택 목록 (= 영상 카테고리)
export const VIDEO_CATEGORY_OPTIONS = VIDEO_CATEGORIES;

// 필터 칩에 쓰는 '전체' 접두 포함 목록
export const VIDEO_FILTER_CATEGORIES = ['전체', ...VIDEO_CATEGORIES];
export const NEWS_FILTER_CATEGORIES = ['전체', ...NEWS_CATEGORIES];
export const ALL_FILTER_CATEGORIES = [
  '전체',
  ...Array.from(new Set<string>([...VIDEO_CATEGORIES, ...NEWS_CATEGORIES])),
];

/** 종류(전체/동영상/뉴스)별 필터 목록 — 데스크톱 칩과 휴대폰 드롭다운이 함께 쓴다. */
export function categoriesForType(type: 'all' | 'video' | 'news'): string[] {
  if (type === 'video') return VIDEO_FILTER_CATEGORIES;
  if (type === 'news') return NEWS_FILTER_CATEGORIES;
  return ALL_FILTER_CATEGORIES;
}
