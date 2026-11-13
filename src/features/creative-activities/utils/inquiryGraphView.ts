// 주제군을 지식 그래프로 — `inquiry_*` → `KgJson` 어댑터.
//
// 프로젝트에 이미 있는 `KnowledgeGraphViewer`(Cytoscape)를 그대로 쓴다. 그 뷰어는 `KgJson`
// (학생 KG 스킬 출력 포맷)을 받으므로 여기서 모양을 맞춘다 — **새 그래프 컴포넌트를 만들지 않는다.**
//
// ── 이 그래프가 답하는 질문 ────────────────────────────────────────────────
// **"이 활동들은 왜 한 묶음이 됐나."** 목록은 무엇이 있는지 보여 주지만 왜 모였는지는 말하지 않는다.
// 개념 노드가 그 다리다 — 여러 활동이 같은 개념에 붙어 있는 것이 군집의 근거다.
//
// ── 무엇을 넣지 않는가 ─────────────────────────────────────────────────────
// **학생 노드를 만들지 않는다**(KG 연구 §v7 의 확정 설계). 탐색 단위는 탐구이지 사람이고,
// 학생을 중심에 두면 노드의 절반이 그 허브에 매달려 활동 간 관계가 안 보인다.
// **한 활동에만 붙은 개념도 넣지 않는다** — 다리 노릇을 못 하면서 화면만 채운다.
import type { KgEntity, KgJson } from '@/services/studentKgService';
import type { InquiryActivity, InquiryLevel } from '../types';

/** 수준 색 — 어두울수록 깊다. L0 만 회색으로 빼 "탐구 아님"을 계열에서 분리한다. */
const LEVEL_COLOR: Record<InquiryLevel, string> = {
  0: '#94A3B8', // slate-400
  1: '#7DD3FC', // sky-300
  2: '#38BDF8', // sky-400
  3: '#6366F1', // indigo-500
  4: '#7C3AED', // violet-600
};
const CONCEPT_COLOR = '#0891B2'; // cyan-600 — 뷰어의 기존 Concept 색과 같다
const UNGRADED_COLOR = '#CBD5E1';

export const THEME_GRAPH_LEGEND = [
  { color: LEVEL_COLOR[4], label: 'L4 설계·확장' },
  { color: LEVEL_COLOR[3], label: 'L3 분석·해석' },
  { color: LEVEL_COLOR[2], label: 'L2 이해·적용' },
  { color: LEVEL_COLOR[1], label: 'L1 수행·보고' },
  { color: LEVEL_COLOR[0], label: 'L0 비탐구' },
  { color: CONCEPT_COLOR, label: '개념' },
];

export interface ThemeGraphInput {
  activities: InquiryActivity[];
  /** 활동↔개념 — 이 주제군 안에서 **2건 이상**에 붙은 개념만 온다 */
  links: { activity_id: string; concept_key: string }[];
  conceptLabels: Map<string, string>;
  /** 활동 사이의 엣지(DEEPENED_FROM · SIMILAR_TO) */
  edges: { source_id: string; target_id: string; type: string }[];
}

/** 노드 색을 정한다 — 개념이면 개념 색, 활동이면 **수준** 색. */
export function themeNodeColor(e: KgEntity): string | undefined {
  if (e.type === 'Concept') return CONCEPT_COLOR;
  const lv = (e as KgEntity & { level?: number | null }).level;
  if (lv == null) return UNGRADED_COLOR;
  return LEVEL_COLOR[lv as InquiryLevel] ?? UNGRADED_COLOR;
}

/**
 * `KgJson` 으로 접는다.
 *
 * `KgJson` 은 학생 KG 포맷이라 `student_code`·`source_stats` 같은 필수 필드가 있는데,
 * 여기서는 **뷰어가 읽지 않는 자리**라 최소값만 채운다. 학생 코드 자리에는 주제군 이름을 넣는다
 * (사람 이름을 넣을 자리가 아니고, 넣을 값도 없다 — 뷰에는 `student_code` 가 없다).
 */
export function toKgJson(themeName: string, input: ThemeGraphInput): KgJson {
  const { activities, links, conceptLabels, edges } = input;
  const actIds = new Set(activities.map((a) => a.id));

  const entities: KgEntity[] = activities.map((a) => ({
    id: a.id,
    type: 'Activity',
    name: a.title,
    confidence: 1,
    sources: [{
      category: a.area,
      subject: a.subject_name ?? '',
      grade: a.grade ?? 0,
      semester: null,
    }],
    evidence: [],
    // 뷰어는 모르는 필드를 그냥 지나치고, `themeNodeColor` 가 이것을 읽는다
    ...(a.level != null ? { level: a.level } : {}),
  } as KgEntity));

  const usedConcepts = new Set(links.map((l) => l.concept_key));
  for (const key of usedConcepts) {
    entities.push({
      id: `c:${key}`,
      type: 'Concept',
      name: conceptLabels.get(key) ?? key,
      confidence: 1,
      sources: [],
      evidence: [],
    });
  }

  const triples = [
    ...links
      .filter((l) => actIds.has(l.activity_id))
      .map((l) => ({ subject: l.activity_id, predicate: '개념', object: `c:${l.concept_key}`, confidence: 1 })),
    // 활동 사이 엣지는 **양 끝이 이 주제군 안에 있을 때만** — 밖으로 향한 엣지는 끊긴 선이 된다
    ...edges
      .filter((e) => actIds.has(e.source_id) && actIds.has(e.target_id))
      .map((e) => ({
        subject: e.source_id,
        predicate: e.type === 'DEEPENED_FROM' ? '심화' : '유사',
        object: e.target_id,
        confidence: 1,
      })),
  ];

  return {
    student_code: themeName,
    extracted_at: new Date().toISOString(),
    source_stats: {} as KgJson['source_stats'],
    entities,
    triples,
  };
}
