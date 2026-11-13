// ========================================
// 공문 제안 — [내 일로] · [다른 사람에게] · [참고만] 의 판정 (2026-11-08, P2)
//
// 결정 = docs/plans/2026-11-08-work-ontology-redesign.md §8-1 «P2 결정»:
//   [내 일로] = 후보 업무(내가 책임자인 진행 중 업무, 공문과 가까운 순) 중에서 고르고, 없으면 개인 묶음 «○○○ 공문 처리»
//   선택은 공문 판단함 결정 기록(official_doc_decision)에 남긴다 — 저장 경로는 판단함과 같은 `saveDecision`(한 벌).
// 이 파일은 초안(DecisionDraft)만 만든다. 쓰기는 호출부가 saveDecision 으로.
// ========================================

import { initialDraft, type DecisionDraft } from '@/lib/officialDocDecision';
import type { PersonOption } from '@/lib/candidateToWork';
import type { OfficialDoc } from '@/features/official-docs/officialDocService';
import { bigrams, overlap } from '@/lib/workSimilarity';

export interface MyWorkOption { id: string; name: string; year?: number | null }

/** 내 업무를 공문과 가까운 순으로 — AI 후보 이름이 있으면 그것을 더 무겁게 */
export function rankWorksForDoc(doc: OfficialDoc, works: readonly MyWorkOption[]): Array<MyWorkOption & { score: number }> {
  const title = bigrams(doc.title);
  const candidates = (doc.triage?.result?.work_candidates ?? []).map((c) => bigrams(c.name ?? ''));
  return works
    .map((w) => {
      const name = bigrams(w.name);
      const byCandidate = candidates.reduce((m, c) => Math.max(m, overlap(c, name)), 0);
      return { ...w, score: Math.round((overlap(title, name) + 1.5 * byCandidate) * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
}

/** 이 정도는 겹쳐야 «가까운 업무»로 먼저 권한다 — 아니면 개인 묶음을 먼저 권한다 */
export const RECOMMEND_MIN_SCORE = 0.35;

/** 학년도 — 3월부터 새 해(한국 학교) */
export function academicYearOf(today: string): number {
  const [y, m] = today.split('-').map(Number);
  return m >= 3 ? y : y - 1;
}

export function personalBundleName(myName: string): string {
  return `${myName.trim()} 공문 처리`;
}

/** 이미 있는 개인 묶음(같은 이름 · 같은 학년도 · 내가 책임자) */
export function findPersonalBundle(works: readonly MyWorkOption[], myName: string, year: number): MyWorkOption | null {
  const name = personalBundleName(myName);
  return works.find((w) => w.name === name && (w.year == null || w.year === year)) ?? null;
}

/** [내 일로] — 고른 업무에 할 일 하나(담당 = 나). workId 가 null 이면 개인 묶음을 새로 만든다 */
export function acceptDraft(doc: OfficialDoc, me: PersonOption, workId: string | null): DecisionDraft {
  const base = initialDraft(doc, [me]);
  return workId
    ? { ...base, kind: 'link_work', workId, candidateId: null, assignees: [me], managers: [me], makeRule: false, reason: '' }
    : {
      ...base,
      kind: 'create_work', workId: null, candidateId: null,
      newWorkName: personalBundleName(me.name), assignees: [me], managers: [me], makeRule: false, reason: '',
    };
}

/** 공문에서 새 업무 이름 초안 — AI 가 고른 가까운 업무 이름이 있으면 그것, 아니면 머리표를 뗀 제목 */
export function docWorkName(doc: OfficialDoc): string {
  const top = doc.triage?.result?.work_candidates?.[0]?.name?.trim();
  return (top || doc.title.replace(/^\s*\[[^\]]*\]\s*/, '').trim()).slice(0, 120);
}

/** «참고해서 시작»의 원본 정렬 힌트 — 공문 제목 + AI 후보 이름 */
export function docHints(doc: OfficialDoc): string[] {
  return [doc.title, ...(doc.triage?.result?.work_candidates ?? []).map((c) => c.name ?? '')].filter((t) => t.trim());
}

/** 공문 마감(판정이 읽은 것) — 새 업무의 목표일 초안 */
export function docDeadline(doc: OfficialDoc): string | null {
  const d = doc.triage?.deadline ?? doc.triage?.result?.deadline ?? null;
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/** [내 일로 › 새 업무로 / 참고해서 새 업무로] — 새 업무(책임자 = 나) + 공문 할 일(담당 = 나) */
export function newWorkDraft(doc: OfficialDoc, me: PersonOption, name: string, targetDate: string | null): DecisionDraft {
  return {
    ...initialDraft(doc, [me]),
    kind: 'create_work', workId: null, candidateId: null,
    newWorkName: name.replace(/\s+/g, ' ').trim(), assignees: [me], managers: [me], makeRule: false, reason: '',
    workTargetDate: targetDate,
  };
}

/** [다른 사람에게] — 누구 일인지만 남긴다(업무·할 일은 만들지 않는다) */
export function reassignDraft(doc: OfficialDoc, me: PersonOption, to: PersonOption, reason: string): DecisionDraft {
  return { ...initialDraft(doc, [me]), kind: 'reassign', workId: null, candidateId: null, assignees: [to], managers: [], makeRule: false, reason: reason.trim() };
}

/** [참고만] */
export function infoDraft(doc: OfficialDoc, me: PersonOption): DecisionDraft {
  return { ...initialDraft(doc, [me]), kind: 'info', workId: null, candidateId: null, assignees: [], managers: [], makeRule: false, reason: '담당 교사가 참고로 남김' };
}

/** 제안 카드의 «왜 나에게» 한 줄 */
export function whyLine(doc: OfficialDoc): string {
  const r = doc.triage?.result;
  const parts: string[] = ['결재권자 = 나'];
  if (r?.obligation) parts.push(`${r.obligation}${doc.triage?.nature ? ` ${doc.triage.nature}` : ''}`);
  const top = r?.work_candidates?.[0]?.name;
  if (top) parts.push(`가까운 업무 «${top}»`);
  return parts.join(' · ');
}
