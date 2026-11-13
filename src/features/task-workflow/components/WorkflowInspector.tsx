import { useState } from 'react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
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
import { useRenameWorkflowSource } from '../hooks/useRenameWorkflowSource';
import {
  getLinkedSourceName,
  getSourceRenameProposal,
  shouldAskOnCommit,
  type SourceRenameProposal,
} from '../utils/nodeRename';
import { AlertTriangle, CalendarDays, CalendarRange, ExternalLink, LayoutPanelTop, Link2, Palette, Play, StickyNote, Trash2, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Work } from '@/types/tasks';
import type {
  WorkflowFlowEdge,
  WorkflowFlowNode,
  WorkflowHeaderColor,
  WorkflowRelationType,
} from '../types';
import { WORKFLOW_RELATION_META } from '../types';
import { TaskActionPanel } from './TaskActionPanel';
import { getTaskActionDefinition } from '../actionRegistry';

interface WorkflowInspectorProps {
  workflowId: string;
  node: WorkflowFlowNode | null;
  edge: WorkflowFlowEdge | null;
  /** 라이브 업무·할 일 데이터 — 노드 정보 표시·연결 변경의 단일 출처 */
  works: Work[];
  onClose: () => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onOpenSource: (node: WorkflowFlowNode) => void;
  onUpdateNodeLabel: (nodeId: string, label: string) => void;
  onUpdateNodeHeaderColor: (nodeId: string, color: WorkflowHeaderColor | null) => void;
  onUpdateNodeEntity: (nodeId: string, entityId: string) => void;
  onUpdateEdge: (edgeId: string, relationType: WorkflowRelationType, label: string) => void;
  /** 노드 이름을 원본에도 적용할지 물을 때 — 확인창은 캔버스가 그린다 */
  onProposeSourceRename: (proposal: SourceRenameProposal) => void;
  /** 작업 노드의 실행 화면 열기 — 러너는 캔버스가 소유한다(더블클릭과 같은 길) */
  onOpenAction: (actionId: string) => void;
  /** 읽기 전용(비소유자·비admin) — 편집 컨트롤 숨김, 실행 패널도 열람만 */
  readOnly?: boolean;
}

const NODE_STATUS_LABELS: Record<string, string> = {
  active: '진행 중', pending: '진행 중', completed: '완료', cancelled: '취소',
};

/**
 * 작업 노드의 정보창 — 무엇인지 말하고 **여기서 바로 실행**한다 (2026-09-24 사용자 요구).
 *
 * 노드를 한 번 누르면 이 창이 열리므로, 실행 진입점이 더블클릭 하나뿐이면 «눌렀는데 아무 일도
 * 없다»가 된다. 러너는 캔버스가 소유하고(더블클릭과 같은 길) 여기서는 요청만 올린다.
 */
function ActionNodeSection({
  node,
  readOnly,
  onOpenAction,
}: {
  node: WorkflowFlowNode;
  readOnly: boolean;
  onOpenAction: (actionId: string) => void;
}) {
  const definition = node.data.metadata.actionType
    ? getTaskActionDefinition(node.data.metadata.actionType)
    : undefined;
  const missing = Boolean(node.data.metadata.sourceDeleted) || !node.data.entityId;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 text-slate-400" />
          연결된 작업
        </Label>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold leading-5 text-slate-800">{node.data.label}</p>
          {definition && (
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{definition.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
            {definition && <span className="rounded-md bg-slate-100 px-1.5 py-0.5">{definition.title}</span>}
            {typeof node.data.metadata.actionStep === 'number' && (
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5">
                {node.data.metadata.actionStep}번째 작업
              </span>
            )}
            {node.data.metadata.actionHasRun && (
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-600">실행 이력 있음</span>
            )}
          </div>
        </div>
      </div>

      {missing ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] leading-4 text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          연결이 해제된 작업입니다. 이 노드는 새로고침하면 사라집니다.
        </p>
      ) : (
        <Button
          size="sm"
          className="w-full bg-blue-600 hover:bg-blue-700"
          onClick={() => onOpenAction(node.data.entityId!)}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {readOnly ? '작업 안내 보기' : '이 작업 실행'}
        </Button>
      )}
      <p className="text-[10px] leading-4 text-slate-400">
        이름은 원본 작업을 따릅니다 — 바꾸려면 할 일 편집 창의 [작업]에서 고치세요.
      </p>
    </div>
  );
}

