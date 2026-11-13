/**
 * 우측 패널 "모의고사 요약" 회차 선택 검증 하니스.
 * 실행: npx tsx scripts/admission-wishlist-test/run-mock-summary.mts
 *
 * 고치는 버그: 회차 목록에 학년이 없어(RPC 가 exam_grade 를 싣지 않는다) 월만으로 6·9월을
 * 고르면 **다른 학년의 6·9월이 섞였다**. 라이브(2026-09-03) 재학 3학년 217명 중 2026-09
 * 마킹 보유는 172명이라 45명에게 2025-09(2학년 9월)가 "9월"로 붙어 있었다.
 */
import {
  pickMockSummaryRounds,
  type SummaryRoundInput,
} from '../../src/features/admission-wishlist/utils/mockSummary';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}  ${detail}`);
  }
}

const r = (academicYear: number, examMonth: number, isReference = false): SummaryRoundInput => ({
  academicYear,
  examMonth,
  isReference,
});

/** 결과를 "연도-월" 문자열로 (비교용) */
const ids = (picked: ReturnType<typeof pickMockSummaryRounds>) => picked.map((p) => p.key).join(' , ');

console.log('── 1) 3학년 6·9월이 모두 있는 학생 (2026-09 마킹 보유 172명) ──');
{
  const rounds = [r(2026, 9, true), r(2026, 7), r(2026, 6), r(2026, 5), r(2026, 3), r(2025, 9), r(2025, 6)];
  const got = pickMockSummaryRounds(rounds, 2026);
  check('6월 → 9월 시간 순 두 회차', ids(got) === '2026-6 , 2026-9', ids(got));
  check('라벨은 "6월"·"9월"', got.map((g) => g.label).join(',') === '6월,9월', got.map((g) => g.label).join(','));
  check('같은 학년도라 연도 표기 없음', got.every((g) => g.yearNote === null));
  check('둘 다 평가원으로 표시', got.every((g) => g.isPyeonggawon));
  check('9월은 참고 등급 회차', got[1].round.isReference === true);
}

console.log('\n── 2) 3학년 9월이 아직 없는 학생 (라이브 45명) — 핵심 회귀 ──');
{
  const rounds = [r(2026, 7), r(2026, 6), r(2026, 5), r(2026, 3), r(2025, 9), r(2025, 6), r(2024, 9)];
  const got = pickMockSummaryRounds(rounds, 2026);
  check('2025-09(2학년 9월)를 끌어오지 않는다', !got.some((g) => g.key === '2025-9'), ids(got));
  check('3학년 6월 + 가장 최근(7월)', ids(got) === '2026-6 , 2026-7', ids(got));
  check('대체 회차는 평가원 아님', got.map((g) => g.isPyeonggawon).join(',') === 'true,false');
  check('같은 학년도라 연도 표기 없음', got.every((g) => g.yearNote === null));
}

console.log('\n── 3) 대상 학년도 평가원이 하나도 없음 → 최근 두 회차 ──');
{
  const rounds = [r(2026, 5), r(2026, 3), r(2025, 9), r(2025, 6)];
  const got = pickMockSummaryRounds(rounds, 2026);
  check('2025-09/06 을 6·9월 자리로 쓰지 않는다', !got.some((g) => g.key.startsWith('2025')), ids(got));
  check('최근 두 회차(3월·5월)', ids(got) === '2026-3 , 2026-5', ids(got));
}

console.log('\n── 4) 그 해 회차가 아예 없는 학생 → 이전 학년도 회차 + 연도 표기 ──');
{
  const rounds = [r(2025, 9), r(2025, 6), r(2025, 3)];
  const got = pickMockSummaryRounds(rounds, 2026);
  check('최근 두 회차', ids(got) === '2025-6 , 2025-9', ids(got));
  check('연도를 밝힌다(어느 학년 9월인지 구분)', got.every((g) => g.yearNote === '2025'), JSON.stringify(got.map((g) => g.yearNote)));
  check('평가원 플래그는 끈다(대상 학년도가 아니다)', got.every((g) => !g.isPyeonggawon));
}

console.log('\n── 5) 6월만 있고 나머지가 전부 이전 학년도 ──');
{
  const rounds = [r(2026, 6), r(2025, 9), r(2025, 6)];
  const got = pickMockSummaryRounds(rounds, 2026);
  check('3학년 6월 + 최근 남은 회차(2025-09)', ids(got) === '2025-9 , 2026-6', ids(got));
  check('2025-09 에만 연도 표기', got.map((g) => g.yearNote ?? '-').join(',') === '2025,-', got.map((g) => g.yearNote ?? '-').join(','));
  check('같은 "9월"이라도 key 가 겹치지 않는다', new Set(got.map((g) => g.key)).size === got.length);
}

console.log('\n── 6) 학사력 미설정(targetYear=null) → 데이터 최신 학년도로 대체 ──');
{
  const rounds = [r(2026, 7), r(2026, 6), r(2025, 9)];
  const got = pickMockSummaryRounds(rounds, null);
  check('최신 학년도(2026)의 6월을 기준으로', got.some((g) => g.key === '2026-6'), ids(got));
  check('2025-09 를 9월 자리로 쓰지 않는다', !got.some((g) => g.key === '2025-9'), ids(got));
  check('연도 표기 없음(기준=2026)', got.every((g) => g.yearNote === null));
}

console.log('\n── 7) 경계 ──');
{
  check('빈 목록 → 빈 결과', pickMockSummaryRounds([], 2026).length === 0);
  const one = pickMockSummaryRounds([r(2026, 6)], 2026);
  check('회차 1개 → 1행', one.length === 1 && one[0].key === '2026-6');
  const dup = pickMockSummaryRounds([r(2026, 9), r(2026, 6)], 2026);
  check('입력이 역순이어도 시간 순', ids(dup) === '2026-6 , 2026-9', ids(dup));
  const missing = pickMockSummaryRounds([{ academicYear: null, examMonth: null }], 2026);
  check('연도·월이 null 이어도 죽지 않는다', missing.length === 1 && missing[0].label === '–', JSON.stringify(missing[0]));
  const three = pickMockSummaryRounds([r(2026, 9), r(2026, 7), r(2026, 6), r(2026, 5)], 2026);
  check('항상 최대 2행', three.length === 2 && ids(three) === '2026-6 , 2026-9', ids(three));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
