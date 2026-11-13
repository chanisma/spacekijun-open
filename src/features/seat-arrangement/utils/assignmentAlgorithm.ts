import type { Arrangement, Constraint, SeatLayout, SeatStudent } from '../types';
import { extractSeats, seatCoord, chebyshev, areAdjacent } from './seatGeometry';
import { mulberry32, seededShuffle, newSeed } from './seedRandom';

interface AssignOpts {
  seed?: number;
  maxRandomRetries?: number;
  maxSwapIterations?: number;
}

interface FixedC {
  resourceId: string;
  seat: string;
}
interface ApartC {
  resourceIds: string[];
  minDistance: number;
}
interface TogetherC {
  resourceIds: string[];
}

interface ParsedConstraints {
  fixed: FixedC[];
  apart: ApartC[];
  together: TogetherC[];
}

const parseConstraints = (constraints: Constraint[]): ParsedConstraints => {
  const fixed: FixedC[] = [];
  const apart: ApartC[] = [];
  const together: TogetherC[] = [];
  for (const c of constraints) {
    if (c.kind === 'fixed') fixed.push({ resourceId: c.resourceId, seat: c.seat });
    else if (c.kind === 'apart')
      apart.push({ resourceIds: c.resourceIds.slice(), minDistance: Math.max(1, c.minDistance) });
    else if (c.kind === 'together') together.push({ resourceIds: c.resourceIds.slice() });
  }
  return { fixed, apart, together };
};

// 현재 배치에서 한 학생을 좌석에 두었을 때 발생하는 apart 위반 수
const apartViolationsAt = (
  resourceId: string,
  seat: string,
  studentToSeat: Map<string, string>,
  apart: ApartC[]
): number => {
  let count = 0;
  const myCoord = seatCoord(seat);
  for (const a of apart) {
    if (!a.resourceIds.includes(resourceId)) continue;
    for (const other of a.resourceIds) {
      if (other === resourceId) continue;
      const otherSeat = studentToSeat.get(other);
      if (!otherSeat) continue;
      const dist = chebyshev(myCoord, seatCoord(otherSeat));
      if (dist < a.minDistance) count++;
    }
  }
  return count;
};

// 전체 apart 위반 카운트
const totalApartViolations = (
  studentToSeat: Map<string, string>,
  apart: ApartC[]
): number => {
  let count = 0;
  for (const a of apart) {
    const ids = a.resourceIds;
    for (let i = 0; i < ids.length; i++) {
      const si = studentToSeat.get(ids[i]);
      if (!si) continue;
      for (let j = i + 1; j < ids.length; j++) {
        const sj = studentToSeat.get(ids[j]);
        if (!sj) continue;
        const dist = chebyshev(seatCoord(si), seatCoord(sj));
        if (dist < a.minDistance) count++;
      }
    }
  }
  return count;
};

// together 위반: 그룹 내 누구도 그룹 멤버와 인접하지 않으면 위반 (그룹 크기 1은 위반 없음)
const togetherViolations = (
  studentToSeat: Map<string, string>,
  together: TogetherC[]
): number => {
  let count = 0;
  for (const t of together) {
    if (t.resourceIds.length <= 1) continue;
    for (const rid of t.resourceIds) {
      const seat = studentToSeat.get(rid);
      if (!seat) continue;
      const adj = t.resourceIds.some((other) => {
        if (other === rid) return false;
        const otherSeat = studentToSeat.get(other);
        return otherSeat ? areAdjacent(seat, otherSeat) : false;
      });
      if (!adj) count++;
    }
  }
  return count;
};

