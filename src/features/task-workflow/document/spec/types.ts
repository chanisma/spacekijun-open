// Action Spec v1 — 문서 유형 독립적 선언 스키마.
// 원칙: 특정 양식의 지식(라벨 문자열·더미 이름·행 수 등)은 엔진 코드가 아니라
// 스펙 인스턴스(JSON)에만 존재한다. 새 양식 = 새 스펙 데이터, 엔진은 불변.

export type LocatorKind = 'clickhere' | 'text' | 'cell' | 'cellRange' | 'rowGroup' | 'table';

export interface CellAddr {
  row: number;
  col: number;
}

export interface TableRef {
  /** 문서 등장 순서(중첩 포함, 0-base) */
  index: number;
  /** 헤더 행 텍스트 지문(검증·재바인딩용) */
  fingerprint?: string;
}

export interface Locator {
  kind: LocatorKind;
  /** 섹션 파일 인덱스(section0.xml=0). 생략 시 전 섹션 순차 탐색 */
  section?: number;
  /** clickhere: fieldBegin fieldid */
  fieldId?: string;
  /** text: 앵커 문자열(디코딩 텍스트 기준) */
  anchor?: string;
  /** text: n번째 매치(1-base, 기본 1) */
  occurrence?: number;
  /** text: 앵커 자체를 교체(replace) / 앵커 뒤 삽입(after) */
  position?: 'replace' | 'after';
  /** text: 여러 문단 블록 선택의 끝 앵커(시작 anchor~endAnchor 범위가 대상 구역) */
  endAnchor?: string;
  table?: TableRef;
  /** cell: 셀 주소. 중첩 표는 cellPath 사용 */
  addr?: CellAddr;
  cellPath?: CellAddr[];
  /** cellRange/rowGroup: 데이터 행 범위 [시작, 끝] (포함, 0-base) */
  rows?: [number, number];
  cols?: number[];
  headerRow?: number;
  /** rows 범위 안에서 건드리지 않을 행 */
  keepRows?: number[];
  /** 대상 현재 텍스트 지문(접두). 구조 주소 검증 + stale 검출용 */
  fingerprint?: string;
}

export type TargetKind =
  | 'scalar' | 'choice' | 'prose' | 'rowGroup' | 'tableGroup' | 'computed' | 'keep'
  | 'personTeacher' | 'personStudent';

/** 사람 이름 타깃 2종 — 계획 검토에서 명단(교직원/학생)을 검색해 고른다 */
export type PersonKind = 'personTeacher' | 'personStudent';

export function isPersonKind(kind: string): kind is PersonKind {
  return kind === 'personTeacher' || kind === 'personStudent';
}

export function personRoleOf(kind: PersonKind): 'teacher' | 'student' {
  return kind === 'personTeacher' ? 'teacher' : 'student';
}

/** 이름 사이 기본 구분자 */
export const PERSON_NAME_SEPARATOR = ', ';

/**
 * 이름 목록 ↔ 문자열.
 *
 * **plan에는 배열이 아니라 "이미 이어 붙인 문자열"을 담는다**(2026-08-22). 그래야
 * ①`fillProseTargets`의 형제 값(배열·객체는 건너뛴다)에 그대로 실려 AI 서술이 이름을
 * 참조하고 ②계획 분할 생성이 배열마다 호출을 따로 잡는 낭비를 피하며 ③채움 엔진이
 * 스칼라와 같은 경로로 기록한다.
 *
 * 저장은 항상 기본 구분자로 정규화하고, 문서에 찍을 구분자는 채움 시 스펙(`separator`)이
 * 정한다 — 저장 형식과 표시 형식을 분리해야 스펙을 고쳐도 기존 값이 따라온다.
 */
export function splitPersonNames(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value.split(/[,·、]/).map((s) => s.trim()).filter(Boolean);
}

export function joinPersonNames(names: string[], separator: string = PERSON_NAME_SEPARATOR): string {
  return names.join(separator);
}

export interface TargetBase {
  id: string;
  kind: TargetKind;
  locator: Locator;
  label?: string;
  /** label이 시스템 추정(탐지 휴리스틱·자리표시)임을 표시 — AI 보완이 교체 가능, 사람이 수정하면 해제 */
  autoLabel?: boolean;
  /** 문서 내 MEMO 등에서 추출·병합된 작성 지침 */
  instruction?: string;
  required?: boolean;
  /** detect가 제안했고 사람 확정이 필요한 상태 */
  confirmRequired?: boolean;
  /** detect 근거(사람 검수용) */
  evidence?: string;
  /** 어느 탐지 기준이 제안했는지(카테고리 필터용). 사용자 지정은 미설정 */
  detector?: string;
}

