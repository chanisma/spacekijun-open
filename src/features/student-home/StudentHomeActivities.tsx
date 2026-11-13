import { useQuery } from '@tanstack/react-query';
import { Armchair, ArrowRight, ClipboardList, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { useMenuVisibility } from '@/hooks/useMenuVisibility';
import { isPathVisible } from '@/lib/menuVisibility';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentActor } from '@/features/course-selection/hooks/useCurrentActor';
import { DashboardCardShell, DashboardCardSkeleton } from '@/features/teacher-dashboard/components/DashboardCardShell';
import { useStudentSeatHome } from './useStudentSeatHome';
import { readStudentCourseHome, reservationPeriodLabel, upcomingStudentRounds, type StudentScope } from './studentHomeData';

const SEATON_URL = 'https://kijunseaton.netlify.app';

function ReadError({ retry }: { retry: () => void }) {
  return (
    <div role="status" className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600">
      정보를 불러오지 못했습니다.
      <button type="button" onClick={retry} className="ml-2 rounded font-semibold text-sky-700 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-sky-600">다시 시도</button>
    </div>
  );
}

function CourseCard(scope: StudentScope) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useCurrentTime();
  const query = useQuery({
    queryKey: ['student-home', 'course', user?.id, scope.studentCode, scope.grade, scope.admissionYear],
    queryFn: () => readStudentCourseHome(supabase, scope),
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  });
  const rounds = upcomingStudentRounds(query.data?.rounds ?? [], scope, now);
  const dateLabel = (value: string) => new Date(value).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <DashboardCardShell title="수강신청 마감" icon={ClipboardList} accent="violet"
      description="내 학년·입학연도에 해당하는 신청을 확인하세요."
      className="min-w-0" onAction={() => navigate('/course-selection')} actionLabel="수강신청 전체 보기">
      {query.isPending ? <DashboardCardSkeleton rows={2} /> : query.isError ? <ReadError retry={() => void query.refetch()} /> : rounds.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">현재 예정되거나 진행 중인 수강신청이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {rounds.slice(0, 3).map((round) => {
            const upcoming = round.opens_at && Date.parse(round.opens_at) > now.getTime();
            const saved = query.data?.savedRoundIds.includes(round.id);
            return (
              <button key={round.id} type="button" onClick={() => navigate('/course-selection')}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-left hover:border-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap gap-2 text-[11px] font-semibold">
                    <span className={upcoming ? 'text-slate-500' : 'text-violet-700'}>{upcoming ? '신청 예정' : '신청 중'}</span>
                    {saved && <span className="text-slate-500">저장 내역 있음</span>}
                  </div>
                  <p className="break-words text-sm font-bold text-slate-800">{round.title || `${round.round_number}차 수강신청`}</p>
                  <p className="mt-1 text-xs text-slate-500">{upcoming ? `${dateLabel(round.opens_at!)} 시작` : round.closes_at ? `${dateLabel(round.closes_at)} 마감` : '마감일 미정'}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              </button>
            );
          })}
          <p className="text-xs leading-5 text-slate-500">{rounds.length > 3 && '가까운 마감 3건을 표시합니다. '}저장 내역이 있어도 신청 화면에서 모든 선택군의 저장 여부를 확인해 주세요.</p>
        </div>
      )}
    </DashboardCardShell>
  );
}

function SeatCard({ studentCode }: { studentCode: string }) {
  const query = useStudentSeatHome(studentCode);
  const { today } = query;

  return (
    <DashboardCardShell title="내 자습 예약" icon={Armchair} accent="green"
      description="오늘부터 7일간의 예약을 가까운 순서로 보여 드려요."
      className="min-w-0"
      headerAction={(
        <a
          href={SEATON_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Seaton에서 자습 예약하기 (새 창)"
          aria-label="Seaton에서 자습 예약하기 (새 창)"
          className="group flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          <ExternalLink className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
        </a>
      )}>
      {query.isPending ? <DashboardCardSkeleton rows={2} /> : query.isError ? <ReadError retry={() => void query.refetch()} /> : query.data == null ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">학생 계정이 연결되면 예약을 확인할 수 있습니다.</p>
      ) : query.data.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">앞으로 7일간 등록된 자습 예약이 없습니다.</p>
      ) : (
        <div>
          <ul className="space-y-2">
            {query.data.slice(0, 6).map((reservation) => (
              <li key={reservation.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-bold text-emerald-700">
                  {reservation.reservation_date === today ? '오늘' : reservation.reservation_date.slice(5).replace('-', '/')}
                </span>
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-slate-800">{reservation.study_rooms?.name || '열람실 정보 없음'} · {reservation.seat_number}번 좌석</p>
                  <p className="mt-1 text-xs text-slate-500">{reservationPeriodLabel(reservation.period_id, reservation.study_rooms?.operating_periods)}</p>
                </div>
              </li>
            ))}
          </ul>
          {query.data.length > 6 && <p className="mt-3 text-xs text-slate-500">가까운 예약 6건을 표시합니다. 전체 내역은 자습 예약 서비스에서 확인해 주세요.</p>}
        </div>
      )}
    </DashboardCardShell>
  );
}

function StudentActivityCards() {
  const actor = useCurrentActor();
  const menu = useMenuVisibility();
  const canShowCourse = !menu.isLoading && !menu.error && isPathVisible(menu.config, '/course-selection', { isAdmin: false, role: 'student' });
  if (actor.isPending) return <div className="col-span-full"><DashboardCardSkeleton rows={2} /></div>;
  if (actor.isError) return <div className="col-span-full"><ReadError retry={() => void actor.refetch()} /></div>;
  if (!actor.data?.studentCode || actor.data.role !== 'student') return null;
  return (
    <div className={`col-span-full grid min-w-0 grid-cols-1 gap-4 sm:gap-5 ${canShowCourse ? 'md:grid-cols-2' : ''}`}>
      {canShowCourse && <CourseCard studentCode={actor.data.studentCode} grade={actor.data.studentGrade} admissionYear={actor.data.studentAdmissionYear} />}
      <section id="student-reservations" className="min-w-0 scroll-mt-24" aria-label="내 자습 예약">
        <SeatCard studentCode={actor.data.studentCode} />
      </section>
    </div>
  );
}

export function StudentHomeActivities() {
  const { user, profile, viewAsStudentId } = useAuth();
  // A generic admin preview has no student identity; never show the admin's own records.
  if (!user || !profile || (profile.role !== 'student' && !(profile.role === 'admin' && viewAsStudentId))) return null;
  return <StudentActivityCards />;
}
