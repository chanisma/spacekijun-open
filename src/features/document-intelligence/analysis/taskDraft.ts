import type {
  DocumentAnalysisResult,
  DocumentCandidate,
  DocumentTaskDraft,
  ExistingWorkItem,
  ExistingWorkMatch,
} from '../types';
import { candidateEditOf, resolveCandidate, resolveCandidateDueDate } from './candidateEdits';

function normalizedTokens(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase('ko-KR')
      .replace(/[^0-9a-z가-힣\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function findExistingWorkMatches(
  candidate: DocumentCandidate,
  existing: ExistingWorkItem[],
  limit = 3,
  /** 기한 비교 기준. 카드가 수정된 기한을 넘겨 준다(없으면 AI 유도값). */
  dueDate: string | null = resolveCandidateDueDate(candidate)
): ExistingWorkMatch[] {
  const candidateTokens = normalizedTokens(`${candidate.title} ${candidate.description}`);
  const normalizedDueDate = dueDate?.slice(0, 10) ?? null;

  return existing
    .map((item) => {
      const titleSimilarity = jaccard(candidateTokens, normalizedTokens(`${item.title} ${item.description}`));
      const exactTitle = candidate.title.trim() === item.title.trim();
      const sameDate = Boolean(normalizedDueDate && item.dueDate && normalizedDueDate === item.dueDate.slice(0, 10));
      const reasons: string[] = [];
      if (exactTitle) reasons.push('제목 일치');
      else if (titleSimilarity >= 0.35) reasons.push('내용 유사');
      if (sameDate) reasons.push('기한 일치');
      const score = Math.min(1, titleSimilarity * 0.75 + (exactTitle ? 0.2 : 0) + (sameDate ? 0.2 : 0));
      return { ...item, score, reasons };
    })
    .filter((match) => match.score >= 0.28)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function createDocumentTaskDraft(
  analysis: DocumentAnalysisResult,
  sourceFileName: string,
  selectedCandidateIds: Set<string>,
  analysisRunId: string | null = null
): DocumentTaskDraft {
  // ⚠️ **수정을 여기서 반영한다.** 화면만 고쳐진 채 원본이 업무가 되는 일을 막으려면
  // 초안을 만드는 이 한 곳이 `resolveCandidate` 를 거쳐야 한다(오류가 나지 않는 부류).
  const resolved = analysis.candidates.map((candidate) => {
    const edit = candidateEditOf(analysis, candidate.localId);
    return {
      candidate: resolveCandidate(candidate, edit),
      dueDate: resolveCandidateDueDate(candidate, edit),
      selected: selectedCandidateIds.has(candidate.localId),
    };
  });

  const selected = resolved.filter((entry) => entry.selected);
  // 유형도 수정 대상이므로(사용자 결정 2026-09-23) 아래 분기는 **수정된 유형**을 본다 —
  // 즉 '참고'로 뽑힌 것을 '업무'로 고치면 실제로 할 일이 만들어진다.
  const information = selected.filter((entry) => entry.candidate.type === 'constraint');

  const tasks = selected
    .filter((entry) => ['event', 'task', 'submission', 'approval'].includes(entry.candidate.type))
    .map(({ candidate, dueDate }) => ({
      title: candidate.title,
      description: [
        candidate.description,
        candidate.conditions.length ? `조건: ${candidate.conditions.join('; ')}` : '',
        candidate.deliverables.length ? `산출물: ${candidate.deliverables.join(', ')}` : '',
        `문서 근거: ${candidate.evidence.map((evidence) => evidence.quote).join(' / ')}`,
      ].filter(Boolean).join('\n'),
      type: 'one_time' as const,
      dueDate,
      keywords: Array.from(new Set([TYPE_KEYWORD[candidate.type], ...candidate.deliverables]))
        .filter((keyword): keyword is string => Boolean(keyword)),
      sourceCandidateId: candidate.localId,
    }));

  return {
    analysisRunId,
    workName: analysis.documentTitle,
    description: [
      analysis.summary,
      `원본 문서: ${sourceFileName}`,
      information.length
        ? `관련 제약:\n${information.map(({ candidate }) => `- ${candidate.title}: ${candidate.description}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n\n'),
    keywords: Array.from(new Set(['문서분석', analysis.documentType].filter(Boolean))),
    sourceFileName,
    tasks,
  };
}

const TYPE_KEYWORD: Partial<Record<DocumentCandidate['type'], string>> = {
  event: '일정',
  task: '업무',
  submission: '제출',
  approval: '승인',
};
