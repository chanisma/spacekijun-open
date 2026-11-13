import type {
  Grade,
  SupervisionTeacher,
  SupervisorPlanRoom,
  SupervisorTeacherRef,
} from '../types';

/** meta.section 키 파싱과 동일한 `${과목명}|${학년}` 매칭 키 */
export function sectionKey(subjectName: string, grade: Grade): string {
  return `${subjectName}|${grade}`;
}

export interface SubjectInfo {
  name: string;
  grade: Grade;
}

export interface AutoAssignArgs {
  rooms: SupervisorPlanRoom[];
  teachers: SupervisionTeacher[];
  /** subjectId -> {name, grade} (과목 담당 교사 매칭용) */
  subjectInfo: Map<string, SubjectInfo>;
  /** teacherId -> 누적 감독 횟수 (확정 감독표 합산 + 수동 보정) */
  pastLoadByTeacher: Map<string, number>;
  /** true면 채워진 좌석을 유지하고 빈 좌석만 배정 */
  keepExisting?: boolean;
}

export interface AutoAssignResult {
  rooms: SupervisorPlanRoom[];
  warnings: string[];
}

/** 한 교사의 하루 기본 최대 감독 횟수 (그날 시험 교시가 3개 이하일 때) */
export const MAX_SUPERVISIONS_PER_DAY = 2;
/** 시험 교시가 많은 날의 확장 상한 */
export const MAX_SUPERVISIONS_PER_DAY_EXTENDED = 3;
/** 이 교시 수 이상인 날은 확장 상한을 적용 (4교시까지 시험 → 하루 최대 3회) */
export const EXTENDED_CAP_PERIOD_THRESHOLD = 4;

/** 그날 시험 교시 수에 따른 일일 감독 상한 */
export function dailyCapForPeriodCount(periodCount: number): number {
  return periodCount >= EXTENDED_CAP_PERIOD_THRESHOLD
    ? MAX_SUPERVISIONS_PER_DAY_EXTENDED
    : MAX_SUPERVISIONS_PER_DAY;
}

/** rooms에서 일차별 일일 감독 상한 맵 생성 (그날 distinct 교시 수 기준) */
export function buildCapByDay(rooms: SupervisorPlanRoom[]): Map<number, number> {
  const periodsByDay = new Map<number, Set<number>>();
  for (const r of rooms) {
    let s = periodsByDay.get(r.dayIndex);
    if (!s) {
      s = new Set();
      periodsByDay.set(r.dayIndex, s);
    }
    s.add(r.period);
  }
  const capByDay = new Map<number, number>();
  for (const [day, periods] of periodsByDay) {
    capByDay.set(day, dailyCapForPeriodCount(periods.size));
  }
  return capByDay;
}

/**
 * Phase B 균등 채움에서 허용하는 (누적+이번) 최종 부하 편차.
 * 배정 후에도 모든 교사의 부하가 [최소, 최소+허용치] 안에 머물도록
 * 선택 후보를 제한한다. 허용치 1 = 최소 부하 교사에게만 배정 (사실상 엄격
 * 균등이되, 동률 안에서는 복수 일차 시 같은 날 기투입 교사를 우선).
 */
export const BALANCE_SPREAD_TOLERANCE = 1;

const slotKeyOf = (r: SupervisorPlanRoom) => `${r.dayIndex}|${r.period}`;

function getSet<K>(map: Map<K, Set<string>>, key: K): Set<string> {
  let s = map.get(key);
  if (!s) {
    s = new Set();
    map.set(key, s);
  }
  return s;
}

