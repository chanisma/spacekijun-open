import { AlertCircle, Armchair, CheckCircle2, ExternalLink, Eye, Users } from 'lucide-react';
import { useSeatReservationOverview } from '../hooks/useSeatReservationOverview';
import { DashboardCardShell, DashboardCardSkeleton } from './DashboardCardShell';

/** 자습 좌석 예약·확인을 실제로 처리하는 Seaton 앱 주소(외부 메뉴 resource 'SEATON'과 동일). */
const SEATON_URL = 'https://kijunseaton.netlify.app';

function formatDashboardDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

export function SeatReservationOverviewCard({
  enabled,
  accessReason,
}: {
  enabled: boolean;
  accessReason: string | null;
}) {
  const { data, isLoading, isError } = useSeatReservationOverview(enabled);
  const pending = data?.pending ?? 0;

  return (
    <DashboardCardShell
      title="자습 좌석 확인"
      icon={Armchair}
      accent="violet"
      description={data ? `${formatDashboardDate(data.date)} · ${accessReason}` : `오늘 현황 · ${accessReason}`}
      badge={data && data.reservations > 0 ? (
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          pending > 0
            ? 'bg-amber-100 text-amber-700'
            : 'bg-emerald-100 text-emerald-700'
        }`}>
          {pending > 0 ? `미확인 ${pending}` : '확인 완료'}
        </span>
      ) : null}
      headerAction={(
        <a
          href={SEATON_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Seaton에서 자습 좌석 확인하기 (새 창)"
          aria-label="Seaton에서 자습 좌석 확인하기 (새 창)"
          className="group flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-700"
        >
          <ExternalLink className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
        </a>
      )}
    >
      {isLoading ? (
        <DashboardCardSkeleton rows={4} />
      ) : isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
          <AlertCircle className="mx-auto h-7 w-7 text-rose-500" />
          <p className="mt-2 text-sm font-medium text-rose-800">좌석 현황을 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs text-rose-600">공유 데이터의 읽기 권한과 연결 상태를 확인해 주세요.</p>
        </div>
      ) : !data || data.reservations === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center text-center text-slate-500">
          <Armchair className="mb-3 h-8 w-8 text-violet-300" />
          <p className="text-sm font-medium">오늘 등록된 좌석 예약이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-5 rounded-2xl bg-slate-50 p-4">
            <div
              className="relative flex h-24 w-24 items-center justify-center rounded-full"
              style={{ background: `conic-gradient(#0f766e ${data.completionRate * 3.6}deg, #e2e8f0 0deg)` }}
            >
              <div className="flex h-[76px] w-[76px] flex-col items-center justify-center rounded-full bg-white shadow-sm">
                <span className="text-xl font-bold tracking-[-0.04em] text-slate-900">{data.completionRate}%</span>
                <span className="text-[10px] font-medium text-slate-400">확인 진행</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">오늘 전체</p>
              <p className="mt-1 text-3xl font-bold tracking-[-0.04em] text-slate-900">{data.reservations}<span className="ml-1 text-sm font-medium text-slate-400">건</span></p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 확인 {data.completed}
                </span>
                <span className={`flex items-center gap-1.5 font-medium ${pending > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                  <AlertCircle className="h-3.5 w-3.5" /> 미확인 {pending}
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Users className="h-3.5 w-3.5" /> {data.rooms.length}개 공간
                </span>
              </div>
            </div>
          </div>

          {(data.excused > 0 || data.supplement > 0) && (
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-1">출석 {data.attended}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1">출석 인정 {data.excused}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1">보완 {data.supplement}</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">공간별 현황</p>
              <span className="text-xs text-slate-400">미확인 많은 순</span>
            </div>
            <div className="mt-2 divide-y divide-slate-100">
            {data.rooms.slice(0, 5).map((room) => (
              <div key={room.roomId} className="teacher-dashboard-row px-1 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-slate-800">{room.roomName}</p>
                  <span className={`flex-shrink-0 text-xs font-medium ${room.pending > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {room.pending > 0 ? `미확인 ${room.pending}` : '완료'}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-teal-600"
                      style={{ width: `${room.completionRate}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-xs text-slate-500">
                    {room.completed}/{room.reservations}
                  </span>
                </div>
              </div>
            ))}
            </div>
            {data.rooms.length > 5 && (
              <p className="text-center text-xs text-slate-500">그 외 {data.rooms.length - 5}개 공간</p>
            )}
          </div>

          <div className="flex items-center justify-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-400">
            <Eye className="h-3.5 w-3.5" />
            Seaton 공유 데이터 · 조회 전용 · 1분마다 갱신
          </div>
        </div>
      )}
    </DashboardCardShell>
  );
}
