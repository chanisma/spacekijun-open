// course-analyze 예상등급 회귀 — 순위 폴백·교과 세분·등급 미산출 교과 (2026-08-25)
// 실행: npx tsx scripts/course-estimated-grade-test/run.mts
//
// 배경: 전과목 1등급인 학생(00-00750)의 한문·언어생활과 한자·생태와 환경 예상등급이
// 3등급으로 나오던 결함. 원인은 순위 비교자가 "교과군 등급 보유자를 무조건 앞"에 두어
// 그 교과군을 아직 이수하지 않은 학생을 성적과 무관하게 뒤로 밀어낸 것이었다.
import {
  compareByRankingGrade,
  effectiveRankingGrade,
  estimatedGradeFromRank,
  getEstimateExcludeReason,
  type RankingGrades,
} from '../../src/features/course-analyze/utils/estimatedGrade';
import {
  DEFAULT_SUBJECT_CATEGORIES,
  ETC_SUBCATEGORIES,
  NO_RANK_CATEGORIES,
  findSubjectCategory,
  getCategoryDisplayOrder,
  isRankedCategory,
} from '../../src/features/course-analyze/utils/subjectUtils';
import {
  subjectGroupToCategory,
  toDbGradeCategory,
} from '../../src/features/course-analyze/utils/gradeMapping';
import { GRADE_CUTOFFS_5, GRADE_CUTOFFS_9 } from '../../src/features/course-analyze/utils/gradeScale';
import {
  getGradeBands,
  gradeBandIndex,
} from '../../src/features/course-analyze/utils/gradeBands';

let pass = 0;
function ok(cond: boolean, name: string) {
  if (!cond) { console.error('  ✗', name); process.exit(1); }
  console.log('  ✓', name); pass++;
}
const g = (categoryGrade: number, overallGrade: number): RankingGrades => ({ categoryGrade, overallGrade });

// ─────────────────────────────────────────── 1. 유효 등급 폴백
console.log('\n[1] 유효 등급 폴백');
ok(effectiveRankingGrade(g(2, 4.5)) === 2, '교과군 등급이 있으면 그것을 쓴다');
ok(effectiveRankingGrade(g(0, 1.0)) === 1.0, '교과군 등급이 없으면 전체 평균으로 폴백');
ok(effectiveRankingGrade(g(0, 0)) === 0, '둘 다 없으면 0(미상)');

// ─────────────────────────────────────────── 2. 비교자 — 원래 버그
console.log('\n[2] 순위 비교자');
// 라이브 재현: 강은호(정보 미이수, 전과목 1등급) vs 정보 5등급·전체평균 4.75 학생
ok(compareByRankingGrade(g(0, 1.0), g(5, 4.75)) < 0,
  '교과군 등급이 없어도 성적이 우수하면 앞선다 (구 구현은 뒤로 밀었음)');
ok(compareByRankingGrade(g(5, 4.75), g(0, 1.0)) > 0, '반대 방향도 대칭');
ok(compareByRankingGrade(g(1, 1.46), g(0, 1.0)) > 0,
  '교과군 1등급(전체 1.46)보다 폴백 1.00이 앞선다');
ok(compareByRankingGrade(g(2, 3.0), g(0, 3.0)) < 0,
  '유효 등급이 다르면 교과군 값이 그대로 반영된다');
ok(compareByRankingGrade(g(3, 2.0), g(0, 3.0)) < 0, '유효 등급 오름차순(낮을수록 우수)');
ok(compareByRankingGrade(g(0, 0), g(0, 5.0)) > 0, '등급 미상(0)은 맨 뒤로');
ok(compareByRankingGrade(g(0, 5.0), g(0, 0)) < 0, '등급 미상(0) 대칭');
ok(compareByRankingGrade(g(0, 0), g(0, 0)) === 0, '둘 다 미상이면 동점');
ok(compareByRankingGrade(g(2, 1.5), g(2, 2.5)) < 0, '유효 등급 동점이면 전체 평균으로 2차 비교');
ok(compareByRankingGrade(g(2, 2.0), g(2, 2.0)) === 0, '완전 동점은 0 (안정 정렬로 입력 순서 유지)');

