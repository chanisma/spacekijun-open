import {
  Home,
  Wallet,
  Egg,
  Telescope,
  BriefcaseBusiness,
  Calendar,
  Clock,
  CheckSquare,
  ClipboardList,
  ListTodo,
  MessageSquare,
  FileText,
  FileSignature,
  FileCheck,
  Newspaper,
  Search,
  Settings,
  StickyNote,
  Phone,
  Wrench,
  ClipboardCheck,
  BarChart3,
  Users,
  UserPlus,
  Plug,
  TrendingUp,
  Share2,
  FlaskConical,
  Brain,
  Award,
  ShoppingCart,
  CalendarRange,
  Armchair,
  Library,
  ClipboardEdit,
  ShieldAlert,
  GraduationCap,
  Megaphone,
  MessageCircleQuestion,
  FileOutput,
  Sparkles,
  LucideIcon,
  ListChecks,
  Code2,
  Workflow,
  GanttChartSquare,
  Map as MapIcon,
  Inbox,
  NotebookPen,
  BookMarked,
  CalendarClock,
  QrCode,
  Monitor,
  Coins,
  Bot,
} from 'lucide-react';
import { TASK_PAGES, type TaskPageValue } from '@/lib/taskTabs';

/** 업무 관리 페이지의 이름·주소는 `lib/taskTabs` 의 TASK_PAGES 가 정본이다 — 여기서 베껴 쓰지 않는다 */
const taskPage = (value: TaskPageValue) => {
  const page = TASK_PAGES.find((p) => p.value === value)!;
  return { name: page.label, href: page.path };
};

// ----------------------------------------
// Navigation Item Types
// ----------------------------------------

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  iconUrl?: string;
  color?: string;
  isExternal?: boolean;
  target?: string;
  rel?: string;
  menu?: { meta?: { mobileUrl?: string; url?: string } };
}

export interface NavGroup {
  kind: 'group';
  /** 안정 식별자 — 외부 메뉴 배치(placement) 대상 지정에 사용. name은 표시용이라 바뀔 수 있음. */
  id?: string;
  name: string;
  icon: LucideIcon;
  color?: string;
  children: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export interface NavSection {
  id: string;
  label: string;
  items: NavEntry[];
}

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return (entry as NavGroup).kind === 'group';
}

// ----------------------------------------
// Common Item Atoms
// ----------------------------------------

