// 자습 감독 배정 — [배정하기] 탭 (2026-10-11)
//
// 한 학년·한 달의 초안을 규칙(`@/lib/selfStudySupervision`)으로 만들고, 칸마다 사람을 바꿔 본 뒤
// 일정으로 만든다. 시스템은 출장·연수 일부만 알고 개인 사정은 모르므로 **초안을 고치는 화면**이다.
//
// 2026-10-12: «전 학년 아침»(grade 0 — 세 학년 선생님을 한 명단으로, 수능 이후 3학년 제외) ·
// «못 하는 날»(매주 반복·특정 날짜, 저장 — 자동 배정이 피한다).
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarX2, ChevronLeft, ChevronRight, Loader2, Printer, RotateCcw, Users } from 'lucide-react';
import { buildDutyRosterDocument, openPrintDocument, type RosterEntry } from '@/lib/dutyRosterPrint';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { DIALOG_FOOTER_CLASS } from '@/components/tasks/dialogDesign';
import { useSchoolCalendar } from '@/hooks/useSchoolCalendar';
import { toDateKey } from '@/lib/schoolDay';
import {
  CELL_ISSUE_LABEL,
  SCHOOL_GRADE,
  SLOT_LABEL,
  cellIssues,
  gradeLabel,
  seniorExclusionRules,
  unavailabilityReason,
  cellKey,
  listSupervisionCells,
  loadsWithPlan,
  planSupervision,
  rankCandidates,
  supervisionTitle,
  type MorningMode,
  type PlannedCell,
  type SupervisionSlot,
} from '@/lib/selfStudySupervision';
import { useSupervisionSources, useSupervisionUnavailability } from './useSupervisionSources';
import { UnavailabilityPanel } from './UnavailabilityPanel';
import type { SupervisionCreateEvent } from './SelfStudySupervisionDialog';

const WEEKDAY = ['', '월', '화', '수', '목', '금', '토', '일'];
const SLOT_TONE: Record<SupervisionSlot, string> = {
  morning: 'bg-amber-50 text-amber-800 border-amber-200',
  evening: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  saturday: 'bg-teal-50 text-teal-800 border-teal-200',
};

function slotChip(cell: Pick<PlannedCell, 'slot' | 'withMorning'>) {
  return cell.slot === 'evening' && cell.withMorning ? '아침·저녁' : SLOT_LABEL[cell.slot];
}

