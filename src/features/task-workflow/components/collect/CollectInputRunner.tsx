// ========================================
// 입력 받기 러너 (할 일 작업 창 [열기])
//   매니저(작업을 만든 사람·업무 매니저·admin)
//     보내기 전 = 설정 + 대상 미리보기 → [요청 보내기]
//     보낸 뒤   = 현황 표(행=단위, 열=구분×항목) · 다시 알림 · 명단 다시 계산 · 마감 · 엑셀
//   대상자 = 응답 화면(CollectRespondPanel)
// ========================================

import { useEffect, useMemo, useState } from 'react';
import { BellRing, Loader2, Lock, PenLine, RefreshCw, Send, Settings2, Table2, Unlock, Users } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AudiencePreview } from '@/components/audience/AudiencePreview';
import { SubmissionDataActions } from '@/components/tasks/SubmissionDataActions';
import { summarizeResolution, validateAudienceRule } from '@/lib/audienceRule';
import {
  buildCollectTable,
  collectDueLabel,
  collectTableToSheet,
  parseCollectConfig,
  pendingBreakdown,
  pendingPeople,
  serializeCollectConfig,
  validateCollectConfig,
  type CollectConfig,
} from '@/lib/collectInput';
import { cn } from '@/lib/utils';
import type { TaskAction } from '../../types';
import {
  useAudiencePreview,
  useCollectBoard,
  useRemindCollectPending,
  useSaveCollectConfig,
  useSetCollectRequestStatus,
  useStartCollectRequest,
  useSyncCollectTargets,
} from '../../hooks/useCollectInput';
import type { CollectSyncDiff } from '../../services/collectInputService';
import { CollectBoardTable } from './CollectBoardTable';
import { CollectConfigEditor } from './CollectConfigEditor';
import { CollectRespondPanel } from './CollectRespondPanel';
import { useRunnerUnsaved } from '../runnerUnsaved';

export function CollectInputRunner({ action }: { action: TaskAction }) {
  const { data: board, isLoading, error, dataUpdatedAt } = useCollectBoard(action.id);

  if (isLoading) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />불러오는 중
      </p>
    );
  }
  if (error || !board) {
    return <p className="py-16 text-center text-sm text-rose-600">{(error as Error | null)?.message ?? '작업을 불러오지 못했습니다.'}</p>;
  }
  if (!board.viewer.can_manage) {
    return board.viewer.is_target
      ? <CollectRespondPanel board={board} updatedAt={dataUpdatedAt} />
      : <p className="py-16 text-center text-sm text-slate-500">이 입력 요청을 관리할 권한이 없습니다.</p>;
  }
  return <ManagerView actionId={action.id} board={board} updatedAt={dataUpdatedAt} />;
}

type Board = NonNullable<ReturnType<typeof useCollectBoard>['data']>;

