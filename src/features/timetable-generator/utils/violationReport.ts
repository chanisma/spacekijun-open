import { buildConflictGraph, edgeKey } from '../algorithm/conflictGraph';
import { cellKeyStr } from '../algorithm/csp';
import { DAY_LABELS, HARD_CONSTRAINT_LABELS, TEACHER_HARD_TIER1_IDS } from '../constants';
import type { Lesson, Placement, TimetableInput } from '../types';

/** 위반 1건 — UI 테이블 행 단위 */
export interface ViolationEntry {
  /** 사람이 읽는 한 줄 요약 */
  summary: string;
  /** HARD_CONSTRAINT_LABELS 키 (교사 부하 4종 등) */
  kind?: string;
  /** 교사 resource.id (있으면 교사별 뷰 점프용) */
  teacherId?: string;
  teacherName?: string;
  studentCode?: string;
  lessonIds?: string[];
  dayIndex?: number;
  period?: number;
}

export interface ViolationSection {
  id: string;
  label: string;
  count: number;
  tier: 'tier0' | 'tier1';
  entries: ViolationEntry[];
}

export interface ViolationReport {
  sections: ViolationSection[];
  /** 교사 부하(tier1) 위반 — evaluateFull metrics와 1:1 대응하는 단위 목록 */
  tier1Entries: ViolationEntry[];
  tier0: number;
  tier1: number;
  total: number;
}

/** tier0(충돌 등) 대량 목록만 상한 — tier1 교사 부하는 전건 표시 */
const MAX_TIER0_ENTRIES = 200;

function cellLabel(dayIndex: number, period: number): string {
  return `${DAY_LABELS[dayIndex] ?? dayIndex + 1} ${period}교시`;
}

function lessonBrief(l: Lesson): string {
  const cls = l.classLabel ? ` ${l.classLabel}` : '';
  return `${l.subjectName}${cls}`;
}

function teacherDisplay(l: Lesson): { id: string; name: string } | null {
  if (!l.teacherId) return null;
  return { id: l.teacherId, name: l.teacherName ?? l.teacherId.slice(0, 8) };
}

function capTier0Entries<T>(arr: T[]): T[] {
  return arr.length <= MAX_TIER0_ENTRIES ? arr : arr.slice(0, MAX_TIER0_ENTRIES);
}

function section(
  id: string,
  entries: ViolationEntry[],
  tier: 'tier0' | 'tier1',
): ViolationSection | null {
  if (entries.length === 0) return null;
  const capped = tier === 'tier0' ? capTier0Entries(entries) : entries;
  const omitted = entries.length - capped.length;
  const final = omitted > 0
    ? [...capped, { summary: `…외 ${omitted}건 더 (총 ${entries.length}건)` }]
    : capped;
  return {
    id,
    label: HARD_CONSTRAINT_LABELS[id] ?? id,
    count: entries.length,
    tier,
    entries: final.map((e) => ({ ...e, kind: e.kind ?? id })),
  };
}

/**
 * 배치 결과의 하드 제약 위반을 **대상별**(교사·학생·과목·칸)로 분해한다.
 * evaluateFull의 count와 동일 의미론이며, UI 상세 패널 전용(저장본에 포함하지 않음).
 */
