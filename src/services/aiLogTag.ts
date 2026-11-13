/**
 * AI 요청에 싣는 기록용 꼬리표 (2026-10-15 — 관리자 «AI 기록» 탭).
 *
 * `openai-proxy`·`solar-proxy` 의 `chatCompletion` 은 여러 기능이 같이 쓰는 범용 경로라, 서버는 요청만 보고는
 * «어느 기능의 호출인가»를 모른다. 그래서 브라우저가 **지금 화면 주소**를 실어 보내고, 서버가 그 첫 마디
 * (`/documents/…` → `documents`)를 기능 이름으로 쓴다. 호출부마다 기능 이름을 적지 않아도 되는 이유가 이것이다.
 *
 * - `feature` 는 화면 주소가 기능을 말해 주지 못할 때만 적는다(예: 한 화면 안의 서로 다른 AI 기능을 가르고 싶을 때).
 * - `label` 은 사람이 읽을 동작 이름 — `aiChat` 은 `errorPrefix` 를 그대로 싣는다.
 * - **본문은 싣지 않는다.** 서버도 이 꼬리표를 프롬프트에 섞지 않도록 params 에서 떼어 낸다.
 */
export interface AiLogTag {
  appPath: string | null;
  feature?: string;
  label?: string;
}

export function aiLogTag(label?: string | null, feature?: string): AiLogTag {
  const appPath = typeof window !== 'undefined' && window.location ? window.location.pathname : null;
  const tag: AiLogTag = { appPath };
  if (feature) tag.feature = feature;
  if (label) tag.label = label;
  return tag;
}
