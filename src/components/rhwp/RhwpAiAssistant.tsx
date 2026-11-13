import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  FileSearch,
  ListChecks,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { parseHwpxDocument } from '@/features/document-intelligence/parsers/hwpxParser';
import {
  analyzeRhwpDocumentContext,
  generateRhwpAiDraft,
  generateRhwpAiFieldDraft,
  type RhwpAiDraft,
  type RhwpAiFieldDraft,
  type RhwpDocumentContextAnalysis,
} from '@/lib/rhwp/aiDocumentWriter';
import type {
  RhwpAiEditingContext,
  RhwpAiFillableField,
} from '@/lib/rhwp/aiEditing';
import type { RhwpVisualEditorHandle } from './RhwpVisualEditor';

interface RhwpAiAssistantProps {
  fileName: string;
  disabled?: boolean;
  getEditor: () => RhwpVisualEditorHandle | null;
}

interface AnalysisSnapshot {
  analysis: RhwpDocumentContextAnalysis;
  fingerprint: string;
  characterCount: number;
  stale: boolean;
}

interface DraftSnapshot {
  draft: RhwpAiDraft;
  editingContext: RhwpAiEditingContext;
  fingerprint: string;
}

interface FieldDraftSnapshot {
  draft: RhwpAiFieldDraft;
  fields: RhwpAiFillableField[];
  fingerprint: string;
}

type BusyState =
  | 'analyzing'
  | 'drafting'
  | 'applying'
  | 'field-drafting'
  | 'field-applying'
  | null;

function hwpxFileName(fileName: string): string {
  const baseName = fileName.replace(/\.(hwp|hwpx)$/i, '').trim();
  return `${baseName || 'document'}.hwpx`;
}

function bytesToFile(bytes: Uint8Array, fileName: string): File {
  const copied = Uint8Array.from(bytes);
  return new File([copied.buffer], hwpxFileName(fileName), {
    type: 'application/hwp+zip',
  });
}