function ManagerView({ actionId, board, updatedAt }: { actionId: string; board: Board; updatedAt: number }) {
  const started = board.request !== null;
  // 매니저이면서 대상자 — 관리만이 아니라 자기 줄도 입력한다(2026-09-24)
  const canRespond = started && board.viewer.is_target;
  const [tab, setTab] = useState<'status' | 'mine' | 'settings'>(started ? 'status' : 'settings');
  useEffect(() => {
    if (started) setTab('status');
  }, [started]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-slate-800">{board.action.title}</h2>
          <p className="truncate text-xs text-slate-500">
            {[board.action.work_title, board.action.task_title].filter(Boolean).join(' › ')}
            {board.request && ` · ${board.request.academic_year}학년도 ${board.request.semester}학기 기준`}
          </p>
        </div>
        {started && (
          <div className="inline-flex rounded-lg border border-slate-100 bg-slate-100/50 p-1">
            <TabButton active={tab === 'status'} onClick={() => setTab('status')} icon={Table2}>현황</TabButton>
            {canRespond && (
              <TabButton active={tab === 'mine'} onClick={() => setTab('mine')} icon={PenLine}>내 입력</TabButton>
            )}
            <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={Settings2}>설정</TabButton>
          </div>
        )}
      </div>
      {tab === 'status' && started && (
        <StatusView actionId={actionId} board={board} onRespond={canRespond ? () => setTab('mine') : undefined} />
      )}
      {tab === 'mine' && canRespond && <CollectRespondPanel board={board} updatedAt={updatedAt} />}
      {/* 설정은 탭을 옮겨도 **내리지 않고 숨긴다**(2026-10-06) — 종전엔 [현황]으로 가는 순간 저장 안 한 초안이 사라졌다 */}
      <div className={tab === 'settings' || !started ? undefined : 'hidden'}>
        <SettingsView actionId={actionId} board={board} />
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, children }: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs transition-colors',
        active ? 'bg-white font-medium text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

// ── 설정 ───────────────────────────────────────────────────────────────────

function SettingsView({ actionId, board }: { actionId: string; board: Board }) {
  const started = board.request !== null;
  const saved = useMemo(() => parseCollectConfig({ collect: board.config }), [board.config]);
  const [draft, setDraft] = useState<CollectConfig>(saved);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(saved);
  }, [saved, dirty]);

  const preview = useAudiencePreview(draft.audience, draft.axis, !started, board.action.task_id);
  const save = useSaveCollectConfig();
  const start = useStartCollectRequest();
  const [confirming, setConfirming] = useState(false);

  const configError = validateCollectConfig(draft);
  const ruleError = validateAudienceRule(draft.audience);
  const summary = preview.data ? summarizeResolution(preview.data.rows) : null;
  useRunnerUnsaved(dirty, '입력 받기 설정을 저장하지 않았습니다. 닫으면 바꾼 내용이 사라집니다.');
  // [요청 보내기]가 꺼진 이유를 말한다(2026-10-06) — 종전엔 설정 오류만 말해, 명단 계산 중·0줄일 때 이유 없이 회색이었다
  const sendBlockedReason = configError ?? ruleError
    ?? (preview.error && !summary ? '대상을 계산하지 못했습니다 — 잠시 뒤 다시 열거나 조건을 확인하세요.'
      : preview.isFetching && !summary ? '대상 계산 중…'
      : !summary ? '대상 조건을 정하면 보낼 수 있습니다.'
      : summary.lines === 0 ? '받을 줄이 0개입니다 — 조건을 넓히거나 줄 단위를 「사람마다」로 바꾸세요.'
      : null);

  const persist = async () => {
    await save.mutateAsync({ actionId, config: serializeCollectConfig(draft) });
    setDirty(false);
  };

  const handleSave = () =>
    persist().then(
      () => toast.success('설정을 저장했습니다.'),
      (e: Error) => toast.error(e.message),
    );

  const handleStart = async () => {
    try {
      await persist();
      const result = await start.mutateAsync(actionId);
      setConfirming(false);
      toast.success(
        `${result.people}명에게 입력을 요청했습니다(${result.targets}줄).` +
          (result.unlinked > 0 ? ` 명단에 없는 이름 ${result.unlinked}건은 알림을 받지 못합니다.` : ''),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <CollectConfigEditor
        value={draft}
        onChange={(next) => {
          setDraft(next);
          setDirty(true);
        }}
        locked={started}
        lockedFieldKeys={started ? saved.fields.map((f) => f.key) : []}
      >
        {!started && (
          <div className="rounded-lg border bg-white p-3">
            <AudiencePreview
              resolution={preview.data}
              loading={preview.isFetching}
              error={preview.error as Error | null}
              empty={draft.audience.include.length === 0}
            />
          </div>
        )}
        {started && (
          <p className="text-[11px] text-slate-500">
            대상 조건을 바꾸면 [현황 → 명단 다시 계산]에서 늘고 준 사람을 확인한 뒤 반영합니다. 보낸 명단은 저절로 바뀌지 않습니다.
          </p>
        )}
      </CollectConfigEditor>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t bg-white/95 py-3 backdrop-blur">
        {(started ? configError ?? ruleError : sendBlockedReason) ? (
          <span className="mr-auto text-xs text-amber-700">{started ? configError ?? ruleError : sendBlockedReason}</span>
        ) : dirty ? (
          <span className="mr-auto text-xs font-medium text-amber-700">저장하지 않은 변경이 있습니다</span>
        ) : null}
        <Button
          variant={started ? 'default' : 'outline'}
          size="sm"
          className={cn('h-11 text-xs sm:h-9', started && 'bg-blue-600 hover:bg-blue-700')}
          onClick={handleSave}
          disabled={!dirty || save.isPending}
        >
          {save.isPending ? '저장 중…' : '저장'}
        </Button>
        {!started && (
          <Button
            size="sm"
            className="h-11 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700 sm:h-9"
            disabled={Boolean(sendBlockedReason)}
            onClick={() => setConfirming(true)}
          >
            <Send className="h-3.5 w-3.5" />
            요청 보내기
          </Button>
        )}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{summary?.people ?? 0}명에게 입력을 요청할까요?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <span className="block">
                {summary?.lines ?? 0}줄 × {Math.max(draft.dimensions.length, 1)}칸을 받습니다. 대상자에게 알림이 가고, 내 할 일의 「입력 요청」에 나타납니다.
              </span>
              <span className="block">
                보낸 뒤에는 줄 단위·구분·입력 방식을 바꿀 수 없습니다. 명단은 지금 시점으로 고정됩니다.
              </span>
              {summary && summary.noUnit.length > 0 && (
                <span className="block text-amber-700">수업이 없는 {summary.noUnit.length}명은 줄이 생기지 않습니다.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={start.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700"
              disabled={start.isPending}
              onClick={(e) => {
                e.preventDefault(); // 실패하면 창이 남아 있어야 한다
                void handleStart();
              }}
            >
              {start.isPending ? '보내는 중…' : '보내기'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── 현황 ───────────────────────────────────────────────────────────────────

function StatusView({ actionId, board, onRespond }: { actionId: string; board: Board; onRespond?: () => void }) {
  const table = useMemo(() => buildCollectTable(board), [board]);
  const sheet = useMemo(() => collectTableToSheet(table), [table]);
  const pending = useMemo(() => pendingPeople(table), [table]);
  const breakdown = useMemo(() => pendingBreakdown(table), [table]);
  const remind = useRemindCollectPending();
  const setStatus = useSetCollectRequestStatus();
  const sync = useSyncCollectTargets();
  const [diff, setDiff] = useState<CollectSyncDiff | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const due = collectDueLabel(table.config.dueDate);

  const open = board.request?.status === 'open';
  const { rows, completeRows } = table.progress;
  const pct = rows > 0 ? Math.round((completeRows / rows) * 100) : 0;
  const shown = onlyPending ? { ...table, rows: table.rows.filter((r) => !r.complete && !r.removed) } : table;

  const closedReason =
    board.request?.closed_reason === 'task_completed' ? '할 일이 완료되어 마감됐습니다.'
      : board.request?.closed_reason === 'task_cancelled' ? '할 일이 취소되어 마감됐습니다.'
      : board.request?.closed_reason === 'archived' ? '작업을 빼서 마감됐습니다.'
      : '마감했습니다.';

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[180px] flex-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                완료 {completeRows}/{rows}줄
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
              variant="outline"
              size="sm"
              className="h-11 gap-1 text-xs sm:h-8"
              disabled={!open || pending.length === 0 || remind.isPending}
              onClick={() =>
                remind.mutate(actionId, {
                  onSuccess: (n) => toast.success(`미완료 ${n}명에게 다시 알렸습니다.`),
                  onError: (e: Error) => toast.error(e.message),
                })
              }
            >
              <BellRing className="h-3.5 w-3.5" />
              {pending.length > 0 ? `미완료 ${pending.length}명에게 다시 알림` : '다시 알림'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1 text-xs sm:h-8"
              disabled={sync.isPending}
              onClick={() =>
                sync.mutate({ actionId, apply: false }, { onSuccess: setDiff, onError: (e: Error) => toast.error(e.message) })
              }
            >
              <RefreshCw className={cn('h-3.5 w-3.5', sync.isPending && 'animate-spin')} />
              명단 다시 계산
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1 text-xs sm:h-8"
              disabled={setStatus.isPending}
              onClick={() => {
                // 닫기는 응답자 전원을 막는다 — 묻는다. 다시 열기는 막을 것이 없어 바로(2026-10-06)
                if (open) setConfirmClose(true);
                else setStatus.mutate({ actionId, status: 'open' }, { onError: (e: Error) => toast.error(e.message) });
              }}
            >
              {open ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              {open ? '입력 닫기' : '다시 열기'}
            </Button>
            <SubmissionDataActions rows={sheet} title={board.action.title} />
          </div>
        </div>
        {!open && <p className="mt-2 text-xs text-slate-500">{closedReason} 응답자는 더 고칠 수 없습니다.</p>}
        {onRespond && open && (() => {
          const mine = table.rows.filter((r) => r.mine);
          const done = mine.filter((r) => r.complete).length;
          return (
            <button
              type="button"
              onClick={onRespond}
              className={cn(
                'mt-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs',
                done === mine.length ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800' : 'border-blue-200 bg-blue-50/60 text-blue-800 hover:bg-blue-50',
              )}
            >
              <span className="flex items-center gap-1.5"><PenLine className="h-3.5 w-3.5" />나도 대상자입니다 — 내 줄 {done}/{mine.length} 입력</span>
              <span className="font-medium">내 입력 ›</span>
            </button>
          );
        })()}
        {pending.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            <Users className="mr-1 inline h-3.5 w-3.5" />
            {breakdown.partial.length > 0 && <>일부 입력 {breakdown.partial.length}명: {breakdown.partial.join(', ')}{breakdown.untouched.length > 0 && ' · '}</>}
            {breakdown.untouched.length > 0 && <>미입력 {breakdown.untouched.length}명: {breakdown.untouched.join(', ')}</>}
          </p>
        )}
      </div>

      <label className="flex w-fit items-center gap-1.5 text-xs text-slate-600">
        <input type="checkbox" className="h-3.5 w-3.5" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
        미완료 줄만 보기
      </label>

      {/* 휴대폰은 카드로 — 표는 열이 넘쳐 데이터가 화면 밖으로 나갔다(2026-10-06) */}
      <CollectBoardTable table={shown} showReasons mobileCards emptyText={onlyPending ? '미완료 줄이 없습니다.' : undefined} />

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>입력을 닫을까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending.length > 0
                ? `아직 ${pending.length}명이 다 채우지 않았습니다. 닫으면 응답자는 더 입력하거나 고칠 수 없습니다. `
                : '닫으면 응답자는 더 고칠 수 없습니다. '}
              필요하면 [다시 열기]로 되돌릴 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setStatus.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700"
              disabled={setStatus.isPending}
              onClick={(e) => {
                e.preventDefault(); // 실패하면 창이 남아 있어야 한다
                setStatus.mutate(
                  { actionId, status: 'closed' },
                  { onSuccess: () => setConfirmClose(false), onError: (err: Error) => toast.error(err.message) },
                );
              }}
            >
              입력 닫기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {table.orphanResponses.length > 0 && (
        <p className="text-[11px] text-slate-400">
          명단 밖 응답 {table.orphanResponses.length}건 — 다시 계산으로 대상에서 빠진 줄의 이전 응답입니다(지우지 않았습니다).
        </p>
      )}

      <AlertDialog open={diff !== null} onOpenChange={(o) => !o && setDiff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {diff && diff.added.length === 0 && diff.removed.length === 0 ? '명단이 규칙과 같습니다' : '명단을 이렇게 바꿀까요?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {diff && diff.added.length > 0 && (
                  <p>
                    <span className="font-medium text-emerald-700">+{diff.added.length}줄</span>{' '}
                    {diff.added.slice(0, 8).map((a) => `${a.name}${a.unit_label ? `(${a.unit_label})` : ''}`).join(', ')}
                    {diff.added.length > 8 && ' …'}
                  </p>
                )}
                {diff && diff.removed.length > 0 && (
                  <p>
                    <span className="font-medium text-rose-700">−{diff.removed.length}줄</span>{' '}
                    {diff.removed.slice(0, 8).map((a) => `${a.name}${a.unit_label ? `(${a.unit_label})` : ''}`).join(', ')}
                    {diff.removed.length > 8 && ' …'}
                    <span className="block text-xs text-slate-500">빠지는 줄의 응답은 지우지 않고 "명단 밖"으로 남깁니다.</span>
                  </p>
                )}
                {diff && (diff.added.length > 0 || diff.removed.length > 0) && (
                  <p className="text-xs text-slate-500">새로 들어오는 사람에게 알림이 갑니다. 기준 학기는 보낼 때와 같습니다.</p>
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
                  sync.mutate(
                    { actionId, apply: true },
                    {
                      onSuccess: () => setDiff(null),
                      onError: (err: Error) => toast.error(err.message),
                    },
                  );
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
