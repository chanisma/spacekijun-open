/**
 * 문서 분석 후보의 **사용자 수정** 단일 출처 (2026-09-23).
 *
 * AI 가 뽑은 것을 그대로 업무로 만들지 않고 사람이 고칠 수 있어야 한다는 요구에서 나왔다.
 *
 * **원본을 덮어쓰지 않고 «변경분»을 따로 얹는다.** 이유 둘 —
 *   ① `analysis_result` 는 `model`·`prompt_version` 과 짝을 이루는 **재현 기록**이다.
 *      덮어쓰면 "그 모델이 무엇을 뽑았는가"라는 그 행의 의미가 사라진다.
 *   ② 변경분만 담으면 «원본으로 되돌리기» 가 항목 삭제 한 줄이고, «무엇이 수정됐는지»
 *      배지도 추측이 아니라 **데이터**가 된다.
 *
 * 저장 위치는 `DocumentAnalysisResult.candidateEdits`(localId → 변경분)라 기존
 * `analysis_result` JSONB 안에 그대로 들어간다 — 마이그레이션이 필요 없다.
 *
 * ⚠️ **화면·초안·유사 업무 매칭은 전부 `resolveCandidate()` 를 거칠 것.** 한 곳이라도
 * 원본 후보를 그대로 읽으면 "화면에는 고쳐졌는데 만들어진 업무는 원본"이 된다 —
 * 오류가 나지 않는 부류다.
 */
import type {
  DocumentAnalysisResult,
  DocumentCandidate,
  DocumentCandidateEdit,
  DocumentCandidateType,
} from '../types';

/** 사용자가 고칠 수 있는 항목(2026-09-23 사용자 결정 = 제목·설명·유형·기한). */
export const EDITABLE_CANDIDATE_FIELDS = ['title', 'description', 'type', 'dueDate'] as const;
export type EditableCandidateField = (typeof EDITABLE_CANDIDATE_FIELDS)[number];

export const EDITABLE_FIELD_LABEL: Record<EditableCandidateField, string> = {
  title: '제목',
  description: '설명',
  type: '유형',
  dueDate: '기한',
};

/** 편집 폼이 다루는 값. `dueDate: null` = "기한 없음"으로 **명시**. */
export interface CandidateEditDraft {
  title: string;
  description: string;
  type: DocumentCandidateType;
  dueDate: string | null;
}

/**
 * AI 가 읽은 날짜들에서 **업무 기한**을 유도한다.
 *
 * `dates[]` 는 원문 표현의 기록이라 '3월 중'·'학기당 1회'처럼 확정할 수 없는 것이 섞인다.
 * 그래서 시작일이 있고 정밀도가 날짜 단위인 것만 기한으로 쓴다 — 나머지는 기한 없음이다.
 * (종전에는 이 규칙이 `taskDraft.ts` 안에 숨어 있어 화면이 "무엇이 기한이 될지"를 말해
 * 주지 못했다.)
 */
export function deriveCandidateDueDate(candidate: DocumentCandidate): string | null {
  const date = candidate.dates.find(
    (item) => Boolean(item.start) && ['exact', 'day'].includes(item.precision)
  );
  return date?.start?.slice(0, 10) ?? null;
}

/** 지금 이 후보에 적용된 기한(사용자 지정이 있으면 그것, 없으면 AI 유도값). */
export function resolveCandidateDueDate(
  candidate: DocumentCandidate,
  edit?: DocumentCandidateEdit
): string | null {
  // `undefined` = 손대지 않음, `null` = "기한 없음"으로 명시. 둘은 다르다.
  if (edit && edit.dueDate !== undefined) return edit.dueDate;
  return deriveCandidateDueDate(candidate);
}

/**
 * 수정을 반영한 후보.
 *
 * ⚠️ **기한은 여기에 담기지 않는다** — `DocumentCandidate.dates` 는 AI 가 원문에서 읽은
 * 표현(근거)이지 결정이 아니라서, 사람이 정한 기한을 그 배열에 끼워 넣으면 근거와
 * 결정이 섞인다. 기한은 `resolveCandidateDueDate()` 로 따로 얻는다.
 */
export function resolveCandidate(
  candidate: DocumentCandidate,
  edit?: DocumentCandidateEdit
): DocumentCandidate {
  if (!edit) return candidate;
  return {
    ...candidate,
    title: edit.title ?? candidate.title,
    description: edit.description ?? candidate.description,
    type: edit.type ?? candidate.type,
  };
}

export function candidateEditOf(
  analysis: DocumentAnalysisResult,
  localId: string
): DocumentCandidateEdit | undefined {
  return analysis.candidateEdits?.[localId];
}

