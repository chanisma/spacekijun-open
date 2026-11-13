import assert from 'node:assert/strict';
import type { Lesson, TimetableInput } from '../../types';
import { DEFAULT_OPTIONS, DEFAULT_WEIGHTS } from '../../constants';
import { runCoordinatedSolver } from '../coordinatedSolver';
import { repairByEjection } from '../ejectionRepair';
import { repairTimeNeighborhoods } from '../temporalRepair';
import { sectionStudents } from '../sectioning';
import { lessonsWithSectioning } from '../../utils/sectioningReport';
import { evaluateFull } from '../score';
import { buildConflictGraph } from '../conflictGraph';

declare const test: (name: string, run: () => void) => void;

function lesson(id: string, teacherId: string, studentCodes: string[], extra: Partial<Lesson> = {}): Lesson {
  return { id, offeringId: id, subjectName: id, grade: 1, classLabel: null,
    teacherId, teacherName: teacherId, roomId: null, studentCodes,
    category: 'other', isMajor: false, isElective: false, classKeys: ['1-1'], blockedCells: [], ...extra };
}

function fixture(): TimetableInput {
  return { academicYear: 2026, semester: 1, grades: [1], grid: { days: 2, periodsPerDay: 2 },
    lessons: [lesson('a', 't1', ['s1']), lesson('b', 't1', ['s2']), lesson('c', 't2', ['s1']), lesson('d', 't2', ['s2'])],
    pinned: [], fixedBlocks: [], weights: { ...DEFAULT_WEIGHTS },
    options: { ...DEFAULT_OPTIONS, hard: { ...DEFAULT_OPTIONS.hard }, runMode: 'quick', randomSeed: 7, maxPerTeacherPerDay: 1 } };
}

const initial = [
  { lessonId: 'a', dayIndex: 0, period: 1 }, { lessonId: 'b', dayIndex: 0, period: 2 },
  { lessonId: 'c', dayIndex: 1, period: 1 }, { lessonId: 'd', dayIndex: 1, period: 2 },
];

test('연쇄 재배치는 교사 하루 상한을 학생 충돌 없이 해결하며 원본을 변경하지 않는다', () => {
  const input = fixture();
  const before = JSON.stringify({ input, initial });
  const result = repairByEjection(input, initial, Date.now() + 1500, 7);
  assert.equal(result.before, 2);
  assert.equal(result.after, 0);
  const evaluated = evaluateFull(result.placements, { input, graph: buildConflictGraph(input.lessons, { teacher: true, room: false }) });
  assert.equal(evaluated.metrics.hardFeasible, true);
  assert.equal(JSON.stringify({ input, initial }), before);
});

test('모두 고정된 위반 배치는 연쇄 수리로 이동하거나 성공으로 표시하지 않는다', () => {
  const input = fixture();
  input.pinned = [...initial];
  const result = repairByEjection(input, initial, Date.now() + 100, 7);
  assert.deepEqual(result.placements, initial);
  assert.equal(result.after, 2);
});

test('정확 수리 엔진이 없으면 후보를 보존한다', () => {
  const result = repairTimeNeighborhoods(fixture(), initial, Date.now() + 100);
  assert.deepEqual(result.placements, initial);
  assert.equal(result.after, 2);
});

test('공동 탐색은 차단칸·고정 배치와 원래 교사 제약을 지킨다', () => {
  const input = fixture();
  input.pinned = [initial[0]];
  input.lessons[0].blockedCells = ['1|2'];
  const before = JSON.stringify(input);
  const { result, finalInput } = runCoordinatedSolver(input, undefined, initial);
  const c = result.candidates[0];
  assert.equal(c.metrics.hardFeasible, true);
  assert.deepEqual(c.placements.find(p => p.lessonId === 'a'), initial[0]);
  assert.deepEqual(finalInput.options, input.options);
  assert.equal(JSON.stringify(input), before);
  const score = evaluateFull(c.placements, { input: finalInput, graph: buildConflictGraph(finalInput.lessons, { teacher: true, room: false }) });
  assert.equal(score.metrics.hardFeasible, true);
});

test('필요조건 불충족은 탐색 없이 원인을 반환한다', () => {
  const input = fixture();
  input.lessons.push(lesson('e', 't1', ['s3']));
  const { result } = runCoordinatedSolver(input);
  assert.equal(result.diagnostics.preflight?.feasible, false);
  assert.equal(result.candidates.length, 0);
  assert.match(result.diagnostics.reason!, /교사 하루 상한/);
  assert.equal(result.diagnostics.csp.seedsAttempted, 0);
});

test('시간 만료는 불가능 증명이 아니며 미완성 기존 후보를 보존한다', () => {
  const realNow = Date.now;
  let calls = 0;
  try {
    Date.now = () => calls++ === 0 ? 0 : 100000;
    const { result } = runCoordinatedSolver(fixture(), undefined, initial);
    assert.deepEqual(result.candidates[0].placements, initial);
    assert.equal(result.candidates[0].metrics.hardFeasible, false);
    assert.match(result.diagnostics.reason!, /불가능의 증명이 아닙니다/);
    assert.equal(result.diagnostics.infeasibility, undefined);
  } finally {
    Date.now = realNow;
  }
});

test('빈 격자 여유가 없어도 배치와 분반의 공동 탐색으로 수업을 모두 배치한다', () => {
  const input = fixture();
  input.options.maxPerTeacherPerDay = 2;
  // Each student uses every cell; four teachers teach one lesson per day.
  input.lessons = Array.from({ length: 8 }, (_, i) => lesson(`l${i}`, `t${i % 4}`, [i < 4 ? 's1' : 's2']));
  const { result } = runCoordinatedSolver(input);
  assert.equal(result.candidates[0].metrics.hardFeasible, true);
  assert.equal(new Set(result.candidates[0].placements.map(p => p.lessonId)).size, 8);
});

for (const dimension of ['grade', 'credits'] as const) {
  test(`재분반은 같은 과목 이름이어도 ${dimension}가 다른 강좌로 학생을 옮기지 않는다`, () => {
    const a = lesson('a', 't1', ['s1'], { isElective: true, subjectName: '선택수학' });
    const b = lesson('b', 't2', ['s2'], { isElective: true, subjectName: '선택수학', grade: dimension === 'grade' ? 2 : 1 });
    const fixed = lesson('fixed', 't3', ['s1']);
    const lessons = [a, b, fixed];
    const placements = [{ lessonId: 'a', dayIndex: 0, period: 1 }, { lessonId: 'b', dayIndex: 1, period: 1 }, { lessonId: 'fixed', dayIndex: 0, period: 1 }];
    if (dimension === 'credits') {
      lessons.push({ ...b, id: 'b2' });
      placements.push({ lessonId: 'b2', dayIndex: 2, period: 1 });
    }
    const sectioned = lessonsWithSectioning(lessons, sectionStudents(lessons, placements));
    assert.deepEqual(sectioned.find(l => l.id === 'a')?.studentCodes, ['s1']);
    assert.deepEqual(sectioned.find(l => l.id === 'b')?.studentCodes, ['s2']);
    assert.equal(sectionStudents(lessons, placements).studentConflicts, 1);
  });
}
