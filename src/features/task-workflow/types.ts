import { Position } from '@xyflow/react';
import type { Edge, Node, Viewport } from '@xyflow/react';

export type WorkflowNodeKind = 'event' | 'task' | 'note' | 'region' | 'action';
export type WorkflowRelationType =
  | 'flow'
  | 'contains'
  | 'depends_on'
  | 'handoff'
  | 'related'
  /** 할 일 → 그 할 일의 작업(ACTION) 노드 — 라벨을 그리지 않는다(노드가 이미 작업이라고 말한다) */
  | 'action';
export type WorkflowHeaderColor = 'slate' | 'blue' | 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose';

export const WORKFLOW_NODE_SIZE: Record<
  WorkflowNodeKind,
  { width: number; height: number; minWidth: number; minHeight: number }
> = {
  event: { width: 256, height: 148, minWidth: 220, minHeight: 112 },
  task: { width: 256, height: 196, minWidth: 220, minHeight: 140 },
  note: { width: 256, height: 132, minWidth: 200, minHeight: 96 },
  region: { width: 420, height: 260, minWidth: 240, minHeight: 160 },
  /**
   * 작업 노드 = **흰 아이콘 상자 그 자체**다(2026-09-24 사용자 결정). 라벨은 노드 상자 **밖**
   * 아래에 그린다 — 라벨을 상자 안에 두면 선택 테두리·연결점이 글자까지 감싼다.
   * **48 = 흰 상자의 원래 크기(`h-12 w-12`)** 다. 이 값을 키우면 흰 상자가 함께 커진다 —
   * 요구는 «테두리를 흰 상자에 맞춰라»이지 «흰 상자를 키워라»가 아니었다.
   * 크기는 바꾸지 않는다(min = 기본값).
   */
  action: { width: 48, height: 48, minWidth: 48, minHeight: 48 },
};

export interface TaskWorkflow {
  id: string;
  owner_id: string;
  department_id: string | null;
  name: string;
  description: string | null;
  viewport: Viewport;
  created_at: string;
  updated_at: string;
  /** 소유자 표시 이름(목록 조회 시 profiles에서 보강, 2026-07-26 전체 교사 공유) */
  owner_name?: string | null;
}

export interface TaskWorkflowEntityLink {
  workflowId: string;
  workflowName: string;
  departmentId: string | null;
  updatedAt: string;
}

export interface TaskWorkflowEntityLinks {
  works: Record<string, TaskWorkflowEntityLink>;
  tasks: Record<string, TaskWorkflowEntityLink>;
}

export type TaskActionType =
  | 'evalearn.mock_marking_import'
  | 'evalearn.mock_exam_import'
  | 'evalearn.grade_analysis_import'
  | 'document.template_fill'
  | 'document.spec_fill'
  // link.*: 태스크를 SPACEKIJUN 기능·행정 할 일과 연결(embed=실제 모달, link=바로가기)
  | 'link.evalog_import'
  | 'link.neis_schedule_import'
  | 'link.timetable_data'
  | 'link.curriculum_upload'
  | 'link.course_offering_upload'
  | 'link.enrollment_upload'
  | 'link.student_timetable_upload'
  | 'link.teacher_timetable_upload'
  | 'link.account_excel'
  | 'link.resource_csv'
  | 'link.timetable_csv'
  | 'link.exam_supervision'
  | 'link.timetable_generate'
  | 'link.admin_users'
  | 'link.admin_teachers'
  | 'link.admin_resources'
  | 'link.admin_accounts'
  | 'link.admin_sections'
  | 'link.admin_students'
  | 'link.admin_departments'
  | 'link.admin_tags'
  | 'link.volunteer_issue'
  | 'link.gajeong_issue'
  | 'link.schedule_add'
  | 'link.timetable_change'
  | 'link.notice_write'
  | 'link.training_certificate'
  | 'link.document_upload'
  | 'link.work_create'
  // neis.*: 나이스 안에서 사람이 처리하는 업무 — 화면을 가리키고 완료를 기록한다(2026-09-23)
  | 'neis.screen'
  // external.*: 나이스 «밖»의 시스템(에듀파인·리로스쿨·업무포털…)에서 사람이 처리하는 업무.
  // NEIS 와 유형을 나눈 이유 = 저쪽은 화면 1,384개 카탈로그에서 «고르고», 이쪽은 «적는다»
  // (자세히는 src/lib/externalScreens.ts)
  | 'external.screen'
  // collect.*: 정해진 대상에게서 값을 입력받는다 — 대상은 규칙으로 고른다(2026-09-23)
  | 'collect.input'
  // submit.*: 정해진 대상에게서 결과물을 받는다(2026-10-01) — 파일 / 양식 문서 / 실물.
  //   요청·명단은 입력 받기와 같은 표, 제출물은 action_submission. 담당자가 내면 그 담당자가 완료된다
  | 'submit.file'
  | 'submit.document'
  | 'submit.physical'
  // message.*: 대상 규칙으로 고른 교직원에게 메시지(SPACEKIJUN 알림 + 쿨메신저 안내, 2026-09-24)
  | 'message.send'
  // signature.*: 서명을 받는다 — 두 종류는 **서로 다른 시스템**이라 유형을 나눴다(2026-09-24)
  //   request  = 전자서명(임의 문서에 서명자 지정, `signature_request`)
  //   training = 연수 참석 서명(일정에 딸린 참석자 명단, `training_signature` + QR·출력)
  | 'signature.request'
  | 'signature.training';
