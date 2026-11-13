import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Cake,
  CheckCircle2,
  ClipboardCheck,
  HeartHandshake,
  Link2Off,
  Search,
  ShieldAlert,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useHomeroomStudentOverview } from '../hooks/useHomeroomStudentOverview';
import type { HomeroomStudentOverview, HomeroomStudentOverviewRow } from '../types';
import { DashboardCardShell, DashboardCardSkeleton } from './DashboardCardShell';

type DashboardView = 'study' | 'life' | 'procedure';
type StudentFilter =
  | 'all'
  | 'participating'
  | 'not-participating'
  | 'needs-review'
  | 'unlinked'
  | 'birthday'
  | 'care'
  | 'procedure-needs'
  | 'procedure-complete';
type SignalTone = 'slate' | 'amber' | 'emerald' | 'violet' | 'pink' | 'sky' | 'rose';

interface SignalBadge {
  label: string;
  tone: SignalTone;
}

const signalToneClasses: Record<SignalTone, string> = {
  slate: 'bg-slate-100 text-slate-600',
  amber: 'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  violet: 'bg-violet-100 text-violet-700',
  pink: 'bg-pink-100 text-pink-700',
  sky: 'bg-sky-100 text-sky-700',
  rose: 'bg-rose-100 text-rose-700',
};

const viewLabels: Record<DashboardView, { label: string; description: string }> = {
  study: { label: '자습', description: '이번 달 신청·출석' },
  life: { label: '생활 신호', description: '생일·후속 확인' },
  procedure: { label: '학교 절차', description: '선택과목·진학 준비' },
};

function getStudyBadges(
  student: HomeroomStudentOverviewRow,
  data: HomeroomStudentOverview,
): SignalBadge[] {
  if (!data.identityDataAvailable || !data.seatDataAvailable) {
    return [{ label: '연동 확인 필요', tone: 'slate' }];
  }
  if (!student.profileId) {
    return [{ label: '계정 미연결', tone: 'rose' }];
  }
  if (student.pending > 0) {
    return [{ label: `미확인 ${student.pending}`, tone: 'amber' }];
  }
  if (student.reservations === 0) {
    return [{ label: '미참여', tone: 'slate' }];
  }
  if (student.elapsed === 0) {
    return [{ label: '참여 예정', tone: 'violet' }];
  }
  return [{ label: '확인 완료', tone: 'emerald' }];
}

function getLifeBadges(student: HomeroomStudentOverviewRow): SignalBadge[] {
  const badges: SignalBadge[] = [];
  if (student.birthdayDaysUntil === 0) {
    badges.push({ label: '오늘 생일', tone: 'pink' });
  } else if (student.birthdayDaysUntil != null) {
    badges.push({ label: `생일 D-${student.birthdayDaysUntil}`, tone: 'pink' });
  }
  if (student.careStatus === 'open') {
    badges.push({ label: '후속 확인', tone: 'rose' });
  } else if (student.careStatus === 'monitoring') {
    badges.push({ label: '모니터링', tone: 'amber' });
  }
  return badges;
}

function getProcedureBadges(student: HomeroomStudentOverviewRow): SignalBadge[] {
  const badges = student.courseSelections.map<SignalBadge>((selection) => {
    if (selection.status === 'finalized') return { label: '선택과목 확정', tone: 'emerald' };
    if (selection.status === 'submitted') return { label: '선택과목 제출', tone: 'sky' };
    if (selection.status) return { label: '선택과목 작성 중', tone: 'violet' };
    return { label: '선택과목 미제출', tone: 'amber' };
  });

  if (student.admissionWishlistApplicable) {
    if (student.hasAdmissionWishlist === true) {
      badges.push({ label: '진학목록 작성', tone: 'emerald' });
    } else if (student.hasAdmissionWishlist === false) {
      badges.push({ label: '진학목록 준비 전', tone: 'amber' });
    }
  }
  return badges;
}

function SignalBadges({ badges }: { badges: SignalBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {badges.slice(0, 2).map((badge, index) => (
        <span
          key={`${badge.label}-${index}`}
          className={`max-w-40 truncate rounded-full px-2 py-1 text-[10px] font-semibold ${signalToneClasses[badge.tone]}`}
          title={badge.label}
        >
          {badge.label}
        </span>
      ))}
      {badges.length > 2 && (
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
          +{badges.length - 2}
        </span>
      )}
    </span>
  );
}

