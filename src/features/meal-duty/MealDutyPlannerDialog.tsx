// 급식지도 월간 명단 만들기 — 스케줄 [부가 기능] (2026-10-01)
//
// 매달 엑셀로 만들던 명단을 규칙으로 **초안**을 만들고, 선생님이 확인·수정한 뒤 일정으로 만든다.
// 규칙·근거는 `@/lib/mealDuty` 머리말. 시스템은 시간표·출장만 알고 개인 일정·연수(일부만 보인다)·
// 행사 동참 여부는 모른다(사용자 지적 2026-10-01) — 그래서 이 화면의 무게는 "만들기"보다 "고치기"에 있다:
//   · 알 수 있는 문제(빈칸·3교시 수업·출장/연수·같은 날 중복)를 칸에 붙이고 요약·"문제만 보기"로 모은다
//   · 고칠 때 순환이 덜 틀어지는 길을 앞에 둔다 — 두 칸 **맞바꾸기**(횟수 유지), 바꿀 사람은 덜 맡은 사람 먼저
//   · 모든 손 보정은 되돌릴 수 있다
// 저장은 기존 일괄 업무와 같은 `onCreateEvent` 를 한 건씩 부른다(알림·담당자 정규화가 같은 경로).
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeftRight, CalendarDays, CalendarX2, ChevronDown, ChevronLeft, ChevronRight, Copy, Info,
  LayoutList, Loader2, Printer, RotateCcw, Undo2, Users, Utensils,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { readStoredJson, writeStoredJson } from '@/lib/safeLocalStorage';
import {
  MEAL_DUTY_DEFAULT_TIME, MEAL_DUTY_EXCLUSION_LABEL, MEAL_DUTY_PER_DAY, isoDayOfWeek, lastAssignedByName,
  formatLastDuty, latestDutyByName, listMealDutyDays, mealDutyTitle, planMealDuty, rankReplacements, slotIssues, swapSlots, toDateKey,
  type SlotIssue,
} from '@/lib/mealDuty';
import { useMealDutySources } from './useMealDutySources';
import { buildDutyRosterDocument, openPrintDocument, type RosterEntry, type RosterOffDay } from '@/lib/dutyRosterPrint';

