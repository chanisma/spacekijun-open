import { buildConflictGraph } from '../algorithm/conflictGraph';
import { evaluateFull } from '../algorithm/score';
import { applyCandidateRosters, encodeCandidateRoster } from '../utils/candidateRoster';
import { buildOfferingRosterRows } from '../utils/sectioningReport';
import type { Placement, SolverProgress, TimetableInput, TimetableRunResult } from '../types';

const endpoint = '/api/timetable-solver';

async function request(path: string, init?: RequestInit) {
  const response = await fetch(endpoint + path, init).catch((e: unknown) => {
    if (init?.signal?.aborted) throw e;
    throw new Error('계산 서비스 연결이 끊겼습니다. 서비스 실행 상태를 확인하고 다시 생성해 주세요.');
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(body?.message ?? '정확 탐색 서비스에 연결할 수 없습니다. 로컬 계산 서비스를 실행해 주세요.');
  return body;
}

export async function checkExactSolver(signal: AbortSignal) {
  const health = await request('/health', { signal });
  if (!health.ready || health.protocol !== 1) throw new Error('지원하는 정확 탐색 서비스가 아닙니다.');
}

export function verifiedExactResult(input: TimetableInput, value: {
  status: string; placements?: Placement[]; rosters?: Record<string, string[]>; elapsedSeconds?: number;
}): TimetableRunResult {
  const diagnostics = { elapsedMs: (value.elapsedSeconds ?? 0) * 1000,
    csp: { seedsAttempted: 1, feasibleSeeds: 0, selectedSeeds: 0 }, sa: { iterations: 0, acceptedMoves: 0 } };
  if (value.status !== 'FEASIBLE') {
    if (!['UNKNOWN', 'INFEASIBLE'].includes(value.status)) throw new Error('계산 서비스의 응답 상태가 올바르지 않습니다.');
    return { candidates: [], diagnostics: { ...diagnostics, reason: value.status === 'INFEASIBLE'
      ? '현재 수강 명단과 제약으로는 전체 분반을 다시 배정해도 배치할 수 없음이 확인되었습니다.'
      : '제한 시간 내 무충돌 배치를 찾지 못했습니다. 배치 불가능의 증명은 아닙니다.' } };
  }
  const placements = value.placements;
  if (!placements || !value.rosters) throw new Error('검증할 배치 또는 분반 명단이 없습니다.');
  const ids = new Set(input.lessons.map(l => l.id));
  if (placements.length !== ids.size || new Set(placements.map(p => p.lessonId)).size !== ids.size ||
      placements.some(p => !ids.has(p.lessonId) || !Number.isInteger(p.dayIndex) || !Number.isInteger(p.period) ||
        p.dayIndex < 0 || p.dayIndex >= input.grid.days || p.period < 1 || p.period > input.grid.periodsPerDay) ||
      input.lessons.some(l => !l.teacherId)) throw new Error('배치 누락·중복·범위 또는 교사 연결 오류입니다.');
  const lessons = applyCandidateRosters(input.lessons, value.rosters);
  const graph = buildConflictGraph(lessons, { teacher: input.options.hard.teacherConflict, room: input.options.hard.roomConflict });
  const { score, metrics } = evaluateFull(placements, { input: { ...input, lessons }, graph });
  if (!metrics.hardFeasible || score.hard.some(h => h.count > 0)) throw new Error('계산 결과가 원래 제약을 통과하지 못했습니다.');
  const rosterChanges = buildOfferingRosterRows(input.lessons, lessons);
  return { candidates: [{ id: 'cand-staged-cpsat', grades: input.grades, placements,
    sectionRoster: encodeCandidateRoster(input, value.rosters), scoreBreakdown: score, metrics, createdAt: new Date().toISOString() }],
    diagnostics: { ...diagnostics, csp: { seedsAttempted: 1, feasibleSeeds: 1, selectedSeeds: 1 },
      sectioning: { attempts: [], final: { studentConflicts: 0, conflictedStudents: 0, capacityOverflow: 0, rosterChanges,
        changedOfferings: rosterChanges.filter(r => r.beforeCount !== r.afterCount).length,
        studentsMoved: Math.round(rosterChanges.reduce((sum, r) => sum + Math.abs(r.beforeCount - r.afterCount), 0) / 2) } } } };
}

export async function runExactSolver(input: TimetableInput, placements: Placement[] | undefined,
  signal: AbortSignal, onProgress: (progress: SolverProgress) => void): Promise<TimetableRunResult> {
  let jobId: string | undefined;
  try {
    // Names are unnecessary for calculation. The service has no database credentials.
    const source = { ...input, lessons: input.lessons.map(l => ({ ...l, teacherName: null })) };
    const job = await request('/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: source, placements }), signal });
    jobId = job.id;
    while (!signal.aborted) {
      const status = await request(`/jobs/${encodeURIComponent(jobId!)}`, { signal });
      if (status.state === 'done') return verifiedExactResult(input, status.result);
      if (status.state === 'error') throw new Error(status.message);
      onProgress({ phase: 'csp', current: status.progress?.elapsedSeconds ?? 0, total: status.progress?.budgetSeconds ?? 1,
        message: status.progress?.message ?? '배치·분반 공동 탐색 중' });
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('중단됨', 'AbortError')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1000);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
    }
    throw new DOMException('중단됨', 'AbortError');
  } finally {
    if (jobId) void fetch(`${endpoint}/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE', keepalive: true }).catch(() => {});
  }
}
