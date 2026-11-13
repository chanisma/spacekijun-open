// ========================================
// 나이스 화면 안내 목록 — `neis-kb/guides` 전체를 한 번에 싣는다 (2026-10-11)
//
// 할 일 카드의 [사용 방법]은 화면 하나만 필요해 지연 로딩(`neisKnowledgeLoader`)을 쓰지만,
// 둘러보기는 전체를 검색해야 하므로 한꺼번에 읽는다. 안내 파일은 작아서(200여 개) 이 모듈을
// 쓰는 페이지 청크 하나에 들어간다 — 이 모듈을 다른 화면에서 import 하지 말 것(앱 첫 화면이 무거워진다).
// ========================================

import { NEIS_CATALOG } from '@/data/neisScreens.generated';
import { parseNeisGuide, type NeisGuide } from '@/lib/neisScreenModel';

const files = import.meta.glob('/neis-kb/guides/**/*.json', { eager: true, import: 'default' });

/** 메뉴목록 차례 — 목록을 나이스 메뉴와 같은 순서로 보여 준다 */
const ORDER = new Map(NEIS_CATALOG.screens.map((screen, index) => [screen.key, index]));

export const NEIS_GUIDES: NeisGuide[] = Object.values(files)
  .map((raw) => parseNeisGuide(raw))
  .filter((guide): guide is NeisGuide => Boolean(guide))
  .sort((a, b) => (ORDER.get(a.key) ?? 1e9) - (ORDER.get(b.key) ?? 1e9));

export const NEIS_GUIDE_BY_KEY = new Map(NEIS_GUIDES.map((guide) => [guide.key, guide]));
export const NEIS_SCREEN_BY_KEY = new Map(NEIS_CATALOG.screens.map((screen) => [screen.key, screen]));

/** key 의 n 번째 칸 — 적용 범위 꼬리(`#학교`)는 뗀다 */
export function guideKeyPart(key: string, index: number): string {
  return key.split('›')[index]?.replace(/#.*$/, '') ?? '';
}

function haystack(guide: NeisGuide): string {
  return [
    guide.key, guide.purpose, guide.context, guide.who,
    ...(guide.before ?? []), ...(guide.after ?? []), ...(guide.cautions ?? []),
    ...guide.flows.flatMap((flow) => [flow.title, flow.when, ...flow.steps.flatMap((step) => [step.text, step.detail, ...(step.points ?? [])])]),
    ...(guide.faq ?? []).flatMap((item) => [item.q, item.a]),
  ].filter(Boolean).join(' ').toLowerCase();
}
const HAYSTACK = new Map(NEIS_GUIDES.map((guide) => [guide.key, haystack(guide)]));

/** 검색 — 낱말을 모두 품은 안내(화면 이름·용도·절차·주의·묻고 답하기 어디든) */
export function searchNeisGuides(query: string, unit: string | null): NeisGuide[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return NEIS_GUIDES.filter((guide) => (!unit || guideKeyPart(guide.key, 0) === unit)
    && words.every((word) => HAYSTACK.get(guide.key)!.includes(word)));
}

/** 단위업무별 안내 수(많은 순) — 필터 칩 */
export const NEIS_GUIDE_UNITS: Array<[string, number]> = (() => {
  const count = new Map<string, number>();
  for (const guide of NEIS_GUIDES) count.set(guideKeyPart(guide.key, 0), (count.get(guideKeyPart(guide.key, 0)) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1]);
})();
