// 탐구 탐색 표시 규약 — **판정은 여기 한 곳에만 둔다.**
//
// 화면마다 "심화 비율" 을 다시 계산하면 어느 카드는 L3+L4 를, 어느 카드는 L4 만 세는 일이 생긴다.
// 방법론 = 스킬 `/inquiry-graphrag` §2-5.
import type { InquiryLevel } from '../types';

export const LEVEL_LABEL: Record<InquiryLevel, string> = {
  0: '비탐구',
  1: '수행·보고',
  2: '이해·적용',
  3: '분석·해석',
  4: '설계·확장',
};

/**
 * 수준 색 — **에메랄드=완료** 같은 앱 전역 상태색과 겹치지 않게 고른다.
 * 순서 있는 값이라 한 색상의 명도 램프를 쓰되, L0 만 회색으로 빼 "탐구 아님"을 색으로 구분한다.
 */
export const LEVEL_TONE: Record<InquiryLevel, string> = {
  0: 'bg-slate-100 text-slate-500 ring-slate-200',
  1: 'bg-sky-50 text-sky-700 ring-sky-200',
  2: 'bg-sky-100 text-sky-800 ring-sky-300',
  3: 'bg-indigo-100 text-indigo-800 ring-indigo-300',
  4: 'bg-violet-100 text-violet-800 ring-violet-300',
};

export const AREA_LABEL: Record<string, string> = {
  autonomy: '자율활동',
  club: '동아리활동',
  career: '진로활동',
  seteuk: '교과 세특',
  seteuk_career: '진로 세특',
};

/** L3+L4 비율. 분모는 **판정된 건수**다(전체 크기가 아니다 — 판정 전 활동이 섞이면 비율이 낮아진다). */
export function deepRatio(levelDist: Record<string, number>, graded: number): number | null {
  if (!graded) return null;
  return ((levelDist.L3 ?? 0) + (levelDist.L4 ?? 0)) / graded;
}

/**
 * **깊이를 말할 수 있는 주제인가.**
 *
 * 탐구 인정률이 1문장 26% → 4문장 이상 78% 로 갈리므로, 짧게 적힌 주제군의 낮은 심화 비율은
 * "이 주제로는 깊이 못 간다"가 아니라 **"기록이 짧아 알 수 없다"** 이다. 둘을 같은 0% 로 보여 주면
 * 앞은 하지 말라는 정보이고 뒤는 아무 정보도 아닌데 구분이 사라진다(§8-10).
 *
 * 경계 2.5 는 실측에서 온다 — 2문장대 주제군은 중앙 심화 0% 이고 주제 간 폭이 15%p 뿐이라
 * 사실상 변별하지 못한다. 3문장부터 폭이 42%p 로 벌어진다.
 */
export function depthReadable(meanSentences: number | null): boolean {
  return meanSentences != null && meanSentences >= 2.5;
}

/** 심화 비율을 사람 말로. 재료가 부족하면 **비율 대신 그 사실**을 말한다. */
export function depthLabel(levelDist: Record<string, number>, graded: number, meanSentences: number | null): {
  text: string;
  ratio: number | null;
  readable: boolean;
} {
  const ratio = deepRatio(levelDist, graded);
  const readable = depthReadable(meanSentences);
  if (!graded) return { text: '판정 전', ratio: null, readable: false };
  if (!readable) return { text: '기록이 짧아 깊이를 판단하기 어려움', ratio, readable: false };
  return { text: `심화 ${Math.round((ratio ?? 0) * 100)}%`, ratio, readable: true };
}

/**
 * 주제군 정렬 기본값 — **심화 비율로 정렬하지 않는다.**
 * 길게 적히는 과학 실험이 위로, 짧게 적히는 행사·공연이 아래로 몰리는데
 * 그것은 탐구의 깊이가 아니라 **기록 관행의 차이**다(§8-10).
 */
export type ThemeSort = 'size' | 'deep' | 'name';
export const THEME_SORT_LABEL: Record<ThemeSort, string> = {
  size: '활동 많은 순',
  deep: '심화 비율 순',
  name: '이름 순',
};

/**
 * 보고서 필드를 줄 목록으로 — **문자열과 배열을 모두 받는다.**
 * 프롬프트가 문자열을 요구해도 모델은 배열로 답할 때가 있고(실측 `entry`),
 * 그대로 렌더하면 화면에 `["t:1(…` 같은 JSON 이 노출된다. 읽는 쪽에서 한 번만 흡수한다.
 */
export function asLines(v: string | string[] | null | undefined): string[] {
  if (!v) return [];
  const xs = Array.isArray(v) ? v : [v];
  return xs.map((x) => String(x).trim()).filter(Boolean);
}

/** 본문에 남은 `[t:12]` · `[act:…]` 인용 표시를 화면에서 지운다(링크는 따로 그린다). */
export function stripCitations(text: string): string {
  return text.replace(/\[(?:t:\d+|T:\d+|act:[0-9a-f][^\]]*)\]/g, '').replace(/\s{2,}/g, ' ').trim();
}
