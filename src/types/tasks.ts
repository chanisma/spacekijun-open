// ========================================
// Task Management System Types
// TypeScript interfaces for task management
// ========================================

// File management interface
export interface TaskFile {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
  uploaded_at: string;
  uploaded_by: string;
  category?: 'template' | 'attachment'; // 템플릿/양식 파일 vs 일반 첨부 파일 구분
  isGoogleDrive?: boolean;
  googleDriveId?: string;
  editUrl?: string;
  meta?: Record<string, any>;
}

export interface Work {
  id: string;
  name: string;
  description?: string;
  // manager_id: string; // deprecated - moved to meta.managers
  manager_name: string; // deprecated - managers info in meta.managers
  /** 'pending' = 대기(시작 전) — 내 업무 관리의 [대기] 버튼이 쓴다. 타입에서 빠져 있어 대응표들이 대기를 몰랐다(2026-10-05) */
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  keywords: string[];
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  progress_percentage: number;
  tasks?: Task[]; // Optional tasks array for detail views
  meta: Record<string, any> & {
    managers?: Array<{ id: string; name: string }>;
    department?: string;
    year?: number;
    files?: TaskFile[];
  };
  created_at: string;
  updated_at: string;
}

// New JSONB-based assignee structure (simplified array format)
export interface TaskAssigneeJsonb {
  id: string;
  name?: string; // Optional - Added after 2025-09-30 migration
  status: 'pending' | 'completed' | 'cancelled';
  completed_at?: string | null;
  assigned_at: string;
}

export interface TaskAssigneeWithDetails extends TaskAssigneeJsonb {
  name: string;
  type: 'teacher' | 'student' | 'classroom' | 'device' | 'group';
}

export interface TaskCompletionStats {
  total: number;
  completed: number;
  pending: number;
  completion_percentage: number;
}

// Legacy interfaces (for backward compatibility)
export interface TaskAssignee {
  id: string;
  name: string;
  type: 'teacher' | 'student' | 'classroom' | 'device' | 'group';
  status?: 'pending' | 'completed' | 'cancelled';
  completed_at?: string;
}

export interface TaskCompletionProgress {
  total_assignees: number;
  completed_assignees: number;
  pending_assignees: number;
  completion_percentage: number;
}

/** 회차별 완료 기록(다중 마감 할 일) — 담당자 전체 상태는 "모든 회차 완료"로 파생 */
export type TaskDeadlineProgress = Record<
  string,
  Record<string, { status: 'pending' | 'completed'; completed_at?: string | null }>
>;

