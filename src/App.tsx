import { Agentation } from "agentation";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppQueryClient as QueryClient } from '@/lib/appQueryClient';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ModalBackRouterSync } from "@/components/common/ModalBackRouterSync";
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import { GoogleTokenExpiredHandler } from "@/components/auth/GoogleTokenExpiredHandler";
import { ProfileEditDialog } from "@/components/profile/ProfileEditDialog";
import { useProfile } from "@/hooks/useProfile";
import type { Profile } from "@/types/domain";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { lazy, Suspense, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { RouteLoadingOverlay } from "@/components/layout/RouteLoadingOverlay";
import { AcademyLoadingScreen } from "@/features/academy/AcademyLoadingScreen";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import ProfilePage from "./pages/Profile";
import Timetable from "./pages/Timetable";

import Schedule from './pages/Schedule';
import Attendance from './pages/Attendance';
import HomeroomAttendance from './pages/HomeroomAttendance';
import Notifications from './pages/Notifications';
import Documents from './pages/Documents';
import Search from './pages/Search';
import Admin from './pages/Admin';
import TaskManagement from './pages/TaskManagement';
import WorkPipelineRedirect from './pages/WorkPipeline';
import DocumentGenerationPage from './features/document-generation/DocumentGenerationPage';
import CreativeActivitiesPage from './features/creative-activities/CreativeActivitiesPage';
const WorldTodayPage = lazy(() => import('./features/world-today/WorldTodayPage'));
const AcademyPage = lazy(() => import('./features/academy/AcademyPage'));
const PlannerPage = lazy(() => import('./features/planner/PlannerPage'));
const TamagotchiPage = lazy(() => import('./features/tamagotchi/TamagotchiPage'));
const StarTowerPage = lazy(() => import('./features/star-tower/StarTowerPage'));
const CoinGuidePage = lazy(() => import('./features/coin-guide/CoinGuidePage'));
const IsekaiPage = lazy(() => import('./features/isekai/IsekaiPage'));
const StudyRoomStatsPage = lazy(() => import('./features/study-room-stats/StudyRoomStatsPage'));
import DevTools from './pages/DevTools';
import IframePage from './pages/IframePage';
import TrainingSignaturePrint from './pages/TrainingSignaturePrint';
import VideoPlayer from './pages/VideoPlayer';
import IpsiHub from './pages/IpsiHub';
import CollabBoard from './pages/CollabBoard';
import BoardDetail from './pages/BoardDetail';
import StudentCollabBoard from './pages/StudentCollabBoard';
import StudentBoardDetail from './pages/StudentBoardDetail';
import Calls from './pages/Calls';
// 코드 공유 — Sandpack(CodeMirror 포함)이 무거워 lazy
const CodeSharePage = lazy(() => import('./features/code-share/CodeSharePage'));
const CodeProjectPage = lazy(() => import('./features/code-share/CodeProjectPage'));
// 나이스 화면 안내 — 안내 파일 200여 개를 한 청크로 싣는 페이지라 lazy
const NeisGuidePage = lazy(() => import('./features/neis-guide/NeisGuidePage'));
// 맥락 관리(2026-11-06) — 학교 맥락 목록 + 문서 맥락 라이브러리. 문서 생성에서 기능으로 뺐다
const ContextsPage = lazy(() => import('./features/school-context/ContextsPage'));
// 동아리 관리(2026-11-11) — docs/plans/2026-11-11-club-management.md
const ClubsPage = lazy(() => import('./features/clubs/ClubsPage'));
const AutomationsPage = lazy(() => import('./features/automations/AutomationsPage'));
// 업무 온톨로지 P0 시험판 — 「오늘」·「한 장 보기」(2026-11-08, docs/plans/2026-11-08-work-ontology-redesign.md)
const WorkTodayPage = lazy(() => import('./features/work-ontology/TodayPage'));
const WorkObjectPage = lazy(() => import('./features/work-ontology/ObjectPage'));
// PC 앱 내려받기 (2026-10-20) — 헤더 사용자 메뉴에서 연다. 역할 제한 없음(학생 = 학생판, 교직원 = 데스크)
const DesktopAppPage = lazy(() => import('./features/desktop-app/DesktopAppPage'));
// 교실 기기 QR 승인 — 휴대폰으로 QR 을 찍으면 열린다(docs/features/classroom-link.md)
const ClassroomLinkPage = lazy(() => import('./features/classroom-link/ClassroomLinkPage'));
const ClassroomTypePage = lazy(() => import('./features/classroom-link/ClassroomTypePage'));
// 에이전트(MCP) 연결 동의 — Supabase OAuth 2.1 서버가 보내는 곳(대시보드 Authorization Path = /oauth/consent)
const OAuthConsentPage = lazy(() => import('./pages/OAuthConsent'));
// 교실 기기 — 반별 세팅 · 연결 현황 · 구글 로그인 보관(2026-10-14, 프로필 카드에서 독립)
const ClassroomPage = lazy(() => import('./features/classroom-link/ClassroomPage'));
// 에이전트(2026-11-11) — 모바일 «에이전트» 탭의 웹판: 내 PC 데스크 에이전트 대화 방 + 받은 작업 요청 맡기기
const AgentsPage = lazy(() => import('./pages/Agents'));
import Toolbox from './pages/Toolbox';
import HwpxEditor from './pages/HwpxEditor';
import SignaturePopup from "./pages/SignaturePopup";
import TrainingSign from "./pages/TrainingSign";
import ApprovalSign from "./pages/ApprovalSign";
import SignatureSign from "./pages/SignatureSign";
import PublicSign from "./pages/PublicSign";
import TrainingSignLink from "./pages/TrainingSignLink";
import TrainingSignQr from "./pages/TrainingSignQr";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import Evalog from "./features/evalog/EvalogApp";
import RescueNoteApp from "./features/rescue-note/RescueNoteApp";
import CrisisDashboardPage from "./features/rescue-note/CrisisDashboardPage";
import TagDefinitionsAdminPage from "./features/rescue-note/TagDefinitionsAdminPage";
import Evalearn from "./features/evalearn/EvalearnApp";
import CourseAnalyze from "./pages/CourseAnalyze";
import CourseSelection from "./pages/CourseSelection";
import { StudentDashboardPage } from "./features/student-dashboard";
import AdmissionWishlistPage from "./features/admission-wishlist/AdmissionWishlistPage";
import { ClassAssignmentPage } from "./features/class-assignment";
import { SeatArrangementPage } from "./features/seat-arrangement";
import { InquiryDesignPage } from "./features/inquiry-design";
import { InterviewPrepPage } from "./features/interview-prep/InterviewPrepPage";
import KnowledgeGraphPage from "./pages/KnowledgeGraphPage";
import SpacedRepetitionApp from "./features/spaced-repetition/SpacedRepetitionApp";
import { TrainingCertificatePage } from "./features/training-certificate";
import { PurchaseRequestsPage, PurchaseRequestDetailPage } from "./features/purchase-requests";
import SignatureRequestsPage from "./features/e-signature/SignatureRequestsPage";
import { NoticeBoardPage } from "./features/notice-board";
import { VolunteerRegisterPage, GajeongRegisterPage } from "./features/issue-register";
import { ExamSchedulePage } from "./features/exam-schedule";
import { TimetableGeneratorPage } from "./features/timetable-generator";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { RequireAuth } from "./components/auth/RequireAuth";
import { MenuRouteGate } from "./components/auth/MenuRouteGate";
// FACULTY_ROLES = 교사+직원+admin (학교 공통·문서/행정·업무/협업).
// 학생 정보·교무 화면은 종전대로 ['teacher', 'admin'] 유지 — 서버 RLS와 짝을 맞춘다.
import { FACULTY_ROLES, TEACHER_ROLES } from "./lib/roles";
// import SmartDevices from "./pages/SmartDevices"; // SmartThings PAT 만료로 비활성화

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5분간 fresh 유지 - 캐시된 데이터를 5분간 신선하게 유지
      gcTime: 10 * 60 * 1000,          // 10분간 캐시 보관 - 메모리에서 10분간 보관
      refetchOnWindowFocus: true,       // 창 포커스 시 refetch - 날짜 변경 등 최신 데이터 반영
      refetchOnMount: true,             // 첫 마운트는 필요 - 초기 데이터 로딩
      retry: 2,                         // 재시도 횟수 증가 (1→2) - 네트워크 불안정 대응
      refetchOnReconnect: true,         // 네트워크 재연결 시 refetch - 연결 복구 시 최신 데이터
    },
    mutations: {
      retry: 1,                         // 변경 작업 재시도 횟수
    },
  },
});

