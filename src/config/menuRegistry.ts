import type { LucideIcon } from 'lucide-react';
import { commonNavItems } from './navigation';

/**
 * 메뉴 활성화 관리 카탈로그 (Admin ▸ 메뉴 관리).
 *
 * ----------------------------------------
 * 왜 별도 카탈로그인가
 * ----------------------------------------
 * 네비게이션 정의(`navigation.ts`)는 "어떤 모양으로 보일까"를, 이 파일은 "관리자가
 * 무엇을 켜고 끌 수 있는가"를 정한다. 둘을 한 파일에 섞으면 섹션 구조를 바꿀 때마다
 * 관리 대상이 조용히 늘거나 줄어든다.
 *
 * **라벨·아이콘·경로는 `commonNavItems`에서 그대로 가져온다** — 메뉴 이름을 고쳤는데
 * 관리 화면만 옛 이름으로 남는 일이 없도록 단일 출처를 유지한다.
 *
 * ----------------------------------------
 * 키 = 메뉴의 기본 경로
 * ----------------------------------------
 * 네비 항목의 `href`와 라우트 경로가 같은 문자열이므로, 이 하나로 **메뉴 숨김과
 * 라우트 차단이 동시에** 판정된다. 하위 경로는 자동 포함이다
 * (`/exam-schedule` → `/exam-schedule/new`, `/exam-schedule/:id` …).
 * 판정은 세그먼트 단위라 `/timetable`이 `/timetable-generator`를 삼키지 않는다
 * (`src/lib/menuVisibility.ts` 참고).
 *
 * ----------------------------------------
 * 관리 대상에서 의도적으로 제외한 것
 * ----------------------------------------
 * - **홈 대시보드(`/`)**: 차단된 메뉴의 리다이렉트 목적지다. 끄면 갈 곳이 사라진다.
 * - **관리자(`/admin`)**: 이 설정을 되돌릴 유일한 화면이라 스스로를 잠글 수 없어야 한다.
 * - **헤더 진입점**(통합 검색·전화번호부·알림): 사이드바 메뉴가 아니라 헤더 버튼이므로
 *   여기서 끄면 버튼만 남아 눌러도 튕기는 상태가 된다. 필요하면 헤더까지 함께 고칠 것.
 *   (2026-09-18) 통합 검색은 **모바일 상단 바에만** 남았다 — 데스크톱 헤더의 돋보기
 *   버튼 자리는 개인기기 ON/OFF 가 가져갔고, 교직원은 헤더 가운데 `ActionSearchBar`
 *   가 대신한다. 학생은 그 검색바가 없으므로 데스크톱에서 `/search` 로 가는 길이 없다.
 */

/** 관리 화면에서 묶어 보여줄 그룹. 사이드바 섹션 이름과 맞춘다. */
export type ManagedMenuGroup =
  | '오늘'
  | '기록·분석'
  | '학사 운영'
  | '도구'
  | '학생 메뉴';

/** 관리 화면 그룹 표시 순서 (사이드바 순서와 동일) */
export const MANAGED_MENU_GROUPS: ManagedMenuGroup[] = [
  '오늘',
  '기록·분석',
  '학사 운영',
  '도구',
  '학생 메뉴',
];

export interface ManagedMenu {
  /** 안정 키 = 메뉴의 기본 경로 (`commonNavItems[*].href`) */
  key: string;
  label: string;
  icon: LucideIcon;
  group: ManagedMenuGroup;
  /** 관리 화면에 띄울 부가 설명 */
  hint?: string;
  /**
   * DB에 설정이 없을 때 적용되는 코드 기본값.
   *
   * **개발 중인 기능은 여기서 `false`로 선언한다** — DB 행이 없어도 즉시 적용되므로
   * 설정을 읽어오는 동안 메뉴가 잠깐 보였다 사라지는 깜빡임이 없다.
   */
  defaultVisibleToUsers: boolean;
  /** 관리자에게 보일지의 코드 기본값. 개발 중 기능도 관리자는 계속 쓴다. */
  defaultVisibleToAdmin: boolean;
}