// ─────────────────────────────────────────── 3. 라이브 한문 명단 재현
console.log('\n[3] 한문(1학기) 명단 재현 — 67명 중 31명만 정보 이수');
{
  // 정보 이수자 31명: 등급 1~5, 전체평균은 1.46~4.75로 대체로 나쁨 (라이브 분포 요약)
  const withInfo: RankingGrades[] = [
    g(1, 1.46), g(1, 1.71),
    g(2, 1.83), g(2, 2.0), g(2, 2.0), g(2, 2.04), g(2, 2.71), g(2, 2.71), g(2, 2.75), g(2, 2.88),
    g(3, 2.83), g(3, 2.88), g(3, 2.88), g(3, 3.0), g(3, 3.0), g(3, 3.29), g(3, 3.46), g(3, 3.58),
    g(3, 3.58), g(3, 3.71), g(3, 4.33),
    g(4, 2.83), g(4, 3.13), g(4, 3.75), g(4, 3.75), g(4, 3.75), g(4, 3.88), g(4, 4.0),
    g(5, 4.33), g(5, 4.42), g(5, 4.75),
  ];
  const target = g(0, 1.0);                       // 00-00750 강은호
  const others = [g(0, 1.0), g(0, 1.0), g(0, 1.0), g(0, 1.14)];
  // 나머지 정보 미이수자를 2.0~4.0으로 채워 총 67명
  const filler = Array.from({ length: 67 - withInfo.length - 1 - others.length },
    (_, i) => g(0, 2.0 + (i % 20) * 0.1));

  const roster = [...withInfo, target, ...others, ...filler];
  const sorted = [...roster].sort(compareByRankingGrade);
  const rank = sorted.indexOf(target) + 1;
  const total = roster.length;

  ok(total === 67, '명단 67명 구성');
  ok(rank <= 5, `강은호이 상위권으로 이동 (실제 순위 ${rank})`);
  ok(estimatedGradeFromRank(rank, total, GRADE_CUTOFFS_5) === 1,
    '예상등급 1등급 (구 구현은 34위 → 3등급)');
  // 구 구현 재현: 보유자 전원이 앞 → 32위 이하 → 3등급
  ok(estimatedGradeFromRank(withInfo.length + 1, total, GRADE_CUTOFFS_5) === 3,
    '구 구현이 내던 32위는 확실히 3등급이었음 (회귀 방지 기준선)');
}

// ─────────────────────────────────────────── 4. 컷오프
console.log('\n[4] 순위 → 예상등급 컷오프');
ok(estimatedGradeFromRank(7, 67, GRADE_CUTOFFS_5) === 1, '5등급제 67명: 7위=1등급 (round(6.7)=7)');
ok(estimatedGradeFromRank(8, 67, GRADE_CUTOFFS_5) === 2, '5등급제 67명: 8위=2등급');
ok(estimatedGradeFromRank(23, 67, GRADE_CUTOFFS_5) === 2, '5등급제 67명: 23위=2등급 (round(22.78)=23)');
ok(estimatedGradeFromRank(24, 67, GRADE_CUTOFFS_5) === 3, '5등급제 67명: 24위=3등급');
// 진로와 직업 80명 — 2등급 컷이 정확히 27위라 한 칸 차이로 뒤집히던 자리
ok(estimatedGradeFromRank(27, 80, GRADE_CUTOFFS_5) === 2, '5등급제 80명: 27위=2등급 (컷 경계)');
ok(estimatedGradeFromRank(28, 80, GRADE_CUTOFFS_5) === 3, '5등급제 80명: 28위=3등급');
ok(estimatedGradeFromRank(1, 100, GRADE_CUTOFFS_9) === 1, '9등급제 100명: 1위=1등급');
ok(estimatedGradeFromRank(100, 100, GRADE_CUTOFFS_9) === 9, '9등급제 100명: 꼴찌=9등급');
ok(estimatedGradeFromRank(1, 0, GRADE_CUTOFFS_5) === 0, '수강생 0명이면 0');

