// LLM-driven improvement direction analysis.
//
// Replaces the previous heuristic count-based weakness detector. The pipeline
// already extracts activities reliably, so "too few activities" is not a real
// weakness signal — it is a measurement artifact. Instead we let the LLM read
// the full Activity/Competency/Concept subgraph and reason about content gaps.
//
// Output shape: a list of ImprovementDirection objects, each carrying both a
// short `summary` (shown collapsed in the UI) and a full `detail` body (shown
// when the user expands the card). The DB column is still called `weaknesses`
// for backwards compatibility; we store the new shape into it.

import type { KgEntityRow, KgRelationRow } from './compute-metrics.ts';
import { callChat, InquiryProvider } from './providers.ts';

export interface ImprovementDirection {
  id: string;
  summary: string;
  detail: string;
  related_entity_ids: string[];
  suggested_anchor_subjects: string[];
  priority: number;
}

export interface AnalyzeInput {
  currentGrade: number;
  enrolledSubjectNames: string[];
  entities: KgEntityRow[];
  relations: KgRelationRow[];
  // Optional teacher-supplied guidance: career target, desired pivot, focus
  // area, etc. Injected after the KG context so it weights the analysis
  // without anchoring before evidence has been read.
  userGuidance?: string;
}

export interface AnalyzeResult {
  directions: ImprovementDirection[];
  model: string;
  provider: InquiryProvider;
  tokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

const FOCUS_TYPES = new Set(['Activity', 'Competency', 'Concept']);

type SourceLite = { subject?: string | null; grade?: number | null; semester?: number | null };

// Splits entities of a given type into three buckets based on the grades found
// in their `properties.sources`:
//   - 지난 학년 (all source grades < currentGrade): diagnostic input
//   - 현재 학년 (any source grade === currentGrade): in-progress
//   - 학년 미분류 (no grade info, e.g. cross-year competencies): treat as context
// Empty sections are omitted from the output.
function formatEntitiesOfType(entities: KgEntityRow[], typeFilter: string, currentGrade: number): string {
  const items = entities.filter((e) => e.type === typeFilter);
  if (items.length === 0) return '(없음)';

  const past: string[] = [];
  const current: string[] = [];
  const unknown: string[] = [];

  for (const e of items) {
    const sources = (e.properties?.sources as SourceLite[] | undefined) ?? [];
    const grades = Array.from(
      new Set(sources.map((s) => s.grade).filter((g): g is number => typeof g === 'number'))
    );
    const sourceTags = Array.from(
      new Set(
        sources
          .map((s) => `${s.subject ?? '?'}/${s.grade ?? '?'}학년`)
          .filter((t) => t !== '?/?학년')
      )
    ).join(', ');
    const descRaw = e.properties?.description;
    const desc =
      typeof descRaw === 'string' && descRaw.trim().length > 0
        ? ` — ${descRaw.trim().slice(0, 140)}`
        : '';
    const line = `  - [${e.entity_id}] ${e.label}${sourceTags ? ` (${sourceTags})` : ''}${desc}`;

    if (grades.length === 0) {
      unknown.push(line);
    } else if (grades.every((g) => g < currentGrade)) {
      past.push(line);
    } else if (grades.some((g) => g === currentGrade)) {
      current.push(line);
    } else {
      unknown.push(line);
    }
  }

  const sections: string[] = [];
  if (past.length > 0) sections.push(`◆ 지난 학년 (1~${currentGrade - 1}학년) — 진단 대상\n${past.join('\n')}`);
  if (current.length > 0) sections.push(`◆ 현재 학년 (${currentGrade}학년) — 진행 중 / 부분 누적\n${current.join('\n')}`);
  if (unknown.length > 0) sections.push(`◆ 학년 미분류 (누적/교차 학년)\n${unknown.join('\n')}`);
  return sections.join('\n\n');
}

function formatEdges(entities: KgEntityRow[], relations: KgRelationRow[]): string {
  const byId = new Map(entities.map((e) => [e.entity_id, e]));
  const focusIds = new Set(
    entities.filter((e) => FOCUS_TYPES.has(e.type)).map((e) => e.entity_id)
  );
  const scored: Array<{ rank: number; line: string }> = [];
  for (const r of relations) {
    if (!focusIds.has(r.source_entity_id) && !focusIds.has(r.target_entity_id)) continue;
    const s = byId.get(r.source_entity_id);
    const t = byId.get(r.target_entity_id);
    if (!s || !t) continue;
    scored.push({
      rank: edgeRank(r.relation_type, s.type, t.type),
      line: `- ${s.label}(${s.type}) -[${r.relation_type}]-> ${t.label}(${t.type})`,
    });
  }
  if (scored.length === 0) return '(없음)';

  // **상한을 둔다.** 실측(2026-09-12, 00-00239): 엣지 블록이 21,491자 259줄로
  // 프롬프트 전체의 **81%** 를 먹었다. 엣지를 뺀 같은 요청은 59초 → 22초로 줄고
  // 결과 품질은 같았다. 프롬프트가 길수록 Solar 가 추론만 하고 본문 없이 끝나는
  // 빈도가 올라가므로(관측된 실패: `finish_reason=stop` · content 0자), 이건
  // 속도뿐 아니라 **성공률**의 문제다.
  scored.sort((a, b) => a.rank - b.rank);
  const kept = scored.slice(0, MAX_EDGE_LINES);
  const omitted = scored.length - kept.length;
  return omitted > 0
    ? `${kept.map((x) => x.line).join('\n')}\n- … 관계 ${omitted}개 생략(서사·흐름 관계 우선 ${MAX_EDGE_LINES}개만 표시)`
    : kept.map((x) => x.line).join('\n');
}

/**
 * 프롬프트에 실을 관계 줄 수 상한. 실측 기준 259줄 → 120줄이면 21.5KB 가 ~10KB 로 준다.
 * 잘라도 되는 이유: 남기는 순서가 **서사 > 흐름 > 개념 > 나머지** 라, 버려지는 것은
 * 거의 전부 "활동 하나에 잎 하나"인 펜던트 관계다(그 학생 KG 의 다수를 차지하지만
 * 노드 목록에 이미 같은 정보가 있다).
 */
const MAX_EDGE_LINES = 120;

/**
 * 공급자별 **출력 예산**. 이 값이 곧 벽시간이다 (2026-09-12 실측, 00-00239 · 3회씩).
 *
 * | 설정 | 시간 | 추론 토큰 |
 * |---|---|---|
 * | medium · 3~6개 | 52 / **107** / 52초 | 4,720~6,576 |
 * | low · 3~6개    | 35 / **93** / 57초  | 2,399~4,096 |
 * | **low · 3개·3문장** | **22 / 30 / 27초** | 2,333~4,096 |
 *
 * 엣지 함수 벽시간은 150초이고 준비 단계는 LLM 을 두 번(위생 → 방향) 부른다.
 * `low` 만으로는 최악 93초라 예산에 너무 가깝고, **긴 꼬리를 없애는 것은 출력 상한**이다.
 * 그래서 Solar 에만 둘을 함께 건다 — OpenAI 는 현재 설정으로 제때 끝나므로
 * 방향 개수를 줄일 이유가 없다(줄이면 쓰지도 않을 여유를 위해 결과를 깎는 것이다).
 */
const OUTPUT_BUDGET = {
  solar: { count: '3~4개', detail: '2~3문장', effort: 'low' as const },
  openai: { count: '3~6개', detail: '3~5문장', effort: undefined },
};

/** 작을수록 먼저 남는다. */
function edgeRank(relationType: string, sourceType: string, targetType: string): number {
  if (relationType === 'DEEPENED_FROM' || relationType === 'DEVELOPS_INTO') return 0; // 종단 서사
  if (relationType === 'PART_OF') return 1;                                            // 흐름 소속
  if (sourceType === 'Activity' && targetType === 'Activity') return 2;                // 활동↔활동
  if (sourceType === 'Concept' || targetType === 'Concept') return 3;                  // 개념 연결
  return 4;
}

function buildPrompt(
  input: AnalyzeInput,
  budget: (typeof OUTPUT_BUDGET)['solar' | 'openai'],
): { system: string; user: string } {
  const system = `당신은 한국 고등학생 학생부의 종단성·깊이·다양성을 분석하는 입시 컨설턴트입니다.
주어진 지식 그래프(Activity·Competency·Concept 노드와 그 주변 관계)를 reasoning으로 읽어
학생부를 보완하면 좋을 *방향*을 도출합니다.

【분석 원칙】
0. **분석 목적 = 현재 학년(${input.currentGrade}학년)에 무엇을 할지 *계획*하기 위함**.
   - 진단 대상: 1~${input.currentGrade - 1}학년의 누적 활동/역량/개념 패턴.
   - 계획 대상: 현재 학년 — 여기에 무엇을 채울지 도출.
   - 따라서 *"현재 학년에 활동이 없다/적다"는 약점이 아니다*. 그것은 지금부터 채울 빈 캔버스다.
   - "이전 학년에서 X가 시작되었으나 깊이가 얕으니 현재 학년에 Y로 심화" / "1·2학년에 흩어진 Z가 한 줄기로 묶이지 못했으니 현재 학년에 W 탐구로 통합" 형태로 진단→처방을 잇는다.
   ${input.currentGrade === 1
      ? '- 현재 학년이 1학년인 경우: 누적 활동이 없으므로 "출발점 설계" 모드. 이수 과목과 latent interest/concept에서 초기 활동 방향을 도출.'
      : ''}
1. *내용*과 *연결 구조*를 본다. 단순히 노드 개수가 적은 것은 약점이 아니다.
   Activity entity는 추출 파이프라인에서 충분히 수집되어 있다고 전제한다.
2. 다음 관점을 가능한 만큼 활용하되, KG에서 실제로 관찰되는 패턴 위주로 도출한다:
   - 종단성 (longitudinal cohesion): 1~${input.currentGrade - 1}학년에서 시작된 흥미·역량이 현재 학년에 어떻게 누적/심화될 수 있는지
   - 깊이 (critical depth): 이전 학년 활동의 description에 비판적 분석·실험 설계·데이터 활용·정량 결과가 부족했다면 현재 학년에 어떻게 채울지
   - 다양성 (evidence breadth): 이전 학년에 한쪽 과목으로 쏠린 역량이 있다면 현재 학년 다른 과목으로 어떻게 확장할지
   - 응집성 (thematic clustering): 이전 학년에 흩어진 활동들을 현재 학년에 어떤 줄기로 묶을지
   - 미사용 잠재력 (latent potential): 이전 학년의 개념/관심사 중 활동으로 발현되지 못한 것을 현재 학년에 어떻게 살릴지
3. 각 보완 방향은 KG의 *구체적 entity*를 근거로 지목한다 (related_entity_ids 필수). 근거는 *지난 학년* entity를 우선 인용한다.
4. detail은 학생/교사가 읽었을 때 다음 행동을 결정할 수 있을 만큼 구체적으로 적는다. 학생 개인을 지칭하지 않고 KG 패턴만 지적한다.

【출력 JSON 스키마】
{
  "directions": [
    {
      "id": "dir-1",
      "summary": "40자 내외 한 줄 요약 (UI 카드 헤더)",
      "detail": "원문 분석 ${budget.detail}. 어떤 KG entity의 어떤 패턴을 보고 어떤 보완이 필요한지, 학생이 즉시 취할 수 있는 다음 단계 힌트 1문장 포함.",
      "related_entity_ids": ["entity_id_여기에", "..."],
      "suggested_anchor_subjects": ["현 학기 이수 과목 중 매칭되는 것"],
      "priority": 7
    }
  ]
}

생성 개수: ${budget.count}. priority는 1(낮음)~10(높음). **간결하게 쓴다 — 길이가 아니라 근거의 구체성으로 값을 한다.**
related_entity_ids는 반드시 입력 KG에 실제 존재하는 entity_id만 사용한다.`;

  const enrolledBlock = input.enrolledSubjectNames.join(', ') || '(없음)';
  const activityBlock = formatEntitiesOfType(input.entities, 'Activity', input.currentGrade);
  const competencyBlock = formatEntitiesOfType(input.entities, 'Competency', input.currentGrade);
  const conceptBlock = formatEntitiesOfType(input.entities, 'Concept', input.currentGrade);
  const edgeBlock = formatEdges(input.entities, input.relations);

  const guidanceTrimmed = (input.userGuidance ?? '').trim();
  const guidanceBlock = guidanceTrimmed
    ? `

【추가 컨텍스트 / 요청 방향성】 (사용자 입력 — 학생 또는 교사)
${guidanceTrimmed}

위 컨텍스트는 분석에 반영하되, KG에서 실제로 관찰되지 않는 내용을 추측해서 만들지 말 것.
원하는 방향성이 기존 KG 패턴과 다르다면, KG의 어떤 자원을 활용해 그 방향으로 전환·확장할 수 있는지 명시한다.`
    : '';

  const user = `【학년】 ${input.currentGrade}학년 (계획 대상)

【현 학기 이수 과목】
${enrolledBlock}

【Activity 노드】
${activityBlock}

【Competency 노드】
${competencyBlock}

【Concept 노드】
${conceptBlock}

【관계 (Activity/Competency/Concept 인접 엣지)】
${edgeBlock}${guidanceBlock}

【작업】
위 KG를 reasoning으로 분석하여, 지난 학년 패턴을 근거로 현재 학년(${input.currentGrade}학년)에 보완할 방향 ${budget.count}를 위 JSON 스키마로 출력하세요.
각 direction은 summary(짧은 헤더)와 detail(원문 분석)을 모두 포함해야 합니다.`;

  return { system, user };
}

function validateAndCoerce(
  raw: unknown,
  kgEntityIds: Set<string>,
  enrolledSet: Set<string>
): ImprovementDirection[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = (raw as { directions?: unknown }).directions;
  if (!Array.isArray(list)) return [];

  const out: ImprovementDirection[] = [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (!r || typeof r !== 'object') continue;
    const obj = r as Record<string, unknown>;
    const summary = String(obj.summary ?? '').trim();
    const detail = String(obj.detail ?? '').trim();
    if (!summary || !detail) continue;
    const id = String(obj.id ?? `dir-${i + 1}`);
    const refs = Array.isArray(obj.related_entity_ids)
      ? (obj.related_entity_ids as unknown[]).map(String).filter((id) => kgEntityIds.has(id))
      : [];
    const anchors = Array.isArray(obj.suggested_anchor_subjects)
      ? (obj.suggested_anchor_subjects as unknown[])
          .map(String)
          .filter((s) => enrolledSet.size === 0 || enrolledSet.has(s))
      : [];
    const priorityRaw = Number(obj.priority);
    const priority = Number.isFinite(priorityRaw) ? Math.max(1, Math.min(10, priorityRaw)) : 5;
    out.push({ id, summary, detail, related_entity_ids: refs, suggested_anchor_subjects: anchors, priority });
  }
  out.sort((a, b) => b.priority - a.priority);
  return out;
}

export async function analyzeImprovementDirections(
  input: AnalyzeInput,
  provider: InquiryProvider = 'openai',
  request?: typeof fetch
): Promise<AnalyzeResult> {
  const budget = provider === 'openai' || provider === 'gpt-5-mini'
    ? OUTPUT_BUDGET.openai
    : OUTPUT_BUDGET.solar;
  const { system, user } = buildPrompt(input, budget);
  // Direction analysis is shorter output than the full recommendation step, so
  // the OpenAI token cap is more modest.
  const { content, usage, model } = await callChat(provider, system, user, {
    maxCompletionTokens: 8000,
    reasoningEffort: budget.effort,
    request,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`direction LLM returned non-JSON: ${(e as Error).message} :: ${content.slice(0, 200)}`);
  }

  const kgEntityIds = new Set(input.entities.map((e) => e.entity_id));
  const enrolledSet = new Set(input.enrolledSubjectNames);
  const directions = validateAndCoerce(parsed, kgEntityIds, enrolledSet);

  if (directions.length === 0) {
    throw new Error('direction LLM produced 0 valid directions');
  }

  return {
    directions,
    model,
    provider,
    tokenUsage: {
      prompt_tokens: usage.prompt_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? 0,
      total_tokens:
        usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
    },
  };
}

export const FORMULA_VERSION = 'v2-llm-directions';
