import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { Layout } from '@/components/layout/Layout';
import { ChevronDown, Loader2 } from 'lucide-react';
import { AdminSidebar, AdminTab, adminTabEntry } from '@/components/admin/layout/AdminSidebar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

// Lazy load admin components for better initial page load
const UserManagement = lazy(() => import('@/components/admin/UserManagement').then(m => ({ default: m.UserManagement })));
const TeacherManagement = lazy(() => import('@/components/admin/TeacherManagement').then(m => ({ default: m.TeacherManagement })));
const SystemSettings = lazy(() => import('@/components/admin/SystemSettings').then(m => ({ default: m.SystemSettings })));
const ResourceManagement = lazy(() => import('@/components/admin/ResourceManagement').then(m => ({ default: m.ResourceManagement })));
const AccountManagement = lazy(() => import('@/components/admin/AccountManagement').then(m => ({ default: m.AccountManagement })));
const SectionManagement = lazy(() => import('@/components/admin/SectionManagement').then(m => ({ default: m.SectionManagement })));
const CurriculumManagement = lazy(() => import('@/components/admin/CurriculumManagement').then(m => ({ default: m.CurriculumManagement })));
const CourseOfferingManagement = lazy(() => import('@/components/admin/CourseOfferingManagement').then(m => ({ default: m.CourseOfferingManagement })));
const StudentEnrollmentManagement = lazy(() => import('@/components/admin/StudentEnrollmentManagement').then(m => ({ default: m.StudentEnrollmentManagement })));
const StudentTimetableManagement = lazy(() => import('@/components/admin/StudentTimetableManagement').then(m => ({ default: m.StudentTimetableManagement })));
const TeacherTimetableManagement = lazy(() => import('@/components/admin/TeacherTimetableManagement').then(m => ({ default: m.TeacherTimetableManagement })));
const CourseSelectableSubjectManagement = lazy(() => import('@/components/admin/CourseSelectableSubjectManagement').then(m => ({ default: m.CourseSelectableSubjectManagement })));
const CourseSelectionHistoryManagement = lazy(() => import('@/components/admin/CourseSelectionHistoryManagement').then(m => ({ default: m.CourseSelectionHistoryManagement })));
const MeetingManagement = lazy(() => import('@/components/admin/MeetingManagement').then(m => ({ default: m.MeetingManagement })));
const StudentManagement = lazy(() => import('@/components/admin/StudentManagement').then(m => ({ default: m.StudentManagement })));
const StudentDataManagement = lazy(() => import('@/components/admin/StudentDataManagement').then(m => ({ default: m.StudentDataManagement })));
const MenuManagement = lazy(() => import('@/components/admin/MenuManagement').then(m => ({ default: m.MenuManagement })));
const IframeManagement = lazy(() => import('@/components/admin/IframeManagement').then(m => ({ default: m.IframeManagement })));
const PermissionManagement = lazy(() => import('@/components/admin/PermissionManagement').then(m => ({ default: m.PermissionManagement })));
const NotificationManagement = lazy(() => import('@/components/admin/NotificationManagement').then(m => ({ default: m.NotificationManagement })));
const DashboardInfoManagement = lazy(() => import('@/components/admin/DashboardInfoManagement').then(m => ({ default: m.DashboardInfoManagement })));
const PluginManagement = lazy(() => import('@/components/admin/PluginManagement').then(m => ({ default: m.PluginManagement })));
const DepartmentManagement = lazy(() => import('@/components/admin/DepartmentManagement').then(m => ({ default: m.DepartmentManagement })));
const SubjectClassificationManagement = lazy(() => import('@/components/admin/SubjectClassificationManagement').then(m => ({ default: m.SubjectClassificationManagement })));
const DutySeatManagement = lazy(() => import('@/components/admin/DutySeatManagement').then(m => ({ default: m.DutySeatManagement })));
const TagManagement = lazy(() => import('@/components/admin/TagManagement').then(m => ({ default: m.TagManagement })));
const AdminDashboardOverview = lazy(() => import('@/components/admin/layout/AdminDashboardOverview').then(m => ({ default: m.AdminDashboardOverview })));
const TamagotchiAdmin = lazy(() => import('@/components/admin/TamagotchiAdmin').then(m => ({ default: m.TamagotchiAdmin })));
const StarTowerAdmin = lazy(() => import('@/components/admin/StarTowerAdmin').then(m => ({ default: m.StarTowerAdmin })));
const Isekai3dAdmin = lazy(() => import('@/components/admin/Isekai3dAdmin').then(m => ({ default: m.Isekai3dAdmin })));
const CoinEconomyAdmin = lazy(() => import('@/components/admin/CoinEconomyAdmin').then(m => ({ default: m.CoinEconomyAdmin })));
const AutomationAdmin = lazy(() => import('@/components/admin/AutomationAdmin').then(m => ({ default: m.AutomationAdmin })));
const McpAgentManagement = lazy(() => import('@/components/admin/McpAgentManagement').then(m => ({ default: m.McpAgentManagement })));
const AiLogManagement = lazy(() => import('@/components/admin/AiLogManagement').then(m => ({ default: m.AiLogManagement })));
const AcademyWorkshopManagement =lazy(() => import('@/components/admin/AcademyWorkshopManagement').then(m => ({ default: m.AcademyWorkshopManagement })));

