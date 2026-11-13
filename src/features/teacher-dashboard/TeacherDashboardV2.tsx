import { useMemo } from 'react';
import { useDepartmentNotices } from '@/features/notice-board/hooks/useNotices';
import { isNoticeActive, todayStr } from '@/features/notice-board/utils/noticeDates';
import type { TeacherDashboardProps } from './types';
import { useSeatOverviewAccess } from './hooks/useSeatOverviewAccess';
import { DashboardInfoCardsV2 } from './components/DashboardInfoCardsV2';
import { HomeroomStudentOverviewCard } from './components/HomeroomStudentOverviewCard';
import { SeatReservationOverviewCard } from './components/SeatReservationOverviewCard';
import { TeacherNotificationsCard } from './components/TeacherNotificationsCard';
import { TeacherTasksCard } from './components/TeacherTasksCard';
import { TeacherDashboardBriefing } from './components/TeacherDashboardBriefing';
import { TeacherNoticesCard } from './components/TeacherNoticesCard';
import { ApprovalInboxCard } from '@/features/approval/components/ApprovalInboxCard';
import { SignatureInboxCard } from '@/features/e-signature/components/SignatureInboxCard';
import { ActivityProposalHomeCard } from '@/features/creative-activities/components/ActivityProposalHomeCard';
import { TeacherTodayScheduleCard } from './components/TeacherTodayScheduleCard';
import { TeacherWeekAgendaCard } from './components/TeacherWeekAgendaCard';
import { PlannerHomeCard } from '@/features/planner/PlannerHomeCard';
import { CustomizableDashboard, type DashboardWidget } from '@/components/dashboard/CustomizableDashboard';
import './teacher-dashboard.css';

export function TeacherDashboardV2({
  myTasksData,
  currentResourceId,
  loadingTasks,
  notifications,
  loadingNotifications,
}: TeacherDashboardProps) {
  const seatAccess = useSeatOverviewAccess(currentResourceId);

  // 공지 카드는 활성 공지가 없으면 스스로 렌더하지 않는다. 첫 행을 3열로 두려면
  // 부모도 그 사실을 알아야 빈 칸이 생기지 않는다(같은 쿼리 캐시 재사용).
  const { data: notices = [] } = useDepartmentNotices();
  const hasActiveNotices = useMemo(() => {
    const today = todayStr();
    return notices.some((notice) => isNoticeActive(notice, today));
  }, [notices]);

  // 카드 목록 = «홈 꾸미기»의 정의(순서·기본 크기). 기본 크기는 화면 맥락(공지 유무·좌석 권한)에 맞춘 종전 배치 그대로다.
  // 사람마다 바꾼 순서·크기·숨김은 `CustomizableDashboard` 가 얹는다(판정 `@/lib/dashboardLayout`, 2026-10-25).
  // 결재·서명 대기·공지처럼 보여 줄 것이 없으면 null 인 카드는 칸째 사라진다(구멍 없음).
  const widgets: DashboardWidget[] = [
    {
      id: 'briefing', label: '오늘 요약', description: '인사 · 오늘의 할 일 · 알림', defaultSpan: 12, fixedSpan: true,
      render: () => <TeacherDashboardBriefing myTasksData={myTasksData} currentResourceId={currentResourceId} notifications={notifications} />,
    },
    {
      id: 'today-schedule', label: '오늘의 흐름', description: '오늘 수업·일정', defaultSpan: hasActiveNotices ? 4 : 7,
      render: () => <section className="h-full" aria-label="오늘의 흐름"><TeacherTodayScheduleCard currentResourceId={currentResourceId} /></section>,
    },
    {
      id: 'week-agenda', label: '이번 주 일정', defaultSpan: hasActiveNotices ? 4 : 5,
      render: () => <section className="h-full" aria-label="이번 주 일정"><TeacherWeekAgendaCard myTasksData={myTasksData} currentResourceId={currentResourceId} /></section>,
    },
    { id: 'notices', label: '학교 공지', description: '활성 공지가 있을 때만', defaultSpan: 4, render: () => <TeacherNoticesCard className="h-full" /> },
    { id: 'approvals', label: '결재 대기', description: '내 차례인 결재가 있을 때만', defaultSpan: 12, render: () => <ApprovalInboxCard /> },
    { id: 'signatures', label: '서명 대기', description: '서명할 문서가 있을 때만', defaultSpan: 12, render: () => <SignatureInboxCard /> },
    {
      id: 'tasks', label: '내 할 일', defaultSpan: seatAccess.canView ? 7 : 12,
      render: () => (
        <section className="h-full" aria-label="내 할 일">
          <TeacherTasksCard myTasksData={myTasksData} currentResourceId={currentResourceId} isLoading={loadingTasks} />
        </section>
      ),
    },
    {
      id: 'seat-overview', label: '자습 좌석 출석', description: '볼 권한이 있을 때만', defaultSpan: 5,
      render: () => seatAccess.canView ? (
        <section className="h-full" aria-label="자습 좌석 출석 현황">
          <SeatReservationOverviewCard enabled={seatAccess.canView} accessReason={seatAccess.reason} />
        </section>
      ) : null,
    },
    { id: 'planner', label: '오늘의 플래너', description: '오늘 계획 · 바로 체크', defaultSpan: 6, render: () => <PlannerHomeCard /> },
    { id: 'homeroom', label: '우리 반 학생', description: '담임·학년 담당일 때', defaultSpan: 12, render: () => <HomeroomStudentOverviewCard currentResourceId={currentResourceId} /> },
    {
      id: 'notifications', label: '최근 알림', defaultSpan: 6,
      render: () => <section className="h-full" aria-label="최근 알림"><TeacherNotificationsCard notifications={notifications} isLoading={loadingNotifications} /></section>,
    },
    {
      id: 'info', label: '안내 상자', description: '관리자가 올린 안내', defaultSpan: 6, multi: true,
      render: () => <DashboardInfoCardsV2 excludeTitles={['학사 정보 알림']} cardClassName="min-w-0" />,
    },
    // 창의적 체험활동 제안 — 기본 배치는 화면 가장 아래(사용자 결정 2026-09-11)
    { id: 'activity-proposals', label: '창체 활동 제안', defaultSpan: 12, render: () => <ActivityProposalHomeCard className="min-w-0" /> },
  ];

  return (
    <CustomizableDashboard
      kind="teacher"
      widgets={widgets}
      className="teacher-dashboard-v2 col-span-full grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-12"
    />
  );
}