// ProfileDialogWrapper component to handle auto-opening ProfileEditDialog
/** 옛 «내 할 일»(/my-tasks) → 업무노트(/work). 알림·홈 카드·MCP 가 보내는 ?task=·?collect= 를 그대로 싣는다(2026-11-12) */
const MyTasksRedirect = () => {
  const { search, hash } = useLocation();
  return <Navigate to={`/work${search}${hash}`} replace />;
};

const ProfileDialogWrapper = () => {
  const {
    user,
    profile,
    showProfileDialog,
    setShowProfileDialog,
    checkResourceConnection
  } = useAuth();

  const { updating, updateProfile } = useProfile();

  const handleSave = async (updates: Partial<Profile>) => {
    if (!profile) return false;

    try {
      const success = await updateProfile(updates);

      // Check resource connection again after update
      if (success) {
        setTimeout(() => {
          checkResourceConnection();
        }, 500);
      }

      return success;
    } catch (error) {
      console.error('프로필 저장 오류:', error);
      return false;
    }
  };

  if (!user || !profile) {
    return null;
  }

  return (
    <ProfileEditDialog
      open={showProfileDialog}
      onOpenChange={setShowProfileDialog}
      profile={profile}
      onSave={handleSave}
      updating={updating}
    />
  );
};


// Auto-refetch component to handle visibility changes
const AutoRefetchHandler = () => {
  useEffect(() => {
    let lastVisibilityChange = Date.now();

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const now = Date.now();
        const timeSinceLastChange = now - lastVisibilityChange;

        // 10분 이상 방치된 경우 모든 쿼리 무효화
        if (timeSinceLastChange > 10 * 60 * 1000) {
          console.log('10분 이상 비활성화 감지 - 모든 쿼리 무효화');
          queryClient.invalidateQueries();
        }

        lastVisibilityChange = now;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
};

import { AppErrorBoundary } from '@/components/common/AppErrorBoundary';
import { BrowserNotificationBridge } from '@/components/notifications/BrowserNotificationBridge';
import { AbsenceResolutionHost } from '@/components/schedule/absence/AbsenceResolutionHost';

const App = () => (
  // 최상위 차단막. 안쪽 `label="routes"` 경계는 **BrowserRouter 안**이라 Provider 층
  // (AuthProvider·SidebarProvider·TooltipProvider·Toaster·각종 전역 핸들러)에서 난 예외를
  // 잡지 못한다 — 그 층이 죽으면 여전히 설명 없는 백색 화면이었다. 부팅 경로에서 저장된
  // 값을 읽다 터지는 사고가 정확히 이 층에서 일어나므로(예: localStorage JSON 파싱),
  // 라우터 **바깥**에도 하나가 필요하다. 여기서는 라우터가 없으므로 "홈으로"는
  // window.location 으로 동작한다(AppErrorBoundary 가 그렇게 구현돼 있다).
  <AppErrorBoundary label="root">
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SidebarProvider>
        <TooltipProvider>
          <Toaster />
          <GoogleTokenExpiredHandler />
          <ProfileDialogWrapper />
          <AutoRefetchHandler />
          {import.meta.env.DEV && <Agentation />}
          <BrowserRouter>
            {/* 휴대폰 뒤로가기 = 모달 닫기(`lib/modalBackHistory`)가 라우터 위치를 알아야
                모달 전환을 라우터에게서 감출 수 있다. 화면을 그리지 않는다. 하나만 둘 것. */}
            <ModalBackRouterSync />
            {/* 전역 렌더 오류 차단막. 종전엔 ErrorBoundary 가 하나도 없어 어느 화면의
                예외 하나가 앱 전체를 언마운트하고 설명 없는 백색 화면으로 끝났다.
                BrowserRouter **안쪽**에 둬야 "홈으로" 같은 복구 동선이 의미를 갖고,
                Routes 를 감싸 어느 화면이 죽어도 같은 안내가 나온다. */}
            <AppErrorBoundary label="routes">
            {/* 비활성 메뉴의 라우트 차단. RequireAuth 바깥에 둬야 설정 조회가 인증과
                병렬로 끝나 차단 대상 화면이 잠깐 비치는 일이 없다. */}
            <MenuRouteGate>
            <RequireAuth>
            {/* 알림 realtime 구독 → 브라우저(OS) 알림. 화면을 그리지 않는다.
                RequireAuth **안**이라야 라우터 컨텍스트(클릭 시 이동)와 로그인 조건을
                함께 만족한다. 여기 하나만 둘 것 — 개수만큼 채널이 열려 중복된다. */}
            <BrowserNotificationBridge />
            {/* 출장·개인일정의 결강 처리 모달 — `?absence=<일정 id>` 로 어느 화면에서나 연다.
                입구(생성 직후·일정 상세·알림)가 여러 화면에 흩어져 있어 여기 하나만 둔다. */}
            <AbsenceResolutionHost />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/signature-popup" element={<SignaturePopup />} />
              {/* 로그인 없는 QR 서명 — public 화이트리스트에 있다(토큰이 신원을 정한다) */}
              <Route path="/sign/:token" element={<PublicSign />} />
              {/* 연수 참석 서명 링크(2026-10-25) — 토큰이 곧 신원, 로그인 없음 */}
              <Route path="/training-sign-link/:token" element={<TrainingSignLink />} />
              <Route path="/profile" element={<ProfilePage />} />
              {/* 시간표·암기카드는 학생도 쓰지만 교무/학생 학습 데이터라 직원(staff)은 제외 */}
              <Route path="/timetable" element={<ProtectedRoute allowed={['student', ...TEACHER_ROLES]}><Timetable /></ProtectedRoute>} />

              <Route path="/schedule" element={<Schedule />} />
              <Route path="/duty" element={<Schedule />} /> {/* Redirect to schedule */}
              {/* <Route path="/attendance" element={<Attendance />} />
              <Route path="/homeroom-attendance" element={<HomeroomAttendance />} /> */}
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/notices" element={<ProtectedRoute allowed={FACULTY_ROLES}><NoticeBoardPage /></ProtectedRoute>} />
              <Route path="/documents" element={<ProtectedRoute allowed={FACULTY_ROLES}><Documents /></ProtectedRoute>} />
              <Route path="/search" element={<Search />} />
              <Route path="/admin" element={<ProtectedRoute allowed={['teacher', 'admin']}><Admin /></ProtectedRoute>} />
              {/* 업무 관리 = 페이지 넷(2026-10-05 탭 → 페이지). `/tasks` 는 구 주소(?tab=…)를 받아 넘겨 주는 자리 —
                  둘이 같은 컴포넌트라 페이지를 오가도 모달·딥링크 처리가 끊기지 않는다. 페이지 정의 = lib/taskTabs */}
              <Route path="/tasks" element={<ProtectedRoute allowed={FACULTY_ROLES}><TaskManagement /></ProtectedRoute>} />
              <Route path="/tasks/:page" element={<ProtectedRoute allowed={FACULTY_ROLES}><TaskManagement /></ProtectedRoute>} />
              {/* 옛 «내 할 일» → 업무노트(2026-11-12 합침). ?task=·?collect= 딥링크를 그대로 넘긴다 */}
              <Route path="/my-tasks" element={<MyTasksRedirect />} />
              <Route path="/work" element={<ProtectedRoute allowed={FACULTY_ROLES}><Suspense fallback={<Layout><RouteLoadingOverlay label="업무노트를 여는 중…" /></Layout>}><WorkTodayPage /></Suspense></ProtectedRoute>} />
              <Route path="/work/o/:type/:id" element={<ProtectedRoute allowed={FACULTY_ROLES}><Suspense fallback={<Layout><RouteLoadingOverlay label="한 장 보기를 여는 중…" /></Layout>}><WorkObjectPage /></Suspense></ProtectedRoute>} />
              {/* 업무 진행 화면(반자동 파이프라인, 2026-09-27) — /tasks 접두라 메뉴 노출 게이트가 업무 관리와 같이 적용된다 */}
              {/* 업무 진행의 옛 주소 — 모달로 바뀐 뒤 업무 관리의 ?pipeline= 딥링크로 보낸다 */}
              <Route path="/tasks/works/:workId" element={<ProtectedRoute allowed={FACULTY_ROLES}><WorkPipelineRedirect /></ProtectedRoute>} />
              <Route path="/document-generation" element={<ProtectedRoute allowed={FACULTY_ROLES}><DocumentGenerationPage /></ProtectedRoute>} />
              <Route path="/activities" element={<ProtectedRoute allowed={['student', ...TEACHER_ROLES]}><CreativeActivitiesPage /></ProtectedRoute>} />
              <Route path="/clubs" element={<ProtectedRoute allowed={['student', ...TEACHER_ROLES]}><Suspense fallback={<Layout><RouteLoadingOverlay label="동아리를 여는 중…" /></Layout>}><ClubsPage /></Suspense></ProtectedRoute>} />
              <Route path="/world-today" element={<ProtectedRoute allowed={['student', ...TEACHER_ROLES]}><Suspense fallback={<Layout><RouteLoadingOverlay label="관측소를 여는 중…" /></Layout>}><WorldTodayPage /></Suspense></ProtectedRoute>} />
              <Route path="/ipsi" element={<ProtectedRoute allowed={['student', 'teacher', 'admin']}><IpsiHub /></ProtectedRoute>} />
              <Route path="/videos" element={<VideoPlayer />} />
              <Route path="/collab" element={<ProtectedRoute allowed={FACULTY_ROLES}><CollabBoard /></ProtectedRoute>} />
              <Route path="/collab/:id" element={<ProtectedRoute allowed={FACULTY_ROLES}><BoardDetail /></ProtectedRoute>} />
              <Route path="/student-collab" element={<ProtectedRoute allowed={['student', 'teacher', 'admin']}><StudentCollabBoard /></ProtectedRoute>} />
              <Route path="/student-collab/:id" element={<ProtectedRoute allowed={['student', 'teacher', 'admin']}><StudentBoardDetail /></ProtectedRoute>} />
              <Route path="/calls" element={<ProtectedRoute allowed={FACULTY_ROLES}><Calls /></ProtectedRoute>} />
              {/* 코드 공유 — 학생 + 교직원(직원 포함). 학생 정보가 아니라 FACULTY_ROLES 와 짝 */}
              <Route path="/code-share" element={<ProtectedRoute allowed={['student', ...FACULTY_ROLES]}><Suspense fallback={<Layout><RouteLoadingOverlay label="코드 공유를 여는 중…" /></Layout>}><CodeSharePage /></Suspense></ProtectedRoute>} />
              <Route path="/code-share/:id" element={<ProtectedRoute allowed={['student', ...FACULTY_ROLES]}><Suspense fallback={<Layout><RouteLoadingOverlay label="코드를 여는 중…" /></Layout>}><CodeProjectPage /></Suspense></ProtectedRoute>} />
              {/* 나이스 화면 안내 — 화면 구조·사용법뿐(학생 자료 없음)이라 직원까지 FACULTY_ROLES */}
              <Route path="/classroom" element={<ProtectedRoute allowed={FACULTY_ROLES}><Suspense fallback={<Layout><RouteLoadingOverlay label="교실 기기를 여는 중…" /></Layout>}><ClassroomPage /></Suspense></ProtectedRoute>} />
              <Route path="/classroom/link/:code" element={<ProtectedRoute allowed={FACULTY_ROLES}><Suspense fallback={<Layout><RouteLoadingOverlay label="교실 기기를 확인하는 중…" /></Layout>}><ClassroomLinkPage /></Suspense></ProtectedRoute>} />
              <Route path="/classroom/type/:code" element={<ProtectedRoute allowed={FACULTY_ROLES}><Suspense fallback={<Layout><RouteLoadingOverlay label="교실 기기를 확인하는 중…" /></Layout>}><ClassroomTypePage /></Suspense></ProtectedRoute>} />
              <Route path="/oauth/consent" element={<ProtectedRoute allowed={FACULTY_ROLES}><Suspense fallback={null}><OAuthConsentPage /></Suspense></ProtectedRoute>} />
              <Route path="/desktop-app" element={<Suspense fallback={<Layout><RouteLoadingOverlay label="PC 앱 정보를 여는 중…" /></Layout>}><DesktopAppPage /></Suspense>} />
              <Route path="/agents" element={<ProtectedRoute allowed={FACULTY_ROLES}><Suspense fallback={<Layout><RouteLoadingOverlay label="내 PC 를 찾는 중…" /></Layout>}><AgentsPage /></Suspense></ProtectedRoute>} />
              <Route path="/contexts" element={<ProtectedRoute allowed={FACULTY_ROLES}><Suspense fallback={<Layout><RouteLoadingOverlay label="맥락 관리를 여는 중…" /></Layout>}><ContextsPage /></Suspense></ProtectedRoute>} />
              <Route path="/neis-guide" element={<ProtectedRoute allowed={FACULTY_ROLES}><Suspense fallback={<Layout><RouteLoadingOverlay label="나이스 안내를 여는 중…" /></Layout>}><NeisGuidePage /></Suspense></ProtectedRoute>} />
              <Route path="/automations" element={<ProtectedRoute allowed={FACULTY_ROLES}><Suspense fallback={<Layout><RouteLoadingOverlay label="자동화 업무를 여는 중…" /></Layout>}><AutomationsPage /></Suspense></ProtectedRoute>} />
              <Route path="/toolbox" element={<ProtectedRoute allowed={FACULTY_ROLES}><Toolbox /></ProtectedRoute>} />
              <Route path="/toolbox/hwpx-editor" element={<ProtectedRoute allowed={FACULTY_ROLES}><HwpxEditor /></ProtectedRoute>} />
              <Route path="/dev-tools" element={<ProtectedRoute allowed={['teacher', 'admin']}><DevTools /></ProtectedRoute>} />
              <Route path="/iframe/:id" element={<IframePage />} />
              <Route path="/training-signature-print" element={<TrainingSignaturePrint />} />
              {/* QR로 여는 연수 서명 화면. public이 아니라 로그인 필수(익명 서명 금지, 2026-08-14) */}
              {/* 연수 알림이 여는 «내 서명 QR» — 로그인한 참석자가 휴대폰으로 찍어 로그인 없이 서명 */}
              <Route
                path="/training-sign-qr/:meetingId"
                element={<ProtectedRoute allowed={['teacher', 'admin']}><TrainingSignQr /></ProtectedRoute>}
              />
              <Route
                path="/training-sign/:meetingId"
                element={<ProtectedRoute allowed={['teacher', 'admin']}><TrainingSign /></ProtectedRoute>}
              />
              {/* QR로 여는 결재 서명 화면. 마찬가지로 public 아님 — 서버가 결재자 본인을 재검증한다 */}
              <Route
                path="/approval-sign/:requestId"
                element={<ProtectedRoute allowed={FACULTY_ROLES}><ApprovalSign /></ProtectedRoute>}
              />
              {/* QR로 여는 전자서명 화면 — 같은 이유로 public 아님(서버가 서명자 본인을 재검증) */}
              <Route
                path="/signature-sign/:requestId"
                element={<ProtectedRoute allowed={FACULTY_ROLES}><SignatureSign /></ProtectedRoute>}
              />
              <Route path="/" element={<Index />} />
              {/* 학생 개인정보 화면 — 라우트 가드가 없어 직원도 열 수 있었다(데이터는 RLS가 막았지만
                  페이지는 떴다). 2026-08-14부터 교사·admin만. */}
              {/* 생기부 분석 — 학생은 **자기 기록만** 본다. EvalogApp 의 `isStudent` 분기가 단일 패널로
                  바뀌고 `useStudentSelfData` 가 본인 1행만 읽으며, 서버 RLS 도 본인 것만 준다
                  (실측: student_basic_info 871행 중 학생에게 1행). 종전엔 TEACHER_ROLES 라
                  **학생 메뉴에는 있는데 누르면 튕기는** 상태였다 — navigation.ts 의
                  studentNavSections·studentAllowedRoutes 는 이미 학생을 상정하고 있었다. */}
              <Route path="/evalog" element={<ProtectedRoute allowed={['student', ...TEACHER_ROLES]}><Evalog /></ProtectedRoute>} />
              <Route path="/rescue-note" element={<ProtectedRoute allowed={TEACHER_ROLES}><RescueNoteApp /></ProtectedRoute>} />
              <Route path="/rescue-note/dashboard" element={<ProtectedRoute allowed={TEACHER_ROLES}><CrisisDashboardPage /></ProtectedRoute>} />
              <Route path="/rescue-note/admin/tags" element={<ProtectedRoute allowed={TEACHER_ROLES}><TagDefinitionsAdminPage /></ProtectedRoute>} />
              <Route path="/evalearn" element={<ProtectedRoute allowed={['student', 'teacher', 'admin']}><Evalearn /></ProtectedRoute>} />
              <Route path="/course-analyze" element={<ProtectedRoute allowed={['teacher', 'admin']}><CourseAnalyze /></ProtectedRoute>} />
              <Route path="/course-selection" element={<ProtectedRoute allowed={['student', 'teacher', 'admin']}><CourseSelection /></ProtectedRoute>} />
              <Route path="/student-dashboard" element={<ProtectedRoute allowed={['teacher', 'admin']}><StudentDashboardPage /></ProtectedRoute>} />
              <Route path="/admission-wishlist" element={<ProtectedRoute allowed={['student', 'teacher', 'admin']}><AdmissionWishlistPage /></ProtectedRoute>} />
              <Route path="/class-assignment" element={<ProtectedRoute allowed={['teacher', 'admin']}><ClassAssignmentPage /></ProtectedRoute>} />
              <Route path="/seat-arrangement" element={<ProtectedRoute allowed={['teacher', 'admin']}><SeatArrangementPage /></ProtectedRoute>} />
              <Route path="/study-room-stats" element={<ProtectedRoute allowed={TEACHER_ROLES}><Suspense fallback={null}><StudyRoomStatsPage /></Suspense></ProtectedRoute>} />
              <Route path="/inquiry-design" element={<ProtectedRoute allowed={['student', 'teacher', 'admin']}><InquiryDesignPage /></ProtectedRoute>} />
              {/* 면접 준비는 **학생 전용**이다. 교사는 생기부 분석의 [면접 준비] 탭에서
                  학생 답변을 읽는다. admin 은 학생 시점 미리보기로 화면을 확인한다
                  (`ProtectedRoute` 가 `effectiveRole` 로 판정한다). */}
              <Route path="/interview-prep" element={<ProtectedRoute allowed={['student', ...TEACHER_ROLES]}><InterviewPrepPage /></ProtectedRoute>} />
              <Route path="/academy/:place?" element={<ProtectedRoute allowed={['student', 'teacher', 'admin']}><Suspense fallback={<AcademyLoadingScreen />}><AcademyPage /></Suspense></ProtectedRoute>} />
              <Route path="/planner" element={<ProtectedRoute allowed={['student', 'teacher', 'admin']}><Suspense fallback={<Layout><RouteLoadingOverlay label="플래너를 불러오는 중…" /></Layout>}><PlannerPage /></Suspense></ProtectedRoute>} />
              {/* 다마고찌 — 전체 화면 앱(앱 껍데기 없이). 학생·교사·관리자 모두 서버 저장(2026-10-07 교사 추가), 직원은 닫힘 — docs/features/tamagotchi.md */}
              <Route path="/tamagotchi" element={<ProtectedRoute allowed={['student', 'teacher', 'admin']}><Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-[#e9ddff] text-sm text-violet-900">다마고찌를 깨우는 중…</div>}><TamagotchiPage /></Suspense></ProtectedRoute>} />
              {/* 별까지 쌓기 — 전체 화면 앱. 학생·교사·관리자(서버 tower_private.actor() 와 짝), 직원은 닫힘 — docs/features/star-tower.md */}
              <Route path="/star-tower" element={<ProtectedRoute allowed={['student', 'teacher', 'admin']}><Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-[#07081a] text-sm text-indigo-100">탑으로 가는 중…</div>}><StarTowerPage /></Suspense></ProtectedRoute>} />
              {/* 코인 얻는 법 — 통합 지갑 보상 안내(2026-10-27). 지갑을 쓰는 게임들과 같은 역할, 직원은 닫힘 */}
              {/* 이세계 사회인 — 독 게임의 내 기록·업적. 학생·교사·관리자(서버 isekai3d_require_player 와 짝) — docs/features/isekai.md */}
              <Route path="/isekai" element={<ProtectedRoute allowed={['student', 'teacher', 'admin']}><Suspense fallback={<Layout><RouteLoadingOverlay label="사원증을 찾는 중…" /></Layout>}><IsekaiPage /></Suspense></ProtectedRoute>} />
              <Route path="/coins" element={<ProtectedRoute allowed={['student', 'teacher', 'admin']}><Suspense fallback={<Layout><RouteLoadingOverlay label="지갑을 여는 중…" /></Layout>}><CoinGuidePage /></Suspense></ProtectedRoute>} />
              <Route path="/knowledge-graph" element={<ProtectedRoute allowed={['teacher', 'admin']}><KnowledgeGraphPage /></ProtectedRoute>} />
              <Route path="/spaced-repetition" element={<ProtectedRoute allowed={['student', ...TEACHER_ROLES]}><SpacedRepetitionApp /></ProtectedRoute>} />
              <Route path="/training-certificates" element={<ProtectedRoute allowed={['teacher', 'admin']}><TrainingCertificatePage /></ProtectedRoute>} />
              {/* 전자서명 — 교직원 전용(학생은 서명 대상이 아니다) */}
              <Route path="/signatures" element={<ProtectedRoute allowed={FACULTY_ROLES}><SignatureRequestsPage /></ProtectedRoute>} />
              <Route path="/purchase-requests" element={<ProtectedRoute allowed={['student', ...FACULTY_ROLES]}><PurchaseRequestsPage /></ProtectedRoute>} />
              <Route path="/purchase-requests/:id" element={<ProtectedRoute allowed={['student', ...FACULTY_ROLES]}><PurchaseRequestDetailPage /></ProtectedRoute>} />
              <Route path="/issue-register/volunteer" element={<ProtectedRoute allowed={FACULTY_ROLES}><VolunteerRegisterPage /></ProtectedRoute>} />
              <Route path="/issue-register/gajeong" element={<ProtectedRoute allowed={FACULTY_ROLES}><GajeongRegisterPage /></ProtectedRoute>} />
              <Route path="/exam-schedule" element={<ProtectedRoute allowed={['teacher', 'admin']}><ExamSchedulePage mode="list" /></ProtectedRoute>} />
              <Route path="/exam-schedule/new" element={<ProtectedRoute allowed={['teacher', 'admin']}><ExamSchedulePage mode="new" /></ProtectedRoute>} />
              <Route path="/exam-schedule/mock/new" element={<ProtectedRoute allowed={['teacher', 'admin']}><ExamSchedulePage mode="mock-new" /></ProtectedRoute>} />
              <Route path="/exam-schedule/:id" element={<ProtectedRoute allowed={['teacher', 'admin']}><ExamSchedulePage mode="detail" /></ProtectedRoute>} />
              <Route path="/timetable-generator" element={<ProtectedRoute allowed={['teacher', 'admin']}><TimetableGeneratorPage mode="list" /></ProtectedRoute>} />
              <Route path="/timetable-generator/new" element={<ProtectedRoute allowed={['teacher', 'admin']}><TimetableGeneratorPage mode="new" /></ProtectedRoute>} />
              <Route path="/timetable-generator/preview" element={<ProtectedRoute allowed={['teacher', 'admin']}><TimetableGeneratorPage mode="preview" /></ProtectedRoute>} />
              <Route path="/timetable-generator/:id" element={<ProtectedRoute allowed={['teacher', 'admin']}><TimetableGeneratorPage mode="detail" /></ProtectedRoute>} />
              {/* <Route path="/smart-devices" element={<SmartDevices />} /> */}{/* SmartThings PAT 만료로 비활성화 */}
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </RequireAuth>
            </MenuRouteGate>
            </AppErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </SidebarProvider>
    </AuthProvider>
  </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