// Loading fallback component
const TabLoading = () => (
  <div className="flex items-center justify-center h-48">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

export default function Admin() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab');
  // ?tab= 으로 바로 여는 탭(알림 → 관리자 화면) — 공방 주문 · 다마고찌 캐릭터 의뢰 · AI 기록
  const deepTab = (t: string | null): AdminTab | null => (t === 'academy-workshop' || t === 'tamagotchi' || t === 'ai-logs' ? t : null);
  const [activeTab, setActiveTab] = useState<AdminTab>(deepTab(requestedTab) ?? 'dashboard');
  useEffect(() => { const t = deepTab(requestedTab); if (t) setActiveTab(t); }, [requestedTab]);
  // 휴대폰 — 사이드바가 숨으므로 머리 막대 → 왼쪽 시트로 같은 목록을 연다
  const [menuOpen, setMenuOpen] = useState(false);
  function changeTab(tab: AdminTab) {
    setActiveTab(tab);
    setMenuOpen(false);
    setParams(previous => { const next = new URLSearchParams(previous); next.delete('order'); next.delete('decor'); if (deepTab(tab)) next.set('tab', tab); else next.delete('tab'); return next; });
  }

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-destructive mb-2">접근 권한이 없습니다</h2>
            <p className="text-muted-foreground">관리자만 접근할 수 있는 페이지입니다.</p>
          </div>
        </div>
      </Layout>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'academy-workshop':
        return <AcademyWorkshopManagement />;
      case 'tamagotchi':
        return <TamagotchiAdmin />;
      case 'star-tower':
        return <StarTowerAdmin />;
      case 'isekai3d':
        return <Isekai3dAdmin />;
      case 'coins':
        return <CoinEconomyAdmin />;
      case 'ai-logs':
        return <AiLogManagement />;
      case 'mcp-agents':
        return <McpAgentManagement />;
      case 'automations':
        return <AutomationAdmin />;
      case 'dashboard':
        return <AdminDashboardOverview onNavigateTab={setActiveTab} />;
      case 'users':
        return <UserManagement />;
      case 'teachers':
        return <TeacherManagement />;
      case 'resources':
        return <ResourceManagement />;
      case 'accounts':
        return <AccountManagement />;
      case 'sections':
        return <SectionManagement />;
      case 'curriculum':
        return <CurriculumManagement />;
      case 'offerings':
        return <CourseOfferingManagement />;
      case 'enrollments':
        return <StudentEnrollmentManagement />;
      case 'timetables':
        return <StudentTimetableManagement />;
      case 'teacher-timetables':
        return <TeacherTimetableManagement />;
      case 'selectable-subjects':
        return <CourseSelectableSubjectManagement />;
      case 'selection-history':
        return <CourseSelectionHistoryManagement />;
      case 'meetings':
        return <MeetingManagement />;
      case 'permissions':
        return <PermissionManagement />;
      case 'notifications':
        return <NotificationManagement />;
      case 'students':
        return <StudentManagement />;
      case 'student-data':
        return <StudentDataManagement />;
      case 'menus':
        return <MenuManagement />;
      case 'iframes':
        return <IframeManagement />;
      case 'dashboard-info':
        return <DashboardInfoManagement />;
      case 'plugins':
        return <PluginManagement />;
      case 'departments':
        return <DepartmentManagement />;
      case 'subject-groups':
        return <SubjectClassificationManagement />;
      case 'duty-seats':
        return <DutySeatManagement />;
      case 'tags':
        return <TagManagement />;
      case 'settings':
        return <SystemSettings />;
      default:
        return <AdminDashboardOverview onNavigateTab={setActiveTab} />;
    }
  };

  return (
    <Layout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-lg border bg-background shadow-sm">
        <AdminSidebar
          activeTab={activeTab}
          onTabChange={changeTab}
          className="hidden md:flex flex-shrink-0"
        />
        <main className="flex min-w-0 flex-1 flex-col bg-secondary/10">
          {(() => {
            const current = adminTabEntry(activeTab);
            return (
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-haspopup="dialog"
                aria-label={`관리 메뉴 열기 — 지금 ${current.label}`}
                className="flex h-12 flex-shrink-0 items-center gap-2 border-b bg-card px-3 text-left md:hidden"
              >
                <current.icon className="h-4 w-4 text-blue-600" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{current.label}</span>
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">관리 메뉴 <ChevronDown className="h-4 w-4" /></span>
              </button>
            );
          })()}
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-3 sm:p-6 md:p-8 max-w-7xl mx-auto">
              <Suspense fallback={<TabLoading />}>
                {renderContent()}
              </Suspense>
            </div>
          </ScrollArea>
        </main>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[18rem] max-w-[85vw] p-0">
          <SheetTitle className="sr-only">관리 메뉴</SheetTitle>
          <AdminSidebar activeTab={activeTab} onTabChange={changeTab} className="w-full border-r-0" />
        </SheetContent>
      </Sheet>
    </Layout>
  );
}