export interface ScalarTarget extends TargetBase {
  kind: 'scalar';
  valueType?: 'text' | 'number' | 'date' | 'phone';
  /** 값 출처 참조(예: "plan.schoolName", "knowledge.teacher.name") */
  source?: string;
  /** 삽입 틀. "{}"가 값 위치. 예: anchor "(     )학급" → template "({})학급" */
  template?: string;
}

/**
 * 사람 이름 타깃 — 값은 명단에서 고른 이름들을 이은 문자열이라 기록은 scalar와 동일하다.
 * kind가 교사/학생을 가르는 이유는 계획 검토 폼이 그걸로 검색 대상 명단을 정하기 때문이다
 * (그래서 별도 필드 없이 kind만 바꾸면 대상이 바뀐다).
 */
export interface PersonTarget extends TargetBase {
  kind: PersonKind;
  /** 값 출처 참조(예: "plan.attendees"). 생략 시 타깃 id가 곧 plan 키 */
  source?: string;
  /** 이름 사이 구분자(기본 ", ") */
  separator?: string;
  /** 삽입 틀. "{}"가 값 위치. 예: template "참석: {}" */
  template?: string;
}

export interface ChoiceOption {
  label: string;
  value?: string | number;
}

export interface ChoiceTarget extends TargetBase {
  kind: 'choice';
  options: ChoiceOption[];
  /** 마크 문자쌍. 기본 □/■ */
  mark?: { unchecked: string; checked: string };
  /** 선택 결정 참조(값 또는 라벨). 예: "plan.amount" */
  select?: string;
  exclusive?: boolean;
}

export interface ProseTarget extends TargetBase {
  kind: 'prose';
  /** 유지할 골격 줄(있으면 골격 사이 내용만 생성) */
  scaffold?: string[];
  /** plan에서 근거로 쓸 키들 */
  sources?: string[];
  length?: string;
}

export interface RowGroupColumn {
  col: number;
  kind: 'scalar' | 'computed' | 'prose' | 'keep';
  /** 행 객체 필드 참조(예: "row.name") */
  source?: string;
  formula?: string;
  instruction?: string;
}

export interface RowGroupTarget extends TargetBase {
  kind: 'rowGroup';
  /** 선택 영역 전체를 반복(기본). row는 기존 연번 목록의 단일 행 대체용. */
  repeatUnit?: 'block' | 'row';
  /** 기존 예시를 대체할 구간. 미설정한 한 행 선택은 같은 구조의 인접 예시 구간을 해석한다. */
  replaceRows?: [number, number];
  /** 최하위 행 데이터 출처. block에서는 선택 구간 행 수의 배수로 묶인다. 예: "plan.items" */
  rowSource: string;
  /** 복제 원본 행(locator.rows 내 0-base 상대 인덱스, 기본 0) */
  rowTemplate?: number;
  rowSchema: RowGroupColumn[];
  minRows?: number;
  maxRows?: number;
}

export interface TableGroupCell {
  /** 표 안의 셀 주소(병합 셀도 주소를 하나 차지하므로 그대로 통한다) */
  addr: CellAddr;
  kind?: 'scalar' | 'prose';
  /** 항목 객체 필드 참조(예: "row.task") */
  source?: string;
  instruction?: string;
}

/**
 * 표 자체를 항목 수만큼 복제하는 타깃.
 *
 * rowGroup은 표 **안의 행**을 복제한다. 반면 "행 수가 고정된 표를 N개 만들어야 하는"
 * 양식(예: 수행평가 세부기준 — 수행평가 종류마다 같은 서식의 표 1개)은 표를 감싼 문단째
 * 복제해야 한다. 행 수가 고정이라 행 복제·rowCnt 재계산이 필요 없고, 병합 셀도
 * `hp:cellAddr` 주소를 하나 차지할 뿐이라 `(row,col)` 지정이 그대로 통한다.
 *
 * **범위 밖**: 항목마다 행 수가 달라지는 표에는 쓸 수 없다(예: 평가 요소를 2개에서
 * 3개로 늘리려면 4×2 병합을 쪼개야 한다). 그런 경우는 rowGroup을 표 안에 중첩하는
 * 방향이 맞다.
 */
