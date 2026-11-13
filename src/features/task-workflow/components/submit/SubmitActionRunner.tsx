// ========================================
// 제출 받기 러너 — submit.file / submit.document / submit.physical (2026-10-01)
// 입력 받기 러너(CollectInputRunner)와 같은 틀이다(사용자 결정: UI 는 입력 받기를 따른다).
//   매니저: 설정(요청 · 누구에게 · 종류별) → [요청 보내기] / 현황(진척 · 다시 알림 · 명단 다시 계산 · 마감 · 내려받기)
//   대상자: SubmitRespondPanel
// 요청은 언제나 [요청 보내기]로 나간다(2026-10-01 — 연결·저장만으로 알림이 가지 않는다. 입력 받기와 같다).
// 요청·명단·설정 RPC 는 입력 받기와 같은 것을 쓴다(종류는 서버가 작업 유형에서 안다).
// ========================================

import { useEffect, useMemo, useState } from 'react';
import {
  BellRing, CheckCircle2, Clock3, Download, ExternalLink, FileText, Inbox, Loader2, Lock, PenLine, RefreshCw, Send, Settings2,
  Table2, Trash2, Undo2, Unlock, Users,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AudiencePreview } from '@/components/audience/AudiencePreview';
import { AudienceRuleBuilder } from '@/components/audience/AudienceRuleBuilder';
import { SubmissionDataActions } from '@/components/tasks/SubmissionDataActions';
import { SubmissionTemplatePicker } from '@/components/tasks/SubmissionTemplatePicker';
import { PhysicalFormFilesField } from '@/components/tasks/PhysicalFormFilesField';
import { summarizeResolution } from '@/lib/audienceRule';
import {
  buildSubmitRows, parseSubmitConfig, serializeSubmitConfig, submitProgress, SUBMIT_KIND_LABEL, SUBMIT_STATE_LABEL, validateSubmitConfig,
  withdrawSubmissionConfirmMessage,
  type SubmitActionType, type SubmitConfig, type SubmitPersonRow,
} from '@/lib/submitAction';
import { uploadSubmissionFormToDrive } from '@/services/taskSubmissionService';
import { cn } from '@/lib/utils';
import { collectDueLabel } from '@/lib/collectInput';
import { useRunnerUnsaved } from '../runnerUnsaved';
import { downloadSubmittedDocument, useSubmittedDocumentValues } from '../../hooks/useSubmittedDocuments';
import type { TaskAction } from '../../types';
import {
  useAudiencePreview, useRemindCollectPending, useSaveCollectConfig, useSetCollectRequestStatus,
  useStartCollectRequest, useSyncCollectTargets,
} from '../../hooks/useCollectInput';
import { useDeleteActionSubmission, useMarkActionReceived, useSubmitBoard } from '../../hooks/useSubmitAction';
import { deleteUnusedFormFiles, formDriveId, isUnitAxis, type SubmitBoard } from '../../services/submitActionService';
import type { TaskFile } from '@/types/tasks';
import type { CollectSyncDiff } from '../../services/collectInputService';
import { Section } from '../collect/CollectConfigEditor';
import { SubmitRespondPanel } from './SubmitRespondPanel';

