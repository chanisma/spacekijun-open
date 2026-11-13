/**
 * 보강 계획서 ↔ 결재 payload 라운드트립 회귀 테스트
 *
 * 실행: npx tsx scripts/swap-document-payload-test/run.mts
 *
 * 검증 목적
 *  1) **결강 사유는 payload에 라벨로, 문서 채움기에는 인덱스로** 들어간다. 이 변환이 틀어지면
 *     인쇄물의 ○가 엉뚱한 칸에 찍히는데, 화면(미리보기는 라벨을 그대로 보여줌)에서는 멀쩡해
 *     보인다 — 눈으로 못 잡는 종류의 버그라 테스트가 유일한 방어선이다.
 *  2) `ABSENCE_REASONS` 순서가 곧 양식의 열 순서다. 재배열하면 **이미 저장된** 결재의 사유가
 *     통째로 어긋나므로, 순서 자체를 고정 값으로 못 박는다.
 *  3) 저장된 payload(스냅샷)를 다시 문서로 만들 수 있는가 — 결재 문서 탭의 출력이 이 경로다.
 */
import {
  ABSENCE_REASONS,
  buildSwapDocumentPayload,
  parseSwapDocumentPayload,
} from '../../src/lib/swapDocumentPayload';
import type { LessonFillInput } from '../../src/components/toolbox/hwpx/lessonExchangeFormFill';

let passed = 0;
const failures: string[] = [];
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name: string, actual: unknown, expected: unknown) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `실제=${JSON.stringify(actual)}`);

const row = (over: Partial<Record<string, string>> = {}) => ({
  grade: '1-1',
  absenceDate: '7/16',
  absenceDay: '목',
  absencePeriod: '7',
  absenceSubject: '정보',
  swapType: '교체',
  makeupSubject: '한국사1',
  makeupTeacher: '임이안',
  makeupDate: '7/16',
  makeupDay: '목',
  makeupPeriod: '5',
  makeupLocation: '',
  ...over,
});

// ───────────────────────────── 1) 사유 순서는 계약이다
eq('ABSENCE_REASONS 순서 고정', [...ABSENCE_REASONS], [
  '공가',
  '조퇴',
  '오전출장',
  '오후출장',
  '연가',
  '특별휴가',
  '병가',
  '오전외출',
  '오후외출',
]);
check('사유는 9개(양식 ○ 칸 수)', ABSENCE_REASONS.length === 9, `${ABSENCE_REASONS.length}개`);

// ───────────────────────────── 2) 라벨 ↔ 인덱스 대응
for (let i = 0; i < ABSENCE_REASONS.length; i += 1) {
  const payload = { teacherName: '', subject: '', reasonLabels: [ABSENCE_REASONS[i]], rows: [] };
  const parsed = parseSwapDocumentPayload(payload);
  check(`'${ABSENCE_REASONS[i]}' → 인덱스 ${i}`, parsed?.reasons[0] === i, `실제=${parsed?.reasons[0]}`);
}

// ───────────────────────────── 3) 라운드트립 (build → parse)
const input: LessonFillInput = {
  teacherName: '권민결',
  subject: '정보',
  reasons: [0, 4, 6],
  rows: [row(), row({ grade: '2-3', swapType: '대체', makeupLocation: '과학실' })],
};
const payload = buildSwapDocumentPayload(input);
eq('build: 인덱스 → 라벨', payload.reasonLabels, ['공가', '연가', '병가']);
eq('라운드트립 동일', parseSwapDocumentPayload(payload), input);

// ───────────────────────────── 4) 지저분한 입력
check('payload 아님 → null', parseSwapDocumentPayload(null) === null);
check('문자열 → null', parseSwapDocumentPayload('x') === null);
check('rows 없음 → null', parseSwapDocumentPayload({ teacherName: 'a' }) === null);
check(
  'rows가 배열 아님 → null',
  parseSwapDocumentPayload({ rows: { grade: '1-1' } }) === null,
);

const messy = parseSwapDocumentPayload({
  teacherName: '권민결',
  subject: '정보',
  reasonLabels: ['공가', '없는사유', '공가', '연가'],
  rows: [{ grade: 1, absencePeriod: 7 }],
});
eq('모르는 사유는 버리고 중복 제거', messy?.reasons, [0, 4]);
eq(
  '빠진 칸은 빈 문자열, 숫자는 문자열로',
  messy?.rows[0],
  row({
    grade: '1',
    absenceDate: '',
    absenceDay: '',
    absencePeriod: '7',
    absenceSubject: '',
    swapType: '',
    makeupSubject: '',
    makeupTeacher: '',
    makeupDate: '',
    makeupDay: '',
    makeupPeriod: '',
  }),
);
eq('빈 사유 목록도 정상', parseSwapDocumentPayload({ rows: [], reasonLabels: [] })?.reasons, []);

// ───────────────────────────── 5) 라이브 스냅샷 (실제 저장된 결재 payload 모양)
const live = {
  rows: [
    {
      grade: '1-1',
      swapType: '교체',
      makeupDay: '목',
      absenceDay: '목',
      makeupDate: '7/16',
      absenceDate: '7/16',
      makeupPeriod: '5',
      absencePeriod: '7',
      makeupSubject: '한국사1',
      makeupTeacher: '임이안',
      absenceSubject: '정보',
      makeupLocation: '',
    },
  ],
  subject: '정보',
  teacherName: '권민결',
  reasonLabels: [] as string[],
};
const liveParsed = parseSwapDocumentPayload(live);
check('라이브 payload 파싱됨', liveParsed !== null);
eq('라이브: 교사명', liveParsed?.teacherName, '권민결');
eq('라이브: 행 1개, 키 순서 무관', liveParsed?.rows, [row()]);

// ───────────────────────────── 결과
console.log(`\n통과 ${passed}건, 실패 ${failures.length}건`);
if (failures.length > 0) {
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log('✓ 보강 계획서 payload 라운드트립 정상');