async function fingerprintBytes(bytes: Uint8Array): Promise<string> {
  const copied = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copied.buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function targetLabel(context: RhwpAiEditingContext): string {
  const scope =
    context.target.location === 'table_cell' ? '표 셀' : '본문';
  return context.target.kind === 'selection'
    ? `${scope} 선택 영역 대체`
    : `${scope} 커서 위치에 삽입`;
}

export function RhwpAiAssistant({
  fileName,
  disabled = false,
  getEditor,
}: RhwpAiAssistantProps) {
  const abortRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);
  const [analysisSnapshot, setAnalysisSnapshot] =
    useState<AnalysisSnapshot | null>(null);
  const [draftSnapshot, setDraftSnapshot] =
    useState<DraftSnapshot | null>(null);
  const [fieldDraftSnapshot, setFieldDraftSnapshot] =
    useState<FieldDraftSnapshot | null>(null);
  const [fieldPreviewValues, setFieldPreviewValues] = useState<
    Record<number, string>
  >({});
  const [previewText, setPreviewText] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [progress, setProgress] = useState({ completed: 0, total: 1 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(null);
    setAnalysisSnapshot(null);
    setDraftSnapshot(null);
    setFieldDraftSnapshot(null);
    setFieldPreviewValues({});
    setPreviewText('');
    setUserPrompt('');
    setProgress({ completed: 0, total: 1 });
    setErrorMessage(null);
  }, [fileName]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const fail = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : 'AI 문서 작업을 완료하지 못했습니다.';
    setErrorMessage(message);
    toast.error(message);
  };

  const analyzeCurrentDocument = async (
    editor: RhwpVisualEditorHandle,
    controller: AbortController
  ): Promise<AnalysisSnapshot> => {
    setBusy('analyzing');
    setProgress({ completed: 0, total: 1 });
    const bytes = await editor.exportHwpx();
    const [fingerprint, document] = await Promise.all([
      fingerprintBytes(bytes),
      parseHwpxDocument(bytesToFile(bytes, fileName)),
    ]);
    const analysis = await analyzeRhwpDocumentContext(document, {
      signal: controller.signal,
      onProgress: (completed, total) =>
        setProgress({ completed, total: Math.max(1, total) }),
    });
    const snapshot: AnalysisSnapshot = {
      analysis,
      fingerprint,
      characterCount: document.characterCount,
      stale: false,
    };
    setAnalysisSnapshot(snapshot);
    return snapshot;
  };

  const startOperation = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setErrorMessage(null);
    return controller;
  };

  const handleAnalyze = async () => {
    const editor = getEditor();
    if (!editor || disabled || busy) return;

    const controller = startOperation();
    try {
      await analyzeCurrentDocument(editor, controller);
      setDraftSnapshot(null);
      setFieldDraftSnapshot(null);
      setPreviewText('');
      setFieldPreviewValues({});
      toast.success('문서 전체 맥락과 작성 필요 영역을 분석했습니다.');
    } catch (error) {
      if (!controller.signal.aborted) fail(error);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(null);
      }
    }
  };

  const handleGenerate = async () => {
    const editor = getEditor();
    if (!editor || disabled || busy) return;

    const controller = startOperation();
    try {
      const currentBytes = await editor.exportHwpx();
      const currentFingerprint = await fingerprintBytes(currentBytes);
      let contextSnapshot = analysisSnapshot;
      if (
        !contextSnapshot ||
        contextSnapshot.stale ||
        contextSnapshot.fingerprint !== currentFingerprint
      ) {
        contextSnapshot = await analyzeCurrentDocument(editor, controller);
      }

      setBusy('drafting');
      const editingContext = await editor.getAiEditingContext();
      const draft = await generateRhwpAiDraft({
        analysis: contextSnapshot.analysis,
        editingContext,
        userPrompt,
        signal: controller.signal,
      });
      const snapshot: DraftSnapshot = {
        draft,
        editingContext,
        fingerprint: contextSnapshot.fingerprint,
      };
      setDraftSnapshot(snapshot);
      setPreviewText(draft.text);
      toast.success('적용 전 AI 초안을 만들었습니다.');
    } catch (error) {
      if (!controller.signal.aborted) fail(error);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(null);
      }
    }
  };

  const handleApply = async () => {
    const editor = getEditor();
    if (!editor || !draftSnapshot || disabled || busy) return;
    if (!previewText.trim()) {
      fail(new Error('문서에 적용할 초안이 비어 있습니다.'));
      return;
    }

    const controller = startOperation();
    setBusy('applying');
    try {
      const currentBytes = await editor.exportHwpx();
      const currentFingerprint = await fingerprintBytes(currentBytes);
      if (currentFingerprint !== draftSnapshot.fingerprint) {
        throw new Error(
          '초안을 만든 뒤 문서 내용이 바뀌었습니다. 문맥을 다시 분석해 초안을 생성해주세요.'
        );
      }

      await editor.replaceAiEditingTarget(
        previewText,
        draftSnapshot.editingContext.target
      );
      setAnalysisSnapshot((current) =>
        current ? { ...current, stale: true } : current
      );
      setDraftSnapshot(null);
      setFieldDraftSnapshot(null);
      setPreviewText('');
      setFieldPreviewValues({});
      toast.success('AI 초안을 문서에 적용했습니다. Ctrl+Z로 되돌릴 수 있습니다.');
    } catch (error) {
      if (!controller.signal.aborted) fail(error);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(null);
      }
    }
  };

  const handleGenerateFields = async () => {
    const editor = getEditor();
    if (!editor || disabled || busy) return;

    const controller = startOperation();
    try {
      const currentBytes = await editor.exportHwpx();
      const currentFingerprint = await fingerprintBytes(currentBytes);
      let contextSnapshot = analysisSnapshot;
      if (
        !contextSnapshot ||
        contextSnapshot.stale ||
        contextSnapshot.fingerprint !== currentFingerprint
      ) {
        contextSnapshot = await analyzeCurrentDocument(editor, controller);
      }

      setBusy('field-drafting');
      const fields = await editor.getAiFillableFields();
      const draft = await generateRhwpAiFieldDraft({
        analysis: contextSnapshot.analysis,
        fields,
        userPrompt,
        signal: controller.signal,
      });
      if (draft.fields.length === 0) {
        throw new Error(
          'AI가 현재 문맥에서 안전하게 자동 작성할 필드를 찾지 못했습니다.'
        );
      }

      setFieldDraftSnapshot({
        draft,
        fields,
        fingerprint: contextSnapshot.fingerprint,
      });
      setFieldPreviewValues(
        Object.fromEntries(
          draft.fields.map((field) => [field.fieldId, field.value])
        )
      );
      toast.success(
        `${draft.fields.length}개 양식 필드의 적용 전 초안을 만들었습니다.`
      );
    } catch (error) {
      if (!controller.signal.aborted) fail(error);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(null);
      }
    }
  };

  const handleApplyFields = async () => {
    const editor = getEditor();
    if (!editor || !fieldDraftSnapshot || disabled || busy) return;

    const values = fieldDraftSnapshot.draft.fields
      .map((field) => ({
        fieldId: field.fieldId,
        value: fieldPreviewValues[field.fieldId] ?? '',
      }))
      .filter((field) => field.value.trim());
    if (values.length === 0) {
      fail(new Error('문서에 적용할 필드 초안이 비어 있습니다.'));
      return;
    }

    const controller = startOperation();
    setBusy('field-applying');
    try {
      const currentBytes = await editor.exportHwpx();
      const currentFingerprint = await fingerprintBytes(currentBytes);
      if (currentFingerprint !== fieldDraftSnapshot.fingerprint) {
        throw new Error(
          '필드 초안을 만든 뒤 문서 내용이 바뀌었습니다. 문맥을 다시 분석해 초안을 생성해주세요.'
        );
      }

      const result = await editor.applyAiFieldValues(
        values,
        fieldDraftSnapshot.fields
      );
      setAnalysisSnapshot((current) =>
        current ? { ...current, stale: true } : current
      );
      setDraftSnapshot(null);
      setFieldDraftSnapshot(null);
      setPreviewText('');
      setFieldPreviewValues({});
      toast.success(
        `${result.appliedCount}개 양식 필드를 적용했습니다. Ctrl+Z로 한 번에 되돌릴 수 있습니다.`
      );
    } catch (error) {
      if (!controller.signal.aborted) fail(error);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(null);
      }
    }
  };

  const progressValue =
    progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
  const analysis = analysisSnapshot?.analysis;

  return (
    <aside className="flex h-[calc(100vh-245px)] min-h-[620px] flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
      <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 to-cyan-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-900">AI 문서 작성</h2>
            <p className="text-[11px] text-slate-500">
              전체 문맥 분석 후 현재 위치에 작성
            </p>
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-800">
                  1. 문서 전체 맥락
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  목적·구조·문체·기존 양식을 먼저 파악합니다.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || busy !== null}
                onClick={() => void handleAnalyze()}
              >
                {busy === 'analyzing' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : analysisSnapshot ? (
                  <RefreshCw className="h-3.5 w-3.5" />
                ) : (
                  <FileSearch className="h-3.5 w-3.5" />
                )}
                {analysisSnapshot ? '다시 분석' : '맥락 분석'}
              </Button>
            </div>

            {busy === 'analyzing' && (
              <div className="rounded-lg bg-violet-50 p-2.5">
                <div className="mb-1.5 flex justify-between text-[10px] text-violet-700">
                  <span>문서 전체를 순서대로 읽는 중</span>
                  <span>
                    {progress.completed}/{progress.total}
                  </span>
                </div>
                <Progress value={progressValue} className="h-1.5" />
              </div>
            )}

            {analysis && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      {analysis.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {analysis.documentType} ·{' '}
                      {analysisSnapshot.characterCount.toLocaleString()}자
                    </p>
                  </div>
                  {analysisSnapshot.stale && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-medium text-amber-700">
                      재분석 필요
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-5 text-slate-600">
                  {analysis.summary}
                </p>
              </div>
            )}
          </section>

          {analysis && analysis.incompleteAreas.length > 0 && (
            <section className="space-y-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-800">
                  AI가 찾은 작성 필요 영역
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  해당 위치를 선택하고 제안을 요청으로 사용하세요.
                </p>
              </div>
              <div className="space-y-2">
                {analysis.incompleteAreas.slice(0, 5).map((area, index) => (
                  <button
                    key={`${area.label}-${index}`}
                    type="button"
                    className="w-full rounded-lg border border-amber-100 bg-amber-50/60 p-2.5 text-left transition-colors hover:border-amber-300"
                    onClick={() =>
                      setUserPrompt(
                        area.suggestedInstruction ||
                          `${area.label}에 필요한 내용을 작성해줘.`
                      )
                    }
                  >
                    <span className="text-[11px] font-semibold text-amber-900">
                      {area.label}
                    </span>
                    <span className="mt-1 block text-[10px] leading-4 text-amber-800/80">
                      {area.reason}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2 border-t border-slate-100 pt-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-800">
                2. 커서 또는 범위에서 작성
              </h3>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                편집기에서 위치를 클릭하거나 텍스트를 드래그한 뒤 요청하세요.
              </p>
            </div>
            <Textarea
              value={userPrompt}
              maxLength={4_000}
              disabled={disabled || busy !== null}
              className="min-h-24 resize-y text-xs leading-5"
              placeholder="예: 앞의 추진 목적과 아래 일정에 맞춰 세부 운영 내용을 공문체로 작성해줘. 비워두면 AI가 문맥에서 필요한 내용을 판단합니다."
              onChange={(event) => setUserPrompt(event.target.value)}
            />
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>추가 요청은 선택 사항입니다.</span>
              <span>{userPrompt.length.toLocaleString()}/4,000</span>
            </div>
            <Button
              className="w-full bg-violet-600 hover:bg-violet-700"
              disabled={disabled || busy !== null}
              onClick={() => void handleGenerate()}
            >
              {busy === 'drafting' || busy === 'analyzing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {busy === 'analyzing'
                ? '먼저 전체 문맥 분석 중'
                : busy === 'drafting'
                  ? '현재 위치 초안 작성 중'
                  : '현재 위치에 쓸 초안 만들기'}
            </Button>
            <div className="rounded-lg border border-cyan-100 bg-cyan-50/60 p-2.5">
              <div className="flex items-start gap-2">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-cyan-900">
                    양식 입력 필드 전체 자동 작성
                  </p>
                  <p className="mt-0.5 text-[10px] leading-4 text-cyan-800/80">
                    빠른 실행에서 지정한 AI 작업 영역의 지시를 우선 적용하고,
                    일반 ClickHere 필드도 함께 검토합니다.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full border-cyan-200 bg-white text-cyan-800 hover:bg-cyan-50"
                disabled={disabled || busy !== null}
                onClick={() => void handleGenerateFields()}
              >
                {busy === 'field-drafting' || busy === 'analyzing' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ListChecks className="h-3.5 w-3.5" />
                )}
                {busy === 'field-drafting'
                  ? '필드별 초안 작성 중'
                  : '전체 필드 초안 만들기'}
              </Button>
            </div>
          </section>

          {draftSnapshot && (
            <section className="space-y-2 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-800">
                  3. 확인 후 적용
                </h3>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-medium text-violet-700">
                  {targetLabel(draftSnapshot.editingContext)}
                </span>
              </div>
              <p className="rounded-lg bg-slate-50 p-2.5 text-[10px] leading-4 text-slate-600">
                {draftSnapshot.draft.targetAssessment}
              </p>
              <Textarea
                value={previewText}
                disabled={busy !== null}
                className="min-h-40 resize-y text-xs leading-5"
                onChange={(event) => setPreviewText(event.target.value)}
              />
              {draftSnapshot.draft.warnings.length > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-100 bg-amber-50 p-2.5">
                  {draftSnapshot.draft.warnings.map((warning, index) => (
                    <p
                      key={`${warning}-${index}`}
                      className="flex gap-1.5 text-[10px] leading-4 text-amber-800"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {warning}
                    </p>
                  ))}
                </div>
              )}
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                disabled={busy !== null || !previewText.trim()}
                onClick={() => void handleApply()}
              >
                {busy === 'applying' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                문서에 적용
              </Button>
              <p className="text-center text-[10px] text-slate-400">
                시작 위치의 기존 서식을 유지하며, 적용 후 Ctrl+Z로 되돌릴 수
                있습니다.
              </p>
            </section>
          )}

          {fieldDraftSnapshot && (
            <section className="space-y-2 border-t border-slate-100 pt-4">
              <div>
                <h3 className="text-xs font-semibold text-slate-800">
                  양식 필드 일괄 적용 전 확인
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  각 값을 수정하거나 비워 적용 대상에서 제외할 수 있습니다.
                </p>
              </div>
              <div className="space-y-2">
                {fieldDraftSnapshot.draft.fields.map((field) => {
                  const sourceField = fieldDraftSnapshot.fields.find(
                    (candidate) => candidate.fieldId === field.fieldId
                  );
                  return (
                    <div
                      key={field.fieldId}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                          {sourceField?.isAiWorkField && (
                            <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] text-violet-700">
                              AI 지정
                            </span>
                          )}
                          <span className="truncate">{field.label}</span>
                        </span>
                        <span className="shrink-0 text-[9px] text-slate-400">
                          신뢰도 {Math.round(field.confidence * 100)}%
                        </span>
                      </div>
                      {sourceField?.aiInstruction && (
                        <p className="mb-1.5 rounded bg-violet-50 px-2 py-1.5 text-[10px] leading-4 text-violet-700">
                          작성 지시: {sourceField.aiInstruction}
                        </p>
                      )}
                      {field.reason && (
                        <p className="mb-1.5 text-[10px] leading-4 text-slate-500">
                          {field.reason}
                        </p>
                      )}
                      <Textarea
                        value={fieldPreviewValues[field.fieldId] ?? ''}
                        disabled={busy !== null}
                        className="min-h-20 resize-y bg-white text-xs leading-5"
                        onChange={(event) =>
                          setFieldPreviewValues((current) => ({
                            ...current,
                            [field.fieldId]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
              {fieldDraftSnapshot.draft.warnings.length > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-100 bg-amber-50 p-2.5">
                  {fieldDraftSnapshot.draft.warnings.map((warning, index) => (
                    <p
                      key={`${warning}-${index}`}
                      className="flex gap-1.5 text-[10px] leading-4 text-amber-800"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {warning}
                    </p>
                  ))}
                </div>
              )}
              <Button
                className="w-full bg-cyan-700 hover:bg-cyan-800"
                disabled={busy !== null}
                onClick={() => void handleApplyFields()}
              >
                {busy === 'field-applying' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                검토한 필드 {fieldDraftSnapshot.draft.fields.length}개 적용
              </Button>
              <p className="text-center text-[10px] text-slate-400">
                필드의 기존 서식을 유지하며 Ctrl+Z 한 번으로 전체를 되돌릴 수
                있습니다.
              </p>
            </section>
          )}

          {errorMessage && (
            <div className="flex gap-2 rounded-lg border border-red-100 bg-red-50 p-2.5 text-[10px] leading-4 text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[10px] leading-4 text-slate-500">
        AI 기능을 실행할 때만 문서 텍스트가 인증된 AI 처리 경로로 전송됩니다.
        민감정보와 생성 결과를 적용 전에 확인하세요.
      </div>
    </aside>
  );
}
