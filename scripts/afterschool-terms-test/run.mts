/**
 * 방과후 학년도·학년 그룹화 회귀 — `npx tsx scripts/afterschool-terms-test/run.mts`
 *
 * 세 가지가 **오류 없이 조용히** 틀릴 수 있어 못 박는다.
 *  · 학년도 유도(`입학연도 + 학년 - 1`)가 어긋나면 3학년 학생의 1학년 수강이
 *    엉뚱한 해에 붙는다 — 화면은 멀쩡해 보인다.
 *  · `- 복사` 를 안 거르면 같은 강좌가 한 학년에 두 번 나온다(라이브 116행).
 *  · 반대로 접미사 없는 동명 강좌까지 합치면 **실제 재수강이 사라진다**.
 */
import {
  deriveAfterschoolTerm,
  groupAfterschoolByTerm,
  normalizeCourseName,
  hasCopySuffix,
  totalAfterschoolCourseCount,
  type AfterschoolEnrollmentLike,
} from '../../src/features/student-dashboard/utils/afterschoolTerms';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

let seq = 0;
const row = (
  studentId: string | null,
  studentNumber: string | null,
  cateId: number,
  courseName: string,
): AfterschoolEnrollmentLike => ({
  id: `r${(seq += 1)}`,
  student_id: studentId,
  student_number: studentNumber,
  cate_id: cateId,
  course_name: courseName,
});

// ── 학년도 유도 ─────────────────────────────────────────────────────────
check('25년 입학 + 1학년 학번 → 2025학년도',
  deriveAfterschoolTerm({ student_id: '00-00493', student_number: '10224' })?.academicYear === 2025);
check('25년 입학 + 2학년 학번 → 2026학년도',
  deriveAfterschoolTerm({ student_id: '00-00493', student_number: '20320' })?.academicYear === 2026);
check('24년 입학 + 3학년 학번 → 2026학년도',
  deriveAfterschoolTerm({ student_id: '00-00258', student_number: '30304' })?.academicYear === 2026);
check('26년 입학 + 1학년 학번 → 2026학년도',
  deriveAfterschoolTerm({ student_id: '00-00648', student_number: '10103' })?.academicYear === 2026);
check('학년은 학번 첫 자리',
  deriveAfterschoolTerm({ student_id: '00-00493', student_number: '20320' })?.grade === 2);
check('입학연도는 학적 코드 접두',
  deriveAfterschoolTerm({ student_id: '00-00081', student_number: '10405' })?.admissionYear === 2023);

check('학적 코드가 없으면 null', deriveAfterschoolTerm({ student_id: null, student_number: '10224' }) === null);
check('학번이 없으면 null', deriveAfterschoolTerm({ student_id: '00-00493', student_number: null }) === null);
check('학번이 5자리가 아니면 null', deriveAfterschoolTerm({ student_id: '00-00493', student_number: '1022' }) === null);
check('학번이 숫자가 아니면 null', deriveAfterschoolTerm({ student_id: '00-00493', student_number: '1022A' }) === null);
check('학년 자리가 0이면 null', deriveAfterschoolTerm({ student_id: '00-00493', student_number: '00224' }) === null);
check('학년 자리가 4 이상이면 null', deriveAfterschoolTerm({ student_id: '00-00493', student_number: '40224' }) === null);
check('학적 코드 접두가 규격 밖이면 null',
  deriveAfterschoolTerm({ student_id: '2000-00493', student_number: '10224' }) === null);

// ── 강좌명 정규화 ───────────────────────────────────────────────────────
check('복사 접미사 제거', normalizeCourseName('수학 심화반 - 복사') === '수학 심화반');
check('공백 변형도 제거', normalizeCourseName('수학 심화반-복사') === '수학 심화반');
check('접미사 없으면 그대로', normalizeCourseName('수학 심화반') === '수학 심화반');
check('가운데 "복사"는 건드리지 않는다',
  normalizeCourseName('복사기 활용 실습') === '복사기 활용 실습');
