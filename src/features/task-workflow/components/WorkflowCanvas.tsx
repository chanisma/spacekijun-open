import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  EdgeChange,
  MarkerType,
  MiniMap,
  NodeChange,
  OnConnectEnd,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  BoxSelect,
  Check,
  Copy as CopyIcon,
  Eye,
  LayoutPanelTop,
  Loader2,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Work, Task } from '@/types/tasks';
import type { Department } from '@/hooks/useDepartments';
import { useCopyTaskWorkflow, useSaveTaskWorkflowGraph } from '../hooks/useTaskWorkflows';
import { useTaskActionRunPresence, useTaskActionsForTasks } from '../hooks/useTaskActions';
import { getTaskDeadlineInfo } from '@/lib/taskDeadlines';

// 다중 마감(meta.deadlines)이면 "다음 마감"을 노드에 표시 — 라이브 동기화 effect가 회차 경과를 자동 반영
const taskEffectiveDueDate = (task: { due_date?: string | null; meta?: Record<string, unknown> | null }) =>
  getTaskDeadlineInfo(task).effective ?? task.due_date ?? null;
import type {
  TaskAction,
  TaskWorkflow,
  TaskWorkflowGraph,
  WorkflowEdgeData,
  WorkflowFlowEdge,
  WorkflowFlowNode,
  WorkflowHeaderColor,
  WorkflowNodeData,
  WorkflowRelationType,
} from '../types';
import {
  ACTION_NODE_FLOW_PROPS,
  WORKFLOW_HANDLE_IDS,
  WORKFLOW_NODE_SIZE,
  WORKFLOW_RELATION_META,
} from '../types';
import { buildWorkTaskPlacements } from '../utils/workflowLayout';
import { toggleCopyExcluded } from '../utils/workflowCopy';
import { SourceRenameDialog, WorkflowInspector } from './WorkflowInspector';
import type { SourceRenameProposal } from '../utils/nodeRename';
import { WorkflowDeleteDialog } from './WorkflowDeleteDialog';
import { WorkflowNode } from './WorkflowNode';
import { WorkflowNodePicker } from './WorkflowNodePicker';
import { TaskActionRunnerDialog } from './TaskActionPanel';
import { listableActions } from '../utils/taskActionDraft';
import { orderByFlow, readActionFlow } from '../utils/actionFlow';
import './task-workflow.css';

interface Manager {
  id: string;
  name: string;
}

interface WorkflowCanvasProps {
  workflow: TaskWorkflow;
  graph: TaskWorkflowGraph;
  works: Work[];
  managers: Manager[];
  departments: Department[];
  /** 읽기 전용(2026-07-26 전체 교사 공유) — 비소유자·비admin은 열람만 */
  readOnly?: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onOpenWork: (actionId: string) => void;
  onOpenTask: (taskId: string) => void;
  /** 워크플로 복사 완료 — 새 워크플로 id (호스트가 목록 갱신·선택) */
  onCopied?: (workflowId: string) => void;
}

const nodeTypes = { workflowNode: WorkflowNode };
const HISTORY_COMMIT_DELAY_MS = 300;
const MAX_HISTORY_ENTRIES = 100;

interface WorkflowEditorSnapshot {
  name: string;
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
}

function createWorkflowEditorSnapshot(
  name: string,
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[]
): WorkflowEditorSnapshot {
  const clonedNodes = structuredClone(nodes).map((node) => {
    const size = WORKFLOW_NODE_SIZE[node.data.kind];
    const measuredWidth = Number(
      node.width ??
        node.measured?.width ??
        node.style?.width ??
        node.data.metadata.width ??
        size.width
    );
    const measuredHeight = Number(
      node.height ??
        node.measured?.height ??
        node.style?.height ??
        node.data.metadata.height ??
        size.height
    );
    const width = Number.isFinite(measuredWidth)
      ? Math.max(size.minWidth, measuredWidth)
      : size.width;
    const height = Number.isFinite(measuredHeight)
      ? Math.max(size.minHeight, measuredHeight)
      : size.height;
    node.style = { ...node.style, width, height };
    node.data.metadata = { ...node.data.metadata, width, height };

    delete node.selected;
    delete node.dragging;
    delete node.measured;
    delete node.resizing;
    delete node.width;
    delete node.height;
    delete node.initialWidth;
    delete node.initialHeight;
    return node;
  });
  const clonedEdges = structuredClone(edges).map((edge) => {
    delete edge.selected;
    return edge;
  });

  return { name, nodes: clonedNodes, edges: clonedEdges };
}

function cloneWorkflowEditorSnapshot(
  snapshot: WorkflowEditorSnapshot
): WorkflowEditorSnapshot {
  return createWorkflowEditorSnapshot(snapshot.name, snapshot.nodes, snapshot.edges);
}

function areWorkflowEditorSnapshotsEqual(
  left: WorkflowEditorSnapshot,
  right: WorkflowEditorSnapshot
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getTaskProgress(task: Task): number {
  const assignees = Array.isArray(task.meta?.assignees) ? task.meta.assignees : [];
  if (assignees.length > 0) {
    return Math.round(
      (assignees.filter((assignee) => assignee.status === 'completed').length / assignees.length) * 100
    );
  }
  return task.status === 'completed' ? 100 : 0;
}

function createStyledEdge(
  edge: Pick<WorkflowFlowEdge, 'id' | 'source' | 'target'> & {
    relationType?: WorkflowRelationType;
    label?: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    metadata?: Record<string, unknown>;
  }
): WorkflowFlowEdge {
  const relationType = edge.relationType ?? 'flow';
  const meta = WORKFLOW_RELATION_META[relationType];
  // 작업 선은 라벨을 그리지 않는다 — 닿는 노드가 이미 «작업»이라고 말한다
  const label =
    edge.label || (relationType === 'flow' || relationType === 'action' ? undefined : meta.label);
  const isContainment = relationType === 'contains' || relationType === 'action';

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle:
      edge.sourceHandle ??
      (isContainment ? WORKFLOW_HANDLE_IDS.sourceBottom : WORKFLOW_HANDLE_IDS.sourceRight),
    targetHandle:
      edge.targetHandle ??
      (isContainment ? WORKFLOW_HANDLE_IDS.targetTop : WORKFLOW_HANDLE_IDS.targetLeft),
    type: 'smoothstep',
    data: { ...edge.metadata, relationType },
    label,
    // 작업 선에는 화살촉을 달지 않는다(흐름의 다음 단계가 아니라 «딸린 것»이다)
    markerEnd:
      relationType === 'action'
        ? undefined
        : { type: MarkerType.ArrowClosed, color: meta.color, width: 18, height: 18 },
    style: {
      stroke: meta.color,
      strokeWidth: relationType === 'contains' || relationType === 'action' ? 1.5 : 2,
      strokeDasharray: meta.dash,
    },
    labelStyle: { fill: '#475569', fontSize: 10, fontWeight: 600 },
    labelBgStyle: { fill: 'rgba(255,255,255,0.92)', fillOpacity: 1 },
    labelBgPadding: [5, 3],
    labelBgBorderRadius: 6,
  };
}

