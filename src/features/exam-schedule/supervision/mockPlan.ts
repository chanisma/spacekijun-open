import type {
  Grade,
  MockExamInput,
  MockExamPeriod,
  SupervisionTeacher,
  SupervisorPlanRoom,
} from '../types';
import {
  atDailyCap,
  buildTieRank,
  fillEmptySeats,
  initAssignState,
  placeTeacher,
  MAX_SUPERVISIONS_PER_DAY,
  type AutoAssignResult,
} from './autoAssign';

/**
 * 모의고사 감독 그리드 전개: 학년×반×교시당 시험실 1개, 좌석 1개.
 * 해당 학년의 첫 교시와 마지막 교시는 담임 고정 좌석으로 표시한다.
 * 교시 번호가 같으면 학년이 달라도 같은 시간대로 간주한다
 * (한 교사는 같은 교시에 한 반만 감독 가능).
 */
export function buildMockRooms(input: MockExamInput): SupervisorPlanRoom[] {
  const rooms: SupervisorPlanRoom[] = [];
  for (const g of [...input.grades].sort((a, b) => a - b)) {
    const periods = [...(input.periodsByGrade[g] ?? [])].sort(
      (a, b) => a.period - b.period,
    );
    if (periods.length === 0) continue;
    const firstPeriod = periods[0].period;
    const lastPeriod = periods[periods.length - 1].period;
    const classCount = Math.max(0, input.classCountByGrade[g] ?? 0);

    for (let c = 1; c <= classCount; c++) {
      for (const pd of periods) {
        rooms.push({
          roomId: `0|${pd.period}|mock-${g}-${c}`,
          dayIndex: 0,
          period: pd.period,
          label: `${g}학년 ${c}반`,
          kind: 'classroom',
          grade: g,
          classNum: c,
          subjectIds: [],
          subjectNames: pd.label ? [pd.label] : [],
          teachers: [null],
          homeroomRequired: pd.period === firstPeriod || pd.period === lastPeriod,
        });
      }
    }
  }
  return rooms;
}

export interface MockAssignArgs {
  rooms: SupervisorPlanRoom[];
  teachers: SupervisionTeacher[];
  /** teacherId -> 누적 감독 횟수 (확정 감독표 합산 + 수동 보정) */
  pastLoadByTeacher: Map<string, number>;
  /** true면 채워진 좌석을 유지하고 빈 좌석만 배정 */
  keepExisting?: boolean;
}

/**
 * 모의고사 감독 자동 배정.
 * Phase A: 담임 고정 좌석(첫·마지막 교시)에 그 반 담임 배치.
 * Phase B: 나머지 교시는 (누적+이번) 감독 횟수 균등 원칙으로 채움.
 */
export function autoAssignMockSupervisors(args: MockAssignArgs): AutoAssignResult {
  const rooms = args.rooms.map((r) => ({
    ...r,
    teachers: args.keepExisting ? [...r.teachers] : r.teachers.map(() => null),
  }));
  const warnings: string[] = [];

  const homeroomOf = new Map<string, SupervisionTeacher>();
  for (const t of args.teachers) {
    if (t.homeroom) homeroomOf.set(`${t.homeroom.grade}-${t.homeroom.classNum}`, t);
  }

  // 좌석 상태 (autoAssign 공유 헬퍼 — busy는 교시 단위, dayPeriods는 상한·3연속)
  const st = initAssignState(rooms, args.pastLoadByTeacher, buildTieRank(args.teachers));
  const slotKeyOf = (r: SupervisorPlanRoom) => `${r.dayIndex}|${r.period}`;

  // Phase A: 담임 고정 교시 (첫·마지막 = 정확히 2회로 일일 상한과 일치)
  const missingHomeroom = new Set<string>();
  for (const room of rooms) {
    if (!room.homeroomRequired || room.teachers[0]) continue;
    const key = `${room.grade}-${room.classNum}`;
    const hr = homeroomOf.get(key);
    if (!hr) {
      if (!missingHomeroom.has(key)) {
        missingHomeroom.add(key);
        warnings.push(
          `${room.grade}학년 ${room.classNum}반: 담임 태그("${room.grade}학년 ${room.classNum}반")가 배정된 교사를 찾지 못했습니다`,
        );
      }
      continue;
    }
    if (st.busyBySlot.get(slotKeyOf(room))?.has(hr.id)) {
      warnings.push(
        `${room.period}교시 ${room.label}: 담임(${hr.name})이 같은 교시에 이미 투입되어 있습니다`,
      );
      continue;
    }
    if (atDailyCap(st, hr.id, room.dayIndex)) {
      const cap = st.capByDay.get(room.dayIndex) ?? MAX_SUPERVISIONS_PER_DAY;
      warnings.push(
        `${room.period}교시 ${room.label}: 담임(${hr.name})이 이미 일일 ${cap}회 상한에 도달해 고정 배치하지 못했습니다`,
      );
      continue;
    }
    // 담임 고정 좌석은 잠금 — 증강 재배치가 빼앗지 못한다
    placeTeacher(st, room, 0, { id: hr.id, name: hr.name }, true);
  }

  // Phase B: 잔여 교시 균등 채움 (fillEmptySeats 재사용)
  const slots = new Map<string, SupervisorPlanRoom[]>();
  const sorted = [...rooms].sort(
    (a, b) => a.dayIndex - b.dayIndex || a.period - b.period,
  );
  for (const r of sorted) {
    const arr = slots.get(slotKeyOf(r)) ?? [];
    arr.push(r);
    slots.set(slotKeyOf(r), arr);
  }
  fillEmptySeats(slots, args.teachers, st, warnings);

  return { rooms, warnings };
}

/** 학년별 기본 모의고사 교시 구성 (편집 가능한 시작값) */
export function defaultMockPeriods(grade: Grade): MockExamPeriod[] {
  const base = [
    { period: 1, label: '국어' },
    { period: 2, label: '수학' },
    { period: 3, label: '영어' },
    { period: 4, label: '한국사·탐구' },
  ];
  if (grade === 3) base.push({ period: 5, label: '제2외국어/한문' });
  return base;
}