function getFilterOptions(view: DashboardView, data: HomeroomStudentOverview) {
  if (view === 'study') {
    return [
      { id: 'all' as const, label: '전체', count: data.studentCount, disabled: false },
      { id: 'participating' as const, label: '자습 참여', count: data.participatingStudents, disabled: !data.seatDataAvailable },
      {
        id: 'not-participating' as const,
        label: '미참여',
        count: data.students.filter((student) => student.profileId && student.reservations === 0).length,
        disabled: !data.seatDataAvailable,
      },
      {
        id: 'needs-review' as const,
        label: '확인 필요',
        count: data.students.filter((student) => student.pending > 0).length,
        disabled: !data.seatDataAvailable,
      },
      {
        id: 'unlinked' as const,
        label: '계정 미연결',
        count: data.unlinkedStudents,
        disabled: !data.identityDataAvailable,
      },
    ];
  }
  if (view === 'life') {
    return [
      { id: 'all' as const, label: '전체', count: data.studentCount, disabled: false },
      {
        id: 'birthday' as const,
        label: '이번 주 생일',
        count: data.birthdayStudentsThisWeek,
        disabled: !data.birthdayDataAvailable,
      },
      {
        id: 'care' as const,
        label: '후속 확인',
        count: data.careStudents,
        disabled: !data.careDataAvailable,
      },
    ];
  }
  const procedureStudents = data.students.filter((student) => student.hasProcedure);
  return [
    { id: 'all' as const, label: '전체', count: procedureStudents.length, disabled: false },
    {
      id: 'procedure-needs' as const,
      label: '확인 필요',
      count: data.procedureStudents,
      disabled: !data.courseSelectionDataAvailable && !data.admissionDataAvailable,
    },
    {
      id: 'procedure-complete' as const,
      label: '완료',
      count: data.procedureCompletedStudents,
      disabled: !data.courseSelectionDataAvailable && !data.admissionDataAvailable,
    },
  ];
}

function matchesStudentFilter(student: HomeroomStudentOverviewRow, filter: StudentFilter) {
  if (filter === 'all') return true;
  if (filter === 'participating') return student.reservations > 0;
  if (filter === 'not-participating') return student.profileId != null && student.reservations === 0;
  if (filter === 'needs-review') return student.pending > 0;
  if (filter === 'unlinked') return student.profileId == null;
  if (filter === 'birthday') return student.birthdayDaysUntil != null;
  if (filter === 'care') return student.careStatus != null;
  if (filter === 'procedure-needs') return student.procedureNeedsAttention;
  return student.hasProcedure && !student.procedureNeedsAttention;
}