export const commonNavItems = {
  home: { name: '홈 대시보드', href: '/', icon: Home, color: 'text-blue-600' },
  timetable: { name: '시간표', href: '/timetable', icon: Clock, color: 'text-green-600' },
  schedule: { name: '스케줄', href: '/schedule', icon: Calendar, color: 'text-purple-600' },
  planner: { name: '플래너', href: '/planner', icon: ClipboardCheck, color: 'text-teal-600' },
  // 수행(내 할 일)과 관리(업무 관리)는 다른 일이라 메뉴도 갈랐다 (2026-09-21)
  // 「오늘」 시험판(2026-11-08 업무 온톨로지 P0 — docs/plans/2026-11-08-work-ontology-redesign.md). 기본은 관리자만(menuRegistry)
  workToday: { name: '업무노트', href: '/work', icon: NotebookPen, color: 'text-blue-600' },
  // 업무 관리 = 서랍(아래 tasksHub) 안의 페이지 넷 (2026-10-05 탭 → 페이지). 순서 = TASK_PAGES 순서
  tasksMine: { ...taskPage('myWorks'), icon: ListTodo, color: 'text-emerald-600' },
  tasksWorkflow: { ...taskPage('workflow'), icon: Workflow, color: 'text-emerald-600' },
  tasksTimeline: { ...taskPage('timeline'), icon: GanttChartSquare, color: 'text-emerald-600' },
  // 예산(2026-11-10) — 사업관리카드·계획·추경. 처음엔 관리자만(menuRegistry), 담당 교사에게는 «메뉴 관리»에서 연다
  tasksBudget: { ...taskPage('budget'), icon: Wallet, color: 'text-emerald-600' },
  // 학교 전체는 관리자 전용 — 메뉴 노출 기본값(menuRegistry)과 라우트(resolveTaskPage) 둘 다 막는다
  tasksMap: { ...taskPage('map'), icon: MapIcon, color: 'text-emerald-600' },
  tasksDocs: { ...taskPage('docs'), icon: Inbox, color: 'text-emerald-600' },
  documentGeneration: { name: '문서 생성', href: '/document-generation', icon: FileOutput, color: 'text-teal-600' },
  // 맥락 관리(2026-11-06) — 학교 지식이 어디에 어떤 구조로 있는지(학교 맥락) + 문서 생성에 넘길 배경 글(문서 맥락). 교직원
  contexts: { name: '맥락 관리', href: '/contexts', icon: Library, color: 'text-indigo-600' },
  creativeActivities: { name: '창체 아카이브', href: '/activities', icon: Sparkles, color: 'text-fuchsia-600' },
  worldToday: { name: '요즘 세상', href: '/world-today', icon: Newspaper, color: 'text-violet-600' },
  academy: { name: '별빛 탐구 아카데미', href: '/academy', icon: Sparkles, color: 'text-violet-600' },
  // 다마고찌 — 별빛 아카데미 펫의 스핀오프, 학교생활 알림의 얼굴 (2026-10-06, docs/features/tamagotchi.md)
  tamagotchi: { name: '다마고찌', href: '/tamagotchi', icon: Egg, color: 'text-indigo-600' },
  // 별까지 쌓기 — 집중하는 동안 낚시해 물 위의 탑을 하늘까지 쌓는 방치형 타이머 게임 (2026-10-10, docs/features/star-tower.md)
  starTower: { name: '별까지 쌓기', href: '/star-tower', icon: Telescope, color: 'text-indigo-600' },
  // 이세계 사회인 — 독 게임 «이세계에서는 사회인»의 내 기록·통계·업적 (2026-10-28, docs/features/isekai.md)
  isekai: { name: '이세계 사회인', href: '/isekai', icon: BriefcaseBusiness, color: 'text-emerald-600' },
  // 코인 얻는 법 — 통합 지갑을 쓰는 세계들의 보상 안내 (2026-10-27)
  coinGuide: { name: '코인 얻는 법', href: '/coins', icon: Coins, color: 'text-amber-600' },
  attendance: { name: '출석부', href: '/attendance', icon: CheckSquare, color: 'text-orange-600' },
  homeroomAttendance: { name: '담임 출석부', href: '/homeroom-attendance', icon: ClipboardList, color: 'text-orange-600' },
  notifications: { name: '알림', href: '/notifications', icon: MessageSquare, color: 'text-pink-600' },
  noticeBoard: { name: '공지사항', href: '/notices', icon: Megaphone, color: 'text-rose-600' },
  documents: { name: '서류함', href: '/documents', icon: FileText, color: 'text-indigo-600' },
  ipsiHub: { name: '입시 정보', href: '/ipsi', icon: Newspaper, color: 'text-red-600' },
  collab: { name: '협업 보드', href: '/collab', icon: StickyNote, color: 'text-yellow-600' },
  studentCollab: { name: '협업 보드', href: '/student-collab', icon: StickyNote, color: 'text-yellow-600' },
  calls: { name: '전화번호부', href: '/calls', icon: Phone, color: 'text-green-600' },
  search: { name: '통합 검색', href: '/search', icon: Search, color: 'text-purple-600' },
  toolbox: { name: '도구 모음', href: '/toolbox', icon: Wrench, color: 'text-cyan-600' },
  evalog: { name: '생기부 분석', href: '/evalog', icon: ClipboardCheck, color: 'text-teal-600' },
  rescueNote: { name: '위기 노트', href: '/rescue-note', icon: ShieldAlert, color: 'text-red-600' },
  // 모의고사 + 학교 지필평가를 함께 다루므로 '시험 결과 분석'이 정확한 상위 이름이다
  evalearn: { name: '시험 결과 분석', href: '/evalearn', icon: TrendingUp, color: 'text-indigo-500' },
  courseAnalyze: { name: '선택 과목 분석', href: '/course-analyze', icon: BarChart3, color: 'text-violet-600' },
  courseSelection: { name: '선택 과목 신청', href: '/course-selection', icon: ClipboardEdit, color: 'text-violet-700' },
  studentDashboard: { name: '학생 대시보드', href: '/student-dashboard', icon: Users, color: 'text-sky-600' },
  admissionWishlist: { name: '수시 지원', href: '/admission-wishlist', icon: GraduationCap, color: 'text-red-500' },
  classAssignment: { name: '반 배정', href: '/class-assignment', icon: UserPlus, color: 'text-rose-600' },
  seatArrangement: { name: '자리 배치', href: '/seat-arrangement', icon: Armchair, color: 'text-blue-600' },
  // seaton(자습실 좌석 신청)과 같은 DB 의 통계 — 규칙은 서버 계약 seaton_stats_* (교사·관리자)
  studyRoomStats: { name: '자습실 통계', href: '/study-room-stats', icon: Library, color: 'text-indigo-600' },
  inquiryDesign: { name: '탐구 설계', href: '/inquiry-design', icon: FlaskConical, color: 'text-cyan-600' },
  // 학생 전용 메뉴 — 교사는 생기부 분석의 [면접 준비] 탭에서 학생 답변을 본다.
  interviewPrep: { name: '면접 준비', href: '/interview-prep', icon: MessageCircleQuestion, color: 'text-blue-600' },
  knowledgeGraph: { name: '지식 그래프', href: '/knowledge-graph', icon: Share2, color: 'text-emerald-500' },
  spacedRepetition: { name: '간격반복 학습', href: '/spaced-repetition', icon: Brain, color: 'text-amber-600' },
  trainingCertificates: { name: '연수 이수증', href: '/training-certificates', icon: Award, color: 'text-emerald-700' },
  // 동아리(2026-11-11 동아리 관리 P1 — docs/plans/2026-11-11-club-management.md). 처음엔 관리자만(menuRegistry)
  clubs: { name: '동아리', href: '/clubs', icon: Users, color: 'text-violet-600' },
  volunteerRegister: { name: '봉사활동 발급', href: '/issue-register/volunteer', icon: FileCheck, color: 'text-green-600' },
  gajeongRegister: { name: '가정통신문 발급', href: '/issue-register/gajeong', icon: Newspaper, color: 'text-blue-600' },
  purchaseRequests: { name: '구매 신청', href: '/purchase-requests', icon: ShoppingCart, color: 'text-emerald-600' },
  signatures: { name: '전자서명', href: '/signatures', icon: FileSignature, color: 'text-violet-600' },
  // 코드 공유 — 바이브코딩 산출물을 올리고·실행하고·가져가기. 학생·교직원 같은 화면(2026-10-01)
  codeShare: { name: '코드 공유', href: '/code-share', icon: Code2, color: 'text-sky-600' },
  // 나이스 화면 안내 — neis-kb/guides 전체를 찾고 읽는다(설명서 기준 209개, 2026-10-11)
  neisGuide: { name: '나이스 안내', href: '/neis-guide', icon: BookMarked, color: 'text-blue-600' },
  automations: { name: '자동화 업무', href: '/automations', icon: CalendarClock, color: 'text-blue-600' },
  // 에이전트(2026-11-11) — 모바일 앱 «에이전트» 탭의 웹판. 내 PC 데스크 에이전트 대화 방 + 받은 작업 요청. 교직원(FACULTY_ROLES)
  agents: { name: '에이전트', href: '/agents', icon: Bot, color: 'text-indigo-600' },
  // PC 앱 내려받기(2026-10-20) — 교직원 = 스페이스기전 데스크, 학생 = 스페이스기전 학생. 화면은 역할로 갈린다
  desktopApp: { name: '스페이스기전 데스크톱', href: '/desktop-app', icon: Monitor, color: 'text-blue-600' },
  // 교실 기기 QR 세팅(2026-10-14) — 교실 PC 의 QR 로 반별 세팅을 독에. 교직원(FACULTY_ROLES)
  classroomDevices: { name: '교실 기기', href: '/classroom', icon: QrCode, color: 'text-indigo-600' },
  examSchedule: { name: '시험 시간표', href: '/exam-schedule', icon: CalendarRange, color: 'text-amber-600' },
  timetableGenerator: { name: '시간표 생성', href: '/timetable-generator', icon: CalendarRange, color: 'text-sky-600' },
  smartDevices: { name: '스마트 기기', href: '/smart-devices', icon: Plug, color: 'text-orange-600' },
  admin: { name: '관리자', href: '/admin', icon: Settings, color: 'text-gray-600' },
} as const;

