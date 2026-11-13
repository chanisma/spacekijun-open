// ========================================
// 진로·분야 카테고리 — 순수 로직 (React 비의존)
//
// 활동의 `career_fields`(진로·분야, 쉼표 구분 다중값)를 첫 화면의 분류 축으로 쓴다.
// 한 활동이 여러 분야를 가지면 **여러 카테고리에 동시에 나타난다** — 실제로
// "혈액형 판별 실험"은 의학이면서 생명공학이다.
//
// 색은 이름 해시로 결정론적으로 배정한다. 순서(개수 정렬) 기반으로 칠하면
// 활동 하나가 추가돼 정렬이 바뀔 때 색이 통째로 뒤바뀌어, 사용자가 색으로 기억한
// 위치가 매번 달라진다.
// ========================================

/** 분야가 지정되지 않은 활동을 담는 버킷의 키 */
export const UNCATEGORIZED = '__uncategorized__';
export const UNCATEGORIZED_LABEL = '분야 미지정';

export interface CategoryBucket {
  /** 카테고리 키(=분야명, 미지정은 UNCATEGORIZED) */
  key: string;
  label: string;
  count: number;
  /** 이 카테고리에 속한 활동 id (원본 목록 순서 보존) */
  activityIds: string[];
}

/** 카테고리 집계에 필요한 최소 형태 */
export interface CategorizableActivity {
  id: string;
  career_fields: string[];
}

/**
 * 쉼표·줄바꿈으로 구분된 입력을 분야 배열로 정규화한다.
 *
 * 공백만 다른 표기(`의학` vs `의학 `)가 다른 카테고리로 갈라지면 첫 화면이
 * 쓸모없어지므로 trim은 필수다. 대소문자·중복도 정리한다.
 */
export function parseCareerFields(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[,\n·、]/)) {
    const v = piece.trim().replace(/\s+/g, ' ');
    if (!v) continue;
    const dedupeKey = v.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(v);
  }
  return out;
}

/**
 * 활동 목록 → 카테고리 버킷.
 *
 * 정렬은 **개수 내림차순 → 이름 오름차순**이고 미지정 버킷은 항상 맨 뒤다
 * (비어 있으면 아예 만들지 않는다 — 빈 타일은 첫 화면의 노이즈다).
 */
export function buildCategories(activities: CategorizableActivity[]): CategoryBucket[] {
  const map = new Map<string, CategoryBucket>();

  for (const a of activities) {
    const fields = a.career_fields?.length ? a.career_fields : [UNCATEGORIZED];
    for (const field of fields) {
      const key = field === UNCATEGORIZED ? UNCATEGORIZED : field.trim();
      if (!key) continue;
      const bucket = map.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.activityIds.push(a.id);
      } else {
        map.set(key, {
          key,
          label: key === UNCATEGORIZED ? UNCATEGORIZED_LABEL : key,
          count: 1,
          activityIds: [a.id],
        });
      }
    }
  }

  const buckets = [...map.values()];
  buckets.sort((a, b) => {
    if (a.key === UNCATEGORIZED) return 1;
    if (b.key === UNCATEGORIZED) return -1;
    return b.count - a.count || a.label.localeCompare(b.label, 'ko');
  });
  return buckets;
}

// ----------------------------------------
// 색 — 이름 해시로 결정론적 배정
// ----------------------------------------
//
// Tailwind 기본 램프 대신 **직접 고른 hex**를 쓴다. 기본 램프는 채도가 균일해
// 나란히 놓으면 "생성된 색표"처럼 읽히는데, 색마다 밝기·채도를 손으로 조정하면
// 훨씬 정돈돼 보인다. 대신 클래스가 아니라 인라인 스타일이므로
// **글자/배경 대비를 직접 책임져야 한다** — 전부 5.5:1 이상으로 맞췄다.

export interface CategoryTone {
  /** 타일 배경 */
  bg: string;
  /** 타일 글자 (배경 대비 5.5:1 이상) */
  fg: string;
  /** 타일 테두리 */
  border: string;
  /** 강조 — 목록 패널 연결선·선택 링 */
  accent: string;
  /** 레일 모드의 개수 배지 배경 */
  badge: string;
}

/**
 * 밝고 부드러운 10색. 색상환을 고르게 돌되 채도를 낮춰,
 * 열 개가 한 화면에 있어도 서로 다투지 않게 했다.
 */
const PALETTE: CategoryTone[] = [
  { bg: '#FFE9E3', fg: '#9A3F2B', border: '#F7CFC3', accent: '#F08A6C', badge: '#FBD8CD' }, // blush
  { bg: '#FFF0DC', fg: '#94551A', border: '#F7DCB5', accent: '#F2A64B', badge: '#FCE4C4' }, // apricot
  { bg: '#FBF3D0', fg: '#7C6410', border: '#EFE2A8', accent: '#DDBF3C', badge: '#F3E9B8' }, // butter
  { bg: '#E4F0E2', fg: '#3D6B41', border: '#C9E0C6', accent: '#7FB07F', badge: '#D5E8D2' }, // sage
  { bg: '#DEF2EC', fg: '#1F6B5C', border: '#BEE3D8', accent: '#59B8A2', badge: '#CDEAE1' }, // mint
  { bg: '#E0EFFA', fg: '#1F5B85', border: '#BFDCF1', accent: '#62AEDC', badge: '#CFE5F5' }, // sky
  { bg: '#E6E9FB', fg: '#3C468F', border: '#C9D0F3', accent: '#8590E0', badge: '#D6DBF7' }, // periwinkle
  { bg: '#EFE6FA', fg: '#5B3D8C', border: '#DAC9F1', accent: '#A587DD', badge: '#E4D6F6' }, // lilac
  { bg: '#FBE6F3', fg: '#8C3A6C', border: '#F2C9E2', accent: '#DE85BC', badge: '#F6D8EB' }, // orchid
  { bg: '#E8ECF2', fg: '#465A73', border: '#CFD8E4', accent: '#8CA3BF', badge: '#DCE3EC' }, // slate blue
];

/** 분야 미지정 — 중립. 색을 배정하지 않는 것이 곧 정보다. */
const NEUTRAL_TONE: CategoryTone = {
  bg: '#F6F7F9',
  fg: '#64748B',
  border: '#DDE2E9',
  accent: '#A6B0BF',
  badge: '#E7EAEF',
};

/** FNV-1a 32bit — 짧고 분포가 고르며 결정론적이다. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 카테고리 색. 같은 이름이면 언제·어디서 렌더해도 같은 색이다. */
export function getCategoryTone(key: string): CategoryTone {
  if (key === UNCATEGORIZED) return NEUTRAL_TONE;
  return PALETTE[hashString(key) % PALETTE.length];
}

export const CATEGORY_PALETTE_SIZE = PALETTE.length;
