import assert from 'node:assert/strict';
import { buildTimetableInput, type OfferingRow, type EnrollmentRow } from '../buildInput';
import { prepareTimetableFinalization } from '../planFinalization';
import { editCandidate, formatCandidateScore, selectedPlanCandidate } from '../candidateEditing';
import type { Placement, SavedTimetablePlan, TimetableCandidate } from '../../types';

declare const test: (name: string, run: () => void | Promise<void>) => void;
declare const jest: { mock: (path: string, factory: () => unknown) => void };

const queries: { table: string; calls: [string, unknown[]][] }[] = [];
jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const query = { table, calls: [] as [string, unknown[]][] };
      queries.push(query);
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'or', 'delete', 'insert', 'update', 'single']) {
        builder[method] = (...args: unknown[]) => { query.calls.push([method, args]); return builder; };
      }
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: {}, error: null, count: 0 }).then(resolve);
      return builder;
    },
  },
}));

const loadService = () => import('../../services/timetablePlanService');

function fixture() {
  const offerings: OfferingRow[] = ['t1', 't2'].map((teacher, i) => ({
    id: `off-${i}`, grade: 1, subject_name: '통합과학', credits: 2, class_label: '1반',
    teacher_resource_id: teacher, teacher_name: teacher, room_no: null, classroom: null,
  }));
  const enrollments: EnrollmentRow[] = ['s1', 's2'].map((student, i) => ({
    course_offering_id: 'off-0', student_resource_id: student, student_grade: 1,
    student_class: '1학년 1반', student_no: i + 1, student_name: student,
  }));
  const source = { offerings, enrollments, selectionGroups: [] };
  const input = buildTimetableInput(offerings, enrollments, {
    academicYear: 2026, semester: 2, grades: [1],
    blockedCellsByGrade: { 1: [{ dayIndex: 4, period: 7 }] },
  });
  const placements = input.lessons.map((l, dayIndex) => ({ lessonId: l.id, dayIndex, period: 1 }));
  const candidate = editCandidate(input, { id: 'a', grades: [1], createdAt: 'now' } as TimetableCandidate, placements);
  const plan: SavedTimetablePlan = {
    id: 'plan', academic_year: 2026, semester: 2, title: '회귀 테스트', status: 'draft',
    input_payload: { ...input, lessons: input.lessons.map(({ sourceOfferingIds, ...l }) => ({ ...l, studentCodes: [] })) },
    candidates: [candidate], selected_candidate_id: 'a', finalized_placements: null,
    diagnostics: null, created_by: null, created_at: 'now', updated_at: 'now',
  };
  return { source, input, placements, candidate, plan };
}

test('구 저장본의 합성 공통수업 ID와 팀티칭 교사를 실제 강좌 행으로 복원한다', () => {
  const { source, placements, plan } = fixture();
  const rows = prepareTimetableFinalization(plan, placements, source);
  assert.equal(rows.teacherRows.length, 2);
  assert.equal(rows.studentRows.length, 4);
  assert.deepEqual(rows.teacherRows.map((r) => [r.course_offering_id, r.teacher_resource_id]), [['off-0', 't1'], ['off-1', 't2']]);
  assert(rows.studentRows.every((r) => r.student_class === 1));
});

test('명단 없는 진로활동은 반 명단을 복원해 학생 행도 생성한다', () => {
  const { source } = fixture();
  source.offerings.push({ ...source.offerings[0], id: 'career', subject_name: '진로활동', credits: 1 });
  const input = buildTimetableInput(source.offerings, source.enrollments, { academicYear: 2026, semester: 2, grades: [1] });
  const { plan } = fixture();
  plan.input_payload = { ...input, lessons: input.lessons.map((l) => ({ ...l, studentCodes: [] })) };
  const placements = input.lessons.map((l, dayIndex) => ({ lessonId: l.id, dayIndex, period: 1 }));
  const rows = prepareTimetableFinalization(plan, placements, source);
  assert.equal(rows.studentRows.filter((r) => r.subject === '진로활동').length, 2);
});

