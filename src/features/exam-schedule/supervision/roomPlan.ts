import type {
  ExamSubject,
  Grade,
  SlotAssignment,
  SupervisionConfig,
  SupervisorPlanRoom,
} from '../types';
import { buildRoomPool, subjectStudentCount } from '../utils/multiGrade';

/**
 * 확정 배치(finalized_assignments)를 슬롯별 시험실 목록으로 전개한다.
 * slotSupervision()과 동일한 규칙을 따르므로 방 개수 합 = 감독 수요와 일치한다:
 * - 공통(scope 'all') 과목: 학년 반 수만큼 "g학년 c반" 교실 (같은 슬롯의 같은
 *   학년 공통 과목들은 같은 교실 집합을 공유 — 한 반에서 함께 응시)
 * - 선택과목: 응시자 많은 과목부터 큰 고사실을 greedy 소비 (1실 = 1과목),
 *   풀 부족 시 최소 정원 기준 "추가실"로 표시
 */
export function buildSlotRooms(args: {
  assignments: SlotAssignment[];
  subjects: Map<string, ExamSubject>;
  supervision: SupervisionConfig;
}): SupervisorPlanRoom[] {
  const { assignments, subjects, supervision } = args;
  const seats = Math.max(1, supervision.supervisorsPerRoom);
  const emptySeats = () => Array.from({ length: seats }, () => null);

  // 슬롯별 과목 그룹화
  const bySlot = new Map<string, ExamSubject[]>();
  for (const a of assignments) {
    const sub = subjects.get(a.subjectId);
    if (!sub) continue;
    const k = `${a.dayIndex}|${a.period}`;
    const arr = bySlot.get(k) ?? [];
    arr.push(sub);
    bySlot.set(k, arr);
  }

  const slotKeys = Array.from(bySlot.keys()).sort((a, b) => {
    const [da, pa] = a.split('|').map(Number);
    const [db, pb] = b.split('|').map(Number);
    return da - db || pa - pb;
  });

  const out: SupervisorPlanRoom[] = [];

  for (const k of slotKeys) {
    const [dayIndex, period] = k.split('|').map(Number);
    const subs = bySlot.get(k)!;

    // 공통 과목: 학년별로 묶어 반 교실 생성 (같은 학년 공통 과목은 교실 공유)
    const allByGrade = new Map<Grade, ExamSubject[]>();
    for (const s of subs) {
      if (s.scope !== 'all') continue;
      const arr = allByGrade.get(s.grade) ?? [];
      arr.push(s);
      allByGrade.set(s.grade, arr);
    }
    for (const [grade, group] of [...allByGrade.entries()].sort((a, b) => a[0] - b[0])) {
      const classCount =
        supervision.classCountByGrade[grade] ??
        Math.max(
          1,
          Math.ceil(Math.max(...group.map((s) => subjectStudentCount(s))) / 28),
        );
      for (let c = 1; c <= classCount; c++) {
        out.push({
          roomId: `${k}|cls-${grade}-${c}`,
          dayIndex,
          period,
          label: `${grade}학년 ${c}반`,
          kind: 'classroom',
          grade,
          classNum: c,
          subjectIds: group.map((s) => s.id),
          subjectNames: group.map((s) => s.name),
          teachers: emptySeats(),
        });
      }
    }

    // 선택과목: 자기 학년 일반 교실 먼저, 공유 고사실 풀은 나중 (slotSupervision과 동일 모델).
    // 공유 풀은 전 학년이 함께 소비하므로 슬롯 루프 안에서 인덱스를 이어 쓴다.
    const pool = buildRoomPool(supervision);
    const homeroomCap = pool.length > 0 ? Math.max(...pool) : 28;
    const fallbackCapacity = pool.length > 0 ? pool[pool.length - 1] : 28;
    let poolIdx = 0;
    let overflow = 0;

    const electivesByGrade = new Map<Grade, ExamSubject[]>();
    for (const s of subs) {
      if (s.scope === 'all' || subjectStudentCount(s) <= 0) continue;
      const arr = electivesByGrade.get(s.grade) ?? [];
      arr.push(s);
      electivesByGrade.set(s.grade, arr);
    }

    for (const [grade, els] of [...electivesByGrade.entries()].sort((a, b) => a[0] - b[0])) {
      const classCount =
        supervision.classCountByGrade[grade] ??
        Math.max(1, Math.ceil(Math.max(...els.map((s) => subjectStudentCount(s))) / 28));
      // 같은 학년 공통과목이 점유한 교실 수만큼 일반 교실 가용분을 줄인다
      // (공통·선택은 보통 공존하지 않으므로 대개 ownTotal = classCount)
      const commonRooms = (allByGrade.get(grade)?.length ?? 0) > 0 ? classCount : 0;
      const ownTotal = Math.max(0, classCount - commonRooms);
      let ownUsed = 0;
      els.sort((a, b) => subjectStudentCount(b) - subjectStudentCount(a));
      for (const s of els) {
        let remaining = subjectStudentCount(s);
        while (remaining > 0) {
          let label: string;
          let roomId: string;
          let kind: 'classroom' | 'pool';
          let classNum: number | null;
          if (ownUsed < ownTotal) {
            ownUsed++;
            remaining -= homeroomCap;
            label = `${grade}학년 ${ownUsed}반`;
            roomId = `${k}|ecls-${grade}-${ownUsed}`;
            kind = 'classroom';
            classNum = ownUsed;
          } else if (poolIdx < pool.length) {
            remaining -= pool[poolIdx];
            label = `고사실 ${poolIdx + 1}`;
            roomId = `${k}|pool-${poolIdx}`;
            kind = 'pool';
            classNum = null;
            poolIdx++;
          } else {
            remaining -= fallbackCapacity;
            overflow++;
            label = `추가실 ${overflow}`;
            roomId = `${k}|overflow-${overflow}`;
            kind = 'pool';
            classNum = null;
          }
          out.push({
            roomId,
            dayIndex,
            period,
            label,
            kind,
            grade,
            classNum,
            subjectIds: [s.id],
            subjectNames: [s.name],
            teachers: emptySeats(),
          });
        }
      }
    }
  }

  return out;
}

/**
 * 방 구조 시그니처. 저장된 감독표가 현재 배치와 어긋났는지(시간표 수정 후)
 * 감지하는 데 쓴다 — 교사 배정은 무시하고 방 구성만 비교.
 */
export function roomStructureSignature(rooms: SupervisorPlanRoom[]): string {
  return rooms
    .map((r) => `${r.roomId}:${r.subjectIds.join(',')}`)
    .sort()
    .join('|');
}

/** 기존 plan의 교사 배정을 새 방 구조로 이월 (roomId 매칭 기준) */
export function carryOverTeachers(
  freshRooms: SupervisorPlanRoom[],
  savedRooms: SupervisorPlanRoom[],
): SupervisorPlanRoom[] {
  const saved = new Map(savedRooms.map((r) => [r.roomId, r]));
  return freshRooms.map((room) => {
    const prev = saved.get(room.roomId);
    if (!prev) return room;
    const teachers = room.teachers.map((_, i) => prev.teachers[i] ?? null);
    return { ...room, teachers };
  });
}