function graphNodeToFlowNode(node: TaskWorkflowGraph['nodes'][number]): WorkflowFlowNode {
  const entityId =
    node.node_kind === 'event'
      ? node.event_id
      : node.node_kind === 'task'
        ? node.task_id
        : node.node_kind === 'action'
          ? node.action_id
          : null;
  const isRegion = node.node_kind === 'region';
  const size = WORKFLOW_NODE_SIZE[node.node_kind];
  // 작업 노드는 크기를 바꿀 수 없다 — 저장된 값(옛 배치의 88×86 등)을 무시하고 늘 정사각이다.
  // `Math.max(min, stored)` 를 그대로 태우면 옛 값이 영원히 이긴다.
  const isFixedSize = node.node_kind === 'action';
  const storedWidth = Number(node.metadata.width ?? size.width);
  const storedHeight = Number(node.metadata.height ?? size.height);
  const width = isFixedSize
    ? size.width
    : Number.isFinite(storedWidth)
      ? Math.max(size.minWidth, storedWidth)
      : size.width;
  const height = isFixedSize
    ? size.height
    : Number.isFinite(storedHeight)
      ? Math.max(size.minHeight, storedHeight)
      : size.height;
  return {
    id: node.id,
    type: 'workflowNode',
    position: { x: node.position_x, y: node.position_y },
    style: { width, height },
    // 작업 노드는 크기·핸들을 선언해 측정에 기대지 않는다(types.ts 의 주석 참고)
    ...(isFixedSize ? ACTION_NODE_FLOW_PROPS : {}),
    ...(isRegion
      ? {
          dragHandle: '.workflow-region-drag-handle',
          zIndex: -1,
        }
      : {}),
    data: {
      kind: node.node_kind,
      entityId,
      label: node.label,
      metadata: {
        ...node.metadata,
        sourceDeleted:
          (node.node_kind === 'event' || node.node_kind === 'task' || node.node_kind === 'action') &&
          !entityId,
      },
    },
  };
}

function graphEdgeToFlowEdge(edge: TaskWorkflowGraph['edges'][number]): WorkflowFlowEdge {
  return createStyledEdge({
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    relationType: edge.relation_type,
    label: edge.label,
    metadata: edge.metadata,
  });
}

function getIncludedDescendantNodes(
  rootWorkNodeId: string,
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[]
): WorkflowFlowNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childIdsByParent = new Map<string, Set<string>>();

  const addChild = (parentId: string, childId: string) => {
    const children = childIdsByParent.get(parentId) ?? new Set<string>();
    children.add(childId);
    childIdsByParent.set(parentId, children);
  };

  nodes.forEach((node) => {
    const containerNodeId = node.data.metadata.containerNodeId;
    if (typeof containerNodeId === 'string') addChild(containerNodeId, node.id);
  });
  edges.forEach((edge) => {
    if (edge.data?.relationType === 'contains') addChild(edge.source, edge.target);
  });

  const descendants: WorkflowFlowNode[] = [];
  const visited = new Set<string>([rootWorkNodeId]);
  const queue = [rootWorkNodeId];

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const childId of childIdsByParent.get(parentId) ?? []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      const child = nodeById.get(childId);
      if (!child) continue;
      descendants.push(child);
      if (child.data.kind === 'event' || child.data.kind === 'task') queue.push(child.id);
    }
  }

  return descendants.sort(
    (a, b) => a.position.y - b.position.y || a.position.x - b.position.x
  );
}

