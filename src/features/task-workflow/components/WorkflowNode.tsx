import { Handle, NodeProps, NodeResizeControl, NodeToolbar, Position } from '@xyflow/react';
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Circle,
  FileQuestion,
  LayoutPanelTop,
  MoveDiagonal2,
  Plus,
  StickyNote,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ActionNodeBody } from './WorkflowActionNode';
import type { WorkflowFlowNode, WorkflowHeaderColor, WorkflowNodeKind } from '../types';
import { WORKFLOW_HANDLE_IDS, WORKFLOW_NODE_SIZE } from '../types';

const STATUS_LABELS: Record<string, string> = {
  active: '진행 중',
  pending: '진행 중',
  completed: '완료',
  cancelled: '취소',
};

const NOTE_COLORS = {
  amber: 'border-amber-200 bg-amber-50 text-amber-950',
  blue: 'border-blue-200 bg-blue-50 text-blue-950',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  violet: 'border-violet-200 bg-violet-50 text-violet-950',
} as const;

const HEADER_COLOR_STYLES: Record<
  WorkflowHeaderColor,
  { header: string; icon: string; text: string; border: string; region: string }
> = {
  slate: {
    header: 'border-slate-200 bg-slate-100',
    icon: 'bg-slate-600',
    text: 'text-slate-700',
    border: 'border-slate-300',
    region: 'border-slate-300 bg-slate-100/35',
  },
  blue: {
    header: 'border-blue-200 bg-blue-100',
    icon: 'bg-blue-600',
    text: 'text-blue-700',
    border: 'border-blue-300',
    region: 'border-blue-300 bg-blue-100/30',
  },
  indigo: {
    header: 'border-indigo-200 bg-indigo-100',
    icon: 'bg-indigo-600',
    text: 'text-indigo-700',
    border: 'border-indigo-300',
    region: 'border-indigo-300 bg-indigo-100/30',
  },
  violet: {
    header: 'border-violet-200 bg-violet-100',
    icon: 'bg-violet-600',
    text: 'text-violet-700',
    border: 'border-violet-300',
    region: 'border-violet-300 bg-violet-100/30',
  },
  emerald: {
    header: 'border-emerald-200 bg-emerald-100',
    icon: 'bg-emerald-600',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    region: 'border-emerald-300 bg-emerald-100/30',
  },
  amber: {
    header: 'border-amber-200 bg-amber-100',
    icon: 'bg-amber-600',
    text: 'text-amber-800',
    border: 'border-amber-300',
    region: 'border-amber-300 bg-amber-100/30',
  },
  rose: {
    header: 'border-rose-200 bg-rose-100',
    icon: 'bg-rose-600',
    text: 'text-rose-700',
    border: 'border-rose-300',
    region: 'border-rose-300 bg-rose-100/30',
  },
};

function ConnectionHandles({ kind }: { kind: WorkflowNodeKind }) {
  if (kind === 'region') return null;

  // 작업 노드 — 왼쪽·위로 받고 오른쪽으로 잇는다. 아래 «포함» 출구는 두지 않는다
  // (작업 안에 할 일이 든다는 뜻이 되어 버린다).
  if (kind === 'action') {
    return (
      <>
        <Handle
          id={WORKFLOW_HANDLE_IDS.targetTop}
          type="target"
          position={Position.Top}
          aria-label="위에서 연결 받기"
          className="!z-10 !h-2.5 !w-2.5 !border-2 !border-white !bg-slate-300 shadow-sm transition-colors hover:!bg-indigo-500"
        />
        <Handle
          id={WORKFLOW_HANDLE_IDS.targetLeft}
          type="target"
          position={Position.Left}
          aria-label="왼쪽에서 연결 받기"
          className="!z-10 !h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400 shadow-sm transition-colors hover:!bg-blue-500"
        />
        <Handle
          id={WORKFLOW_HANDLE_IDS.sourceRight}
          type="source"
          position={Position.Right}
          aria-label="오른쪽으로 연결하기"
          className="!z-10 !flex !h-4 !w-4 !items-center !justify-center !border-2 !border-white !bg-blue-500 !text-white shadow-md transition-colors hover:!bg-blue-600"
        >
          <Plus className="pointer-events-none h-2.5 w-2.5" />
        </Handle>
      </>
    );
  }

  return (
    <>
      <Handle
        id={WORKFLOW_HANDLE_IDS.targetLeft}
        type="target"
        position={Position.Left}
        aria-label="왼쪽에서 연결 받기"
        className="!z-10 !h-3 !w-3 !border-2 !border-white !bg-slate-400 shadow-sm transition-colors hover:!bg-blue-500"
      />
      {kind !== 'note' && (
        <Handle
          id={WORKFLOW_HANDLE_IDS.targetTop}
          type="target"
          position={Position.Top}
          aria-label="상단에서 포함 관계 연결 받기"
          className="!z-10 !h-3 !w-3 !border-2 !border-white !bg-indigo-400 shadow-sm transition-colors hover:!bg-indigo-600"
        />
      )}
      <Handle
        id={WORKFLOW_HANDLE_IDS.sourceRight}
        type="source"
        position={Position.Right}
        aria-label="오른쪽으로 연결하기"
        className="!z-10 !flex !h-5 !w-5 !items-center !justify-center !border-2 !border-white !bg-blue-500 !text-white shadow-md transition-colors hover:!bg-blue-600"
      >
        <Plus className="pointer-events-none h-3 w-3" />
      </Handle>
      {(kind === 'event' || kind === 'task') && (
        <Handle
          id={WORKFLOW_HANDLE_IDS.sourceBottom}
          type="source"
          position={Position.Bottom}
          aria-label="하단으로 포함 관계 연결하기"
          className="!z-10 !flex !h-5 !w-5 !items-center !justify-center !border-2 !border-white !bg-indigo-500 !text-white shadow-md transition-colors hover:!bg-indigo-600"
        >
          <Plus className="pointer-events-none h-3 w-3" />
        </Handle>
      )}
    </>
  );
}