function when(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function SubmitActionRunner({ action }: { action: TaskAction }) {
  const { data: board, isLoading, error } = useSubmitBoard(action.id);

  if (isLoading) {
    return <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />불러오는 중</p>;
  }
  if (error || !board) {
    return <p className="py-16 text-center text-sm text-rose-600">{(error as Error | null)?.message ?? '작업을 불러오지 못했습니다.'}</p>;
  }
  if (!board.viewer.can_manage) {
    return board.viewer.is_target ? (
      <div className="mx-auto max-w-2xl space-y-4">
        <Heading board={board} />
        <SubmitRespondPanel action={action} board={board} />
      </div>
    ) : <p className="py-16 text-center text-sm text-slate-500">이 제출 요청의 대상이 아닙니다.</p>;
  }
  return <ManagerView action={action} board={board} />;
}

function Heading({ board, children }: { board: SubmitBoard; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 truncate text-lg font-semibold text-slate-800">
          <span className="truncate">{board.action.title}</span>
          <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">{SUBMIT_KIND_LABEL[board.kind]}</span>
        </h2>
        <p className="truncate text-xs text-slate-500">{[board.action.work_title, board.action.task_title].filter(Boolean).join(' › ')}</p>
      </div>
      {children}
    </div>
  );
}

function ManagerView({ action, board }: { action: TaskAction; board: SubmitBoard }) {
  const started = board.request !== null;
  const canRespond = started && board.viewer.is_target;
  const [tab, setTab] = useState<'status' | 'mine' | 'settings'>(started ? 'status' : 'settings');
  useEffect(() => { if (started) setTab('status'); }, [started]);

  return (
    <div className="space-y-4">
      <Heading board={board}>
        {started && (
          <div className="inline-flex rounded-lg border border-slate-100 bg-slate-100/50 p-1">
            <TabButton active={tab === 'status'} onClick={() => setTab('status')} icon={Table2}>현황</TabButton>
            {canRespond && <TabButton active={tab === 'mine'} onClick={() => setTab('mine')} icon={PenLine}>내 제출</TabButton>}
            <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={Settings2}>설정</TabButton>
          </div>
        )}
      </Heading>
      {tab === 'status' && started ? (
        <StatusView action={action} board={board} onRespond={canRespond ? () => setTab('mine') : undefined} />
      ) : tab === 'mine' && canRespond ? (
        <MineView action={action} board={board} />
      ) : (
        <SettingsView action={action} board={board} />
      )}
    </div>
  );
}

/** 매니저 겸 대상자 — 판에는 전원 것이 오므로 내 것만 걸러 대상자 화면에 넘긴다 */
function MineView({ action, board }: { action: TaskAction; board: SubmitBoard }) {
  const me = new Set(board.viewer.resource_ids);
  const mine = { ...board, submissions: board.submissions.filter((s) => me.has(s.resource_id)) };
  return <SubmitRespondPanel action={action} board={mine} />;
}

function TabButton({ active, onClick, icon: Icon, children }: {
  active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs transition-colors',
        active ? 'bg-white font-medium text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
    >
      <Icon className="h-3.5 w-3.5" />{children}
    </button>
  );
}

// ── 설정 ───────────────────────────────────────────────────────────────────

/** 드라이브 오류를 사람이 고칠 수 있는 말로 — 토큰 코드(GOOGLE_TOKEN_*)를 그대로 보이지 않는다 */
function driveErrorText(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason ?? '');
  if (message === 'GOOGLE_TOKEN_EXPIRED' || message === 'GOOGLE_TOKEN_MISSING' || message.includes('인증이 필요')) {
    return '구글 드라이브 연결이 끊겼습니다. [드라이브 연결]로 다시 연결한 뒤 저장해 주세요.';
  }
  return message || '알 수 없는 오류';
}