function StudyCells({ student, data }: { student: HomeroomStudentOverviewRow; data: HomeroomStudentOverview }) {
  const acknowledged = student.excused + student.supplement;
  const badges = getStudyBadges(student, data);
  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 sm:block sm:bg-transparent sm:p-0" role="cell">
        <span className="text-xs text-slate-500 sm:block">신청</span>
        <span className="text-sm font-bold text-slate-800 sm:mt-0.5 sm:block">
          {!data.seatDataAvailable
            ? '확인 불가'
            : !student.profileId
              ? '계정 연결 전'
              : `${student.reservations}회`}
        </span>
        {data.seatDataAvailable && student.profileId && student.reservations > 0 && (
          <span className="text-[11px] text-slate-400 sm:mt-0.5 sm:block">
            확인 {student.completed} · 예정 {student.upcoming}
          </span>
        )}
      </div>
      <div role="cell">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-[11px] text-slate-500">
            {!data.seatDataAvailable ? (
              <span>자습 연동 상태 확인 필요</span>
            ) : !student.profileId ? (
              <span>Seaton 계정이 연결되지 않았습니다.</span>
            ) : student.reservations > 0 ? (
              <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                <span>출석 <strong className="text-emerald-700">{student.attended}</strong></span>
                {acknowledged > 0 && <span>인정 <strong className="text-sky-700">{acknowledged}</strong></span>}
                {student.pending > 0 && <span>미확인 <strong className="text-amber-700">{student.pending}</strong></span>}
              </span>
            ) : <span>이번 달 신청 없음</span>}
          </div>
          <SignalBadges badges={badges} />
        </div>
        {data.seatDataAvailable && student.profileId && student.elapsed > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${student.pending > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${student.completionRate}%` }}
              />
            </div>
            <span className="w-8 text-right text-[10px] font-semibold text-slate-400">
              {student.completionRate}%
            </span>
          </div>
        )}
      </div>
    </>
  );
}

function LifeCells({ student, data }: { student: HomeroomStudentOverviewRow; data: HomeroomStudentOverview }) {
  const badges = getLifeBadges(student);
  const birthdayLabel = student.birthdayDaysUntil === 0
    ? '오늘'
    : student.birthdayDaysUntil != null
      ? `D-${student.birthdayDaysUntil}`
      : '이번 주 일정 없음';
  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl bg-pink-50/60 px-3 py-2 sm:block sm:bg-transparent sm:p-0" role="cell">
        <span className="text-xs text-slate-500 sm:block">생일</span>
        <span className={`text-sm font-bold sm:mt-0.5 sm:block ${student.birthdayDaysUntil != null ? 'text-pink-700' : 'text-slate-700'}`}>
          {data.birthdayDataAvailable ? birthdayLabel : '확인 불가'}
        </span>
        <span className="text-[11px] text-slate-400 sm:mt-0.5 sm:block">전체 생년월일은 표시하지 않음</span>
      </div>
      <div role="cell">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-[11px] text-slate-500">
            {!data.careDataAvailable ? (
              <span>담임 후속 신호 확인 불가</span>
            ) : student.careStatus === 'open' ? (
              <span className="font-semibold text-rose-700">후속 확인이 필요합니다.</span>
            ) : student.careStatus === 'monitoring' ? (
              <span className="font-semibold text-amber-700">모니터링 중입니다.</span>
            ) : <span>현재 후속 신호 없음</span>}
          </div>
          <SignalBadges badges={badges} />
        </div>
        <p className="mt-1.5 text-[10px] text-slate-400">케어 사유와 상담 내용은 상세 화면에서만 확인</p>
      </div>
    </>
  );
}

function ProcedureCells({ student, data }: { student: HomeroomStudentOverviewRow; data: HomeroomStudentOverview }) {
  const badges = getProcedureBadges(student);
  return (
    <>
      <div className="rounded-xl bg-sky-50/60 px-3 py-2 sm:bg-transparent sm:p-0" role="cell">
        <span className="text-xs text-slate-500">선택과목</span>
        {!data.courseSelectionDataAvailable ? (
          <p className="mt-0.5 text-sm font-bold text-slate-700">확인 불가</p>
        ) : student.courseSelections.length === 0 ? (
          <p className="mt-0.5 text-sm font-bold text-slate-700">진행 중인 신청 없음</p>
        ) : (
          <div className="mt-1 space-y-1">
            {student.courseSelections.slice(0, 2).map((selection) => (
              <p key={selection.roundId} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-slate-500">{selection.title}</span>
                <strong className={selection.completed ? 'text-emerald-700' : 'text-amber-700'}>
                  {selection.status === 'finalized' ? '확정' : selection.status === 'submitted' ? '제출' : selection.status ? '작성 중' : '미제출'}
                </strong>
              </p>
            ))}
          </div>
        )}
      </div>
      <div role="cell">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-[11px] text-slate-500">
            {!student.admissionWishlistApplicable ? (
              <span>해당 학년 진학 준비 신호 없음</span>
            ) : !data.admissionDataAvailable ? (
              <span>진학 준비 상태 확인 불가</span>
            ) : student.hasAdmissionWishlist ? (
              <span className="font-semibold text-emerald-700">진학 희망목록 작성</span>
            ) : (
              <span className="font-semibold text-amber-700">진학 희망목록 준비 전</span>
            )}
          </div>
          <SignalBadges badges={badges} />
        </div>
        <p className="mt-1.5 text-[10px] text-slate-400">선택 과목명과 지원 대학 목록은 홈에 표시하지 않음</p>
      </div>
    </>
  );
}

export function HomeroomStudentOverviewCard({
  currentResourceId,
}: {
  currentResourceId: string | undefined;
}) {
  const navigate = useNavigate();
  const [view, setView] = useState<DashboardView>('study');
  const [filter, setFilter] = useState<StudentFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const {
    data,
    scopes,
    isLoading,
    isError,
    isFetchingSignals,
  } = useHomeroomStudentOverview(currentResourceId);

  const filterOptions = useMemo(
    () => data ? getFilterOptions(view, data) : [],
    [data, view],
  );
  const visibleStudents = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('ko');
    return (data?.students ?? []).filter((student) => {
      const matchesView = view !== 'procedure' || student.hasProcedure;
      const matchesSearch = normalizedSearch.length === 0
        || student.name.toLocaleLowerCase('ko').includes(normalizedSearch)
        || String(student.number ?? '').includes(normalizedSearch);
      return matchesView && matchesStudentFilter(student, filter) && matchesSearch;
    });
  }, [data?.students, filter, searchTerm, view]);

  if (scopes.length === 0) return null;

  const scopeLabel = scopes.map((scope) => scope.label).join(' · ');
  const hasGradeThree = data?.students.some((student) => student.grade === 3) ?? false;
  const procedureDataAvailable = Boolean(
    data?.courseSelectionDataAvailable || (hasGradeThree && data?.admissionDataAvailable),
  );
  const unavailableSignals = data && !isFetchingSignals
    ? [
      !data.birthdayDataAvailable ? '생일' : null,
      !data.careDataAvailable ? '후속 신호' : null,
      !data.courseSelectionDataAvailable ? '선택과목' : null,
      hasGradeThree && !data.admissionDataAvailable ? '진학 준비' : null,
    ].filter(Boolean)
    : [];
  const tableHeaders = view === 'study'
    ? ['학생', '이번 달 자습', '출석 현황']
    : view === 'life'
      ? ['학생', '이번 주', '담임 신호']
      : ['학생', '선택과목', '진학·완료'];

  const changeView = (nextView: DashboardView, nextFilter: StudentFilter = 'all') => {
    setView(nextView);
    setFilter(nextFilter);
  };

  return (
    <DashboardCardShell
      title="우리 반 학생"
      icon={UsersRound}
      accent="indigo"
      description="자습, 생활 신호와 학교 절차를 같은 명부에서 전환해 확인합니다."
      badge={(
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
          {scopeLabel}
        </span>
      )}
      onAction={() => navigate('/student-dashboard')}
      actionLabel="학생 대시보드 열기"
      className="col-span-full"
    >
      {isLoading ? (
        <DashboardCardSkeleton rows={6} />
      ) : isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center">
          <AlertCircle className="mx-auto h-7 w-7 text-rose-500" />
          <p className="mt-2 text-sm font-semibold text-rose-800">학급 명부를 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs text-rose-600">학생 정보 조회 권한과 연결 상태를 확인해 주세요.</p>
        </div>
      ) : !data || data.studentCount === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center text-center text-slate-500">
          <UsersRound className="mb-3 h-8 w-8 text-indigo-300" />
          <p className="text-sm font-medium">담당 학급의 현재 학생 명부가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {[
              { label: '재학생', value: data.studentCount, suffix: '명', icon: UsersRound, className: 'bg-slate-50 text-slate-700' },
              { label: '자습 참여', value: data.seatDataAvailable ? data.participatingStudents : '—', suffix: data.seatDataAvailable ? '명' : '', icon: UserRoundCheck, className: 'bg-violet-50 text-violet-700' },
              { label: '확인 필요', value: data.attentionStudents, suffix: '명', icon: ShieldAlert, className: data.attentionStudents > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700' },
              { label: '계정 미연결', value: data.identityDataAvailable ? data.unlinkedStudents : '—', suffix: data.identityDataAvailable ? '명' : '', icon: Link2Off, className: data.unlinkedStudents > 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-500' },
            ].map(({ label, value, suffix, icon: Icon, className }) => (
              <div key={label} className={`rounded-2xl px-3.5 py-3 ${className}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold">{label}</span>
                  <Icon className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
                </div>
                <p className="mt-2 text-2xl font-bold tracking-[-0.04em]">
                  {value}<span className="ml-1 text-xs font-semibold opacity-70">{suffix}</span>
                </p>
              </div>
            ))}
          </div>

          {(!data.seatDataAvailable || unavailableSignals.length > 0) && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              {!data.seatDataAvailable && '자습 공유 데이터 일부를 불러오지 못했습니다. '}
              {unavailableSignals.length > 0 && `${unavailableSignals.join('·')} 데이터를 확인하지 못했습니다.`}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-800">담임 체크포인트</p>
                <p className="mt-0.5 text-[11px] text-slate-400">항목을 누르면 해당 학생만 바로 확인합니다.</p>
              </div>
              {isFetchingSignals && <span className="text-[10px] font-medium text-slate-400">신호 갱신 중</span>}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                { label: '이번 주 생일', value: data.birthdayDataAvailable ? data.birthdayStudentsThisWeek : '—', icon: Cake, tone: 'text-pink-700 bg-pink-50', disabled: !data.birthdayDataAvailable, onClick: () => changeView('life', 'birthday') },
                { label: '케어 후속 확인', value: data.careDataAvailable ? data.careStudents : '—', icon: HeartHandshake, tone: 'text-rose-700 bg-rose-50', disabled: !data.careDataAvailable, onClick: () => changeView('life', 'care') },
                { label: '학교 절차 확인', value: procedureDataAvailable ? data.procedureStudents : '—', icon: ClipboardCheck, tone: 'text-sky-700 bg-sky-50', disabled: !procedureDataAvailable, onClick: () => changeView('procedure', 'procedure-needs') },
              ].map(({ label, value, icon: Icon, tone, disabled, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  disabled={disabled}
                  className="flex items-center gap-3 rounded-xl border border-white bg-white px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-200 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium text-slate-500">{label}</span>
                    <span className="mt-0.5 block text-sm font-bold text-slate-900">{value}{typeof value === 'number' ? '명' : ''}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="inline-flex w-fit rounded-xl bg-slate-100 p-1">
                {(Object.keys(viewLabels) as DashboardView[]).map((viewId) => (
                  <button
                    key={viewId}
                    type="button"
                    onClick={() => changeView(viewId)}
                    aria-pressed={view === viewId}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${view === viewId ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    {viewLabels[viewId].label}
                  </button>
                ))}
              </div>
              <label className="relative block lg:w-60">
                <span className="sr-only">학생 이름 또는 번호 검색</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="학생 이름 또는 번호 검색"
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="teacher-dashboard-filter-scroll flex gap-1.5 overflow-x-auto pb-1">
                {filterOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFilter(option.id)}
                    disabled={option.disabled}
                    className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${filter === option.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {option.label}
                    <span className={filter === option.id ? 'text-slate-300' : 'text-slate-400'}>{option.count}</span>
                  </button>
                ))}
              </div>
              <span className="hidden flex-shrink-0 text-[11px] text-slate-400 sm:inline">{viewLabels[view].description}</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" role="table" aria-label={`${scopeLabel} ${viewLabels[view].label} 현황`}>
            <div className="teacher-dashboard-roster-scroll max-h-[30rem] overflow-y-auto">
              <div className="sticky top-0 z-10 hidden grid-cols-[minmax(150px,0.8fr)_minmax(180px,1fr)_minmax(240px,1.2fr)] gap-4 border-b border-slate-200 bg-slate-50/95 px-4 py-2.5 text-[11px] font-semibold text-slate-500 backdrop-blur sm:grid" role="row">
                {tableHeaders.map((header) => <span key={header} role="columnheader">{header}</span>)}
              </div>

              {visibleStudents.length === 0 ? (
                <div className="flex min-h-36 flex-col items-center justify-center px-4 text-center text-sm text-slate-500">
                  {view === 'procedure' && filter === 'all' ? (
                    <><CheckCircle2 className="mb-2 h-6 w-6 text-emerald-400" />현재 해당 학급에 진행 중인 학교 절차가 없습니다.</>
                  ) : '조건에 맞는 학생이 없습니다.'}
                </div>
              ) : visibleStudents.map((student) => (
                <div key={student.studentCode} className="teacher-dashboard-row grid gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(150px,0.8fr)_minmax(180px,1fr)_minmax(240px,1.2fr)] sm:items-center sm:gap-4" role="row">
                  <div className="flex min-w-0 items-center gap-3" role="cell">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xs font-bold text-indigo-700">{student.number ?? '—'}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-900">{student.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">{scopes.length > 1 && `${student.grade}-${student.classNum} · `}{student.number ?? '번호 미등록'}번</span>
                    </span>
                  </div>
                  {view === 'study' && <StudyCells student={student} data={data} />}
                  {view === 'life' && <LifeCells student={student} data={data} />}
                  {view === 'procedure' && <ProcedureCells student={student} data={data} />}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1 text-[11px] leading-5 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span aria-live="polite">{data.studentCount}명 중 {visibleStudents.length}명 표시</span>
            <span>{view === 'study' ? '오늘·미래 예약은 미확인에서 제외 · Seaton 조회 전용' : view === 'life' ? '생년월일·케어 사유는 홈에서 숨김' : '선택 과목명·지원 대학 목록은 홈에서 숨김'}</span>
          </div>
        </div>
      )}
    </DashboardCardShell>
  );
}
