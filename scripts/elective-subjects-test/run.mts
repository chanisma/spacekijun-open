/**
 * 진로선택과목 인기·조합 필터 회귀 — `npx tsx scripts/elective-subjects-test/run.mts`
 *
 * 이 필터가 조용히 풀리면 오류가 아니라 **상위권이 통째로 예체능으로 바뀐다**.
 * 라이브 2026년 3학년(217명) 실측 분포를 그대로 넣어 못 박는다.
 */
import {
  isArtsOrPeGroup, isForeignLanguage, isElectiveSignalSubject, filterElectiveSubjects,
  UNIVERSAL_SUBJECT_RATIO, MIN_COHORT_FOR_RATIO,
  type ElectiveSubjectEntry,
} from '../../src/features/student-dashboard/utils/electiveSubjects';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

const MIXED_GROUP = '기술・가정/제2외국어/한문/교양';

// ── 교과군 판정 ──────────────────────────────────────────────────────────
check('예술은 예체능', isArtsOrPeGroup('예술'));
check('체육은 예체능', isArtsOrPeGroup('체육'));
check('과학은 예체능이 아니다', !isArtsOrPeGroup('과학'));
check('교과군이 비어도 안전', !isArtsOrPeGroup(null) && !isArtsOrPeGroup(undefined));

// ── 외국어 판정 ──────────────────────────────────────────────────────────
check('영어 교과군은 전부 외국어', isForeignLanguage('영어', '심화 영어Ⅰ'));
check('중국어Ⅱ는 외국어', isForeignLanguage(MIXED_GROUP, '중국어Ⅱ'));
check('일본어Ⅱ는 외국어', isForeignLanguage(MIXED_GROUP, '일본어Ⅱ'));
// 같은 교과군에 섞여 있어 교과군만으로는 못 가른다 — 이름으로 갈라야 한다
check('인공지능 기초는 외국어가 아니다', !isForeignLanguage(MIXED_GROUP, '인공지능 기초'));
check('가정과학은 외국어가 아니다', !isForeignLanguage(MIXED_GROUP, '가정과학'));
check('한문Ⅱ는 외국어가 아니다(남긴다)', !isForeignLanguage(MIXED_GROUP, '한문Ⅱ'));

// ── 선택 신호 종합 ───────────────────────────────────────────────────────
check('음악 연주는 선택 신호가 아니다', !isElectiveSignalSubject('예술', '음악 연주'));
check('경제 수학은 선택 신호', isElectiveSignalSubject('수학', '경제 수학'));

// ── 라이브 분포(2026 3학년, career 코호트 217명) ─────────────────────────
const COHORT = 217;
const live: ElectiveSubjectEntry[] = [
  { subject: '스포츠 생활', subjectGroup: '체육', count: 216 },
  { subject: '미술 창작', subjectGroup: '예술', count: 216 },
  { subject: '음악 연주', subjectGroup: '예술', count: 216 },
  { subject: '인공지능 기초', subjectGroup: MIXED_GROUP, count: 216 },
  { subject: '체육 탐구', subjectGroup: '체육', count: 205 },
  { subject: '경제 수학', subjectGroup: '수학', count: 121 },
  { subject: '미술 감상과 비평', subjectGroup: '예술', count: 112 },
  { subject: '음악사', subjectGroup: '예술', count: 105 },
  { subject: '사회문제 탐구', subjectGroup: '사회(역사/도덕포함)', count: 78 },
  { subject: '생활과 과학', subjectGroup: '과학', count: 69 },
  { subject: '가정과학', subjectGroup: MIXED_GROUP, count: 67 },
  { subject: '생명과학Ⅱ', subjectGroup: '과학', count: 67 },
  { subject: '중국어Ⅱ', subjectGroup: MIXED_GROUP, count: 58 },
  { subject: '고전과 윤리', subjectGroup: '사회(역사/도덕포함)', count: 53 },
  { subject: '고전 읽기', subjectGroup: '국어', count: 52 },
  { subject: '기하', subjectGroup: '수학', count: 47 },
  { subject: '일본어Ⅱ', subjectGroup: MIXED_GROUP, count: 41 },
  { subject: '한문Ⅱ', subjectGroup: MIXED_GROUP, count: 40 },
  { subject: '심화 영어 독해Ⅰ', subjectGroup: '영어', count: 33 },
];

const kept = filterElectiveSubjects(live, COHORT);
const names = kept.map((e) => e.subject);
const top = [...kept].sort((a, b) => b.count - a.count).map((e) => e.subject);

check('1위가 경제 수학으로 바뀐다', top[0] === '경제 수학', top[0]);
check('상위 5개가 실제 선택 과목', JSON.stringify(top.slice(0, 5)) ===
  JSON.stringify(['경제 수학', '사회문제 탐구', '생활과 과학', '가정과학', '생명과학Ⅱ']), top.slice(0, 5).join(','));
check('예체능이 하나도 남지 않는다',
  !names.some((n) => ['스포츠 생활', '미술 창작', '음악 연주', '체육 탐구', '미술 감상과 비평', '음악사'].includes(n)));
check('전원 수강(인공지능 기초 99.5%)이 빠진다', !names.includes('인공지능 기초'));
check('외국어가 빠진다', !names.includes('중국어Ⅱ') && !names.includes('일본어Ⅱ') && !names.includes('심화 영어 독해Ⅰ'));
check('한문Ⅱ는 남는다', names.includes('한문Ⅱ'));
check('55.8%인 경제 수학은 전원 수강이 아니다', names.includes('경제 수학'));

// ── 비율 경계 ───────────────────────────────────────────────────────────
const at = filterElectiveSubjects([{ subject: 'A', subjectGroup: '과학', count: 90 }], 100);
check(`정확히 ${UNIVERSAL_SUBJECT_RATIO * 100}%면 제외`, at.length === 0);
const under = filterElectiveSubjects([{ subject: 'A', subjectGroup: '과학', count: 89 }], 100);
check('경계 아래면 남는다', under.length === 1);

// ── 소표본에서는 비율 판정을 하지 않는다 ─────────────────────────────────
const small = filterElectiveSubjects([{ subject: 'A', subjectGroup: '과학', count: 5 }], MIN_COHORT_FOR_RATIO - 1);
check('소표본에서는 전원 수강 규칙을 적용하지 않는다', small.length === 1);
const smallArts = filterElectiveSubjects([{ subject: '음악사', subjectGroup: '예술', count: 5 }], 3);
check('소표본에서도 예체능은 여전히 제외', smallArts.length === 0);

// ── 안전 ────────────────────────────────────────────────────────────────
check('빈 목록도 안전', filterElectiveSubjects([], 0).length === 0);
const before = JSON.stringify(live);
filterElectiveSubjects(live, COHORT);
check('입력 배열을 변형하지 않는다', JSON.stringify(live) === before);

console.log(`${pass} passed, ${fail} failed`);
console.log(fail === 0 ? 'OK' : 'FAILED');
process.exit(fail === 0 ? 0 : 1);
