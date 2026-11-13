import type {
  TaskActionExecutionMode,
  TaskActionType,
  TaskActionVerificationMode,
} from './types';

export interface TaskActionDefinition {
  type: TaskActionType;
  handlerVersion: number;
  title: string;
  description: string;
  /** 연결 카탈로그 그룹 — 라벨은 TASK_ACTION_CATEGORY_META */
  category: 'data_import' | 'admin' | 'neis' | 'document' | 'collect' | 'submit' | 'message' | 'signature';
  /** 그룹 내 세부 구분(feature 단위) — 없으면 메인 카테고리 직속 표시 */
  subcategory?: string;
  /**
   * runner=전용 실행 UI, embed=기능의 실제 등록 모달을 러너 안에서 열어 완료를 기록,
   * link=전용 모달이 없는 기능의 화면 바로가기+수동 완료 기록,
   * external=앱 밖 시스템(나이스)의 어느 화면에서 무엇을 할지 안내+수동 완료 기록.
   *   link 와 달리 **가리키는 대상이 유형이 아니라 설정값(config)에 있다** — 화면이
   *   1,384개라 화면마다 유형을 만들 수 없다(`src/lib/neisScreens.ts`).
   */
  kind: 'runner' | 'embed' | 'link' | 'external';
  /** 참조 화면 경로(link의 이동 대상, embed·runner의 보조 바로가기) */
  route?: string;
  executionMode: TaskActionExecutionMode;
  verificationMode: TaskActionVerificationMode;
  /** admin 전용 여부(기본: 교사·admin) */
  adminOnly?: boolean;
  /** 연결 모달에서 숨김(폐기 예정 유형 — 기존 연결 행 호환용으로만 유지) */
  hidden?: boolean;
  /**
   * 한 할 일에 여러 개 둘 수 있다(2026-09-23 — 작업 하나 = 과정 하나). 연결마다 고유
   * `instance_key` 를 받는다(마이그레이션 20260923120000). 없으면 사람·할 일·유형당 하나.
   */
  multiple?: boolean;
}

export const TASK_ACTION_CATEGORY_META: Record<
  TaskActionDefinition['category'],
  { label: string; description: string }
> = {
  data_import: {
    label: 'SPACEKIJUN 기능 연결',
    description: '데이터베이스를 구축하는 앱 기능과 할 일을 연결합니다.',
  },
  admin: {
    label: '행정 할 일 연결',
    description: '발급·일정·공지 등 행정 처리 기능과 할 일을 연결합니다.',
  },
  neis: {
    label: '앱 밖에서 처리',
    description:
      '나이스·에듀파인처럼 다른 시스템에서 사람이 처리하는 일입니다. 어디서 무엇을 하는지 가리키고 완료를 기록합니다.',
  },
  collect: {
    label: '입력 받기',
    description: '정해진 교직원에게서 값을 받아 표로 모읍니다. 대상은 학년·과목·담임·부서·업무분장으로 고릅니다.',
  },
  submit: {
    label: '제출 받기',
    description: '정해진 사람에게서 결과물(파일·양식 문서·실물)을 받습니다. 대상 중 할 일 담당자는 내면 완료됩니다.',
  },
  message: {
    label: '메시지 보내기',
    description: '정해진 교직원에게 SPACEKIJUN 알림으로 메시지를 보내고, 쿨메신저로 보낼 본문·받는 사람을 복사합니다.',
  },
  signature: {
    label: '서명 받기',
    description: '전자서명(임의 문서)과 연수 참석 서명(일정 명단)은 서로 다른 시스템입니다.',
  },
  document: {
    label: '문서 작성',
    description: 'HWPX 문서를 생성·수정하는 실행형 작업입니다.',
  },
};

/**
 * 연결 목록에 카테고리를 세우는 순서 — **단일 출처**.
 * 종전엔 연결 모달과 캔버스 선택기가 각자 배열을 들고 있어서, 새 카테고리를 한쪽에만 넣으면
 * 다른 쪽에서 **조용히 사라졌다**(오류가 나지 않는다). 목록에 없는 카테고리도 마찬가지다.
 */
export const TASK_ACTION_CATEGORY_ORDER: Array<TaskActionDefinition['category']> = [
  'data_import', 'admin', 'neis', 'collect', 'submit', 'message', 'signature', 'document',
];