check('hasCopySuffix 판정', hasCopySuffix('통합과학 물리, 화학 기초 - 복사') && !hasCopySuffix('통합과학 물리, 화학 기초'));

// ── 라이브 형태: 00-00493 (2025학년도 1학년 → 2026학년도 2학년) ─────────
const live: AfterschoolEnrollmentLike[] = [
  row('00-00493', '10224', 31, '차근차근 영어 1등급 달성하기'),
  row('00-00493', '10224', 31, '공통수학1 고난이도 문제 재미있게 해결하기'),
  row('00-00493', '10224', 34, '통합과학, 기초를 단단하게'),
  row('00-00493', '10224', 34, '차근차근 영어 1등급 달성하기'),
  row('00-00493', '10224', 41, '통합과학 물리, 화학 기초'),
  row('00-00493', '10224', 41, '수요일 활력 플러스+'),
  row('00-00493', '10224', 41, '차근차근 영어 1등급 달성하기'),
  row('00-00493', '10224', 42, '통합과학 물리, 화학 기초 - 복사'),
  row('00-00493', '10224', 42, '수요일 활력 플러스+ - 복사'),
  row('00-00493', '10224', 42, '차근차근 영어 1등급 달성하기 - 복사'),
  row('00-00493', '10224', 44, '주토피아 국어 모의고사 기출문제 풀이 (문학, 독서, 화작, 문법)'),
  row('00-00493', '10224', 44, '어휘문법 보완, 수능 독해 마스터키'),
  row('00-00493', '10224', 44, '순공(약점보완 수학CD)'),
  row('00-00493', '20320', 47, '주토피아 문학 기출문제 풀이'),
  row('00-00493', '20320', 47, '[3등급 목표, 4,5등급 대상] 대: 대수 3점 마스터하면 대학갈 수 있을까요? 수: 물론.'),
  row('00-00493', '20320', 50, '주토피아 문법 개념 정리편'),
  row('00-00493', '20320', 53, '[3등급 목표, 4,5등급 대상]미: 미분하면 돼요? /적: 적분도 해요...? /분: 분수나오는데 맞...'),
];

const groups = groupAfterschoolByTerm(live);

check('학년도·학년 두 그룹으로 갈린다', groups.length === 2, `${groups.length}개`);
check('최신 학년이 맨 위', groups[0].label === '2026학년도 · 2학년', groups[0].label);
check('그 아래가 1학년', groups[1].label === '2025학년도 · 1학년', groups[1].label);

const g1 = groups[1];
check('1학년 강좌는 8개 (13행 → 복사 3행 제거 → 재수강 합침)', g1.courseCount === 8, `${g1.courseCount}개`);
check('1학년 등록 건수는 10건 (복사 3행만 빠진다)', g1.enrollmentCount === 10, `${g1.enrollmentCount}건`);

const english = g1.courses.find((c) => c.courseName === '차근차근 영어 1등급 달성하기');
check('재수강 3회가 살아 있다 (복사본은 세지 않는다)', english?.times === 3, `${english?.times}회`);
check('재수강 차수는 31·34·41', JSON.stringify(english?.cateIds) === '[31,34,41]', JSON.stringify(english?.cateIds));

const physics = g1.courses.find((c) => c.courseName === '통합과학 물리, 화학 기초');
check('복사 쌍은 1회로 합쳐진다', physics?.times === 1, `${physics?.times}회`);
check('복사본 cate 42 는 남지 않는다', !physics?.cateIds.includes(42));
check('복사 접미사가 화면 이름에 남지 않는다',
  groups.every((g) => g.courses.every((c) => !hasCopySuffix(c.courseName))));

check('그룹 안은 첫 개설 차수 순', JSON.stringify(g1.courses.map((c) => c.cateIds[0])) === '[31,31,34,41,41,44,44,44]',
  JSON.stringify(g1.courses.map((c) => c.cateIds[0])));