// ─────────────────────────────────────────── 5. 등급 미산출 교과(교양)
console.log('\n[5] 등급 미산출 교과');
ok(NO_RANK_CATEGORIES.has('교양'), '교양은 등급 미산출 카테고리');
ok(!isRankedCategory('교양'), 'isRankedCategory(교양) = false');
ok(isRankedCategory('외국어') && isRankedCategory('기술가정정보') && isRankedCategory('과학기타'),
  '나머지 세분 카테고리는 등급 산출 대상');
ok(isRankedCategory('국어') && isRankedCategory('기타'), '기존 카테고리는 영향 없음');
ok(getEstimateExcludeReason('교양', 160, 5) === 'noRank',
  '교양은 인원이 많아도 noRank (인원 미달로 표시하면 사실과 다르다)');
ok(getEstimateExcludeReason('외국어', 3, 5) === 'minStudents', '인원 미달은 minStudents');
ok(getEstimateExcludeReason('외국어', 67, 5) === null, '정상 과목은 미적용 사유 없음');
ok(getEstimateExcludeReason('교양', 3, 5) === 'noRank', '둘 다 해당하면 noRank가 우선');

// ─────────────────────────────────────────── 6. 교과 세분 분류
console.log('\n[6] 기타 카테고리 세분');
const cat = (s: string) => findSubjectCategory(s, DEFAULT_SUBJECT_CATEGORIES);
ok(ETC_SUBCATEGORIES.length === 4, '세분 카테고리 4종');
ok(cat('한문') === '외국어' && cat('언어생활과 한자') === '외국어', '한문 계열 → 외국어');
ok(cat('일본어') === '외국어' && cat('중국 문화') === '외국어', '제2외국어 → 외국어');
ok(cat('진로와 직업') === '교양' && cat('생태와 환경') === '교양', '진로와 직업·생태와 환경 → 교양');
ok(cat('교육의 이해') === '교양' && cat('보건') === '교양', '교육의 이해·보건 → 교양');
ok(cat('융합과학 탐구') === '과학기타' && cat('과학사') === '과학기타', '융합과학 탐구·과학사 → 과학기타');
// 편제표·생기부가 모두 기술·가정/정보로 기록하므로 이름과 달리 과학기타가 아니다
ok(cat('생활과학 탐구') === '기술가정정보', '생활과학 탐구 → 기술가정정보 (편제표 교과군 기준)');
ok(cat('프로그래밍') === '기술가정정보' && cat('기술·가정') === '기술가정정보', '정보·기술가정 계열');
ok(cat('기술가정') === '기술가정정보', '중점 표기 흔들림 흡수 (기술·가정 ≡ 기술가정)');
ok(cat('화학') === '화학' && cat('주제 탐구 독서') === '국어', '기존 분류는 그대로');
ok(cat('없는과목') === null, '미등록 과목은 null → 호출부에서 기타로 폴백');
{
  const order = getCategoryDisplayOrder();
  ok(order.length === 14, '표시 순서에 14개 카테고리');
  ok(order[order.length - 1] === '기타', '기타는 잔여 버킷이므로 마지막');
  ok(ETC_SUBCATEGORIES.every(c => order.includes(c)), '세분 카테고리가 전부 표시 순서에 포함');
  ok(Object.keys(DEFAULT_SUBJECT_CATEGORIES).every(c => order.includes(c)),
    '정의된 카테고리가 모두 표시 순서에 있다 (누락 시 화면에서 사라짐)');
}

// ─────────────────────────────────────────── 7. DB 교과군 매핑
console.log('\n[7] DB subject_group → 카테고리');
ok(subjectGroupToCategory('제2외국어/한문') === '외국어', '제2외국어/한문 → 외국어');
ok(subjectGroupToCategory('기술·가정/정보') === '기술가정정보', '기술·가정/정보 → 기술가정정보');
ok(subjectGroupToCategory('정보·통신') === '기술가정정보', '정보·통신 → 기술가정정보');
ok(subjectGroupToCategory('기술・가정/제2외국어/한문/교양') === '기술가정정보',
  '2015 복합 교과군 → 기술가정정보 (이 군에서 등급이 나오는 건 정보·기술가정뿐)');