/** 연결 대상 표시·변경: work 노드=업무 선택, task 노드=업무→할 일 2단 선택 */
function EntityLinkEditor({
  node, works, onUpdateNodeEntity,
}: {
  node: WorkflowFlowNode;
  works: Work[];
  onUpdateNodeEntity: (nodeId: string, entityId: string) => void;
}) {
  const isWork = node.data.kind === 'event';
  const linkedWork = isWork
    ? works.find((work) => work.id === node.data.entityId)
    : works.find((work) => (work.tasks ?? []).some((task) => task.id === node.data.entityId));
  const [actionId, setWorkId] = useState<string | null>(linkedWork?.id ?? null);
  const pickerWork = works.find((work) => work.id === actionId) ?? linkedWork;
  const missing = Boolean(node.data.metadata.sourceDeleted) || (!linkedWork && Boolean(node.data.entityId));

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5 text-slate-400" />
        연결된 {isWork ? '업무' : '할 일'}
      </Label>
      {missing && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] leading-4 text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          원본을 찾을 수 없습니다(삭제되었거나 접근 불가). 아래에서 다시 연결하세요.
        </p>
      )}
      <Select
        value={pickerWork?.id ?? ''}
        onValueChange={(value) => {
          setWorkId(value);
          if (isWork) onUpdateNodeEntity(node.id, value);
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="업무 선택" />
        </SelectTrigger>
        <SelectContent>
          {works.map((work) => (
            <SelectItem key={work.id} value={work.id} className="text-xs">
              {work.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!isWork && (
        <Select
          value={
            (pickerWork?.tasks ?? []).some((task) => task.id === node.data.entityId)
              ? node.data.entityId ?? ''
              : ''
          }
          onValueChange={(value) => onUpdateNodeEntity(node.id, value)}
          disabled={!pickerWork}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={pickerWork ? '할 일 선택' : '업무를 먼저 선택'} />
          </SelectTrigger>
          <SelectContent>
            {(pickerWork?.tasks ?? []).map((task) => (
              <SelectItem key={task.id} value={task.id} className="text-xs">
                {task.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <p className="text-[10px] leading-4 text-slate-400">
        연결을 바꾸면 노드 이름·정보가 새 원본 데이터로 갱신됩니다.
      </p>
    </div>
  );
}

/**
 * 업무·할 일 노드의 표시 이름 — 편집을 마치면(입력칸을 벗어남·Enter) 원본 이름도
 * 바꿀지 묻는다(2026-09-23). 판정은 utils/nodeRename.ts.
 *
 * 확인창은 여기서 그리지 않고 캔버스로 올려 보낸다 — 편집을 마치는 가장 흔한 동작이
 * **캔버스 빈 곳 클릭**인데, 그러면 blur 직후 선택이 풀려 인스펙터가 통째로 사라진다.
 * 확인창이 인스펙터 안에 있으면 뜨자마자 함께 사라진다.
 */
function SourceLinkedLabelField({
  node,
  works,
  readOnly,
  onUpdateNodeLabel,
  onProposeSourceRename,
}: {
  node: WorkflowFlowNode;
  works: Work[];
  readOnly: boolean;
  onUpdateNodeLabel: (nodeId: string, label: string) => void;
  onProposeSourceRename: (proposal: SourceRenameProposal) => void;
}) {
  const { isAdmin } = useAuth();
  const { resourceId } = useCurrentResourceId();
  const viewer = { resourceId, isAdmin };
  // 이번 편집을 시작할 때의 이름 — 이름을 실제로 바꿨을 때만 묻기 위해
  const [labelAtEditStart, setLabelAtEditStart] = useState<string | null>(null);

  const sourceName = getLinkedSourceName(node, works);
  const standing = getSourceRenameProposal(node, works, viewer);
  const differs = sourceName !== null && sourceName.trim() !== node.data.label.trim();
  const noun = node.data.kind === 'event' ? '업무' : '할 일';

  const commit = () => {
    const ask = shouldAskOnCommit(labelAtEditStart, node.data.label);
    setLabelAtEditStart(null);
    if (!ask || readOnly) return;
    const proposal = getSourceRenameProposal(node, works, viewer);
    if (proposal) onProposeSourceRename(proposal);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`workflow-node-label-${node.id}`}>표시 이름</Label>
      <Input
        id={`workflow-node-label-${node.id}`}
        value={node.data.label}
        readOnly={readOnly}
        onFocus={() => setLabelAtEditStart(node.data.label)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            // preventDefault 필수 — 이 keydown 안에서 확인창이 열리고 첫 버튼에 포커스가
            // 가면, 같은 Enter 의 후속 keypress 가 **그 버튼을 누른다**. 확인창이 뜨자마자
            // [노드 이름만 바꾸기]로 닫혀 버렸다(2026-09-23 실측 재현).
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        onChange={(event) => !readOnly && onUpdateNodeLabel(node.id, event.target.value)}
      />
      {differs && labelAtEditStart === null && (
        <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-4 text-slate-500">
          <p className="break-words">
            원본 {noun} 이름: <span className="font-medium text-slate-700">{sourceName}</span>
          </p>
          {!readOnly && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {standing && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => onProposeSourceRename(standing)}
                >
                  원본에도 적용
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-slate-500"
                onClick={() => onUpdateNodeLabel(node.id, sourceName)}
              >
                원본 이름으로 되돌리기
              </Button>
            </div>
          )}
          {!readOnly && !standing && node.data.label.trim() && (
            <p className="mt-1 text-[10px] text-slate-400">원본 {noun} 이름은 업무 책임자만 바꿀 수 있습니다.</p>
          )}
        </div>
      )}

    </div>
  );
}

/** 원본 이름도 바꿀지 묻는 확인창 — 캔버스가 소유한다(SourceLinkedLabelField 주석) */
export function SourceRenameDialog({
  proposal,
  onClose,
}: {
  proposal: SourceRenameProposal | null;
  onClose: () => void;
}) {
  const rename = useRenameWorkflowSource();
  const noun = proposal?.kind === 'work' ? '업무' : '할 일';

  const applyRename = async () => {
    if (!proposal) return;
    try {
      await rename.mutateAsync(proposal);
      // 다른 화면에 생기는 부수효과라 알린다(캔버스만 보면 달라진 것이 없다)
      toast.success(`${noun} 이름을 "${proposal.nextName}"(으)로 바꿨습니다 — 업무 관리·내 할 일에도 반영됩니다.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${noun} 이름을 바꾸지 못했습니다.`);
    }
  };

  return (
    <AlertDialog open={Boolean(proposal)} onOpenChange={(open) => { if (!open && !rename.isPending) onClose(); }}>
      <AlertDialogContent
        tabIndex={-1}
        // 열릴 때 포커스를 버튼이 아니라 확인창 자체에 둔다 — 여는 동작(Enter 등)에서 새어
        // 들어온 키가 선택지를 대신 고르지 못하게. Tab 으로 버튼에 가는 것은 그대로다.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>연결된 {proposal?.kind === 'work' ? '업무' : '할 일'} 이름도 바꿀까요?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-slate-600">
              {proposal?.workName && (
                <p className="break-words text-xs text-slate-500">"{proposal.workName}" 업무의 할 일</p>
              )}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <p className="break-words text-slate-500 line-through">{proposal?.currentName}</p>
                <p className="mt-1 break-words font-semibold text-slate-800">{proposal?.nextName}</p>
              </div>
              <p className="text-xs leading-5">
                업무 관리·내 할 일 등 이 이름이 보이는 모든 곳이 함께 바뀌고, 담당자에게도 새 이름으로 보입니다.
                노드 이름만 바꾸면 이 업무 흐름에서만 다르게 보입니다.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={rename.isPending}>노드 이름만 바꾸기</AlertDialogCancel>
          <AlertDialogAction
            className="bg-blue-600 hover:bg-blue-700"
            disabled={rename.isPending}
            onClick={(event) => {
              // 기본 즉시 닫기를 막아야 실패 시 모달이 남는다(docs/nested-modal-pitfalls.md)
              event.preventDefault();
              void applyRename();
            }}
          >
            {proposal?.kind === 'work' ? '업무' : '할 일'} 이름도 바꾸기
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const HEADER_COLORS: Array<{
  value: WorkflowHeaderColor;
  label: string;
  className: string;
}> = [
  { value: 'slate', label: '회색', className: 'bg-slate-500' },
  { value: 'blue', label: '파랑', className: 'bg-blue-500' },
  { value: 'indigo', label: '남색', className: 'bg-indigo-500' },
  { value: 'violet', label: '보라', className: 'bg-violet-500' },
  { value: 'emerald', label: '초록', className: 'bg-emerald-500' },
  { value: 'amber', label: '노랑', className: 'bg-amber-500' },
  { value: 'rose', label: '분홍', className: 'bg-rose-500' },
];

/**
 * 헤더의 색상 동그라미 — 지금 색을 보여 주고, 누르면 색 목록이 뜬다(2026-09-23).
 * 종전엔 본문에 색 8칸 격자가 늘 펼쳐져 있어 자주 쓰지 않는 설정이 본문을 차지했다.
 */
function HeaderColorButton({
  value,
  onChange,
}: {
  value: WorkflowHeaderColor | null;
  onChange: (color: WorkflowHeaderColor | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = HEADER_COLORS.find((color) => color.value === value);
  const choose = (color: WorkflowHeaderColor | null) => {
    onChange(color);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100"
          aria-label={`헤더 배경색: ${current?.label ?? '기본'}`}
          title={`헤더 배경색: ${current?.label ?? '기본'}`}
        >
          <span
            className={cn(
              'h-4 w-4 rounded-full ring-2 ring-white shadow',
              current ? current.className : 'bg-gradient-to-br from-indigo-200 to-sky-200',
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2">
        <p className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[11px] font-semibold text-slate-500">
          <Palette className="h-3.5 w-3.5" />헤더 배경색
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            aria-label="기본 헤더 색상"
            aria-pressed={!value}
            title="기본"
            className={cn(
              'h-7 w-7 rounded-full bg-gradient-to-br from-indigo-200 to-sky-200',
              !value ? 'ring-2 ring-blue-500 ring-offset-2' : 'ring-1 ring-slate-200',
            )}
            onClick={() => choose(null)}
          />
          {HEADER_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              aria-label={`${color.label} 헤더 색상`}
              aria-pressed={value === color.value}
              title={color.label}
              className={cn(
                'h-7 w-7 rounded-full shadow-sm',
                color.className,
                value === color.value && 'ring-2 ring-blue-500 ring-offset-2',
              )}
              onClick={() => choose(color.value)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function WorkflowInspector({
  workflowId,
  node,
  edge,
  works,
  onClose,
  onDeleteNode,
  onDeleteEdge,
  onOpenSource,
  onUpdateNodeLabel,
  onUpdateNodeHeaderColor,
  onUpdateNodeEntity,
  onUpdateEdge,
  onProposeSourceRename,
  onOpenAction,
  readOnly = false,
}: WorkflowInspectorProps) {
  if (!node && !edge) return null;

  return (
    <aside className="absolute inset-y-3 right-3 z-20 flex w-72 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          {edge ? (
            <Link2 className="h-4 w-4 text-blue-500" />
          ) : node?.data.kind === 'event' ? (
            <CalendarRange className="h-4 w-4 text-indigo-500" />
          ) : node?.data.kind === 'task' ? (
            <CalendarDays className="h-4 w-4 text-sky-500" />
          ) : node?.data.kind === 'region' ? (
            <LayoutPanelTop className="h-4 w-4 text-slate-500" />
          ) : node?.data.kind === 'action' ? (
            <Wrench className="h-4 w-4 text-blue-500" />
          ) : (
            <StickyNote className="h-4 w-4 text-amber-500" />
          )}
          <h2 className="text-sm font-bold text-slate-800">{edge ? '연결 설정' : '노드 정보'}</h2>
        </div>
        <div className="flex items-center gap-0.5">
          {node && !readOnly && (
            <HeaderColorButton
              value={node.data.metadata.headerColor ?? null}
              onChange={(color) => onUpdateNodeHeaderColor(node.id, color)}
            />
          )}
          {node && (node.data.kind === 'event' || node.data.kind === 'task') && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-slate-500"
              disabled={!node.data.entityId}
              aria-label={`원본 ${node.data.kind === 'event' ? '업무' : '할 일'} 열기`}
              title={`원본 ${node.data.kind === 'event' ? '업무' : '할 일'} 열기`}
              onClick={() => onOpenSource(node)}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="닫기" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {node && (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {node.data.kind === 'event' || node.data.kind === 'task' ? (
            <SourceLinkedLabelField
              key={node.id}
              node={node}
              works={works}
              readOnly={readOnly}
              onUpdateNodeLabel={onUpdateNodeLabel}
              onProposeSourceRename={onProposeSourceRename}
            />
          ) : node.data.kind === 'action' ? (
            /* 작업 노드 — 이름은 원본(`task_action.title`)에서 동기화되므로 편집 칸을 두지
               않는다(고쳐도 다음 동기화가 되돌린다). 대신 여기서 바로 실행한다. */
            <ActionNodeSection node={node} readOnly={readOnly} onOpenAction={onOpenAction} />
          ) : (
          <div className="space-y-1.5">
            <Label>
              {node.data.kind === 'note'
                ? '메모 내용'
                : node.data.kind === 'region'
                  ? '영역 이름'
                  : '표시 이름'}
            </Label>
            {node.data.kind === 'note' ? (
              <Textarea
                value={node.data.label}
                readOnly={readOnly}
                onChange={(event) => !readOnly && onUpdateNodeLabel(node.id, event.target.value)}
                rows={7}
              />
            ) : (
              <Input
                value={node.data.label}
                readOnly={readOnly}
                onChange={(event) => !readOnly && onUpdateNodeLabel(node.id, event.target.value)}
              />
            )}
          </div>
          )}

          {(node.data.kind === 'event' || node.data.kind === 'task') && (
            <>
              {!readOnly && (
                <EntityLinkEditor
                  key={`${node.id}-${node.data.entityId ?? 'none'}`}
                  node={node}
                  works={works}
                  onUpdateNodeEntity={onUpdateNodeEntity}
                />
              )}

              {node.data.kind === 'task' && node.data.entityId && (
                <TaskActionPanel
                  taskId={node.data.entityId}
                  taskTitle={node.data.label}
                  workflowId={workflowId}
                  readOnly={readOnly}
                />
              )}

              {/* 세부 정보 — 맨 아래. 겹치는 것은 뺐다: '유형'은 헤더 아이콘·'연결된 할 일' 라벨이,
                  '소속'은 연결 편집기의 업무 선택이 이미 말한다(편집기가 없는 읽기 전용에서만 보인다) */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                <p className="mb-2 text-[11px] font-semibold text-slate-500">세부 정보</p>
                <dl className="space-y-2">
                  {readOnly && node.data.metadata.workName && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-400">소속</dt>
                      <dd className="truncate font-medium text-slate-700">
                        {String(node.data.metadata.workName)}
                      </dd>
                    </div>
                  )}
                  {node.data.metadata.status != null && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-400">상태</dt>
                      <dd className="font-medium text-slate-700">
                        {NODE_STATUS_LABELS[String(node.data.metadata.status)] ?? String(node.data.metadata.status)}
                      </dd>
                    </div>
                  )}
                  {node.data.metadata.taskType && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-400">할 일 유형</dt>
                      <dd className="font-medium text-slate-700">
                        {node.data.metadata.taskType === 'one_time' ? '일회성' : '절차적'}
                      </dd>
                    </div>
                  )}
                  {typeof node.data.metadata.dueDate === 'string' && node.data.metadata.dueDate && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-400">기한</dt>
                      <dd className="font-medium text-slate-700">
                        {new Date(node.data.metadata.dueDate).toLocaleDateString('ko-KR')}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">진행률</dt>
                    <dd className="font-medium tabular-nums text-slate-700">
                      {Math.round(Number(node.data.metadata.progress ?? 0))}%
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 border-t border-slate-100 pt-1.5 text-[10px] text-slate-400">
                  실제 업무·할 일 데이터를 실시간 반영합니다.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {edge && (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>관계 유형</Label>
            <Select
              value={edge.data?.relationType ?? 'flow'}
              disabled={readOnly}
              onValueChange={(value: WorkflowRelationType) => {
                const currentType = edge.data?.relationType ?? 'flow';
                const currentLabel = typeof edge.label === 'string' ? edge.label : '';
                onUpdateEdge(
                  edge.id,
                  value,
                  currentLabel === WORKFLOW_RELATION_META[currentType].label ? '' : currentLabel
                );
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(WORKFLOW_RELATION_META) as Array<
                  [WorkflowRelationType, (typeof WORKFLOW_RELATION_META)[WorkflowRelationType]]
                >).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="workflow-edge-label">연결 설명</Label>
            <Input
              id="workflow-edge-label"
              value={typeof edge.label === 'string' ? edge.label : ''}
              placeholder={WORKFLOW_RELATION_META[edge.data?.relationType ?? 'flow'].label}
              readOnly={readOnly}
              onChange={(event) =>
                !readOnly && onUpdateEdge(edge.id, edge.data?.relationType ?? 'flow', event.target.value)
              }
            />
            <p className="text-[11px] leading-4 text-slate-400">
              화살표 방향은 앞 할 일에서 다음 할 일로 흐르는 방향입니다.
            </p>
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="border-t border-slate-100 p-3">
          <Button
            variant="ghost"
            className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => (node ? onDeleteNode(node.id) : edge && onDeleteEdge(edge.id))}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {node ? '노드 삭제' : '연결 삭제'}
          </Button>
        </div>
      )}
    </aside>
  );
}
