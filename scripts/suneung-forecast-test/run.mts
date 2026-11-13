/**
 * 수능 예상(백분위 기준) 회귀.
 *
 *   npx tsx scripts/suneung-forecast-test/run.mts
 *
 * 고정하려는 것:
 *  1. **가중치가 조용히 바뀌지 않는다** (9월 0.6 / 6월 0.4). 검증된 적 없는 규칙이라 코드가
 *     유일한 근거다.
 *  2. **탐구는 6·9월 과목이 같을 때만 섞는다.** 바꾼 학생에게 다른 과목 성적을 섞으면
 *     그건 그 학생의 성적이 아닌데, 값이 그럴듯해서 화면에서는 티가 안 난다.
 *  3. **절대평가(영어·한국사)에 백분위를 지어내지 않는다.**
 *  4. 성적표(`사회·문화`)와 마킹(`사회문화`)의 표기 차이를 흡수한다 — 못 이으면 같은 과목이
 *     두 줄로 갈라지고 혼합이 일어나지 않는다.
 */
import {
  buildSuneungForecast, SUNEUNG_W_SEPT, SUNEUNG_W_JUNE,
  buildSuneungCohortContext, mixPercentiles, percentileToZ, zToPercentile,
  absoluteGradeFromRaw, ABSOLUTE_MAX, ABSOLUTE_CUTS,
} from '../../src/features/evalearn/utils/suneungForecast';
import { canonicalSubjectKey } from '../../src/features/evalearn/utils/mockResult';
import type { ReferenceGrade } from '../../src/features/evalearn/utils/referenceGrade';

let passed = 0;
const failures: string[] = [];
function eq<T>(name: string, actual: T, expected: T) {
  if (Object.is(actual, expected)) passed++;
  else failures.push(`${name} — expected ${String(expected)}, got ${String(actual)}`);
}
function near(name: string, actual: number | null | undefined, expected: number, tol = 0.06) {
  if (actual != null && Math.abs(actual - expected) <= tol) passed++;
  else failures.push(`${name} — expected ~${expected}, got ${String(actual)}`);
}

const ref = (grade: number, percentile: number | null): ReferenceGrade => ({
  grade, rawScore: 0, maxScore: 100, source: 'EBS', isAbsolute: percentile == null,
  vsNationalMean: null, percentile,
});
const sept = (o: Record<string, [number, number | null]>) =>
  new Map(Object.entries(o).map(([k, [g, p]]) => [k, ref(g, p)]));

// ── 가중치 ────────────────────────────────────────────────────────────────
eq('9월 가중치 0.6', SUNEUNG_W_SEPT, 0.6);
eq('6월 가중치 0.4', SUNEUNG_W_JUNE, 0.4);
eq('합 1', SUNEUNG_W_SEPT + SUNEUNG_W_JUNE, 1);

// ── 국·수: 백분위로 섞고 등급은 거기서 유도 ───────────────────────────────
{
  const f = buildSuneungForecast(
    sept({ 화법과작문: [2, 90], 확률과통계: [3, 80] }),
    { 화법과작문: { percentile: 80, grade: 3 }, 확률과통계: { percentile: 70, grade: 4 } },
  );
  const kor = f.subjects.find((s) => s.subject === '화법과작문')!;
  /*
    ⚠️ **선형 평균(86.0)이 아니라 86.6 이다.** 백분위는 등간 척도가 아니라 꼬리에서 압축되므로
    (90↔94 의 실력 차이가 50↔54 보다 크다) 직접 평균하면 상위권이 실제보다 낮게 나온다.
    z 로 옮겨 섞고 되돌린다(`mixPercentiles`) — 이 0.6%p 가 그 보정이다.
  */
  near('국어 백분위 = z 경유 .6×90 + .4×80', kor.percentile, 86.6);
  eq('국어 척도', kor.scale, 'percentile');
  eq('국어 근거', kor.basis, 'blend');
  eq('국어 등급은 백분위에서 유도(86 -> 3등급)', kor.grade, 3);

  const math = f.subjects.find((s) => s.subject === '확률과통계')!;
  near('수학 백분위 = z 경유 .6×80 + .4×70', math.percentile, 76.3);
  eq('수학 등급(76 -> 4등급)', math.grade, 4);
}

// ── 절대평가: 등급만, 백분위는 만들지 않는다 ──────────────────────────────
{
  const f = buildSuneungForecast(
    sept({ 영어: [2, null], 한국사: [1, null] }),
    { 영어: { grade: 4 }, 한국사: { grade: 2 } },
  );
  const eng = f.subjects.find((s) => s.subject === '영어')!;
  eq('영어 척도 = grade', eng.scale, 'grade');
  eq('영어 백분위 없음', eng.percentile, null);
  near('영어 등급 = .6×2 + .4×4', eng.grade, 2.8);
  const hist = f.subjects.find((s) => s.subject === '한국사')!;
  near('한국사 등급 = .6×1 + .4×2', hist.grade, 1.4);
}

