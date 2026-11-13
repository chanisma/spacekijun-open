import { useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckSquare,
  FileSearch,
  History,
  Link2,
  Loader2,
  ShieldAlert,
  FileUp,
  AlignLeft,
  Sparkles,
  Pencil,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';
import { parseSchoolDocument, UnsupportedDocumentError } from '../parsers';
import { analyzeParsedDocument } from '../services/documentAnalysisService';
import {
  findDocumentAnalysisHistory,
  saveDocumentAnalysis,
  saveDocumentAnalysisDecisions,
  saveDocumentAnalysisResult,
} from '../services/documentAnalysisHistoryService';
import { createDocumentTaskDraft, findExistingWorkMatches } from '../analysis/taskDraft';
import {
  EDITABLE_FIELD_LABEL,
  candidateEditOf,
  editedCandidateCount,
  editedFields,
  resolveCandidate,
  resolveCandidateDueDate,
  withCandidateEdit,
} from '../analysis/candidateEdits';
import { CandidateEditDialog } from './CandidateEditDialog';
import type {
  DocumentAnalysisHistoryRecord,
  DocumentAnalysisProgress,
  DocumentAnalysisResult,
  DocumentCandidate,
  DocumentCandidateDecision,
  DocumentCandidateEdit,
  DocumentHistoryMatch,
  DocumentTaskDraft,
  ExistingWorkItem,
  ParsedSchoolDocument,
} from '../types';

interface DocumentIntelligenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingWorkItems?: ExistingWorkItem[];
  onDraftPrepared?: (draft: DocumentTaskDraft) => void;
}

const TYPE_LABEL: Record<DocumentCandidate['type'], string> = {
  event: '일정',
  task: '업무',
  submission: '제출',
  approval: '승인·심의',
  constraint: '제약',
  information: '참고',
};