function ResizeHandle({
  kind,
  selected,
}: {
  kind: WorkflowNodeKind;
  selected: boolean;
}) {
  if (!selected) return null;

  const size = WORKFLOW_NODE_SIZE[kind];

  return (
    <NodeResizeControl
      position="bottom-right"
      minWidth={size.minWidth}
      minHeight={size.minHeight}
      className="!z-20 !flex !h-6 !w-6 !items-center !justify-center !rounded-full !border-2 !border-white !bg-blue-500 !text-white shadow-md transition-colors hover:!bg-blue-600"
    >
      <span title="노드 크기 조절" className="pointer-events-none flex items-center justify-center">
        <MoveDiagonal2 className="h-3.5 w-3.5" />
      </span>
    </NodeResizeControl>
  );
}

export function WorkflowNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const { kind, label, metadata } = data;
  const customHeaderStyle = metadata.headerColor
    ? HEADER_COLOR_STYLES[metadata.headerColor]
    : null;

  if (kind === 'region') {
    const regionStyle =
      HEADER_COLOR_STYLES[metadata.headerColor ?? 'slate'] ?? HEADER_COLOR_STYLES.slate;
    return (
      <div
        className={cn(
          'h-full w-full rounded-2xl border-2 border-dashed shadow-sm backdrop-blur-[1px]',
          regionStyle.region,
          selected && 'ring-2 ring-blue-400 ring-offset-2'
        )}
      >
        <ResizeHandle kind={kind} selected={selected} />
        <div
          className={cn(
            'workflow-region-drag-handle flex cursor-move items-center gap-2 rounded-t-[14px] border-b px-3 py-2 text-xs font-bold shadow-sm',
            regionStyle.header,
            regionStyle.text
          )}
        >
          <LayoutPanelTop className="h-4 w-4" />
          <span className="truncate">{label}</span>
        </div>
      </div>
    );
  }

  if (kind === 'action') {
    return (
      <div className={cn('relative h-full w-full rounded-full', selected && 'ring-2 ring-blue-400/40')}>
        <ConnectionHandles kind={kind} />
        <NodeToolbar position={Position.Top} isVisible={selected}>
          <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
            더블클릭하여 이 작업 열기 · 끌어서 자리 옮기기
          </div>
        </NodeToolbar>
        <ActionNodeBody
          title={label}
          actionType={metadata.actionType}
          step={metadata.actionStep}
          hasRun={Boolean(metadata.actionHasRun)}
          sourceDeleted={Boolean(metadata.sourceDeleted)}
        />
      </div>
    );
  }

  if (kind === 'note') {
    const noteColor = metadata.noteColor ?? 'amber';
    return (
      <div className="relative h-full min-h-28 w-full">
        <ResizeHandle kind={kind} selected={selected} />
        <ConnectionHandles kind={kind} />
        <div
          className={cn(
            'flex h-full w-full flex-col overflow-hidden rounded-xl border p-4 shadow-sm transition-shadow',
            NOTE_COLORS[noteColor],
            selected && 'ring-2 ring-blue-400 ring-offset-2'
          )}
        >
          <div
            className={cn(
              'mb-2 flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold opacity-80',
              customHeaderStyle?.header,
              customHeaderStyle?.text
            )}
          >
            <StickyNote className="h-3.5 w-3.5 shrink-0" />
            흐름 메모
          </div>
          <p
            className="min-h-0 flex-1 overflow-hidden whitespace-pre-wrap break-words text-sm leading-5"
            title={label}
          >
            {label}
          </p>
        </div>
      </div>
    );
  }

  const isWork = kind === 'event';
  const progress = Math.min(100, Math.max(0, Number(metadata.progress ?? 0)));
  const isDeleted = Boolean(metadata.sourceDeleted);
  const status = String(metadata.status ?? (isWork ? 'active' : 'pending'));

  return (
    <>
      <NodeToolbar position={Position.Top} isVisible={selected}>
        <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
          더블클릭하여 원본 열기 · 오른쪽 +는 다음 흐름 · 아래 +는 포함 할 일 · 우하단 ↘는 크기 조절
        </div>
      </NodeToolbar>

      <div
        className={cn(
          'relative h-full w-full rounded-xl',
          selected && 'ring-2 ring-blue-400/30'
        )}
      >
        <ResizeHandle kind={kind} selected={selected} />
        <ConnectionHandles kind={kind} />

        <div
          className={cn(
            'h-full overflow-auto rounded-xl border bg-white shadow-[0_6px_20px_rgba(15,23,42,0.08)] transition-all',
            customHeaderStyle?.border ?? (isWork ? 'border-indigo-200' : 'border-sky-200'),
            selected && 'border-blue-400',
            isDeleted && 'border-dashed border-slate-300 opacity-75'
          )}
        >
          <div
            className={cn(
              'flex items-center justify-between border-b px-3 py-2',
              customHeaderStyle?.header ??
                (isWork
                  ? 'border-indigo-100 bg-gradient-to-r from-indigo-50 to-blue-50'
                  : 'border-sky-100 bg-gradient-to-r from-sky-50 to-cyan-50')
            )}
          >
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-sm',
                  customHeaderStyle?.icon ?? (isWork ? 'bg-indigo-500' : 'bg-sky-500')
                )}
              >
                {isDeleted ? (
                  <FileQuestion className="h-4 w-4" />
                ) : isWork ? (
                  <CalendarRange className="h-4 w-4" />
                ) : (
                  <CalendarDays className="h-4 w-4" />
                )}
              </span>
              <span className={customHeaderStyle?.text ?? (isWork ? 'text-indigo-700' : 'text-sky-700')}>
                {isDeleted ? '원본 삭제됨' : isWork ? '업무' : '할 일'}
              </span>
            </div>
            {!isDeleted && (
              <div className="flex items-center gap-1">
                {/* 연결된 작업은 2026-09-24부터 카드 아래 «작업 노드»로 직접 보인다 —
                    여기 있던 렌치 아이콘은 같은 사실(있다/없다)을 덜 정확하게 되풀이했다 */}
                <Badge
                  variant="outline"
                  className="h-5 border-white/80 bg-white/70 px-1.5 text-[10px] font-medium text-slate-500"
                >
                  {STATUS_LABELS[status] ?? status}
                </Badge>
              </div>
            )}
          </div>

          <div className="space-y-2.5 px-3 py-3">
            <div>
              <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-800">{label}</h3>
              {!isWork && metadata.workName && (
                <p className="mt-0.5 truncate text-[11px] text-slate-400">{metadata.workName}</p>
              )}
            </div>

            {!isWork && (
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5">
                  {metadata.taskType === 'one_time'
                    ? '일회성'
                    : typeof metadata.orderIndex === 'number'
                      ? `절차 ${metadata.orderIndex}`
                      : '절차적'}
                </span>
                {metadata.dueDate && (
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5">
                    {new Date(metadata.dueDate).toLocaleDateString('ko-KR', {
                      month: 'numeric',
                      day: 'numeric',
                    })}
                  </span>
                )}
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  {progress === 100 ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                  진행률
                </span>
                <span className="font-semibold tabular-nums text-slate-600">{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    progress === 100 ? 'bg-emerald-500' : isWork ? 'bg-indigo-500' : 'bg-sky-500'
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
