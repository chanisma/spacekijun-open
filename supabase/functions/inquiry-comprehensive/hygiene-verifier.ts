// LLM verifier for KG hygiene candidates.
//
// Pipeline:
//   embedding → candidate pool (recall-focused, low threshold)
//        ↓
//   LLM verifier → final accept set (precision-focused)
//
// One batched OpenAI call per prepare (GPT-4o-mini, JSON mode).
// Cost cap: MAX_CANDIDATES total pairs across both kinds.

import type { DuplicateCluster, HygieneFindings, InferredEdge } from './graph-hygiene.ts';
import { callOpenAI, callSolar, InquiryProvider, isSolarProvider } from './providers.ts';

const MAX_CANDIDATES = 30;
// 판정만 하는 짧은 호출. 구 gpt-4o-mini에서 본 모델로 통일(2026-07-31) —
// prepare 1회당 최대 30쌍이라 호출 비용은 그만큼 올라간다.
const VERIFIER_MODEL = 'gpt-6-luna';

interface VerifierItem {
  id: string;
  kind: 'duplicate' | 'missing_edge';
  payload: string;
}

interface VerifierResult {
  id: string;
  verdict: 'duplicate' | 'distinct' | 'related' | 'unrelated';
  reason?: string;
}

export interface VerificationReport {
  considered: number;
  acceptedDuplicates: number;
  acceptedMissingEdges: number;
  rejected: number;
  reasonsRejected: Array<{ kind: string; pair: string; reason: string }>;
  tokenUsage: { promptTokens: number; completionTokens: number };
}

function buildItems(candidates: HygieneFindings): VerifierItem[] {
  const items: VerifierItem[] = [];

  candidates.duplicate_clusters.forEach((cluster, idx) => {
    // Pairwise expansion within the cluster — verify each non-canonical against canonical
    const [canonicalLabel, ...rest] = cluster.member_labels;
    rest.forEach((other, j) => {
      items.push({
        id: `dup-${idx}-${j}`,
        kind: 'duplicate',
        payload: `[${cluster.type}] "${canonicalLabel}" vs "${other}" (sim=${cluster.max_similarity.toFixed(2)})`,
      });
    });
  });

  candidates.missing_edges.forEach((edge, idx) => {
    items.push({
      id: `me-${idx}`,
      kind: 'missing_edge',
      payload: `Activity "${edge.source_label}" → ${edge.target_type} "${edge.target_label}" (sim=${edge.similarity.toFixed(2)})`,
    });
  });

  // Cap to MAX_CANDIDATES, preferring stronger signals (already sorted upstream).
  return items.slice(0, MAX_CANDIDATES);
}

function buildPrompt(items: VerifierItem[]): { system: string; user: string } {
  const system = `당신은 한국 고등학생의 학생부 지식그래프(KG)를 점검하는 보조입니다.
KG에는 Activity(활동), Interest(관심분야), Thread(탐구 스레드 = 활동 묶음), Concept(개념), Competency(역량) 같은 노드가 있습니다.

두 종류 후보를 분류합니다.

【1. duplicate 판정】
두 라벨이 **실질적으로 같은 것을 다르게 표기**한 경우에만 'duplicate'. 의대 입시 평가관이 학생부에서 두 항목을 따로 보고 싶어할 정도면 'distinct'.

✓ 'duplicate' 인정 (표기·약어·동의어):
- "신경과학" vs "신경과학/정신건강" (표기 변형)
- "AI" vs "인공지능" (약어/원어)
- "의료 AI" vs "의료 인공지능" (영문 약어/한글)
- "의학" vs "의학/의료" (실질 동일)

✗ 'distinct' 유지 (관련되지만 다른 분야):
- "의학/의료" vs "신경과학/정신건강" — 의학의 일반 영역 vs 특정 하위 분야
- "의학/의료" vs "의료 인공지능" — 전통 의료 vs AI 기반 의료, 평가관 입장에서 따로 봐야 할 차별화 포인트
- "신경과학/정신건강" vs "의료 인공지능" — 도구(AI) vs 대상(뇌·정신)
- "비판적 사고력" vs "융합적 사고력" — 다른 사고 양식

원칙: **의미 도메인이 다르면 무조건 distinct**. 표기 변형만 duplicate.

【2. missing_edge 판정】
source가 target과 의미적으로 관련되어 KG에서 연결됐어야 하는가?

✓ 'related' 인정:
- Activity "지니계수-의료불평등 탐구" → Interest "의학/의료" (의료 불평등은 의학 주제)
- Activity "MRI 원리-AI 탐구" → Interest "의료 인공지능" (의료 영상 AI)
- Thread "의료 AI 탐구" → Interest "의료 인공지능" (Thread realizes Interest)

✗ 'unrelated' 거부:
- Activity "AI 핀치 부리 분류" → Interest "의료 인공지능" (다윈의 핀치 분류는 의료 아님)
- Activity "사형제도 분석·토론" → Concept "푸리에 분석" (정치학과 수학은 무관)

엄격하게 판단. 애매하면 보수적으로 'distinct'/'unrelated' 선택.

JSON 출력: { "results": [{ "id": "...", "verdict": "...", "reason": "한 문장" }] }
verdict는 항상 "duplicate" | "distinct" | "related" | "unrelated" 중 하나.`;

  const listing = items
    .map((it) => `- id="${it.id}" type=${it.kind} :: ${it.payload}`)
    .join('\n');
  const user = `다음 ${items.length}개 후보를 분류해주세요:\n\n${listing}`;
  return { system, user };
}