export function collectViolationReport(
  input: TimetableInput,
  placements: Placement[],
  opts?: { studentNames?: Map<string, string> },
): ViolationReport {
  const graph = buildConflictGraph(input.lessons, {
    teacher: input.options.hard.teacherConflict,
    room: input.options.hard.roomConflict,
  });
  const byId = graph.byLessonId;
  const map = new Map<string, { dayIndex: number; period: number }>();
  for (const p of placements) map.set(p.lessonId, { dayIndex: p.dayIndex, period: p.period });
  const placedIds = new Set(map.keys());
  const studentNames = opts?.studentNames;

  const tierOf = (id: string): 'tier0' | 'tier1' =>
    TEACHER_HARD_TIER1_IDS.has(id) ? 'tier1' : 'tier0';

  const sections: ViolationSection[] = [];
  const tier1Entries: ViolationEntry[] = [];
  const pushTier1 = (id: string, entry: ViolationEntry) => {
    const e = { ...entry, kind: id };
    tier1Entries.push(e);
    return e;
  };

  // ── 미배치 ──
  {
    const entries: ViolationEntry[] = [];
    for (const l of graph.lessons) {
      if (!placedIds.has(l.id)) {
        entries.push({ summary: `${lessonBrief(l)} (${l.grade}학년) — 배치되지 않음`, lessonIds: [l.id] });
      }
    }
    const s = section('unplaced', entries, tierOf('unplaced'));
    if (s) sections.push(s);
  }

  // ── 차단 칸 침범 ──
  {
    const entries: ViolationEntry[] = [];
    for (const [lessonId, cell] of map) {
      const l = byId.get(lessonId);
      if (!l) continue;
      const k = cellKeyStr(cell);
      if (l.blockedCells.includes(k)) {
        const t = teacherDisplay(l);
        entries.push({
          summary: `${lessonBrief(l)} → ${cellLabel(cell.dayIndex, cell.period)} (공강·불가시간 칸)`,
          lessonIds: [lessonId],
          teacherId: t?.id,
          teacherName: t?.name,
          dayIndex: cell.dayIndex,
          period: cell.period,
        });
      }
    }
    const s = section('blockedCell', entries, tierOf('blockedCell'));
    if (s) sections.push(s);
  }

  // ── 칸별 동시 점유 충돌 (학생/교사/교실) ──
  const cellOcc = new Map<string, string[]>();
  for (const [lessonId, cell] of map) {
    const k = cellKeyStr(cell);
    (cellOcc.get(k) ?? cellOcc.set(k, []).get(k)!).push(lessonId);
  }

  const studentEntries: ViolationEntry[] = [];
  const teacherEntries: ViolationEntry[] = [];
  const roomEntries: ViolationEntry[] = [];

  for (const [k, ids] of cellOcc) {
    if (ids.length < 2) continue;
    const [dayIndex, period] = k.split('|').map(Number);
    const cellLs = ids.map((id) => byId.get(id)!).filter(Boolean);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        const reason = graph.edgeReason.get(edgeKey(a, b));
        if (!reason) continue;
        const la = byId.get(a)!;
        const lb = byId.get(b)!;
        const slot = cellLabel(dayIndex, period);
        if (reason & 1) {
          const shared = la.studentCodes.filter((c) => lb.studentCodes.includes(c));
          for (const code of shared) {
            const name = studentNames?.get(code) ?? code;
            studentEntries.push({
              summary: `학생 ${name} — ${slot}에 '${lessonBrief(la)}'와 '${lessonBrief(lb)}' 동시 배치`,
              studentCode: code,
              lessonIds: [a, b],
              dayIndex,
              period,
            });
          }
          if (shared.length === 0) {
            studentEntries.push({
              summary: `${slot} — '${lessonBrief(la)}' ↔ '${lessonBrief(lb)}' (학생 충돌)`,
              lessonIds: [a, b],
              dayIndex,
              period,
            });
          }
        }
        if (reason & 2 && input.options.hard.teacherConflict && la.teacherId && la.teacherId === lb.teacherId) {
          const t = teacherDisplay(la)!;
          teacherEntries.push({
            summary: `교사 ${t.name} — ${slot}에 '${lessonBrief(la)}'와 '${lessonBrief(lb)}' 동시 수업`,
            teacherId: t.id,
            teacherName: t.name,
            lessonIds: [a, b],
            dayIndex,
            period,
          });
        }
        if (reason & 4 && input.options.hard.roomConflict && la.roomId && la.roomId === lb.roomId) {
          roomEntries.push({
            summary: `교실 ${la.roomId} — ${slot}에 '${lessonBrief(la)}'와 '${lessonBrief(lb)}' 동시 사용`,
            lessonIds: [a, b],
            dayIndex,
            period,
          });
        }
      }
    }
    void cellLs;
  }

  for (const [id, entries] of [
    ['studentConflict', studentEntries],
    ['teacherConflict', teacherEntries],
    ['roomConflict', roomEntries],
  ] as const) {
    const s = section(id, entries, tierOf(id));
    if (s) sections.push(s);
  }

  // ── 같은 과목 하루 중복 ──
  if (input.options.hard.subjectDailyCap) {
    const maxPer = input.options.maxPerSubjectPerDay;
    const byOffDay = new Map<string, { lessons: Lesson[]; dayIndex: number }>();
    for (const [lessonId, cell] of map) {
      const l = byId.get(lessonId);
      if (!l) continue;
      const key = `${l.offeringId}|${cell.dayIndex}`;
      const e = byOffDay.get(key) ?? { lessons: [], dayIndex: cell.dayIndex };
      e.lessons.push(l);
      byOffDay.set(key, e);
    }
    const entries: ViolationEntry[] = [];
    for (const [, { lessons: ls, dayIndex }] of byOffDay) {
      if (ls.length <= maxPer) continue;
      const sample = ls[0];
      const periods = ls.map((l) => map.get(l.id)!.period).sort((a, b) => a - b);
      entries.push({
        summary: `'${lessonBrief(sample)}' — ${DAY_LABELS[dayIndex]}요일 ${ls.length}회 배치 (상한 ${maxPer}회) · ${periods.join(',')}교시`,
        lessonIds: ls.map((l) => l.id),
        dayIndex,
      });
    }
    const s = section('subjectDailyCap', entries, tierOf('subjectDailyCap'));
    if (s) sections.push(s);
  }

  // ── 고정 배치 위반 ──
  {
    const entries: ViolationEntry[] = [];
    for (const pin of input.pinned) {
      const cell = map.get(pin.lessonId);
      const l = byId.get(pin.lessonId);
      if (!l) continue;
      if (!cell || cell.dayIndex !== pin.dayIndex || cell.period !== pin.period) {
        const expected = cellLabel(pin.dayIndex, pin.period);
        const actual = cell ? cellLabel(cell.dayIndex, cell.period) : '미배치';
        entries.push({
          summary: `${lessonBrief(l)} — 고정 ${expected}인데 실제 ${actual}`,
          lessonIds: [pin.lessonId],
        });
      }
    }
    const s = section('pinnedViolation', entries, tierOf('pinnedViolation'));
    if (s) sections.push(s);
  }

  // ── 교사 부하 4종 (교사×요일·과목 단위 상세) ──
  const teacherCap = input.options.maxPerTeacherPerDay ?? 4;
  const teacherMaxRun = input.options.maxConsecutivePerTeacher ?? 2;
  const teacherLastCap = input.options.maxLastPeriodPerTeacher ?? 3;
  const lastPeriod = input.grid.periodsPerDay;
  const h = input.options.hard;

  type TDay = { day: number; periods: number[]; lessons: Lesson[] };
  const byTeacherDay = new Map<string, TDay[]>();
  const byTeacherOfferingDay = new Map<string, Map<number, { periods: number[]; lessons: Lesson[] }>>();
  const teacherLast = new Map<string, Lesson[]>();

  for (const [lessonId, cell] of map) {
    const l = byId.get(lessonId);
    if (!l?.teacherId) continue;
    const tid = l.teacherId;
    let days = byTeacherDay.get(tid);
    if (!days) {
      days = Array.from({ length: input.grid.days }, (_, d) => ({ day: d, periods: [], lessons: [] }));
      byTeacherDay.set(tid, days);
    }
    days[cell.dayIndex].periods.push(cell.period);
    days[cell.dayIndex].lessons.push(l);
    const sk = `${tid}|${l.offeringId}`;
    let subMap = byTeacherOfferingDay.get(sk);
    if (!subMap) {
      subMap = new Map();
      byTeacherOfferingDay.set(sk, subMap);
    }
    const sd = subMap.get(cell.dayIndex) ?? { periods: [], lessons: [] };
    sd.periods.push(cell.period);
    sd.lessons.push(l);
    subMap.set(cell.dayIndex, sd);
    if (cell.period === lastPeriod) {
      (teacherLast.get(tid) ?? teacherLast.set(tid, []).get(tid)!).push(l);
    }
  }

  const teacherNameOf = (tid: string): string => {
    for (const l of graph.lessons) if (l.teacherId === tid && l.teacherName) return l.teacherName;
    return tid.slice(0, 8);
  };

  if (h.teacherDailyCap) {
    const entries: ViolationEntry[] = [];
    for (const [tid, days] of byTeacherDay) {
      const name = teacherNameOf(tid);
      for (const { day, periods, lessons: ls } of days) {
        const sorted = [...new Set(periods)].sort((a, b) => a - b);
        if (sorted.length <= teacherCap) continue;
        for (let i = teacherCap; i < sorted.length; i++) {
          const p = sorted[i];
          const slotLessons = ls.filter((l) => {
            const c = map.get(l.id)!;
            return c.dayIndex === day && c.period === p;
          });
          const subjects = [...new Set(slotLessons.map(lessonBrief))].join(' · ');
          const e = pushTier1('teacherDailyOver', {
            summary: `교사 ${name} — ${DAY_LABELS[day]} ${p}교시는 하루 상한 ${teacherCap}개 초과 (${sorted.length}개 중 ${i + 1}번째) · ${subjects}`,
            teacherId: tid,
            teacherName: name,
            dayIndex: day,
            period: p,
            lessonIds: slotLessons.map((l) => l.id),
          });
          entries.push(e);
        }
      }
    }
    const s = section('teacherDailyOver', entries, tierOf('teacherDailyOver'));
    if (s) sections.push(s);
  }

  if (h.teacherConsecutive) {
    const entries: ViolationEntry[] = [];
    for (const [tid, days] of byTeacherDay) {
      const name = teacherNameOf(tid);
      for (const { day, periods, lessons: ls } of days) {
        const sorted = [...new Set(periods)].sort((a, b) => a - b);
        let i = 0;
        while (i < sorted.length) {
          let j = i + 1;
          while (j < sorted.length && sorted[j] === sorted[j - 1] + 1) j++;
          const runLen = j - i;
          if (runLen > teacherMaxRun) {
            const start = sorted[i];
            const end = sorted[j - 1];
            const excess = runLen - teacherMaxRun;
            for (let k = 0; k < excess; k++) {
              const winStart = start + k;
              const winEnd = winStart + teacherMaxRun;
              const inWin = ls.filter((l) => {
                const c = map.get(l.id)!;
                return c.dayIndex === day && c.period >= winStart && c.period <= winEnd;
              });
              const e = pushTier1('teacherTripleRun', {
                summary: `교사 ${name} — ${DAY_LABELS[day]} ${teacherMaxRun + 1}연속 금지: ${winStart}~${winEnd}교시 윈도 (${start}~${end}교시 연속 블록) · ${[...new Set(inWin.map(lessonBrief))].join(' · ')}`,
                teacherId: tid,
                teacherName: name,
                dayIndex: day,
                lessonIds: inWin.map((l) => l.id),
              });
              entries.push(e);
            }
          }
          i = j;
        }
      }
    }
    const s = section('teacherTripleRun', entries, tierOf('teacherTripleRun'));
    if (s) sections.push(s);
  }

  if (h.teacherLastPeriodCap) {
    const entries: ViolationEntry[] = [];
    for (const [tid, ls] of teacherLast) {
      if (ls.length <= teacherLastCap) continue;
      const name = teacherNameOf(tid);
      const ordered = [...ls].sort((a, b) => {
        const ca = map.get(a.id)!;
        const cb = map.get(b.id)!;
        return ca.dayIndex - cb.dayIndex || ca.period - cb.period;
      });
      for (let i = teacherLastCap; i < ordered.length; i++) {
        const l = ordered[i];
        const c = map.get(l.id)!;
        const e = pushTier1('teacherLastPeriodOver', {
          summary: `교사 ${name} — ${lastPeriod}교시 주 ${ordered.length}회 중 초과 (${i + 1}번째) · ${DAY_LABELS[c.dayIndex]} ${c.period}교시 ${lessonBrief(l)}`,
          teacherId: tid,
          teacherName: name,
          dayIndex: c.dayIndex,
          period: c.period,
          lessonIds: [l.id],
        });
        entries.push(e);
      }
    }
    const s = section('teacherLastPeriodOver', entries, tierOf('teacherLastPeriodOver'));
    if (s) sections.push(s);
  }

  if (h.teacherSubjectConsecutive) {
    const entries: ViolationEntry[] = [];
    for (const [sk, subMap] of byTeacherOfferingDay) {
      const pipe = sk.indexOf('|');
      const tid = sk.slice(0, pipe);
      const offeringId = sk.slice(pipe + 1);
      const name = teacherNameOf(tid);
      const sample = graph.lessons.find((l) => l.offeringId === offeringId);
      const label = sample ? lessonBrief(sample) : offeringId.slice(0, 8);
      for (const [day, { periods, lessons: ls }] of subMap) {
        const set = new Set(periods);
        for (const p of set) {
          if (!set.has(p + 1)) continue;
          const la = ls.find((l) => map.get(l.id)!.period === p);
          const lb = ls.find((l) => map.get(l.id)!.period === p + 1);
          const e = pushTier1('teacherSubjectAdjacent', {
            summary: `교사 ${name} · 분반 '${label}' — ${DAY_LABELS[day]} ${p}~${p + 1}교시 연속 · ${lessonBrief(la!)} / ${lessonBrief(lb!)}`,
            teacherId: tid,
            teacherName: name,
            dayIndex: day,
            lessonIds: [la!.id, lb!.id],
          });
          entries.push(e);
        }
      }
    }
    const s = section('teacherSubjectAdjacent', entries, tierOf('teacherSubjectAdjacent'));
    if (s) sections.push(s);
  }

  let tier0 = 0;
  const tier1 = tier1Entries.length;
  for (const sec of sections) {
    if (sec.tier === 'tier1') continue;
    tier0 += sec.count;
  }

  return { sections, tier1Entries, tier0, tier1, total: tier0 + tier1 };
}