export type TaskActionExecutionMode = 'manual' | 'assisted' | 'automatic';
export type TaskActionVerificationMode = 'none' | 'automatic' | 'human_review';
export type TaskActionRunStatus =
  | 'created'
  | 'running'
  | 'needs_review'
  | 'accepted'
  | 'needs_changes'
  | 'failed'
  | 'cancelled';
export type TaskActionCheckStatus = 'pass' | 'warn' | 'fail';
export type TaskActionReviewDecision = 'accepted' | 'needs_changes';
export type TaskActionArtifactType = 'record_set' | 'file' | 'link' | 'summary';
export type TaskActionRunLogType = 'started' | 'finalized' | 'reviewed';

export interface TaskAction {
  id: string;
  /** 연결된 task — 문서 생성(독립) 항목은 null (2026-08-16) */
  task_id: string | null;
  created_by: string;
  action_type: TaskActionType;
  handler_version: number;
  title: string;
  description: string | null;
  execution_mode: TaskActionExecutionMode;
  verification_mode: TaskActionVerificationMode;
  config: Record<string, unknown>;
  is_required: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskActionCheck {
  id: string;
  run_id: string;
  created_by: string;
  check_key: string;
  label: string;
  status: TaskActionCheckStatus;
  message: string | null;
  evidence: Record<string, unknown>;
  created_at: string;
}

export interface TaskActionReview {
  id: string;
  run_id: string;
  reviewer_id: string;
  decision: TaskActionReviewDecision;
  comment: string | null;
  created_at: string;
}

export interface TaskActionArtifact {
  id: string;
  run_id: string;
  created_by: string;
  artifact_key: string;
  artifact_type: TaskActionArtifactType;
  label: string;
  locator: Record<string, unknown>;
  mime_type: string | null;
  size_bytes: number | null;
  content_sha256: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TaskActionDocumentTemplateField {
  key: string;
  label: string;
  required: boolean;
  defaultValue?: string;
  occurrences: number;
}

export interface TaskActionDocumentTemplate {
  id: string;
  created_by: string;
  family_id: string;
  previous_version_id: string | null;
  name: string;
  description: string | null;
  format: 'hwpx';
  version: number;
  source_file_name: string;
  storage_bucket: 'task-work-documents';
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  content_sha256: string;
  fields: TaskActionDocumentTemplateField[];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskActionRunLog {
  id: string;
  run_id: string;
  created_by: string;
  sequence_no: number;
  log_type: TaskActionRunLogType;
  from_status: TaskActionRunStatus | null;
  to_status: TaskActionRunStatus;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TaskActionRun {
  id: string;
  action_id: string;
  workflow_id: string | null;
  created_by: string;
  idempotency_key: string;
  status: TaskActionRunStatus;
  input_snapshot: Record<string, unknown>;
  output_summary: Record<string, unknown>;
  error_summary: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskActionRunWithDetails extends TaskActionRun {
  checks: TaskActionCheck[];
  reviews: TaskActionReview[];
  artifacts: TaskActionArtifact[];
  events: TaskActionRunLog[];
}

export interface TaskActionCheckInput {
  key: string;
  label: string;
  status: TaskActionCheckStatus;
  message?: string;
  evidence?: Record<string, unknown>;
}

export interface TaskActionArtifactInput {
  key: string;
  type: TaskActionArtifactType;
  label: string;
  locator?: Record<string, unknown>;
  mimeType?: string;
  sizeBytes?: number;
  contentSha256?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowNodeMetadata extends Record<string, unknown> {
  description?: string;
  status?: string;
  /** 실행·검수 이력이 있는 실행 연결 여부(태스크 노드 헤더 아이콘) — 라이브 판정, 저장값은 참고용 */
  workConnected?: boolean;
  workName?: string;
  taskType?: 'procedural' | 'one_time';
  orderIndex?: number;
  containerNodeId?: string;
  dueDate?: string | null;
  progress?: number;
  totalTasks?: number;
  completedTasks?: number;
  sourceDeleted?: boolean;
  /** 작업 노드 — 아이콘·문구 판정용 유형(원본 행을 못 읽어도 모양이 유지된다) */
  actionType?: TaskActionType;
  /**
   * 작업 노드가 매달린 할 일 노드. 할 일 노드를 끌면 **같은 간격을 유지한 채 따라온다**
   * (2026-09-24 사용자 결정: 자리 기준 = 할 일 카드). 자리 자체는 다른 노드와 같은
   * 절대 좌표로 저장하고, 이 값은 «함께 움직일 대상»을 찾는 데만 쓴다.
   */
  hostTaskNodeId?: string;
  /** 작업 노드 — 실행 이력이 있는가(라이브 판정, 저장값은 참고용) */
  actionHasRun?: boolean;
  /** 작업 노드 — 같은 할 일 안에서 몇 번째인가(권장 순서). 1개뿐이면 없다 */
  actionStep?: number;
  noteColor?: 'amber' | 'blue' | 'green' | 'violet';
  headerColor?: WorkflowHeaderColor;
  width?: number;
  height?: number;
}

export interface TaskWorkflowNodeRecord {
  id: string;
  workflow_id: string;
  node_kind: WorkflowNodeKind;
  event_id: string | null;
  task_id: string | null;
  /** 작업 노드가 가리키는 `task_action` — 연결을 해제하면 FK CASCADE 로 이 행도 사라진다 */
  action_id: string | null;
  label: string;
  position_x: number;
  position_y: number;
  metadata: WorkflowNodeMetadata;
  created_at: string;
  updated_at: string;
}

export interface TaskWorkflowEdgeRecord {
  id: string;
  workflow_id: string;
  source_node_id: string;
  target_node_id: string;
  relation_type: WorkflowRelationType;
  label: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkflowNodeData extends Record<string, unknown> {
  kind: WorkflowNodeKind;
  entityId: string | null;
  label: string;
  metadata: WorkflowNodeMetadata;
}

export interface WorkflowEdgeData extends Record<string, unknown> {
  relationType: WorkflowRelationType;
}

export type WorkflowFlowNode = Node<WorkflowNodeData, 'workflowNode'>;
export type WorkflowFlowEdge = Edge<WorkflowEdgeData>;

export const WORKFLOW_HANDLE_IDS = {
  targetLeft: 'target-left',
  targetTop: 'target-top',
  sourceRight: 'source-right',
  sourceBottom: 'source-bottom',
} as const;

/**
 * 작업 노드의 핸들 좌표를 **선언한다** — 측정에 기대지 않는다.
 *
 * ⚠️ React Flow 는 핸들 좌표(`handleBounds`)를 노드 측정 과정에서만 모으고, `adoptUserNodes`
 * 는 노드 객체가 이전과 같은 참조가 아니면서 `measured` 가 없으면 그것을 **초기화한다**
 * (`node_modules/@xyflow/system` 의 `parseHandles`). 그러면 선이 **오류도 경고도 없이 사라진다**
 * (2026-09-24 에 두 번 겪었다). 크기가 고정이라 좌표를 아는 노드는 선언해 두는 편이 안전하다.
 * 노드를 만드는 두 곳(불러오기·새로 추가)이 함께 쓴다.
 */
export const ACTION_NODE_HANDLES = [
  {
    id: WORKFLOW_HANDLE_IDS.targetTop,
    type: 'target' as const,
    position: Position.Top,
    x: WORKFLOW_NODE_SIZE.action.width / 2,
    y: 0,
    width: 1,
    height: 1,
  },
  {
    id: WORKFLOW_HANDLE_IDS.targetLeft,
    type: 'target' as const,
    position: Position.Left,
    x: 0,
    y: WORKFLOW_NODE_SIZE.action.height / 2,
    width: 1,
    height: 1,
  },
  {
    id: WORKFLOW_HANDLE_IDS.sourceRight,
    type: 'source' as const,
    position: Position.Right,
    x: WORKFLOW_NODE_SIZE.action.width,
    y: WORKFLOW_NODE_SIZE.action.height / 2,
    width: 1,
    height: 1,
  },
];

/** 작업 노드에 매번 실어야 하는 것 — 크기·측정·핸들(위 주석 참고) */
export const ACTION_NODE_FLOW_PROPS = {
  width: WORKFLOW_NODE_SIZE.action.width,
  height: WORKFLOW_NODE_SIZE.action.height,
  measured: {
    width: WORKFLOW_NODE_SIZE.action.width,
    height: WORKFLOW_NODE_SIZE.action.height,
  },
  handles: ACTION_NODE_HANDLES,
};

export interface TaskWorkflowGraph {
  nodes: TaskWorkflowNodeRecord[];
  edges: TaskWorkflowEdgeRecord[];
}

export interface SaveTaskWorkflowGraphInput {
  workflowId: string;
  name: string;
  description: string | null;
  viewport: Viewport;
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
}

export interface UpdateTaskWorkflowInput {
  workflowId: string;
  name: string;
  departmentId: string | null;
  previousDepartmentId: string | null;
}

export const WORKFLOW_RELATION_META: Record<
  WorkflowRelationType,
  { label: string; color: string; dash?: string }
> = {
  flow: { label: '다음 흐름', color: '#64748b' },
  contains: { label: '포함 할 일', color: '#94a3b8', dash: '6 4' },
  depends_on: { label: '선행 필요', color: '#f59e0b' },
  handoff: { label: '할 일 인계', color: '#8b5cf6', dash: '8 3' },
  related: { label: '연관 할 일', color: '#0ea5e9', dash: '3 4' },
  action: { label: '작업', color: '#cbd5e1', dash: '4 4' },
};