// ----------------------------------------
// Section Definitions (교사/담임)
// ----------------------------------------
//
// Sub-menu(분석 허브)는 NavGroup으로 표현. 부모 클릭 = 토글만(라우트 없음).
// admin·iframe 동적 삽입은 useNavSections에서 처리.

const analyticsHub: NavGroup = {
  kind: 'group',
  id: 'analytics-hub',
  name: '입시 분석 허브',
  icon: BarChart3,
  color: 'text-violet-600',
  children: [
    commonNavItems.evalog,
    commonNavItems.evalearn,
    commonNavItems.studentDashboard,
    commonNavItems.inquiryDesign,
    commonNavItems.creativeActivities,
    commonNavItems.worldToday,
    // 별빛 탐구 아카데미는 [학생 메뉴] 섹션으로 옮겼다 (2026-09-21 사용자 결정)
    commonNavItems.admissionWishlist,
    // knowledgeGraph 메뉴는 현재 비활성(기능이 탐구 설계에 포함) — useNavSections 참고.
    commonNavItems.ipsiHub, // 입시 정보 — 그룹 맨 아래(자료 섹션에서 이동)
  ],
};

// 업무 관리 — 한 페이지의 탭 다섯이던 것을 페이지로 나눠 담은 서랍 (2026-10-05 사용자 결정).
// 부모 클릭 = 펼치기만(라우트 없음, 다른 허브와 같다). `/tasks` 로 들어오면 첫 줄(업무 목록)이 열린다.
export const TASKS_HUB_ID = 'tasks-hub';
const tasksHub: NavGroup = {
  kind: 'group',
  id: TASKS_HUB_ID,
  name: '업무 관리',
  icon: ListTodo,
  color: 'text-emerald-600',
  children: [
    commonNavItems.tasksMine,
    commonNavItems.tasksWorkflow,
    commonNavItems.tasksTimeline,
    commonNavItems.tasksBudget,
    commonNavItems.tasksMap,
    commonNavItems.tasksDocs,
  ],
};

