/**
 * 신 파이프라인(§15) KG의 시각 언어.
 *
 * ── 구 스타일과 왜 나누는가 ─────────────────────────────────────────────────
 * 두 KG가 버전으로 공존하므로(§15) 구 KG를 보는 사용자의 화면은 조금도 달라지면 안 된다.
 * 그래서 구 `inquiryGraph.ts`를 고치지 않고 신 KG일 때만 이 모듈을 쓴다.
 *
 * ── 디자인 원칙 ────────────────────────────────────────────────────────────
 * 구 스타일은 타입마다 **색 11종 × 모양 8종**(diamond/star/hexagon/octagon…)을 썼다.
 * 모양이 많으면 화면이 산만하고, 46px 노드에서는 팔각형과 육각형이 구분되지도 않는다.
 *
 *   1. **모양은 2종.** 활동만 둥근 사각(시간·사건의 단위), 나머지는 원.
 *      구분은 색과 크기가 하고, 모양은 "활동인가 아닌가"만 말한다.
 *   2. **색은 의미 단위로 묶는다.** 11색 → 5계열. 색은 구분이지 장식이 아니다.
 *   3. **크기는 위계.** Thread > Activity > Concept > 자료·인물.
 *      신 KG는 Concept이 이미 "2개+ 활동에 겹치는 것"만 남아(§10) 잎이 없다.
 *   4. **테두리는 옅게.** 구 스타일의 2~3px 진한 테두리는 노드를 무겁게 만든다.
 */

/** 5계열. 각 계열 안에서는 명도로만 변주해 화면이 한 벌로 읽히게 한다. */
const V7_COLORS: Record<string, string> = {
  // 활동 — 그래프의 본체. 가장 진하고 채도가 높다.
  Activity: '#2563eb',
  // 흐름 — 활동을 관통하는 상위 컨테이너.
  Thread: '#7c3aed',
  // 개념 — 활동을 잇는 의미축.
  Concept: '#0891b2',
  // 자료·인물 — 활동에 딸린 근거.
  Book: '#0d9488',
  Person: '#0d9488',
  // 특성 — 역량·태도·성취(§8에서 조립 제외지만 옵션으로 얹을 수 있다).
  Competency: '#059669',
  Attitude: '#059669',
  Achievement: '#059669',
  Role: '#d97706',
  Interest: '#d97706',
};
const V7_FALLBACK = '#64748b';

export function v7EntityColor(type?: string | null): string {
  return V7_COLORS[type ?? ''] ?? V7_FALLBACK;
}

/** 모양은 2종뿐. 활동만 둥근 사각이고 나머지는 원이다. */
export function v7EntityShape(type?: string | null): string {
  return type === 'Activity' ? 'round-rectangle' : 'ellipse';
}

/**
 * 크기 = 위계. 구 스타일(46~74px)보다 전반적으로 작게 잡아 여백을 만든다.
 * 노드가 작아지면 라벨이 겹치지 않고 엣지가 보인다 — 신 KG는 엣지가 본체다(§12).
 */
export function v7NodeSize(type?: string | null): number {
  if (type === 'Thread') return 52;
  if (type === 'Activity') return 38;
  if (type === 'Concept') return 30;
  return 24;
}

export function v7NodeFontSize(type?: string | null): number {
  if (type === 'Thread') return 11;
  if (type === 'Activity') return 10;
  return 9;
}

/** 테두리는 존재만 알린다. 구 스타일의 2~3px는 작은 노드를 뭉개 보이게 했다. */
export function v7NodeBorderWidth(type?: string | null): number {
  return type === 'Thread' ? 2 : 1;
}

/**
 * 엣지는 **층**으로 읽는다. 신 KG의 엣지는 출처가 다르고 무게도 다르다(§12·§15):
 *   activity/recall — 활동↔활동. 그래프의 본체이자 §1이 0개였던 바로 그것
 *   thread          — 활동이 흐름에 속함. 구조선이라 점선으로 뒤로 뺀다
 *   concept         — 개념이 활동에 적용됨. 수가 많아(111개) 가장 옅게
 *   local           — 도서·인물. 잎이라 옅게
 */
export interface V7EdgeStyle {
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  opacity: number;
}

export function v7EdgeStyle(layer?: string | null, relationType?: string | null): V7EdgeStyle {
  // 심화는 시간 방향이 있는 유일한 관계라 굵기로 드러낸다.
  const deepened = relationType === 'DEEPENED_FROM';
  switch (layer) {
    case 'activity':
      return { color: deepened ? '#1d4ed8' : '#3b82f6', width: deepened ? 2.6 : 1.8, style: 'solid', opacity: 0.9 };
    case 'recall':
      // 회수 엣지(§12) — 베이스가 어휘 차이로 놓쳤던 연결. 출처를 색으로 남긴다.
      return { color: deepened ? '#b45309' : '#f59e0b', width: deepened ? 2.4 : 1.6, style: 'solid', opacity: 0.85 };
    case 'thread':
      return { color: '#a78bfa', width: 1.2, style: 'dashed', opacity: 0.55 };
    case 'concept':
      return { color: '#67e8f9', width: 0.9, style: 'solid', opacity: 0.4 };
    case 'local':
      return { color: '#5eead4', width: 0.9, style: 'solid', opacity: 0.45 };
    default:
      return { color: '#cbd5e1', width: 1, style: 'solid', opacity: 0.5 };
  }
}

/** 범례용. 화면에서 색이 무엇을 뜻하는지 말해주지 않으면 5계열도 소용이 없다. */
export const V7_LEGEND: { label: string; color: string; hint: string }[] = [
  { label: '활동', color: V7_COLORS.Activity, hint: '기록에서 분절한 탐구 활동' },
  { label: '탐구 흐름', color: V7_COLORS.Thread, hint: '3개 이상 활동을 관통하는 주제' },
  { label: '개념', color: V7_COLORS.Concept, hint: '2개 이상 활동에 겹치는 핵심 개념' },
  { label: '자료·인물', color: V7_COLORS.Book, hint: '도서·인물' },
  { label: '역할·관심', color: V7_COLORS.Role, hint: '역할·관심 분야' },
];

export const V7_EDGE_LEGEND: { label: string; color: string; hint: string }[] = [
  { label: '활동 연결', color: '#3b82f6', hint: '개념·도서 공유로 찾은 활동 간 관계' },
  { label: '회수 연결', color: '#f59e0b', hint: '어휘가 달라 놓쳤던 연결을 AI가 회수' },
  { label: '흐름 소속', color: '#a78bfa', hint: '활동이 탐구 흐름에 속함' },
  { label: '개념 적용', color: '#67e8f9', hint: '개념이 활동에 적용됨' },
];
