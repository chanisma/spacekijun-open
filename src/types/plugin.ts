// Plugin System Types

export interface Plugin {
  id: string;
  name: string;
  type: string;
  description?: string;
  icon?: string;
  config: Record<string, any>;
  permissions: {
    roles?: string[];
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 플러그인이 붙을 수 있는 대상. 라이브 `plugin_instances.entity_type` 실측값과 일치한다
 * (2026-09-15: collab_note 9행 · meeting 3행). 종전 선언에 있던 'note'/'task' 는
 * 코드에도 DB에도 0건인 유령 값이라 제거했다 — 붙일 대상을 늘릴 땐 여기만 고친다.
 */
export type PluginEntityType = 'meeting' | 'collab_note';

export interface PluginInstance {
  id: string;
  plugin_id: string;
  entity_type: PluginEntityType;
  entity_id: string;
  data: Record<string, any>;
  settings: Record<string, any>;
  created_by?: string;
  created_at: string;
  updated_at: string;
  plugin?: Plugin;
}

// Poll Plugin specific types
export interface PollData {
  question: string;
  options: PollOption[];
  settings?: {
    allowMultiple?: boolean;
    showResults?: boolean;
    allowChangeVote?: boolean;
    deadline?: string;
  };
}

export interface PollOption {
  id: string;
  text: string;
  votes?: number;
}

export interface PollVote {
  id: string;
  instance_id: string;
  option_id: string;
  user_id: string;
  created_at: string;
}

// Student Display Plugin specific types
export interface StudentDisplayData {
  students: string[]; // Array of student resource IDs
  displayFields: string[]; // Fields to display: 'name', 'class', 'number', etc.
}

// Random Picker Plugin specific types
export interface RandomPickerData {
  participants: Array<{
    id: string;
    name: string;
  }>;
  pickCount: number;
  selectedMembers: string[] | null; // Array of selected participant IDs
  selectedAt: string | null; // ISO8601 timestamp
}

// Checklist Plugin specific types
export interface ChecklistData {
  title: string;
  items: ChecklistItem[];
  settings?: {
    addPermission?: 'creator_only' | 'all';
    checkPermission?: 'creator_only' | 'all';
  };
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  checkedBy?: string;
  checkedAt?: string;
}

// Table Plugin specific types
export interface TablePluginData {
  title: string;
  columns: TableColumn[];
  rows: TableRow[];
  settings?: {
    addPermission?: 'creator_only' | 'all';
    deletePermission?: 'creator_only' | 'all';
    editPermission?: 'creator_only' | 'all';
  };
}

export interface TableColumn {
  id: string;
  name: string;
  type: 'text' | 'number' | 'checkbox';
}

export interface TableRow {
  id: string;
  cells: Record<string, string | number | boolean>;
}

// CsvViewer Plugin specific types
export type AggFn = 'first' | 'sum' | 'count' | 'avg' | 'min' | 'max';

export interface TableConfig {
  dimension: '1d' | '2d' | '3d';
  rowField?: string;       // 행 축 컬럼명 (2d/3d)
  colField?: string;       // 열 축 컬럼명 (2d/3d)
  valueField?: string;     // 값 컬럼명 (2d/3d)
  groupField?: string;     // 그룹 컬럼명 (3d only)
  aggregation?: AggFn;      // 2d/3d 셀 집계 방식 (기본: first)
  showSummary?: boolean;    // 1d 요약 행 표시 여부
  summaryFn?: AggFn;        // 1d 요약 행 집계 방식 (기본: sum)
  showColSummary?: boolean; // 2d 열 방향 요약 행 (표 하단)
  colSummaryFn?: AggFn;     // 2d 열 방향 요약 집계 방식
  showRowSummary?: boolean; // 2d 행 방향 요약 열 (표 우측)
  rowSummaryFn?: AggFn;     // 2d 행 방향 요약 집계 방식
}

export type CardAgg = AggFn | 'raw';

export interface CardFieldConfig {
  field: string;
  aggregations: CardAgg[];   // 복수 선택 가능: 'raw'=전체값, 나머지=집계
}

export interface CardConfig {
  groupField?: string;       // 이 컬럼 값으로 카드를 그룹화
  fields?: CardFieldConfig[]; // 표시할 필드 목록 (빈 배열=전체 표시)
}

export interface ViewerConfig {
  id: string;
  title: string;
  displayMode: 'table' | 'card';
  tableConfig?: TableConfig;
  cardConfig?: CardConfig;
}

export interface CsvViewerData {
  title: string;
  csvText: string;
  viewers: ViewerConfig[];   // 하나의 데이터에 여러 뷰어 설정
  settings?: {
    editPermission?: 'creator_only' | 'all';
  };
}

// Plugin Component Props
export interface PluginComponentProps {
  instance: PluginInstance;
  entityId: string;
  entityType: PluginEntityType;
  readonly?: boolean;
  onUpdate?: (data: any) => void;
}