// 학사 운영 — 분석 허브처럼 토글되는 그룹. 선택과목 신청/분석(구 분석 허브) +
// 기존 학사 운영 섹션 항목 포함. 위기 노트는 useNavSections에서 동적 push.
const academicOpsGroup: NavGroup = {
  kind: 'group',
  id: 'academic-ops-hub',
  name: '학사 운영 허브',
  icon: ClipboardList,
  color: 'text-amber-600',
  children: [
    commonNavItems.courseSelection,
    commonNavItems.courseAnalyze,
    commonNavItems.examSchedule,
    // timetableGenerator(admin 전용)는 useNavSections에서 examSchedule 뒤에 splice.
    commonNavItems.trainingCertificates,
    commonNavItems.clubs,
    commonNavItems.volunteerRegister,
    commonNavItems.gajeongRegister,
    commonNavItems.classAssignment,
    commonNavItems.seatArrangement,
    commonNavItems.studyRoomStats,
  ],
};

export const regularNavSections: NavSection[] = [
  {
    id: 'today',
    label: '오늘',
    items: [
      commonNavItems.home,
      // 공지사항 — 홈 대시보드 바로 아래. 모바일 하단 바는 메뉴 순서와 따로 정한다
      // (`lib/navMobileLayout.ts` 기본값 · Admin ▸ 메뉴 관리 «모바일 하단 메뉴», 2026-10-25)
      commonNavItems.noticeBoard,
      commonNavItems.timetable,
      commonNavItems.schedule,
      // 업무노트 = 옛 «내 할 일»을 품었다(2026-11-12 사용자 결정 — 수행 + 대시보드). 내 할 일 자리 그대로.
      // 모바일 하단 4번째 칸(스케줄 다음, 2026-09-21 결정은 자리만 이어받는다)
      commonNavItems.workToday,
      // 업무 관리 — 내 할 일 바로 아래(2026-09-21 사용자 결정). 수행과 관리가 나란히 있어야 오가기 쉽다.
      // 2026-10-05 부터 서랍이다. 내 할 일은 서랍 밖 독립 메뉴로 남는다(같은 날 사용자 결정)
      tasksHub,
      // 협업 보드는 [도구]로, 플래너는 [학생 메뉴]로 내려갔다 (2026-09-21 사용자 결정).
    ],
  },
  {
    id: 'analytics',
    label: '기록·분석',
    items: [analyticsHub],
  },
  {
    // 학사 운영: 기록·분석처럼 섹션 라벨 + 토글 그룹(학사 운영 허브) 구조.
    id: 'academic-ops',
    label: '학사 운영',
    items: [academicOpsGroup],
  },
  {
    id: 'tools',
    label: '도구',
    items: [
      commonNavItems.collab,
      commonNavItems.classroomDevices,
      commonNavItems.documentGeneration,
      commonNavItems.contexts,
      commonNavItems.documents,
      commonNavItems.toolbox,
      commonNavItems.purchaseRequests,
      commonNavItems.signatures,
      commonNavItems.neisGuide,
      commonNavItems.automations,
      commonNavItems.agents,
      commonNavItems.codeShare,
      commonNavItems.desktopApp,
      // iframe/link 외부 메뉴는 useNavSections에서 별도 [외부 연결] 섹션으로 분리
    ],
  },
  {
    // 학생이 쓰는 화면을 교사가 들여다보는 자리. '학생용' 꼬리표는 두지 않는다 — 섹션 이름이 이미 말한다.
    // 간격반복 학습(admin 전용)은 useNavSections 가 이 섹션 끝에 넣는다(구 [학습] 섹션을 흡수).
    id: 'student-menus',
    label: '학생 메뉴',
    items: [
      commonNavItems.planner,
      commonNavItems.academy,
      commonNavItems.tamagotchi,
      commonNavItems.starTower,
      commonNavItems.isekai,
      commonNavItems.coinGuide,
      // 면접 준비 — 교사는 테스트 학생(00-00001)의 생기부로 체험한다 (2026-09-23 사용자 결정)
      commonNavItems.interviewPrep,
    ],
  },
  {
    id: 'admin',
    label: '관리',
    items: [
      commonNavItems.admin,
    ],
  },
];