function CandidateCard({
  candidate,
  edit,
  checked,
  onCheckedChange,
  existingWorkItems,
  linkedWorkItem,
  onLink,
  onEdit,
  readOnly,
}: {
  /** AI 원본. 수정은 `edit` 로 따로 오고 화면에서만 합쳐 보여 준다. */
  candidate: DocumentCandidate;
  edit: DocumentCandidateEdit | undefined;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  existingWorkItems: ExistingWorkItem[];
  linkedWorkItem: ExistingWorkItem | null;
  onLink: (item: ExistingWorkItem | null) => void;
  onEdit: () => void;
  readOnly: boolean;
}) {
  // ⚠️ 화면·매칭은 **반드시** 수정 반영본을 쓴다. 한 곳이라도 원본을 읽으면
  // "화면에는 고쳐졌는데 만들어진 업무는 원본"이 된다(오류가 나지 않는다).
  const resolved = resolveCandidate(candidate, edit);
  const dueDate = resolveCandidateDueDate(candidate, edit);
  const changedFields = editedFields(candidate, edit);
  const matches = findExistingWorkMatches(resolved, existingWorkItems, 3, dueDate);
  return (
    <div
      className={`space-y-2 rounded-lg border p-3 ${checked ? 'border-violet-300 bg-violet-50/40' : 'bg-card'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Checkbox
          checked={checked}
          disabled={readOnly}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-label={`${candidate.title} 업무 초안에 포함`}
        />
        <Badge variant="secondary">{TYPE_LABEL[resolved.type]}</Badge>
        <span className="min-w-0 font-medium">{resolved.title}</span>
        {linkedWorkItem && <Badge variant="outline">기존 업무 연결</Badge>}
        {changedFields.length > 0 && (
          <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
            수정됨 · {changedFields.map((field) => EDITABLE_FIELD_LABEL[field]).join('·')}
          </Badge>
        )}
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          신뢰도 {Math.round(candidate.confidence * 100)}%
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-slate-500 hover:text-slate-800"
              onClick={onEdit}
              aria-label={`${resolved.title} 수정`}
            >
              <Pencil className="h-3.5 w-3.5" />
              수정
            </Button>
          )}
        </span>
      </div>
      {resolved.description && (
        <p className="text-sm text-muted-foreground">{resolved.description}</p>
      )}
      {/* 어떤 날짜가 «업무 기한»이 되는지 카드가 말해 준다 — 종전에는 원문 표현만 보여
          줘서 여러 날짜 중 무엇이 초안에 들어가는지 알 수 없었다. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <CalendarDays className="h-4 w-4 text-blue-600" />
        <span className={dueDate ? '' : 'text-muted-foreground'}>
          업무 기한 {dueDate ?? '없음'}
        </span>
        {changedFields.includes('dueDate') && (
          <Badge variant="outline" className="border-indigo-200 text-[10px] text-indigo-700">
            직접 지정
          </Badge>
        )}
      </div>
      {candidate.dates.map((date, index) => (
        <div key={`${date.raw}-${index}`} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-4" />
          <span>문서 표현: {date.raw}</span>
          <Badge variant="outline" className="text-[10px]">
            {date.precision}
          </Badge>
        </div>
      ))}
      <div className="space-y-1 rounded-md bg-muted/60 p-2">
        {candidate.evidence.map((evidence, index) => (
          <p key={`${evidence.blockId}-${index}`} className="text-xs text-muted-foreground">
            <span className="font-mono text-foreground">{evidence.blockId}</span>
            {evidence.page ? ` · ${evidence.page}쪽` : ''} — “{evidence.quote}”
          </p>
        ))}
      </div>
      {matches.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2">
          <p className="text-xs font-medium text-amber-800">기존 업무와 유사할 수 있음</p>
          {matches.map((match) => (
            <div
              key={`${match.workId}-${match.taskId ?? 'event'}`}
              className="flex items-center gap-2"
            >
              <p className="min-w-0 flex-1 text-xs text-amber-700">
                {match.workName} › {match.title} · 유사도 {Math.round(match.score * 100)}%
                {match.reasons.length ? ` (${match.reasons.join(', ')})` : ''}
              </p>
              <Button
                type="button"
                variant={
                  linkedWorkItem?.workId === match.workId &&
                  linkedWorkItem?.taskId === match.taskId
                    ? 'secondary'
                    : 'outline'
                }
                size="sm"
                className="h-7 shrink-0 text-xs"
                disabled={readOnly}
                onClick={() =>
                  onLink(
                    linkedWorkItem?.workId === match.workId &&
                      linkedWorkItem?.taskId === match.taskId
                      ? null
                      : match
                  )
                }
              >
                <Link2 className="mr-1 h-3 w-3" />
                {linkedWorkItem?.workId === match.workId &&
                linkedWorkItem?.taskId === match.taskId
                  ? '연결 해제'
                  : '연결'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DocumentIntelligenceDialog({
  open,
  onOpenChange,
  existingWorkItems = [],
  onDraftPrepared,
}: DocumentIntelligenceDialogProps) {
  const [preparing, setPreparing] = useState(false);
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [sourceText, setSourceText] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSchoolDocument | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAnalysisResult | null>(null);
  const [phase, setPhase] = useState<'idle' | 'parsing' | 'parsed' | 'analyzing' | 'complete'>(
    'idle'
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [linkedWorkItems, setLinkedWorkItems] = useState<Record<string, ExistingWorkItem>>({});
  const [historyMatch, setHistoryMatch] = useState<DocumentHistoryMatch | null>(null);
  const [analysisRunId, setAnalysisRunId] = useState<string | null>(null);
  const [historyWarning, setHistoryWarning] = useState<string | null>(null);
  const [appliedHistoryReadOnly, setAppliedHistoryReadOnly] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<DocumentAnalysisProgress | null>(null);
  /** 지금 수정 중인 후보의 localId. 겹쳐 띄우므로 바깥 모달은 그대로 둔다. */
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const operationId = useRef(0);
  const analysisAbortController = useRef<AbortController | null>(null);

  const reset = () => {
    analysisAbortController.current?.abort();
    analysisAbortController.current = null;
    operationId.current += 1;
    setPreparing(false);
    setFile(null);
    setSourceText('');
    setSourceTitle('');
    setParsed(null);
    setAnalysis(null);
    setPhase('idle');
    setError(null);
    setSelectedCandidateIds(new Set());
    setLinkedWorkItems({});
    setHistoryMatch(null);
    setAnalysisRunId(null);
    setHistoryWarning(null);
    setAppliedHistoryReadOnly(false);
    setAnalysisProgress(null);
    setEditingCandidateId(null);
  };

  const showAnalysis = (
    result: DocumentAnalysisResult,
    record: DocumentAnalysisHistoryRecord | null = null
  ) => {
    const decisions = record?.decisions ?? [];
    const hasSavedDecisions = decisions.length > 0;
    setAnalysis(result);
    setAnalysisRunId(record?.id ?? null);
    setAppliedHistoryReadOnly(record?.status === 'applied');
    setSelectedCandidateIds(
      new Set(
        hasSavedDecisions
          ? decisions
              .filter((decision) => decision.decision === 'create')
              .map((decision) => decision.candidateId)
          : result.candidates
              .filter((candidate) => candidate.type !== 'information')
              .map((candidate) => candidate.localId)
      )
    );
    const restoredLinks: Record<string, ExistingWorkItem> = {};
    for (const decision of decisions) {
      if (decision.decision !== 'link_event' && decision.decision !== 'link_task') continue;
      const match = existingWorkItems.find((item) =>
        decision.decision === 'link_task'
          ? item.taskId === decision.linkedTaskId
          : item.workId === decision.linkedWorkId && item.taskId === null
      );
      if (match) restoredLinks[decision.candidateId] = match;
    }
    setLinkedWorkItems(restoredLinks);
    setPhase('complete');
    setAnalysisProgress(null);
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const handleFile = async (selected: File | null) => {
    analysisAbortController.current?.abort();
    analysisAbortController.current = null;
    const requestId = ++operationId.current;
    setFile(selected);
    setParsed(null);
    setAnalysis(null);
    setError(null);
    setHistoryWarning(null);
    setHistoryMatch(null);
    setAnalysisRunId(null);
    setAppliedHistoryReadOnly(false);
    setLinkedWorkItems({});
    setAnalysisProgress(null);
    if (!selected) {
      setPhase('idle');
      return;
    }
    if (selected.size > 50 * 1024 * 1024) {
      setError('파일 크기는 50MB 이하여야 합니다.');
      setPhase('idle');
      return;
    }

    setPhase('parsing');
    try {
      const [result, history] = await Promise.all([
        parseSchoolDocument(selected),
        findDocumentAnalysisHistory(selected).catch((historyError) => {
          console.warn('문서 분석 이력 조회 실패:', historyError);
          return null;
        }),
      ]);
      if (operationId.current !== requestId) return;
      setParsed(result);
      setHistoryMatch(history);
      setPhase('parsed');
      return { parsed: result, file: selected, historyMatch: history };
    } catch (caught) {
      if (operationId.current !== requestId) return;
      const message =
        caught instanceof UnsupportedDocumentError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : '문서를 읽지 못했습니다.';
      setError(message);
      setPhase('idle');
    }
  };

  const handleAnalyze = async (source?: {
    parsed: ParsedSchoolDocument;
    file: File;
    historyMatch: DocumentHistoryMatch | null;
  }) => {
    const target = source ?? (parsed && file ? { parsed, file, historyMatch } : null);
    if (!target) return;
    analysisAbortController.current?.abort();
    const abortController = new AbortController();
    analysisAbortController.current = abortController;
    const requestId = ++operationId.current;
    setError(null);
    setAnalysisProgress(null);
    setPhase('analyzing');
    try {
      const result = await analyzeParsedDocument(target.parsed, {
        signal: abortController.signal,
        onProgress: (progress) => {
          if (operationId.current === requestId) setAnalysisProgress(progress);
        },
      });
      if (operationId.current !== requestId) return;
      let savedRecord: DocumentAnalysisHistoryRecord | null = null;
      try {
        savedRecord = await saveDocumentAnalysis({
          file: target.file,
          parsed: target.parsed,
          analysis: result,
          fingerprint: target.historyMatch?.fingerprint,
          revisionOf:
            target.historyMatch?.exact?.id ?? target.historyMatch?.previousRevision?.id ?? null,
        });
        if (operationId.current === requestId) setHistoryWarning(null);
      } catch (historyError) {
        console.warn('문서 분석 이력 저장 실패:', historyError);
        if (operationId.current === requestId) {
          setHistoryWarning(
            '분석은 완료했지만 이력은 저장하지 못했습니다. 데이터베이스 마이그레이션 적용 상태를 확인해주세요.'
          );
        }
      }
      if (operationId.current !== requestId) return;
      showAnalysis(result, savedRecord);
    } catch (caught) {
      if (operationId.current !== requestId) return;
      setError(caught instanceof Error ? caught.message : '문서 분석에 실패했습니다.');
      setPhase('parsed');
      setAnalysisProgress(null);
    } finally {
      if (analysisAbortController.current === abortController) {
        analysisAbortController.current = null;
      }
    }
  };

  const busy = preparing || phase === 'parsing' || phase === 'analyzing';
  const analyzeText = async () => {
    if (!sourceText.trim() || busy) return;
    const title = (
      sourceTitle.trim() ||
      sourceText.trim().split(/\r?\n/)[0].slice(0, 60) ||
      '입력한 문서'
    ).replace(/[\\/:*?"<>|]/g, '_');
    const source = await handleFile(
      new File([sourceText.trim()], `${title}.txt`, { type: 'text/plain' })
    );
    if (source) await handleAnalyze(source);
  };

  const toggleCandidate = (candidateId: string, checked: boolean) => {
    if (checked) {
      setLinkedWorkItems((current) => {
        const next = { ...current };
        delete next[candidateId];
        return next;
      });
    }
    setSelectedCandidateIds((current) => {
      const next = new Set(current);
      if (checked) next.add(candidateId);
      else next.delete(candidateId);
      return next;
    });
  };

  const linkCandidate = (candidateId: string, item: ExistingWorkItem | null) => {
    setLinkedWorkItems((current) => {
      const next = { ...current };
      if (item) next[candidateId] = item;
      else delete next[candidateId];
      return next;
    });
    if (item) toggleCandidate(candidateId, false);
  };

  /**
   * 카드 수정을 반영한다. 화면은 즉시 바뀌고 이력 저장은 뒤따른다.
   *
   * 저장이 실패해도 **화면의 수정을 되돌리지 않는다** — 되돌리면 방금 친 글이 사라진다.
   * 대신 경고를 남겨 "이 수정은 이번 화면에서만 유효하다"를 알린다(업무 초안에는 반영된다).
   */
  const handleSaveCandidateEdit = (localId: string, edit: DocumentCandidateEdit | null) => {
    setAnalysis((current) => {
      if (!current) return current;
      const next = withCandidateEdit(current, localId, edit);
      if (analysisRunId) {
        void saveDocumentAnalysisResult(analysisRunId, next).catch((saveError) => {
          console.warn('문서 분석 수정 저장 실패:', saveError);
          setHistoryWarning(
            '수정한 내용을 이력에 저장하지 못했습니다. 지금 만드는 업무 초안에는 반영되지만, 나중에 이 분석을 다시 열면 수정이 남아 있지 않습니다.'
          );
        });
      }
      return next;
    });
  };

  const buildDecisions = (): DocumentCandidateDecision[] =>
    (analysis?.candidates ?? []).map((candidate) => {
      const linked = linkedWorkItems[candidate.localId];
      if (linked) {
        return {
          candidateId: candidate.localId,
          decision: linked.taskId ? 'link_task' : 'link_event',
          linkedWorkId: linked.workId,
          linkedTaskId: linked.taskId,
          createdTaskId: null,
        };
      }
      return {
        candidateId: candidate.localId,
        decision: selectedCandidateIds.has(candidate.localId) ? 'create' : 'exclude',
        linkedWorkId: null,
        linkedTaskId: null,
        createdTaskId: null,
      };
    });

  const handlePrepareDraft = async () => {
    if (!analysis || !file || busy) return;
    const requestId = operationId.current;
    setPreparing(true);
    try {
      let decisionsSaved = false;
      if (analysisRunId) {
        try {
          await saveDocumentAnalysisDecisions(analysisRunId, buildDecisions());
          decisionsSaved = true;
        } catch (historyError) {
          console.warn('문서 분석 검토 결과 저장 실패:', historyError);
          toast.warning('검토 결과 이력을 저장하지 못했지만 업무 초안은 계속 만들 수 있습니다.');
        }
      }
      if (operationId.current !== requestId) return;
      const draft = createDocumentTaskDraft(
        analysis,
        file.name,
        selectedCandidateIds,
        analysisRunId
      );
      if (draft.tasks.length === 0) {
        if (decisionsSaved) {
          toast.success('기존 업무 연결과 제외 결정을 저장했습니다.');
          handleOpenChange(false);
        } else {
          setError(
            '새 업무로 만들 후보를 선택하거나 저장 가능한 기존 분석에서 연결 결정을 남겨주세요.'
          );
        }
        return;
      }
      if (!onDraftPrepared) return;
      onDraftPrepared(draft);
      handleOpenChange(false);
    } finally {
      if (operationId.current === requestId) setPreparing(false);
    }
  };

  const editingCandidate =
    analysis?.candidates.find((candidate) => candidate.localId === editingCandidateId) ?? null;

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 bg-gradient-to-b from-violet-50/60 to-white px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <FileSearch className="h-5 w-5" />
            </span>
            학교 문서 분석
          </DialogTitle>
          <DialogDescription>
            파일이나 붙여넣은 글에서 일정·업무·제출물을 찾고, 검토한 항목으로 업무 초안을 만듭니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
          <div
            className="flex w-fit gap-1 rounded-xl bg-slate-100 p-1"
            role="group"
            aria-label="분석 자료 입력 방식"
          >
            {(
              [
                { value: 'file', label: '파일 첨부', icon: FileUp },
                { value: 'text', label: '텍스트 입력', icon: AlignLeft },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-pressed={inputMode === value}
                className={`gap-2 rounded-lg ${inputMode === value ? 'bg-white text-violet-700 shadow-sm hover:bg-white hover:text-violet-700' : 'text-slate-500'}`}
                onClick={() => {
                  setInputMode(value);
                  void handleFile(null);
                }}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>
          {inputMode === 'file' ? (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/30 px-5 py-7 text-center transition-colors hover:bg-violet-50">
              <FileUp className="mb-1 h-7 w-7 text-violet-500" />
              <span className="text-sm font-semibold text-slate-700">
                {file?.name ?? '분석할 문서를 선택하세요'}
              </span>
              <span className="text-xs text-slate-500">HWPX · PDF · TXT · MD / 최대 50MB</span>
              <Input
                aria-label="분석할 문서 파일"
                className="mt-2 max-w-sm bg-white text-xs"
                type="file"
                accept=".hwpx,.hwp,.pdf,.txt,.md,application/pdf,text/plain"
                onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
                disabled={busy}
              />
            </label>
          ) : (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="analysis-source-title">
                  자료 제목 <span className="font-normal text-slate-400">선택</span>
                </Label>
                <Input
                  id="analysis-source-title"
                  value={sourceTitle}
                  maxLength={120}
                  disabled={busy}
                  placeholder="예: 2학기 교육과정 운영 안내"
                  className="bg-white"
                  onChange={(e) => {
                    setSourceTitle(e.target.value);
                    void handleFile(null);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="analysis-source-text">분석할 텍스트</Label>
                <Textarea
                  id="analysis-source-text"
                  value={sourceText}
                  disabled={busy}
                  maxLength={480000}
                  rows={10}
                  className="min-h-48 bg-white leading-relaxed"
                  placeholder="공문, 메신저 안내, 회의 메모 등의 내용을 붙여넣으세요."
                  onChange={(e) => {
                    setSourceText(e.target.value);
                    void handleFile(null);
                  }}
                />
                <p className="text-right text-xs tabular-nums text-slate-400">
                  {sourceText.length.toLocaleString()} / 480,000자
                </p>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>처리할 수 없습니다</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {(phase === 'parsing' || phase === 'analyzing') && (
            <div className="space-y-3 py-8 text-sm text-muted-foreground">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                {phase === 'parsing'
                  ? '문서 구조를 읽고 있습니다.'
                  : analysisProgress?.totalChunks && analysisProgress.totalChunks > 1
                    ? `장문 분석 ${analysisProgress.completedChunks}/${analysisProgress.totalChunks} 단위${analysisProgress.stage === 'merging' ? ' · 중복 후보 병합 중' : ''}`
                    : '업무 후보와 원문 근거를 분석하고 있습니다.'}
              </div>
              {phase === 'analyzing' &&
                analysisProgress?.totalChunks &&
                analysisProgress.totalChunks > 1 && (
                  <div className="mx-auto max-w-md space-y-1">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-violet-600 transition-all"
                        style={{
                          width: `${Math.round((analysisProgress.completedChunks / analysisProgress.totalChunks) * 100)}%`,
                        }}
                      />
                    </div>
                    {analysisProgress.failedChunks > 0 && (
                      <p className="text-center text-xs text-amber-700">
                        실패한 단위 {analysisProgress.failedChunks}개 · 나머지 결과로 계속
                        진행합니다.
                      </p>
                    )}
                    {/* 단일 호출이 느려 분할로 전환한 경우. 이유를 말하지 않으면 진행률이
                        1/1 에서 0/4 로 되돌아가는 것이 고장처럼 보인다. */}
                    {analysisProgress.note && (
                      <p className="text-center text-xs text-slate-500">{analysisProgress.note}</p>
                    )}
                  </div>
                )}
            </div>
          )}

          {historyMatch?.exact && !analysis && (
            <Alert>
              <History className="h-4 w-4" />
              <AlertTitle>이전에 분석한 동일한 파일입니다</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span>
                  {new Date(historyMatch.exact.createdAt).toLocaleString('ko-KR')} 분석 · 상태{' '}
                  {historyMatch.exact.status}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => showAnalysis(historyMatch.exact!.analysis, historyMatch.exact)}
                >
                  이전 분석 불러오기
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {historyMatch?.previousRevision && !historyMatch.exact && !analysis && (
            <Alert>
              <History className="h-4 w-4" />
              <AlertTitle>이전 문서의 개정판일 수 있습니다</AlertTitle>
              <AlertDescription>
                파일 내용은 달라졌지만 ‘{historyMatch.previousRevision.fileName}’과 문서 이름이
                같습니다. 새 분석은 이전 판과 연결해 저장됩니다.
              </AlertDescription>
            </Alert>
          )}

          {historyWarning && (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>{historyWarning}</AlertDescription>
            </Alert>
          )}

          {parsed && phase !== 'parsing' && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <span className="font-medium">{file?.name}</span>
              <Badge variant="outline">{parsed.format.toUpperCase()}</Badge>
              <span>{parsed.characterCount.toLocaleString()}자</span>
              <span>{parsed.blocks.length.toLocaleString()}개 구조 블록</span>
              {parsed.pageCount && <span>{parsed.pageCount}쪽</span>}
            </div>
          )}

          {parsed?.warnings.length ? (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>파싱 경고</AlertTitle>
              <AlertDescription>{parsed.warnings.join(' ')}</AlertDescription>
            </Alert>
          ) : null}

          {analysis && (
            <div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-semibold">{analysis.documentTitle}</h3>
                  <p className="text-sm text-muted-foreground">{analysis.summary}</p>
                  <div className="flex gap-2 pt-1">
                    <Badge>{analysis.documentType}</Badge>
                    <Badge variant="secondary">후보 {analysis.candidates.length}건</Badge>
                    {editedCandidateCount(analysis) > 0 && (
                      <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                        수정 {editedCandidateCount(analysis)}건
                      </Badge>
                    )}
                  </div>
                </div>
                {analysis.warnings.length > 0 && (
                  <Alert>
                    <ShieldAlert className="h-4 w-4" />
                    <AlertDescription>{analysis.warnings.join(' ')}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-3">
                  {analysis.candidates.map((candidate) => (
                    <CandidateCard
                      key={candidate.localId}
                      candidate={candidate}
                      edit={candidateEditOf(analysis, candidate.localId)}
                      checked={selectedCandidateIds.has(candidate.localId)}
                      onCheckedChange={(checked) => toggleCandidate(candidate.localId, checked)}
                      existingWorkItems={existingWorkItems}
                      linkedWorkItem={linkedWorkItems[candidate.localId] ?? null}
                      onLink={(item) => linkCandidate(candidate.localId, item)}
                      onEdit={() => setEditingCandidateId(candidate.localId)}
                      readOnly={appliedHistoryReadOnly}
                    />
                  ))}
                </div>
                {analysis.candidates.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                    <CheckSquare className="h-8 w-8" />
                    근거가 확인된 실행 후보가 없습니다.
                  </div>
                )}
                {appliedHistoryReadOnly && (
                  <Alert>
                    <History className="h-4 w-4" />
                    <AlertTitle>이미 업무에 반영한 분석입니다</AlertTitle>
                    <AlertDescription>
                      이 기록은 감사용으로 읽기만 할 수 있습니다. 같은 파일에서 새 업무를 만들려면
                      위의 AI 분석 실행으로 새 분석 이력을 만드세요.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="items-center border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="sm:mr-auto"
            onClick={() => handleOpenChange(false)}
          >
            {busy ? '분석 취소' : '닫기'}
          </Button>
          {analysis &&
            onDraftPrepared &&
            analysis.candidates.length > 0 &&
            !appliedHistoryReadOnly && (
              <Button
                type="button"
                className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
                disabled={busy}
                onClick={() => void handlePrepareDraft()}
              >
                <CheckSquare className="h-4 w-4" />
                {selectedCandidateIds.size > 0
                  ? `선택 ${selectedCandidateIds.size}개로 업무 초안 만들기`
                  : '검토 결과 저장'}
              </Button>
            )}
          <Button
            type="button"
            className="gap-2 bg-violet-600 text-white hover:bg-violet-700"
            disabled={busy || (inputMode === 'text' ? !sourceText.trim() : !parsed)}
            onClick={() => void (inputMode === 'text' ? analyzeText() : handleAnalyze())}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? '분석 중…' : analysis ? '다시 분석' : 'AI 분석 실행'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {/* 겹쳐 띄운다 — 바깥 모달을 닫지 않는다(`docs/nested-modal-pitfalls.md`).
        `container` 를 넘기지 않으므로 body 로 포털돼 화면 가운데에 뜬다. */}
    <CandidateEditDialog
      open={editingCandidateId !== null}
      onOpenChange={(next) => { if (!next) setEditingCandidateId(null); }}
      candidate={editingCandidate}
      edit={analysis && editingCandidateId ? candidateEditOf(analysis, editingCandidateId) : undefined}
      onSave={handleSaveCandidateEdit}
    />
    </>
  );
}