interface ManagedMenuSeed {
  item: { name: string; href: string; icon: LucideIcon };
  group: ManagedMenuGroup;
  hint?: string;
  defaultVisibleToUsers?: boolean;
  defaultVisibleToAdmin?: boolean;
}

const SEEDS: ManagedMenuSeed[] = [
  // ---------- 오늘 ----------
  { item: commonNavItems.noticeBoard, group: '오늘' },
  { item: commonNavItems.timetable, group: '오늘', hint: '학생 메뉴에도 함께 적용됩니다' },
  { item: commonNavItems.schedule, group: '오늘', hint: '학생 메뉴에도 함께 적용됩니다' },
  // 업무노트 = 옛 «내 할 일»을 품었다(2026-11-12) — 할 일 완료·제출 · 내 업무 · 서명·결재 · 공문 제안
  { item: commonNavItems.workToday, group: '오늘', hint: '내 할 일 완료·제출 + 내 업무 · 서명·결재 · 공문 제안(옛 «내 할 일»)' },
  // 업무 관리 서랍의 페이지 넷 (2026-10-05 탭 → 페이지) — 페이지마다 켜고 끈다
  { item: commonNavItems.tasksMine, group: '오늘', hint: '업무 관리 서랍 · 내가 책임자인 업무 / 전체 업무(구 업무 검색)' },
  { item: commonNavItems.tasksWorkflow, group: '오늘', hint: '업무 관리 서랍 · 할 일과 작업을 잇는 캔버스' },
  { item: commonNavItems.tasksTimeline, group: '오늘', hint: '업무 관리 서랍' },
  {
    item: commonNavItems.tasksBudget,
    group: '오늘',
    hint: '업무 관리 서랍 · 예산(사업관리카드·계획·추경) — 시험 중이라 기본은 관리자에게만(2026-11-10 결정). 표 RLS 는 담당자·관리자(읽기)라 열어도 남의 사업은 안 보인다',
    defaultVisibleToUsers: false,
  },
  {
    item: commonNavItems.tasksMap,
    group: '오늘',
    hint: '업무 관리 서랍 · 기본은 관리자에게만(2026-09-25 결정) — 주소로 들어와도 관리자가 아니면 업무 목록으로 돌아간다',
    defaultVisibleToUsers: false,
  },
  {
    item: commonNavItems.tasksDocs,
    group: '오늘',
    hint: '업무 관리 서랍 · 공문 판단함 1단계 — 관리자 전용(2026-10-30 결정). 표 RLS 도 관리자만이라 켜도 다른 사람에겐 빈 화면',
    defaultVisibleToUsers: false,
  },

  // ---------- 기록·분석 (입시 분석 허브) ----------
  { item: commonNavItems.evalog, group: '기록·분석', hint: '학생 메뉴에도 함께 적용됩니다' },
  { item: commonNavItems.evalearn, group: '기록·분석', hint: '학생 메뉴에도 함께 적용됩니다' },
  { item: commonNavItems.studentDashboard, group: '기록·분석' },
  { item: commonNavItems.inquiryDesign, group: '기록·분석', hint: '학생 메뉴에도 함께 적용됩니다' },
  { item: commonNavItems.creativeActivities, group: '기록·분석', hint: '학생 메뉴에도 함께 적용됩니다' },
  { item: commonNavItems.worldToday, group: '기록·분석', hint: '뉴스에서 질문과 탐구로 이어지는 세상 관측 일지' },
  { item: commonNavItems.admissionWishlist, group: '기록·분석', hint: '학생 메뉴에도 함께 적용됩니다' },
  { item: commonNavItems.ipsiHub, group: '기록·분석', hint: '학생 메뉴에도 함께 적용됩니다' },

  // ---------- 학사 운영 (학사 운영 허브) ----------
  { item: commonNavItems.courseSelection, group: '학사 운영', hint: '학생 메뉴에도 함께 적용됩니다' },
  { item: commonNavItems.courseAnalyze, group: '학사 운영' },
  {
    item: commonNavItems.examSchedule,
    group: '학사 운영',
    hint: '개발 중 — 일반 사용자에게는 감춰져 있습니다',
    defaultVisibleToUsers: false,
  },
  {
    item: commonNavItems.timetableGenerator,
    group: '학사 운영',
    hint: '개발 중 — 원래 관리자 전용 메뉴입니다',
    defaultVisibleToUsers: false,
  },
  { item: commonNavItems.trainingCertificates, group: '학사 운영' },
  {
    item: commonNavItems.clubs,
    group: '학사 운영',
    hint: '동아리 관리(2026-11-11) — 전교 현황·명단 확정·한 장 보기. 학생 메뉴([탐구])에도 함께 적용됩니다. 시험 중이라 기본은 관리자에게만',
    defaultVisibleToUsers: false,
  },
  { item: commonNavItems.volunteerRegister, group: '학사 운영' },
  { item: commonNavItems.gajeongRegister, group: '학사 운영' },
  { item: commonNavItems.classAssignment, group: '학사 운영' },
  { item: commonNavItems.seatArrangement, group: '학사 운영' },
  { item: commonNavItems.studyRoomStats, group: '학사 운영' },
  { item: commonNavItems.rescueNote, group: '학사 운영', hint: '담임·상담교사 등 권한이 있는 교사에게만 노출됩니다' },

  // ---------- 도구 ----------
  { item: commonNavItems.collab, group: '도구' },
  { item: commonNavItems.documentGeneration, group: '도구' },
  { item: commonNavItems.contexts, group: '도구', hint: '학교 지식의 목록·위치(학교 맥락)와 문서 생성에 넘길 배경 글(문서 맥락) — 교직원 전용' },
  { item: commonNavItems.documents, group: '도구' },
  { item: commonNavItems.toolbox, group: '도구' },
  { item: commonNavItems.purchaseRequests, group: '도구', hint: '학생 메뉴에도 함께 적용됩니다' },
  { item: commonNavItems.signatures, group: '도구' },
  { item: commonNavItems.neisGuide, group: '도구', hint: '나이스 화면별 사용 방법(설명서 기준) — 교직원 전용' },
  {
    item: commonNavItems.automations,
    group: '도구',
    hint: '정기 쿨메신저 쪽지(기전봇) — 만들기는 Admin «자동화 업무»에서 허용한 사람만. 실행 서버 준비 전이라 기본은 관리자에게만',
    defaultVisibleToUsers: false,
  },
  { item: commonNavItems.agents, group: '도구', hint: '내 PC 데스크의 에이전트 대화 방(휴대폰 «에이전트» 탭과 같다) + 받은 에이전트 작업 요청 맡기기 — 교직원 전용' },
  { item: commonNavItems.codeShare, group: '도구', hint: '바이브코딩 산출물 올리기·실행·가져가기 · 학생 메뉴([탐구])에도 함께 적용됩니다' },
  { item: commonNavItems.classroomDevices, group: '도구', hint: '교실 PC 의 QR 로 반별 세팅을 독에 — 교직원 전용' },
  { item: commonNavItems.desktopApp, group: '도구', hint: 'PC 앱 내려받기 — 교직원은 데스크, 학생은 학생판 · 학생 메뉴([도구])에도 함께 적용됩니다' },

  // ---------- 학생 메뉴 ----------
  // 교사 사이드바의 [학생 메뉴](학생용) 섹션 + 학생 네비에만 있는 메뉴
  { item: commonNavItems.planner, group: '학생 메뉴', hint: '날짜별 계획과 목표 관리 · 아카데미 플래너와 기록 연동 · 학생 메뉴에도 함께 적용됩니다' },
  { item: commonNavItems.academy, group: '학생 메뉴', hint: '창체 도서관·지식 별자리·교수 면담·전서구 소식 · 학생 메뉴에도 함께 적용됩니다' },
  {
    item: commonNavItems.tamagotchi,
    group: '학생 메뉴',
    // 2026-10-07 Phase 7(학생 공개 준비) — 기본 공개로 바꿨다(사용자 결정). 직원은 라우트가 닫혀 있어 메뉴도 기본 꺼짐(routeAccess).
    hint: '학생·교사가 자기 펫을 서버에 저장해 키웁니다(수업 정지는 각자 시간표 — 학생은 듣는 수업, 교사는 가르치는 수업) · 학생 홈 카드도 이 스위치를 따릅니다 · 직원은 닫혀 있어요',
    defaultVisibleToUsers: true,
  },
  {
    item: commonNavItems.starTower,
    group: '학생 메뉴',
    // 2026-10-10 신설 → 같은 날 공개(사용자 결정 «이제 기능 LIVE로»). 직원은 라우트가 닫혀 있어 메뉴도 기본 꺼짐(routeAccess)
    hint: '집중 타이머로 낚시해 탑을 쌓는 게임 · 학생·교사가 서버에 저장합니다 · 직원은 닫혀 있어요',
    defaultVisibleToUsers: true,
  },
  {
    item: commonNavItems.isekai,
    group: '학생 메뉴',
    // 2026-10-28 신설 — 독 게임의 내 기록(서버 isekai3d_my_record · 본인만)과 업적(코인). 직원은 라우트가 닫혀 있어 메뉴도 기본 꺼짐(routeAccess)
    hint: '학생판(독) «이세계에서는 사회인»의 출근 기록·세이브·드라마·면담 노트·업적(코인) · 교사는 예시로 미리 봅니다 · 직원은 닫혀 있어요',
    defaultVisibleToUsers: true,
  },
  {
    item: commonNavItems.coinGuide,
    group: '학생 메뉴',
    // 2026-10-27 신설 — 통합 지갑 보상 안내. 숫자는 코인 경제 설정을 그대로 읽는다. 꺼진 메뉴의 세계는 화면이 카드를 뺀다
    hint: '자습실·아카데미·플래너·다마고찌·별까지 쌓기·요즘 세상·면접 준비·이세계 사회인의 코인 얻는 법과 쓰는 곳 · 직원은 닫혀 있어요',
    defaultVisibleToUsers: true,
  },
  {
    item: commonNavItems.spacedRepetition,
    group: '학생 메뉴',
    hint: '기본은 관리자에게만 — 켜면 그 대상에게도 열립니다',
    defaultVisibleToUsers: false,
  },
  { item: commonNavItems.studentCollab, group: '학생 메뉴', hint: '학생용 협업 보드' },
  {
    item: commonNavItems.interviewPrep,
    group: '학생 메뉴',
    hint: '학생은 본인 생기부로 · 교사는 테스트 학생(00-00001)의 생기부로 체험 · 학생 답변은 생기부 분석의 [면접 준비] 탭에서 봅니다 · 학생 메뉴에도 함께 적용됩니다',
  },
];

export const MANAGED_MENUS: ManagedMenu[] = SEEDS.map((seed) => ({
  key: seed.item.href,
  label: seed.item.name,
  icon: seed.item.icon,
  group: seed.group,
  hint: seed.hint,
  defaultVisibleToUsers: seed.defaultVisibleToUsers ?? true,
  defaultVisibleToAdmin: seed.defaultVisibleToAdmin ?? true,
}));

/** 경로(키) → 관리 항목. 없으면 관리 대상이 아니다(= 항상 노출). */
export const MANAGED_MENU_BY_KEY: ReadonlyMap<string, ManagedMenu> = new Map(
  MANAGED_MENUS.map((menu) => [menu.key, menu])
);

/**
 * 경로 판정용 — 긴 키가 먼저 오도록 정렬해 둔다.
 * (`/issue-register/volunteer`가 `/issue-register`류 상위 키보다 먼저 매칭되도록)
 */
export const MANAGED_MENUS_BY_SPECIFICITY: ManagedMenu[] = [...MANAGED_MENUS].sort(
  (a, b) => b.key.length - a.key.length
);