// ── 탐구: 같은 과목이면 섞고, 바뀌었으면 9월만 ────────────────────────────
{
  // 6·9월 모두 사회문화 — 섞는다 (표기가 달라도 같은 과목)
  const f = buildSuneungForecast(
    sept({ 사회문화: [2, 88] }),
    { '사회·문화': { percentile: 78, grade: 3 } },
  );
  const s = f.subjects.find((x) => x.area === '사회탐구')!;
  eq('표기가 달라도 한 과목', f.subjects.filter((x) => x.area === '사회탐구').length, 1);
  eq('근거 = 혼합', s.basis, 'blend');
  near('탐구 백분위 = z 경유 .6×88 + .4×78', s.percentile, 84.5);
  eq('표시명은 9월(최신) 표기', s.subject, '사회문화');
}
{
  // 탐구를 바꿨다 — 6월 생활과윤리는 버리고 9월 사회문화만 쓴다
  const f = buildSuneungForecast(
    sept({ 사회문화: [2, 88] }),
    { 생활과윤리: { percentile: 40, grade: 5 } },
  );
  const areas = f.subjects.filter((x) => x.area === '사회탐구');
  eq('9월 과목만 남는다', areas.length, 1);
  eq('남은 과목', areas[0].subject, '사회문화');
  eq('근거 = 9월 단독', areas[0].basis, 'september');
  near('6월 값이 섞이지 않는다', areas[0].percentile, 88);
  eq('버린 6월 과목은 목록에 없다', f.subjects.some((x) => x.subject === '생활과윤리'), false);
}
{
  // 9월에 탐구가 없으면(미응시) 6월 탐구도 담지 않는다
  const f = buildSuneungForecast(sept({ 화법과작문: [2, 90] }), { 생활과윤리: { percentile: 60, grade: 4 } });
  eq('9월에 없는 탐구는 제외', f.subjects.some((x) => x.area === '사회탐구'), false);
}
{
  // 국·수·영·한국사는 6월에만 있어도 담는다(탐구와 규칙이 다르다)
  const f = buildSuneungForecast(sept({ 화법과작문: [2, 90] }), { 영어: { grade: 3 } });
  const eng = f.subjects.find((x) => x.subject === '영어');
  eq('6월만 있는 영어는 담는다', eng?.basis, 'june');
  near('6월 단독 등급', eng?.grade, 3);
}

// ── 한쪽만 있을 때 ────────────────────────────────────────────────────────
{
  const f = buildSuneungForecast(sept({ 화법과작문: [2, 90] }), null);
  const kor = f.subjects[0];
  eq('6월 없음 -> 9월 단독', kor.basis, 'september');
  near('9월 값 그대로', kor.percentile, 90);
}
{
  const f = buildSuneungForecast(null, { 화법과작문: { percentile: 70, grade: 4 } });
  eq('9월 없음 -> 6월 단독', f.subjects[0].basis, 'june');
  near('6월 값 그대로', f.subjects[0].percentile, 70);
}
{
  const f = buildSuneungForecast(null, null);
  eq('둘 다 없으면 과목 0', f.subjects.length, 0);
  eq('평균 없음', f.coreAverageGrade, null);
  eq('백분위 평균 없음', f.averagePercentile, null);
}

// ── 요약 지표 ─────────────────────────────────────────────────────────────
{
  const f = buildSuneungForecast(
    sept({ 화법과작문: [2, 90], 확률과통계: [3, 80], 영어: [1, null], 사회문화: [2, 88], 한국사: [1, null] }),
    { 화법과작문: { percentile: 90, grade: 2 }, 확률과통계: { percentile: 80, grade: 3 },
      영어: { grade: 1 }, '사회·문화': { percentile: 88, grade: 2 }, 한국사: { grade: 1 } },
  );
  eq('국·수·영 평균 등급', f.coreAverageGrade, 2);
  near('백분위 평균 = 국·수·탐구', f.averagePercentile, (90 + 80 + 88) / 3, 0.1);
  eq('한국사는 백분위 평균에서 빠진다', f.subjects.find((s) => s.subject === '한국사')!.percentile, null);
}

// ── 표시 순서 ─────────────────────────────────────────────────────────────
{
  const f = buildSuneungForecast(
    sept({ 한국사: [1, null], 사회문화: [2, 88], 생명과학1: [3, 70], 영어: [2, null], 확률과통계: [3, 80], 화법과작문: [2, 90] }),
    null,
  );
  eq('국수영과사 순서', f.subjects.map((s) => s.subject).join(','),
    '화법과작문,확률과통계,영어,생명과학1,사회문화,한국사');
}

