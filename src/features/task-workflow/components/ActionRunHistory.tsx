// 실행·검수 이력(RUN 카드 목록) — TaskActionRunnerDialog의 서랍과 spec_fill 러너의
// 최종 단계 패널이 공유한다(TaskActionPanel에서 추출, 2026-07-26).
// RUN별 상태·체크·산출물(미리보기/다운로드)·타임라인·검수(승인/보완)·삭제를 담당.
import { useCallback, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Database,
  Download,
  Eye,
  FileText,
  FolderOpen,
  History,
  Loader2,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HwpxPreviewDialog } from '@/components/rhwp/HwpxPreviewDialog';
import type {
  TaskAction,
  TaskActionRunStatus,
  TaskActionRunWithDetails,
} from '../types';
import {
  useDeleteTaskActionRun,
  useTaskActionRuns,
} from '../hooks/useTaskActions';
import {
  downloadTaskActionFileArtifact,
  fetchTaskActionFileArtifact,
} from '../services/documentTemplateService';

const RUN_STATUS_META: Record<
  TaskActionRunStatus,
  { label: string; className: string }
> = {
  created: { label: '생성됨', className: 'border-slate-200 bg-slate-50 text-slate-700' },
  running: { label: '실행 중', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  needs_review: { label: '검수 필요', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  accepted: { label: '승인됨', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  needs_changes: { label: '보완 필요', className: 'border-orange-200 bg-orange-50 text-orange-700' },
  failed: { label: '실패', className: 'border-red-200 bg-red-50 text-red-700' },
  cancelled: { label: '취소됨', className: 'border-slate-200 bg-slate-50 text-slate-500' },
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const RUN_EVENT_LABELS = {
  started: '실행 시작',
  finalized: '실행 결과 기록',
  reviewed: '검수 완료',
} as const;

export function RunStatusBadge({ status }: { status: TaskActionRunStatus }) {
  const meta = RUN_STATUS_META[status];
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}

export function ActionRunHistory({ action, onResume, readOnly = false }: {
  action: TaskAction;
  /** 이력의 작업 내용(입력 스냅샷)을 러너로 불러와 이어서 진행 — 지원하는 호스트만 전달 */
  onResume?: (run: TaskActionRunWithDetails) => void;
  /** 읽기 전용(타인 실행 열람) — 삭제·검수·이어서 진행 숨김 */
  readOnly?: boolean;
}) {
  const { data: runs = [], isLoading } = useTaskActionRuns(action.id);
  const deleteRun = useDeleteTaskActionRun(action.id);
  const [downloadingArtifactId, setDownloadingArtifactId] = useState<string | null>(null);
  // 결과 파일 미리보기(rhwp 렌더)
  const [previewBlob, setPreviewBlob] = useState<{ blob: Blob; name: string } | null>(null);
  const loadPreviewBlob = useCallback(
    () => (previewBlob ? Promise.resolve(previewBlob.blob) : Promise.reject(new Error('미리볼 파일이 없습니다.'))),
    [previewBlob],
  );

  const handleRunDelete = async (run: TaskActionRunWithDetails) => {
    // 아직 끝나지 않은 RUN은 따로 경고한다 — 대부분은 중단돼 갇힌 유령 행이지만,
    // 정말 진행 중이라면 지운 뒤 그 실행의 마무리가 실패한다(자기 실행에만 해당).
    const pending = run.status === 'running' || run.status === 'created';
    const message = pending
      ? '아직 끝나지 않은 실행입니다. 삭제하면 진행 중이던 작업은 마무리되지 못합니다. 계속할까요?'
      : '이 실행·검수 이력을 삭제할까요? 하위 검증·결과·타임라인 기록과 결과 파일이 함께 삭제됩니다.';
    if (!window.confirm(message)) return;
    try {
      await deleteRun.mutateAsync(run.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '실행 이력을 삭제하지 못했습니다.');
    }
  };

  const handleArtifactPreview = async (
    artifact: TaskActionRunWithDetails['artifacts'][number]
  ) => {
    try {
      const { blob, fileName } = await fetchTaskActionFileArtifact(artifact);
      setPreviewBlob({ blob, name: fileName });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '결과 파일을 불러오지 못했습니다.');
    }
  };

  const handleArtifactDownload = async (
    artifact: TaskActionRunWithDetails['artifacts'][number]
  ) => {
    setDownloadingArtifactId(artifact.id);
    try {
      await downloadTaskActionFileArtifact(artifact);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '결과 파일을 내려받지 못했습니다.');
    } finally {
      setDownloadingArtifactId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        실행 이력 불러오는 중
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
        <ClipboardCheck className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-600">아직 내 실행 이력이 없습니다.</p>
        <p className="mt-1 text-xs text-slate-400">왼쪽에서 작업을 실행하면 검수 기록이 남습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => {
        const output = run.output_summary;
        const latestReview = run.reviews[run.reviews.length - 1];

        return (
          <article key={run.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-700">
                  {new Date(run.started_at).toLocaleString('ko-KR')}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">RUN {run.id.slice(0, 8)}</p>
              </div>
              <div className="flex items-center gap-1">
                <RunStatusBadge status={run.status} />
                {/* 실행 중(created/running)도 지울 수 있다(2026-08-14) — RUN이 그 상태에
                    갇히는 주 경로는 진짜 진행이 아니라 클라이언트 중단이고, 종전엔
                    그 유령 행을 지울 방법이 아예 없었다. 서버도 함께 열었다
                    (`delete_task_action_run` 상태 가드 제거 + DELETE 정책 소유자 기준). */}
                {!readOnly && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-slate-300 hover:text-red-500"
                    title="실행 이력 삭제"
                    disabled={deleteRun.isPending}
                    onClick={() => void handleRunDelete(run)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {run.error_summary && (
              <div className="mt-3 flex gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{run.error_summary}</span>
              </div>
            )}

            {action.action_type === 'evalearn.mock_marking_import' &&
              Object.keys(output).length > 0 && (
              <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-center">
                <div>
                  <dt className="text-[10px] text-slate-400">추가</dt>
                  <dd className="text-sm font-bold text-emerald-600">{toNumber(output.inserted)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-400">갱신</dt>
                  <dd className="text-sm font-bold text-blue-600">{toNumber(output.updated)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-400">미매칭</dt>
                  <dd className="text-sm font-bold text-red-600">{toNumber(output.unmatched)}</dd>
                </div>
              </dl>
              )}

            {(action.action_type === 'document.template_fill' || action.action_type === 'document.spec_fill') &&
              typeof output.fileName === 'string' && (
                <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                  <strong className="font-medium text-slate-700">{output.fileName}</strong>
                  {typeof output.templateName === 'string' && (
                    <span className="ml-1 text-slate-400">· {output.templateName}</span>
                  )}
                </div>
              )}

            {output.mode === 'link' && typeof output.memo === 'string' && output.memo && (
              <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                <span className="text-[10px] text-slate-400">처리 메모</span>
                <p className="mt-0.5 whitespace-pre-wrap">{output.memo}</p>
              </div>
            )}

            <RunAuthoringNote snapshot={run.input_snapshot} />

            {onResume && !readOnly && run.input_snapshot != null && (run.input_snapshot as { plan?: unknown }).plan != null && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 h-7 w-full text-[11px] text-blue-700 hover:bg-blue-50"
                title="이 실행에 사용한 양식·계획 값을 불러와 이어서 진행합니다"
                onClick={() => onResume(run)}
              >
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                이 작업 내용 불러와서 진행
              </Button>
            )}

            {run.checks.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {run.checks.map((check) => (
                  <div key={check.id} className="flex items-start gap-2 text-xs">
                    {check.status === 'pass' ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : check.status === 'warn' ? (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    ) : (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                    )}
                    <span className="text-slate-600">
                      <strong className="font-medium text-slate-700">{check.label}</strong>
                      {check.message ? ` · ${check.message}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {run.artifacts.length > 0 && (
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/50 p-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-700">
                  <Database className="h-3.5 w-3.5" />
                  처리 결과 {run.artifacts.length}건
                </div>
                <div className="mt-1.5 space-y-1">
                  {run.artifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      className="flex items-center justify-between gap-2 text-xs text-slate-600"
                    >
                      <div>
                        <span className="font-medium text-slate-700">{artifact.label}</span>
                        {artifact.artifact_type === 'record_set' && (
                          <span className="ml-1 text-[10px] text-slate-400">데이터 레코드</span>
                        )}
                        {artifact.artifact_type === 'file' && (
                          <span className="ml-1 text-[10px] text-slate-400">파일</span>
                        )}
                      </div>
                      {artifact.artifact_type === 'file' && (
                        <div className="flex shrink-0 items-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="결과 파일 미리보기(rhwp)"
                            onClick={() => void handleArtifactPreview(artifact)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="결과 파일 다운로드"
                            disabled={downloadingArtifactId === artifact.id}
                            onClick={() => void handleArtifactDownload(artifact)}
                          >
                            {downloadingArtifactId === artifact.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {run.events.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-2">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                  <History className="h-3.5 w-3.5" />
                  처리 타임라인
                </div>
                <ol className="space-y-1">
                  {run.events.map((event) => (
                    <li key={event.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-slate-600">
                        {RUN_EVENT_LABELS[event.log_type]}
                        <span className="ml-1 text-slate-400">
                          {RUN_STATUS_META[event.to_status].label}
                        </span>
                      </span>
                      <time className="shrink-0 text-[10px] text-slate-400">
                        {new Date(event.created_at).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {latestReview && (
              <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs text-slate-600">
                <span className="font-semibold">
                  {latestReview.decision === 'accepted' ? '승인' : '보완 요청'}
                </span>
                {latestReview.comment ? ` · ${latestReview.comment}` : ''}
              </div>
            )}

            {run.status === 'accepted' && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                검수 승인된 실행입니다. 할 일 완료 여부를 확인할 수 있습니다.
              </div>
            )}

          </article>
        );
      })}
      {previewBlob && (
        <HwpxPreviewDialog
          open={!!previewBlob}
          onOpenChange={(open) => { if (!open) setPreviewBlob(null); }}
          title={previewBlob.name}
          loadSource={loadPreviewBlob}
        />
      )}
    </div>
  );
}

/**
 * 실행 기록의 "사용자가 작성한 맥락" 표시(2026-09-02).
 *
 * **조립된 LLM 프롬프트가 아니다** — 사용자가 설명란에 쓴 글과 그때 고른 맥락뿐이다.
 * knowledge(학생 데이터가 실릴 수 있다)·양식 예시·스키마는 스냅샷에 담지 않는다.
 * 실행 기록이 RLS로 보호되던 데이터의 사본이 되면 안 되기 때문이다.
 *
 * 기본은 접힘 — 대부분의 조회는 "언제 무엇을 만들었나"를 보러 오지 설명 원문을 읽으러
 * 오지 않는다. 옛 기록에는 이 필드가 없으므로(없으면 렌더 자체를 건너뛴다) 하위 호환된다.
 */
function RunAuthoringNote({ snapshot }: { snapshot: unknown }) {
  const [open, setOpen] = useState(false);
  const authoring = (snapshot as { authoring?: {
    note?: string;
    contexts?: { title: string; body: string }[];
    mode?: string;
  } } | null)?.authoring;
  const note = authoring?.note?.trim() ?? '';
  const contexts = authoring?.contexts ?? [];
  if (!note && contexts.length === 0) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-slate-50"
        onClick={() => setOpen(!open)}
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="text-[11px] font-semibold text-slate-600">AI에게 준 설명</span>
        {contexts.length > 0 && (
          <span className="rounded-full bg-slate-100 px-1.5 text-[9px] font-semibold text-slate-600">
            맥락 {contexts.length}
          </span>
        )}
        {authoring?.mode === 'generate' && (
          <span className="rounded-full bg-blue-50 px-1.5 text-[9px] font-semibold text-blue-600">설명 기반 생성</span>
        )}
        <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-200 p-2">
          {note && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500">직접 쓴 설명</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-snug text-slate-600">{note}</p>
            </div>
          )}
          {contexts.map((c, i) => (
            <div key={`${c.title}-${i}`}>
              <p className="truncate text-[10px] font-semibold text-slate-500" title={c.title}>맥락 · {c.title}</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-snug text-slate-600">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