// 담임 교사용 — 현재 동일 구성, 추후 담임 전용 항목 추가 시 이 export만 분기
export const homeroomNavSections: NavSection[] = regularNavSections;

// ----------------------------------------
// Flat Exports (Mobile bottom-nav 호환)
// ----------------------------------------
//
// 그룹은 children으로 평탄화하여 모바일 검색/네비게이션이 모든 항목에 접근 가능.
// (모바일 하단 바는 2026-10-25 부터 이 배열의 앞 5개가 아니라 `lib/navMobileLayout.ts` 의 href 목록이다)

function flattenSections(sections: NavSection[]): NavItem[] {
  return sections.flatMap((section) =>
    section.items.flatMap((item) => (isNavGroup(item) ? item.children : [item]))
  );
}

export const regularNavigation: NavItem[] = flattenSections(regularNavSections);
export const homeroomNavigation: NavItem[] = flattenSections(homeroomNavSections);

// ----------------------------------------
// 학생 네비게이션 — 교사처럼 카테고리(섹션 라벨)화
// ----------------------------------------
//
// [오늘] 홈·시간표·스케줄·협업 보드·플래너 (라벨 없이 상단 고정)
// [탐구] 탐구 설계·창체 아카이브·요즘 세상·별빛 탐구 아카데미
// [분석] 생기부 분석·시험 결과 분석·면접 준비·수시 지원·입시 정보
// [신청] 선택 과목 신청·구매 신청
// 라벨만 있는 섹션(펼침 고정) — 교사 [오늘]/[도구] 스타일. NavGroup(토글) 아님.
// admin 미리보기용 간격반복·관리자 진입점, 외부 메뉴는 useNavSections에서 동적 주입.

