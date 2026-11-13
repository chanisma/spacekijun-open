/**
 * 조건으로 학생 고르기 — 회귀 (2026-10-01)
 *   npx tsx scripts/student-audience-test/run.mts
 *
 * ① 순수 함수(요약·검증·학년 분해·좁히기·경고)  ② 정적 검사(권한 함수·재학생 조인·모르는 type 거부·
 *    선택기 게이트). 이 기능의 결함은 대부분 **오류 없이 더 넓은/좁은 명단**으로 나타난다 — 정적 검사가 방어선이다.
 * 라이브 대조값은 docs/plans/2026-10-01-student-audience-selection.md §1·§7.
 */
import { readFileSync } from 'node:fs';
import {
  canonicalRule,
  parseStoredStudentRule,
  describeStudentCriterion,
  describeStudentRule,
  gradeBreakdown,
  narrowRuleToGrade,
  newStudentCriterion,
  resolutionWarnings,
  studentCriterionEmpty,
  validateStudentRule,
  STUDENT_CRITERION_MENU,
  type StudentAudienceRule,
  type StudentAudienceRow,
} from '../../src/lib/studentAudienceRule';

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`, detail ?? ''); }
};
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

console.log('① 요약 문장');
check('현재 학년·반', describeStudentCriterion({ type: 'current_class', grades: [3], classes: [2, 1] }) === '현재 3학년 1반·2반');
check('반만 지정 = 전 학년', describeStudentCriterion({ type: 'current_class', classes: [5] }) === '현재 전 학년 5반');
check('예전 반', describeStudentCriterion({ type: 'past_class', grade: 2, classes: [3] }) === '2학년 때 3반');
check('요일·교시·과목', describeStudentCriterion({ type: 'slot', days: [2], periods: [1], subjects: ['인공지능 기초'] }) === '화 1교시 · 인공지능 기초 수업');
const g3past23: StudentAudienceRule = {
  include: [{ all: [{ type: 'current_class', grades: [3] }, { type: 'past_class', grade: 2, classes: [3] }] }],
  exclude: [],
};
check('묶음 = 「중」으로 잇는다', describeStudentRule(g3past23) === '현재 3학년 중 2학년 때 3반', describeStudentRule(g3past23));
check('묶음끼리 = 또는 / 제외', describeStudentRule({
  include: [{ all: [{ type: 'club', names: ['A'] }] }, { all: [{ type: 'club', names: ['B'] }] }],
  exclude: [{ all: [{ type: 'current_class', grades: [1], classes: [1] }] }],
}) === '동아리 · A 또는 동아리 · B (제외: 현재 1학년 1반)');

console.log('② 검증');
check('빈 규칙 거부', validateStudentRule({ include: [], exclude: [] }) !== null);
check('값 없는 조건 거부', validateStudentRule({ include: [{ all: [newStudentCriterion('club')] }], exclude: [] }) !== null);
check('값 있는 규칙 통과', validateStudentRule(g3past23) === null);
check('내 반·전원은 값 없이 유효', !studentCriterionEmpty({ type: 'my_homeroom' }) && !studentCriterionEmpty({ type: 'all_students' }));
check('요일·교시 둘 다 비면 거부', studentCriterionEmpty({ type: 'slot', days: [], periods: [] }));
check('예전 반 학년 범위 밖 거부', studentCriterionEmpty({ type: 'past_class', grade: 4, classes: [1] }));
check('메뉴에 직접 지정 없음(목록이 맡는다)', !STUDENT_CRITERION_MENU.includes('people'));
for (const type of STUDENT_CRITERION_MENU) {
  check(`새 조건 ${type} 은 type 을 유지`, newStudentCriterion(type).type === type);
}

console.log('③ 학년 분해 · 좁히기');
const row = (grade: number): StudentAudienceRow => ({
  resource_id: `${grade}-${Math.random()}`, name: 'x', student_code: null, grade, class: 3, number: 1, reasons: [],
});
const rows = [...Array(21)].map(() => row(2)).concat([...Array(25)].map(() => row(3)));
const bd = gradeBreakdown(rows);
check('「2학년 때 3반」 46 = 2학년 21 + 3학년 25', JSON.stringify(bd) === JSON.stringify([{ grade: 2, count: 21 }, { grade: 3, count: 25 }]), bd);
const past23: StudentAudienceRule = { include: [{ all: [{ type: 'past_class', grade: 2, classes: [3] }] }], exclude: [] };
check('학년으로 좁히기 = 「현재 3학년 중」을 쓴 것과 같은 규칙',
  describeStudentRule(narrowRuleToGrade(past23, 3)) === describeStudentRule(g3past23));
const narrowedTwice = narrowRuleToGrade(narrowRuleToGrade(past23, 3), 2);
check('다시 좁히면 학년 조건을 바꾼다(두 개가 되면 AND 가 0명)',
  narrowedTwice.include[0].all.filter((c) => c.type === 'current_class').length === 1
  && describeStudentRule(narrowedTwice) === '현재 2학년 중 2학년 때 3반');
check('제외 묶음은 좁히지 않는다', narrowRuleToGrade({ ...past23, exclude: past23.include }, 3).exclude[0].all.length === 1);

console.log('④ 경고 문장');
const warn = resolutionWarnings({
  academic_year: 2026, semester: 2, rows: [], included: 0, excluded: 0,
  groups: [{ side: 'include', index: 0, count: 0, criteria: [
    { type: 'current_class', count: 222 }, { type: 'past_class', count: 46, no_record: 2 },
    { type: 'club', count: 0, unknown: ['없는동아리'] },
  ] }],
});
check('모르는 이름을 말한다', warn.some((w) => w.includes('없는동아리')));
check('기록 없음을 말한다', warn.some((w) => w.includes('2명')));
const warnAnd = resolutionWarnings({
  academic_year: 2026, semester: 2, rows: [], included: 0, excluded: 0,
  groups: [{ side: 'include', index: 0, count: 0, criteria: [{ type: 'current_class', count: 222 }, { type: 'current_class', count: 190 }] }],
});
check('각각은 있는데 AND 가 0명이면 그렇게 말한다', warnAnd.some((w) => w.includes('모두 만족하는 학생은 없습니다')));

console.log('⑤ 정적 검사 — 서버');
const sql = read('supabase/migrations/20261001120000_student_audience.sql');
check('학생 정보 권한 = is_teacher_or_admin', /resolve_student_audience[\s\S]*?is_teacher_or_admin\(auth\.uid\(\)\)/.test(sql));
check('is_staff_teacher_or_admin 로 넓히지 않음(주석 밖)',
  !sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').includes('is_staff_teacher_or_admin'));
check('로그인 가드가 먼저', /if auth\.uid\(\) is null then[\s\S]{0,80}로그인/.test(sql));
check('재학생 판정 = status active', /student_audience_pool[\s\S]*?r\.status = 'active'/.test(sql));
check('모르는 type 거부', sql.includes("알 수 없는 학생 조건"));
check('PUBLIC·anon 양쪽 회수', /revoke execute on function public\.resolve_student_audience\(jsonb, int, int\) from public, anon/.test(sql));
check('student_enrollment 를 읽지 않음(비재학생 행 잔존)',
  !sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').includes('student_enrollment'));
check('지금 없는 동아리 제외', (sql.match(/coalesce\(c\.meta->>'status', 'active'\) = 'active'/g) ?? []).length >= 3);
check('담임 = 태그 N학년 M반', sql.includes("'^([0-9])학년 ([0-9]+)반$'"));

console.log('⑥ 정적 검사 — 화면');
const picker = read('src/components/ui/searchable-multi-select.tsx');
check('학생 조건 게이트 = filterByStudent ∧ TEACHER_ROLES(학생 정보 — 직원 제외)',
  /if \(filterByStudent && TEACHER_ROLES\.includes\(role\)\) targets\.push\("student"\)/.test(picker));
check('교직원 조건 게이트 = filterByTeacher ∧ FACULTY_ROLES',
  /if \(filterByTeacher && FACULTY_ROLES\.includes\(role\)\) targets\.push\("faculty"\)/.test(picker));
check('한 개 고르기 선택기에는 없다', /if \(singleSelect \|\| !role\) return \[\]/.test(picker));
check('섞인 목록 거르기는 섞인 선택기에서만', /mixedMode && !ruleOpen && !spreadsheetOpen/.test(picker) && /const mixedMode = filterByTeacher && filterByStudent/.test(picker));
check('거르기는 그룹(태그=교직원·학년반수업=학생)에도', /kindFilter === "faculty" \? item\.groupKind === "tag" : item\.groupKind !== "tag"/.test(picker));
check('Provider 밖에서도 안 깨짐(useOptionalAuth)', picker.includes('useOptionalAuth()') && !/\buseAuth\(\)/.test(picker));
check('저장값은 그대로 id 목록(RULE_ 값을 선택에 넣지 않음)', !/onSelectionChange\([^)]*RULE_/.test(picker));
const panel = read('src/components/ui/audience-rule-panel.tsx');
check('패널은 새 Dialog 를 띄우지 않음', !/from "@\/components\/ui\/(dialog|alert-dialog|popover)"/.test(panel));
check('미완성 규칙이면 이전 결과를 숨김', panel.includes('validation === null ? resolution.data : undefined'));

console.log('⑦ 3단계 — 최근·즐겨찾기');
{
  const a: StudentAudienceRule = {
    include: [{ all: [{ type: 'past_class', grade: 2, classes: [4, 3] }, { type: 'current_class', grades: [3] }] }],
    exclude: [],
  };
  const b: StudentAudienceRule = {
    include: [{ all: [{ type: 'current_class', grades: [3], classes: [] }, { type: 'past_class', grade: 2, classes: [3, 4] }] }],
    exclude: [],
  };
  check('정준형은 순서·빈 배열에 흔들리지 않는다(같은 조건 = 한 줄)', canonicalRule(a) === canonicalRule(b));
  check('다른 조건은 다른 열쇠', canonicalRule(a) !== canonicalRule(g3past23));
  check('저장된 규칙 읽기', parseStoredStudentRule(JSON.parse(JSON.stringify(g3past23))) !== null);
  check('모르는 조건이 하나라도 있으면 그 행을 버린다(부분 복구 금지)',
    parseStoredStudentRule({ include: [{ all: [{ type: 'current_class', grades: [1] }, { type: 'grade_rank' }] }] }) === null);
  check('빈 포함·깨진 모양은 버린다',
    parseStoredStudentRule({ include: [] }) === null && parseStoredStudentRule('x') === null
    && parseStoredStudentRule({ include: [{ all: [] }] }) === null);
  check('값이 빈 조건도 버린다', parseStoredStudentRule({ include: [{ all: [{ type: 'club', names: [] }] }] }) === null);

  const saved = read('supabase/migrations/20261001140000_student_audience_saved_rule.sql');
  check('본인 행만(SELECT·UPDATE·DELETE = user_id = auth.uid())',
    (saved.match(/using \(user_id = auth\.uid\(\)\)/g) ?? []).length === 3);
  check('만들기는 교사·관리자', /for insert[\s\S]{0,120}is_teacher_or_admin\(auth\.uid\(\)\)/.test(saved));
  check('같은 규칙은 한 줄(unique user_id, rule_key)', saved.includes('unique (user_id, rule_key)'));
  check('별표 없는 것만 최근 8개로 정리', /not d\.pinned[\s\S]{0,300}limit 8/.test(saved));
  check('다시 써도 별표가 풀리지 않는다', saved.includes('pinned = s.pinned or excluded.pinned'));
  check('정리 순서는 clock_timestamp(now() 는 트랜잭션 안에서 같은 시각)',
    /last_used_at = clock_timestamp\(\)/.test(saved) && !/last_used_at = now\(\)/.test(saved));
  check('기록 RPC 는 INVOKER(RLS 적용)', /record_student_audience_rule[\s\S]*?security invoker/.test(saved));

  check('[N명 추가] 때 최근에 기록', /record\(false\);[\s\S]{0,120}onApply\(/.test(panel));
  check('별표한 것은 목록에서 바로 지우지 않는다(X 는 별표 없는 것만)', /\{!saved\.pinned && \(/.test(panel));
  check('기록 실패가 추가를 막지 않는다', /onError: \(error\) => console\.warn/.test(panel));
  const hook = read('src/hooks/useStudentAudience.ts');
  check('저장된 규칙을 읽을 때도 검사한다(학생·교직원 각자의 파서)',
    hook.includes("useSavedRules<StudentAudienceRule>('student', parseStoredStudentRule")
    && hook.includes("useSavedRules<FacultyAudienceRule>('faculty', parseStoredFacultyRule")
    && hook.includes('const rule = parse(row.rule)'));
  check('저장 목록은 대상별로 읽는다', hook.includes(".eq('target', target)"));
  const hookCode = hook.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  check('supabase 메서드를 변수로 꺼내지 않는다(this 유실)', !/const \w+ = supabase\.(from|rpc)\b/.test(hookCode));
}

console.log(`\n${failed === 0 ? '통과' : '실패'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