test('충돌이 없어도 복원된 선택 분반이 정원을 초과하면 확정하지 않는다', () => {
  const {source,plan}=fixture();
  source.offerings=[{...source.offerings[0],credits:1}];
  source.enrollments=Array.from({length:36},(_,i)=>({course_offering_id:'off-0',student_resource_id:`s${i}`,student_grade:1,student_class:`${i%2+1}반`,student_no:i+1,student_name:`s${i}`}));
  const input=buildTimetableInput(source.offerings,source.enrollments,{academicYear:2026,semester:2,grades:[1]});
  assert.equal(input.lessons[0].isElective,true);
  plan.input_payload=input;
  assert.throws(()=>prepareTimetableFinalization(plan,[{lessonId:input.lessons[0].id,dayIndex:0,period:1}],source),/분반 정원 초과/);
});

for (const [name, change] of Object.entries({
  missing: (ps: Placement[]) => ps.slice(1),
  duplicate: (ps: Placement[]) => [...ps, ps[0]],
  unknown: (ps: Placement[]) => [...ps, { ...ps[0], lessonId: 'unknown' }],
  outside: (ps: Placement[]) => ps.map((p) => ({ ...p, dayIndex: 5 })),
  fractional: (ps: Placement[]) => ps.map((p) => ({ ...p, period: 1.5 })),
  blocked: (ps: Placement[]) => ps.map((p) => ({ ...p, dayIndex: 4, period: 7 })),
  collision: (ps: Placement[]) => ps.map((p) => ({ ...p, dayIndex: 0 })),
})) {
  test(`확정 전 잘못된 배치를 거부한다: ${name}`, () => {
    const { plan, source, placements } = fixture();
    assert.throws(() => prepareTimetableFinalization(plan, change(placements), source), /확정할 수 없습니다/);
  });
}

test('원본 강좌 변경 시 누락된 수업을 조용히 건너뛰지 않는다', () => {
  const { plan, source, placements } = fixture();
  source.offerings = [];
  assert.throws(() => prepareTimetableFinalization(plan, placements, source), /변경/);
});

test('수동 이동을 저장할 후보의 배치와 점수에 함께 반영한다', () => {
  const { input, candidate, placements } = fixture();
  const changed = editCandidate(input, candidate, placements.map((p) => ({ ...p, dayIndex: 4, period: 7 })));
  assert.equal(changed.metrics.hardFeasible, false);
  assert.equal(changed.scoreBreakdown.hard.find((h) => h.id === 'blockedCell')?.count, 2);
  assert.equal(candidate.metrics.hardFeasible, true);
  const stored = JSON.parse(JSON.stringify(changed)) as TimetableCandidate;
  assert.equal(formatCandidateScore(stored.scoreBreakdown.total), '제약 위반');
  assert.equal(formatCandidateScore(123.4), '123');
});

test('재확정 시 새로 선택한 후보를 이전 확정 배치로 덮어쓰지 않는다', () => {
  const { plan, candidate, placements } = fixture();
  plan.finalized_placements = placements.map((p) => ({ ...p, period: 2 }));
  plan.candidates.push({ ...candidate, id: 'b' });
  assert.deepEqual(selectedPlanCandidate(plan, 'b')?.placements, placements);
  assert.deepEqual(selectedPlanCandidate(plan, null)?.placements, plan.finalized_placements);
});

test('검증 실패 시 DB 조회·삭제·삽입을 시작하지 않는다', async () => {
  const { finalizeTimetablePlan } = await loadService();
  const { plan, source } = fixture();
  queries.length = 0;
  await assert.rejects(finalizeTimetablePlan({ plan, source, placements: [] }), /확정할 수 없습니다/);
  assert.equal(queries.length, 0);
});

test('확정 쿼리는 대상 학년만 교체하고 선택한 후보를 기록한다', async () => {
  const { finalizeTimetablePlan } = await loadService();
  const { plan, source, placements } = fixture();
  queries.length = 0;
  const result = await finalizeTimetablePlan({ plan, source, placements, selectedCandidateId: 'b' });
  assert.deepEqual(result, { studentRows: 4, teacherRows: 2 });
  const deletes = queries.filter((q) => q.calls.some(([method]) => method === 'delete'));
  assert.equal(deletes.length, 2);
  for (const q of deletes) {
    assert.deepEqual(q.calls.find(([method]) => method === 'in')?.[1], [q.table === 'student_timetable' ? 'student_grade' : 'grade', [1]]);
  }
  const update = queries.find((q) => q.table === 'timetable_plan')?.calls.find(([method]) => method === 'update');
  assert.equal((update?.[1][0] as { selected_candidate_id: string }).selected_candidate_id, 'b');
});