export interface AssignState {
  busyBySlot: Map<string, Set<string>>;
  thisCount: Map<string, number>;
  /**
   * `${teacherId}|${dayIndex}` -> 그날 배정된 교시 번호 집합.
   * 일일 상한 검사(size)와 3연속 검사(인접 교시 존재 여부)에 함께 쓴다.
   */
  dayPeriods: Map<string, Set<number>>;
  /** dayIndex -> 그날 일일 감독 상한 (교시 수 기준, initAssignState에서 산정) */
  capByDay: Map<number, number>;
  pastLoad: Map<string, number>;
  /**
   * 재배치 금지 좌석 (`${roomId}#${seatIdx}`): 담임 고정·과목 담당·기존 수동
   * 배정 좌석. 증강 재배치(augmentSeat)가 이 좌석은 건드리지 않는다.
   */
  locked: Set<string>;
  /**
   * 동률 무작위 순위 (실행마다 새로 섞임). 이름순 고정 동률이 만드는
   * "특정 교사가 항상 1교시" 같은 패턴 고착을 방지한다.
   */
  tieRank: Map<string, number>;
}

/** 실행 1회용 무작위 동률 순위 생성 (Fisher–Yates) */
export function buildTieRank(teachers: SupervisionTeacher[]): Map<string, number> {
  const ids = teachers.map((t) => t.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return new Map(ids.map((id, i) => [id, i]));
}

const seatKeyOf = (room: SupervisorPlanRoom, seatIdx: number) =>
  `${room.roomId}#${seatIdx}`;

export function initAssignState(
  rooms: SupervisorPlanRoom[],
  pastLoad: Map<string, number>,
  tieRank: Map<string, number> = new Map(),
): AssignState {
  const st: AssignState = {
    busyBySlot: new Map(),
    thisCount: new Map(),
    dayPeriods: new Map(),
    capByDay: buildCapByDay(rooms),
    pastLoad,
    locked: new Set(),
    tieRank,
  };
  for (const r of rooms) {
    r.teachers.forEach((t, i) => {
      if (!t) return;
      getSet(st.busyBySlot, slotKeyOf(r)).add(t.id);
      st.thisCount.set(t.id, (st.thisCount.get(t.id) ?? 0) + 1);
      dayPeriodsOf(st, t.id, r.dayIndex).add(r.period);
      // 시작 시점에 이미 채워진 좌석(수동 배정 유지분)은 재배치 대상에서 제외
      st.locked.add(seatKeyOf(r, i));
    });
  }
  return st;
}

function totalLoad(st: AssignState, id: string): number {
  return (st.pastLoad.get(id) ?? 0) + (st.thisCount.get(id) ?? 0);
}

/** `${id}|${day}` 교시 집합 (없으면 생성) */
function dayPeriodsOf(st: AssignState, id: string, day: number): Set<number> {
  const k = `${id}|${day}`;
  let s = st.dayPeriods.get(k);
  if (!s) {
    s = new Set();
    st.dayPeriods.set(k, s);
  }
  return s;
}

/** 그날 감독 횟수 (= 배정된 distinct 교시 수) */
function dayLoad(st: AssignState, id: string, day: number): number {
  return st.dayPeriods.get(`${id}|${day}`)?.size ?? 0;
}

export function atDailyCap(st: AssignState, teacherId: string, dayIndex: number): boolean {
  const cap = st.capByDay.get(dayIndex) ?? MAX_SUPERVISIONS_PER_DAY;
  return dayLoad(st, teacherId, dayIndex) >= cap;
}

/**
 * 교시 `period`를 추가하면 그 교사가 같은 날 3개 교시를 연속으로 감독하게
 * 되는가. period를 포함하는 3-연속 구간(P-2..P, P-1..P+1, P..P+2)만 검사한다.
 */
function createsTripleConsecutive(
  st: AssignState,
  id: string,
  day: number,
  period: number,
): boolean {
  const set = st.dayPeriods.get(`${id}|${day}`);
  if (!set) return false;
  const h = (p: number) => set.has(p);
  return (
    (h(period - 2) && h(period - 1)) ||
    (h(period - 1) && h(period + 1)) ||
    (h(period + 1) && h(period + 2))
  );
}

/** 이 교사를 이 시험실에 배정할 수 있는가 (같은 교시 중복·일일 상한·3연속 금지) */
function canPlace(st: AssignState, room: SupervisorPlanRoom, teacherId: string): boolean {
  if (getSet(st.busyBySlot, slotKeyOf(room)).has(teacherId)) return false;
  if (atDailyCap(st, teacherId, room.dayIndex)) return false;
  if (createsTripleConsecutive(st, teacherId, room.dayIndex, room.period)) return false;
  return true;
}

export function placeTeacher(
  st: AssignState,
  room: SupervisorPlanRoom,
  seatIdx: number,
  teacher: SupervisorTeacherRef,
  lock = false,
): void {
  room.teachers[seatIdx] = { id: teacher.id, name: teacher.name };
  getSet(st.busyBySlot, slotKeyOf(room)).add(teacher.id);
  st.thisCount.set(teacher.id, (st.thisCount.get(teacher.id) ?? 0) + 1);
  dayPeriodsOf(st, teacher.id, room.dayIndex).add(room.period);
  if (lock) st.locked.add(seatKeyOf(room, seatIdx));
}

function unplaceTeacher(
  st: AssignState,
  room: SupervisorPlanRoom,
  seatIdx: number,
): void {
  const t = room.teachers[seatIdx];
  if (!t) return;
  room.teachers[seatIdx] = null;
  st.busyBySlot.get(slotKeyOf(room))?.delete(t.id);
  st.thisCount.set(t.id, Math.max(0, (st.thisCount.get(t.id) ?? 1) - 1));
  st.dayPeriods.get(`${t.id}|${room.dayIndex}`)?.delete(room.period);
}

/** (누적+이번) 오름차순 → 이번 횟수 → 무작위 동률 순위 (균등화 기준 정렬) */
function sortByLoad(st: AssignState, teachers: SupervisionTeacher[]): SupervisionTeacher[] {
  return [...teachers].sort(
    (a, b) =>
      totalLoad(st, a.id) - totalLoad(st, b.id) ||
      (st.thisCount.get(a.id) ?? 0) - (st.thisCount.get(b.id) ?? 0) ||
      (st.tieRank.get(a.id) ?? 0) - (st.tieRank.get(b.id) ?? 0) ||
      a.name.localeCompare(b.name, 'ko'),
  );
}

/**
 * 좌석 1개 배정 (증강 경로 탐색, Kuhn 알고리즘 변형).
 *
 * 1차: 그 교시에 비투입 + 일일 상한 미달인 교사 중 (누적+이번) 최소를 직접 배치.
 * 2차: 그런 교사가 없으면, 상한에 걸린 교사 T의 다른 교시 좌석을 제3의 교사에게
 *      재귀적으로 넘기고(T 좌석 해방) T를 이 좌석에 배치한다. 그리디가 앞 교시에서
 *      저부하 교사를 소진해 뒤 교시가 굶는 경우(유효 배정이 존재하는데도 미배정)를
 *      구제한다. 잠금 좌석(담임 고정·과목 담당·수동 배정)은 재배치하지 않는다.
 */
function augmentSeat(
  room: SupervisorPlanRoom,
  seatIdx: number,
  st: AssignState,
  teachers: SupervisionTeacher[],
  allRooms: SupervisorPlanRoom[],
  visited: Set<string>,
  preferSameDay: boolean,
): boolean {
  const busy = getSet(st.busyBySlot, slotKeyOf(room));
  const ordered = sortByLoad(st, teachers);

  // 1차: 직접 배치 — 같은 교시 중복·일일 상한·3연속을 모두 만족(canPlace)하는
  // 교사 중에서. 복수 일차 시험이면 허용 편차(BALANCE_SPREAD_TOLERANCE) 안에서
  // 같은 날 이미 투입된 교사를 우선해 일정을 모은다 (다른 날이 비는 실익).
  // 단일 일차(모의고사 등)는 아낄 날이 없으므로 전원에게 1회씩 펼친 뒤에야 2회.
  const direct: SupervisionTeacher[] = [];
  for (const t of ordered) {
    if (visited.has(t.id)) continue;
    if (!canPlace(st, room, t.id)) continue;
    direct.push(t);
  }
  if (direct.length > 0) {
    const minLoad = totalLoad(st, direct[0].id);
    // 배정 "후" 부하(현재+1)가 최소+허용치를 넘지 않는 교사만 후보 —
    // 최종 편차가 BALANCE_SPREAD_TOLERANCE를 초과하지 않음을 보장한다
    const windowed = direct.filter(
      (t) =>
        totalLoad(st, t.id) <= minLoad + Math.max(0, BALANCE_SPREAD_TOLERANCE - 1),
    );
    const sameDay = preferSameDay
      ? windowed.find((t) => dayLoad(st, t.id, room.dayIndex) > 0)
      : undefined;
    placeTeacher(st, room, seatIdx, sameDay ?? windowed[0]);
    return true;
  }

  // 2차: 직접 배치가 막힌(상한·3연속) 교사 T의 다른 교시 좌석을 제3의 교사에게
  // 넘겨 비운 뒤 T를 여기 배치. 좌석을 비우면 T의 부하·연속성이 풀려 canPlace가
  // 통과할 수 있다. 비운 뒤에도 canPlace가 거짓이면(그 좌석을 비워도 안 풀림)
  // 그 좌석은 건너뛴다 — 이 검사가 3연속·상한 위반 생성을 원천 차단한다.
  for (const t of ordered) {
    if (busy.has(t.id) || visited.has(t.id)) continue;
    visited.add(t.id);
    for (const r2 of allRooms) {
      if (r2.dayIndex !== room.dayIndex) continue;
      for (let i = 0; i < r2.teachers.length; i++) {
        if (r2.teachers[i]?.id !== t.id) continue;
        if (st.locked.has(seatKeyOf(r2, i))) continue;
        unplaceTeacher(st, r2, i);
        if (
          canPlace(st, room, t.id) &&
          augmentSeat(r2, i, st, teachers, allRooms, visited, preferSameDay)
        ) {
          placeTeacher(st, room, seatIdx, t);
          return true;
        }
        placeTeacher(st, r2, i, t);
      }
    }
  }
  return false;
}

/** 슬롯(일차|교시) 순서대로 그룹화 */
function groupBySlot(rooms: SupervisorPlanRoom[]): Map<string, SupervisorPlanRoom[]> {
  const m = new Map<string, SupervisorPlanRoom[]>();
  const sorted = [...rooms].sort(
    (a, b) => a.dayIndex - b.dayIndex || a.period - b.period,
  );
  for (const r of sorted) {
    const arr = m.get(slotKeyOf(r)) ?? [];
    arr.push(r);
    m.set(slotKeyOf(r), arr);
  }
  return m;
}

/**
 * 빈 좌석을 감독 횟수 균등 원칙으로 채운다 (정규·모의고사 공용 Phase B).
 * 좌석마다 augmentSeat를 호출한다: 직접 배치(균등 기준 최소 부하)가 안 되면
 * 상한에 걸린 교사의 다른 교시 좌석을 연쇄 재배치해서라도 채우고, 그래도
 * 불가능할 때만(진짜 공급 부족) 미배정 경고를 남긴다.
 */
export function fillEmptySeats(
  slots: Map<string, SupervisorPlanRoom[]>,
  teachers: SupervisionTeacher[],
  st: AssignState,
  warnings: string[],
): void {
  const allRooms = [...slots.values()].flat();
  // 같은 날 집중(2회 몰아주기)은 복수 일차일 때만 — 단일 일차는 펼친다
  const preferSameDay = new Set(allRooms.map((r) => r.dayIndex)).size > 1;
  for (const [, slotRooms] of slots) {
    for (const room of slotRooms) {
      for (let i = 0; i < room.teachers.length; i++) {
        if (room.teachers[i]) continue;
        if (!augmentSeat(room, i, st, teachers, allRooms, new Set(), preferSameDay)) {
          const cap = st.capByDay.get(room.dayIndex) ?? MAX_SUPERVISIONS_PER_DAY;
          warnings.push(
            `${room.dayIndex + 1}일차 ${room.period}교시 ${room.label}: 배정 가능한 교사가 없습니다 (같은 교시 투입·일일 ${cap}회 상한·3연속 금지로 후보 소진)`,
          );
        }
      }
    }
  }
}

/**
 * 정규고사 감독 자동 배정.
 *
 * Phase A — 과목 담당 교사 우선 배치:
 *   각 슬롯에서 과목별로 그 과목을 가르치는 교사를 그 과목의 시험실에 먼저
 *   배치한다. 시험실 수 < 담당 교사 수면 분반(section) 수가 많은 교사부터
 *   우선한다. 같은 교시에 이미 투입된 교사는 건너뛴다.
 *
 * Phase B — 잔여 좌석 균등 채움:
 *   교사별 (누적 감독 횟수 + 이번 시험 배정 수)가 최소인 교사부터 채워
 *   감독 부담을 평준화한다.
 */
export function autoAssignSupervisors(args: AutoAssignArgs): AutoAssignResult {
  const rooms = args.rooms.map((r) => ({
    ...r,
    teachers: args.keepExisting ? [...r.teachers] : r.teachers.map(() => null),
  }));
  const warnings: string[] = [];
  const st = initAssignState(rooms, args.pastLoadByTeacher, buildTieRank(args.teachers));
  const slots = groupBySlot(rooms);

  // Phase A: 과목 담당 교사
  for (const [, slotRooms] of slots) {
    // 슬롯 내 과목 → 시험실 목록
    const subjRooms = new Map<string, SupervisorPlanRoom[]>();
    for (const r of slotRooms) {
      for (const sid of r.subjectIds) {
        const arr = subjRooms.get(sid) ?? [];
        arr.push(r);
        subjRooms.set(sid, arr);
      }
    }

    // 시험실이 적은 과목부터 처리 (담당 교사가 다른 과목에 선점되기 전에)
    const ordered = [...subjRooms.entries()].sort(
      (a, b) => a[1].length - b[1].length,
    );

    for (const [sid, srooms] of ordered) {
      const info = args.subjectInfo.get(sid);
      if (!info) continue;
      const key = sectionKey(info.name, info.grade);
      const queue = args.teachers
        .filter((t) => (t.sectionCounts[key] ?? 0) > 0)
        .sort(
          (a, b) =>
            (b.sectionCounts[key] ?? 0) - (a.sectionCounts[key] ?? 0) ||
            totalLoad(st, a.id) - totalLoad(st, b.id) ||
            (st.tieRank.get(a.id) ?? 0) - (st.tieRank.get(b.id) ?? 0) ||
            a.name.localeCompare(b.name, 'ko'),
        );
      if (queue.length === 0) {
        warnings.push(
          `${info.grade}학년 ${info.name}: 담당 교사를 찾지 못했습니다 (시간표 데이터의 section 미등록)`,
        );
        continue;
      }

      let qi = 0;
      for (const room of srooms) {
        // 이 방에 이미 담당 교사가 있으면 통과 (keepExisting 시)
        if (room.teachers.some((t) => t && (queue.find((q) => q.id === t.id)))) continue;
        const seat = room.teachers.indexOf(null);
        if (seat < 0) continue;
        // 같은 교시 중복·일일 상한·3연속에 걸린 담당 교사는 건너뜀
        while (qi < queue.length && !canPlace(st, room, queue[qi].id)) {
          qi++;
        }
        if (qi >= queue.length) break;
        // 과목 담당 좌석은 잠금 — 증강 재배치가 빼앗지 못한다
        placeTeacher(st, room, seat, queue[qi], true);
        qi++;
      }
    }
  }

  // Phase B: 잔여 좌석 균등 채움
  fillEmptySeats(slots, args.teachers, st, warnings);

  return { rooms, warnings };
}

/** plan의 교사별 이번 시험 감독 횟수 */
export function planLoadByTeacher(rooms: SupervisorPlanRoom[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rooms) {
    for (const t of r.teachers) {
      if (!t) continue;
      m.set(t.id, (m.get(t.id) ?? 0) + 1);
    }
  }
  return m;
}

export interface PlanIssue {
  type: 'duplicate' | 'unassigned' | 'homeroom' | 'dailyCap' | 'consecutive';
  message: string;
}

/** 수동 편집 후 검증: 같은 교시 중복·미배정·담임 고정·일일 상한·3연속 위반 */
export function validatePlan(rooms: SupervisorPlanRoom[]): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const bySlot = groupBySlot(rooms);
  const capByDay = buildCapByDay(rooms);

  // 교사×일차별 배정 교시 수집 → 일일 상한·3연속 검사
  const byTeacherDay = new Map<
    string,
    { name: string; dayIndex: number; periods: number[] }
  >();
  for (const r of rooms) {
    for (const t of r.teachers) {
      if (!t) continue;
      const key = `${t.id}|${r.dayIndex}`;
      const e = byTeacherDay.get(key);
      if (e) e.periods.push(r.period);
      else byTeacherDay.set(key, { name: t.name, dayIndex: r.dayIndex, periods: [r.period] });
    }
  }
  for (const e of byTeacherDay.values()) {
    const cap = capByDay.get(e.dayIndex) ?? MAX_SUPERVISIONS_PER_DAY;
    if (e.periods.length > cap) {
      issues.push({
        type: 'dailyCap',
        message: `${e.dayIndex + 1}일차: ${e.name} 교사가 하루 ${e.periods.length}회 감독으로 상한(${cap}회)을 초과했습니다`,
      });
    }
    // 3연속: 정렬된 교시 집합에서 p, p+1, p+2가 모두 존재하는 구간
    const set = new Set(e.periods);
    if (e.periods.some((p) => set.has(p + 1) && set.has(p + 2))) {
      issues.push({
        type: 'consecutive',
        message: `${e.dayIndex + 1}일차: ${e.name} 교사가 3개 교시를 연속 감독합니다 (연속 3교시 금지)`,
      });
    }
  }

  for (const [, slotRooms] of bySlot) {
    const seen = new Map<string, string[]>(); // teacherId -> room labels
    let unassigned = 0;
    for (const r of slotRooms) {
      for (const t of r.teachers) {
        if (!t) {
          unassigned++;
          continue;
        }
        const arr = seen.get(t.id) ?? [];
        arr.push(r.label);
        seen.set(t.id, arr);
      }
      if (r.homeroomRequired && r.teachers.every((t) => t === null)) {
        issues.push({
          type: 'homeroom',
          message: `${r.dayIndex + 1}일차 ${r.period}교시 ${r.label}: 담임 고정 교시가 비어 있습니다`,
        });
      }
    }
    const sample = slotRooms[0];
    for (const [, labels] of seen) {
      if (labels.length > 1) {
        issues.push({
          type: 'duplicate',
          message: `${sample.dayIndex + 1}일차 ${sample.period}교시: 같은 교사가 ${labels.join(', ')}에 중복 배정되었습니다`,
        });
      }
    }
    if (unassigned > 0) {
      issues.push({
        type: 'unassigned',
        message: `${sample.dayIndex + 1}일차 ${sample.period}교시: 미배정 좌석 ${unassigned}개`,
      });
    }
  }
  return issues;
}
