export type DocumentFormat = 'hwpx' | 'pdf' | 'text' | 'hwp' | 'unknown';

export type DocumentBlockKind =
  | 'heading'
  | 'paragraph'
  | 'list_item'
  | 'table'
  | 'table_row'
  | 'table_cell'
  | 'page_break';

export interface DocumentSourceRef {
  blockId: string;
  page?: number;
  section?: number;
  path?: string;
  bbox?: [number, number, number, number];
}

export interface DocumentBlock {
  id: string;
  kind: DocumentBlockKind;
  text: string;
  order: number;
  level?: number;
  parentId?: string;
  sectionPath: string[];
  source: DocumentSourceRef;
  children?: DocumentBlock[];
  meta?: Record<string, unknown>;
}

export interface ParsedSchoolDocument {
  parserVersion: string;
  fileName: string;
  mimeType: string;
  format: DocumentFormat;
  title: string | null;
  pageCount: number | null;
  characterCount: number;
  blocks: DocumentBlock[];
  warnings: string[];
  plainText: string;
}

export type DatePrecision =
  | 'exact'
  | 'day'
  | 'month'
  | 'month_end'
  | 'range'
  | 'recurring'
  | 'unknown';

export interface ExtractedDate {
  raw: string;
  start: string | null;
  end: string | null;
  precision: DatePrecision;
  isConfirmed: boolean;
  recurrence: string | null;
  inferredYear: boolean;
}

export type DocumentCandidateType =
  | 'event'
  | 'task'
  | 'submission'
  | 'approval'
  | 'constraint'
  | 'information';

export type Obligation = 'required' | 'recommended' | 'optional' | 'prohibited' | 'informational' | 'unknown';

export interface CandidateEvidence {
  blockId: string;
  quote: string;
  page: number | null;
  path: string | null;
}

export interface DocumentCandidate {
  localId: string;
  type: DocumentCandidateType;
  title: string;
  description: string;
  actors: string[];
  audiences: string[];
  deliverables: string[];
  location: string | null;
  dates: ExtractedDate[];
  obligation: Obligation;
  conditions: string[];
  confidence: number;
  evidence: CandidateEvidence[];
}

/**
 * 후보 카드에서 사용자가 고친 값 (2026-09-23).
 *
 * **원본을 덮어쓰지 않고 «차이만» 담는다** — 없는 키 = 안 고침. 그래서 `dueDate` 는
 * 3상태다: `undefined`(안 고침) · `null`(기한 없음으로 명시) · 날짜 문자열.
 * 판정·적용은 전부 `analysis/candidateEdits.ts` 가 소유한다.
 */
export interface DocumentCandidateEdit {
  title?: string;
  description?: string;
  type?: DocumentCandidateType;
  /** 'YYYY-MM-DD' 또는 null(기한 없음). AI 의 `dates[]`(원문 표현·근거)와 별개다. */
  dueDate?: string | null;
  editedAt: string;
}

export interface DocumentAnalysisResult {
  schemaVersion: '1.0';
  documentTitle: string;
  documentType: string;
  issuingOrganization: string | null;
  summary: string;
  candidates: DocumentCandidate[];
  unresolvedQuestions: string[];
  warnings: string[];
  /**
   * localId → 사용자 수정. **AI 가 만들지 않는다** — 분석 직후에는 항상 없고,
   * 사람이 카드를 고칠 때 생긴다. 같은 JSONB 안에 두므로 마이그레이션이 필요 없다.
   */
  candidateEdits?: Record<string, DocumentCandidateEdit>;
}

export interface DocumentChunk {
  id: string;
  titlePath: string[];
  blockIds: string[];
  text: string;
  characterCount: number;
}

export interface DocumentAnalysisProgress {
  stage: 'preparing' | 'analyzing_chunks' | 'merging';
  completedChunks: number;
  totalChunks: number;
  failedChunks: number;
  /**
   * 진행 상황에 붙는 한 줄 설명. 지금은 "단일 호출이 느려 분할로 전환했다"를 알리는
   * 데 쓴다 - 화면이 아무 말 없이 1/1 에서 0/4 로 되돌아가면 고장처럼 보인다.
   */
  note?: string;
}

export interface ExistingWorkItem {
  workId: string;
  workName: string;
  taskId: string | null;
  title: string;
  description: string;
  dueDate: string | null;
}

export interface ExistingWorkMatch extends ExistingWorkItem {
  score: number;
  reasons: string[];
}

export type DocumentCandidateDecisionType = 'create' | 'exclude' | 'link_event' | 'link_task';

export interface DocumentCandidateDecision {
  candidateId: string;
  decision: DocumentCandidateDecisionType;
  linkedWorkId: string | null;
  linkedTaskId: string | null;
  createdTaskId: string | null;
}

export interface DocumentAnalysisHistoryRecord {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  format: DocumentFormat;
  fileSha256: string;
  documentKey: string;
  parserVersion: string;
  promptVersion: string;
  model: string;
  analysis: DocumentAnalysisResult;
  status: 'analyzed' | 'reviewed' | 'applied';
  revisionOf: string | null;
  appliedWorkId: string | null;
  appliedAt: string | null;
  createdAt: string;
  decisions: DocumentCandidateDecision[];
}

export interface DocumentFingerprint {
  sha256: string;
  documentKey: string;
}

export interface DocumentHistoryMatch {
  fingerprint: DocumentFingerprint;
  exact: DocumentAnalysisHistoryRecord | null;
  previousRevision: DocumentAnalysisHistoryRecord | null;
}

export interface DocumentTaskDraft {
  analysisRunId: string | null;
  workName: string;
  description: string;
  keywords: string[];
  sourceFileName: string;
  tasks: Array<{
    title: string;
    description: string;
    type: 'one_time';
    dueDate: string | null;
    keywords: string[];
    sourceCandidateId: string;
  }>;
}
