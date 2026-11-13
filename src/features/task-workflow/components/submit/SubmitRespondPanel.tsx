// ========================================
// 제출 받기 — 대상자 화면 (2026-10-01)
//   파일     = 내가 올린 파일 + 올리기(구글 공용 드라이브)
//   양식 문서 = 낸 문서 + [작성하기]/[다시 작성] (작성 화면은 양식 작성 러너를 제출 모드로)
//   실물     = 매니저가 붙인 양식 + 내가 냈는지(매니저의 [받음]) — 누를 것이 없다
// 판(board)은 서버가 대상자에게 «내 것만» 준다(get_collect_board).
// 과제 단위 할 일(축 unit, 2026-10-01): 내 단위·아직 아무도 맡지 않은 단위 중 하나를 골라 낸다 —
//   내는 순간 그 단위를 맡고, 그 단위에 남은 제출이 없으면 완료된다(서버 _submission_sync_unit).
// ========================================

import { lazy, Suspense, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, CloudOff, Download, ExternalLink, FileText, Loader2, PencilLine, Trash2, Upload } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { MultiFileUpload } from '@/components/ui/multi-file-upload';
import { DriveConnectButton } from '@/components/auth/DriveConnectButton';
import { getGoogleDriveService } from '@/services/googleDriveServiceNew';
import { heldUnits, parseSubmitConfig, unclaimedUnits, withdrawSubmissionConfirmMessage, type SubmitActionType, type SubmitUnit } from '@/lib/submitAction';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TaskAction } from '../../types';
import { isUnitAxis, type SubmitBoard } from '../../services/submitActionService';
import { useDeleteActionSubmission, useSubmitActionDocument, useSubmitActionFiles } from '../../hooks/useSubmitAction';
import { useRunnerUnsaved } from '../runnerUnsaved';
import { downloadSubmittedDocument } from '../../hooks/useSubmittedDocuments';

const SpecFillActionRunner = lazy(() =>
  import('../SpecFillActionRunner').then((m) => ({ default: m.SpecFillActionRunner })),
);