function dayLabel(date: string, dow: number) {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}(${WEEKDAY[dow] ?? ''})`;
}

export function SupervisionPlanTab({
  grades,
  initialDate,
  onCreateEvent,
  onCreated,
}: {
  grades: number[];
  initialDate: Date;
  onCreateEvent: SupervisionCreateEvent;
  onCreated: () => void;
}) {
  const [grade, setGrade] = useState<number>(grades[0]);
  const [ym, setYm] = useState({ year: initialDate.getFullYear(), month: initialDate.getMonth() + 1 });
  const [enabled, setEnabled] = useState<Record<SupervisionSlot, boolean>>({ morning: true, evening: true, saturday: true });
  const [morningModeChoice, setMorningMode] = useState<MorningMode | null>(null);
  const [morningTime, setMorningTime] = useState<{ start: string; end: string } | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [showPool, setShowPool] = useState(false);
  const [showLoads, setShowLoads] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  /** 전 학년 아침 — 3학년 선생님을 빼는 시작일(null = 기본값 수능일), 끄기 */
  const [seniorCutoff, setSeniorCutoff] = useState<string | null>(null);
  const [seniorOff, setSeniorOff] = useState(false);
  const [armed, setArmed] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const isSchool = grade === SCHOOL_GRADE;
  useEffect(() => { setMorningMode(null); }, [grade]);

  const monthStart = new Date(ym.year, ym.month - 1, 1);
  const monthEnd = new Date(ym.year, ym.month, 0);
  // 학기 기간은 적용하지 않는다 — 다음 달이 다음 학기일 수 있다. 방학은 NEIS 학사일정이 말한다
  // 전 학년 아침은 학교 전체로 판정한다(일부 학년만 쉬는 날에도 다른 학년 아침 자습은 있다)
  const calendar = useSchoolCalendar(monthStart, monthEnd, { applyTerm: false, grade: isSchool ? null : grade });
  const sources = useSupervisionSources(grade, ym.year, ym.month, true);
  const unavailability = useSupervisionUnavailability(true);
  // 아침 방식 — 손대지 않았으면 이 학년도에 전 학년 아침 당번을 쓴 적이 있을 때 «통합»이 기본
  const morningMode: MorningMode = isSchool
    ? 'separate'
    : morningModeChoice ?? (sources.data?.schoolMorningInYear ? 'school' : 'separate');

  useEffect(() => {
    setOverrides({}); setSkipped(new Set()); setArmed(false);
  }, [grade, ym.year, ym.month, morningMode]);

  const cutoff = seniorOff ? null : (seniorCutoff ?? sources.data?.csatDate ?? null);
  const today = toDateKey(new Date());
  const monthKey = `${ym.year}-${String(ym.month).padStart(2, '0')}`;
  const seed = `${monthKey}|${grade}`;

  const model = useMemo(() => {
    const data = sources.data;
    if (!data || calendar.isLoading) return null;
    const pool = data.pool.map((p) => p.name).filter((n) => !excluded.has(n));
    const seniors = data.pool.filter((p) => p.grades.includes(3)).map((p) => p.name);
    const autoRules = isSchool && cutoff ? seniorExclusionRules(seniors, cutoff) : [];
    const rules = [...autoRules, ...(unavailability.data ?? [])];
    // 이 달에 이미 만든 감독 칸은 다시 만들지 않는다
    const existing = new Map<string, string[]>();
    for (const row of data.history) {
      if (!row.date.startsWith(monthKey)) continue;
      existing.set(cellKey(row), row.names);
      if (row.slot === 'evening' && row.withMorning) existing.set(cellKey({ date: row.date, slot: 'morning' }), row.names);
    }
    const allCells = listSupervisionCells({
      days: calendar.days,
      config: data.config,
      enabled: isSchool ? { morning: true, evening: false, saturday: false } : enabled,
      morningMode,
      from: today,
    })
      // 학년별 «따로»로 두었어도 그날 전 학년 아침 당번이 이미 있으면 아침 칸을 또 만들지 않는다
      .filter((c) => isSchool || c.slot !== 'morning' || !data.schoolMorningDates.has(c.date));
    const openCells = allCells.filter((c) => !existing.has(cellKey(c)) && !skipped.has(cellKey(c)));
    const draft = planSupervision({ cells: openCells, pool, history: data.history, absent: data.absent, unavailable: rules, seed });
    const plan: PlannedCell[] = draft.map((c) => {
      const key = cellKey(c);
      return key in overrides ? { ...c, assignee: overrides[key] } : c;
    });
    const issues = plan.map((_, i) => cellIssues(plan, i, data.absent, rules));
    const loads = loadsWithPlan(pool, data.history, plan);
    return { pool, allCells, existing, plan, issues, loads, rules, autoRules };
  }, [sources.data, calendar.isLoading, calendar.days, excluded, enabled, morningMode, today, skipped, seed, overrides, monthKey, isSchool, cutoff, unavailability.data]);

  const data = sources.data;
  const times = data ? {
    ...data.config.times,
    ...(morningTime ? { morning: morningTime } : {}),
  } : null;
  const mustFix = model ? model.issues.filter((list) => list.includes('empty') || list.includes('duplicate')).length : 0;
  const toCheck = model ? model.issues.filter((list) => list.length > 0).length - mustFix : 0;
  const filled = model ? model.plan.filter((c) => c.assignee).length : 0;

  /** 출력 — 이 달 전체(이미 만든 감독 + 지금 초안) · 쉬는 날의 이유. 창은 클릭 흐름 안에서 연다(팝업 차단) */
  const printRoster = () => {
    if (!model || !data || !times) return;
    const withEvening = !isSchool && enabled.morning && data.config.available.morning && morningMode === 'with_evening';
    const entries: RosterEntry[] = [];
    const made = new Set<string>();
    for (const row of data.history) {
      if (!row.date.startsWith(monthKey)) continue;
      entries.push({ date: row.date, slot: row.slot === 'evening' && row.withMorning ? '아침·저녁' : SLOT_LABEL[row.slot], names: row.names });
      made.add(cellKey(row));
      if (row.slot === 'evening' && row.withMorning) made.add(cellKey({ date: row.date, slot: 'morning' }));
    }
    for (const cell of model.plan) {
      if (made.has(cellKey(cell)) || !cell.assignee) continue;
      entries.push({ date: cell.date, slot: slotChip(cell), names: [cell.assignee] });
    }
    // 평일·토요일 중 쉬는 날은 이유를 적는다(빈칸이면 «안 정했다»로 읽힌다)
    const showSaturday = !isSchool && enabled.saturday && data.config.available.saturday;
    const offDays = [...calendar.days.values()]
      .filter((d) => (d.kind === 'holiday' || d.kind === 'vacation') && (d.dow <= 5 || (d.dow === 6 && showSaturday)))
      .map((d) => ({ date: d.date, reason: d.label ?? '쉬는 날' }));
    const slotTimes = (['morning', 'evening', 'saturday'] as SupervisionSlot[])
      .filter((slot) => (isSchool ? slot === 'morning' : enabled[slot]) && data.config.available[slot] && !(slot === 'morning' && (withEvening || morningMode === 'school')))
      .map((slot) => `${slot === 'evening' && withEvening ? '아침·저녁' : SLOT_LABEL[slot]} ${slot === 'evening' && withEvening ? `${times.morning.start}~${times.morning.end} / ` : ''}${times[slot].start}~${times[slot].end}`);
    const html = buildDutyRosterDocument({
      title: `${ym.year}년 ${ym.month}월 ${isSchool ? '전 학년 아침' : `${grade}학년`} 자습 감독 명단`,
      subtitle: slotTimes.join(' · '),
      year: ym.year,
      month: ym.month,
      weekdays: showSaturday ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5],
      entries,
      offDays,
      slotOrder: ['아침', '아침·저녁', '저녁', '토요일'],
      footnote: `출력 ${new Date().toLocaleDateString('ko-KR')} · 교체된 감독은 스케줄의 일정이 기준입니다`,
    });
    if (!openPrintDocument(html)) toast.error('팝업이 차단되어 출력 창을 열지 못했습니다. 브라우저에서 이 사이트의 팝업을 허용해 주세요.');
  };

  const moveMonth = (delta: number) => setYm(({ year, month }) => {
    const d = new Date(year, month - 1 + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });

  const handleCreate = async () => {
    if (!model || !times) return;
    if (!armed) { setArmed(true); return; }
    const targets = model.plan.filter((c) => c.assignee);
    setProgress({ done: 0, total: targets.length });
    const failed: string[] = [];
    for (const [i, cell] of targets.entries()) {
      const withMorning = !!cell.withMorning;
      const range = times[cell.slot];
      const rooms = data?.config.rooms[cell.slot] ?? [];
      const description = [
        rooms.length > 0 ? `열람실: ${rooms.join(', ')}` : null,
        withMorning ? `아침 자습도 함께 감독합니다(${times.morning.start}~${times.morning.end}).` : null,
        '교체는 스케줄 › 부가 기능 › 자습 감독 배정 › 내 감독·교체에서 신청할 수 있습니다.',
      ].filter(Boolean).join('\n');
      const result = await onCreateEvent({
        title: supervisionTitle(grade, cell.slot, cell.assignee as string, withMorning),
        kind: 'duty',
        starts_at: `${cell.date}T${range.start}:00+09:00`,
        ends_at: `${cell.date}T${range.end}:00+09:00`,
        assignee: cell.assignee as string,
        scope: 'teachers',
        exchangeable: false,
        description,
        supervision: { grade, slot: cell.slot, ...(withMorning ? { with_morning: true } : {}) },
      });
      if (!result) failed.push(dayLabel(cell.date, cell.dow));
      setProgress({ done: i + 1, total: targets.length });
    }
    setProgress(null);
    setArmed(false);
    setOverrides({});
    onCreated();
    void sources.refetch();
    if (failed.length === 0) toast.success(`${ym.month}월 ${isSchool ? '전 학년 아침' : `${grade}학년`} 자습 감독 ${targets.length}건을 일정으로 만들었습니다`);
    else toast.error(`${targets.length - failed.length}건 만들고 ${failed.length}건 실패했습니다: ${failed.join(', ')}`);
  };

  const footer = (
    <>
      <Button variant="ghost" className="h-8 gap-1.5 px-3 text-xs text-slate-600 hover:bg-slate-100"
        disabled={!model || (Object.keys(overrides).length === 0 && skipped.size === 0)}
        onClick={() => { setOverrides({}); setSkipped(new Set()); setArmed(false); }}>
        <RotateCcw className="h-3.5 w-3.5" /> 손 보정 되돌리기
      </Button>
      <Button variant="ghost" className="h-8 gap-1.5 px-3 text-xs text-slate-600 hover:bg-slate-100"
        disabled={!model || !!progress} onClick={printRoster}>
        <Printer className="h-3.5 w-3.5" /> 출력
      </Button>
      <Button className="h-8 gap-1.5 bg-blue-600 px-3 text-xs hover:bg-blue-700"
        disabled={!model || filled === 0 || !!progress || mustFix > 0}
        onClick={handleCreate}>
        {progress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {progress
          ? `만드는 중 ${progress.done}/${progress.total}`
          : armed
            ? `${filled}건 만들고 담당자에게 알림 — 한 번 더 누르세요`
            : mustFix > 0
              ? `빈칸·중복 ${mustFix}건을 먼저 고쳐 주세요`
              : `일정 ${filled}건 만들기`}
      </Button>
    </>
  );

  return (
    <>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-6">
      {/* 학년 · 달 */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 전 학년 아침 = 학년을 합친 통합 당번(배정할 수 있는 사람이면 누구나) */}
        <div className="flex rounded-lg border border-slate-100 bg-slate-100/50 p-1">
          {[...grades, SCHOOL_GRADE].map((g) => (
            <button key={g} type="button" onClick={() => setGrade(g)}
              className={cn('h-7 rounded-md px-3 text-xs font-semibold', g === grade ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
              {g === SCHOOL_GRADE ? '전 학년 아침' : `${g}학년`}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveMonth(-1)} aria-label="이전 달"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[88px] text-center text-sm font-semibold tabular-nums text-slate-800">{ym.year}년 {ym.month}월</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveMonth(1)} aria-label="다음 달"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {sources.isError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">자료를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</p>
      )}
      {(sources.isLoading || calendar.isLoading) && (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> 학년 명단·학사일정·열람실을 불러오는 중…</div>
      )}

      {data && model && times && (
        <>
          {/* 시간대 */}
          {isSchool ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-500">전 학년 통합 아침 당번 — 1·2·3학년 선생님을 한 명단으로 돌립니다</p>
              {!data.config.available.morning ? (
                <p className="text-slate-400">운영 중인 아침 열람실이 없습니다.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-lg border px-2.5 py-1 font-semibold', SLOT_TONE.morning)}>아침</span>
                  <input type="time" aria-label="아침 시작" className="h-8 rounded-md border border-slate-200 px-2 tabular-nums"
                    value={times.morning.start} onChange={(e) => setMorningTime({ start: e.target.value, end: times.morning.end })} />
                  <span>~</span>
                  <input type="time" aria-label="아침 끝" className="h-8 rounded-md border border-slate-200 px-2 tabular-nums"
                    value={times.morning.end} onChange={(e) => setMorningTime({ start: times.morning.start, end: e.target.value })} />
                  <span className="min-w-0 truncate text-slate-400" title={data.config.rooms.morning.join(', ')}>{data.config.rooms.morning.join(' · ')}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                <label className="flex min-h-[44px] items-center gap-1.5 sm:min-h-0">
                  <input type="checkbox" className="h-4 w-4" checked={!seniorOff} onChange={(e) => setSeniorOff(!e.target.checked)} />
                  <span className="font-medium">3학년 선생님 제외 시작일</span>
                </label>
                <input type="date" aria-label="3학년 선생님 제외 시작일" disabled={seniorOff}
                  className="h-8 rounded-md border border-slate-200 px-2 tabular-nums disabled:opacity-50"
                  value={seniorCutoff ?? data.csatDate ?? ''} onChange={(e) => setSeniorCutoff(e.target.value || null)} />
                <span className="text-slate-400">
                  {seniorCutoff == null && data.csatDate ? '학사일정의 수능일' : !data.csatDate && seniorCutoff == null ? '학사일정에서 수능일을 찾지 못했습니다 — 날짜를 정해 주세요' : '직접 정한 날'}
                  {cutoff && ` · 3학년 ${model.autoRules.length}명이 이날부터 빠집니다`}
                </span>
              </div>
            </div>
          ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">감독할 자습 (seaton 열람실 운영 시간)</p>
            <div className="flex flex-wrap gap-2">
              {(['morning', 'evening', 'saturday'] as SupervisionSlot[]).map((slot) => {
                const available = data.config.available[slot];
                return (
                  <label key={slot}
                    className={cn('flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs sm:min-h-0',
                      !available ? 'cursor-not-allowed border-dashed border-slate-200 text-slate-400' : enabled[slot] ? SLOT_TONE[slot] : 'border-slate-200 text-slate-500')}>
                    <input type="checkbox" className="h-4 w-4" disabled={!available} checked={available && enabled[slot]}
                      onChange={(e) => setEnabled((prev) => ({ ...prev, [slot]: e.target.checked }))} />
                    <span className="font-semibold">{SLOT_LABEL[slot]}</span>
                    <span className="tabular-nums">{available ? `${times[slot].start}~${times[slot].end}` : '이 학년 열람실 없음'}</span>
                  </label>
                );
              })}
            </div>
            {enabled.morning && data.config.available.morning && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-medium">아침 감독</span>
                <div className="flex rounded-lg border border-slate-100 bg-slate-100/50 p-0.5">
                  {([['separate', '저녁과 다른 사람'], ['with_evening', '그날 저녁 감독이 함께'], ['school', '전 학년 통합 당번']] as [MorningMode, string][]).map(([mode, label]) => (
                    <button key={mode} type="button" onClick={() => setMorningMode(mode)}
                      className={cn('h-7 rounded-md px-2.5 font-medium', morningMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
                      {label}
                    </button>
                  ))}
                </div>
                {morningMode === 'school' ? (
                  <span className="flex items-center gap-1 text-slate-500">
                    이 학년에는 아침 칸을 만들지 않습니다 —
                    <button type="button" className="font-semibold text-blue-700 underline-offset-2 hover:underline" onClick={() => setGrade(SCHOOL_GRADE)}>전 학년 아침</button>
                    에서 배정합니다
                  </span>
                ) : (
                  <>
                    <span className="text-slate-400">아침 열람실은 시간 정보가 없어 직접 정합니다</span>
                    <input type="time" aria-label="아침 시작" className="h-8 rounded-md border border-slate-200 px-2 tabular-nums"
                      value={times.morning.start} onChange={(e) => setMorningTime({ start: e.target.value, end: times.morning.end })} />
                    <span>~</span>
                    <input type="time" aria-label="아침 끝" className="h-8 rounded-md border border-slate-200 px-2 tabular-nums"
                      value={times.morning.end} onChange={(e) => setMorningTime({ start: times.morning.start, end: e.target.value })} />
                  </>
                )}
              </div>
            )}
          </div>
          )}

          {/* 요약 · 대상자 */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-slate-700">새 칸 {model.plan.length}개</span>
            {model.existing.size > 0 && <span className="text-slate-500">· 이미 만든 칸 {model.existing.size}개</span>}
            {mustFix > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">고칠 것 {mustFix}</span>}
            {toCheck > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">확인할 것 {toCheck}</span>}
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={() => setShowUnavailable((v) => !v)}>
                <CalendarX2 className="h-3.5 w-3.5" /> 못 하는 날 {(unavailability.data ?? []).filter((r) => model.pool.includes(r.name)).length}
              </Button>
              <Button variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={() => setShowPool((v) => !v)}>
                <Users className="h-3.5 w-3.5" /> 대상 {model.pool.length}명
              </Button>
              <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => setShowLoads((v) => !v)}>사람별 횟수</Button>
            </div>
          </div>

          {data.pool.length === 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {isSchool
                ? `${data.academicYear}학년도 1~3학년부 명단과 담임·학년부장 태그가 모두 비어 있습니다. 관리자에게 부서 명단을 확인해 달라고 요청해 주세요.`
                : `${data.academicYear}학년도 ${grade}학년부 명단과 ${grade}학년 담임·학년부장 태그가 모두 비어 있습니다. 관리자에게 부서 명단을 확인해 달라고 요청해 주세요.`}
            </p>
          )}

          {showPool && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="mb-2 text-xs text-slate-500">
                {isSchool ? `${data.academicYear}학년도 1~3학년부 소속 + 담임·학년부장.` : `${data.academicYear}학년도 ${grade}학년부 소속 + ${grade}학년 담임·학년부장.`}
                {' '}이번 달만 빼야 할 사람은 체크를 해제하세요(저장되지 않습니다). 늘 안 되는 요일·날짜는 «못 하는 날»에 적어 두세요.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.pool.map((p) => (
                  <label key={p.resourceId} className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs sm:min-h-0">
                    <input type="checkbox" className="h-4 w-4" checked={!excluded.has(p.name)}
                      onChange={(e) => setExcluded((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.delete(p.name); else next.add(p.name);
                        return next;
                      })} />
                    {p.name}
                    {isSchool && <span className="text-[11px] text-slate-400">{p.grades.join('·')}학년</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          {showUnavailable && (
            <UnavailabilityPanel
              people={data.pool}
              rules={unavailability.data ?? []}
              autoRules={model.autoRules}
              canEdit={() => true}
              slots={isSchool ? ['morning'] : undefined}
              intro="저녁 수업처럼 매주 반복되는 사정이나 미리 말한 날짜를 적어 두면 자동 배정이 피합니다. 저장되어 다음 달에도 적용되고, 선생님 본인도 [내 감독·교체]에서 적을 수 있습니다."
            />
          )}

          {showLoads && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[420px] text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">이름</th>
                    {(['morning', 'evening', 'saturday'] as SupervisionSlot[]).filter((s) => data.config.available[s]).map((s) => (
                      <th key={s} className="px-2 py-2 text-right font-medium">{SLOT_LABEL[s]}</th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium">합계</th>
                    <th className="px-3 py-2 text-left font-medium">요일(월~토)</th>
                  </tr>
                </thead>
                <tbody>
                  {model.pool.map((name) => {
                    const load = model.loads.get(name);
                    if (!load) return null;
                    return (
                      <tr key={name} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 font-medium text-slate-800">{name}</td>
                        {(['morning', 'evening', 'saturday'] as SupervisionSlot[]).filter((s) => data.config.available[s]).map((s) => (
                          <td key={s} className="px-2 py-1.5 text-right tabular-nums">{load.bySlot[s]}</td>
                        ))}
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{load.total}</td>
                        <td className="px-3 py-1.5 tabular-nums text-slate-500">{load.byDow.slice(1, 7).join(' · ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">{data.academicYear}학년도 누적 + 이 초안. 시간대별 횟수를 먼저, 그다음 요일을 고르게 맞춥니다.</p>
            </div>
          )}

          {/* 칸 목록 */}
          {model.plan.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-10 text-center text-sm text-slate-500">
              {model.allCells.length === 0
                ? '이 달에는 감독할 자습일이 없습니다(방학·휴일이거나 지난 날짜).'
                : '이 달의 감독은 모두 일정으로 만들어져 있습니다.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {model.plan.map((cell, index) => {
                const issues = model.issues[index];
                const tone = issues.includes('empty') || issues.includes('duplicate') ? 'rose' : issues.length > 0 ? 'amber' : null;
                const blockedReason = (name: string) =>
                  unavailabilityReason(model.rules, name, cell)
                  ?? (data.absent.has(`${cell.date}|${name}`) ? (data.absentTitles.get(`${cell.date}|${name}`) ?? ['출장·연수']).join(', ') : null);
                // 못 하는 사람은 맨 뒤로(고를 수는 있다 — 사정이 바뀌었을 수 있다)
                const ranked = rankCandidates(model.pool, model.loads, cell, seed);
                const options = [...ranked.filter((n) => !blockedReason(n)), ...ranked.filter((n) => blockedReason(n))];
                const key = cellKey(cell);
                return (
                  <li key={key} className={cn('flex flex-wrap items-center gap-2 px-3 py-2', tone === 'rose' && 'bg-rose-50/50', tone === 'amber' && 'bg-amber-50/40')}>
                    <span className="w-[68px] shrink-0 text-xs font-semibold tabular-nums text-slate-700">{dayLabel(cell.date, cell.dow)}</span>
                    <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold', SLOT_TONE[cell.slot])}>
                      {slotChip(cell)}
                    </span>
                    <select
                      aria-label={`${dayLabel(cell.date, cell.dow)} ${SLOT_LABEL[cell.slot]} 감독`}
                      className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm sm:max-w-[220px]"
                      value={cell.assignee ?? ''}
                      onChange={(e) => { setArmed(false); setOverrides((prev) => ({ ...prev, [key]: e.target.value || null })); }}
                    >
                      <option value="">— 비우기 —</option>
                      {options.map((name) => {
                        const load = model.loads.get(name);
                        const reason = blockedReason(name);
                        return <option key={name} value={name}>{name} ({SLOT_LABEL[cell.slot]} {load?.bySlot[cell.slot] ?? 0} · 합계 {load?.total ?? 0}){reason ? ` — 못 함: ${reason}` : ''}</option>;
                      })}
                    </select>
                    {issues.map((issue) => (
                      <span key={issue} title={issue === 'absent'
                        ? (data.absentTitles.get(`${cell.date}|${cell.assignee}`) ?? []).join(', ')
                        : issue === 'unavailable' && cell.assignee ? (unavailabilityReason(model.rules, cell.assignee, cell) ?? undefined) : undefined}
                        className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          issue === 'empty' || issue === 'duplicate' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800')}>
                        <AlertTriangle className="h-3 w-3" />{CELL_ISSUE_LABEL[issue]}
                      </span>
                    ))}
                    {cell.notes.length > 0 && <span className="order-last w-full truncate text-[11px] text-slate-400 sm:order-none sm:w-auto" title={cell.notes.join(', ')}>{cell.notes.join(' · ')}</span>}
                    <button type="button" aria-label={`${dayLabel(cell.date, cell.dow)} ${SLOT_LABEL[cell.slot]} 감독 빼기`} title="이 날은 감독을 만들지 않습니다"
                      className="ml-auto h-8 shrink-0 rounded-md px-2 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      onClick={() => { setArmed(false); setSkipped((prev) => new Set(prev).add(key)); }}>
                      빼기
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[11px] leading-relaxed text-slate-400">
            공휴일·휴업일·방학은 자동으로 빠지고, 시험일은 배정하되 날짜 옆에 적습니다. 출장·연수(보이는 것)와 «못 하는 날»에 적힌 사정은 피합니다 — 적히지 않은 사정은 시스템이 모르니 만들기 전에 확인해 주세요.
          </p>
        </>
      )}
    </div>
    <div className={cn(DIALOG_FOOTER_CLASS, 'flex-wrap')}>{footer}</div>
    </>
  );
}
