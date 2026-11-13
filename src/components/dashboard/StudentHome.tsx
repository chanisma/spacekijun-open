import { Sparkles } from 'lucide-react';
import { MealCard } from '@/components/dashboard/MealCard';
import { StudentWeeklyScheduleCard } from '@/components/dashboard/cards/StudentWeeklyScheduleCard';
import { StudentTodayTimetableCard } from '@/components/dashboard/cards/StudentTodayTimetableCard';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { DashboardInfoCardsV2 } from '@/features/teacher-dashboard/components/DashboardInfoCardsV2';
import { StudentHomeActivities } from '@/features/student-home/StudentHomeActivities';
import { StudentTodayStudy } from '@/features/student-home/StudentTodayStudy';
import { StudentHomeResources } from '@/features/student-home/StudentHomeResources';
import { ActivityProposalHomeCard } from '@/features/creative-activities/components/ActivityProposalHomeCard';
import { WorldTodayHomeCard } from '@/features/world-today/components/WorldTodayHomeCard';
import { InterviewPrepHomeCard } from '@/features/interview-prep/components/InterviewPrepHomeCard';
import { TamagotchiHomeCard } from '@/features/tamagotchi/components/TamagotchiHomeCard';
import { PlannerHomeCard } from '@/features/planner/PlannerHomeCard';
import { CustomizableDashboard, type DashboardWidget } from '@/components/dashboard/CustomizableDashboard';
import '@/features/teacher-dashboard/teacher-dashboard.css';

export const StudentHome = () => {
  const now = useCurrentTime();

  // 카드 목록 = «홈 꾸미기»의 정의(순서·기본 크기는 종전 배치 그대로). 판정 = `@/lib/dashboardLayout` (2026-10-25)
  const widgets: DashboardWidget[] = [
    {
      id: 'briefing', label: '오늘 요약', description: '인사 · 오늘의 공부', defaultSpan: 12, fixedSpan: true,
      render: () => (
        <section className="teacher-dashboard-briefing col-span-full px-5 py-5 sm:px-7 sm:py-6" aria-label="학생 홈 안내">
          <div className="relative z-[1] grid items-center gap-5 lg:grid-cols-2 lg:gap-8">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium">
                <span className="inline-flex items-center gap-1.5 font-bold text-sky-700">
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> 나의 학교생활
                </span>
                <span className="text-slate-500">
                  {now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
                </span>
              </div>
              <h1 className="mt-3 text-xl font-bold tracking-[-0.035em] text-slate-950 sm:text-[28px]">오늘의 학교생활을 한눈에.</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">수업부터 학교 일정, 급식까지 차근차근 확인해 보세요.</p>
            </div>
            <StudentTodayStudy />
          </div>
        </section>
      ),
    },
    {
      id: 'timetable', label: '오늘의 시간표', defaultSpan: 5,
      render: () => <section id="student-timetable" className="h-full min-w-0 scroll-mt-24" aria-label="오늘의 시간표"><StudentTodayTimetableCard /></section>,
    },
    {
      id: 'week', label: '이번 주 일정', defaultSpan: 4,
      render: () => <section id="student-week" className="h-full min-w-0 scroll-mt-24" aria-label="이번 주 일정"><StudentWeeklyScheduleCard /></section>,
    },
    {
      id: 'meal', label: '오늘의 급식', defaultSpan: 3,
      render: () => <section id="student-meal" className="h-full min-w-0 scroll-mt-24" aria-label="오늘의 급식"><MealCard /></section>,
    },
    { id: 'planner', label: '오늘의 플래너', description: '오늘 계획 · 바로 체크', defaultSpan: 6, render: () => <PlannerHomeCard /> },
    // 오늘의 면접 질문 — 하루 한 번짜리 기능은 메뉴 안에만 있으면 학생이 오지 않는다. 질문이 먼저 보여야 답한다.
    { id: 'interview', label: '오늘의 면접 질문', defaultSpan: 6, render: () => <InterviewPrepHomeCard /> },
    // 다마고찌 — 메뉴 스위치를 따르고 펫 상태만 말한다(시간표·급식은 위 카드가 이미 말한다)
    { id: 'tamagotchi', label: '다마고찌', defaultSpan: 6, render: () => <TamagotchiHomeCard /> },
    { id: 'world-today', label: '요즘 세상', defaultSpan: 12, render: () => <WorldTodayHomeCard /> },
    { id: 'resources', label: '구매 신청 · 입시 정보', defaultSpan: 12, render: () => <StudentHomeResources /> },
    // 활동 제안은 '최근 입시 정보' 바로 다음이다 — 소식을 읽고 나서 활동으로 잇는 흐름.
    { id: 'activity-proposals', label: '창체 활동 제안', defaultSpan: 12, render: () => <ActivityProposalHomeCard className="min-w-0" /> },
    {
      id: 'info', label: '안내 상자', description: '관리자가 올린 안내', defaultSpan: 12, multi: true,
      render: () => <DashboardInfoCardsV2 includeStandaloneContent excludeTitles={['학사 정보 알림']} cardClassName="min-w-0" />,
    },
    // 수강신청 마감·내 자습 예약은 기본 배치에서 하단(2026-09-12 사용자 지시)
    { id: 'activities', label: '수강신청 · 자습 예약', defaultSpan: 12, render: () => <StudentHomeActivities /> },
  ];

  return (
    <CustomizableDashboard
      kind="student"
      widgets={widgets}
      className="teacher-dashboard-v2 col-span-full grid min-w-0 grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-12"
    />
  );
};