function WorkflowCanvasInner({
  workflow,
  graph,
  works,
  managers,
  departments,
  readOnly = false,
  onDirtyChange,
  onOpenWork,
  onOpenTask,
  onCopied,
}: WorkflowCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hasHydratedRef = useRef(false);
  const [nodes, setNodes] = useNodesState<WorkflowFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowFlowEdge>([]);
  const [name, setName] = useState(workflow.name);
  const [description] = useState(workflow.description);
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingPosition, setPendingPosition] = useState({ x: 80, y: 100 });
  const [pendingSourceNodeId, setPendingSourceNodeId] = useState<string | null>(null);
  const [pendingSourceHandleId, setPendingSourceHandleId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [deleteWorkNodeId, setDeleteWorkNodeId] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [historyStatus, setHistoryStatus] = useState({ canUndo: false, canRedo: false });
  const editorStateRef = useRef<WorkflowEditorSnapshot>({ name, nodes, edges });
  const historyRef = useRef<WorkflowEditorSnapshot[]>([]);
  const historyIndexRef = useRef(0);
  const savedSnapshotRef = useRef<WorkflowEditorSnapshot | null>(null);
  const historyTimerRef = useRef<number | null>(null);
  const hasPendingHistoryRef = useRef(false);
  const dirtyRef = useRef(dirty);
  const { screenToFlowPosition, getViewport, setViewport } = useReactFlow<WorkflowFlowNode, WorkflowFlowEdge>();
  const saveGraph = useSaveTaskWorkflowGraph();
  // 워크플로 복사 모드: 캔버스에서 제외 노드를 클릭으로 지정(기본 전체 포함)
  const copyWorkflowMutation = useCopyTaskWorkflow();
  const [copyMode, setCopyMode] = useState(false);
  const [copyExcluded, setCopyExcluded] = useState<Set<string>>(() => new Set());
  const [copyName, setCopyName] = useState('');

  editorStateRef.current = { name, nodes, edges };
  dirtyRef.current = dirty;

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const deleteWorkNode = nodes.find((node) => node.id === deleteWorkNodeId) ?? null;
  const deleteIncludedNodes = useMemo(
    () =>
      deleteWorkNodeId
        ? getIncludedDescendantNodes(deleteWorkNodeId, nodes, edges)
        : [],
    [deleteWorkNodeId, edges, nodes]
  );

  const syncHistoryStatus = useCallback((index = historyIndexRef.current) => {
    setHistoryStatus({
      canUndo: index > 0,
      canRedo: index < historyRef.current.length - 1,
    });
  }, []);

  const syncDirtyState = useCallback(
    (snapshot: WorkflowEditorSnapshot) => {
      const savedSnapshot = savedSnapshotRef.current;
      const nextDirty = savedSnapshot
        ? !areWorkflowEditorSnapshotsEqual(snapshot, savedSnapshot)
        : true;
      setDirty(nextDirty);
      onDirtyChange(nextDirty);
    },
    [onDirtyChange]
  );

  const commitPendingHistory = useCallback(() => {
    if (historyTimerRef.current !== null) {
      window.clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
    if (!hasPendingHistoryRef.current) return;

    hasPendingHistoryRef.current = false;
    const snapshot = createWorkflowEditorSnapshot(
      editorStateRef.current.name,
      editorStateRef.current.nodes,
      editorStateRef.current.edges
    );
    const currentSnapshot = historyRef.current[historyIndexRef.current];

    if (!currentSnapshot || !areWorkflowEditorSnapshotsEqual(snapshot, currentSnapshot)) {
      const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
      nextHistory.push(snapshot);
      if (nextHistory.length > MAX_HISTORY_ENTRIES) nextHistory.shift();
      historyRef.current = nextHistory;
      historyIndexRef.current = nextHistory.length - 1;
    }

    syncDirtyState(snapshot);
    syncHistoryStatus();
  }, [syncDirtyState, syncHistoryStatus]);

  const markDirty = useCallback(() => {
    if (readOnly) return; // 읽기 전용: 어떤 경로로도 dirty·저장이 발생하지 않게 원천 차단
    setDirty(true);
    onDirtyChange(true);
    hasPendingHistoryRef.current = true;
    setHistoryStatus({ canUndo: true, canRedo: false });

    if (historyTimerRef.current !== null) {
      window.clearTimeout(historyTimerRef.current);
    }
    historyTimerRef.current = window.setTimeout(
      commitPendingHistory,
      HISTORY_COMMIT_DELAY_MS
    );
  }, [commitPendingHistory, onDirtyChange, readOnly]);

  const applyHistorySnapshot = useCallback(
    (snapshot: WorkflowEditorSnapshot, historyIndex: number) => {
      if (historyTimerRef.current !== null) {
        window.clearTimeout(historyTimerRef.current);
        historyTimerRef.current = null;
      }
      hasPendingHistoryRef.current = false;

      const nextSnapshot = cloneWorkflowEditorSnapshot(snapshot);
      editorStateRef.current = nextSnapshot;
      historyIndexRef.current = historyIndex;
      setName(nextSnapshot.name);
      setNodes(nextSnapshot.nodes);
      setEdges(nextSnapshot.edges);
      setPickerOpen(false);
      setPendingSourceNodeId(null);
      setPendingSourceHandleId(null);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setDeleteWorkNodeId(null);
      syncDirtyState(nextSnapshot);
      syncHistoryStatus(historyIndex);
    },
    [setEdges, setNodes, syncDirtyState, syncHistoryStatus]
  );

  const handleUndo = useCallback(() => {
    commitPendingHistory();
    const nextIndex = historyIndexRef.current - 1;
    if (nextIndex < 0) return;
    applyHistorySnapshot(historyRef.current[nextIndex], nextIndex);
  }, [applyHistorySnapshot, commitPendingHistory]);

  const handleRedo = useCallback(() => {
    commitPendingHistory();
    const nextIndex = historyIndexRef.current + 1;
    if (nextIndex >= historyRef.current.length) return;
    applyHistorySnapshot(historyRef.current[nextIndex], nextIndex);
  }, [applyHistorySnapshot, commitPendingHistory]);

  const handleDiscardAllChanges = useCallback(() => {
    const savedSnapshot = savedSnapshotRef.current;
    if (!savedSnapshot) return;

    const resetSnapshot = cloneWorkflowEditorSnapshot(savedSnapshot);
    historyRef.current = [resetSnapshot];
    historyIndexRef.current = 0;
    applyHistorySnapshot(resetSnapshot, 0);
    toast.info('저장 이후 변경을 모두 취소했습니다.');
  }, [applyHistorySnapshot]);

  useEffect(() => {
    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;

    const initialNodes = graph.nodes.map(graphNodeToFlowNode);
    const initialEdges = graph.edges.map(graphEdgeToFlowEdge);
    const initialSnapshot = createWorkflowEditorSnapshot(
      workflow.name,
      initialNodes,
      initialEdges
    );

    setNodes(initialNodes);
    setEdges(initialEdges);
    setName(workflow.name);
    editorStateRef.current = initialSnapshot;
    historyRef.current = [initialSnapshot];
    historyIndexRef.current = 0;
    savedSnapshotRef.current = cloneWorkflowEditorSnapshot(initialSnapshot);
    hasPendingHistoryRef.current = false;
    syncHistoryStatus(0);
    setDirty(false);
    onDirtyChange(false);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setDeleteWorkNodeId(null);
    setMultiSelectMode(false);
    const viewport = workflow.viewport ?? { x: 0, y: 0, zoom: 1 };
    requestAnimationFrame(() => void setViewport(viewport, { duration: 0 }));
  }, [graph, onDirtyChange, setEdges, setNodes, setViewport, syncHistoryStatus, workflow]);

  useEffect(() => {
    if (
      !hasHydratedRef.current ||
      dirtyRef.current ||
      editorStateRef.current.name === workflow.name
    ) {
      return;
    }

    const externalSnapshot = createWorkflowEditorSnapshot(
      workflow.name,
      editorStateRef.current.nodes,
      editorStateRef.current.edges
    );
    setName(workflow.name);
    editorStateRef.current = externalSnapshot;
    historyRef.current = [externalSnapshot];
    historyIndexRef.current = 0;
    savedSnapshotRef.current = cloneWorkflowEditorSnapshot(externalSnapshot);
    syncHistoryStatus(0);
  }, [syncHistoryStatus, workflow.name]);

  useEffect(
    () => () => {
      if (historyTimerRef.current !== null) {
        window.clearTimeout(historyTimerRef.current);
      }
    },
    []
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkflowFlowNode>[]) => {
      // 할 일 노드를 끌면 그 아래 매달린 작업 노드도 **같은 간격을 유지한 채** 따라온다
      // (2026-09-24 사용자 결정: 자리 기준 = 할 일 카드). 자리 자체는 다른 노드와 같은 절대
      // 좌표로 저장하고, `metadata.hostTaskNodeId` 는 «함께 움직일 대상»을 찾는 데만 쓴다.
      //
      // ⚠️ `onNodesChange(changes)` 를 먼저 부르고 그 다음에 이동량을 재면 **항상 0 이다** —
      // 그 호출이 이미 상태를 새 좌표로 바꿔 놓기 때문이다(오류 없이 조용히 안 따라온다).
      // 그래서 변경 적용과 동반 이동을 **한 번의 갱신 안에서** 함께 한다.
      setNodes((current) => {
        const next = applyNodeChanges(changes, current);
        const moved = new Map<string, { dx: number; dy: number }>();
        for (const change of changes) {
          if (change.type !== 'position' || !change.position) continue;
          const before = current.find((item) => item.id === change.id);
          if (!before || before.data.kind !== 'task') continue;
          const dx = change.position.x - before.position.x;
          const dy = change.position.y - before.position.y;
          if (dx === 0 && dy === 0) continue;
          moved.set(change.id, { dx, dy });
        }
        if (moved.size === 0) return next;
        // 여러 노드를 함께 선택해 끌면 작업 노드에도 position 변경이 온다 — 두 번 더하지 않는다
        const draggedIds = new Set(
          changes.filter((change) => change.type === 'position').map((change) => change.id)
        );
        return next.map((node) => {
          if (node.data.kind !== 'action' || draggedIds.has(node.id)) return node;
          const host = node.data.metadata.hostTaskNodeId;
          const delta = host ? moved.get(host) : undefined;
          if (!delta) return node;
          return { ...node, position: { x: node.position.x + delta.dx, y: node.position.y + delta.dy } };
        });
      });
      if (
        changes.some(
          (change) =>
            change.type === 'remove' ||
            change.type === 'position' ||
            (change.type === 'dimensions' && change.resizing === true)
        )
      ) {
        markDirty();
      }
    },
    [markDirty, setNodes]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowFlowEdge>[]) => {
      onEdgesChange(changes);
      if (changes.some((change) => change.type === 'remove')) markDirty();
    },
    [markDirty, onEdgesChange]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return;
      const relationType =
        connection.sourceHandle === WORKFLOW_HANDLE_IDS.sourceBottom &&
        connection.targetHandle === WORKFLOW_HANDLE_IDS.targetTop
          ? 'contains'
          : 'flow';
      setEdges((current) =>
        addEdge(
          createStyledEdge({
            id: crypto.randomUUID(),
            source: connection.source,
            target: connection.target,
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
            relationType,
          }),
          current
        )
      );
      markDirty();
    },
    [markDirty, setEdges]
  );

  const openPicker = useCallback(
    (
      position?: { x: number; y: number },
      sourceNodeId: string | null = null,
      sourceHandleId: string | null = null
    ) => {
      if (position) {
        setPendingPosition(position);
      } else {
        const rect = wrapperRef.current?.getBoundingClientRect();
        const center = rect
          ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
          : { x: 80, y: 100 };
        setPendingPosition(center);
      }
      setPendingSourceNodeId(sourceNodeId);
      setPendingSourceHandleId(sourceHandleId);
      setPickerOpen(true);
    },
    [screenToFlowPosition]
  );

  const closePicker = () => {
    setPickerOpen(false);
    setPendingSourceNodeId(null);
    setPendingSourceHandleId(null);
  };

  const handleConnectEnd = useCallback<OnConnectEnd>(
    (work, connectionState) => {
      if (connectionState.isValid || !connectionState.fromNode) return;
      const pointer = 'changedTouches' in work ? work.changedTouches[0] : work;
      openPicker(
        screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY }),
        connectionState.fromNode.id,
        connectionState.fromHandle.id ?? null
      );
    },
    [openPicker, screenToFlowPosition]
  );

  const appendEdges = useCallback(
    (newEdges: WorkflowFlowEdge[]) => {
      setEdges((current) => {
        const existingKeys = new Set(
          current.map((edge) => `${edge.source}:${edge.target}:${edge.data?.relationType ?? 'flow'}`)
        );
        return [
          ...current,
          ...newEdges.filter(
            (edge) => !existingKeys.has(`${edge.source}:${edge.target}:${edge.data?.relationType ?? 'flow'}`)
          ),
        ];
      });
    },
    [setEdges]
  );

  const connectPendingSource = useCallback(
    (targetNodeId: string): WorkflowFlowEdge[] => {
      if (!pendingSourceNodeId || pendingSourceNodeId === targetNodeId) return [];
      const isContainment = pendingSourceHandleId === WORKFLOW_HANDLE_IDS.sourceBottom;
      return [
        createStyledEdge({
          id: crypto.randomUUID(),
          source: pendingSourceNodeId,
          target: targetNodeId,
          sourceHandle: pendingSourceHandleId,
          targetHandle: isContainment
            ? WORKFLOW_HANDLE_IDS.targetTop
            : WORKFLOW_HANDLE_IDS.targetLeft,
          relationType: isContainment ? 'contains' : 'flow',
        }),
      ];
    },
    [pendingSourceHandleId, pendingSourceNodeId]
  );

  const handleAddWork = (work: Work, selectedTasks: Task[]) => {
    const existingWorkNode = nodes.find(
      (node) => node.data.kind === 'event' && node.data.entityId === work.id
    );
    const additions: WorkflowFlowNode[] = [];
    const workNodeId = existingWorkNode?.id ?? crypto.randomUUID();
    const workPosition = existingWorkNode?.position ?? pendingPosition;

    if (!existingWorkNode) {
      additions.push({
        id: workNodeId,
        type: 'workflowNode',
        position: workPosition,
        style: {
          width: WORKFLOW_NODE_SIZE.event.width,
          height: WORKFLOW_NODE_SIZE.event.height,
        },
        data: {
          kind: 'event',
          entityId: work.id,
          label: work.name,
          metadata: {
            description: work.description,
            status: work.status,
            progress: work.progress_percentage ?? 0,
            totalTasks: work.total_tasks ?? work.tasks?.length ?? 0,
            completedTasks: work.completed_tasks ?? 0,
            width: WORKFLOW_NODE_SIZE.event.width,
            height: WORKFLOW_NODE_SIZE.event.height,
          },
        },
      });
    }

    const taskNodeIds = new Map<string, string>();
    selectedTasks.forEach((task) => {
      const existingTaskNode = nodes.find(
        (node) => node.data.kind === 'task' && node.data.entityId === task.id
      );
      taskNodeIds.set(task.id, existingTaskNode?.id ?? crypto.randomUUID());
    });

    const taskEdges: WorkflowFlowEdge[] = [];
    const placements = buildWorkTaskPlacements(workPosition, selectedTasks);
    placements.forEach(({ task, position, sourceTaskId, relationType }) => {
      const existingTaskNode = nodes.find(
        (node) => node.data.kind === 'task' && node.data.entityId === task.id
      );
      const taskNodeId = taskNodeIds.get(task.id)!;
      if (!existingTaskNode) {
        additions.push({
          id: taskNodeId,
          type: 'workflowNode',
          position,
          style: {
            width: WORKFLOW_NODE_SIZE.task.width,
            height: WORKFLOW_NODE_SIZE.task.height,
          },
          data: {
            kind: 'task',
            entityId: task.id,
            label: task.title,
            metadata: {
              description: task.description,
              workName: work.name,
              status: task.status,
              taskType: task.type,
              orderIndex: task.order_index,
              containerNodeId: workNodeId,
              dueDate: taskEffectiveDueDate(task),
              progress: getTaskProgress(task),
              width: WORKFLOW_NODE_SIZE.task.width,
              height: WORKFLOW_NODE_SIZE.task.height,
            },
          },
        });
      }
      taskEdges.push(
        createStyledEdge({
          id: crypto.randomUUID(),
          source: sourceTaskId ? taskNodeIds.get(sourceTaskId)! : workNodeId,
          target: taskNodeId,
          relationType,
        })
      );
    });

    if (additions.length === 0 && !pendingSourceNodeId && taskEdges.length === 0) {
      toast.info('이미 이 흐름에 추가된 업무입니다.');
      return;
    }

    const selectedTaskEntityIds = new Set(selectedTasks.map((task) => task.id));
    setNodes((current) => [
      ...current.map((node) => {
        if (node.data.kind !== 'task' || !node.data.entityId || !selectedTaskEntityIds.has(node.data.entityId)) {
          return node;
        }
        const task = selectedTasks.find((item) => item.id === node.data.entityId)!;
        return {
          ...node,
          data: {
            ...node.data,
            metadata: {
              ...node.data.metadata,
              workName: work.name,
              taskType: task.type,
              orderIndex: task.order_index,
              containerNodeId: workNodeId,
            },
          },
        };
      }),
      ...additions,
    ]);
    appendEdges([...connectPendingSource(workNodeId), ...taskEdges]);
    markDirty();
    closePicker();
  };

  const handleAddTask = (task: Task, work: Work) => {
    const existing = nodes.find((node) => node.data.kind === 'task' && node.data.entityId === task.id);
    if (existing) {
      const pendingEdges = connectPendingSource(existing.id);
      if (pendingEdges.length > 0) {
        if (pendingSourceHandleId === WORKFLOW_HANDLE_IDS.sourceBottom) {
          setNodes((current) =>
            current.map((node) =>
              node.id === existing.id
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      metadata: {
                        ...node.data.metadata,
                        containerNodeId: pendingSourceNodeId ?? undefined,
                      },
                    },
                  }
                : node
            )
          );
        }
        appendEdges(pendingEdges);
        markDirty();
        closePicker();
      } else {
        toast.info('이미 이 흐름에 추가된 할 일입니다.');
      }
      return;
    }

    const nodeId = crypto.randomUUID();
    setNodes((current) => [
      ...current,
      {
        id: nodeId,
        type: 'workflowNode',
        position: pendingPosition,
        style: {
          width: WORKFLOW_NODE_SIZE.task.width,
          height: WORKFLOW_NODE_SIZE.task.height,
        },
        data: {
          kind: 'task',
          entityId: task.id,
          label: task.title,
          metadata: {
            description: task.description,
            workName: work.name,
            status: task.status,
            taskType: task.type,
            orderIndex: task.order_index,
            containerNodeId:
              pendingSourceHandleId === WORKFLOW_HANDLE_IDS.sourceBottom
                ? pendingSourceNodeId ?? undefined
                : undefined,
            dueDate: taskEffectiveDueDate(task),
            progress: getTaskProgress(task),
            width: WORKFLOW_NODE_SIZE.task.width,
            height: WORKFLOW_NODE_SIZE.task.height,
          },
        },
      },
    ]);
    appendEdges(connectPendingSource(nodeId));
    markDirty();
    closePicker();
  };

  /**
   * 작업 노드 추가 — 할 일 노드의 + 를 끌어 놓은 자리에 세우고 그 할 일과 잇는다(n8n 방식).
   * 이미 올라와 있으면 새로 만들지 않고 알린다(한 흐름에 같은 작업은 하나뿐 — DB 유니크).
   */
  const handleAddAction = (action: TaskAction) => {
    const existing = nodes.find((node) => node.data.kind === 'action' && node.data.entityId === action.id);
    if (existing) {
      toast.info('이미 이 흐름에 올라와 있는 작업입니다.');
      closePicker();
      return;
    }
    const hostNodeId =
      pendingSourceNodeId ??
      nodes.find((node) => node.data.kind === 'task' && node.data.entityId === action.task_id)?.id;
    const nodeId = crypto.randomUUID();
    setNodes((current) => [
      ...current,
      {
        id: nodeId,
        type: 'workflowNode',
        position: pendingPosition,
        style: { width: WORKFLOW_NODE_SIZE.action.width, height: WORKFLOW_NODE_SIZE.action.height },
        ...ACTION_NODE_FLOW_PROPS,
        data: {
          kind: 'action',
          entityId: action.id,
          label: action.title,
          metadata: {
            actionType: action.action_type,
            hostTaskNodeId: hostNodeId,
            width: WORKFLOW_NODE_SIZE.action.width,
            height: WORKFLOW_NODE_SIZE.action.height,
          },
        },
      },
    ]);
    // 소속 할 일과 잇는다 — 끌어서 만들었든 목록에서 골랐든 관계는 언제나 '작업'이다
    // (`connectPendingSource` 를 쓰면 끌어낸 핸들에 따라 '포함 할 일'이 되어 뜻이 틀린다)
    appendEdges(
      hostNodeId
        ? [
            createStyledEdge({
              id: crypto.randomUUID(),
              source: hostNodeId,
              target: nodeId,
              sourceHandle: WORKFLOW_HANDLE_IDS.sourceBottom,
              targetHandle: WORKFLOW_HANDLE_IDS.targetTop,
              relationType: 'action',
            }),
          ]
        : []
    );
    markDirty();
    closePicker();
  };

  const handleAddNote = (
    content: string,
    color: 'amber' | 'blue' | 'green' | 'violet'
  ) => {
    const nodeId = crypto.randomUUID();
    setNodes((current) => [
      ...current,
      {
        id: nodeId,
        type: 'workflowNode',
        position: pendingPosition,
        style: {
          width: WORKFLOW_NODE_SIZE.note.width,
          height: WORKFLOW_NODE_SIZE.note.height,
        },
        data: {
          kind: 'note',
          entityId: null,
          label: content,
          metadata: {
            noteColor: color,
            width: WORKFLOW_NODE_SIZE.note.width,
            height: WORKFLOW_NODE_SIZE.note.height,
          },
        },
      },
    ]);
    appendEdges(connectPendingSource(nodeId));
    markDirty();
    closePicker();
  };

  const handleAddRegion = () => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 300, y: 220 };
    const width = WORKFLOW_NODE_SIZE.region.width;
    const height = WORKFLOW_NODE_SIZE.region.height;

    setNodes((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: 'workflowNode',
        position: { x: center.x - width / 2, y: center.y - height / 2 },
        dragHandle: '.workflow-region-drag-handle',
        zIndex: -1,
        style: { width, height },
        data: {
          kind: 'region',
          entityId: null,
          label: '구분 영역',
          metadata: { headerColor: 'slate', width, height },
        },
      },
    ]);
    markDirty();
  };

  const removeWorkflowNodes = (nodeIds: string[]) => {
    const removedIds = new Set(nodeIds);
    setNodes((current) =>
      current
        .filter((node) => !removedIds.has(node.id))
        .map((node) => {
          const containerNodeId = node.data.metadata.containerNodeId;
          if (typeof containerNodeId !== 'string' || !removedIds.has(containerNodeId)) return node;
          const metadata = { ...node.data.metadata };
          delete metadata.containerNodeId;
          return { ...node, data: { ...node.data, metadata } };
        })
    );
    setEdges((current) =>
      current.filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target))
    );
    setSelectedNodeId(null);
    setDeleteWorkNodeId(null);
    markDirty();
  };

  const handleDeleteNode = (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (node?.data.kind === 'event') {
      const includedNodes = getIncludedDescendantNodes(nodeId, nodes, edges);
      if (includedNodes.length > 0) {
        setDeleteWorkNodeId(nodeId);
        return;
      }
    }
    removeWorkflowNodes([nodeId]);
  };

  const handleDeleteEdge = (edgeId: string) => {
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
    setSelectedEdgeId(null);
    markDirty();
  };

  // 노드 이름 → 원본 이름 확인창. 인스펙터가 아니라 여기가 소유한다 — 캔버스 빈 곳을
  // 눌러 편집을 마치면 선택이 풀려 인스펙터가 사라지기 때문이다.
  const [sourceRename, setSourceRename] = useState<SourceRenameProposal | null>(null);

  const handleUpdateNodeLabel = (nodeId: string, label: string) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, label } } : node
      )
    );
    markDirty();
  };

  // ── 노드 정보 라이브 동기화: 업무/할 일 노드의 상태·진행률·기한 등은 저장된
  // 스냅샷이 아니라 실제 데이터(works)를 항상 따른다. 표시 목적 갱신이므로
  // dirty로 잡지 않는다(저장하면 최신 스냅샷이 함께 저장되는 부수 이득).
  useEffect(() => {
    const workById = new Map(works.map((work) => [work.id, work]));
    const taskById = new Map<string, { task: Task; work: Work }>();
    works.forEach((work) =>
      (work.tasks ?? []).forEach((task) => taskById.set(task.id, { task, work }))
    );
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        if (!node.data.entityId) return node;
        const patch: Record<string, unknown> = {};
        if (node.data.kind === 'event') {
          const work = workById.get(node.data.entityId);
          if (!work) {
            if (!node.data.metadata.sourceDeleted) Object.assign(patch, { sourceDeleted: true });
          } else {
            Object.assign(patch, {
              sourceDeleted: false,
              status: work.status,
              progress: work.progress_percentage ?? 0,
              totalTasks: work.total_tasks ?? work.tasks?.length ?? 0,
              completedTasks: work.completed_tasks ?? 0,
            });
          }
        } else if (node.data.kind === 'task') {
          const found = taskById.get(node.data.entityId);
          if (!found) {
            if (!node.data.metadata.sourceDeleted) Object.assign(patch, { sourceDeleted: true });
          } else {
            Object.assign(patch, {
              sourceDeleted: false,
              status: found.task.status,
              taskType: found.task.type,
              orderIndex: found.task.order_index,
              dueDate: taskEffectiveDueDate(found.task),
              workName: found.work.name,
              progress: getTaskProgress(found.task),
            });
          }
        } else {
          return node;
        }
        const differs = Object.entries(patch).some(
          ([key, value]) => (node.data.metadata[key] ?? undefined) !== (value ?? undefined)
        );
        if (!differs) return node;
        changed = true;
        return { ...node, data: { ...node.data, metadata: { ...node.data.metadata, ...patch } } };
      });
      return changed ? next : current;
    });
  }, [works, setNodes]);

  // ── 캔버스에 있는 할 일 = 작업 노드를 매달 대상 ──
  // 종전엔 여기서 `useConnectedWorkTaskIds` 로 «연결됨» 불리언만 받아 노드 헤더의 렌치
  // 아이콘을 켜고 껐다. 지금은 작업 목록 자체를 받아 노드로 그리므로(아래) 그 조회는 뺐다 —
  // 같은 사실을 두 쿼리로 묻게 된다. 저장된 `metadata.workConnected` 는 읽는 곳이 없다.
  const taskEntityIds = useMemo(
    () => [...new Set(nodes.filter((n) => n.data.kind === 'task' && n.data.entityId).map((n) => n.data.entityId!))],
    [nodes],
  );

  // ── 연결 대상 변경(인스펙터): entityId 교체 + 표시 이름·정보를 새 원본으로 재시드 ──
  const handleUpdateNodeEntity = (nodeId: string, entityId: string) => {
    const workById = new Map(works.map((work) => [work.id, work]));
    const taskById = new Map<string, { task: Task; work: Work }>();
    works.forEach((work) =>
      (work.tasks ?? []).forEach((task) => taskById.set(task.id, { task, work }))
    );
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId) return node;
        if (node.data.kind === 'event') {
          const work = workById.get(entityId);
          if (!work) return node;
          return {
            ...node,
            data: {
              ...node.data,
              entityId,
              label: work.name,
              metadata: {
                ...node.data.metadata,
                sourceDeleted: false,
                description: work.description,
                status: work.status,
                progress: work.progress_percentage ?? 0,
                totalTasks: work.total_tasks ?? work.tasks?.length ?? 0,
                completedTasks: work.completed_tasks ?? 0,
              },
            },
          };
        }
        if (node.data.kind === 'task') {
          const found = taskById.get(entityId);
          if (!found) return node;
          return {
            ...node,
            data: {
              ...node.data,
              entityId,
              label: found.task.title,
              metadata: {
                ...node.data.metadata,
                sourceDeleted: false,
                description: found.task.description,
                status: found.task.status,
                taskType: found.task.type,
                orderIndex: found.task.order_index,
                dueDate: taskEffectiveDueDate(found.task),
                workName: found.work.name,
                progress: getTaskProgress(found.task),
              },
            },
          };
        }
        return node;
      })
    );
    markDirty();
  };

  const handleUpdateNodeHeaderColor = (
    nodeId: string,
    color: WorkflowHeaderColor | null
  ) => {
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId) return node;
        const metadata = { ...node.data.metadata };
        if (color) metadata.headerColor = color;
        else delete metadata.headerColor;
        return { ...node, data: { ...node.data, metadata } };
      })
    );
    markDirty();
  };

  const handleUpdateEdge = (
    edgeId: string,
    relationType: WorkflowRelationType,
    label: string
  ) => {
    setEdges((current) =>
      current.map((edge) =>
        edge.id === edgeId
          ? createStyledEdge({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              relationType,
              label,
            })
          : edge
      )
    );
    markDirty();
  };

  const handleSave = useCallback(async () => {
    if (saveGraph.isPending) return;

    if (!name.trim()) {
      toast.error('업무 흐름 이름을 입력해주세요.');
      return;
    }

    if (nodes.some((node) => !node.data.label.trim())) {
      toast.error('내용이 비어 있는 노드가 있습니다.');
      return;
    }

    commitPendingHistory();
    const savedSnapshot = createWorkflowEditorSnapshot(name, nodes, edges);

    try {
      await saveGraph.mutateAsync({
        workflowId: workflow.id,
        name,
        description,
        viewport: getViewport(),
        nodes,
        edges,
      });
      savedSnapshotRef.current = savedSnapshot;
      const latestSnapshot = createWorkflowEditorSnapshot(
        editorStateRef.current.name,
        editorStateRef.current.nodes,
        editorStateRef.current.edges
      );
      syncDirtyState(latestSnapshot);
      toast.success('업무 흐름을 저장했습니다.');
    } catch (error) {
      console.error(error);
      toast.error('업무 흐름을 저장하지 못했습니다.');
    }
  }, [commitPendingHistory, description, edges, getViewport, name, nodes, saveGraph, syncDirtyState, workflow.id]);

  useEffect(() => {
    if (readOnly) return; // 읽기 전용: 편집 단축키 비활성
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;

      const key = event.key.toLowerCase();
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (key === 'z') {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (key === 'y') {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (key === 's') {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRedo, handleSave, handleUndo, readOnly]);

  const miniMapNodeColor = useCallback((node: WorkflowFlowNode) => {
    if (node.data.kind === 'action') return '#94a3b8';
    if (node.data.kind === 'region') return '#cbd5e1';
    if (node.data.kind === 'event') return '#6366f1';
    if (node.data.kind === 'task') return '#0ea5e9';
    return '#f59e0b';
  }, []);

  const handleToggleMultiSelectMode = () => {
    setMultiSelectMode((current) => !current);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setNodes((current) =>
      current.map((node) => (node.selected ? { ...node, selected: false } : node))
    );
  };

  // ── 워크플로 복사 모드 ──
  const enterCopyMode = () => {
    if (dirty) toast.info('저장되지 않은 변경은 복사본에 포함되지 않습니다(저장본 기준 복사).');
    setCopyName(`${name || workflow.name} (복사본)`);
    setCopyExcluded(new Set());
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setCopyMode(true);
  };

  // 노드 클릭 = 포함↔제외 토글. 업무 노드는 **선(edge)으로 이어진** 노드를 함께 넣고 뺀다
  // (utils/workflowCopy.ts — 다른 업무·다른 업무에 포함된 노드에서 멈춘다). 서버는 이 목록만 본다.
  const toggleCopyExclude = useCallback((nodeId: string) => {
    setCopyExcluded((prev) => toggleCopyExcluded(prev, nodeId, nodes, edges));
  }, [nodes, edges]);

  const handleCopyExecute = async () => {
    if (copyExcluded.size >= nodes.length && nodes.length > 0) {
      toast.error('복사할 노드가 없습니다 — 최소 1개는 포함해야 합니다.');
      return;
    }
    try {
      const result = await copyWorkflowMutation.mutateAsync({
        sourceWorkflowId: workflow.id,
        name: copyName.trim() || undefined,
        excludedNodeIds: [...copyExcluded],
      });
      toast.success(
        `업무 흐름을 복사했습니다 — 업무 ${result.events}개·할 일 ${result.tasks}개·작업 ${result.actions}개·노드 ${result.nodes}개 (담당자 상태는 초기화, 실행 이력은 복사되지 않음)`
      );
      setCopyMode(false);
      setCopyExcluded(new Set());
      onCopied?.(result.workflowId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '업무 흐름 복사에 실패했습니다.');
    }
  };

  // ── 작업(ACTION) 노드: 정식 노드다(2026-09-24) ──
  // 자리는 `task_workflow_node.position_*` 에, 무엇을 가리키는지는 `action_id` 에 저장된다.
  // 여기서는 **표시값만** 원본에서 다시 읽는다(제목·유형·실행 이력·순서 번호).
  const actionEntityIds = useMemo(
    () => [...new Set(nodes.filter((n) => n.data.kind === 'action' && n.data.entityId).map((n) => n.data.entityId!))],
    [nodes],
  );
  const { data: taskActions = [] } = useTaskActionsForTasks(taskEntityIds);
  const runPresence = useTaskActionRunPresence(useMemo(() => taskActions.map((a) => a.id), [taskActions]));

  /** 할 일 id → 권장 순서로 세운 작업(제출 구현용 연결은 뺀다 = 패널과 같은 규칙) */
  const actionsByTask = useMemo(() => {
    const flowByTask = new Map<string, string[]>();
    works.forEach((work) =>
      (work.tasks ?? []).forEach((task) => flowByTask.set(task.id, readActionFlow(task.meta)))
    );
    const grouped = new Map<string, TaskAction[]>();
    listableActions(taskActions).forEach((action) => {
      if (!action.task_id) return;
      const bucket = grouped.get(action.task_id);
      if (bucket) bucket.push(action);
      else grouped.set(action.task_id, [action]);
    });
    grouped.forEach((actions, taskId) =>
      grouped.set(taskId, orderByFlow(actions, flowByTask.get(taskId) ?? [], (action) => action.id))
    );
    return grouped;
  }, [taskActions, works]);

  const actionById = useMemo(
    () => new Map(taskActions.map((action) => [action.id, action])),
    [taskActions]
  );

  // 표시값 동기화 — 할 일·업무 노드의 라이브 동기화(위)와 같은 방식. dirty 로 잡지 않는다.
  useEffect(() => {
    if (actionEntityIds.length === 0) return;
    const ranIds = runPresence.data;
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        if (node.data.kind !== 'action' || !node.data.entityId) return node;
        const action = actionById.get(node.data.entityId);
        if (!action) {
          if (node.data.metadata.sourceDeleted) return node;
          changed = true;
          return { ...node, data: { ...node.data, metadata: { ...node.data.metadata, sourceDeleted: true } } };
        }
        const siblings = action.task_id ? actionsByTask.get(action.task_id) ?? [] : [];
        const index = siblings.findIndex((item) => item.id === action.id);
        const patch = {
          sourceDeleted: false,
          actionType: action.action_type,
          actionHasRun: ranIds ? ranIds.has(action.id) : node.data.metadata.actionHasRun,
          // 같은 할 일에 작업이 하나뿐이면 번호를 그리지 않는다(1/1 은 정보가 아니다)
          actionStep: siblings.length > 1 && index >= 0 ? index + 1 : undefined,
        };
        const labelDiffers = action.title.trim().length > 0 && node.data.label !== action.title;
        const metaDiffers = Object.entries(patch).some(
          ([key, value]) => (node.data.metadata[key] ?? undefined) !== (value ?? undefined)
        );
        if (!labelDiffers && !metaDiffers) return node;
        changed = true;
        return {
          ...node,
          data: {
            ...node.data,
            label: labelDiffers ? action.title : node.data.label,
            metadata: { ...node.data.metadata, ...patch },
          },
        };
      });
      return changed ? next : current;
    });
  }, [actionById, actionsByTask, actionEntityIds.length, runPresence.data, setNodes]);

  // 러너 — 작업 노드를 더블클릭하면 열린다(다른 노드가 원본을 여는 것과 같은 동작)
  const [runnerActionId, setRunnerActionId] = useState<string | null>(null);
  const runnerAction = runnerActionId ? actionById.get(runnerActionId) ?? null : null;
  const runnerTaskTitle =
    (runnerAction &&
      nodes.find((node) => node.data.kind === 'task' && node.data.entityId === runnerAction.task_id)
        ?.data.label) ||
    runnerAction?.title ||
    '';

  /** 노드 선택기에 「작업」 탭을 띄울지 — 할 일 노드에서 끌어 놓았을 때만 */
  const actionPickerSource = useMemo(() => {
    if (!pendingSourceNodeId) return null;
    const host = nodes.find((node) => node.id === pendingSourceNodeId);
    if (!host || host.data.kind !== 'task' || !host.data.entityId) return null;
    return {
      taskId: host.data.entityId,
      taskTitle: host.data.label,
      placedActionIds: new Set(
        nodes
          .filter((node) => node.data.kind === 'action' && node.data.entityId)
          .map((node) => node.data.entityId!)
      ),
    };
  }, [nodes, pendingSourceNodeId]);

  // 복사 모드: 제외 노드는 흐리게 표시
  const displayNodes = useMemo(() => {
    if (!copyMode) return nodes;
    return nodes.map((node) =>
      copyExcluded.has(node.id)
        ? { ...node, style: { ...node.style, opacity: 0.25, filter: 'grayscale(1)' } }
        : { ...node, style: { ...node.style, opacity: 1, filter: 'none' } }
    );
  }, [copyMode, copyExcluded, nodes]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="grid w-fit min-w-32 max-w-full shrink">
            <span
              aria-hidden="true"
              className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre px-2 text-base font-bold md:text-base"
            >
              {`${name || '업무 흐름'} `}
            </span>
            <Input
              value={name}
              readOnly={readOnly}
              onChange={(event) => {
                if (readOnly) return;
                setName(event.target.value);
                markDirty();
              }}
              className="col-start-1 row-start-1 h-9 min-w-0 border-transparent bg-transparent px-2 text-base font-bold text-slate-800 shadow-none hover:bg-slate-50 focus-visible:border-slate-200 focus-visible:ring-0 md:text-base"
            />
          </div>
          {readOnly ? (
            <span className="hidden items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500 sm:flex">
              <Eye className="h-3 w-3" />
              읽기 전용{workflow.owner_name ? ` · ${workflow.owner_name}` : ''}
            </span>
          ) : (
            <span
              className={cn(
                'hidden items-center gap-1 rounded-full px-2 py-1 text-[11px] sm:flex',
                dirty ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
              )}
            >
              {dirty ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : <Check className="h-3 w-3" />}
              {dirty ? '저장되지 않은 변경' : '저장됨'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!copyMode && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              title="이 업무 흐름을 내 업무 흐름으로 복사(내부 업무·할 일·작업 포함, 노드 선택 가능)"
              onClick={enterCopyMode}
            >
              <CopyIcon className="mr-1.5 h-3.5 w-3.5" />
              복사
            </Button>
          )}
          {!readOnly && (
            <>
              <div
                className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
                role="group"
                aria-label="편집 이력"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md"
                  disabled={!historyStatus.canUndo}
                  aria-label="실행 취소"
                  title="실행 취소 (Ctrl+Z)"
                  onClick={handleUndo}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md"
                  disabled={!historyStatus.canRedo}
                  aria-label="다시 실행"
                  title="다시 실행 (Ctrl+Y)"
                  onClick={handleRedo}
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
                <div className="mx-0.5 h-4 w-px bg-slate-200" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md text-slate-500 hover:text-rose-600"
                  disabled={!dirty}
                  aria-label="모든 변경 취소"
                  title="모든 변경 취소 (마지막 저장 상태로 복원)"
                  onClick={handleDiscardAllChanges}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button
                size="sm"
                className="h-8 bg-blue-600 hover:bg-blue-700"
                disabled={!dirty || saveGraph.isPending}
                onClick={() => void handleSave()}
              >
                {saveGraph.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                저장
              </Button>
            </>
          )}
        </div>
      </div>

      <div ref={wrapperRef} className="task-workflow-canvas relative h-[680px] min-h-[520px] bg-slate-50">
        <ReactFlow<WorkflowFlowNode, WorkflowFlowEdge>
          nodes={displayNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onConnectEnd={handleConnectEnd}
          nodesDraggable={!readOnly && !copyMode}
          nodesConnectable={!readOnly && !copyMode}
          onNodeClick={(_, node) => {
            if (copyMode) {
              // 복사 모드: 클릭 = 포함↔제외 토글
              toggleCopyExclude(node.id);
              return;
            }
            if (multiSelectMode) {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
              return;
            }
            setSelectedNodeId(node.id);
            setSelectedEdgeId(null);
          }}
          onNodeDoubleClick={(_, node) => {
            if (copyMode) return;
            if (node.data.kind === 'event' && node.data.entityId) onOpenWork(node.data.entityId);
            if (node.data.kind === 'task' && node.data.entityId) onOpenTask(node.data.entityId);
            if (node.data.kind === 'action' && node.data.entityId) setRunnerActionId(node.data.entityId);
          }}
          onEdgeClick={(_, edge) => {
            if (multiSelectMode || copyMode) return;
            setSelectedEdgeId(edge.id);
            setSelectedNodeId(null);
          }}
          onPaneClick={() => {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
          }}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            if (readOnly || copyMode) return;
            openPicker(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
          }}
          isValidConnection={(connection) => connection.source !== connection.target}
          snapToGrid
          snapGrid={[16, 16]}
          minZoom={0.2}
          maxZoom={1.8}
          deleteKeyCode={null}
          multiSelectionKeyCode={['Control', 'Meta']}
          selectionKeyCode="Shift"
          selectionOnDrag={multiSelectMode}
          panOnDrag={!multiSelectMode}
          selectionMode={SelectionMode.Partial}
          fitView={graph.nodes.length > 0}
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2 }}
          attributionPosition="bottom-right"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="#cbd5e1" />
          <Controls
            position="bottom-left"
            showInteractive={false}
            className="!overflow-hidden !rounded-xl !border-slate-200 !shadow-lg"
          />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={miniMapNodeColor}
            maskColor="rgba(241,245,249,0.72)"
            className="!rounded-xl !border !border-slate-200 !bg-white !shadow-lg"
          />

          {!readOnly && !copyMode && (
            <Panel position="top-left">
              <div className="flex items-center gap-2">
                <Button
                  variant={multiSelectMode ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    'rounded-xl bg-white/95 shadow-lg',
                    multiSelectMode && 'bg-indigo-600 text-white hover:bg-indigo-700'
                  )}
                  aria-pressed={multiSelectMode}
                  title={
                    multiSelectMode
                      ? '빈 작업대를 드래그해 노드를 선택한 뒤 함께 이동하세요.'
                      : '여러 노드를 선택해 함께 이동합니다.'
                  }
                  onClick={handleToggleMultiSelectMode}
                >
                  <BoxSelect className="mr-1.5 h-4 w-4" />
                  {multiSelectMode ? '여러 선택 중' : '여러 노드 선택'}
                </Button>
                <Button
                  size="sm"
                  className="rounded-xl bg-blue-600 shadow-lg hover:bg-blue-700"
                  onClick={() => openPicker()}
                >
                  <Plus className="mr-1.5 h-4 w-4" />노드 추가
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl bg-white/95 shadow-lg"
                  onClick={handleAddRegion}
                >
                  <LayoutPanelTop className="mr-1.5 h-4 w-4" />영역 추가
                </Button>
              </div>
            </Panel>
          )}

          {copyMode && (
            <Panel position="top-center">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-blue-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                  <CopyIcon className="h-3.5 w-3.5" />
                  업무 흐름 복사
                </span>
                <Input
                  value={copyName}
                  onChange={(event) => setCopyName(event.target.value)}
                  placeholder="복사본 이름"
                  className="h-8 w-56 text-sm"
                />
                <span className="text-[11px] tabular-nums text-slate-500">
                  포함 {nodes.length - copyExcluded.size} · 제외 {copyExcluded.size}
                </span>
                <span className="hidden text-[11px] text-slate-400 md:inline">
                  제외할 노드를 클릭하세요(기본 전체 포함) — 업무를 누르면 선으로 이어진 노드가 함께 빠집니다
                </span>
                <Button
                  size="sm"
                  className="h-8 bg-blue-600 hover:bg-blue-700"
                  disabled={copyWorkflowMutation.isPending}
                  onClick={() => void handleCopyExecute()}
                >
                  {copyWorkflowMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CopyIcon className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  복사 실행
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  disabled={copyWorkflowMutation.isPending}
                  onClick={() => {
                    setCopyMode(false);
                    setCopyExcluded(new Set());
                  }}
                >
                  취소
                </Button>
              </div>
            </Panel>
          )}

          {multiSelectMode && !copyMode && nodes.length > 0 && (
            <Panel position="top-center" className="pointer-events-none">
              <div className="rounded-full border border-indigo-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-indigo-700 shadow-md backdrop-blur">
                빈 영역을 드래그해 선택하고, 선택된 노드를 끌어 함께 이동하세요
              </div>
            </Panel>
          )}

          {nodes.length === 0 && !pickerOpen && !readOnly && (
            <Panel position="top-center" className="!top-1/3">
              <div className="w-80 rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-xl backdrop-blur">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Plus className="h-6 w-6" />
                </div>
                <h3 className="mt-3 font-bold text-slate-800">첫 할 일 노드를 추가하세요</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  기존 업무·할 일을 가져오거나 새로 만든 뒤, 노드의 + 핸들을 드래그해 흐름을 연결할 수 있습니다.
                </p>
                <Button className="mt-4 bg-blue-600 hover:bg-blue-700" onClick={() => openPicker()}>
                  노드 선택하기
                </Button>
              </div>
            </Panel>
          )}
        </ReactFlow>

        {pickerOpen && (
          <WorkflowNodePicker
            works={works}
            managers={managers}
            departments={departments}
            defaultDepartmentId={workflow.department_id}
            onClose={closePicker}
            onAddWork={handleAddWork}
            onAddTask={handleAddTask}
            onAddNote={handleAddNote}
            actionSource={actionPickerSource}
            onAddAction={handleAddAction}
          />
        )}

        {!pickerOpen && !copyMode && (
          <WorkflowInspector
            workflowId={workflow.id}
            node={selectedNode}
            edge={selectedEdge}
            readOnly={readOnly}
            onClose={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            onDeleteNode={handleDeleteNode}
            onDeleteEdge={handleDeleteEdge}
            onOpenSource={(node) => {
              if (node.data.kind === 'event' && node.data.entityId) onOpenWork(node.data.entityId);
              if (node.data.kind === 'task' && node.data.entityId) onOpenTask(node.data.entityId);
            }}
            onUpdateNodeLabel={handleUpdateNodeLabel}
            onUpdateNodeHeaderColor={handleUpdateNodeHeaderColor}
            onUpdateNodeEntity={handleUpdateNodeEntity}
            onUpdateEdge={handleUpdateEdge}
            onProposeSourceRename={setSourceRename}
            onOpenAction={setRunnerActionId}
            works={works}
          />
        )}

        {/* 작업 노드 더블클릭 → 그 작업의 실행 화면. 남의 흐름(readOnly)에서는 RUN 쓰기가
            서버에서 막히므로 안내만 연다(눌렀는데 저장이 실패하는 것보다 낫다) */}
        {runnerAction && (
          <TaskActionRunnerDialog
            action={runnerAction}
            taskTitle={runnerTaskTitle}
            workflowId={workflow.id}
            guideOnly={readOnly}
            open
            onOpenChange={(open) => {
              if (!open) setRunnerActionId(null);
            }}
          />
        )}

        <SourceRenameDialog proposal={sourceRename} onClose={() => setSourceRename(null)} />

        <WorkflowDeleteDialog
          open={Boolean(deleteWorkNodeId)}
          workNode={deleteWorkNode}
          includedNodes={deleteIncludedNodes}
          onOpenChange={(open) => {
            if (!open) setDeleteWorkNodeId(null);
          }}
          onConfirm={(includedNodeIds) => {
            if (!deleteWorkNodeId) return;
            removeWorkflowNodes([deleteWorkNodeId, ...includedNodeIds]);
          }}
        />
      </div>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
