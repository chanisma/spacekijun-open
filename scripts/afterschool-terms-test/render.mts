/**
 * 방과후 학년별 목록 렌더 회귀
 *
 * 실행: npx tsx --tsconfig tsconfig.app.json scripts/afterschool-terms-test/render.mts
 *
 * `--tsconfig` 가 필요한 이유: 루트 `tsconfig.json` 은 references 만 있는 solution 파일이라
 * tsx 가 그 `jsx` 옵션을 적용하지 않는다. 빠뜨리면 `.tsx` import 가 `React is not defined`
 * 로 죽는다. (순수 로직만 보는 `run.mts` 는 플래그가 필요 없다.)
 *
 * `run.mts` 가 묶는 규칙을 본다면 여기는 **실제로 화면에 나오는지**를 본다 — 그룹 머리글이
 * 빠지거나 복사 접미사가 그대로 새어 나와도 로직 테스트는 통과한다.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AfterschoolTermList } from '../../src/features/student-dashboard/components/AfterschoolTermList';
import type { AfterschoolEnrollmentLike } from '../../src/features/student-dashboard/utils/afterschoolTerms';

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

let seq = 0;
const row = (
  studentId: string | null,
  studentNumber: string,
  cateId: number,
  courseName: string,
): AfterschoolEnrollmentLike => ({
  id: `r${(seq += 1)}`,
  student_id: studentId,
  student_number: studentNumber,
  cate_id: cateId,
  course_name: courseName,
});

const render = (enrollments: AfterschoolEnrollmentLike[] | undefined, isLoading = false) =>
  renderToStaticMarkup(h(AfterschoolTermList as never, { enrollments, isLoading }));

// 라이브 형태: 00-00493 (2025학년도 1학년 → 2026학년도 2학년)
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
  row('00-00493', '10224', 44, '순공(약점보완 수학CD)'),
  row('00-00493', '20320', 47, '주토피아 문학 기출문제 풀이'),
  row('00-00493', '20320', 50, '주토피아 문법 개념 정리편'),
];

const html = render(live);

check('2026학년도 · 2학년 머리글이 그려진다', html.includes('2026학년도 · 2학년'));
check('2025학년도 · 1학년 머리글이 그려진다', html.includes('2025학년도 · 1학년'));
check('최신 학년이 먼저 나온다', html.indexOf('2026학년도') < html.indexOf('2025학년도'));
check('학년 원판에 2와 1이 있다', html.includes('>2</div>') && html.includes('>1</div>'));

check('강좌명이 실제로 그려진다', html.includes('주토피아 문법 개념 정리편'));
check('복사 접미사가 화면에 새어 나오지 않는다', !html.includes('복사'));
check('재수강 3회 배지가 보인다', html.includes('>3회</span>'));
check('1회짜리는 배지를 달지 않는다', !html.includes('>1회<'));

check('그룹별 과목수가 나온다', html.includes('6과목') && html.includes('2과목'),
  '1학년 6과목 / 2학년 2과목');
check('총합이 목록과 같은 기준(8개)', html.includes('>8개<'));

// 빈 상태 / 로딩 상태
const empty = render([]);
check('빈 목록은 안내 문구', empty.includes('등록된 방과후 수강 내역이 없습니다'));
check('빈 목록에 요약을 그리지 않는다', !empty.includes('총 수강 과목'));
check('undefined 도 빈 상태로', render(undefined).includes('등록된 방과후 수강 내역이 없습니다'));
check('로딩 중에는 안내 문구 대신 스피너', !render(undefined, true).includes('등록된 방과후'));

// 납부 표시는 되살아나지 않는다 (is_paid 가 라이브 전 행 false 라 전교생 미납으로 보였다)
check('납부 문구를 그리지 않는다', !html.includes('미납') && !html.includes('납부'));

// 유도 실패분
const unknown = render([row(null, '10224', 31, '이름 모를 강좌')]);
check('학년 미상도 화면에 남는다', unknown.includes('학년 미상') && unknown.includes('이름 모를 강좌'));

// 긴 강좌명이 잘리지 않고 접힌다 (truncate 가 아니라 break-words)
const longName = render([
  row('00-00493', '20320', 53, '[3등급 목표, 4,5등급 대상]미: 미분하면 돼요? /적: 적분도 해요...? /분: 분수나오는데 맞...'),
]);
check('긴 강좌명은 접어서 전부 보여준다', longName.includes('break-words'));
check('긴 강좌명이 잘리지 않는다', longName.includes('/분: 분수나오는데 맞...'));

if (failures.length) {
  for (const f of failures) console.log(`FAIL  ${f}`);
}
console.log(`${passed} passed, ${failures.length} failed`);
console.log(failures.length === 0 ? 'OK' : 'FAILED');
process.exit(failures.length === 0 ? 0 : 1);