export interface TableGroupTarget extends TargetBase {
  kind: 'tableGroup';
  /** 표 데이터 출처(plan의 배열 키). 예: "plan.perfAssessments" */
  rowSource: string;
  /**
   * 표를 감싼 문단 안, **표 앞 런**에 있는 소제목. 셀이 아니라서 절대 위치 locator로는
   * N번째 복제본을 가리킬 수 없다 — 그래서 타깃의 필드로 둔다.
   * `anchor`는 원본 양식에 적힌 소제목(복제본마다 이 문자열을 값으로 치환).
   */
  caption?: { anchor: string; source: string };
  cellSchema: TableGroupCell[];
  minItems?: number;
  maxItems?: number;
}

export interface ComputedTarget extends TargetBase {
  kind: 'computed';
  /** 화이트리스트 식 언어(formula.ts). eval 금지 */
  formula: string;
  format?: 'number' | 'currency' | 'text';
}

export interface KeepTarget extends TargetBase {
  kind: 'keep';
  note?: string;
}

export type Target =
  | ScalarTarget
  | PersonTarget
  | ChoiceTarget
  | ProseTarget
  | RowGroupTarget
  | TableGroupTarget
  | ComputedTarget
  | KeepTarget;

export type Constraint =
  | { kind: 'equals'; a: string; b: string; message?: string }
  | { kind: 'sum-equals'; of: string; equals: string; message?: string }
  | { kind: 'percent-sum'; of: string; equals: number; message?: string }
  | { kind: 'subset'; of: string; in: string; message?: string }
  | { kind: 'exactly-one'; target: string; message?: string }
  /** @deprecated 잔여물 검사 폐지(2026-09-03). verify가 읽지 않는다 — 저장된 스펙 파싱 호환용 */
  | { kind: 'no-residual'; patterns: string[]; message?: string }
  | { kind: 'all-required-filled'; message?: string };

export type KnowledgeOrigin =
  | { type: 'db'; table: string; select?: string; params?: Record<string, unknown> }
  | { type: 'user-input'; prompt?: string }
  | { type: 'static'; value: unknown };

export interface KnowledgeSource {
  key: string;
  source: KnowledgeOrigin;
  required?: boolean;
}

export interface WorkSpec {
  specVersion: 1;
  documentType: string;
  instruction?: string;
  knowledge?: KnowledgeSource[];
  targets: Target[];
  constraints?: Constraint[];
  /**
   * @deprecated 잔여물 검사 폐지(2026-09-03) — **verify가 읽지 않고 detect가 채우지도 않는다.**
   *
   * 패턴은 사람이 적은 것이 아니라 자동 시드된 추측이었고, 라이브 양식에서 그 문서의
   * 정상 내용(`시스코`·`08:00~22:00`)을 잡고 있었다. 원본 텍스트를 내용으로 쓰지 않기로 한
   * 뒤에는 맞는 문서를 fail 로 보고한다. 저장된 스펙에 남은 값이 파싱되도록 필드만 유지한다.
   */
  residualPatterns?: string[];
  /**
   * 계획 검토의 "어떤 문서를 만들지 설명해 주세요" 입력에 보여 줄 **예시 문구**
   * (여러 줄 가능, 2026-09-02).
   *
   * **양식마다 달라야 하는 값이라 스펙이 소유한다.** 러너에 하드코딩된 예시("1학년 정보
   * 수업…")는 어떤 양식에서든 같은 문장을 보여 줘, 실제로 무엇을 적어야 하는지 알려 주지
   * 못했다. 이 입력의 분량·구체성이 곧 생성 품질이므로 예시가 곧 기능이다.
   *
   * 비어 있으면 러너의 범용 기본 예시로 폴백한다 — 스펙에 없다고 입력칸이 비어 보이면 안 된다.
   */
  contextExample?: string;
}

/** 문서 1부의 공유 결정. 스키마는 스펙에서 유도된다(planSchema.ts) */
export type Plan = Record<string, unknown>;

export interface FillReportItem {
  targetId: string;
  status: 'filled' | 'kept' | 'skipped' | 'stale' | 'error';
  detail?: string;
}

export interface CheckResult {
  key: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

/** 섹션 XML 문자열 배열(문서 순서) — 엔진의 입출력 단위 */
export interface SectionFiles {
  sections: string[];
}
