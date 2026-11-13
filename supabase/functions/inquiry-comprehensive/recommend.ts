// LLM-driven activity recommendation generation.
//
// Input: prepared metrics + teacher-curated weaknesses & anchor subjects + KG context.
// Output: 3-5 supplementary activity recommendations, JSON-validated.
//
// Validation strategy:
//   - Parse strict JSON (response_format=json_object).
//   - Drop referenced_entity_ids that don't exist in KG (don't fail whole rec).
//   - Drop anchor_subject not in the teacher-selected anchor list (log warning).
//   - If parse fails or array empty, throw — caller decides whether to retry.

import type { KgEntityRow } from './compute-metrics.ts';
import { callChat, InquiryProvider } from './providers.ts';

export interface RecommendationItem {
  rank: number;
  anchor_subject: string;
  title: string;
  description: string;
  rationale: string;
  connected_thread_labels: string[];
  connected_interest_labels: string[];
  strengthens_competencies: string[];
  referenced_entity_ids: string[];
}

interface DirectionLite {
  id: string;
  summary: string;
  detail: string;
  related_entity_ids: string[];
  suggested_anchor_subjects: string[];
  priority: number;
}

export interface GenerateInput {
  currentGrade: number;
  enrolledSubjectNames: string[];
  selectedDirections: DirectionLite[];
  selectedAnchorSubjects: string[];
  userNotes: string;
  kgEntities: KgEntityRow[];
  // Subset of metrics relevant to prompt context.
  threads: Array<{ label: string; activityCount: number; sourceSubjects: string[] }>;
  interests: Array<{ label: string; activityCount: number; bookCount: number }>;
  competencies: Array<{ label: string; subjectCount: number; subjects: string[] }>;
}

export interface GenerateResult {
  recommendations: RecommendationItem[];
  model: string;
  provider: InquiryProvider;
  tokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  invalidEntityRefs: string[];
  invalidAnchors: string[];
}

function summarizeKgEntities(entities: KgEntityRow[]): string {
  // Most useful for grounding: Thread, Interest, Competency, recent Activities, Books, Concepts.
  const byType = new Map<string, KgEntityRow[]>();
  for (const e of entities) {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type)!.push(e);
  }
  const sections: string[] = [];
  for (const t of ['Thread', 'Interest', 'Competency', 'Concept', 'Activity', 'Book']) {
    const items = byType.get(t) ?? [];
    if (items.length === 0) continue;
    const list = items
      .slice(0, 15)
      .map((e) => `  - ${e.entity_id}: ${e.label}`)
      .join('\n');
    sections.push(`[${t}] (${items.length}개)\n${list}`);
  }
  return sections.join('\n\n');
}

function buildPrompt(input: GenerateInput): { system: string; user: string } {
  const system = `당신은 한국 고등학생의 학생부 보완 활동을 설계하는 전문 입시 컨설턴트입니다.
의대·약대 등 의생명 계열 입시 기준에서 학생부의 종단 일관성·비판적 깊이·역량 다양성을 강화하는 활동을 설계합니다.

【원칙】
1. 모든 활동은 학생이 현재 학기에 이수하는 과목 중 하나에 anchor되어야 함 (세특에 들어갈 수 있도록).
2. 활동은 구체적이고 실행 가능해야 함 — "X에 대해 탐구한다" 수준의 모호함 금지. "X 논문의 Y 방법을 Z 데이터셋에 적용" 수준의 구체성.
3. 각 활동은 어떤 기존 KG 노드(thread/interest/concept)를 강화하는지 명시.
4. 의대 평가관 시각: 단순 호기심이 아닌 비판적 시각·데이터 분석·실험 설계가 드러나도록.

【출력 JSON 스키마】
엄격히 다음 구조로만 출력:
{
  "recommendations": [
    {
      "rank": 1,
      "anchor_subject": "현 학기 이수 과목 중 하나",
      "title": "30자 이내 활동명",
      "description": "1-2문장 활동 내용",
      "rationale": "어떤 보완 방향을 어떻게 해결하는지 한 문단 (3-4문장)",
      "connected_thread_labels": ["탐구 스레드 라벨 텍스트"],
      "connected_interest_labels": ["관심분야 라벨 텍스트"],
      "strengthens_competencies": ["역량 라벨 텍스트"],
      "referenced_entity_ids": ["entity_id 형태의 문자열"]
    }
  ]
}

⚠ 매우 중요한 규칙:
- connected_thread_labels / connected_interest_labels / strengthens_competencies 에는 entity_id가 아니라 **사람이 읽는 라벨 문자열**을 적는다.
  · 잘못된 예: "inte_dac6f21456", "comp_ce0c414071", "thr_7a83…"
  · 올바른 예: "의료 인공지능", "비판적 사고력", "융합 탐구"
- entity_id 형태(접두어_해시)는 오직 referenced_entity_ids 배열에만 들어간다.
- 입력에서 entity의 라벨을 찾을 수 없으면 그 항목은 *생략*한다 (ID를 그대로 적지 말 것).`;

  const enrolled = input.enrolledSubjectNames.join(', ');
  const anchors = input.selectedAnchorSubjects.join(', ');
  const threadsBlock = input.threads
    .map((t) => `- ${t.label} (활동 ${t.activityCount}개, source: ${t.sourceSubjects.join('·') || '없음'})`)
    .join('\n');
  const interestsBlock = input.interests
    .map((i) => `- ${i.label} (활동 ${i.activityCount}개, 책 ${i.bookCount}권)`)
    .join('\n');
  const competenciesBlock = input.competencies
    .map((c) => `- ${c.label} (${c.subjectCount}개 과목: ${c.subjects.join('·')})`)
    .join('\n');
  const labelById = new Map(input.kgEntities.map((e) => [e.entity_id, e.label]));
  const directionBlock = input.selectedDirections
    .map((d, i) => {
      const relatedWithLabels = d.related_entity_ids
        .map((id) => {
          const label = labelById.get(id);
          return label ? `${label}(${id})` : id;
        })
        .join(', ');
      return `${i + 1}. (우선도 ${d.priority}) ${d.summary}\n   ${d.detail}${
        relatedWithLabels ? `\n   관련 entity: ${relatedWithLabels}` : ''
      }`;
    })
    .join('\n');
  const kgBlock = summarizeKgEntities(input.kgEntities);

  const user = `【학년】 ${input.currentGrade}학년

【현 학기 이수 과목】
${enrolled}

【교사가 anchor로 지정한 과목】
${anchors || '(전체 enrolled)'}

【교사가 선택한 보완 방향】
${directionBlock}

${input.userNotes.trim() ? `【교사 메모】\n${input.userNotes.trim()}\n\n` : ''}【기존 KG 요약】
탐구 스레드:
${threadsBlock || '(없음)'}

관심 분야:
${interestsBlock || '(없음)'}

역량 evidence:
${competenciesBlock || '(없음)'}

KG 노드 (활동·도서·개념 포함):
${kgBlock}

【작업】
위 보완 방향을 해결하면서 anchor 과목 중 하나에 자연스럽게 들어맞는 보완 활동 3-5개를 생성하세요. 각 활동의 rationale은 어떤 보완 방향을 어떻게 해결하는지, 어떤 기존 KG 노드와 연결되는지 명확히 적어주세요.`;

  return { system, user };
}