/** 화면·초안이 실제로 써야 하는 후보 목록(수정 반영). */
export function resolvedCandidates(analysis: DocumentAnalysisResult): DocumentCandidate[] {
  return analysis.candidates.map((candidate) =>
    resolveCandidate(candidate, candidateEditOf(analysis, candidate.localId))
  );
}

/** 편집 폼의 초기값 — 지금 화면에 보이는 값 그대로. */
export function candidateEditDraft(
  candidate: DocumentCandidate,
  edit?: DocumentCandidateEdit
): CandidateEditDraft {
  const resolved = resolveCandidate(candidate, edit);
  return {
    title: resolved.title,
    description: resolved.description,
    type: resolved.type,
    dueDate: resolveCandidateDueDate(candidate, edit),
  };
}

/** 이 수정이 원본과 실제로 다른 항목들. 배지·요약에 쓴다. */
export function editedFields(
  candidate: DocumentCandidate,
  edit?: DocumentCandidateEdit
): EditableCandidateField[] {
  if (!edit) return [];
  const fields: EditableCandidateField[] = [];
  if (edit.title !== undefined && edit.title !== candidate.title) fields.push('title');
  if (edit.description !== undefined && edit.description !== candidate.description) fields.push('description');
  if (edit.type !== undefined && edit.type !== candidate.type) fields.push('type');
  if (edit.dueDate !== undefined && edit.dueDate !== deriveCandidateDueDate(candidate)) fields.push('dueDate');
  return fields;
}

/**
 * 폼 값을 **원본과의 차이만** 남긴 변경분으로 줄인다.
 *
 * 값이 원본과 같으면 담지 않는다 — 그래야 «수정됨» 배지가 거짓말하지 않고,
 * 사용자가 고쳤다가 되돌린 경우 항목 자체가 사라진다.
 */
export function toCandidateEdit(
  candidate: DocumentCandidate,
  draft: CandidateEditDraft,
  now: () => string = () => new Date().toISOString()
): DocumentCandidateEdit | null {
  const edit: DocumentCandidateEdit = { editedAt: now() };
  const title = draft.title.trim();
  const description = draft.description.trim();
  if (title && title !== candidate.title) edit.title = title;
  if (description !== candidate.description) edit.description = description;
  if (draft.type !== candidate.type) edit.type = draft.type;
  if (draft.dueDate !== deriveCandidateDueDate(candidate)) edit.dueDate = draft.dueDate;

  const changed = Object.keys(edit).filter((key) => key !== 'editedAt');
  return changed.length > 0 ? edit : null;
}

/** 수정을 얹은 새 분석 결과. `edit === null` 이면 그 후보를 **원본으로 되돌린다**. */
export function withCandidateEdit(
  analysis: DocumentAnalysisResult,
  localId: string,
  edit: DocumentCandidateEdit | null
): DocumentAnalysisResult {
  const next = { ...(analysis.candidateEdits ?? {}) };
  if (edit) next[localId] = edit;
  else delete next[localId];
  // 비면 키 자체를 뺀다 — 수정한 적 없는 분석과 "전부 되돌린" 분석이 같은 모양이어야
  // 이력 행을 눈으로 비교할 때 헷갈리지 않는다.
  if (Object.keys(next).length === 0) {
    const { candidateEdits: _removed, ...rest } = analysis;
    return rest as DocumentAnalysisResult;
  }
  return { ...analysis, candidateEdits: next };
}

/** 이 분석에 사람이 손댄 후보가 몇 건인가(원본과 실제로 다른 것만 센다). */
export function editedCandidateCount(analysis: DocumentAnalysisResult): number {
  if (!analysis.candidateEdits) return 0;
  return analysis.candidates.filter(
    (candidate) => editedFields(candidate, candidateEditOf(analysis, candidate.localId)).length > 0
  ).length;
}

/** 저장된 변경분을 신뢰하지 않고 검사한다(이력 JSONB 는 손으로 고칠 수 있다). */
export function normalizeCandidateEdits(
  value: unknown,
  validLocalIds: Set<string>,
  validTypes: Set<string>
): Record<string, DocumentCandidateEdit> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: Record<string, DocumentCandidateEdit> = {};
  for (const [localId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!validLocalIds.has(localId) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const edit: DocumentCandidateEdit = {
      editedAt: typeof record.editedAt === 'string' ? record.editedAt : new Date(0).toISOString(),
    };
    if (typeof record.title === 'string' && record.title.trim()) edit.title = record.title.trim();
    if (typeof record.description === 'string') edit.description = record.description.trim();
    if (typeof record.type === 'string' && validTypes.has(record.type)) {
      edit.type = record.type as DocumentCandidateType;
    }
    if (record.dueDate === null) edit.dueDate = null;
    else if (typeof record.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.dueDate)) {
      edit.dueDate = record.dueDate;
    }
    if (Object.keys(edit).length > 1) result[localId] = edit;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