export const studentNavSections: NavSection[] = [
  {
    id: 'student-today',
    label: '',
    items: [
      commonNavItems.home,
      commonNavItems.timetable,
      commonNavItems.schedule,
      commonNavItems.studentCollab,
      // 플래너 — 아카데미가 있던 자리(협업 보드 아래). 아카데미는 [탐구]로 갔다 (2026-09-21)
      commonNavItems.planner,
      // 다마고찌 — 하루를 함께하는 펫. 학생 하단 5칸은 href 명시라 영향 없음 (2026-10-06)
      commonNavItems.tamagotchi,
      commonNavItems.starTower,
      commonNavItems.isekai,
      commonNavItems.coinGuide,
    ],
  },
  {
    // 탐구 — 묻고(요즘 세상) · 설계하고(탐구 설계) · 남기고(창체 아카이브) · 이어 가는(아카데미) 묶음.
    // [분석] 위에 둔다 (2026-09-21 사용자 결정).
    id: 'student-inquiry',
    label: '탐구',
    items: [
      commonNavItems.inquiryDesign,
      commonNavItems.creativeActivities,
      commonNavItems.clubs,
      commonNavItems.worldToday,
      commonNavItems.academy,
      commonNavItems.codeShare,
    ],
  },
  {
    id: 'student-analytics',
    label: '분석',
    items: [
      commonNavItems.evalog,
      commonNavItems.evalearn,
      // 면접 준비 — 수시 지원 바로 위. 지원 목록을 짜기 전에 "내 기록을 말로
      // 설명할 수 있는가"를 연습하는 순서다.
      commonNavItems.interviewPrep,
      commonNavItems.admissionWishlist,
      commonNavItems.ipsiHub,
    ],
  },
  {
    id: 'student-apply',
    label: '신청',
    items: [
      commonNavItems.courseSelection,
      commonNavItems.purchaseRequests,
    ],
  },
  {
    // 도구 — 교사 [도구] 와 같은 이름의 자리. 지금은 PC 앱(학생판) 하나 (2026-10-20 사용자 결정)
    id: 'student-tools',
    label: '도구',
    items: [
      commonNavItems.desktopApp,
    ],
  },
];

// 평면 배열 (검색·라우트 허용 목록 파생용). 섹션 순서대로 평탄화.
export const studentNavigation: NavItem[] = flattenSections(studentNavSections);

// ----------------------------------------
// 외부 메뉴 배치(placement)
// ----------------------------------------
//
// 외부 메뉴(iframe/link)는 기본적으로 [외부 연결] 섹션의 "외부 메뉴" 서랍에 모이지만,
// 관리자가 메뉴별로 다른 카테고리에 배치할 수 있다. 배치 대상은 `resource.meta.placement`
// (교사 네비) / `resource.meta.studentPlacement`(학생 네비)에 문자열 키로 저장된다.
//
// 키 형식:
//   'external'        → 기본값. [외부 연결]/[더보기] 섹션의 외부 메뉴 서랍
//   'section:<id>'    → 해당 NavSection의 items 끝에 직접 배치
//   'group:<id>'      → 해당 NavGroup(서랍식 메뉴)의 children 끝에 배치
//
// 대상이 현재 사용자의 네비에 없으면(권한·역할로 섹션이 주입되지 않은 경우 등)
// 조용히 기본 외부 메뉴 서랍으로 폴백한다 — 메뉴가 사라지지 않게 하는 안전장치.

