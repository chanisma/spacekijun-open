/**
 * 과목별 내신 백분위 회귀 — `buildSubjectPercentiles`
 *
 * 파이프라인(`annotate_naesin_percentile`)과 **같은 값**이 나와야 한다. 어긋나면 오류가
 * 나는 게 아니라 같은 학생의 백분위가 화면마다 달라지므로, 규칙을 여기서 못 박는다.
 *
 * 특히 두 필터는 **없어도 값이 그럴듯해 보인다** — 그래서 반드시 테스트로 고정한다:
 *   ① 석차등급 없는 과목 제외(과학탐구실험: 만점자가 85%라 만점이 상위 42%)
 *   ② 전 학교 성적 제외(전입생: 공표 과목평균이 그 묶음의 최빈값과 다르다)
 */
import {
  buildSubjectPercentiles, NAESIN_PCT_MIN_GROUP,
  buildCompetitivenessScatter, gradeFromTopPct, gradeFromTopPctExact,
  buildCohortMockPercentile, COMPETITIVENESS_BIN,
} from '../../src/features/student-dashboard/utils/analysisUtils';

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass += 1; else { fail += 1; console.error(`✗ ${name}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); }
};
const close = (name: string, got: number | undefined, want: number, tol = 1e-9) => {
  const ok = got != null && Math.abs(got - want) < tol;
  if (ok) pass += 1; else { fail += 1; console.error(`✗ ${name}: got ${got} want ${want}`); }
};

const AVG = 70;   // 그 묶음의 공표 과목평균 (전 학교 판정의 기준)
const rec = (subject: string, score: number, extra: Record<string, unknown> = {}) => ({
  grade: 1, semester: 1, subject, subject_group: '수학', category: 'regular',
  rank: 3, units: 4, score, average: AVG, ...extra,
} as any);

/** n명 묶음: 점수 0..n-1, 그리고 대상 학생 한 명이 최고점(n) */
const cohortOf = (n: number, subject = '수학') =>
  Array.from({ length: n }, (_, i) => ({
    id: `25-1${String(i).padStart(4, '0')}`,
    academic_development: [rec(subject, i)],
  })).concat([{ id: '25-199', academic_development: [rec(subject, n)] }]);

{ // ① 단독 최고점 — 중간순위라 0% 가 아니다
  const m = buildSubjectPercentiles(cohortOf(40), '25-199');
  close('단독 최고점', m['1-1-수학']?.pct, (0.5 / 41) * 100);
  eq('인원수', m['1-1-수학']?.n, 41);
}
{ // ② 동점 중간순위
  const rows = [90, 90, 90, 80, 70].map((s, i) => ({ id: `25-1000${i}`, academic_development: [rec('수학', s)] }));
  const pad = Array.from({ length: 30 }, (_, i) => ({ id: `25-2${i}`, academic_development: [rec('수학', 60)] }));
  const m = buildSubjectPercentiles([...rows, ...pad], '25-10000');
  close('동점 중간순위', m['1-1-수학']?.pct, (1.5 / 35) * 100);   // n=35, higher=0, tied=3
}
{ // ③ 최하위 단독은 100% 가 **아니다** (정규분위수 변환의 -inf 사고 방지)
  const m = buildSubjectPercentiles(cohortOf(40), '25-10000');   // 점수 0 = 최하위 단독
  close('최하위 단독', m['1-1-수학']?.pct, ((40 + 0.5) / 41) * 100);
  eq('100% 아님', m['1-1-수학']!.pct < 100, true);
}
{ // ④ 묶음이 하한 미만이면 내지 않는다
  eq('소수 수강 제외',
    buildSubjectPercentiles(cohortOf(NAESIN_PCT_MIN_GROUP - 3), '25-199')['1-1-수학'], undefined);
}

// ── ① 석차등급 없는 과목 ────────────────────────────────────────────────
{ // ⑤ rank 없는 행은 **분자에도 분모에도** 들어가지 않는다
  const base = cohortOf(40);
  const noRank = [
    { id: '25-19998', academic_development: [rec('수학', 100, { rank: null })] },
    { id: '25-19997', academic_development: [rec('수학', 100, { rank: null })] },
  ];
  const m = buildSubjectPercentiles([...base, ...noRank], '25-199');
  eq('rank 없는 행은 분모에서도 빠진다', m['1-1-수학']?.n, 41);
  close('그래서 최고점 백분위가 변하지 않는다', m['1-1-수학']?.pct, (0.5 / 41) * 100);
}
{ // ⑥ 대상 학생 자신의 rank 가 없으면 그 과목은 값을 내지 않는다(과학탐구실험이 이 경우)
  const c = cohortOf(40).concat([{
    id: '25-1exp',
    academic_development: [rec('과학탐구실험', 100, { rank: null, subject_group: '과학' })],
  }]);
  eq('석차 없는 과목은 값 없음', buildSubjectPercentiles(c, '25-1exp')['1-1-과학탐구실험'], undefined);
}
{ // ⑦ 라이브 재현 — 만점자가 다수인 과목은 만점이어도 상위 42%. 그런 과목이 섞이면 안 된다.
  const many = Array.from({ length: 183 }, (_, i) => ({
    id: `25-3${i}`, academic_development: [rec('과학탐구실험', 100, { rank: null })],
  }));
  const rest = Array.from({ length: 33 }, (_, i) => ({
    id: `25-4${i}`, academic_development: [rec('과학탐구실험', 90, { rank: null })],
  }));
  const m = buildSubjectPercentiles([...many, ...rest], '25-30');
  eq('전원 rank 없으면 그 과목은 통째로 빠진다', Object.keys(m), []);
}

// ── ② 전입생(전 학교 성적) ──────────────────────────────────────────────
{ // ⑧ 공표 과목평균이 다른 행은 분모에서 빠진다
  const base = cohortOf(40);
  const transfer = { id: '25-1tr', academic_development: [rec('수학', 100, { average: 48.3, rank: 1 })] };
  const m = buildSubjectPercentiles([...base, transfer], '25-199');
  eq('전 학교 행은 분모에서 빠진다', m['1-1-수학']?.n, 41);
  close('그래서 우리 학생 백분위가 흔들리지 않는다', m['1-1-수학']?.pct, (0.5 / 41) * 100);
}
{ // ⑨ 전입생 본인도 값을 받지 않는다 — 다른 모집단의 점수라 순위가 뜻이 없다
  const base = cohortOf(40);
  const transfer = { id: '25-1tr', academic_development: [rec('수학', 75, { average: 48.3, rank: 1 })] };
  eq('전입생 본인도 값 없음',
    buildSubjectPercentiles([...base, transfer], '25-1tr')['1-1-수학'], undefined);
}
{ // ⑩ 평균이 없는 행은 판정할 수 없으므로 남긴다(25·26학번 일부)
  const base = cohortOf(40);
  const noAvg = { id: '25-1na', academic_development: [rec('수학', 100, { average: null })] };
  const m = buildSubjectPercentiles([...base, noAvg], '25-1na');
  eq('평균 없는 행은 남는다', m['1-1-수학']?.n, 42);
}
{ // ⑪ 아는 평균이 10개 미만이면 최빈값을 믿지 않는다(작은 묶음에서 오판 방지)
  const rows = Array.from({ length: 40 }, (_, i) => ({
    id: `25-5${i}`,
    academic_development: [rec('수학', i, { average: i < 5 ? AVG : null })],
  }));
  const odd = { id: '25-5odd', academic_development: [rec('수학', 100, { average: 12.3 })] };
  eq('표본 부족이면 판정하지 않는다',
    buildSubjectPercentiles([...rows, odd], '25-5odd')['1-1-수학']?.n, 41);
}

// ── 그 밖의 불변식 ──────────────────────────────────────────────────────
{ // ⑫ 코호트(입학연도)가 다르면 다른 묶음이다
  const a = cohortOf(40);
  const b = Array.from({ length: 40 }, (_, i) => ({ id: `24-1${i}`, academic_development: [rec('수학', 100)] }));
  const m = buildSubjectPercentiles([...a, ...b], '25-199');
  eq('코호트 분리', m['1-1-수학']?.n, 41);
  close('상위 코호트에 영향 없음', m['1-1-수학']?.pct, (0.5 / 41) * 100);
}
{ // ⑬ 대상 학생이 없는 묶음은 계산하지 않는다
  eq('대상 없으면 빈 결과', Object.keys(buildSubjectPercentiles(cohortOf(40), '없는학생')), []);
}
{ // ⑭ 진로선택(category!=='regular')은 원래 대상이 아니다
  const base = cohortOf(40);
  const career = { id: '25-1c', academic_development: [rec('수학', 100, { category: 'career' })] };
  const m = buildSubjectPercentiles([...base, career], '25-199');
  eq('진로선택 제외', m['1-1-수학']?.n, 41);
}


// ── 내신 × 모의 산점 (2026-09-05 신설) ──────────────────────────────────────
/*
  조용히 틀리는 자리가 셋이다.
  ① **축 방향** — 내신은 상위 %(작을수록 우수)라 뒤집지 않으면 모의 축과 반대가 되고,
     "대각선 위/아래"라는 이 그림의 유일한 읽기가 정반대 뜻이 된다. 게다가 그림은
     그럴듯하게 그려져 눈으로는 안 잡힌다.
  ② **원 크기** — 겹친 학생을 세지 못하면 밀집한 곳이 오히려 옅어 보인다.
  ③ **격자 중심** — 경계에 찍으면 축 끝(0·100)에서 원이 잘린다.
*/
{
  const rows = [
    // 격자는 5%p 이므로 같은 칸에 넣으려면 경계를 넘지 않아야 한다(95 와 94 는 갈린다)
    { name: 'A', mockPct: 96, naesinTopPct: 3 },    // 둘 다 최상위
    { name: 'B', mockPct: 97, naesinTopPct: 4 },    // A 와 같은 칸
    { name: 'C', mockPct: 20, naesinTopPct: 80 },   // 둘 다 하위
  ];
  const got = buildCompetitivenessScatter(rows);
  eq('두 축 모두 클수록 우수 — 내신 상위 5% 가 백분위 95 쪽으로 간다',
    got.points.find(p => p.n === 2)?.naesinPct! > 90, true);
  eq('겹친 학생은 한 원으로 묶여 n=2', got.points.find(p => p.n === 2)?.n, 2);
  eq('점 개수 = 격자 칸 수(학생 수가 아니다)', got.points.length, 2);
  eq('count 는 학생 수', got.count, 3);
  eq('maxN', got.maxN, 2);
  eq('큰 원이 뒤에 그려지도록 오름차순', got.points.map(p => p.n), [1, 2]);
  eq('상관은 양수(내신 좋은 학생이 모의도 좋다)', (got.correlation ?? 0) > 0.9, true);
}
{
  /* 격자 중심 — 0·100 극단에서도 축 안에 머문다 */
  const edge = buildCompetitivenessScatter([
    { name: 'lo', mockPct: 0, naesinTopPct: 100 },
    { name: 'hi', mockPct: 100, naesinTopPct: 0 },
  ]);
  eq('격자 중심이 축 안에 있다',
    edge.points.every(p => p.mockPct > 0 && p.mockPct < 100 && p.naesinPct > 0 && p.naesinPct < 100), true);
  eq('최하위 학생은 좌하단', edge.points.find(p => p.names[0] === 'lo')?.mockPct! < 10, true);
  eq('최상위 학생은 우상단', edge.points.find(p => p.names[0] === 'hi')?.naesinPct! > 90, true);
}
{
  /* 범위 밖·비수치는 버린다 — NaN 이 하나 섞이면 상관이 통째로 NaN 이 된다 */
  const dirty = buildCompetitivenessScatter([
    { name: 'ok', mockPct: 50, naesinTopPct: 50 },
    { name: 'nan', mockPct: NaN, naesinTopPct: 10 },
  ]);
  eq('NaN 행은 버린다', dirty.count, 1);
  eq('점 하나면 상관은 낼 수 없다', dirty.correlation, null);
}
{
  /* 한쪽이 상수면 상관이 정의되지 않는다(0 으로 나눔) */
  const flat = buildCompetitivenessScatter([
    { name: 'a', mockPct: 50, naesinTopPct: 10 },
    { name: 'b', mockPct: 50, naesinTopPct: 90 },
  ]);
  eq('한 축이 상수면 상관 null', flat.correlation, null);
}


// ── 모의 축은 코호트 공통 회차 · 결측 0 제외 (2026-09-05 사용자 지적) ────────
/*
  사용자가 "모의 백분위 3에 내신 백분위 93인 학생"을 발견해 드러난 세 결함을 못박는다.
  ① `percentile === 0` 은 결측이다(실측: 2026-07 회차의 `화법과작문` 이 `grade 5 · raw 48`
     인데 `percentile 0` · 표준점수 null — 성적 처리가 덜 된 것이지 최하위가 아니다).
  ② 학생마다 자기 최근 회차를 쓰면 축이 뒤섞인다(3학년 실측 **7종**, 1년 전 회차 11명).
  ③ 최신 학년도 밖에서 인원 최대치를 잡으면 1년 전 회차로 되돌아간다.
*/
{
  const mk = (id: string, rounds: [number, number, number | null, number | null][]) => ({
    id,
    mock_result: rounds.map(([y, m, k, ma]) => ({
      academic_year: y, exam_month: m,
      subjects: {
        ...(k == null ? {} : { '국어': { percentile: k } }),
        ...(ma == null ? {} : { '수학': { percentile: ma } }),
        // 영어는 절대평가라 백분위가 없다 — 있어도 축에 들어가면 안 된다
        '영어': { percentile: 99 },
      },
    })),
  });
  const many = Array.from({ length: 20 }, (_, i) => mk(`s${i}`, [[2026, 6, 50 + i, 60]]));
  const got = buildCohortMockPercentile(many as any);
  eq('회차가 고정된다', `${got.round?.year}-${got.round?.month}`, '2026-6');
  eq('전원 값 보유', got.byId.size, 20);
  eq('영어는 축에서 빠진다(국·수 평균)', got.byId.get('s0'), 55);

  /* percentile 0 은 결측 — 평균에 넣으면 상위권이 최하위로 찍힌다 */
  const withZero = [...many, mk('z', [[2026, 6, 0, 80]])];
  const g2 = buildCohortMockPercentile(withZero as any);
  eq('0 은 빼고 남은 과목만 평균', g2.byId.get('z'), 80);

  /* 두 과목 다 결측이면 그 학생은 축에 없다 */
  const allZero = [...many, mk('n', [[2026, 6, 0, 0]])];
  eq('전부 결측이면 제외', buildCohortMockPercentile(allZero as any).byId.has('n'), false);
}
{
  /* 최신 학년도 안에서 고른다 — 밖을 보면 1년 전으로 되돌아간다 */
  const wide = Array.from({ length: 20 }, (_, i) => ({
    id: `s${i}`,
    mock_result: [
      { academic_year: 2025, exam_month: 9, subjects: { '국어': { percentile: 40 } } },   // 20명
      ...(i < 18 ? [{ academic_year: 2026, exam_month: 6, subjects: { '국어': { percentile: 70 } } }] : []),
      ...(i < 5 ? [{ academic_year: 2026, exam_month: 7, subjects: { '국어': { percentile: 90 } } }] : []),
    ],
  }));
  const got = buildCohortMockPercentile(wide as any);
  eq('덜 채워진 최신 회차(2026-7)는 건너뛴다', `${got.round?.year}-${got.round?.month}`, '2026-6');
  eq('인원이 더 많아도 지난 학년도로 돌아가지 않는다', got.round?.year, 2026);
  eq('그 회차 값만 쓴다', got.byId.get('s0'), 70);
  eq('그 회차에 없는 학생은 빠진다', got.byId.has('s19'), false);
}
{
  /* 격자 폭 — 10%p 로 정했다(5%p 는 절반이 1명짜리, 20%p 는 분포가 사라진다) */
  eq('기본 격자 폭', COMPETITIVENESS_BIN, 10);
  const rows = [
    { name: 'a', mockPct: 71, naesinTopPct: 29 },
    { name: 'b', mockPct: 78, naesinTopPct: 22 },   // 같은 10%p 칸
    { name: 'c', mockPct: 81, naesinTopPct: 29 },   // 다른 칸
  ];
  const g = buildCompetitivenessScatter(rows);
  eq('10%p 안이면 한 원으로 묶인다', g.points.find(p => p.n === 2)?.n, 2);
  eq('경계를 넘으면 갈린다', g.points.length, 2);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