const link = (
  type: TaskActionType,
  title: string,
  description: string,
  category: TaskActionDefinition['category'],
  route: string,
  subcategory?: string,
): TaskActionDefinition => ({
  type, title, description, category, route, subcategory,
  handlerVersion: 1, kind: 'link',
  executionMode: 'manual', verificationMode: 'human_review',
});

const embed = (
  type: TaskActionType,
  title: string,
  description: string,
  category: TaskActionDefinition['category'],
  route: string,
  subcategory?: string,
): TaskActionDefinition => ({
  type, title, description, category, route, subcategory,
  handlerVersion: 1, kind: 'embed',
  executionMode: 'assisted', verificationMode: 'human_review',
});

export const TASK_ACTION_REGISTRY: Record<TaskActionType, TaskActionDefinition> = {
  // ── SPACEKIJUN 기능 연결(데이터 구축) ──
  'evalearn.mock_marking_import': {
    type: 'evalearn.mock_marking_import',
    handlerVersion: 1,
    title: '모의고사 마킹 및 정오 데이터 등록',
    description:
      '마킹현황 CSV를 학생과 대조해 모의고사 분석 데이터에 반영하고 결과를 검수합니다.',
    category: 'data_import',
    subcategory: '모의고사 분석(evalearn)',
    kind: 'embed',
    executionMode: 'assisted',
    verificationMode: 'human_review',
    adminOnly: true,
  },
  'link.evalog_import': {
    ...embed(
      'link.evalog_import', '생기부·성적 데이터 등록',
      'evalog 관리자 화면을 열어 기초 자료·상세 활동 데이터를 업로드합니다(업로드 성공 시 자동 기록).',
      'data_import', '/evalog', '학생 기록(evalog)',
    ),
    adminOnly: true,
  },
  'link.neis_schedule_import': {
    ...embed(
      'link.neis_schedule_import', 'NEIS 학사일정 가져오기',
      '나이스에서 현재 학년도 학사일정을 가져와 스케줄에 반영합니다(기존 NEIS 일정 교체).',
      'data_import', '/schedule', '학사 데이터',
    ),
    adminOnly: true,
  },
  // 학사 xlsx 5종으로 세분화되어 폐기 — 기존 연결 행 호환용으로만 유지(모달 숨김)
  'link.timetable_data': {
    ...link(
      'link.timetable_data', '시간표 데이터 등록(구)',
      '학사 xlsx 업로드 5종으로 대체되었습니다.',
      'data_import', '/timetable', '학사 데이터',
    ),
    adminOnly: true,
    hidden: true,
  },
  'evalearn.mock_exam_import': {
    ...embed(
      'evalearn.mock_exam_import', '모의고사 성적 등록',
      '모의고사 성적 엑셀(다건)을 업로드해 분석 데이터를 구축합니다.',
      'data_import', '/evalearn', '모의고사 분석(evalearn)',
    ),
    adminOnly: true,
  },
  'evalearn.grade_analysis_import': {
    ...embed(
      'evalearn.grade_analysis_import', '학년 성적분석 파일 등록',
      '학년별 성적분석 리포트 파일을 업로드합니다.',
      'data_import', '/evalearn', '모의고사 분석(evalearn)',
    ),
    adminOnly: true,
  },
  'link.curriculum_upload': {
    ...embed(
      'link.curriculum_upload', '교육과정 편제 업로드',
      '학교교육과정 편제 xlsx를 업로드해 school_curriculum을 구축합니다.',
      'data_import', '/admin?tab=curriculum', '학사 데이터',
    ),
    adminOnly: true,
  },
  'link.course_offering_upload': {
    ...embed(
      'link.course_offering_upload', '강좌 개설 업로드',
      '강좌개설 xlsx를 업로드해 course_offering을 구축합니다.',
      'data_import', '/admin?tab=offerings', '학사 데이터',
    ),
    adminOnly: true,
  },
  'link.enrollment_upload': {
    ...embed(
      'link.enrollment_upload', '수강 등록 업로드',
      '수강등록 xlsx를 업로드해 student_enrollment를 구축합니다.',
      'data_import', '/admin?tab=enrollments', '학사 데이터',
    ),
    adminOnly: true,
  },
  'link.student_timetable_upload': {
    ...embed(
      'link.student_timetable_upload', '학생 시간표 업로드',
      '학생 시간표 xlsx를 업로드해 student_timetable을 구축합니다.',
      'data_import', '/admin?tab=timetables', '학사 데이터',
    ),
    adminOnly: true,
  },
  'link.teacher_timetable_upload': {
    ...embed(
      'link.teacher_timetable_upload', '교사 시간표 업로드',
      '교사 시간표 xlsx를 업로드해 teacher_timetable과 수업 배정을 구축합니다.',
      'data_import', '/admin?tab=teacher-timetables', '학사 데이터',
    ),
    adminOnly: true,
  },
  'link.account_excel': {
    ...embed(
      'link.account_excel', '계정 엑셀 일괄 등록',
      '교사 외부 서비스 계정을 엑셀로 일괄 등록합니다.',
      'data_import', '/admin?tab=accounts', '학교 관리(Admin)',
    ),
    adminOnly: true,
  },
  'link.resource_csv': {
    ...embed(
      'link.resource_csv', '수업데이터 CSV 가져오기',
      '교사 수업 배정(meta.section) 데이터를 CSV로 가져옵니다.',
      'data_import', '/admin?tab=resources', '학교 관리(Admin)',
    ),
    adminOnly: true,
  },
  'link.timetable_csv': {
    ...embed(
      'link.timetable_csv', '시간표 CSV 교사 일괄 추가',
      '시간표 CSV로 교사 리소스를 일괄 추가합니다.',
      'data_import', '/admin?tab=resources', '학교 관리(Admin)',
    ),
    adminOnly: true,
  },
  'link.admin_users': {
    ...embed(
      'link.admin_users', '사용자 관리',
      '사용자 계정을 관리합니다(지속 관리 화면 — 완료는 직접 기록).',
      'data_import', '/admin?tab=users', '학교 관리(Admin)',
    ),
    adminOnly: true,
  },
  'link.admin_teachers': {
    ...embed(
      'link.admin_teachers', '교사 관리',
      '교사 리소스·배정을 관리합니다(지속 관리 화면 — 완료는 직접 기록).',
      'data_import', '/admin?tab=teachers', '학교 관리(Admin)',
    ),
    adminOnly: true,
  },
  'link.admin_resources': {
    ...embed(
      'link.admin_resources', '리소스 관리',
      '교사·교실·기기 리소스를 관리합니다(지속 관리 화면 — 완료는 직접 기록).',
      'data_import', '/admin?tab=resources', '학교 관리(Admin)',
    ),
    adminOnly: true,
  },
  'link.admin_accounts': {
    ...embed(
      'link.admin_accounts', '계정 관리',
      '교사 외부 서비스 계정을 관리합니다(지속 관리 화면 — 완료는 직접 기록).',
      'data_import', '/admin?tab=accounts', '학교 관리(Admin)',
    ),
    adminOnly: true,
  },
  'link.admin_sections': {
    ...embed(
      'link.admin_sections', '분반(섹션) 관리',
      '과목 분반을 관리합니다(지속 관리 화면 — 완료는 직접 기록).',
      'data_import', '/admin?tab=sections', '학교 관리(Admin)',
    ),
    adminOnly: true,
  },
  'link.admin_students': {
    ...embed(
      'link.admin_students', '학생 학적 관리',
      '학생 학적·졸업 처리를 관리합니다(지속 관리 화면 — 완료는 직접 기록).',
      'data_import', '/admin?tab=students', '학교 관리(Admin)',
    ),
    adminOnly: true,
  },
  'link.admin_departments': {
    ...embed(
      'link.admin_departments', '부서 관리',
      '부서와 부서원을 관리합니다(지속 관리 화면 — 완료는 직접 기록).',
      'data_import', '/admin?tab=departments', '학교 관리(Admin)',
    ),
    adminOnly: true,
  },
  'link.admin_tags': {
    ...embed(
      'link.admin_tags', '태그 관리',
      '리소스 태그(담임·부장·역할)를 관리합니다(지속 관리 화면 — 완료는 직접 기록).',
      'data_import', '/admin?tab=tags', '학교 관리(Admin)',
    ),
    adminOnly: true,
  },
  'link.exam_supervision': {
    ...link(
      'link.exam_supervision', '시험 감독표 생성',
      '시험 시간표·감독 배정 마법사를 실행합니다(전용 화면에서 진행).',
      'data_import', '/exam-schedule', '학사 데이터',
    ),
    adminOnly: true,
  },
  'link.timetable_generate': {
    ...link(
      'link.timetable_generate', '시간표 자동 생성',
      '새 학기 시간표 자동 생성 마법사를 실행합니다(전용 화면에서 진행).',
      'data_import', '/timetable-generator', '학사 데이터',
    ),
    adminOnly: true,
  },
  // ── 행정 할 일 연결 ──
  'link.volunteer_issue': embed(
    'link.volunteer_issue', '봉사활동 발급',
    '봉사활동 계획·확인서 발급 모달을 열어 발급번호를 채번하고 대장에 기록합니다.',
    'admin', '/issue-register/volunteer', '발급 대장',
  ),
  'link.gajeong_issue': embed(
    'link.gajeong_issue', '가정통신문 발급',
    '가정통신문 발급 모달을 열어 발급번호를 채번하고 대장에 기록합니다.',
    'admin', '/issue-register/gajeong', '발급 대장',
  ),
  'link.schedule_add': embed(
    'link.schedule_add', '일정 추가',
    '일정 등록 모달을 열어 학사 일정·행사·연수 등을 스케줄에 추가합니다.',
    'admin', '/schedule', '일정·시간표',
  ),
  'link.timetable_change': embed(
    'link.timetable_change', '수업 교체',
    '내 시간표에서 교체할 수업을 골라 교체 요청 모달을 엽니다.',
    'admin', '/timetable', '일정·시간표',
  ),
  'link.notice_write': embed(
    'link.notice_write', '공지사항 작성',
    '공지 작성 모달을 열어 부서 공지사항을 작성·게시합니다.',
    'admin', '/notices', '공지',
  ),
  'link.training_certificate': embed(
    'link.training_certificate', '연수 이수증 등록',
    '이수증 등록 모달을 열어 연수 이수 내역과 파일을 등록합니다.',
    'admin', '/training-certificates', '연수·문서',
  ),
  'link.document_upload': embed(
    'link.document_upload', '문서 업로드',
    '문서함 업로드 모달을 열어 파일을 등록합니다(Drive 연동 포함).',
    'admin', '/documents', '연수·문서',
  ),
  'link.work_create': embed(
    'link.work_create', '할 일 생성',
    '업무 생성 모달을 열어 프로젝트와 하위 할 일을 만듭니다.',
    'admin', '/tasks/mine', '일정·시간표',
  ),
  // ── NEIS 업무 ──
  // 화면은 유형이 아니라 config.neis.screens 에 담는다(한 할 일에 여러 화면 가능).
  // 웹에서 나이스를 조작할 방법이 없으므로 manual — 처리는 사람이, 앱은 위치를 안내한다.
  'neis.screen': {
    type: 'neis.screen',
    handlerVersion: 1,
    title: 'NEIS 업무 화면',
    description: '나이스에서 처리할 화면(최대 10개)과 처리 안내를 담당자에게 보여 줍니다. 처리는 담당자가 나이스에서 직접 합니다.',
    category: 'neis',
    kind: 'external',
    multiple: true,
    executionMode: 'manual',
    verificationMode: 'human_review',
  },
  // ── 입력 받기 ──
  // 응답은 task_action_run 이 아니라 collect_request/target/response 에 쌓인다(비공개 응답 보호).
  // 설정(config.collect)은 매니저 전원이 update_collect_config RPC 로 고친다.
  'collect.input': {
    type: 'collect.input',
    handlerVersion: 1,
    title: '입력 받기',
    description: '대상(예: 1학년 수학 교사 전원)에게서 과목·구분별 값을 받아 표로 모읍니다.',
    category: 'collect',
    kind: 'runner',
    multiple: true,
    executionMode: 'manual',
    verificationMode: 'human_review',
  },
  // ── 제출 받기 (2026-10-01) ──
  // 요청·명단은 입력 받기와 같은 표(collect_request/target), 제출물은 action_submission.
  // 대상 기본값 = 이 할 일의 담당자 — 그때는 만들자마자 서버가 요청을 연다.
  'submit.file': {
    type: 'submit.file',
    handlerVersion: 1,
    title: '파일 제출 받기',
    description: '대상이 파일을 올립니다(구글 공용 드라이브). 담당자는 내면 완료됩니다.',
    category: 'submit',
    kind: 'runner',
    multiple: true,
    executionMode: 'manual',
    verificationMode: 'human_review',
  },
  'submit.document': {
    type: 'submit.document',
    handlerVersion: 1,
    title: '양식 문서 제출 받기',
    description: '지정한 양식의 빈칸을 대상이 채워 냅니다. 값으로 모여 표로 보고 언제든 문서로 다시 엽니다.',
    category: 'submit',
    kind: 'runner',
    multiple: true,
    executionMode: 'manual',
    verificationMode: 'human_review',
  },
  'submit.physical': {
    type: 'submit.physical',
    handlerVersion: 1,
    title: '실물 제출 받기',
    description: '대상이 서류를 직접 냅니다. 책임자가 [받음]을 체크하면 완료됩니다. 제출 양식을 첨부할 수 있습니다.',
    category: 'submit',
    kind: 'runner',
    multiple: true,
    executionMode: 'manual',
    verificationMode: 'human_review',
  },
  // ── 메시지 보내기 ──
  // 쿨메신저는 자동 발송하지 않는다(2026-09-22 방향 전환) — 러너가 복사·절차 안내만 한다.
  'message.send': {
    type: 'message.send',
    handlerVersion: 1,
    title: '메시지 보내기',
    description: '대상(학년·과목·담임·부서·업무분장·동아리…)에게 알림으로 메시지를 보냅니다. AI 초안·쿨메신저 안내 포함.',
    category: 'message',
    kind: 'runner',
    multiple: true,
    executionMode: 'manual',
    verificationMode: 'human_review',
  },
  'external.screen': {
    type: 'external.screen',
    handlerVersion: 1,
    title: '외부 시스템에서 처리',
    description:
      'K-에듀파인·리로스쿨·업무포털처럼 나이스 밖 시스템에서 처리하는 일입니다. 어디서 무엇을 하는지 적어 두고 완료를 기록합니다.',
    category: 'neis',
    kind: 'external',
    multiple: true,
    executionMode: 'manual',
    verificationMode: 'human_review',
  },
  // ── 서명 받기(2026-09-24) ──
  // 두 유형을 나눈 이유: 저장되는 표도(`signature_request` vs `training_signature`),
  // 서명을 받는 방식도(문서 위 좌표 지정 vs 일정 참석자 명단) 다르다. 한 유형으로 합치면
  // 설정 화면이 «둘 중 무엇인가»를 먼저 묻는 갈림길부터 시작한다.
  'signature.request': {
    type: 'signature.request',
    handlerVersion: 1,
    title: '전자서명 받기',
    description:
      '한글·PDF·이미지 문서를 올리고 서명할 사람과 자리를 지정해 서명을 받습니다. 같은 순번은 동시, 다음 순번은 차례로.',
    category: 'signature',
    kind: 'runner',
    route: '/signatures',
    multiple: true,
    executionMode: 'assisted',
    verificationMode: 'human_review',
  },
  'signature.training': {
    type: 'signature.training',
    handlerVersion: 1,
    title: '연수 참석 서명 받기',
    description:
      '연수 일정을 골라 참석자에게 서명을 받습니다. QR·출력은 일정 상세에서 그대로 씁니다.',
    category: 'signature',
    kind: 'runner',
    route: '/schedule',
    multiple: true,
    executionMode: 'manual',
    verificationMode: 'human_review',
  },
  // ── 문서 작성 ──
  'document.template_fill': {
    type: 'document.template_fill',
    handlerVersion: 1,
    title: 'HWPX 직접 작성',
    description:
      '양식 파일을 업로드해 rhwp 편집기에서 직접 수정하고, 결과 파일을 다운로드·검수합니다.',
    category: 'document',
    kind: 'runner',
    executionMode: 'assisted',
    verificationMode: 'human_review',
  },
  'document.spec_fill': {
    type: 'document.spec_fill',
    handlerVersion: 1,
    title: 'HWPX 스펙 기반 문서 생성',
    description:
      '양식의 작성 지점을 스펙으로 확정하고, AI 계획 검토를 거쳐 문서를 완성·검증합니다.',
    category: 'document',
    kind: 'runner',
    executionMode: 'assisted',
    verificationMode: 'human_review',
  },
};

export const AVAILABLE_TASK_ACTION_DEFINITIONS = Object.values(TASK_ACTION_REGISTRY);

export function getTaskActionDefinition(workType: string): TaskActionDefinition | null {
  return TASK_ACTION_REGISTRY[workType as TaskActionType] ?? null;
}
