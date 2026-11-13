// ========================================
// 요청 응답 창 — 내 할 일 「요청」·알림·딥링크(/my-tasks?collect=<id>)에서 연다.
// 응답자는 할 일 담당자가 아닐 수 있다 — 할 일 상세가 아니라 이 창 하나로 끝낸다.
// 2026-10-01: 제출 요청(submit.*)도 같은 창이다 — 판(get_collect_board)의 kind 로 본문을 가른다.
// ========================================

import { ClipboardList, Inbox, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { RunnerUnsavedProvider, useRunnerUnsavedRegistry } from '../runnerUnsaved';
import { collectDueLabel, parseCollectConfig, REQUEST_KIND_LABEL, type RequestKind } from '@/lib/collectInput';
import { useCollectBoard } from '../../hooks/useCollectInput';
import { CollectRespondPanel } from './CollectRespondPanel';
import { SubmitRespondPanel } from '../submit/SubmitRespondPanel';
import type { SubmitBoard } from '../../services/submitActionService';
import type { TaskAction } from '../../types';

const SUBMIT_TYPE_OF: Record<Exclude<RequestKind, 'input'>, TaskAction['action_type']> = {
  file: 'submit.file',
  document: 'submit.document',
  physical: 'submit.physical',
};

interface Props {
  actionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CollectRespondDialog({ actionId, open, onOpenChange }: Props) {
  const { data: board, isLoading, error, dataUpdatedAt } = useCollectBoard(open ? actionId : null);
  const kind = ((board as { kind?: RequestKind } | undefined)?.kind ?? 'input') as RequestKind;
  const config = board && kind === 'input' ? parseCollectConfig({ collect: board.config }) : null;
  const dueDate = board ? (config?.dueDate ?? ((board.config as { dueDate?: string } | null)?.dueDate || null)) : null;
  const context = board ? [board.action.work_title, board.action.task_title].filter(Boolean).join(' › ') : '';

  // 고른 파일을 내지 않고 닫으려 하면 묻는다 — 화면(SubmitRespondPanel)이 useRunnerUnsaved 로 알린다(2026-10-06)
  const unsaved = useRunnerUnsavedRegistry();
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      const message = unsaved.unsavedMessage();
      if (message && !window.confirm(`${message}\n\n그래도 닫을까요?`)) return;
      unsaved.clear();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* 선택기가 DialogContent 안으로 포털되므로 overflow 는 안쪽 본문에만 준다(잘림 방지) */}
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-3">
            <TitleIconChip icon={kind === 'input' ? ClipboardList : Inbox} tone="indigo" />
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">{board?.action.title ?? '요청'}</DialogTitle>
              {/* 기한은 잘리는 설명 끝이 아니라 따로 — 휴대폰에서 «… · 20…»으로 잘려 안 보였다(2026-10-06) */}
              <div className="flex min-w-0 items-center gap-1.5">
                {dueDate && (
                  <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-800">
                    {collectDueLabel(dueDate) || dueDate}까지
                  </span>
                )}
                <DialogDescription className="min-w-0 truncate text-xs" title={context}>
                  {context || (kind === 'input' ? '요청받은 값을 입력합니다' : REQUEST_KIND_LABEL[kind])}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <RunnerUnsavedProvider registry={unsaved.registry}>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {isLoading && (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />불러오는 중
            </p>
          )}
          {error && <p className="py-10 text-center text-sm text-rose-600">{(error as Error).message}</p>}
          {board && kind === 'input' && <CollectRespondPanel board={board} updatedAt={dataUpdatedAt} />}
          {board && kind !== 'input' && (
            <SubmitRespondPanel
              action={{
                id: board.action.id,
                task_id: board.action.task_id,
                action_type: SUBMIT_TYPE_OF[kind],
                title: board.action.title,
                created_by: board.action.created_by,
                config: { submit: board.config },
              } as unknown as TaskAction}
              board={board as unknown as SubmitBoard}
            />
          )}
        </div>

        </RunnerUnsavedProvider>

        <div className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`} onClick={() => handleOpenChange(false)}>
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