// ── z 왕복과 전 회차 모드 (2026-09-05) ─────────────────────────────────────
{
  /*
    백분위 <-> z 왕복이 단조롭고 제자리로 돌아오는지. 여기가 틀리면 상위권 예상이 조용히
    한쪽으로 밀리는데, 값이 그럴듯해 보여 눈으로는 안 잡힌다.
  */
  for (const p of [1, 10, 50, 90, 99]) {
    near(`z 왕복 ${p}%`, zToPercentile(percentileToZ(p)), p, 0.2);
  }
  eq('z 는 단조 증가', percentileToZ(90) > percentileToZ(50) && percentileToZ(50) > percentileToZ(10), true);
  eq('50% 는 z=0', Math.abs(percentileToZ(50)) < 0.01, true);

  /*
    **꼬리 보정의 방향** — 두 값이 벌어질수록 z 평균이 선형 평균보다 바깥(좋은 쪽)으로 간다.
    이게 반대로 되어 있으면 상위권 예상이 계통적으로 낮아진다.
  */
  const lin = 0.5 * 95 + 0.5 * 55;
  const mixed = mixPercentiles([{ value: 95, weight: 1 }, { value: 55, weight: 1 }])!;
  eq('벌어진 두 값의 z 평균 > 선형 평균', mixed > lin, true);
  eq('같은 값이면 그대로', mixPercentiles([{ value: 70, weight: 1 }, { value: 70, weight: 2 }]), 70);
  eq('값이 없으면 null', mixPercentiles([]), null);

  /*
    전 회차 모드 — 학평(3·5·7월)은 재학생만이라 백분위가 통째로 부풀려져 있다.
    **회차별 표준화 후 9월 분포로 순위 환원**하므로 그 부풀림이 결과에 새어 들면 안 된다.
    합성: 20명, 학평에서는 전원 +20%p 부풀려진 값을 준다.
  */
  const N = 20;
  const inputs = Array.from({ length: N }, (_, i) => {
    const base = 95 - i * 4;                       // 95, 91, ... 19
    return {
      studentId: `s${i}`,
      rounds: [3, 5, 7].map((month) => ({
        month,
        subjects: { 국어: { percentile: Math.min(99, base + 20) } },   // 학평은 부풀려짐
      })),
      september: new Map([['국어', { grade: 1, percentile: base, rawScore: 0, maxScore: 100 } as never]]),
    };
  });
  const ctx = buildSuneungCohortContext(inputs as never);
  const mixedPcts = [...(ctx.byStudent.get(canonicalSubjectKey('국어')) ?? new Map()).values()];
  eq('전 회차 모드가 값을 만든다', mixedPcts.length, N);
  eq('학평의 부풀림이 새어 들지 않는다(최대가 9월 최대와 같다)',
    Math.abs(Math.max(...mixedPcts) - 95) < 0.5, true);
  eq('9월 분포를 그대로 입는다(최소도 일치)', Math.abs(Math.min(...mixedPcts) - 19) < 0.5, true);

  const sept0 = new Map([['국어', { grade: 1, percentile: 95, rawScore: 0, maxScore: 100 } as never]]);
  const withCtx = buildSuneungForecast(sept0 as never, { 국어: { percentile: 60 } },
    { mode: 'all-rounds', cohort: ctx, studentId: 's0' });
  eq('전 회차 모드가 코호트 값을 쓴다',
    withCtx.subjects.find((x) => x.subject === '국어')?.percentile, 95);

  /*
    **문맥에 없으면 조용히 평가원 2회로 떨어져야 한다** — 모드를 골랐다고 값이 사라지면
    화면이 빈칸이 되고, 그건 틀린 값보다 나쁘다.
  */
  const fallback = buildSuneungForecast(sept0 as never, { 국어: { percentile: 60 } },
    { mode: 'all-rounds', cohort: ctx, studentId: '없는학생' });
  const fk = fallback.subjects.find((x) => x.subject === '국어');
  eq('문맥에 없으면 평가원 2회로 폴백', fk?.percentile != null && fk.percentile !== 95, true);
  eq('폴백도 z 경유 혼합', Math.abs((fk?.percentile ?? 0)
    - mixPercentiles([{ value: 95, weight: 0.6 }, { value: 60, weight: 0.4 }])!) < 0.05, true);

  // 모드를 안 주면 종전 동작(평가원 2회)
  const dflt = buildSuneungForecast(sept0 as never, { 국어: { percentile: 60 } });
  eq('기본 모드는 평가원 2회',
    dflt.subjects.find((x) => x.subject === '국어')?.percentile, fk?.percentile);
}