test('편집한 후보가 초안 저장 payload에 유지되고 학생 식별자는 제거된다', async () => {
  const { createTimetablePlan } = await loadService();
  const { input, candidate, placements } = fixture();
  const edited = editCandidate(input, candidate, placements.map((p) => ({ ...p, period: 2 })));
  queries.length = 0;
  await createTimetablePlan({
    academicYear: input.academicYear, semester: input.semester, title: 'edited', input,
    result: { candidates: [edited], diagnostics: { elapsedMs: 0, csp: { seedsAttempted: 0, feasibleSeeds: 0, selectedSeeds: 0 }, sa: { iterations: 0, acceptedMoves: 0 } } },
  });
  const payload = queries[0].calls.find(([method]) => method === 'insert')![1][0] as {
    candidates: TimetableCandidate[]; input_payload: typeof input;
  };
  assert(payload.candidates[0].placements.every((p) => p.period === 2));
  assert(payload.input_payload.lessons.every((l) => l.studentCodes.length === 0));
});

test('재분반 후 빈 선택 분반에 원래 명단을 다시 넣지 않는다', () => {
  const { source, plan } = fixture();
  source.offerings = [0, 1, 2].map((i) => ({ ...source.offerings[0], id: `elective-${i}`, credits: 1, teacher_resource_id: `t${i}` }));
  source.enrollments = source.offerings.flatMap((o) => [1, 2].map((n) => ({
    ...source.enrollments[0], course_offering_id: o.id, student_resource_id: `s${n}`, student_class: `${n}반`,
  })));
  const input = buildTimetableInput(source.offerings, source.enrollments, { academicYear: 2026, semester: 2, grades: [1] });
  plan.input_payload = input;
  const placements = input.lessons.map((l, dayIndex) => ({ lessonId: l.id, dayIndex, period: 1 }));
  const rows = prepareTimetableFinalization(plan, placements, source);
  assert.equal(rows.teacherRows.length, 3);
  assert.equal(rows.studentRows.length, 2);
  assert.equal(new Set(rows.studentRows.map((r) => r.resource_id)).size, 2);
});

test('학생 명단이 달라도 교사 동시수업은 확정하지 않는다', () => {
  const { source, plan } = fixture();
  source.offerings = [1, 2].map((n) => ({ ...source.offerings[0], id: `class-${n}`, class_label: `${n}반`, credits: 1 }));
  source.enrollments = source.offerings.map((o, i) => ({
    ...source.enrollments[0], course_offering_id: o.id, student_resource_id: `s${i}`, student_class: o.class_label,
  }));
  plan.input_payload = buildTimetableInput(source.offerings, source.enrollments, { academicYear: 2026, semester: 2, grades: [1] });
  const placements = plan.input_payload.lessons.map((l) => ({ lessonId: l.id, dayIndex: 0, period: 1 }));
  assert.throws(() => prepareTimetableFinalization(plan, placements, source), /교사 동시 수업 충돌/);
});

test('고정 배치 위반은 거부하고 부하 위반만 남은 후보는 허용한다', () => {
  const { source, plan, placements } = fixture();
  plan.input_payload.options.maxPerTeacherPerDay = 0;
  assert.equal(prepareTimetableFinalization(plan, placements, source).teacherRows.length, 2);
  plan.input_payload.pinned = [{ ...placements[0], period: 3 }];
  assert.throws(() => prepareTimetableFinalization(plan, placements, source), /고정 배치 위반/);
});

test('다른 학기로 잘못 저장된 입력은 DB 반영 전에 거부한다', () => {
  const { source, plan, placements } = fixture();
  plan.semester = 1;
  assert.throws(() => prepareTimetableFinalization(plan, placements, source), /학년도·학기/);
});