function SettingsView({ action, board }: { action: TaskAction; board: SubmitBoard }) {
  const type = action.action_type as SubmitActionType;
  const started = board.request !== null;
  const saved = useMemo(() => parseSubmitConfig(type, { submit: board.config }), [type, board.config]);
  const [draft, setDraft] = useState<SubmitConfig>(saved);
  const [dirty, setDirty] = useState(false);
  const [pendingForms, setPendingForms] = useState<File[]>([]);
  useEffect(() => { if (!dirty) setDraft(saved); }, [saved, dirty]);

  const preview = useAudiencePreview(draft.audience, 'person', !started, board.action.task_id);
  const save = useSaveCollectConfig();
  const start = useStartCollectRequest();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const configError = validateSubmitConfig(type, draft);
  const summary = preview.data ? summarizeResolution(preview.data.rows) : null;
  // «이 할 일의 담당자»가 대상에 들면 보낸 뒤에도 담당자 변경을 따라간다(서버 follow_task_assignees_in_requests)
  const followsAssignees = draft.audience.include.some((c) => c.type === 'task_assignees');
  const hasSubmissions = board.submissions.length > 0;

  const set = (patch: Partial<SubmitConfig>) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  useRunnerUnsaved(dirty || pendingForms.length > 0, '제출 받기 설정을 저장하지 않았습니다. 닫으면 바꾼 내용(고른 양식 파일 포함)이 사라집니다.');
  // [요청 보내기]가 꺼진 이유 — 종전엔 설정 오류만 말해 명단 계산 중·0명일 때 이유 없이 회색이었다(2026-10-06)
  const sendBlockedReason = configError
    ?? (preview.error && !summary ? '대상을 계산하지 못했습니다 — 잠시 뒤 다시 열거나 조건을 확인하세요.'
      : preview.isFetching && !summary ? '대상 계산 중…'
      : !summary ? '대상 조건을 정하면 보낼 수 있습니다.'
      : summary.people === 0 ? '받을 사람이 0명입니다 — 대상 조건을 확인하세요.'
      : null);

  /**
   * 실물 양식은 저장 때 드라이브에 올린다. 올라간 것은 설정에 남기고(드라이브에 이미 있다),
   * 실패한 파일은 목록에 남겨 다시 시도하게 한다. 실패 이유를 돌려준다 — 파일 이름만 말하면
   * «드라이브 연결이 끊겼다» 같은 고칠 수 있는 원인이 화면에서 사라진다.
   */
  const persist = async (): Promise<{ failure: string | null; notice: string | null }> => {
    let forms = draft.forms;
    let failure: string | null = null;
    if (type === 'submit.physical' && pendingForms.length > 0 && board.action.task_id) {
      const taskId = board.action.task_id;
      const results = await Promise.allSettled(pendingForms.map((f) => uploadSubmissionFormToDrive(taskId, f)));
      forms = [...forms, ...results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))];
      const failed = pendingForms.filter((_, i) => results[i].status === 'rejected');
      setPendingForms(failed);
      if (failed.length > 0) {
        const reason = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason;
        failure = `양식을 올리지 못했습니다(${failed.map((f) => f.name).join(', ')}) — ${driveErrorText(reason)}`;
      }
    }
    // 뺀 양식 = 저장돼 있던 것 중 이번 설정에 없는 것 — 설정 저장이 끝난 «뒤에» 드라이브에서 지운다
    const keyOf = (f: TaskFile) => formDriveId(f) ?? f.id;
    const removed = type === 'submit.physical'
      ? saved.forms.filter((old) => !forms.some((f) => keyOf(f) === keyOf(old)))
      : [];
    await save.mutateAsync({ actionId: action.id, config: serializeSubmitConfig(type, { ...draft, forms }) });
    setDraft((d) => ({ ...d, forms }));
    // 실패한 파일이 남아 있으면 «저장할 것이 남았다» 상태를 유지한다
    setDirty(failure !== null);

    let notice: string | null = null;
    if (removed.length > 0) {
      const cleanup = await deleteUnusedFormFiles(action.id, removed);
      if (cleanup.kept.length > 0) {
        notice = cleanup.kept.map((k) => `${k.name}: ${k.reason}`).join(' · ');
      }
    }
    return { failure, notice };
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const { failure, notice } = await persist();
      if (notice) toast.info(`양식을 목록에서 뺐습니다. ${notice}`);
      if (failure) {
        toast.error(failure);
        return;
      }
      // 저장만으로는 아무에게도 알림이 가지 않는다 — 보내기 전이면 그 사실을 함께 말한다
      toast.success(started ? '설정을 저장했습니다.' : '설정을 저장했습니다. [요청 보내기]를 눌러야 대상자에게 알림이 갑니다.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      const { failure, notice } = await persist();
      if (notice) toast.info(`양식을 목록에서 뺐습니다. ${notice}`);
      if (failure) {
        // 양식 없이 요청이 나가면 대상자는 무엇을 써서 내야 하는지 모른다 — 보내지 않는다
        setConfirming(false);
        toast.error(`${failure} 요청은 보내지 않았습니다.`);
        return;
      }
      const result = await start.mutateAsync(action.id);
      setConfirming(false);
      toast.success(`${result.people}명에게 제출을 요청했습니다.`
        + (result.unlinked > 0 ? ` 명단에 없는 이름 ${result.unlinked}건은 알림을 받지 못합니다.` : ''));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Section title="요청">
        <div className="grid gap-2 sm:grid-cols-[1fr_170px] sm:items-end">
          <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="요청 이름 (예: 평가계획서 제출)" aria-label="요청 이름" />
          {/* 기한의 뜻은 툴팁이 아니라 글로(2026-10-06) — 터치에서는 툴팁이 안 열린다 */}
          <label className="flex flex-col gap-1 text-[11px] text-slate-500">
            기한(선택)
            <Input type="date" value={draft.dueDate} onChange={(e) => set({ dueDate: e.target.value })} aria-label="기한" />
          </label>
        </div>
        <p className="text-[11px] text-slate-500">기한을 비우면 할 일 마감을 씁니다. 기한이 지나도 요청은 저절로 닫히지 않습니다 — 받기를 끝내려면 현황에서 [요청 닫기]를 누릅니다.</p>
        <Textarea
          value={draft.guide}
          onChange={(e) => set({ guide: e.target.value })}
          rows={2}
          placeholder={type === 'submit.physical' ? '어디에·누구에게 내는지 (예: 교무실 2층 교무부 책상, 9/30까지)' : '대상자에게 보일 안내 (선택)'}
          className="text-sm"
        />
      </Section>

      <Section title="누구에게">
        <AudienceRuleBuilder value={draft.audience} onChange={(audience) => set({ audience })} allowTaskScoped />
        {!started && (
          <div className="rounded-lg border bg-white p-3">
            <AudiencePreview resolution={preview.data} loading={preview.isFetching} error={preview.error as Error | null} empty={draft.audience.include.length === 0} />
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-slate-500">
          대상 중 이 할 일의 담당자는 내면 그 사람의 할 일이 완료되고, 내기 전에는 완료로 바꿀 수 없습니다.
          {started
            ? ' 대상을 바꾸면 [현황 → 명단 다시 계산]에서 늘고 준 사람을 확인한 뒤 반영합니다. «이 할 일의 담당자»는 담당자를 바꾸면 저절로 따라갑니다.'
            : ' [요청 보내기]를 누르기 전에는 아무에게도 알림이 가지 않고, 담당자는 내지 않고도 완료할 수 있습니다.'}
        </p>
      </Section>

      {type === 'submit.document' && (
        <Section title="양식">
          <SubmissionTemplatePicker
            value={draft.template}
            onChange={(template) => set({ template })}
            disabled={hasSubmissions}
            disabledReason="이미 제출된 문서가 있어 양식을 바꿀 수 없습니다."
          />
          <p className="text-[11px] text-slate-500">대상자는 이 양식의 빈칸을 채워 냅니다. 내는 것은 파일이 아니라 값이라 언제든 같은 문서로 다시 열 수 있습니다.</p>
        </Section>
      )}
      {type === 'submit.physical' && (
        <Section title="제출 양식">
          <PhysicalFormFilesField
            forms={draft.forms}
            pending={pendingForms}
            onRemoveForm={(id) => set({ forms: draft.forms.filter((f) => f.id !== id) })}
            onPendingChange={(files) => { setPendingForms(files); setDirty(true); }}
            unitMode={false}
            // 다시 로그인하면 이 할 일의 상세가 열린다 — 고른 파일은 페이지 이동으로 사라지므로 연결 먼저
            driveReturnPath={board.action.task_id ? `/tasks/mine?task=${board.action.task_id}` : undefined}
          />
        </Section>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t bg-white/95 py-3 backdrop-blur">
        {(started ? configError : sendBlockedReason) ? (
          <span className="mr-auto text-xs text-amber-700">{started ? configError : sendBlockedReason}</span>
        ) : dirty ? (
          <span className="mr-auto text-xs font-medium text-amber-700">저장하지 않은 변경이 있습니다</span>
        ) : null}
        <Button
          variant={started ? 'default' : 'outline'}
          size="sm"
          className={cn('h-11 text-xs sm:h-9', started && 'bg-blue-600 hover:bg-blue-700')}
          onClick={() => void handleSave()}
          disabled={!dirty || busy}
        >
          {busy && !confirming ? '저장 중…' : '저장'}
        </Button>
        {!started && (
          <Button
            size="sm"
            className="h-11 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700 sm:h-9"
            disabled={Boolean(sendBlockedReason) || busy}
            onClick={() => setConfirming(true)}
          >
            <Send className="h-3.5 w-3.5" />요청 보내기
          </Button>
        )}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{summary?.people ?? 0}명에게 제출을 요청할까요?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <span className="block">
                대상자에게 알림이 가고, 내 할 일의 「요청」에 나타납니다.
                {followsAssignees
                  ? ' «이 할 일의 담당자»는 담당자를 바꾸면 명단이 따라갑니다.'
                  : ' 명단은 지금 시점으로 고정됩니다.'}
              </span>
              <span className="block">대상 중 이 할 일의 담당자는 내야 완료할 수 있습니다.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700"
              disabled={busy}
              onClick={(e) => { e.preventDefault(); void handleStart(); }}
            >
              {busy ? '보내는 중…' : '보내기'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── 현황 ───────────────────────────────────────────────────────────────────

function StatusView({ action, board, onRespond }: { action: TaskAction; board: SubmitBoard; onRespond?: () => void }) {
  const unitAxis = isUnitAxis(board);
  const rows = useMemo(
    () => buildSubmitRows(board.targets, board.submissions, unitAxis ? { units: board.units, progress: board.unit_progress } : undefined),
    [board.targets, board.submissions, board.units, board.unit_progress, unitAxis],
  );
  const progress = submitProgress(rows);
  const remind = useRemindCollectPending();
  const setStatus = useSetCollectRequestStatus();
  const sync = useSyncCollectTargets();
  const [diff, setDiff] = useState<CollectSyncDiff | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState<'closed' | 'open' | null>(null);
  const words = SUBMIT_STATE_LABEL[board.kind];
  const due = collectDueLabel((board.config as { dueDate?: string } | null)?.dueDate ?? null);

  const open = board.request?.status === 'open';
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const shown = onlyPending ? rows.filter((r) => !r.done && !r.target.removed) : rows;
  // 양식 문서 — 낸 값을 항목별 열로(2026-10-06; 종전 엑셀은 문서 제목뿐이라 «값으로 모아 표로 본다»가 거짓이었다).
  // 한 사람이 단위마다 여러 문서를 냈으면 줄은 사람마다 하나이므로 첫 문서의 값을 싣는다(단위별은 문서를 열어 본다)
  const documentValues = useSubmittedDocumentValues(
    board.submissions.map((s) => s.document_id).filter((id): id is string => Boolean(id)),
    board.kind === 'document',
  ).data;
  const valueColumns = documentValues?.columns ?? [];
  const sheet = useMemo(() => [
    ['이름', '상태', '제출물', '시각', ...valueColumns.map((c) => c.label)],
    ...rows.filter((r) => !r.target.removed).map((r) => {
      const docId = r.submissions.find((s) => s.document_id)?.document_id ?? null;
      const values = docId ? documentValues?.byId.get(docId) : undefined;
      return [
        r.target.name,
        r.units ? `${r.units.filter((u) => u.done).length}/${r.units.length}단위` : r.done ? words.done : words.pending,
        r.submissions.map((s) => [s.unit_key ? board.units.find((u) => u.key === s.unit_key)?.label : null, s.file_name ?? s.document_title].filter(Boolean).join(': ')).filter(Boolean).join(' / '),
        when(r.lastAt),
        ...valueColumns.map((c) => values?.[c.key] ?? ''),
      ];
    }),
  ], [rows, board.units, words, valueColumns, documentValues]);

  const closedReason =
    board.request?.closed_reason === 'task_completed' ? '할 일이 완료되어 마감됐습니다.'
      : board.request?.closed_reason === 'task_cancelled' ? '할 일이 취소되어 마감됐습니다.'
      : board.request?.closed_reason === 'archived' ? '작업을 빼서 마감됐습니다.'
      : '마감했습니다.';
  const me = new Set(board.viewer.resource_ids);
  const myRow = rows.find((r) => r.target.resource_id && me.has(r.target.resource_id) && !r.target.removed);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[180px] flex-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                {words.progress} {progress.done}/{progress.total}명
                {due && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal tabular-nums text-slate-600">기한 {due}</span>}
              </span>
              <span className="tabular-nums text-slate-500">{pct}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline" size="sm" className="h-11 gap-1 text-xs sm:h-8"
              disabled={!open || progress.pending.length === 0 || remind.isPending}
              onClick={() => remind.mutate(action.id, {
                onSuccess: (n) => toast.success(`${words.pendingPeople} ${n}명에게 다시 알렸습니다.`),
                onError: (e: Error) => toast.error(e.message),
              })}
            >
              <BellRing className="h-3.5 w-3.5" />
              {progress.pending.length > 0 ? `${words.pendingPeople} ${progress.pending.length}명에게 다시 알림` : '다시 알림'}
            </Button>
            <Button
              variant="outline" size="sm" className="h-11 gap-1 text-xs sm:h-8" disabled={sync.isPending}
              onClick={() => sync.mutate({ actionId: action.id, apply: false }, { onSuccess: setDiff, onError: (e: Error) => toast.error(e.message) })}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', sync.isPending && 'animate-spin')} />명단 다시 계산
            </Button>
            <Button
              variant="outline" size="sm" className="h-11 gap-1 text-xs sm:h-8" disabled={setStatus.isPending}
              // 닫기·다시 열기 모두 담당자의 완료에 번진다 — 결과를 먼저 말한다(2026-10-06)
              onClick={() => setStatusConfirm(open ? 'closed' : 'open')}
            >
              {open ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              {open ? '요청 닫기' : '다시 열기'}
            </Button>
            <SubmissionDataActions rows={sheet} title={board.action.title} />
          </div>
        </div>
        {!open && <p className="mt-2 text-xs text-slate-500">{closedReason} 대상자는 더 내거나 고칠 수 없고, {words.pendingPeople} 담당자도 이제 할 일을 완료할 수 있습니다.</p>}
        {onRespond && open && myRow && (
          <button
            type="button"
            onClick={onRespond}
            className={cn('mt-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs',
              myRow.done ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800' : 'border-blue-200 bg-blue-50/60 text-blue-800 hover:bg-blue-50')}
          >
            <span className="flex items-center gap-1.5"><PenLine className="h-3.5 w-3.5" />나도 대상자입니다 — {myRow.done ? words.done : words.pending}</span>
            <span className="font-medium">내 제출 ›</span>
          </button>
        )}
        {progress.pending.length > 0 && (
          <p className="mt-2 text-xs text-slate-500"><Users className="mr-1 inline h-3.5 w-3.5" />{words.pendingPeople} {progress.pending.length}명: {progress.pending.join(', ')}</p>
        )}
      </div>

      <label className="flex w-fit items-center gap-1.5 text-xs text-slate-600">
        <input type="checkbox" className="h-3.5 w-3.5" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
        {words.pendingPeople} 사람만 보기
      </label>
      {/* 실물 — 서류 뭉치를 한 번에 받는다(2026-10-06; 종전엔 한 명씩 눌러야 했다) */}
      {board.kind === 'physical' && open && !unitAxis && progress.pending.length > 0 && (
        <BulkReceive action={action} rows={rows} />
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-xs text-slate-400">{onlyPending ? `${words.pendingPeople} 사람이 없습니다.` : '대상이 없습니다.'}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-white">
          {shown.map((row) => <PersonRow key={row.target.id} action={action} board={board} row={row} open={open} />)}
        </ul>
      )}

      <AlertDialog open={statusConfirm !== null} onOpenChange={(o) => !o && setStatusConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{statusConfirm === 'closed' ? '제출 요청을 닫을까요?' : '제출 요청을 다시 열까요?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {statusConfirm === 'closed'
                ? `닫으면 대상자는 더 내거나 고칠 수 없고, ${words.pendingPeople} 담당자${progress.pending.length > 0 ? `(${progress.pending.length}명)` : ''}도 이제 할 일을 완료할 수 있습니다. [다시 열기]로 되돌릴 수 있습니다.`
                : `다시 열면 대상자가 다시 내거나 고칠 수 있습니다. ${words.pendingPeople} 담당자는 완료였더라도 진행 중으로 돌아갑니다(내야 완료).`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setStatus.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700"
              disabled={setStatus.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!statusConfirm) return;
                setStatus.mutate(
                  { actionId: action.id, status: statusConfirm },
                  { onSuccess: () => setStatusConfirm(null), onError: (err: Error) => toast.error(err.message) },
                );
              }}
            >
              {statusConfirm === 'closed' ? '요청 닫기' : '다시 열기'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={diff !== null} onOpenChange={(o) => !o && setDiff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{diff && diff.added.length === 0 && diff.removed.length === 0 ? '명단이 규칙과 같습니다' : '명단을 이렇게 바꿀까요?'}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {diff && diff.added.length > 0 && (
                  <p><span className="font-medium text-emerald-700">+{diff.added.length}명</span> {diff.added.slice(0, 8).map((a) => a.name).join(', ')}{diff.added.length > 8 && ' …'}</p>
                )}
                {diff && diff.removed.length > 0 && (
                  <p>
                    <span className="font-medium text-rose-700">−{diff.removed.length}명</span> {diff.removed.slice(0, 8).map((a) => a.name).join(', ')}{diff.removed.length > 8 && ' …'}
                    <span className="block text-xs text-slate-500">빠지는 사람이 낸 것은 지우지 않습니다.</span>
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            {diff && (diff.added.length > 0 || diff.removed.length > 0) && (
              <AlertDialogAction
                className="bg-blue-600 hover:bg-blue-700"
                onClick={(e) => {
                  e.preventDefault();
                  sync.mutate({ actionId: action.id, apply: true }, { onSuccess: () => setDiff(null), onError: (err: Error) => toast.error(err.message) });
                }}
              >
                반영
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PersonRow({ action, board, row, open }: { action: TaskAction; board: SubmitBoard; row: SubmitPersonRow; open: boolean }) {
  const mark = useMarkActionReceived();
  const remove = useDeleteActionSubmission();
  const rid = row.target.resource_id;

  return (
    <li className={cn('flex min-w-0 flex-wrap items-center gap-2 px-3 py-2', row.target.removed && 'opacity-50')}>
      {row.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Clock3 className="h-4 w-4 shrink-0 text-slate-300" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800" title={row.target.name}>
          {row.target.name}
          {row.target.removed && <span className="ml-1.5 text-[11px] font-normal text-slate-400">명단에서 빠짐</span>}
          {!rid && <span className="ml-1.5 text-[11px] font-normal text-amber-600">미연결</span>}
        </p>
        <p className="truncate text-[11px] text-slate-400">
          {row.units
            ? row.units.length === 0 ? '맡은 과제 단위 없음' : `단위 ${row.units.filter((u) => u.done).length}/${row.units.length} ${board.kind === 'physical' ? '받음' : '냄'}`
            : row.done
              ? `${board.kind === 'physical' ? '받음' : '냄'} · ${when(row.lastAt)}`
              : board.kind === 'physical' ? '아직 받지 않음' : '아직 안 냄'}
          {row.target.reasons.length > 0 && ` · ${row.target.reasons.join(', ')}`}
        </p>
        {/* 단위 축 — 맡은 단위마다 낸 것 여부. 실물은 단위마다 [받음] */}
        {row.units && row.units.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {row.units.map(({ unit, done }) => (
              board.kind === 'physical' && rid && !row.target.removed ? (
                <button
                  key={unit.key}
                  type="button"
                  disabled={mark.isPending || (!done && !open)}
                  onClick={() => mark.mutate(
                    { actionId: action.id, resourceId: rid, received: !done, unitKey: unit.key },
                    { onError: (e: Error) => toast.error(e.message) },
                  )}
                  title={done ? '받음 취소' : '받음'}
                  className={cn('inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] disabled:opacity-50',
                    done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700')}
                >
                  {done ? <CheckCircle2 className="h-3 w-3" /> : <Inbox className="h-3 w-3" />}{unit.label}
                </button>
              ) : (
                <span key={unit.key} className={cn('inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px]',
                  done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                  {done ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}{unit.label}
                </span>
              )
            ))}
          </div>
        )}
      </div>

      {board.kind === 'file' && row.submissions.map((s) => (
        <span key={s.id} className="flex max-w-full items-center gap-0.5">
          {s.file_url && (
            <Button asChild variant="ghost" size="sm" className="h-8 max-w-[220px] gap-1 px-2 text-xs">
              <a href={s.file_url} target="_blank" rel="noreferrer" title={s.file_name ?? ''}>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{s.unit_key ? `${board.units.find((u) => u.key === s.unit_key)?.label ?? ''} · ` : ''}{s.file_name}</span>
              </a>
            </Button>
          )}
          <Button
            variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-rose-600"
            aria-label={`${s.file_name} 제출 취소`}
            disabled={remove.isPending}
            onClick={() => {
              if (!window.confirm(withdrawSubmissionConfirmMessage(s.file_name, row.target.name))) return;
              remove.mutate(s, { onError: (e: Error) => toast.error(e.message) });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      ))}
      {board.kind === 'document' && row.submissions.filter((s) => s.document_id).map((s) => (
        // 낸 문서를 연다 — 저장된 값으로 한글 파일을 다시 만들어 내려받는다(제출 시점 그대로, 2026-10-06)
        <Button
          key={s.id}
          variant="ghost"
          size="sm"
          className="h-11 max-w-full gap-1 px-2 text-xs text-slate-700 sm:h-8"
          title={`${s.document_title ?? '제출 문서'} — 한글 파일로 받기`}
          onClick={() => {
            const pending = toast.loading('문서를 만드는 중…');
            downloadSubmittedDocument(s.document_id!, `${row.target.name} ${s.document_title ?? '제출 문서'}`)
              .then(() => toast.success('문서를 내려받았습니다.', { id: pending }))
              .catch((e: Error) => toast.error(e.message, { id: pending }));
          }}
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="max-w-[200px] truncate">
            {s.unit_key ? `${board.units.find((u) => u.key === s.unit_key)?.label ?? ''} · ` : ''}{s.document_title ?? '제출 문서'}
          </span>
          <Download className="h-3 w-3 shrink-0 text-slate-400" />
        </Button>
      ))}
      {board.kind === 'physical' && rid && !row.target.removed && !row.units && (
        row.done ? (
          <Button
            variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            disabled={mark.isPending}
            onClick={() => mark.mutate({ actionId: action.id, resourceId: rid, received: false }, { onError: (e: Error) => toast.error(e.message) })}
          >
            <Undo2 className="h-3.5 w-3.5" />받음 취소
          </Button>
        ) : (
          <Button
            variant="outline" size="sm" className="h-11 gap-1 border-blue-200 px-3 text-xs text-blue-700 hover:bg-blue-50 sm:h-8"
            disabled={mark.isPending || !open}
            onClick={() => mark.mutate({ actionId: action.id, resourceId: rid, received: true }, { onError: (e: Error) => toast.error(e.message) })}
          >
            <Inbox className="h-3.5 w-3.5" />받음
          </Button>
        )
      )}
    </li>
  );
}

/**
 * 실물 «안 받은 사람 모두 받음» (2026-10-06) — 서류 뭉치를 한꺼번에 받은 책임자가 한 명씩 누르지 않게.
 * 받음 표시는 사람마다 따로 기록된다(누가 언제 받았는지 남는다). 되돌리기는 줄마다 [받음 취소].
 */
function BulkReceive({ action, rows }: { action: TaskAction; rows: ReturnType<typeof buildSubmitRows> }) {
  const mark = useMarkActionReceived();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const targets = rows.filter((r) => !r.done && !r.target.removed && r.target.resource_id);
  const run = async () => {
    setBusy(true);
    let failed = 0;
    for (const row of targets) {
      try {
        await mark.mutateAsync({ actionId: action.id, resourceId: row.target.resource_id!, received: true });
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    setConfirm(false);
    if (failed > 0) toast.error(`${failed}명은 받음으로 바꾸지 못했습니다. 줄에서 다시 눌러 주세요.`);
    else toast.success(`${targets.length}명을 받음으로 표시했습니다.`);
  };
  if (targets.length === 0) return null;
  return (
    <>
      <Button variant="outline" size="sm" className="h-11 gap-1 text-xs sm:h-8" onClick={() => setConfirm(true)}>
        <Inbox className="h-3.5 w-3.5" />아직 안 받은 {targets.length}명 모두 받음
      </Button>
      <AlertDialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{targets.length}명을 모두 받음으로 표시할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {targets.map((r) => r.target.name).slice(0, 12).join(', ')}{targets.length > 12 ? ` 외 ${targets.length - 12}명` : ''} — 담당자는 받음이 되면 할 일이 완료됩니다.
              잘못 받은 사람은 줄의 [받음 취소]로 되돌립니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <AlertDialogAction className="bg-blue-600 hover:bg-blue-700" disabled={busy} onClick={(e) => { e.preventDefault(); void run(); }}>
              {busy ? '표시 중…' : '모두 받음'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
