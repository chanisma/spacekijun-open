/**
 * 9월 = 공식 성적 우선, 없는 과목만 참고 등급 (2026-09-30)
 *
 * 참고 등급 서비스는 공식 등급이 있는 과목을 계산도 반환도 하지 않는다. 그래서 9월을 참고 등급
 * Map 으로만 읽는 AI 성적예측 화면은 공식 성적이 적재되는 순간 9월 칸이 비고 수능 예상이 6월만으로
 * 계산됐다 — 오류가 없어 정적 검사가 유일한 방어선이다.
 *
 * 실행: npx tsx --tsconfig tsconfig.app.json scripts/sept-official-test/run.mts
 */
import fs from 'node:fs';
import { withOfficialGrades, coreGradesFromReference, corePercentilesFromReference } from '../../src/features/student-dashboard/utils/analysisUtils';
import { buildSuneungForecast } from '../../src/features/evalearn/utils/suneungForecast';
import type { ReferenceGrade } from '../../src/features/evalearn/utils/referenceGrade';

let pass = 0, fail = 0;
const ok = (cond: unknown, msg: string) => { if (cond) pass++; else { fail++; console.error('✗', msg); } };

const ref = (grade: number, percentile: number | null): ReferenceGrade =>
  ({ grade, rawScore: 40, maxScore: 50, source: 'EBS', isAbsolute: false, vsNationalMean: null, percentile });

// ① 공식이 이기고, 공식에 없는 과목만 참고가 남는다
{
  const reference = new Map<string, ReferenceGrade>([['사회문화', ref(5, 40)], ['생명과학Ⅰ', ref(3, 80)]]);
  const official = {
    화법과작문: { grade: 2, raw_score: 88, percentile: 93 },
    영어: { grade: 1, raw_score: 92, percentile: null },
    '사회·문화': { grade: 4, raw_score: 34, percentile: 67 },
    한국사: { grade: 3, raw_score: 38, percentile: 0 },
  };
  const { grades, officialCount } = withOfficialGrades(reference, official);
  ok(officialCount === 4, `공식 과목 수 4 (${officialCount})`);
  ok(grades.get('사회·문화')?.grade === 4 && grades.get('사회·문화')?.source === 'official', '공식 사회·문화가 이긴다');
  ok(!grades.has('사회문화'), '표기가 다른 같은 과목(사회문화)의 참고 등급은 버린다 — 두 번 세지 않는다');
  ok(grades.get('생명과학Ⅰ')?.source === 'EBS', '공식에 없는 과목은 참고 등급이 남는다');
  ok(grades.get('영어')?.percentile === null && grades.get('영어')?.isAbsolute, '영어는 절대평가 — 백분위 없음');
  ok(grades.get('한국사')?.percentile === null, '한국사 백분위 0 은 결측');
  ok(grades.get('화법과작문')?.percentile === 93, '국어 백분위는 공식 값');
  const core = coreGradesFromReference(grades);
  ok(core.korean === 2 && core.english === 1, `계열 등급이 공식에서 온다 (${JSON.stringify(core)})`);
  ok(corePercentilesFromReference(grades).korean === 93, '계열 백분위도 공식');
}

// ② 결측 규약 — 등급 0(미응시)·빈 과목은 공식으로 치지 않는다
{
  const { grades, officialCount } = withOfficialGrades(
    new Map([['영어', ref(3, null)]]),
    { 영어: { grade: 0, raw_score: 0, percentile: 0 }, 국어: null },
  );
  ok(officialCount === 0, '등급 0 은 공식 과목이 아니다');
  ok(grades.get('영어')?.source === 'EBS', '미응시 공식 칸이 참고 등급을 지우지 않는다');
}

// ③ 공식이 없으면 참고 등급 그대로(종전 동작)
{
  const reference = new Map([['영어', ref(2, null)]]);
  const { grades, officialCount } = withOfficialGrades(reference, undefined);
  ok(officialCount === 0 && grades.get('영어') === reference.get('영어'), '공식 없음 → 참고 등급 그대로');
  ok(withOfficialGrades(undefined, undefined).grades.size === 0, '둘 다 없으면 빈 Map');
}

// ④ 수능 예상이 공식 9월을 쓴다(종전엔 공식이 적재되면 6월만으로 계산됐다)
{
  const { grades } = withOfficialGrades(undefined, { 화법과작문: { grade: 2, raw_score: 88, percentile: 93 } });
  const f = buildSuneungForecast(grades, { 화법과작문: { grade: 3, percentile: 80 } });
  const ko = f.subjects.find((x) => x.area === '국어');
  ok(ko?.september?.percentile === 93, `수능 예상의 9월 입력이 공식 백분위 (${ko?.september?.percentile})`);
  ok(ko?.basis === 'blend', `6·9월을 섞는다 (${ko?.basis})`);
}

// ⑤ 정적 — 화면이 참고 등급 Map 을 9월 성적으로 직접 읽지 않는다
{
  const src = fs.readFileSync('src/features/student-dashboard/components/analysis/GradePredictionAnalysis.tsx', 'utf8');
  ok(!/coreGradesFromReference\(septReference/.test(src), '계열 등급을 septReference 에서 직접 뽑지 않는다');
  ok(!/corePercentilesFromReference\(septReference/.test(src), '계열 백분위를 septReference 에서 직접 뽑지 않는다');
  ok(!/buildSuneungForecast\(septReference/.test(src), '수능 예상에 septReference 를 직접 넘기지 않는다');
  ok(!/september:\s*septReference/.test(src), '전 회차 모드 코호트에 septReference 를 직접 넘기지 않는다');
  ok(/withOfficialGrades\(septReference/.test(src), '공식 성적을 얹는 경로가 있다');
  // 원본 성적표를 직접 읽는 표는 예외 — 거기에 공식을 또 얹으면 9월이 두 번 그려진다
  ok(/buildMockExamTable\([\s\S]{0,120}septReference\.get/.test(src), 'buildMockExamTable 은 참고 등급만 받는다');
  ok(/mockIsReference:[^\n]*officialIds/.test(src), '학생 표의 추정 표시가 공식 성적 학생을 제외한다');
}

console.log(`9월 공식 성적 우선 — 통과 ${pass} / 실패 ${fail}`);
if (fail) process.exit(1);
