// Builds a copy-paste-able prompt that asks an external LLM to flesh out a
// concrete activity design from one of the AI's recommended activities.
// Used by both the live ResultsPhase and the HistoryPanel; kept centralized so
// the template can evolve in one place.

import type { ComprehensiveRecommendation } from '../types';

const ENTITY_ID_RE = /^[a-z]+_[a-z0-9]{6,}$/i;

// Resolves any id-pattern strings to their KG labels; non-id values pass
// through. Unresolvable ids are dropped (we never want raw entity IDs in the
// final human-readable prompt). Empty/duplicate labels are also dedupe'd.
function cleanLabelList(raw: string[] | undefined, labelById: Map<string, string> | undefined): string[] {
  if (!raw || raw.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    const trimmed = String(v).trim();
    if (!trimmed) continue;
    let resolved = trimmed;
    if (ENTITY_ID_RE.test(trimmed)) {
      const label = labelById?.get(trimmed);
      if (!label) continue;
      resolved = label;
    }
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

export function buildActivityDesignPrompt(
  rec: ComprehensiveRecommendation,
  labelById?: Map<string, string>
): string {
  const threads = cleanLabelList(rec.connected_thread_labels, labelById);
  const interests = cleanLabelList(rec.connected_interest_labels, labelById);
  const competencies = cleanLabelList(rec.strengthens_competencies, labelById);

  const lines: string[] = [];
  lines.push('다음 학생부 보완 활동을 한국 고등학생 입시 기준(학생부 종합 평가)으로 구체적으로 설계해 주세요.');
  lines.push('');
  lines.push('# 활동 개요');
  lines.push(`- 제목: ${rec.title}`);
  if (rec.anchor_subject) lines.push(`- 앵커 과목: ${rec.anchor_subject}`);
  lines.push(`- 설명: ${rec.description}`);
  if (rec.rationale) lines.push(`- 보완 근거: ${rec.rationale}`);
  if (threads.length) lines.push(`- 연결 탐구 스레드: ${threads.join(', ')}`);
  if (interests.length) lines.push(`- 연결 관심 분야: ${interests.join(', ')}`);
  if (competencies.length) lines.push(`- 강화하려는 역량: ${competencies.join(', ')}`);
  lines.push('');
  lines.push('# 설계 요청');
  lines.push('다음 항목을 모두 포함해서 구체적으로 작성해 주세요:');
  lines.push('1. **실행 단계 5~7개** — 각 단계마다 구체적 방법·도구·자료(논문/데이터셋/시뮬레이션) 명시');
  lines.push('2. **예상 산출물** — 정량 데이터, 시각화, 보고서 분량 등 구체적으로');
  lines.push('3. **비판적 분석 포인트 2~3개** — 단순 호기심을 넘어선 평가적·반박적 시각');
  lines.push('4. **차별화 포인트** — 평가관이 다른 학생과 구분해서 볼 수 있는 지점');
  lines.push('5. **진행 일정** — 주차별 또는 2~3주 분량의 타임라인');
  lines.push('6. **예상되는 어려움과 대응 방안** — 데이터 접근, 윤리, 분량 등');
  lines.push('7. **사용자에게 묻고 싶은 추가 질문 3~5개** — 이 설계를 학생의 상황·자원·진로 방향에 맞춰 더 구체화하기 위한 질문 (예: 가용 시간, 데이터/자료 접근 가능성, 선호 도구나 언어, 사전 학습/관련 경험, 진로 가설, 발표·경연 등 후속 활용 계획 등). 사용자의 답변이 들어오면 그 내용을 반영하여 설계를 한 번 더 다듬어 주세요.');
  lines.push('');
  lines.push('각 항목은 모호하지 않게, "X 논문의 Y 방법을 Z 데이터셋에 적용" 수준의 구체성을 유지해 주세요.');
  lines.push('7번 질문에 답변이 도착하기 전까지는 1~6번까지를 잠정적인 초안으로 제시하고, 답변을 받으면 수정·보강된 최종안을 다시 작성해 주세요.');
  return lines.join('\n');
}