export const DEFAULT_NAV_PLACEMENT = 'external';

export interface NavPlacementOption {
  /** meta.placement / meta.studentPlacement에 저장되는 값 */
  value: string;
  /** 관리자 UI에 표시할 라벨 */
  label: string;
  /** 부가 설명 (선택) */
  hint?: string;
}

/**
 * 교사 네비 배치 후보.
 *
 * [학습]·[관리] 섹션은 제외한다 — [학습]은 admin에게만 동적 주입되어 일반 교사에게는
 * 대상이 없고(폴백 발생), [관리]는 관리자 진입점 전용이라 외부 메뉴 배치처로 부적절.
 */
export const teacherNavPlacements: NavPlacementOption[] = [
  { value: DEFAULT_NAV_PLACEMENT, label: '외부 연결 (기본)', hint: '별도 [외부 연결] 섹션의 "외부 메뉴" 서랍' },
  { value: 'section:today', label: '오늘', hint: '홈·시간표·스케줄과 같은 줄' },
  { value: 'section:analytics', label: '기록·분석', hint: '섹션 직속 — 입시 분석 허브와 나란히' },
  { value: 'group:analytics-hub', label: '기록·분석 › 입시 분석 허브 안', hint: '서랍을 펼쳐야 보임' },
  { value: 'section:academic-ops', label: '학사 운영', hint: '섹션 직속 — 학사 운영 허브와 나란히' },
  { value: 'group:academic-ops-hub', label: '학사 운영 › 학사 운영 허브 안', hint: '서랍을 펼쳐야 보임' },
  { value: 'section:tools', label: '도구', hint: '업무 관리·서류함·도구 모음과 같은 줄' },
];

/** 학생 네비 배치 후보 (학생 메뉴에 표시 = ON인 외부 메뉴에만 적용) */
export const studentNavPlacements: NavPlacementOption[] = [
  { value: DEFAULT_NAV_PLACEMENT, label: '더보기 (기본)', hint: '[더보기] 섹션의 "외부 메뉴" 서랍' },
  { value: 'section:student-today', label: '상단 (홈·시간표 영역)' },
  { value: 'section:student-analytics', label: '분석' },
  { value: 'section:student-apply', label: '신청' },
];

export function navPlacementLabel(placement: string | undefined, options: NavPlacementOption[]): string {
  const key = placement || DEFAULT_NAV_PLACEMENT;
  return options.find((option) => option.value === key)?.label ?? key;
}

/**
 * 배치 키에 따라 NavItem을 섹션/그룹에 삽입한다.
 * 대상을 찾지 못하면 아무것도 하지 않고 false를 반환 (호출자가 기본 서랍으로 폴백).
 *
 * 주의: sections는 호출 전에 깊은 복사되어 있어야 한다 (원본 상수 오염 방지).
 */
export function placeNavItem(sections: NavSection[], placement: string, item: NavItem): boolean {
  if (placement.startsWith('section:')) {
    const sectionId = placement.slice('section:'.length);
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return false;
    section.items.push(item);
    return true;
  }

  if (placement.startsWith('group:')) {
    const groupId = placement.slice('group:'.length);
    for (const section of sections) {
      for (const entry of section.items) {
        if (isNavGroup(entry) && entry.id === groupId) {
          entry.children.push(item);
          return true;
        }
      }
    }
    return false;
  }

  return false;
}

// 학생이 접근 가능한 라우트 목록
export const studentAllowedRoutes = [
  '/',
  '/timetable',
  '/schedule',
  '/course-selection',
  '/evalog',
  '/evalearn',
  '/inquiry-design',
  '/interview-prep',
  '/admission-wishlist',
  '/ipsi',
  '/spaced-repetition',
  '/purchase-requests',
  '/student-collab',
  '/code-share',
  '/desktop-app',
  '/profile',
  '/search',
  '/admin',
];