// 인접한 빈 좌석 묶음을 size개 찾아 반환 (없으면 빈 배열)
const findAdjacentCluster = (
  emptySeats: string[],
  size: number
): string[] => {
  if (size <= 1) return emptySeats.slice(0, size);
  const set = new Set(emptySeats);
  // BFS over chebyshev=1
  for (const start of emptySeats) {
    const visited = new Set<string>([start]);
    const queue: string[] = [start];
    while (queue.length && visited.size < size) {
      const cur = queue.shift()!;
      const { row, col } = seatCoord(cur);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = row + dr;
          const nc = col + dc;
          const ns = `${String.fromCharCode(65 + nr)}${nc + 1}`;
          if (set.has(ns) && !visited.has(ns)) {
            visited.add(ns);
            queue.push(ns);
            if (visited.size >= size) break;
          }
        }
        if (visited.size >= size) break;
      }
    }
    if (visited.size >= size) {
      return Array.from(visited).slice(0, size);
    }
  }
  return [];
};

export const assignSeats = (
  layout: SeatLayout,
  students: SeatStudent[],
  constraints: Constraint[],
  opts: AssignOpts = {}
): Arrangement => {
  const seed = opts.seed ?? newSeed();
  const maxRandomRetries = opts.maxRandomRetries ?? 50;
  const maxSwapIterations = opts.maxSwapIterations ?? 200;

  const rand = mulberry32(seed);
  const seats = extractSeats(layout);
  const { fixed, apart, together } = parseConstraints(constraints);

  const seatToStudent = new Map<string, string | null>();
  const studentToSeat = new Map<string, string>();
  const warnings: string[] = [];

  seats.forEach((s) => seatToStudent.set(s, null));
  const studentPool = new Set(students.map((s) => s.resourceId));

  // Pass 1: fixed
  for (const f of fixed) {
    if (!studentPool.has(f.resourceId)) {
      warnings.push(`fixed: 학생을 찾을 수 없음 (${f.resourceId})`);
      continue;
    }
    if (!seats.includes(f.seat)) {
      warnings.push(`fixed: 좌석 ${f.seat}이(가) 배치도에 없음`);
      continue;
    }
    if (seatToStudent.get(f.seat)) {
      warnings.push(`fixed: 좌석 ${f.seat} 충돌`);
      continue;
    }
    seatToStudent.set(f.seat, f.resourceId);
    studentToSeat.set(f.resourceId, f.seat);
    studentPool.delete(f.resourceId);
  }

  // Pass 2: together (이미 fixed된 학생은 제외하지 않고 자리 그대로 두되, 그룹 내 다른 멤버를 인접 빈 좌석에 배치)
  for (const t of together) {
    const remainingMembers = t.resourceIds.filter((rid) => studentPool.has(rid));
    if (remainingMembers.length === 0) continue;

    // 그룹 안에 fixed로 이미 자리 잡은 멤버가 있으면 그 자리 인접에 배치 시도
    const anchored = t.resourceIds.find((rid) => studentToSeat.has(rid));
    const emptySeats = seats.filter((s) => !seatToStudent.get(s));

    if (anchored) {
      const anchorSeat = studentToSeat.get(anchored)!;
      const adjacentEmpty = emptySeats.filter((s) => areAdjacent(anchorSeat, s));
      const shuffledAdj = seededShuffle(adjacentEmpty, rand);
      const placed: string[] = [];
      for (const member of remainingMembers) {
        const seat = shuffledAdj.find((s) => !placed.includes(s));
        if (seat) {
          seatToStudent.set(seat, member);
          studentToSeat.set(member, seat);
          studentPool.delete(member);
          placed.push(seat);
        } else {
          warnings.push(`together: 인접 자리 부족 (${member})`);
        }
      }
    } else {
      const cluster = findAdjacentCluster(seededShuffle(emptySeats, rand), remainingMembers.length);
      if (cluster.length < remainingMembers.length) {
        warnings.push(`together: 인접 묶음 좌석 부족 (필요 ${remainingMembers.length}, 가능 ${cluster.length})`);
      }
      remainingMembers.forEach((member, idx) => {
        const seat = cluster[idx];
        if (seat) {
          seatToStudent.set(seat, member);
          studentToSeat.set(member, seat);
          studentPool.delete(member);
        }
      });
    }
  }

  // Pass 3: apart-aware random fill
  const remainingStudents = seededShuffle(Array.from(studentPool), rand);
  for (const rid of remainingStudents) {
    const emptySeats = seats.filter((s) => !seatToStudent.get(s));
    if (emptySeats.length === 0) break;

    let bestSeat = emptySeats[0];
    let bestViolations = Infinity;
    const tries = Math.min(maxRandomRetries, emptySeats.length);
    const shuffled = seededShuffle(emptySeats, rand);
    for (let i = 0; i < tries; i++) {
      const candidate = shuffled[i];
      const v = apartViolationsAt(rid, candidate, studentToSeat, apart);
      if (v < bestViolations) {
        bestViolations = v;
        bestSeat = candidate;
        if (v === 0) break;
      }
    }
    seatToStudent.set(bestSeat, rid);
    studentToSeat.set(rid, bestSeat);
    studentPool.delete(rid);
  }

  // 자리 부족 시 unassigned로 분류
  const unassigned = Array.from(studentPool);

  // Pass 4: 2-opt swap to reduce violations
  let iter = 0;
  while (iter < maxSwapIterations) {
    iter++;
    const aV = totalApartViolations(studentToSeat, apart);
    const tV = togetherViolations(studentToSeat, together);
    if (aV + tV === 0) break;

    // 무작위 두 학생(자리 잡은 학생들 중) 선택, fixed로 잡힌 학생은 swap에서 제외
    const fixedSet = new Set(fixed.map((f) => f.resourceId));
    const swappable = Array.from(studentToSeat.keys()).filter((r) => !fixedSet.has(r));
    if (swappable.length < 2) break;

    const i = Math.floor(rand() * swappable.length);
    let j = Math.floor(rand() * swappable.length);
    if (j === i) j = (j + 1) % swappable.length;
    const r1 = swappable[i];
    const r2 = swappable[j];
    const s1 = studentToSeat.get(r1)!;
    const s2 = studentToSeat.get(r2)!;

    // swap 시도
    studentToSeat.set(r1, s2);
    studentToSeat.set(r2, s1);
    seatToStudent.set(s2, r1);
    seatToStudent.set(s1, r2);
    const newAV = totalApartViolations(studentToSeat, apart);
    const newTV = togetherViolations(studentToSeat, together);

    if (newAV + newTV >= aV + tV) {
      // revert
      studentToSeat.set(r1, s1);
      studentToSeat.set(r2, s2);
      seatToStudent.set(s1, r1);
      seatToStudent.set(s2, r2);
    }
  }

  // 잔존 위반 수집
  const finalAV = totalApartViolations(studentToSeat, apart);
  const finalTV = togetherViolations(studentToSeat, together);
  if (finalAV > 0) warnings.push(`떨어뜨림 제약 위반 ${finalAV}건`);
  if (finalTV > 0) warnings.push(`함께 앉히기 제약 위반 ${finalTV}건`);
  if (unassigned.length > 0) warnings.push(`좌석 부족 학생 ${unassigned.length}명`);

  // seatToStudent를 Record로 변환
  const seatRecord: Record<string, string | null> = {};
  for (const s of seats) {
    seatRecord[s] = seatToStudent.get(s) ?? null;
  }

  return {
    layoutId: layout.id,
    classKey: students[0] ? `${students[0].grade}-${students[0].classNum}` : '',
    seatToStudent: seatRecord,
    unassigned,
    warnings,
    generatedAt: new Date().toISOString(),
    seed,
  };
};

// 두 좌석 학생 swap (UI에서 사용)
export const swapSeats = (
  arrangement: Arrangement,
  seatA: string,
  seatB: string
): Arrangement => {
  if (seatA === seatB) return arrangement;
  const next = { ...arrangement.seatToStudent };
  const a = next[seatA] ?? null;
  const b = next[seatB] ?? null;
  next[seatA] = b;
  next[seatB] = a;
  return {
    ...arrangement,
    seatToStudent: next,
    generatedAt: new Date().toISOString(),
  };
};
