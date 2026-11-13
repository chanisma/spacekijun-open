import type { ExamSubject } from '../types';

export interface ConflictGraph {
  subjects: ExamSubject[];
  bySubjectId: Map<string, ExamSubject>;
  adjacency: Map<string, Set<string>>;
  edgeWeight: Map<string, number>;
  studentToSubjects: Map<string, string[]>;
}

export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildConflictGraph(subjects: ExamSubject[]): ConflictGraph {
  const bySubjectId = new Map<string, ExamSubject>();
  const adjacency = new Map<string, Set<string>>();
  const edgeWeight = new Map<string, number>();
  const studentToSubjects = new Map<string, string[]>();

  for (const s of subjects) {
    bySubjectId.set(s.id, s);
    adjacency.set(s.id, new Set());
    for (const code of s.studentCodes) {
      const list = studentToSubjects.get(code);
      if (list) list.push(s.id);
      else studentToSubjects.set(code, [s.id]);
    }
  }

  for (const subjectIds of studentToSubjects.values()) {
    for (let i = 0; i < subjectIds.length; i++) {
      for (let j = i + 1; j < subjectIds.length; j++) {
        const a = subjectIds[i];
        const b = subjectIds[j];
        adjacency.get(a)!.add(b);
        adjacency.get(b)!.add(a);
        const k = edgeKey(a, b);
        edgeWeight.set(k, (edgeWeight.get(k) ?? 0) + 1);
      }
    }
  }

  return { subjects, bySubjectId, adjacency, edgeWeight, studentToSubjects };
}

export function dsaturOrder(graph: ConflictGraph, subjectIds: string[]): string[] {
  const remaining = new Set(subjectIds);
  const colored = new Map<string, number>();
  const out: string[] = [];

  while (remaining.size > 0) {
    let bestId: string | null = null;
    let bestSat = -1;
    let bestDeg = -1;
    for (const id of remaining) {
      const adj = graph.adjacency.get(id) ?? new Set<string>();
      const satNeighbors = new Set<number>();
      let deg = 0;
      for (const nb of adj) {
        if (remaining.has(nb)) deg++;
        const c = colored.get(nb);
        if (c !== undefined) satNeighbors.add(c);
      }
      const sat = satNeighbors.size;
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
