import { Armchair, ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentActor } from '@/features/course-selection/hooks/useCurrentActor';
import { reservationPeriodLabel } from './studentHomeData';
import { useStudentSeatHome } from './useStudentSeatHome';

function TodayStudyDetails() {
  const actor = useCurrentActor();
  const query = useStudentSeatHome(actor.data?.role === 'student' ? actor.data.studentCode : null);
  const reservations = query.data?.filter((row) => row.reservation_date === query.today) ?? [];
  if (actor.isError || query.isError) return <p className="mt-2 text-sm text-slate-500">자습 예약을 불러오지 못했습니다. 아래 예약 카드에서 다시 시도해 주세요.</p>;
  if (actor.isPending || (actor.data?.studentCode && query.isPending)) return <div className="mt-3 h-5 w-3/4 animate-pulse rounded bg-emerald-100" aria-label="오늘 자습 불러오는 중" />;
  if (!actor.data?.studentCode || query.data == null) return <p className="mt-2 text-sm text-slate-500">학생 계정이 연결되면 자습 예약을 확인할 수 있어요.</p>;
  return (
    <>
      {reservations.length === 0 ? <p className="mt-2 text-sm text-slate-500">오늘 예약된 자습이 없습니다.</p> : (
        <ul className="mt-3 space-y-2">
          {reservations.slice(0, 2).map((row) => (
            <li key={row.id}>
              <p className="break-words text-sm font-semibold text-slate-800">{row.study_rooms?.name || '열람실 정보 없음'} · {row.seat_number}번 좌석</p>
              <p className="mt-0.5 text-xs text-slate-500">{reservationPeriodLabel(row.period_id, row.study_rooms?.operating_periods)}</p>
            </li>
          ))}
        </ul>
      )}
      <a href="#student-reservations" className="mt-3 inline-flex items-center gap-1 rounded text-xs font-semibold text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600">
        {reservations.length > 2 ? '오늘 자습 더 보기' : '내 자습 예약 보기'} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </>
  );
}

export function StudentTodayStudy() {
  const { user, profile, viewAsStudentId } = useAuth();
  const hasStudent = !!user && (profile?.role === 'student' || (profile?.role === 'admin' && !!viewAsStudentId));
  return (
    <section className="min-w-0 rounded-2xl border border-emerald-100 bg-white/90 p-4 sm:p-5" aria-label="오늘의 자습">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"><Armchair className="h-4 w-4" aria-hidden="true" /></span>
        오늘의 자습
      </h2>
      {hasStudent ? <TodayStudyDetails /> : <p className="mt-2 text-sm text-slate-500">학생을 선택하면 오늘 자습을 확인할 수 있어요.</p>}
    </section>
  );
}