// ── 절대평가(영어·한국사)는 원점수로 예측한다 (2026-09-05 사용자 확인 요청 → 수정) ────
/*
  종전에는 **등급을 그대로 섞었다**. 그러면 89점과 90점이 2등급/1등급으로 먼저 갈린 뒤
  평균되어 컷 근처의 정보가 섞기 전에 사라진다. 만점이 전 회차 고정(영어 100 · 한국사 50)
  이라 원점수는 회차를 가로질러 그대로 비교되므로, 원점수를 섞고 **마지막에** 컷을 적용한다.
*/
{
  const sept = new Map<string, any>([
    ['영어', { grade: 2, rawScore: 88, percentile: null }],
    ['한국사', { grade: 3, rawScore: 32, percentile: null }],
  ]);
  const june = {
    '영어': { grade: 3, raw_score: 76, percentile: null },
    '한국사': { grade: 2, raw_score: 37, percentile: null },
  };
  const fc = buildSuneungForecast(sept as any, june as any);
  const eng = fc.subjects.find(x => x.subject === '영어')!;
  const his = fc.subjects.find(x => x.subject === '한국사')!;
  // 9월 0.6 + 6월 0.4
  eq('영어 원점수 = 88·0.6 + 76·0.4', eng.rawScore, 83.2);
  eq('영어 만점', eng.rawMax, 100);
  eq('영어 등급은 그 원점수에서 유도(83.2 → 2등급)', eng.grade, 2);
  eq('한국사 원점수 = 32·0.6 + 37·0.4', his.rawScore, 34);
  eq('한국사 등급(34 → 3등급)', his.grade, 3);
  eq('영어는 백분위를 만들지 않는다', eng.percentile, null);
  eq('한국사도 백분위 없음', his.percentile, null);
  eq('영어 scale 은 grade', eng.scale, 'grade');
  eq('한국사 scale 은 grade', his.scale, 'grade');
}
/*
  ⚠️ 만점 비율로 유도하면 안 된다 — 영어 1등급 컷은 만점의 90%, 한국사는 **80%** 다.
  비율식으로 적었다가 한국사 40점이 2등급으로 나왔다(정답 1등급).
*/
eq('영어 90 = 1등급', absoluteGradeFromRaw(90, '영어'), 1);
eq('영어 89 = 2등급', absoluteGradeFromRaw(89, '영어'), 2);
eq('영어 100 = 1등급', absoluteGradeFromRaw(100, '영어'), 1);
eq('영어 19 = 9등급', absoluteGradeFromRaw(19, '영어'), 9);
eq('한국사 40 = 1등급 (비율식이면 2등급으로 틀린다)', absoluteGradeFromRaw(40, '한국사'), 1);
eq('한국사 39 = 2등급', absoluteGradeFromRaw(39, '한국사'), 2);
eq('한국사 50 = 1등급', absoluteGradeFromRaw(50, '한국사'), 1);
eq('한국사 4 = 9등급', absoluteGradeFromRaw(4, '한국사'), 9);
eq('모르는 과목은 판정하지 않는다', absoluteGradeFromRaw(80, '국어'), null);
eq('영어 만점 100', ABSOLUTE_MAX['영어'], 100);
eq('한국사 만점 50', ABSOLUTE_MAX['한국사'], 50);
eq('한국사 1등급 컷은 만점의 80%(영어는 90%)',
   ABSOLUTE_CUTS['한국사'][0] / ABSOLUTE_MAX['한국사'], 0.8);
eq('영어 1등급 컷은 만점의 90%',
   ABSOLUTE_CUTS['영어'][0] / ABSOLUTE_MAX['영어'], 0.9);
/*
  원점수가 없으면 종전대로 등급을 섞는다 — 값이 사라지는 것보다 낫다.
*/
{
  const fc = buildSuneungForecast(
    new Map<string, any>([['영어', { grade: 2, rawScore: null, percentile: null }]]) as any,
    { '영어': { grade: 4, percentile: null } } as any);
  const eng = fc.subjects.find(x => x.subject === '영어')!;
  eq('원점수 없으면 등급 혼합으로 폴백', eng.grade, 2.8);
  eq('그때는 원점수를 지어내지 않는다', eng.rawScore ?? null, null);
}
/*
  미응시는 원점수 0 으로 저장된다(등급 0 과 같은 규약) — 0 을 값으로 받으면 결시가
  최하위 점수로 섞여 들어간다.
*/
{
  const fc = buildSuneungForecast(
    new Map<string, any>([['영어', { grade: 2, rawScore: 88, percentile: null }]]) as any,
    { '영어': { grade: 3, raw_score: 0, percentile: null } } as any);
  const eng = fc.subjects.find(x => x.subject === '영어')!;
  eq('원점수 0 은 결측이라 9월 단독', eng.rawScore, 88);
  eq('근거도 9월 단독', eng.basis, 'september');
}

console.log(`\n수능 예상(백분위) — ${passed}건 통과${failures.length ? `, ${failures.length}건 실패` : ''}`);
if (failures.length) {
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
