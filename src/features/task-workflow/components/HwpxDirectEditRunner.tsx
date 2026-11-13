// document.template_fill@1 러너 v2 — "HWPX 직접 작성" OVERHAUL(2026-07-26).
// 파이프라인: 양식 파일 업로드 → rhwp 시각 편집기에서 직접 수정 → 완료 시
// 결과 HWPX를 RUN(needs_review)+파일 ARTIFACT로 기록하고 즉시 다운로드.
// (구 치환 필드 방식 HwpxTemplateActionRunner를 대체 — 템플릿 등록·버전 관리 없음,
//  과거 RUN·템플릿 데이터는 그대로 조회된다.)
import { useCallback, useRef, useState } from 'react';
import { FileUp, Loader2, Save } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  RhwpVisualEditor,
  type RhwpVisualEditorHandle,
  type RhwpVisualEditorState,
} from '@/components/rhwp/RhwpVisualEditor';
import { HWPX_MIME_TYPE } from '../document/hwpxTemplateEngine';
import { useFinalizeTaskActionRun, useStartTaskActionRun } from '../hooks/useTaskActions';
import { uploadGeneratedSpecHwpx } from '../services/specTemplateService';
import type { TaskAction, TaskActionCheckInput } from '../types';

export function HwpxDirectEditRunner({
  action, taskTitle, workflowId,
}: { action: TaskAction; taskTitle: string; workflowId: string | null }) {
  const startRun = useStartTaskActionRun();
  const finalizeRun = useFinalizeTaskActionRun(action.id);
  const editorRef = useRef<RhwpVisualEditorHandle | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [editorState, setEditorState] = useState<RhwpVisualEditorState | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSource = useCallback(
    () => (file ? Promise.resolve(file) : Promise.reject(new Error('파일이 없습니다.'))),
    [file],
  );

  const complete = async () => {
    const handle = editorRef.current;
    if (!file || !handle) return;
    setBusy(true);
    let runId: string | null = null;
    try {
      const bytes = await handle.exportHwpx();
      const blob = new Blob([bytes as BlobPart], { type: HWPX_MIME_TYPE });

      const checks: TaskActionCheckInput[] = [{
        key: 'hwpx-export',
        label: 'HWPX 내보내기',
        status: 'pass',
        message: `${blob.size.toLocaleString('ko-KR')} bytes`,
      }];
      try {
        const verify = (await handle.exportHwpVerify()) as { ok?: boolean; message?: string };
        checks.push({
          key: 'hwp-verify',
          label: 'HWP 변환 검증',
          status: verify.ok === false ? 'warn' : 'pass',
          message: verify.message?.slice(0, 300) ?? '',
        });
      } catch { /* 검증 엔진 미지원 문서 — 내보내기 체크만 기록 */ }

      const run = await startRun.mutateAsync({
        actionId: action.id,
        workflowId,
        inputSnapshot: { mode: 'direct_edit', sourceFileName: file.name },
      });
      runId = run.id;

      const base = file.name.replace(/\.(hwpx?|hml)$/i, '');
      const uploaded = await uploadGeneratedSpecHwpx({
        runId, blob, fileName: `${taskTitle}_${base}(수정)`,
      });

      await finalizeRun.mutateAsync({
        runId,
        status: 'needs_review',
        outputSummary: {
          mode: 'direct_edit',
          fileName: uploaded.fileName,
          sourceFileName: file.name,
          sizeBytes: uploaded.sizeBytes,
        },
        checks,
        artifacts: [{
          key: 'edited-hwpx',
          type: 'file',
          label: uploaded.fileName,
          locator: { bucket: uploaded.bucket, path: uploaded.path, fileName: uploaded.fileName },
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
          contentSha256: uploaded.contentSha256,
          metadata: { mode: 'direct_edit' },
        }],
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = uploaded.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('수정 결과를 다운로드하고 검수 대기로 기록했습니다.');
    } catch (e) {
      const message = e instanceof Error ? e.message : '결과 기록에 실패했습니다.';
      if (runId) {
        try {
          await finalizeRun.mutateAsync({ runId, status: 'failed', errorSummary: message.slice(0, 500) });
        } catch { /* 이중 실패는 이력에 남김 */ }
      }
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (!file) {
    return (
      <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/40 p-6 text-center">
        <FileUp className="mx-auto mb-1 h-5 w-5 text-blue-400" />
        <p className="mb-2 text-xs text-slate-500">
          양식 HWP/HWPX 파일을 올리면 rhwp 편집기에서 직접 수정하고, 완료 시 결과를 다운로드·검수 기록합니다.
        </p>
        <Input
          type="file" accept=".hwp,.hwpx" className="mx-auto max-w-xs"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''; }}
        />
      </div>
    );
  }

  const editorReady = editorState?.status === 'ready';
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs text-slate-600">
          <strong className="font-medium text-slate-700">{file.name}</strong>
          {editorState?.status === 'ready' ? ` · ${editorState.pageCount}쪽` : ''}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setFile(null); setEditorState(null); }}>
            다른 파일
          </Button>
          <Button size="sm" disabled={busy || !editorReady} onClick={() => void complete()}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            수정 완료 — 다운로드·검수 기록
          </Button>
        </div>
      </div>
      <RhwpVisualEditor
        ref={editorRef}
        fileName={file.name}
        loadSource={loadSource}
        className="min-h-[520px] flex-1 overflow-hidden rounded-xl border border-slate-300"
        onStateChange={setEditorState}
      />
      <p className="text-[11px] text-slate-400">
        일반 편집 중에는 서버 전송이 없습니다. 완료 시에만 결과 파일이 검수 대기(RUN)로 기록됩니다.
      </p>
    </div>
  );
}
