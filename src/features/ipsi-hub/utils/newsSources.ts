// 입시 기사 출처 — 단일 출처 (2026-11-09).
//
// 종전에는 카드·목록·AI 분석 선택/검토·프롬프트가 출처 표를 각자 들고 있었다(SOURCE_META 4벌 + SOURCE_LABEL).
// 값이 하나 늘면 다섯 곳을 고쳐야 했고, 하나라도 빠지면 `SOURCE_META[item.source].label` 이 undefined 에서 터져
// 피드 화면 전체가 깨졌다. 이제 여기 한 곳이고, 모르는 값이 와도 회색 배지로 그린다.
//
// 짝: DB CHECK educational_news_source_check · SQL mcp_private.ipsi_source_label · get_ipsi_hub_feed 의 출처 이름(검색).
// 'manual' = MCP add_ipsi_news 로 교사·관리자가 직접 더한 기사(진학사·유웨이 주소가 아닌 것).
// 'riroschool' 은 리로스쿨 사이트가 아니라 수집기가 리로스쿨 enews 로 모은 여러 언론사 기사 묶음이다.

export const NEWS_SOURCES = ['jinhak', 'uway', 'riroschool', 'manual'] as const;
export type NewsSource = (typeof NEWS_SOURCES)[number];

export const NEWS_SOURCE_LABEL: Record<NewsSource, string> = {
  jinhak: '진학사',
  uway: '유웨이',
  riroschool: '리로스쿨',
  manual: '직접 추가',
};

// 배지 색 두 벌 — 피드 카드·목록(strong)과 AI 분석 선택·검토(soft)가 원래 다른 글자 농도를 쓴다.
// Tailwind 가 클래스를 찾을 수 있게 문자열을 통째로 적는다(조립 금지).
const BADGE_STRONG: Record<NewsSource, string> = {
  jinhak: 'bg-blue-100 text-blue-800',
  uway: 'bg-green-100 text-green-800',
  riroschool: 'bg-purple-100 text-purple-800',
  manual: 'bg-amber-100 text-amber-800',
};
const BADGE_SOFT: Record<NewsSource, string> = {
  jinhak: 'bg-blue-100 text-blue-700',
  uway: 'bg-green-100 text-green-700',
  riroschool: 'bg-purple-100 text-purple-700',
  manual: 'bg-amber-100 text-amber-800',
};
const UNKNOWN_BADGE = 'bg-slate-100 text-slate-700';

export const isNewsSource = (v: unknown): v is NewsSource =>
  typeof v === 'string' && (NEWS_SOURCES as readonly string[]).includes(v);

/** 출처 배지 — 모르는 값이어도 깨지지 않는다(값 그대로 · 회색). */
export function newsSourceMeta(source: string, tone: 'strong' | 'soft' = 'strong'): { label: string; classes: string } {
  if (!isNewsSource(source)) return { label: source || '출처 없음', classes: UNKNOWN_BADGE };
  return { label: NEWS_SOURCE_LABEL[source], classes: (tone === 'soft' ? BADGE_SOFT : BADGE_STRONG)[source] };
}

export const newsSourceLabel = (source: string): string => newsSourceMeta(source).label;
