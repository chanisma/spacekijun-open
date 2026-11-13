import type { Lesson } from '../types';

/**
 * 충돌그래프. 간선 = 두 Lesson이 같은 칸에 놓일 수 없는 관계로,
 * (학생 공유) ∨ (교사 공유) ∨ (교실 공유) 중 하나라도 성립하면 인접이다.
 * 이 단일 관계 덕분에 CSP의 "인접 변수는 서로 다른 칸"이 학생·교사·교실
 * 동시충돌을 한꺼번에 막는다. 같은 강좌의 credits개 인스턴스는 학생·교사를
 * 전부 공유하므로 자동으로 서로 인접 → 서로 다른 칸에 배치된다.
 */
export interface ConflictGraph {
  lessons: Lesson[];
  byLessonId: Map<string, Lesson>;
  /** offeringId -> 그 강좌의 모든 인스턴스 lessonId (같은 과목 하루 한도 검사용) */
  byOffering: Map<string, string[]>;
  adjacency: Map<string, Set<string>>;
  /** 간선 사유 비트마스크: 1=학생, 2=교사, 4=교실 (디버깅·가중치용) */
  edgeReason: Map<string, number>;
  studentToLessons: Map<string, string[]>;
}

export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const REASON_STUDENT = 1;
const REASON_TEACHER = 2;
const REASON_ROOM = 4;

function connectClique(
  ids: string[],
  reason: number,
  adjacency: Map<string, Set<string>>,
  edgeReason: Map<string, number>,
): void {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      if (a === b) continue;
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
      const k = edgeKey(a, b);
      edgeReason.set(k, (edgeReason.get(k) ?? 0) | reason);
    }
  }
}

export function buildConflictGraph(
  lessons: Lesson[],
  opts: { teacher: boolean; room: boolean } = { teacher: true, room: false },
): ConflictGraph {
  const byLessonId = new Map<string, Lesson>();
  const byOffering = new Map<string, string[]>();
  const adjacency = new Map<string, Set<string>>();
  const edgeReason = new Map<string, number>();
  const studentToLessons = new Map<string, string[]>();
  const teacherToLessons = new Map<string, string[]>();
  const roomToLessons = new Map<string, string[]>();

  for (const l of lessons) {
    byLessonId.set(l.id, l);
    const off = byOffering.get(l.offeringId);
    if (off) off.push(l.id);
    else byOffering.set(l.offeringId, [l.id]);
    adjacency.set(l.id, new Set());
    for (const code of l.studentCodes) {
      const arr = studentToLessons.get(code);
      if (arr) arr.push(l.id);
      else studentToLessons.set(code, [l.id]);
    }
    if (opts.teacher && l.teacherId) {
      const arr = teacherToLessons.get(l.teacherId);
      if (arr) arr.push(l.id);
      else teacherToLessons.set(l.teacherId, [l.id]);
    }
    if (opts.room && l.roomId) {
      const arr = roomToLessons.get(l.roomId);
      if (arr) arr.push(l.id);
      else roomToLessons.set(l.roomId, [l.id]);
    }
  }

  for (const ids of studentToLessons.values()) connectClique(ids, REASON_STUDENT, adjacency, edgeReason);
  for (const ids of teacherToLessons.values()) connectClique(ids, REASON_TEACHER, adjacency, edgeReason);
  for (const ids of roomToLessons.values()) connectClique(ids, REASON_ROOM, adjacency, edgeReason);

  return { lessons, byLessonId, byOffering, adjacency, edgeReason, studentToLessons };
}

/**
 * DSATUR 정점 순서 (채도 = 인접 정점이 이미 점유한 서로 다른 칸 수).
 * 시간표 초기해 생성에서 "가장 제약이 빡빡한 수업부터" 배치하도록 유도한다.
 */
export function dsaturOrder(graph: ConflictGraph, lessonIds: string[]): string[] {
  const remaining = new Set(lessonIds);
  const colored = new Map<string, number>();
  const out: string[] = [];

  while (remaining.size > 0) {
    let bestId: string | null = null;
    let bestSat = -1;
    let bestDeg = -1;
    for (const id of remaining) {
      const adj = graph.adjacency.get(id) ?? new Set<string>();
      const satColors = new Set<number>();
      let deg = 0;
      for (const nb of adj) {
        if (remaining.has(nb)) deg++;
        const c = colored.get(nb);
        if (c !== undefined) satColors.add(c);
      }
      const sat = satColors.size;
      if (sat > bestSat || (sat === bestSat && deg > bestDeg)) {
        bestSat = sat;
        bestDeg = deg;
        bestId = id;
      }
    }
    if (bestId === null) break;
    remaining.delete(bestId);
    colored.set(bestId, colored.size);
    out.push(bestId);
  }
  return out;
}