ok(subjectGroupToCategory('교양') === '교양', '교양 → 교양');
ok(subjectGroupToCategory('체육') === '기타' && subjectGroupToCategory('예술') === '기타',
  '체육·예술은 성취도만 산출 → 잔여 버킷');
ok(subjectGroupToCategory('국어') === '국어' && subjectGroupToCategory('사회(역사/도덕포함)') === '사회',
  '기존 매핑 유지');
ok(subjectGroupToCategory('물리학') === '과학' && subjectGroupToCategory('생명과학') === '과학',
  '과학 세부 교과군은 과학으로 통합');
ok(subjectGroupToCategory('한국사') === '역사', '한국사 → 역사');

// ─────────────────────────────────────────── 6-b. 라이브 카탈로그 ETC 전수
// course_selectable_subject에서 category_code='ETC'로 저장된 26개 과목(2026-08-25 기준).
// DB는 세분 코드를 갖지 않으므로 이 이름 매칭이 실제 화면 분류를 결정한다.
console.log('\n[6-b] 라이브 ETC 카탈로그 전수 분류');
{
  const LIVE_ETC: Array<[string, string]> = [
    ['한문', '외국어'], ['한문Ⅱ', '외국어'], ['언어생활과 한자', '외국어'],
    ['일본어', '외국어'], ['일본어Ⅱ', '외국어'], ['일본 문화', '외국어'],
    ['중국어', '외국어'], ['중국어Ⅱ', '외국어'], ['중국 문화', '외국어'],
    ['과학사', '과학기타'], ['융합과학 탐구', '과학기타'], ['과학의 역사와 문화', '과학기타'],
    ['프로그래밍', '기술가정정보'], ['정보과제연구', '기술가정정보'],
    ['소프트웨어와 생활', '기술가정정보'], ['인공지능과 피지컬컴퓨팅', '기술가정정보'],
    ['생활과학 탐구', '기술가정정보'], ['가정과학', '기술가정정보'], ['아동발달과 부모', '기술가정정보'],
    ['보건', '교양'], ['교육학', '교양'], ['교육의 이해', '교양'],
    ['생태와 환경', '교양'], ['진로와 직업', '교양'],
    // 예술은 성취도(3단계)만 산출 → 세분 대상이 아니라 잔여 버킷에 남는다
    ['미술사', '기타'], ['음악사', '기타'],
  ];
  ok(LIVE_ETC.length === 26, '라이브 ETC 카탈로그 26과목');
  const wrong = LIVE_ETC.filter(([s, expected]) => cat(s) !== expected);
  ok(wrong.length === 0,
    `전 과목이 기대 카테고리로 분류됨${wrong.length ? ` (불일치: ${wrong.map(([s]) => s).join(', ')})` : ''}`);
  // 교양 5과목만 등급 미산출이어야 한다 — 여기가 늘어나면 예상등급이 조용히 사라진다
  const unranked = LIVE_ETC.filter(([s]) => !isRankedCategory(cat(s) ?? '기타')).map(([s]) => s);
  ok(unranked.length === 5, `등급 미산출은 교양 5과목뿐 (실제: ${unranked.join(', ')})`);
}

console.log('\n[8] 카테고리 → DB 등급 조회 키');
ok(toDbGradeCategory('과학기타') === '과학', '과학기타는 과학 등급으로 조회');
ok(['물리', '화학', '생명', '지구과학'].every(c => toDbGradeCategory(c) === '과학'),
  '과학 세부 카테고리 전부 과학으로 접힘');
ok(toDbGradeCategory('외국어') === '외국어', '외국어는 자기 키');
ok(toDbGradeCategory('기술가정정보') === '기술가정정보', '기술가정정보는 자기 키');
ok(toDbGradeCategory('국어') === '국어', '기존 카테고리 그대로');