const g2 = groups[0];
check('2학년 강좌는 4개', g2.courseCount === 4, `${g2.courseCount}개`);
check('2학년은 전부 1회', g2.courses.every((c) => c.times === 1));
check('전체 강좌 수 합계는 12', totalAfterschoolCourseCount(groups) === 12, `${totalAfterschoolCourseCount(groups)}개`);

// ── 접미사 없는 동명 강좌는 합치되 횟수를 남긴다 (실제 재수강) ──────────
const repeat = groupAfterschoolByTerm([
  row('00-00448', '20101', 47, '수학 심화반'),
  row('00-00448', '20101', 53, '수학 심화반'),
]);
check('재수강은 한 줄 + 2회', repeat[0].courses.length === 1 && repeat[0].courses[0].times === 2);
check('재수강도 등록 건수는 2건', repeat[0].enrollmentCount === 2);

// ── 복사본만 있으면 이름만 정리해 남긴다 (라이브 2건) ───────────────────
const orphan = groupAfterschoolByTerm([row('00-00448', '10101', 42, '통합과학 생물을 수능까지 - 복사')]);
check('짝 없는 복사본은 버리지 않는다', orphan[0].courses.length === 1);
check('짝 없는 복사본도 이름은 정리된다', orphan[0].courses[0].courseName === '통합과학 생물을 수능까지');

// ── 다른 학년의 같은 강좌는 합치지 않는다 ───────────────────────────────
const acrossGrades = groupAfterschoolByTerm([
  row('00-00448', '10101', 34, '배드민턴'),
  row('00-00448', '20101', 47, '배드민턴'),
]);
check('학년이 다르면 그룹이 갈린다', acrossGrades.length === 2);
check('학년별로 각각 1회', acrossGrades.every((g) => g.courses[0].times === 1));

// ── 복사 제거는 같은 그룹 안에서만 일어난다 ─────────────────────────────
const copyAcrossGrades = groupAfterschoolByTerm([
  row('00-00448', '10101', 41, '수요일 활력 플러스+'),
  row('00-00448', '20101', 42, '수요일 활력 플러스+ - 복사'),
]);
check('다른 학년의 복사본은 지우지 않는다',
  copyAcrossGrades.length === 2 && copyAcrossGrades.every((g) => g.courses.length === 1));

// ── 유도 실패분은 버리지 않고 맨 아래로 ─────────────────────────────────
const withUnknown = groupAfterschoolByTerm([
  row('00-00493', '20320', 50, '주토피아 문법 개념 정리편'),
  row(null, '10224', 31, '이름 모를 강좌'),
]);
check('유도 실패해도 행이 사라지지 않는다', withUnknown.length === 2);
check('"학년 미상"은 맨 아래', withUnknown[withUnknown.length - 1].label === '학년 미상');
check('"학년 미상"의 학년도는 null', withUnknown[withUnknown.length - 1].academicYear === null);

// ── 정렬은 결정적이고 원본을 건드리지 않는다 ────────────────────────────
const before = JSON.stringify(live);
const shuffled = groupAfterschoolByTerm([...live].reverse());
check('입력 순서가 달라도 같은 결과', JSON.stringify(shuffled) === JSON.stringify(groups));
check('입력 배열을 변형하지 않는다', JSON.stringify(live) === before);
check('빈 목록도 안전', groupAfterschoolByTerm([]).length === 0);

// ── 3개 학년이 모두 있으면 내림차순 ─────────────────────────────────────
const threeYears = groupAfterschoolByTerm([
  row('00-00258', '10204', 31, 'A'),
  row('00-00258', '20904', 39, 'B'),
  row('00-00258', '30304', 48, 'C'),
]);
check('3개 학년이 최신순', JSON.stringify(threeYears.map((g) => g.label)) ===
  JSON.stringify(['2026학년도 · 3학년', '2025학년도 · 2학년', '2024학년도 · 1학년']),
  JSON.stringify(threeYears.map((g) => g.label)));

console.log(`${pass} passed, ${fail} failed`);
console.log(fail === 0 ? 'OK' : 'FAILED');
process.exit(fail === 0 ? 0 : 1);