/** 단위 축이면 고를 수 있는 단위(내 것 먼저, 그다음 아직 아무도 맡지 않은 것)와 고른 단위 */
function useUnitChoice(board: SubmitBoard) {
  const unitAxis = isUnitAxis(board);
  const myRid = board.targets.find((t) => !t.removed && t.resource_id && board.viewer.resource_ids.includes(t.resource_id))?.resource_id ?? null;
  const mine = unitAxis ? heldUnits(board.units, board.unit_progress, myRid) : [];
  const free = unitAxis ? unclaimedUnits(board.units, board.unit_progress) : [];
  const options: (SubmitUnit & { mine: boolean })[] = [
    ...mine.map((u) => ({ ...u, mine: true })),
    ...free.map((u) => ({ ...u, mine: false })),
  ];
  const [unitKey, setUnitKey] = useState<string>('');
  // 내 단위가 있을 때만 미리 고른다(2026-10-06) — 아무도 안 맡은 단위를 미리 골라 두면, 그대로 내는 순간
  // 모르는 사이에 그 단위를 맡게 된다
  useEffect(() => {
    if (unitAxis && !unitKey && mine.length > 0) setUnitKey(mine[0].key);
  }, [unitAxis, unitKey, mine.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const labelOf = (key: string | null | undefined) => board.units.find((u) => u.key === key)?.label ?? key ?? '';
  return { unitAxis, mine, options, unitKey: unitAxis ? unitKey || null : null, setUnitKey, labelOf };
}

function UnitPicker({ choice, disabled }: { choice: ReturnType<typeof useUnitChoice>; disabled?: boolean }) {
  if (!choice.unitAxis) return null;
  if (choice.options.length === 0) {
    return <p className="text-xs text-amber-700">낼 수 있는 과제 단위가 없습니다 — 맡은 단위가 없고 남은 단위도 없습니다.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">과제 단위</span>
      <Select value={choice.unitKey ?? ''} onValueChange={choice.setUnitKey} disabled={disabled}>
        <SelectTrigger className="h-9 w-auto min-w-[200px] text-sm"><SelectValue placeholder="단위 고르기" /></SelectTrigger>
        <SelectContent>
          {choice.options.map((u) => (
            <SelectItem key={u.key} value={u.key}>
              {u.label}{u.mine ? '' : ' · 아직 맡은 사람 없음'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-[11px] text-slate-400">내면 그 단위를 맡게 됩니다.</span>
    </div>
  );
}

function when(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function SubmitRespondPanel({ action, board }: { action: TaskAction; board: SubmitBoard }) {
  const type = action.action_type as SubmitActionType;
  const cfg = parseSubmitConfig(type, { submit: board.config });
  const open = board.request?.status === 'open';
  const mine = board.submissions; // 서버가 대상자에게는 자기 것만 준다

  return (
    <div className="space-y-4">
      {cfg.guide.trim() && (
        <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{cfg.guide}</p>
      )}
      {!open && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">마감된 요청입니다 — 더 내거나 고칠 수 없습니다.</p>
      )}
      {board.kind === 'file' && <FileBody action={action} board={board} open={open} />}
      {board.kind === 'document' && <DocumentBody action={action} board={board} open={open} templateId={cfg.template?.id ?? null} />}
      {board.kind === 'physical' && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-600">제출 양식</h3>
          {cfg.forms.length === 0 ? (
            <p className="text-xs text-slate-400">첨부된 양식이 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {cfg.forms.map((form) => (
                <li key={form.id} className="flex min-w-0 items-center gap-2 rounded-lg border bg-card px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-sm" title={form.name}>{form.name}</span>
                  <Button asChild variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2 text-xs">
                    <a href={form.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />열기</a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {isUnitAxis(board) ? (
            <PhysicalUnits board={board} />
          ) : mine.length > 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />책임자가 받았습니다 · {when(mine[0].received_at)}
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0">서류를 실물로 내 주세요. 책임자가 받았다고 체크하면 완료됩니다.</span>
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/** 실물 · 단위 축 — 내가 맡은 단위마다 받았는지 */
function PhysicalUnits({ board }: { board: SubmitBoard }) {
  const choice = useUnitChoice(board);
  if (choice.mine.length === 0) {
    return <p className="text-xs text-slate-500">맡은 과제 단위가 없습니다. 단위를 맡으면 책임자가 단위마다 받았다고 체크합니다.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {choice.mine.map((u) => {
        const got = board.submissions.find((s) => s.unit_key === u.key);
        return (
          <li key={u.key} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${got ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
            {got ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Clock3 className="h-4 w-4 shrink-0 text-slate-400" />}
            <span className="min-w-0 flex-1 truncate">{u.label}</span>
            <span className="shrink-0 text-xs">{got ? `받음 · ${when(got.received_at)}` : '받기 전'}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ── 파일 ───────────────────────────────────────────────────────────────────

function FileBody({ action, board, open }: { action: TaskAction; board: SubmitBoard; open: boolean }) {
  const [pending, setPending] = useState<File[]>([]);
  const [driveReady, setDriveReady] = useState<boolean | null>(null);
  const submit = useSubmitActionFiles();
  const remove = useDeleteActionSubmission();
  const choice = useUnitChoice(board);
  // 고르기만 하고 [내기]를 안 누른 채 닫으면 «냈다»고 믿은 파일이 사라졌다(2026-10-06)
  useRunnerUnsaved(pending.length > 0, `고른 파일 ${pending.length}개를 아직 내지 않았습니다. 닫으면 내지 않은 채 사라집니다.`);

  // 드라이브 연결은 열 때 미리 본다 — 업로드 순간에 알면 파일 고르기가 헛수고가 된다.
  // «유효한가»까지 본다(토큰이 있기만 하면 참인 isAuthenticated 는 만료된 토큰을 놓친다)
  useEffect(() => {
    let cancelled = false;
    getGoogleDriveService().hasValidToken()
      .then((ok) => { if (!cancelled) setDriveReady(ok); })
      .catch(() => { if (!cancelled) setDriveReady(false); });
    return () => { cancelled = true; };
  }, []);

  const send = async () => {
    if (!board.action.task_id) return;
    const result = await submit.mutateAsync({ actionId: action.id, taskId: board.action.task_id, files: pending, unitKey: choice.unitKey });
    setPending(result.failed.map((f) => f.file));
    if (result.failed.length > 0) toast.error(result.failed[0].message);
  };

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold text-slate-600">낸 파일</h3>
      {board.submissions.length === 0 ? (
        <p className="text-xs text-slate-400">아직 낸 파일이 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {board.submissions.map((s) => (
            <li key={s.id} className="flex min-w-0 items-center gap-2 rounded-lg border bg-card px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={s.file_name ?? ''}>{s.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.unit_key && <span className="mr-1.5 rounded bg-sky-50 px-1 py-0.5 text-[10px] font-medium text-sky-700">{choice.labelOf(s.unit_key)}</span>}
                  {when(s.created_at)}
                </p>
              </div>
              {s.file_url && (
                <Button asChild variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2 text-xs">
                  <a href={s.file_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />열기</a>
                </Button>
              )}
              {open && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (!window.confirm(withdrawSubmissionConfirmMessage(s.file_name))) return;
                    remove.mutate(s, { onError: (e: Error) => toast.error(e.message) });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />취소
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        driveReady === false ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              파일은 구글 공용 드라이브에 저장됩니다. 먼저 드라이브를 연결하세요.
              <DriveConnectButton
                className="mt-1 flex"
                returnPath={`/my-tasks?collect=${action.id}`}
                onConnected={() => setDriveReady(true)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <UnitPicker choice={choice} disabled={submit.isPending} />
            <MultiFileUpload files={pending} onFilesChange={setPending} disabled={submit.isPending || driveReady !== true} />
            {pending.length > 0 && (
              <p className="text-xs font-medium text-amber-700">아직 내지 않았습니다 — [{pending.length}개 내기]를 눌러야 제출됩니다.</p>
            )}
            <div className="flex justify-end">
              <Button
                className="h-11 w-full gap-1.5 bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 sm:h-9 sm:w-auto"
                disabled={pending.length === 0 || submit.isPending || driveReady !== true || (choice.unitAxis && !choice.unitKey)}
                onClick={() => void send()}
              >
                {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {pending.length > 0 ? `${pending.length}개 내기` : '내기'}
              </Button>
            </div>
          </div>
        )
      )}
    </section>
  );
}

// ── 양식 문서 ──────────────────────────────────────────────────────────────

function DocumentBody({ action, board, open, templateId }: {
  action: TaskAction; board: SubmitBoard; open: boolean; templateId: string | null;
}) {
  const [composing, setComposing] = useState(false);
  const submitDoc = useSubmitActionDocument();
  const choice = useUnitChoice(board);
  // 단위 축이면 고른 단위의 제출, 아니면 하나뿐인 제출
  const mine = choice.unitAxis ? board.submissions.find((s) => s.unit_key === choice.unitKey) : board.submissions[0];
  const cfg = parseSubmitConfig(action.action_type as SubmitActionType, { submit: board.config });
  // 작성 러너는 양식을 config.defaultTemplate 에서 읽는다 — 제출 작업의 양식을 그 자리에 넣어 넘긴다.
  // 러너가 만드는 문서는 action_id 가 이 작업이 되고, 서버는 그 문서만 받는다(submit_action_document).
  const runnerAction = {
    ...action,
    config: { ...(action.config ?? {}), defaultTemplate: cfg.template ?? undefined },
  } as TaskAction;

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold text-slate-600">낸 문서</h3>
      {!templateId ? (
        <p className="text-xs text-amber-700">책임자가 아직 양식을 정하지 않았습니다.</p>
      ) : mine ? (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={mine.document_title ?? ''}>{mine.document_title ?? '제출한 문서'}</span>
          <span className="shrink-0 text-xs">{when(mine.updated_at)}</span>
          {mine.document_id && (
            // 낸 문서를 한글 파일로 — 종전엔 제목 글자뿐이라 무엇을 냈는지 다시 볼 길이 없었다(2026-10-06)
            <Button
              variant="ghost"
              size="sm"
              className="h-11 shrink-0 gap-1 px-2 text-xs text-emerald-800 hover:bg-emerald-100 sm:h-7"
              onClick={() => {
                const pending = toast.loading('문서를 만드는 중…');
                downloadSubmittedDocument(mine.document_id!, mine.document_title ?? '제출한 문서')
                  .then(() => toast.success('문서를 내려받았습니다.', { id: pending }))
                  .catch((e: Error) => toast.error(e.message, { id: pending }));
              }}
            >
              <Download className="h-3.5 w-3.5" />받기
            </Button>
          )}
        </p>
      ) : (
        <p className="text-xs text-slate-400">아직 낸 문서가 없습니다.</p>
      )}
      {open && templateId && <UnitPicker choice={choice} disabled={composing} />}
      {open && templateId && (
        <div className="flex justify-end">
          <Button
            className="h-9 gap-1.5 bg-blue-600 px-4 text-sm text-white hover:bg-blue-700"
            disabled={choice.unitAxis && !choice.unitKey}
            onClick={() => setComposing(true)}
          >
            <PencilLine className="h-4 w-4" />
            {mine ? '다시 작성' : '작성하기'}
          </Button>
        </div>
      )}

      <Dialog open={composing} onOpenChange={setComposing}>
        <DialogContent className="flex h-[94vh] w-[98vw] max-w-[1800px] flex-col gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{board.action.title} 문서 작성</DialogTitle>
          <DialogDescription className="sr-only">지정된 양식의 빈칸을 채워 냅니다. 내는 것은 파일이 아니라 입력한 값입니다.</DialogDescription>
          <section className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />작성 화면 불러오는 중</div>}>
              {composing && (
                <SpecFillActionRunner
                  key={action.id}
                  action={runnerAction}
                  taskTitle={board.action.task_title ?? board.action.title}
                  workflowId={null}
                  submission={{
                    taskId: board.action.task_id ?? '',
                    unitKey: choice.unitKey,
                    unitLabel: choice.unitKey ? choice.labelOf(choice.unitKey) : null,
                    guide: cfg.guide,
                    submit: (documentId) => submitDoc.mutateAsync({ actionId: action.id, documentId, unitKey: choice.unitKey }),
                    onSubmitted: () => setComposing(false),
                  }}
                />
              )}
            </Suspense>
          </section>
        </DialogContent>
      </Dialog>
    </section>
  );
}