const WEEKDAY = ['', '월', '화', '수', '목', '금'];
/** 이번 명단에서 손으로 뺀 사람 — 보는 사람의 편의 기억(정본 아님) */
const EXCLUDED_KEY = 'meal-duty-excluded-v1';

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function dayLabel(date: string, dow: number) {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}(${WEEKDAY[dow] ?? ''})`;
}

/** 문제 색 — 빈칸·중복은 로즈(반드시 고칠 것), 3교시·출장은 앰버(확인할 것) */
function issueTone(issues: SlotIssue[]): 'rose' | 'amber' | null {
  if (issues.some((i) => i.kind === 'empty' || i.kind === 'duplicate')) return 'rose';
  if (issues.length > 0) return 'amber';
  return null;
}

type Slots = (string | null)[];
type SlotRef = { date: string; index: number };

interface MealDutyPlannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 처음 열 때 보여 줄 달 — 스케줄에서 보고 있던 달 */
  initialDate: Date;
  /** 스케줄의 일정 생성(`useSchedule.createEvent`) — 일괄 업무와 같은 경로 */
  onCreateEvent: (eventData: {
    title: string; kind: 'duty'; starts_at: string; ends_at: string;
    assignee: string; scope: string; exchangeable: boolean; description: string;
  }) => Promise<string | boolean>;
}

export function MealDutyPlannerDialog({ open, onOpenChange, initialDate, onCreateEvent }: MealDutyPlannerDialogProps) {
  const [ym, setYm] = useState({ year: initialDate.getFullYear(), month: initialDate.getMonth() + 1 });
  const [startTime, setStartTime] = useState<string>(MEAL_DUTY_DEFAULT_TIME.start);
  const [endTime, setEndTime] = useState<string>(MEAL_DUTY_DEFAULT_TIME.end);
  // 기본값(전 학년 시험 = 쉼)에서 **뒤집은** 날 — 쉬는 날 = defaultSkip XOR 이 집합
  const [skipToggled, setSkipToggled] = useState<Set<string>>(new Set());
  // 날짜별 인원 손 보정(기본 = 수학여행·현장체험학습 1명, 나머지 2명)
  const [headcounts, setHeadcounts] = useState<Record<string, number>>({});
  const [overrides, setOverrides] = useState<Record<string, Slots>>({});
  // 칸 손 보정의 되돌리기 — 직전 상태들
  const [undoStack, setUndoStack] = useState<Record<string, Slots>[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set(readStoredJson(EXCLUDED_KEY, [], isStringArray)));
  const [showPool, setShowPool] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [swapFrom, setSwapFrom] = useState<SlotRef | null>(null);
  const [focusName, setFocusName] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (open) setYm({ year: initialDate.getFullYear(), month: initialDate.getMonth() + 1 });
    // 열 때만 스케줄의 달을 따른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 달이 바뀌면 그 달의 손 보정은 의미가 없다
  useEffect(() => {
    setSkipToggled(new Set()); setHeadcounts({}); setOverrides({}); setUndoStack([]);
    setSwapFrom(null); setFocusName(null); setArmed(false);
  }, [ym.year, ym.month]);

  const { data, isLoading, error, term, termLoading } = useMealDutySources(ym.year, ym.month, open);

  const monthKey = `${ym.year}-${String(ym.month).padStart(2, '0')}`;
  const nextMonthStart = toDateKey(new Date(ym.year, ym.month, 1));
  const today = toDateKey(new Date());

  const model = useMemo(() => {
    if (!data) return null;
    const pool = data.candidates.filter((c) => !c.exclusion && !excluded.has(c.name)).map((c) => c.name);
    const existing = new Map(data.history.filter((r) => r.date.startsWith(monthKey)).map((r) => [r.date, r.names]));
    const { days, closed } = listMealDutyDays(ym.year, ym.month, data.calendar);
    const isSkipped = (d: { date: string; defaultSkip?: string }) => !!d.defaultSkip !== skipToggled.has(d.date);
    const openDays = days
      .filter((d) => d.date >= today && !isSkipped(d) && !existing.has(d.date))
      .map((d) => ({ ...d, headcount: headcounts[d.date] ?? d.headcount ?? MEAL_DUTY_PER_DAY }));
    const plan = planMealDuty({
      days: openDays,
      pool,
      busy: data.busy,
      // 이 달에 이미 있는 명단까지 "한 것"으로 센다 — 그 사람이 같은 달에 또 앞에 서지 않게
      lastAssigned: lastAssignedByName(data.history, nextMonthStart),
    });
    const ctx = { busy: data.busy, absences: data.absences };
    const finalPlan = plan.map((day) => {
      const o = overrides[day.date];
      const slots: Slots = Array.from({ length: day.headcount ?? MEAL_DUTY_PER_DAY }, (_, i) => (o && o[i] !== undefined ? o[i] : day.assignees[i] ?? null));
      const withSlots = { ...day, slots };
      return { ...withSlots, issues: slots.map((_, i) => slotIssues(withSlots, i, ctx)) };
    });
    const byDate = new Map(finalPlan.map((d) => [d.date, d]));

    // 사람별 이 달 횟수 — 이미 있는 명단 + 초안
    const monthCounts = new Map<string, number>();
    const monthDates = new Map<string, string[]>();
    const add = (name: string, date: string) => {
      monthCounts.set(name, (monthCounts.get(name) ?? 0) + 1);
      monthDates.set(name, [...(monthDates.get(name) ?? []), date]);
    };
    for (const [date, names] of existing) for (const n of names) add(n, date);
    for (const d of finalPlan) for (const n of d.slots) if (n) add(n, d.date);

    const issueCount = { empty: 0, busy: 0, absent: 0, duplicate: 0 };
    for (const d of finalPlan) for (const list of d.issues) for (const i of list) issueCount[i.kind]++;

    return {
      pool, existing, days, closed, finalPlan, byDate, isSkipped, ctx, monthCounts, monthDates, issueCount,
      // 마지막 감독일 — 지난 명단 + 이 달(이미 있는 것 + 초안). 바꿀 사람 순서·표시의 기준
      lastDuty: latestDutyByName([
        ...data.history,
        ...finalPlan.map((d) => ({ date: d.date, names: d.slots.filter(Boolean) as string[] })),
      ]),
    };
  }, [data, excluded, skipToggled, headcounts, overrides, ym.year, ym.month, monthKey, nextMonthStart, today]);

  const creatable = model?.finalPlan.filter((d) => d.slots.some(Boolean)) ?? [];
  const totalIssues = model ? Object.values(model.issueCount).reduce((a, b) => a + b, 0) : 0;
  const busyWorking = progress !== null;
  const noTerm = !termLoading && !term;

  const moveMonth = (delta: number) => setYm(({ year, month }) => {
    const d = new Date(year, month - 1 + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });

  const toggleExcluded = (name: string) => setExcluded((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    writeStoredJson(EXCLUDED_KEY, [...next]);
    return next;
  });

  /** 칸 손 보정 — 되돌리기 기록을 남긴다 */
  const applyOverrides = (patch: Record<string, Slots>) => {
    setUndoStack((prev) => [...prev.slice(-30), overrides]);
    setOverrides((prev) => ({ ...prev, ...patch }));
    setArmed(false);
  };

  const replaceSlot = (date: string, index: number, name: string | null) => {
    const day = model?.byDate.get(date);
    if (!day) return;
    const slots = [...day.slots];
    slots[index] = name;
    applyOverrides({ [date]: slots });
  };

  /** 맞바꾸기 — 첫 칸을 고르고 둘째 칸을 누르면 두 사람의 날짜가 바뀐다 */
  const pickSwap = (ref: SlotRef) => {
    if (!model) return;
    if (!swapFrom) { setSwapFrom(ref); return; }
    if (swapFrom.date === ref.date && swapFrom.index === ref.index) { setSwapFrom(null); return; }
    const a = model.byDate.get(swapFrom.date);
    const b = model.byDate.get(ref.date);
    setSwapFrom(null);
    if (!a || !b) return;
    applyOverrides(swapSlots({ date: a.date, slots: a.slots, index: swapFrom.index }, { date: b.date, slots: b.slots, index: ref.index }));
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    setOverrides(undoStack[undoStack.length - 1]);
    setUndoStack(undoStack.slice(0, -1));
    setArmed(false);
  };

  const resetEdits = () => {
    setUndoStack((prev) => [...prev, overrides]);
    setOverrides({});
    setArmed(false);
  };

  /** 출력 — 이미 만든 명단 + 지금 초안 + 쉬는 날의 이유. 창은 클릭 흐름 안에서 연다(팝업 차단) */
  const printRoster = () => {
    if (!model) return;
    const entries: RosterEntry[] = [];
    const offDays: RosterOffDay[] = model.closed.map((c) => ({ date: c.date, reason: c.reason }));
    for (const d of model.days) {
      const made = model.existing.get(d.date);
      if (made) { entries.push({ date: d.date, names: made }); continue; }
      if (model.isSkipped(d)) { offDays.push({ date: d.date, reason: d.defaultSkip ?? '쉼' }); continue; }
      const draft = model.byDate.get(d.date);
      if (draft) entries.push({ date: d.date, names: draft.slots.filter(Boolean) as string[] });
    }
    const html = buildDutyRosterDocument({
      title: `${ym.year}년 ${ym.month}월 급식지도 명단`,
      subtitle: `${startTime}~${endTime} · 하루 ${MEAL_DUTY_PER_DAY}명`,
      year: ym.year,
      month: ym.month,
      weekdays: [1, 2, 3, 4, 5],
      entries,
      offDays,
      footnote: `출력 ${new Date().toLocaleDateString('ko-KR')} · 바뀐 날은 스케줄의 일정이 기준입니다`,
    });
    if (!openPrintDocument(html)) toast.error('팝업이 차단되어 출력 창을 열지 못했습니다. 브라우저에서 이 사이트의 팝업을 허용해 주세요.');
  };

  const copyText = async () => {
    if (!model) return;
    const lines = model.finalPlan.map((d) => `${dayLabel(d.date, d.dow)} ${d.slots.map((s) => s ?? '(빈칸)').join(', ')}`);
    try {
      await navigator.clipboard.writeText([`${ym.month}월 급식 지도 일정`, ...lines].join('\n'));
      toast.success('명단을 복사했습니다 — 쿨메신저에 붙여 넣어 확인을 받을 수 있습니다');
    } catch {
      toast.error('복사하지 못했습니다');
    }
  };

  const create = async () => {
    if (!model || creatable.length === 0) return;
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime) {
      toast.error('시간을 확인해 주세요');
      return;
    }
    // 문제 칸이 남아 있으면 한 번 더 누르게 한다(막지는 않는다 — 시간표가 틀렸을 수도 있다)
    if (totalIssues > 0 && !armed) { setArmed(true); return; }
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    setProgress({ done: 0, total: creatable.length });
    let ok = 0;
    const failed: string[] = [];
    for (const day of creatable) {
      const names = [...new Set(day.slots.filter(Boolean) as string[])];
      const [y, m, d] = day.date.split('-').map(Number);
      const result = await onCreateEvent({
        title: mealDutyTitle(names),
        kind: 'duty',
        starts_at: new Date(y, m - 1, d, sh, sm).toISOString(),
        ends_at: new Date(y, m - 1, d, eh, em).toISOString(),
        assignee: names.join(','),
        scope: 'teachers',
        exchangeable: false,
        description: '급식지도',
      });
      if (result) ok++; else failed.push(dayLabel(day.date, day.dow));
      setProgress({ done: ok + failed.length, total: creatable.length });
    }
    setProgress(null);
    setArmed(false);
    if (failed.length === 0) {
      toast.success(`${ym.month}월 급식지도 ${ok}일을 만들었습니다 — 스케줄에서 날짜별로 다시 고칠 수 있습니다`);
      onOpenChange(false);
    } else {
      toast.error(`${ok}일 만들고 ${failed.length}일 실패했습니다: ${failed.join(', ')}`);
    }
  };

  // ── 칸 하나(목록 보기) ──
  const renderSlot = (day: NonNullable<typeof model>['finalPlan'][number], index: number) => {
    if (!model) return null;
    const name = day.slots[index];
    const issues = day.issues[index];
    const tone = issueTone(issues);
    const isSource = swapFrom?.date === day.date && swapFrom.index === index;
    const focused = !!name && name === focusName;
    const options = rankReplacements(day, index, model.pool, model.lastDuty, model.ctx);
    return (
      <div key={index} className="flex min-w-0 flex-1 flex-col gap-0.5 sm:max-w-[15rem]">
        <div className="flex min-w-0 items-center gap-1">
          <select
            value={name ?? ''}
            onChange={(e) => replaceSlot(day.date, index, e.target.value || null)}
            aria-label={`${dayLabel(day.date, day.dow)} ${index + 1}번째 담당`}
            className={cn(
              'h-9 min-w-0 flex-1 rounded-md border bg-white px-2 text-base sm:h-8 sm:text-xs',
              tone === 'rose' && 'border-rose-300 bg-rose-50 text-rose-700',
              tone === 'amber' && 'border-amber-300 bg-amber-50 text-amber-800',
              focused && 'ring-2 ring-blue-400',
              isSource && 'ring-2 ring-indigo-500',
            )}
          >
            <option value="">(빈칸)</option>
            {name && !options.some((o) => o.name === name) && <option value={name}>{name}</option>}
            {options.map((o) => (
              // 닫힌 칸에는 선택된 항목의 글자가 그대로 보이므로 선택된 사람은 이름만(설명은 칸 아래 줄이 맡는다)
              <option key={o.name} value={o.name}>
                {o.name === name ? o.name : `${o.name} · ${formatLastDuty(o.lastDuty, monthKey)}${o.issues.length ? ` · ${o.issues.join(' · ')}` : ''}`}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => pickSwap({ date: day.date, index })}
            aria-label={isSource ? '맞바꾸기 취소' : swapFrom ? '이 칸과 맞바꾸기' : '맞바꾸기 시작'}
            aria-pressed={isSource}
            className={cn(
              'h-9 w-9 shrink-0 p-0 text-slate-500 sm:h-8 sm:w-8',
              isSource && 'bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white',
              swapFrom && !isSource && 'text-indigo-600 ring-1 ring-indigo-200',
            )}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        {/* 빈칸은 칸 자체가 이미 말한다 — 아래 줄은 3교시·출장·중복만 */}
        {issues.some((i) => i.kind !== 'empty') && tone && (
          <span className={cn('truncate text-[11px]', tone === 'rose' ? 'text-rose-600' : 'text-amber-700')} title={issues.map((i) => i.label).join(' · ')}>
            {issues.map((i) => i.label).join(' · ')}
          </span>
        )}
      </div>
    );
  };

  // ── 목록 보기의 한 날 ──
  const renderDayRow = (day: NonNullable<typeof model>['days'][number]) => {
    if (!model) return null;
    const existing = model.existing.get(day.date);
    const planned = model.byDate.get(day.date);
    const past = day.date < today;
    const isSkipped = model.isSkipped(day);
    const count = headcounts[day.date] ?? day.headcount ?? MEAL_DUTY_PER_DAY;
    if (onlyIssues && !(planned && planned.issues.some((l) => l.length > 0))) return null;
    return (
      // 휴대폰: [날짜 … 인원·쉬기] / [담당 칸] — 데스크톱: 날짜 | 담당 | 인원·쉬기 (order 로 자리만 바꾼다)
      <li key={day.date} className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap">
        <div className="order-1 flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:w-52 sm:flex-none sm:shrink-0">
          <span className="text-sm font-medium tabular-nums text-slate-800">{dayLabel(day.date, day.dow)}</span>
          {day.notes.slice(0, 2).map((n) => (
            <span key={n} className="max-w-[8rem] truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600" title={n}>{n}</span>
          ))}
        </div>
        <div className="order-3 flex min-w-0 basis-full flex-wrap items-start gap-2 sm:order-2 sm:basis-auto sm:flex-1">
          {existing ? (
            <span className="text-xs text-slate-500">이미 있음 · {existing.join(', ')}</span>
          ) : past ? (
            <span className="text-xs text-slate-400">지난 날</span>
          ) : isSkipped ? (
            <span className="text-xs text-slate-400">이 날은 쉼{day.defaultSkip && !skipToggled.has(day.date) ? ` · ${day.defaultSkip}` : ''}</span>
          ) : planned ? (
            planned.slots.map((_, i) => renderSlot(planned, i))
          ) : null}
        </div>
        {!existing && !past && (
          <div className="order-2 flex shrink-0 items-center sm:order-3">
            {!isSkipped && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs text-slate-500 sm:h-8"
                aria-label={`${dayLabel(day.date, day.dow)} 인원 바꾸기`}
                title="하루 인원 1명/2명"
                onClick={() => {
                  const next = count === 1 ? 2 : 1;
                  setHeadcounts((prev) => ({ ...prev, [day.date]: next }));
                  // 줄인 인원 밖의 손 보정은 버린다
                  setOverrides((prev) => (prev[day.date] ? { ...prev, [day.date]: prev[day.date].slice(0, next) } : prev));
                }}
              >
                {count}명
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-xs text-slate-500 sm:h-8"
              onClick={() => setSkipToggled((prev) => {
                const next = new Set(prev);
                if (next.has(day.date)) next.delete(day.date); else next.add(day.date);
                return next;
              })}
            >
              {isSkipped ? '다시 넣기' : '쉬기'}
            </Button>
          </div>
        )}
      </li>
    );
  };

  // ── 달력 보기(늘 받던 엑셀 명단 모양) ──
  const renderGrid = () => {
    if (!model) return null;
    const closedMap = new Map(model.closed.map((c) => [c.date, c.reason]));
    const dayMap = new Map(model.days.map((d) => [d.date, d]));
    const last = new Date(ym.year, ym.month, 0).getDate();
    const cells: (string | null)[] = [];
    const firstDow = isoDayOfWeek(`${monthKey}-01`);
    // 첫 주 앞의 빈칸(주말 시작이면 없음)
    for (let i = 1; i < Math.min(firstDow, 6); i++) cells.push(null);
    for (let d = 1; d <= last; d++) {
      const key = `${monthKey}-${String(d).padStart(2, '0')}`;
      if (isoDayOfWeek(key) <= 5) cells.push(key);
    }
    return (
      <div className="overflow-x-auto">
        <div className="grid min-w-[36rem] grid-cols-5 overflow-hidden rounded-xl border bg-white text-xs">
          {WEEKDAY.slice(1).map((w) => (
            <div key={w} className="border-b bg-slate-50 px-2 py-1.5 text-center font-semibold text-slate-500">{w}</div>
          ))}
          {cells.map((key, i) => {
            if (!key) return <div key={`b${i}`} className="min-h-[4.5rem] border-b border-r bg-slate-50/40" />;
            const dnum = Number(key.slice(8));
            const day = dayMap.get(key);
            const planned = model.byDate.get(key);
            const existing = model.existing.get(key);
            const closedReason = closedMap.get(key);
            const skipped = day ? model.isSkipped(day) : false;
            const muted = !!closedReason || skipped || !!existing || key < today;
            return (
              <div key={key} className={cn('min-h-[4.5rem] border-b border-r p-1.5', muted && !existing && 'bg-amber-50/60')}>
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium tabular-nums text-slate-700">{dnum}</span>
                  {day?.notes[0] && <span className="truncate text-[10px] text-slate-400" title={day.notes.join(', ')}>{day.notes[0]}</span>}
                </div>
                <div className="mt-1 flex flex-col gap-0.5">
                  {closedReason && <span className="text-[11px] text-slate-400">{closedReason}</span>}
                  {existing && <span className="text-[11px] text-slate-500">{existing.join(', ')}</span>}
                  {!closedReason && !existing && skipped && <span className="text-[11px] text-slate-400">쉼</span>}
                  {planned?.slots.map((name, idx) => {
                    const tone = issueTone(planned.issues[idx]);
                    const isSource = swapFrom?.date === key && swapFrom.index === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => pickSwap({ date: key, index: idx })}
                        title={planned.issues[idx].map((x) => x.label).join(' · ') || '눌러서 맞바꾸기'}
                        className={cn(
                          'truncate rounded px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-indigo-50',
                          tone === 'rose' && 'bg-rose-50 text-rose-700',
                          tone === 'amber' && 'bg-amber-50 text-amber-800',
                          !tone && 'text-slate-800',
                          name && name === focusName && 'ring-2 ring-blue-400',
                          isSource && 'bg-indigo-600 text-white hover:bg-indigo-700',
                        )}
                      >
                        {name ?? '(빈칸)'}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busyWorking) onOpenChange(v); }}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-start gap-3">
            <TitleIconChip icon={Utensils} />
            <div className="min-w-0">
              <DialogTitle className="text-base">급식지도 명단 만들기</DialogTitle>
              <DialogDescription className="text-xs">
                3교시가 빈 선생님을 지난 명단에 이어 하루 {MEAL_DUTY_PER_DAY}명씩(수학여행·현장체험학습 날 1명) 배정한 초안입니다.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
          {/* 달 · 시간 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => moveMonth(-1)} disabled={busyWorking} aria-label="이전 달">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[7rem] text-center text-sm font-semibold text-slate-800">{ym.year}년 {ym.month}월</span>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => moveMonth(1)} disabled={busyWorking} aria-label="다음 달">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {/* 휴대폰은 입력 글자가 16px 로 커지므로(iOS 확대 방지) 고정 폭 대신 한 줄을 나눠 쓴다 */}
            <div className="flex w-full items-center gap-1.5 text-xs text-slate-600 sm:w-auto">
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-9 min-w-0 flex-1 text-xs sm:h-8 sm:w-[7.5rem] sm:flex-none" aria-label="시작 시간" />
              <span>~</span>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-9 min-w-0 flex-1 text-xs sm:h-8 sm:w-[7.5rem] sm:flex-none" aria-label="종료 시간" />
            </div>
          </div>

          {/* 초안이라는 사실 — 시스템이 모르는 것을 먼저 말한다 */}
          <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-slate-700">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
            <span>
              반영한 것: {term ? `${term.year}학년도 ${term.semester}학기 ` : ''}시간표(3교시) · 출장 일정 · 휴업일·공휴일 · 전 학년 시험일.{' '}
              <b className="font-semibold">개인 일정·연수·행사 동참 여부는 모릅니다</b> — [명단 복사]로 선생님들께 확인을 받고 칸을 고친 뒤 만드세요.
            </span>
          </div>

          {noTerm && <p role="alert" className="text-sm text-rose-600">시간표 학기를 찾지 못했습니다. 관리자에게 학사력 설정을 요청해 주세요.</p>}
          {error && <p role="alert" className="text-sm text-rose-600">자료를 불러오지 못했습니다: {(error as Error).message}</p>}
          {(isLoading || termLoading) && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 시간표와 지난 명단을 읽는 중…
            </div>
          )}

          {model && data && (
            <>
              {/* 대상자 */}
              <div className="rounded-xl border bg-white">
                <button
                  type="button"
                  onClick={() => setShowPool((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  aria-expanded={showPool}
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <Users className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="font-medium text-slate-800">대상 {model.pool.length}명</span>
                    <span className="truncate text-xs text-slate-500">
                      교장·교감·행정실·직원 제외{excluded.size > 0 ? ` · 이번에 뺀 사람 ${excluded.size}명` : ''}
                    </span>
                  </span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', showPool && 'rotate-180')} />
                </button>
                {showPool && (
                  <div className="space-y-2 border-t px-3 py-3">
                    <p className="text-[11px] text-slate-500">이름을 누르면 이번 명단에서 빼거나 다시 넣습니다(휴직·장기 출장 등). 이 기기에 기억됩니다.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.candidates.filter((c) => !c.exclusion).map((c) => {
                        const off = excluded.has(c.name);
                        return (
                          <button
                            key={c.resourceId}
                            type="button"
                            onClick={() => toggleExcluded(c.name)}
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-xs transition-colors',
                              off ? 'border-slate-200 bg-slate-100 text-slate-400 line-through' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
                            )}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="pt-1 text-[11px] text-slate-500">
                      규칙상 제외:{' '}
                      {data.candidates.filter((c) => c.exclusion).map((c) => `${c.name}(${MEAL_DUTY_EXCLUSION_LABEL[c.exclusion!]})`).join(' · ')}
                    </p>
                  </div>
                )}
              </div>

              {/* 검토 도구 줄 — 보기 · 문제 요약 · 되돌리기 */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-0.5 rounded-lg border border-slate-100 bg-slate-100/50 p-0.5">
                  {([['list', '목록', LayoutList], ['grid', '달력', CalendarDays]] as const).map(([v, label, Icon]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      aria-pressed={view === v}
                      className={cn('flex h-8 items-center gap-1 rounded-md px-2.5 text-xs', view === v ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}
                    >
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                  ))}
                </div>
                {totalIssues > 0 ? (
                  <button
                    type="button"
                    onClick={() => { setOnlyIssues((v) => !v); setView('list'); }}
                    aria-pressed={onlyIssues}
                    className={cn(
                      'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs',
                      onlyIssues ? 'border-amber-300 bg-amber-100 text-amber-900' : 'border-amber-200 bg-amber-50 text-amber-800',
                    )}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {[
                      model.issueCount.empty && `빈칸 ${model.issueCount.empty}`,
                      model.issueCount.busy && `3교시 ${model.issueCount.busy}`,
                      model.issueCount.absent && `출장·연수 ${model.issueCount.absent}`,
                      model.issueCount.duplicate && `중복 ${model.issueCount.duplicate}`,
                    ].filter(Boolean).join(' · ')}
                    <span className="text-amber-600">{onlyIssues ? '· 전체 보기' : '· 문제만 보기'}</span>
                  </button>
                ) : (
                  <span className="text-xs text-emerald-700">알 수 있는 문제 없음</span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs text-slate-600" onClick={undo} disabled={undoStack.length === 0}>
                    <Undo2 className="h-3.5 w-3.5" /> 되돌리기
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs text-slate-600" onClick={resetEdits} disabled={Object.keys(overrides).length === 0}>
                    <RotateCcw className="h-3.5 w-3.5" /> 처음 초안
                  </Button>
                </div>
              </div>

              {swapFrom && (
                <div role="status" className="flex items-center justify-between gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white">
                  <span className="min-w-0 truncate">
                    {dayLabel(swapFrom.date, isoDayOfWeek(swapFrom.date))} {model.byDate.get(swapFrom.date)?.slots[swapFrom.index] ?? '(빈칸)'} — 맞바꿀 칸을 누르세요
                  </span>
                  <button type="button" className="shrink-0 underline" onClick={() => setSwapFrom(null)}>취소</button>
                </div>
              )}

              {view === 'list' ? (
                <ul className="divide-y rounded-xl border bg-white">
                  {model.days.map(renderDayRow)}
                  {!onlyIssues && model.closed.map((c) => (
                    <li key={c.date} className="flex items-center gap-2 bg-slate-50/60 px-3 py-2 text-xs text-slate-400">
                      <CalendarX2 className="h-3.5 w-3.5" />
                      {dayLabel(c.date, isoDayOfWeek(c.date))} {c.reason} — 쉬는 날
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  {renderGrid()}
                  <p className="text-[11px] text-slate-500">이름을 두 번 차례로 누르면 두 사람의 날짜가 바뀝니다. 다른 사람으로 바꾸려면 [목록]에서 고르세요.</p>
                </>
              )}

              {/* 사람별 배정 — 몰림·누락을 한눈에 */}
              <div className="rounded-xl border bg-white">
                <button
                  type="button"
                  onClick={() => setShowPeople((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
                  aria-expanded={showPeople}
                >
                  <span className="font-medium text-slate-800">사람별 배정</span>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    이 달 {model.monthCounts.size}명 · 안 맡은 {model.pool.filter((n) => !model.monthCounts.has(n)).length}명
                    <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', showPeople && 'rotate-180')} />
                  </span>
                </button>
                {showPeople && (
                  <div className="space-y-2 border-t px-3 py-3">
                    <p className="text-[11px] text-slate-500">이름을 누르면 그 선생님의 칸이 표시됩니다.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[...model.monthDates.entries()]
                        .sort((a, b) => [...a[1]].sort()[0].localeCompare([...b[1]].sort()[0]) || a[0].localeCompare(b[0], 'ko'))
                        .map(([name, dates]) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setFocusName((cur) => (cur === name ? null : name))}
                            aria-pressed={focusName === name}
                            title={dates.map((d) => dayLabel(d, isoDayOfWeek(d))).join(', ')}
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-xs',
                              focusName === name ? 'border-blue-400 bg-blue-600 text-white' : dates.length > 1 ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700',
                            )}
                          >
                            {name}{' '}
                            <span className="tabular-nums opacity-70">
                              {[...dates].sort().map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`).join('·')}
                            </span>
                          </button>
                        ))}
                    </div>
                    {model.pool.some((n) => !model.monthCounts.has(n)) && (
                      <p className="text-[11px] text-slate-500">
                        이 달에 안 맡음 — 마지막 감독일이 오래된 순(다음 달 앞순서):{' '}
                        {model.pool
                          .filter((n) => !model.monthCounts.has(n))
                          .sort((a, b) => (model.lastDuty.get(a) ?? '').localeCompare(model.lastDuty.get(b) ?? '') || a.localeCompare(b, 'ko'))
                          .map((n) => `${n}(${formatLastDuty(model.lastDuty.get(n) ?? null, monthKey).replace('마지막 ', '')})`)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className={cn(DIALOG_FOOTER_CLASS, 'flex-wrap items-center')}>
          {armed && (
            <span className="mr-auto text-xs text-amber-700">문제 칸 {totalIssues}개가 남아 있습니다. 한 번 더 누르면 그대로 만듭니다.</span>
          )}
          <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={copyText} disabled={!model || busyWorking}>
            <Copy className="h-3.5 w-3.5" /> 명단 복사
          </Button>
          <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={printRoster} disabled={!model || busyWorking}>
            <Printer className="h-3.5 w-3.5" /> 출력
          </Button>
          <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={() => onOpenChange(false)} disabled={busyWorking}>
            닫기
          </Button>
          <Button
            className={cn('h-8 gap-1.5 px-3 text-xs', armed ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700')}
            onClick={create}
            disabled={!model || creatable.length === 0 || busyWorking}
          >
            {busyWorking ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress!.done}/{progress!.total}</>
            ) : armed ? (
              `그대로 ${creatable.length}일 만들기`
            ) : (
              `일정 ${creatable.length}일 만들기`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