// ─────────────────────────────────────────── 9. 등급 분포 구간 (정수/반올림 토글)
console.log('\n[9] 등급 분포 구간 기준');
{
  const lv = (g: number, max = 5) => gradeBandIndex(g, 'level', max);
  const rd = (g: number, max = 5) => gradeBandIndex(g, 'rounded', max);

  // 정수 등급 = 소수점 버림 (기존 동작 보존)
  ok(lv(1.0) === 0 && lv(1.99) === 0, '정수: 1.0~1.99 → 1등급 막대');
  ok(lv(2.0) === 1 && lv(2.99) === 1, '정수: 2.0~2.99 → 2등급 막대');
  ok(lv(5.0) === 4, '정수: 5.0 → 5등급 막대');

  // 반올림 등급 = 1~1.5 / 1.5~2.5 / … / 4.5~5
  ok(rd(1.0) === 0 && rd(1.49) === 0, '반올림: 1.0~1.49 → 1등급 막대');
  ok(rd(1.5) === 1, '반올림: 경계값 1.5는 위 구간(1.5~2.5)에 포함');
  ok(rd(2.49) === 1 && rd(2.5) === 2, '반올림: 2.49→2등급, 2.5→3등급');
  ok(rd(4.49) === 3 && rd(4.5) === 4, '반올림: 4.49→4등급, 4.5→5등급');
  ok(rd(5.0) === 4, '반올림: 5.0 → 5등급 막대');
  ok(rd(1.9) === 1 && rd(2.1) === 1,
    '반올림의 요점: 1.9와 2.1이 같은 막대에 들어간다');
  ok(lv(1.9) === 0 && lv(2.1) === 1, '정수 기준에서는 1.9와 2.1이 갈린다 (두 기준이 실제로 다름)');

  // 범위 밖 clamp (호출부가 0 이하를 걸러내지만 방어적으로 고정)
  ok(rd(0.4) === 0 && lv(0.4) === 0, '1 미만은 첫 막대로 clamp');
  ok(rd(9.9, 5) === 4 && lv(9.9, 5) === 4, '5등급제에서 상한 초과는 마지막 막대로 clamp');

  // 라벨
  const r5 = getGradeBands('rounded', 5).map(b => b.rangeLabel);
  ok(JSON.stringify(r5) === JSON.stringify(['1~1.5', '1.5~2.5', '2.5~3.5', '3.5~4.5', '4.5~5']),
    `5등급제 반올림 라벨 = ${r5.join(' / ')}`);
  const l5 = getGradeBands('level', 5).map(b => b.rangeLabel);
  ok(JSON.stringify(l5) === JSON.stringify(['1', '2', '3', '4', '5']), '5등급제 정수 라벨은 종전 그대로');
  const r9 = getGradeBands('rounded', 9);
  ok(r9.length === 9 && r9[0].rangeLabel === '1~1.5' && r9[8].rangeLabel === '8.5~9',
    '9등급제도 같은 규칙 (1~1.5 … 8.5~9)');
  ok(getGradeBands('level', 9).length === 9 && getGradeBands('rounded', 9).length === 9,
    '두 모드의 막대 개수가 같다 (색상표·범례 구조 재사용 전제)');
  ok(getGradeBands('rounded', 5).every(b => b.label === String(b.grade)),
    '막대 아래 짧은 라벨은 대표 등급 숫자 (9등급제에서 폭이 좁다)');

  // 분할 불변식 — 집계와 클릭 필터가 같은 함수를 쓰므로 이것만 지켜지면 어긋나지 않는다
  for (const mode of ['level', 'rounded'] as const) {
    const bands = getGradeBands(mode, 5);
    let prev = -1;
    let bad = '';
    for (let g = 1.0; g <= 5.0001; g += 0.01) {
      const v = Math.round(g * 100) / 100;
      const i = gradeBandIndex(v, mode, 5);
      if (i < 0 || i >= bands.length) { bad = `${v} → 범위 밖 ${i}`; break; }
      if (i < prev) { bad = `${v}에서 막대 인덱스가 되돌아감`; break; }
      const b = bands[i];
      if (v < b.min || (v > b.max && b.index !== bands.length - 1)) { bad = `${v}가 밴드 ${b.rangeLabel} 밖`; break; }
      prev = i;
    }
    ok(bad === '', `${mode}: 1.00~5.00 전 구간이 빠짐·겹침 없이 단조 분할${bad ? ` (${bad})` : ''}`);
  }
}

console.log(`\n✅ ${pass}건 통과`);