/**
 * 판정은 라벨 비교라 결정성이 중요하므로 Solar 는 temperature 0. Solar를 고르면 정리
 * 단계까지 Solar로 돌아 prepare 파이프라인 전체가 한 공급자로 완결된다.
 * ⚠️ luna 에는 temperature 를 보내지 않는다(기본값 1 만 받는다 — 2026-10-25 «does not support 0»).
 *    `callOpenAI` 의 400 재시도가 결과는 살리지만, 첫 시도가 `aiFetch` 로 나가 AI 기록에 «실패»가 남았다.
 */
async function callVerifier(
  provider: InquiryProvider,
  system: string,
  user: string,
  request?: typeof fetch
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const reply = isSolarProvider(provider)
    // 추론을 **낮춘다**(2026-09-12). 이 단계는 "라벨이 같은 것을 가리키나"를 가르는
    // 분류 과제라 깊은 추론이 값을 하지 않는데, pro4 의 medium 은 30~60초를 먹는다.
    // 준비 단계는 LLM 을 두 번(위생 → 방향) 연달아 부르고 엣지 함수 벽시간이 150초라,
    // 이 한 호출이 길어지면 **전체가 504 로 끊긴다**(실측: 두 번 다 ~150초에 끊김).
    ? await callSolar(system, user, { temperature: 0, reasoningEffort: 'low', request })
    : await callOpenAI(system, user, { model: VERIFIER_MODEL, request });
  return {
    content: reply.content || '{"results":[]}',
    promptTokens: reply.usage?.prompt_tokens ?? 0,
    completionTokens: reply.usage?.completion_tokens ?? 0,
  };
}

export async function verifyHygiene(
  candidates: HygieneFindings,
  provider: InquiryProvider = 'openai',
  request?: typeof fetch
): Promise<{ hygiene: HygieneFindings; report: VerificationReport }> {
  const items = buildItems(candidates);
  if (items.length === 0) {
    return {
      hygiene: candidates,
      report: {
        considered: 0,
        acceptedDuplicates: 0,
        acceptedMissingEdges: 0,
        rejected: 0,
        reasonsRejected: [],
        tokenUsage: { promptTokens: 0, completionTokens: 0 },
      },
    };
  }

  const { system, user } = buildPrompt(items);
  const { content, promptTokens, completionTokens } = await callVerifier(provider, system, user, request);

  let parsed: { results?: VerifierResult[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`LLM verifier returned non-JSON: ${content.slice(0, 200)}`);
  }
  const verdicts = new Map<string, VerifierResult>();
  for (const r of parsed.results ?? []) verdicts.set(r.id, r);

  // Filter duplicate_clusters: a cluster survives only if EVERY non-canonical
  // member is confirmed 'duplicate'. If any member is 'distinct', drop the whole
  // cluster (conservative — partial merges are confusing).
  const acceptedClusters: DuplicateCluster[] = [];
  const rejected: VerificationReport['reasonsRejected'] = [];

  candidates.duplicate_clusters.forEach((cluster, idx) => {
    const [, ...rest] = cluster.member_labels;
    let allConfirmed = true;
    for (let j = 0; j < rest.length; j++) {
      const r = verdicts.get(`dup-${idx}-${j}`);
      if (!r || r.verdict !== 'duplicate') {
        allConfirmed = false;
        rejected.push({
          kind: 'duplicate',
          pair: `${cluster.member_labels[0]} vs ${rest[j]}`,
          reason: r?.reason ?? 'no verdict from LLM',
        });
        break;
      }
    }
    if (allConfirmed) acceptedClusters.push(cluster);
  });

  const acceptedEdges: InferredEdge[] = [];
  candidates.missing_edges.forEach((edge, idx) => {
    const r = verdicts.get(`me-${idx}`);
    if (r?.verdict === 'related') {
      acceptedEdges.push(edge);
    } else {
      rejected.push({
        kind: 'missing_edge',
        pair: `${edge.source_label} → ${edge.target_label}`,
        reason: r?.reason ?? 'no verdict from LLM',
      });
    }
  });

  return {
    hygiene: {
      duplicate_clusters: acceptedClusters,
      missing_edges: acceptedEdges,
    },
    report: {
      considered: items.length,
      acceptedDuplicates: acceptedClusters.length,
      acceptedMissingEdges: acceptedEdges.length,
      rejected: rejected.length,
      reasonsRejected: rejected,
      tokenUsage: { promptTokens, completionTokens },
    },
  };
}
