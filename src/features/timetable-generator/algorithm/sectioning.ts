import type { Lesson, Placement } from '../types';
import { createRng } from './rng';

/**
 * 학생 sectioning(분반 재배정). 시간 배치(분반→칸)가 끝난 뒤, 학생을 자신이 선택한 각 과목의
 * "분반(course_offering)" 중 하나에 배정해 시간충돌을 없앤다. 핵심: 선택과목 분반은 여러 블록에
 * 퍼져 있으므로, 학생을 충돌 없는 분반으로 흘려보낼 수 있다(분반 편차=재배정 자원).
 *
 * 검증(2026-06-15): grade2 선택과목 prototype에서 193명 전원 0충돌(재시작+kick 필요 — sectioning도
 * "탐구4과목→4블록 완전매칭" slack-0). 시간 배치와 분리된 후처리로 동작.
 *
 * 모델: 분반 = 한 elective offering(그 분반의 lessons가 점유한 칸 집합). 학생은 과목별 1분반 선택.
 * 충돌 = 학생의 선택 분반(+고정 공통수업) 칸이 겹침. 정원 = 분반당 capacity.
 */
export interface SectioningResult {
  /** 재배정 후 잔여 학생 시간충돌 쌍 수 (0 = 완전 해소) */
  studentConflicts: number;
  conflictedStudents: number;
  /** 정원 초과 분반 수 */
  capacityOverflow: number;
  /** studentCode -> (학년·과목·시수 그룹 키 -> 선택된 offeringId(분반)) */
  assignment: Map<string, Map<string, string>>;
  /** 선택과목 과목 수 (분반 재배정 대상) */
  electiveSubjects: number;
  /** 선택 분반(offering) 수 */
  electiveOfferings: number;
  /** 재배정 대상 학생 수 */
  studentsAssigned: number;
}