export interface Task {
  id: string;
  event_id: string;
  title: string;
  description?: string;
  type: 'procedural' | 'one_time';
  order_index: number;
  // Legacy fields (deprecated - will be removed)
  assigned_to?: string;
  assigned_name?: string;
  assignees?: TaskAssignee[];
  assignees_jsonb?: TaskAssigneeJsonb[];
  status: 'pending' | 'completed' | 'cancelled';
  due_date?: string;
  keywords: string[];
  meta: Record<string, any> & {
    files?: TaskFile[];
    assignees?: TaskAssigneeJsonb[]; // Primary assignee storage since 2025-09-30
    assignmentIssues?: Record<string, { reason: string; reportedAt: string }>;
    /**
     * 작업 순서(2026-09-23) — 작업 연결 id 와 'submission'(제출 받기)의 권장 순서. 강제하지 않는다.
     * 단일 출처 = src/features/task-workflow/utils/actionFlow.ts
     */
    actionFlow?: string[];
    /**
     * 이 할 일이 «무엇을 남기는가»(2026-09-27, 업무 진행 화면). 단일 출처 = src/lib/workPipeline.ts
     * 사람이 남긴 값은 여기가 아니라 task_output_value 표에 있다(스냅샷·RPC 전용 쓰기).
     */
    output?: { kind: 'signal' | 'value' | 'people' | 'table' | 'spec_document' | 'file'; label?: string };
    /** 다중 마감 일정(YYYY-MM-DD, 정렬, 2회 이상일 때만 존재) — due_date는 다음 마감으로 동기화 */
    deadlines?: string[];
    /**
     * 담당자에게 보이는 날(YYYY-MM-DD, 한국 날짜) — 그 전에는 담당자의 내 할 일·홈에 오지 않는다(2026-10-05,
     * 업무 「대기」를 대신함). 판정 = src/lib/taskVisibility.ts, 서버 = get_my_tasks_jsonb. null = 바로 보임
     */
    visibleFrom?: string | null;
    /** 회차별 완료 기록: {마감일: {담당자id: {status, completed_at}}} — set_task_deadline_status RPC 경유 */
    deadlineProgress?: TaskDeadlineProgress;
    /**
     * 파일 제출 할 일 — 담당자의 완료 조건이 '체크'가 아니라 '파일 제출'이 된다.
     * 제출물 자체는 task.meta가 아니라 task_submission 테이블에 담긴다(동시 제출 유실 방지 +
     * 담당자별 열람 권한을 RLS로 강제). 다중 마감(deadlines 2개 이상)과는 함께 쓸 수 없다.
     */
    submission?: {
      required?: boolean;
      /** 제출 안내 문구(무엇을 어떤 형식으로 낼지) — 제출 화면에 그대로 노출 */
      guide?: string;
      /**
       * 제출 방식(2026-09-03). 없으면 `'file'`(기존 데이터 호환).
       * - `file`: 담당자가 파일을 올린다(Google 드라이브)
       * - `spec`: 담당자가 **양식에 값을 채워** 낸다 — 파일이 아니라 값이 저장되므로
       *   언제든 다시 파일로 만들 수 있고 DB에서 바로 분석할 수 있다
       *
       * **할 일당 한 방식만** — 서버 RPC 양쪽이 다른 kind 를 0A000 으로 거부한다.
       * 섞이면 매니저 현황·"표로 보기"·분석 뷰가 이종 행을 섞어 의미를 잃는다.
       */
      mode?: 'file' | 'spec' | 'spreadsheet' | 'physical';
      columns?: { key: string; label: string }[];
      /**
       * physical 모드(2026-10-01): 매니저가 첨부한 **제출 양식** — 담당자가 내려받아 작성한 뒤
       * 실물로 낸다. 파일은 **구글 공용 드라이브**에 있다(`uploadSubmissionFormToDrive`).
       * 일반 첨부(`meta.files`)와 따로 둔다(서류함에 등록하지 않는다).
       */
      forms?: TaskFile[];
      visibility?: 'own' | 'all';
      /** spec 모드: 담당자들이 공유 실행할 매니저 소유 `task_action`(action_type='document.spec_fill') */
      actionId?: string;
      /**
       * spec 모드: 표시·진입용 양식 사본. **정본은 `task_action.config.defaultTemplate`**(러너가 읽는 값).
       * `familyId` 는 양식 새 버전이 등록돼 핀한 id 가 보관본이 됐을 때 현재 버전을 되찾는 데 쓴다.
       */
      template?: { id: string; name?: string | null; familyId?: string | null };
    };
  };
  completion_progress?: TaskCompletionProgress; // Legacy completion progress
  created_by?: string; // Resource ID of task creator (for permission checks)
  created_at: string;
  updated_at: string;
  event_name?: string;
  /**
   * 할 일이 든 업무의 상태 — get_my_tasks_jsonb 의 담당·매니저 목록에만 실린다(2026-10-05).
   * 완료된 업무의 할 일은 그 RPC 가 status 를 'completed' 로 싣고 원래 값을 task_status 에 둔다.
   */
  event_status?: string;
  task_status?: string;
}

/**
 * 담당자가 할 일에 제출한 파일 1건 (task_submission 테이블).
 * 파일 실체는 Google 공용 드라이브에 있고 여기에는 링크·메타만 담는다.
 * 열람 범위는 RLS가 정한다 — 본인 제출물 + 업무 매니저 + admin.
 */
export interface TaskSubmission {
  id: string;
  task_id: string;
  assignee_resource_id: string;
  submitted_by: string;
  /**
   * 제출 방식(2026-09-03). `'file'` = 드라이브 파일, `'spec'` = 값 문서(`spec_document_id`).
   * 기존 행은 마이그레이션 기본값으로 `'file'`.
   */
  kind: 'file' | 'spec' | 'spreadsheet' | 'physical';
  spreadsheet_data?: { columns: { key: string; label: string }[]; rows: string[][] } | null;
  /** kind='spec' 일 때 제출된 값 문서(`task_action_document.id`) */
  spec_document_id?: string | null;
  /** 표시용 이름 — 파일 제출은 파일명, 값 제출은 문서 제목 */
  file_name: string;
  /** 값 제출은 파일이 없어 null (CHECK 제약이 kind 별 모양을 강제한다) */
  file_url: string | null;
  edit_url?: string | null;
  google_drive_id?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  meta?: Record<string, unknown> | null;
  /** 과제 단위 할 일의 제출이면 어느 단위(task.meta.units[].key)인지 (2026-08-12) */
  unit_key?: string | null;
  created_at: string;
}

export interface TaskStatusHistory {
  id: string;
  task_id: string;
  changed_by: string;
  old_status?: string;
  new_status: string;
  comment?: string;
  changed_at: string;
}

export interface SearchResult {
  type: 'event' | 'task';
  id: string;
  title: string;
  description?: string;
  status: string;
  keywords: string[];
  relevance: number;
  context: Record<string, any>;
}

export interface TaskAnalytics {
  keyword: string;
  event_count: number;
  task_count: number;
  total_tasks: number;
  completed_tasks: number;
  avg_completion_rate: number;
}

