// course-analyze 성적 표기·부분 평균 회귀 (2026-08-31)
// 실행: npx tsx scripts/course-grade-format-test/run.mts
//
// 배경 2가지:
//  ① 같은 성적이 탭마다 `2.1` / `2.14`로 다르게 보였다 (toFixed(1)·toFixed(2) 혼용).
//     규약을 "소수점 셋째 자리에서 반올림 → 두 자리"로 고정한다.
//  ② 평균 옆에는 늘 더 큰 모집단(수강 인원·전체 과목 수)이 적혀 있는데 실제 분모는
//     "성적이 있는" 일부였다. 분모가 줄었을 때만 '부분' 표식을 붙인다.
import {
  GRADE_FRACTION_DIGITS,
  formatGrade,
  formatGradeDelta,
  isPartialAverage,
  partialAverageTitle,
} from '../../src/features/course-analyze/utils/gradeFormat';

let pass = 0;
function ok(cond: boolean, name: string) {
  if (!cond) { console.error('  ✗', name); process.exit(1); }
  console.log('  ✓', name); pass++;
}

// ─────────────────────────────────────────── 1. 자릿수 규약
console.log('\n[1] 소수점 셋째 자리에서 반올림 → 두 자리');
ok(GRADE_FRACTION_DIGITS === 2, '자릿수 상수는 2');
ok(formatGrade(1.23) === '1.23', '1.23 → "1.23" (요청 예시)');
ok(formatGrade(1.234) === '1.23', '셋째 자리 4는 내림');
ok(formatGrade(1.236) === '1.24', '셋째 자리 6은 올림');
ok(formatGrade(2) === '2.00', '정수도 두 자리로 채운다 — 열이 흔들리지 않게');
ok(formatGrade(1.2349999) === '1.23', '넷째 자리가 셋째 자리 판정을 넘보지 않는다');
ok(formatGrade(9.999) === '10.00', '올림이 정수 자리로 번져도 잘리지 않는다');

// ─────────────────────────────────────────── 2. "성적 없음"은 0이 아니다
console.log('\n[2] 값 없음 처리');
ok(formatGrade(0) === '-', '등급 0은 최상위가 아니라 성적 없음 → 빈칸');
ok(formatGrade(0, 'N/A') === 'N/A', 'fallback을 호출부가 고를 수 있다');
ok(formatGrade(-1) === '-', '음수는 값이 아니다');
ok(formatGrade(null) === '-', 'null 안전');
ok(formatGrade(undefined) === '-', 'undefined 안전');
ok(formatGrade(Number.NaN) === '-', 'NaN 안전 (0으로 나눈 평균)');

// ─────────────────────────────────────────── 3. 차이(±)는 0·음수가 정상 값
console.log('\n[3] 등급 차이 표기');
ok(formatGradeDelta(0) === '+0.00', '차이 0은 값이므로 빈칸이 아니다');
ok(formatGradeDelta(0.125) === '+0.13', '양수는 부호를 붙여 방향을 보인다');
ok(formatGradeDelta(-0.125) === '-0.13', '음수는 자체 부호만');
ok(formatGradeDelta(1.005) !== '-', '차이에는 "0 = 없음" 규칙을 적용하지 않는다');
ok(formatGradeDelta(null) === '-', 'null은 여전히 빈칸');

// ─────────────────────────────────────────── 4. 부분 평균 판정
console.log('\n[4] 부분 평균 판정');
ok(isPartialAverage(18, 24) === true, '24명 중 18명으로 계산 → 부분');
ok(isPartialAverage(24, 24) === false, '분모가 온전하면 표식 없음');
ok(isPartialAverage(30, 24) === false, '분모보다 크면(집계 이상) 표식 없음 — 근거 없는 경고 금지');
ok(isPartialAverage(0, 24) === true, '한 명도 성적이 없으면 명백히 부분');
ok(isPartialAverage(0, 0) === false, '모집단이 0이면 판단 보류');
ok(isPartialAverage(5, Number.NaN) === false, '수가 성립하지 않으면 침묵');
ok(isPartialAverage(Number.NaN, 10) === false, 'covered가 NaN이어도 침묵');

// ─────────────────────────────────────────── 5. 툴팁 문장
console.log('\n[5] 툴팁 문장');
const title = partialAverageTitle({ covered: 18, total: 24 });
ok(title.includes('18명') && title.includes('24명'), '분자·분모를 모두 밝힌다');
ok(title.includes('6명 제외'), '빠진 수를 직접 계산해 보여준다');
ok(
  partialAverageTitle({ covered: 9, total: 12, unit: '과목', missingLabel: '예상 등급' })
    === '부분 평균: 전체 12과목 중 예상 등급이 있는 9과목만으로 계산했습니다 (3과목 제외).',
  '단위·사유를 호출부가 바꿀 수 있다 (과목 단위 제외 사유)',
);

// ─────────────────────────────────────────── 6. 실제 결함 재현
console.log('\n[6] 조합 검색 평균 — 성적 없는 학생이 평균을 끌어내리던 결함');
// 종전: sum(등급 || 0) / 전체 인원 → 미보유자의 0이 분자에 더해지고 분모에도 남았다.
const grades = [2, 3, 0, 0]; // 4명 중 2명만 성적 보유
const oldWay = grades.reduce((s, g) => s + g, 0) / grades.length;
const graded = grades.filter(g => g > 0);
const newWay = graded.reduce((s, g) => s + g, 0) / graded.length;
ok(Math.abs(oldWay - 1.25) < 1e-9, '구 계산은 1.25 — 실제보다 좋게(작게) 보였다');
ok(formatGrade(newWay) === '2.50', '성적 보유자만으로 계산하면 2.50');
ok(isPartialAverage(graded.length, grades.length), '그리고 부분 평균으로 표시된다');

console.log(`\n총 ${pass}건 통과`);
