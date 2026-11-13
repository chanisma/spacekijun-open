import type { RhwpEditor } from '@rhwp/editor';

export interface RhwpDocumentPosition {
  sectionIndex: number;
  paragraphIndex: number;
  charOffset: number;
  parentParaIndex?: number;
  controlIndex?: number;
  cellIndex?: number;
  cellParaIndex?: number;
  cellPath?: Array<{
    controlIndex: number;
    cellIndex: number;
    cellParaIndex: number;
  }>;
  isTextBox?: boolean;
}

export interface RhwpAiEditingTarget {
  schemaVersion: 1;
  kind: 'cursor' | 'selection';
  location: 'body' | 'table_cell';
  start: RhwpDocumentPosition;
  end: RhwpDocumentPosition;
  selectedText: string;
}

export interface RhwpAiEditingContext {
  schemaVersion: 1;
  target: RhwpAiEditingTarget;
  leadingText: string;
  trailingText: string;
}

export interface RhwpAiEditingApplyResult {
  schemaVersion: 1;
  insertedLength: number;
}

export interface RhwpAiFillableField {
  fieldId: number;
  name: string;
  guide: string;
  value: string;
  /** 작성자가 rhwp 빠른 실행에서 명시적으로 지정한 AI 작업 영역인지 여부 */
  isAiWorkField: boolean;
  /** 양식 제작자가 문서에 저장한 해당 영역 전용 작성 지시 */
  aiInstruction: string;
  editableInForm: boolean;
  sectionIndex: number;
  paragraphIndex: number;
}

export interface RhwpAiFieldValue {
  fieldId: number;
  value: string;
}

export interface RhwpAiFieldApplyResult {
  schemaVersion: 1;
  appliedCount: number;
}

type RhwpRpcEditor = RhwpEditor & {
  _request: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
};

function rpcEditor(editor: RhwpEditor): RhwpRpcEditor {
  const candidate = editor as RhwpRpcEditor;
  if (typeof candidate._request !== 'function') {
    throw new Error('현재 rhwp 편집기가 AI 편집 확장을 지원하지 않습니다.');
  }
  return candidate;
}

export function getRhwpAiEditingContext(
  editor: RhwpEditor
): Promise<RhwpAiEditingContext> {
  return rpcEditor(editor)._request<RhwpAiEditingContext>(
    'getAiEditingContext'
  );
}

export function replaceRhwpAiEditingTarget(
  editor: RhwpEditor,
  text: string,
  expected: RhwpAiEditingTarget
): Promise<RhwpAiEditingApplyResult> {
  return rpcEditor(editor)._request<RhwpAiEditingApplyResult>(
    'replaceAiEditingTarget',
    { text, expected }
  );
}

export function getRhwpAiFillableFields(
  editor: RhwpEditor
): Promise<RhwpAiFillableField[]> {
  return rpcEditor(editor)._request<RhwpAiFillableField[]>(
    'getAiFillableFields'
  );
}

export function applyRhwpAiFieldValues(
  editor: RhwpEditor,
  values: RhwpAiFieldValue[],
  expected: RhwpAiFillableField[]
): Promise<RhwpAiFieldApplyResult> {
  return rpcEditor(editor)._request<RhwpAiFieldApplyResult>(
    'applyAiFieldValues',
    { values, expected }
  );
}