function validateAndCoerce(
  raw: unknown,
  kgEntityIds: Set<string>,
  selectedAnchorSubjects: string[]
): { recommendations: RecommendationItem[]; invalidEntityRefs: string[]; invalidAnchors: string[] } {
  const invalidEntityRefs: string[] = [];
  const invalidAnchors: string[] = [];
  const anchorSet = new Set(selectedAnchorSubjects);

  if (!raw || typeof raw !== 'object') return { recommendations: [], invalidEntityRefs, invalidAnchors };
  const recs = (raw as { recommendations?: unknown }).recommendations;
  if (!Array.isArray(recs)) return { recommendations: [], invalidEntityRefs, invalidAnchors };

  // Entity-id strings can leak into label slots when the LLM misreads the schema.
  // Drop them so the UI doesn't render raw ids as labels.
  const idLike = /^[a-z]+_[a-z0-9]{6,}$/i;
  const cleanLabels = (arr: unknown): string[] =>
    Array.isArray(arr) ? (arr as unknown[]).map(String).filter((s) => !idLike.test(s)) : [];

  const cleaned: RecommendationItem[] = [];
  for (const r of recs) {
    if (!r || typeof r !== 'object') continue;
    const obj = r as Record<string, unknown>;
    const anchor = String(obj.anchor_subject ?? '');
    const title = String(obj.title ?? '').trim();
    const desc = String(obj.description ?? '').trim();
    if (!title || !desc) continue;

    if (anchorSet.size > 0 && !anchorSet.has(anchor)) {
      invalidAnchors.push(anchor);
      // keep the recommendation but flag it — teacher can see the disconnect.
    }

    const rawRefs = Array.isArray(obj.referenced_entity_ids) ? (obj.referenced_entity_ids as unknown[]) : [];
    const validRefs: string[] = [];
    for (const ref of rawRefs) {
      const refStr = String(ref);
      if (kgEntityIds.has(refStr)) validRefs.push(refStr);
      else invalidEntityRefs.push(refStr);
    }

    cleaned.push({
      rank: Number(obj.rank) || cleaned.length + 1,
      anchor_subject: anchor,
      title,
      description: desc,
      rationale: String(obj.rationale ?? '').trim(),
      connected_thread_labels: cleanLabels(obj.connected_thread_labels),
      connected_interest_labels: cleanLabels(obj.connected_interest_labels),
      strengthens_competencies: cleanLabels(obj.strengthens_competencies),
      referenced_entity_ids: validRefs,
    });
  }

  cleaned.sort((a, b) => a.rank - b.rank);
  return { recommendations: cleaned, invalidEntityRefs, invalidAnchors };
}

export async function generateRecommendations(
  input: GenerateInput,
  provider: InquiryProvider,
  request?: typeof fetch
): Promise<GenerateResult> {
  const { system, user } = buildPrompt(input);
  // OpenAI 경로의 상한은 reasoning 토큰과 최종 JSON 출력을 모두 감당할 만큼 넉넉하게.
  const { content, usage, model } = await callChat(provider, system, user, {
    maxCompletionTokens: 12000,
    request,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`LLM returned non-JSON: ${(e as Error).message} :: ${content.slice(0, 200)}`);
  }

  const kgEntityIds = new Set(input.kgEntities.map((e) => e.entity_id));
  const { recommendations, invalidEntityRefs, invalidAnchors } = validateAndCoerce(
    parsed,
    kgEntityIds,
    input.selectedAnchorSubjects
  );

  if (recommendations.length === 0) {
    throw new Error('LLM produced 0 valid recommendations');
  }

  return {
    recommendations,
    model,
    provider,
    tokenUsage: {
      prompt_tokens: usage.prompt_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? 0,
      total_tokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
    },
    invalidEntityRefs,
    invalidAnchors,
  };
}