export function sectionStudents(
  lessons: Lesson[],
  placements: Placement[],
  opts?: { capacity?: number; restarts?: number; seed?: number },
): SectioningResult {
  const capacity = opts?.capacity ?? 35;
  const restarts = opts?.restarts ?? 40;
  const seed0 = opts?.seed ?? 7;
  const credits = new Map<string, number>();
  for (const l of lessons) credits.set(l.offeringId, (credits.get(l.offeringId) ?? 0) + 1);
  const groupKey = (l: Lesson) => JSON.stringify([l.grade, l.subjectName, credits.get(l.offeringId)]);

  const placeOf = new Map<string, string>();
  for (const p of placements) placeOf.set(p.lessonId, `${p.dayIndex}|${p.period}`);

  // offering(분반) -> 점유 칸 집합, 과목, elective 여부
  const offCells = new Map<string, Set<string>>();
  const offSubject = new Map<string, string>();
  const offElective = new Map<string, boolean>();
  for (const l of lessons) {
    const cell = placeOf.get(l.id);
    if (!cell) continue;
    let set = offCells.get(l.offeringId);
    if (!set) { set = new Set(); offCells.set(l.offeringId, set); }
    set.add(cell);
    offSubject.set(l.offeringId, groupKey(l));
    offElective.set(l.offeringId, l.isElective);
  }

  // 과목 -> 선택 분반 offeringId[] (elective만)
  const subjBunban = new Map<string, string[]>();
  for (const [oid, isElec] of offElective) {
    if (!isElec) continue;
    const subj = offSubject.get(oid)!;
    const arr = subjBunban.get(subj);
    if (arr) arr.push(oid);
    else subjBunban.set(subj, [oid]);
  }

  // 학생 -> {선택과목 집합, 고정칸(공통/배정불가)}
  interface Stu { subjects: string[]; fixed: Set<string>; }
  const studentMap = new Map<string, Stu>();
  for (const l of lessons) {
    const cell = placeOf.get(l.id);
    for (const code of l.studentCodes) {
      let st = studentMap.get(code);
      if (!st) { st = { subjects: [], fixed: new Set() }; studentMap.set(code, st); }
      if (l.isElective) {
        const key = groupKey(l);
        if (!st.subjects.includes(key)) st.subjects.push(key);
      } else if (cell) {
        st.fixed.add(cell); // 공통수업 = 고정 점유칸
      }
    }
  }
  const studentIds = [...studentMap.keys()];

  // sectioning은 학생별로 독립적(한 학생 충돌 = 자기 선택 분반 칸 겹침; 학생 간 결합은 정원뿐).
  // → 각 학생을 MRV 백트래킹으로 정확히 0충돌 매칭. capacity는 부하 균형 패스로 후처리.
  const overlapsFixed = (oid: string, fixed: Set<string>): boolean => {
    for (const x of offCells.get(oid)!) if (fixed.has(x)) return true;
    return false;
  };
  const studentConflicts = (assign: Map<string, string>, st: Stu): number => {
    const oids = [...assign.values()];
    let c = 0;
    for (let i = 0; i < oids.length; i++) {
      if (overlapsFixed(oids[i], st.fixed)) c++;
      for (let j = i + 1; j < oids.length; j++) {
        const ca = offCells.get(oids[i])!, cb = offCells.get(oids[j])!;
        const [s, b] = ca.size < cb.size ? [ca, cb] : [cb, ca];
        for (const x of s) if (b.has(x)) { c++; break; }
      }
    }
    return c;
  };

  // 한 학생: 과목→분반 0충돌 배정 백트래킹. load 인지(정원 여유 분반 우선)로 균형 유도.
  const load = new Map<string, number>();
  const assignOne = (st: Stu, rng: ReturnType<typeof createRng>, repair?: { forbidden: string; previous: Set<string> }): Map<string, string> | null => {
    const ordered = [...st.subjects].sort((a, b) => (subjBunban.get(a)?.length ?? 1) - (subjBunban.get(b)?.length ?? 1));
    const chosen = new Map<string, string>();
    const used = new Set(st.fixed);
    const bt = (i: number): boolean => {
      if (i === ordered.length) return true;
      const cands = (subjBunban.get(ordered[i]) ?? []).slice();
      // 정원 여유 큰 분반 우선 + 동률 무작위 → 균형
      cands.sort((x, y) => (load.get(x) ?? 0) - (load.get(y) ?? 0) || rng.next() - 0.5);
      for (const oid of cands) {
        if (repair && (oid === repair.forbidden || ((load.get(oid) ?? 0) >= capacity && !repair.previous.has(oid)))) continue;
        let ok = true;
        for (const c of offCells.get(oid)!) if (used.has(c)) { ok = false; break; }
        if (!ok) continue;
        chosen.set(ordered[i], oid);
        const cells = offCells.get(oid)!;
        for (const c of cells) used.add(c);
        if (bt(i + 1)) return true;
        for (const c of cells) used.delete(c);
        chosen.delete(ordered[i]);
      }
      return false;
    };
    return bt(0) ? chosen : null;
  };

  const rng = createRng(seed0 >>> 0);
  const assignment = new Map<string, Map<string, string>>();
  let conflictedStudents = 0;
  let pairs = 0;
  // 후보 적은 학생(제약 빡빡) 먼저 배정해 정원·매칭 충돌 최소화
  const order = [...studentIds].sort((a, b) => {
    const sa = studentMap.get(a)!.subjects.reduce((n, s) => n + (subjBunban.get(s)?.length ?? 1), 0);
    const sb = studentMap.get(b)!.subjects.reduce((n, s) => n + (subjBunban.get(s)?.length ?? 1), 0);
    return sa - sb;
  });
  for (const sid of order) {
    const st = studentMap.get(sid)!;
    let a = assignOne(st, rng);
    if (!a) {
      // 0충돌 불가(구조적) → 최선 배정(첫 후보) + 충돌 집계
      a = new Map<string, string>();
      for (const subj of st.subjects) { const c = subjBunban.get(subj); if (c?.length) a.set(subj, c[0]); }
      conflictedStudents++;
      pairs += studentConflicts(a, st);
    }
    assignment.set(sid, a);
    for (const oid of a.values()) load.set(oid, (load.get(oid) ?? 0) + 1);
  }

  // A student-by-student zero-conflict match can overload a section even when
  // another complete schedule for that student has room. Reassign the student's
  // whole subject combination, preserving zero overlap and never adding overflow.
  if (pairs === 0) {
    let improved = true;
    for (let pass = 0; improved && pass < studentIds.length; pass++) {
      improved = false;
      for (const [overfull, count] of load) {
        if (count <= capacity) continue;
        for (const sid of order) {
          if ((load.get(overfull) ?? 0) <= capacity) break;
          const previous = assignment.get(sid)!;
          if (![...previous.values()].includes(overfull)) continue;
          for (const oid of previous.values()) load.set(oid, load.get(oid)! - 1);
          const next = assignOne(studentMap.get(sid)!, rng, { forbidden: overfull, previous: new Set(previous.values()) });
          const chosen = next ?? previous;
          assignment.set(sid, chosen);
          for (const oid of chosen.values()) load.set(oid, (load.get(oid) ?? 0) + 1);
          if (next) improved = true;
        }
      }
    }
  }

  let capacityOverflow = 0;
  for (const n of load.values()) if (n > capacity) capacityOverflow++;
  let electiveOfferings = 0;
  for (const arr of subjBunban.values()) electiveOfferings += arr.length;
  const result: SectioningResult = {
    studentConflicts: pairs,
    conflictedStudents,
    capacityOverflow,
    assignment,
    electiveSubjects: subjBunban.size,
    electiveOfferings,
    studentsAssigned: studentIds.length,
  };
  // UUID/source row order can select a different local minimum during restore.
  // Retry deterministic tie breaks only when zero-conflict matching still exceeds
  // capacity; never discard a better incumbent or recurse beyond one level.
  if (pairs === 0 && capacityOverflow > 0 && restarts > 1 && [...subjBunban].every(([subject, sections]) =>
    [...studentMap.values()].filter(st => st.subjects.includes(subject)).length <= sections.length * capacity)) {
    let best = result;
    for (let attempt = 1; attempt < restarts; attempt++) {
      const next = sectionStudents(lessons, placements, { capacity, restarts: 1, seed: (seed0 + Math.imul(attempt, 0x9e3779b9)) >>> 0 });
      if (next.studentConflicts === 0 && next.capacityOverflow < best.capacityOverflow) best = next;
      if (best.capacityOverflow === 0) break;
    }
    return best;
  }
  return result;
}
