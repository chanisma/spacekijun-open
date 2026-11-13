/**
 * evalearn 화면 복원 회귀 — `npx tsx --tsconfig tsconfig.app.json scripts/evalearn-store-test/run.mts`
 *
 * 여기서 지키는 것은 **조용히 틀리는 것**이다.
 *  ① 집단(학년 전체·학급) 선택이 저장되는가 — 안 되면 새로고침 때 항상 개인 화면으로 돌아간다
 *     (2026-09-05 사용자 지적. 종전엔 `useState` 라 저장 대상이 아니었다)
 *  ② 학생 선택과 집단 선택이 **배타**인가 — 둘 다 남으면 복원 시 어느 화면인지 결정할 수 없다
 *  ③ 필터를 바꾸면 집단도 풀리는가 — 안 풀면 1학년으로 바꿔도 3학년 집단 분석이 남는다
 */
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

const { useStudentStore } = await import('../../src/features/evalearn/hooks/useStudentStore');

let ok = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok += 1; else fails.push(`${name} — expected ${w}, got ${g}`);
};
const s = () => useStudentStore.getState();

// ① 집단 선택이 저장된다
s().setSelectedCohort({ grade: 3, classNum: null });
eq('학년 전체 선택', s().selectedCohort, { grade: 3, classNum: null });
eq('저장된다', JSON.parse(store['evalearn-student-storage']).state.selectedCohort,
   { grade: 3, classNum: null });

s().setSelectedCohort({ grade: 3, classNum: 5 });
eq('학급 선택', s().selectedCohort, { grade: 3, classNum: 5 });
eq('학급도 저장된다', JSON.parse(store['evalearn-student-storage']).state.selectedCohort,
   { grade: 3, classNum: 5 });

// ② 학생을 고르면 집단이 풀린다(배타)
s().setSelectedStudentId('00-00519');
eq('학생 선택 시 집단 해제', s().selectedCohort, null);
eq('학생은 남는다', s().selectedStudentId, '00-00519');

// 반대로 집단을 골라도 학생 선택은 남는다 — 화면은 집단이 이기고,
// 개인으로 돌아갈 때 마지막 학생이 그대로 열린다
s().setSelectedCohort({ grade: 2, classNum: null });
eq('집단을 골라도 학생 기억은 유지', s().selectedStudentId, '00-00519');
eq('화면은 집단', s().selectedCohort, { grade: 2, classNum: null });

// ③ 필터 변경은 집단·학생을 모두 푼다
s().setFilterGrade(1);
eq('학년 필터 변경 시 집단 해제', s().selectedCohort, null);
eq('학년 필터 변경 시 학생 해제', s().selectedStudentId, null);

s().setSelectedCohort({ grade: 1, classNum: 2 });
s().setFilterClass(3);
eq('학급 필터 변경 시 집단 해제', s().selectedCohort, null);

// null 로 지우는 경로 — 집단을 명시적으로 해제하면 개인 화면으로 돌아간다
s().setSelectedStudentId('00-00646');
s().setSelectedCohort(null);
eq('집단 해제 후 학생 유지', s().selectedStudentId, '00-00646');
eq('집단 없음', s().selectedCohort, null);

// `setSelectedStudentId(null)` 은 집단을 건드리지 않는다(선택 해제일 뿐이다)
s().setSelectedCohort({ grade: 3, classNum: 1 });
s().setSelectedStudentId(null);
eq('학생 해제는 집단을 건드리지 않는다', s().selectedCohort, { grade: 3, classNum: 1 });

// 저장 대상에 학생 목록(students)은 들어가지 않는다 — 용량도 크고 매번 다시 받는다
eq('목록은 저장하지 않는다',
   'students' in JSON.parse(store['evalearn-student-storage']).state, false);

console.log(fails.length === 0
  ? `evalearn 화면 복원 — ${ok}건 통과`
  : `evalearn 화면 복원 — ${ok}건 통과, ${fails.length}건 실패`);
fails.forEach(f => console.error(`  ✗ ${f}`));
if (fails.length) process.exit(1);