export interface DuplicateTaskAnalysis {
  keyword: string;
  similar_tasks: any[];
  duplicate_count: number;
  consolidation_potential: string;
}

// API Request/Response Types
export interface WorkFilters {
  status?: 'active' | 'completed' | 'cancelled';
  manager_id?: string; // deprecated - use manager_ids instead
  manager_ids?: string[]; // for filtering by multiple managers
  keyword?: string;
  limit?: number;
  offset?: number;
}

export interface CreateWorkRequest {
  name: string;
  description?: string;
  manager_id?: string; // deprecated - use meta.managers instead
  managers?: Array<{ id: string; name: string }>; // new managers field
  keywords?: string[];
  meta?: Record<string, any>;
  initial_tasks?: CreateTaskRequest[];
}

export interface UpdateWorkRequest {
  name?: string;
  description?: string;
  manager_id?: string; // deprecated - use managers instead
  managers?: Array<{ id: string; name: string }>; // new managers field
  status?: 'active' | 'completed' | 'cancelled';
  keywords?: string[];
  meta?: Record<string, any>;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  type: 'procedural' | 'one_time';
  order_index?: number;
  // Legacy fields (deprecated)
  assigned_to?: string;
  due_date?: string;
  keywords?: string[];
  meta?: Record<string, any> & {
    assignees?: TaskAssigneeJsonb[]; // Primary assignee storage
  };
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  type?: 'procedural' | 'one_time';
  order_index?: number;
  // Legacy fields (deprecated)
  assigned_to?: string;
  status?: 'pending' | 'completed' | 'cancelled';
  due_date?: string;
  keywords?: string[];
  meta?: Record<string, any> & {
    assignees?: TaskAssigneeJsonb[]; // Primary assignee storage
  };
}

export interface SearchFilters {
  user_id?: string;
  status?: string[];
  type?: 'event' | 'task' | 'all';
  date_range?: {
    start: string;
    end: string;
  };
  keywords?: string[];
}

// Component Props Types
export interface WorkCardProps {
  work: Work;
  onSelect: (work: Work) => void;
  onEdit?: (work: Work) => void;
  onDelete?: (work: Work) => void;
  onViewDetail?: (work: Work) => void;
}

export interface TaskItemProps {
  task: Task;
  showConnector?: boolean;
  onStatusChange: (taskId: string, newStatus: string) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}

export interface TaskListProps {
  tasks: Task[];
  type?: 'all' | 'procedural' | 'one_time';
  onStatusChange: (taskId: string, newStatus: string) => void;
  onTaskEdit?: (task: Task) => void;
  onTaskDelete?: (task: Task) => void;
}

export interface TaskSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResultSelect?: (result: SearchResult) => void;
  initialQuery?: string;
}

export interface WorkCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (work: Work) => void;
}


// Utility Types
export type TaskStatus = Task['status'];
export type WorkStatus = Work['status'];
export type TaskType = Task['type'];

export interface TaskSummary {
  total: number;
  pending: number;
  completed: number;
  overdue: number;
  urgent: number;
}

export interface WorkDetail extends Work {
  tasks: Task[];
}

export interface MyTasksResponse {
  assigned_tasks: Task[];
  managed_tasks: Task[];
  urgent_tasks: Task[];
  summary: TaskSummary;
}

// Permissions
export interface TaskPermissions {
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_change_status: boolean;
  can_assign: boolean;
  can_manage_event: boolean;
}

// Resource Type (from existing system)
export interface Resource {
  id: string;
  type: 'teacher' | 'student' | 'classroom' | 'device' | 'group';
  name: string;
  meta: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Form Validation Schemas (for Zod)
export interface WorkFormData {
  name: string;
  description: string;
  manager_id?: string | string[]; // deprecated - use manager_ids instead
  manager_ids?: string[]; // UI에서 사용하는 관리자 ID 배열
  managers?: Array<{ id: string; name: string }>; // 최종 저장용 관리자 정보
  keywords: string[];
  department?: string;
  initial_tasks: {
    title: string;
    description: string;
    type: 'procedural' | 'one_time';
    order_index?: number;
    assigned_to?: string;
    due_date?: string;
    keywords: string[];
    /** 문서 분석 초안의 출처(documentAnalysisId·documentAnalysisCandidateId) */
    meta?: Record<string, unknown>;
  }[];
}

export interface TaskFormData {
  title: string;
  description: string;
  type: 'procedural' | 'one_time';
  assigned_to?: string; // 기존 호환성을 위해 유지 (deprecated)
  due_date?: string;
  keywords: string[];
  meta: {
    assignees?: TaskAssigneeJsonb[]; // 다중 담당자 관리 (primary storage)
    document_number?: string;
    priority?: 'low' | 'medium' | 'high';
    estimated_hours?: number;
  };
}
