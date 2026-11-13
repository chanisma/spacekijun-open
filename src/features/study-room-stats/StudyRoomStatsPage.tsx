import { useState } from 'react';
import { Loader2, Library } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { StatsToolbar, type StatsTab } from './components/StatsToolbar';
import { SummaryTab } from './components/SummaryTab';
import { StudentsTab } from './components/StudentsTab';
import { WeekdayTab } from './components/WeekdayTab';
import { TemperatureTab } from './components/TemperatureTab';
import {
  useStudyRoomStudents,
  useStudyRoomSummary,
  useStudyRoomTemperature,
  useStudyRooms,
  useStudyRoomWeekday,
} from './hooks/useStudyRoomStats';
import { defaultMonthFilters } from './utils/statsFormat';
import type { StatsFilters } from './types';

/**
 * 자습실 통계 — seaton(자습실 좌석 신청) 통계 페이지의 내용을 spacekijun 에서 본다.
 * 판정·집계는 전부 서버 계약 RPC(seaton_stats_*)가 한다. 이 화면은 그리기만.
 * 교사·관리자 전용(학생 정보) — 라우트 가드 + RPC 가드(is_teacher_or_admin).
 */
export default function StudyRoomStatsPage() {
  const [tab, setTab] = useState<StatsTab>('summary');
  const [filters, setFilters] = useState<StatsFilters>(() => defaultMonthFilters());
  const [month, setMonth] = useState(() => defaultMonthFilters().start.slice(0, 7));

  const rooms = useStudyRooms();
  const summary = useStudyRoomSummary(filters, tab === 'summary');
  const students = useStudyRoomStudents(filters, tab === 'students');
  const weekday = useStudyRoomWeekday(filters, tab === 'weekday');
  const temperature = useStudyRoomTemperature(`${month}-01`, filters.grade, tab === 'temperature');

  const active = { summary, students, weekday, temperature }[tab];

  return (
    <Layout>
      <PageContainer>
        <StatsToolbar
          tab={tab}
          onTab={setTab}
          filters={filters}
          onFilters={setFilters}
          rooms={rooms.data ?? []}
          month={month}
          onMonth={setMonth}
        />

        {active.isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
        ) : active.error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            통계를 불러오지 못했습니다: {active.error instanceof Error ? active.error.message : String(active.error)}
          </div>
        ) : !active.data ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100"><Library className="h-8 w-8 text-blue-500" /></div>
            <h3 className="text-base font-semibold text-slate-700">표시할 기록이 없습니다</h3>
          </div>
        ) : (
          <div className={active.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {tab === 'summary' && summary.data && <SummaryTab data={summary.data} />}
            {tab === 'students' && students.data && <StudentsTab data={students.data} />}
            {tab === 'weekday' && weekday.data && <WeekdayTab data={weekday.data} />}
            {tab === 'temperature' && temperature.data && <TemperatureTab data={temperature.data} />}
          </div>
        )}
      </PageContainer>
    </Layout>
  );
}
