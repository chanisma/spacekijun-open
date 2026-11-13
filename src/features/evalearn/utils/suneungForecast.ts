/**
 * 수능 예상 성적 — **백분위 기준** (2026-09-05 사용자 결정).
 *
 * ## 왜 백분위인가
 * 등급은 9칸뿐이라 한 칸이 백분위 10~20 폭을 덮는다. 3등급 맨 위와 맨 아래가 같은 값이 되어
 * "지금 어디쯤인지"를 말하지 못한다. 9월은 공식 백분위가 없지만 **원점수와 EBS 등급컷**이
 * 있으므로 `estimatePercentile` 로 백분위를 근사할 수 있다(6월 공식 데이터로 잰 보간 오차
 * MAE 0.94백분위 · 95분위 2.3). 그래서 예상 성적을 백분위로 내고, 등급은 그 백분위에서 유도한다.
 *
 * ## 무엇을 섞는가 — 모드 2종 (2026-09-05 측정 후 사용자 결정)
 *
 * 수능 성적이 **한 건도 없어** 직접 검증이 불가능하다. 그래서 **9월을 맞히는 문제**를 대리
 * 과제로 삼아 쟀다(같은 구조 = 최근 평가원 + 그 이전 회차들, `scripts/naesin-percentile-probe/suneung_signal.py`).
 *
 *   `pyeonggawon` — 6·9월(평가원)만. 모집단이 수능과 가장 닮은 두 회차다.
 *   `all-rounds`  — 3·5·7월 학평까지 섞는다. 실측 MAE 6월만 0.773 -> 5·6월 0.685 ->
 *                   3·5·6월 0.637 -> 3·5·6·7월 **0.624**(6월 단독 대비 -0.147 [-0.274,-0.025]).
 *
 * **회차를 섞는 이득은 모집단이 비슷해서가 아니라 잡음이 지워져서다** — 학평(재학생만)조차
 * 섞으면 도움이 된다. 회차마다 컨디션·난이도 상성 같은 개인 잡음이 끼는데 평균이 그걸 지운다.
 * 그래서 **절대 수준은 평가원에서만** 가져온다: 회차별로 표준화해 **순위 정보만** 쓰고,
 * 최종 백분위는 9월 분포에 순위로 되돌린다(equating). 학평 백분위를 그대로 평균하면
 * 재수생이 빠진 만큼 통째로 부풀려진다.
 *
 * **가중치는 거의 상관없다** — 최근 회차 비중 w 를 0.1~0.9 로 바꿔도 MAE 0.646~0.659 로
 * 평평하고 **w=1.0(단독)만 0.758 로 급락**한다. 즉 "몇 개를 섞느냐"가 중요하지 "얼마씩"은
 * 아니다. 그래서 `pyeonggawon` 은 기존 0.6/0.4 를 유지하고 `all-rounds` 는 균등 평균이다.
 *
 * ⚠️ **추세 외삽은 넣지 않는다** — "직전 변화를 이어감"이 +0.161 [+0.097,+0.226] 로 확실히
 * 나빴다. 최근 변화는 실력 변화가 아니라 대부분 잡음이라 이어 가면 증폭된다.
 *
 * ⚠️ 여전히 **수능이 아니라 9월로 잰 결과의 유추 이전**이다. 수능 성적이 들어오면 다시 잰다.
 *
 * ## 탐구는 규칙이 다르다 (사용자 지정)
 * 과목이 다양하고 학생마다 기록이 적어, **6·9월 과목이 같을 때만 두 회차를 섞고 다르면 9월만**
 * 쓴다. 탐구를 바꾼 학생에게 다른 과목의 성적을 섞으면 그건 그 학생의 성적이 아니다.
 *
 * ## 절대평가(영어·한국사)는 **두 모드 모두 종전 방식**이다
 * 백분위가 존재하지 않고, 등급이 절대 기준(90/80/70점)이라 **순위로 되돌리면 안 된다** —
 * 수능 영어 1등급 비율은 회차마다 4~13% 로 크게 움직이므로 "9월 등급 분포가 수능에도
 * 유지된다"는 가정이 성립하지 않는다. 등급을 같은 가중치로 섞고 `scale: 'grade'` 로 구분한다.
 */
import type { ReferenceGrade } from './referenceGrade';
import { gradeFromPercentile } from './referenceGrade';
import { canonicalSubjectKey, isValidExamGrade } from './mockResult';
import { subjectArea, sortSubjects, type SubjectArea } from './subjectOrder';

/** 9월 0.6 / 6월 0.4 (사용자 결정). 검증된 적 없는 규칙 — 위 주석 참고. */
export const SUNEUNG_W_SEPT = 0.6;
export const SUNEUNG_W_JUNE = 0.4;

/** 수능 예상을 만드는 방식. 근거는 파일 상단 주석. */
export type SuneungMode = 'pyeonggawon' | 'all-rounds';
export const SUNEUNG_MODE_LABEL: Record<SuneungMode, string> = {
  pyeonggawon: '평가원 2회(6·9월)',
  'all-rounds': '전 회차(3·5·6·7·9월)',
};

/**
 * 백분위 <-> 정규분위수. **백분위를 그대로 평균하면 안 되기 때문에** 필요하다 —
 * 백분위는 등간 척도가 아니라 꼬리에서 압축된다(90↔94 의 실력 차이가 50↔54 보다 크다).
 * 그래서 상위권에서 평균이 실제보다 낮은 쪽으로 끌린다. z 로 옮겨 평균하고 되돌리면 없어진다.
 */
export function percentileToZ(p: number): number {
  const q = Math.min(0.9995, Math.max(0.0005, p / 100));
  return probit(q);
}
export function zToPercentile(z: number): number {
  return Math.min(100, Math.max(0, normalCdf(z) * 100));
}

/** 표준정규 CDF (Abramowitz–Stegun 7.1.26 오차함수 근사, |오차| < 1.5e-7). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t
    + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** 표준정규 분위수 — 이분법. 정확도보다 **의존성 0** 과 단조성이 중요하다. */
function probit(q: number): number {
  let lo = -6;
  let hi = 6;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < q) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 백분위들을 z 공간에서 가중평균한 뒤 백분위로 되돌린다. */
export function mixPercentiles(parts: { value: number; weight: number }[]): number | null {
  const use = parts.filter((x) => Number.isFinite(x.value) && x.weight > 0);
  if (use.length === 0) return null;
  const wsum = use.reduce((a, b) => a + b.weight, 0);
  const z = use.reduce((a, b) => a + percentileToZ(b.value) * b.weight, 0) / wsum;
  return Math.round(zToPercentile(z) * 10) / 10;
}

/** 한 회차의 한 과목 값. 상대평가면 백분위가, 절대평가면 원점수·등급이 있다. */
export interface ExamPoint {
  percentile: number | null;
  grade: number | null;
  /** 원점수 — **절대평가(영어·한국사)의 정본**이다(아래 `ABSOLUTE_MAX` 주석) */
  rawScore?: number | null;
  /** 백분위가 원점수에서 근사된 값인가(9월). 공식 백분위(6월)면 false. */
  estimated: boolean;
}

/**
 * 절대평가 과목의 만점 — 전 회차 고정이다(라이브 12회차 전수 확인: 영어 100 · 한국사 50).
 * 만점이 고정이므로 **원점수가 회차를 가로질러 그대로 비교된다.**
 */
export const ABSOLUTE_MAX: Record<string, number> = { '영어': 100, '한국사': 50 };

/**
 * 절대평가 등급컷(그 등급의 **최저 원점수**).
 *
 * ## ⚠️ 만점 비율로 유도하면 안 된다
 * 영어는 **90점**부터 10점 간격, 한국사는 **40점**(만점 50)부터 5점 간격이다. 즉 1등급 컷이
 * 만점의 90% 와 80% 로 서로 달라 비율 하나로는 두 과목을 함께 표현할 수 없다 — 실제로
 * 비율식으로 적었다가 한국사 40점이 2등급으로 나왔다(정답은 1등급).
 *
 * 한국사 계단은 실측 4,669건에서 **예외 0건**으로 재현된다
 * (CLAUDE.md "한국사는 계산이지 유도가 아니다").
 */
export const ABSOLUTE_CUTS: Record<string, number[]> = {
  '영어': [90, 80, 70, 60, 50, 40, 30, 20],
  '한국사': [40, 35, 30, 25, 20, 15, 10, 5],
};

export function absoluteGradeFromRaw(raw: number, subject: string): number | null {
  const cuts = ABSOLUTE_CUTS[subject];
  if (!cuts) return null;
  for (let i = 0; i < cuts.length; i += 1) {
    if (raw >= cuts[i]) return i + 1;
  }
  return 9;
}

export type ForecastBasis = 'blend' | 'september' | 'june';

export interface SubjectForecast {
  /** 표시명. 6·9월 표기가 다르면 9월(최신) 쪽을 쓴다. */
  subject: string;
  area: SubjectArea;
  /** 백분위로 낼 수 있는 과목인가 — 절대평가는 'grade'(그 대신 원점수를 낸다) */
  scale: 'percentile' | 'grade';
  /** 절대평가 과목의 수능 예상 **원점수**. 상대평가면 null */
  rawScore?: number | null;
  /** 절대평가 과목의 만점(영어 100 · 한국사 50). 상대평가면 null */
  rawMax?: number | null;
  june: ExamPoint | null;
  september: ExamPoint | null;
  /** 수능 예상 백분위 (절대평가면 null) */
  percentile: number | null;
  /** 수능 예상 등급. 상대평가는 위 백분위에서 유도, 절대평가는 등급을 직접 섞는다. */
  grade: number | null;
  basis: ForecastBasis;
}

export interface SuneungForecast {
  subjects: SubjectForecast[];
  /** 국·수·영 평균 등급 — 기존 화면 지표와 이어지도록 유지 */
  coreAverageGrade: number | null;
  /** 국·수·탐구 백분위 평균 (정시 감각). 절대평가는 빠진다. */
  averagePercentile: number | null;
}

const AVERAGE_PERCENTILE_AREAS: SubjectArea[] = ['국어', '수학', '과학탐구', '사회탐구'];
const CORE_AREAS: SubjectArea[] = ['국어', '수학', '영어'];

function pick(june: ExamPoint | null, sept: ExamPoint | null,
              key: 'percentile' | 'grade' | 'rawScore'):
  { value: number | null; basis: ForecastBasis } {
  const j = june?.[key] ?? null;
  const s = sept?.[key] ?? null;
  if (j != null && s != null) {
    /*
      백분위는 z 를 거쳐 섞는다(위 `mixPercentiles` 주석 — 꼬리 압축 때문에 직접 평균하면
      상위권이 왜곡된다). 등급은 절대평가뿐이라 그대로 섞는다.
    */
    const value = key === 'percentile'
      ? mixPercentiles([{ value: s, weight: SUNEUNG_W_SEPT }, { value: j, weight: SUNEUNG_W_JUNE }])
      : SUNEUNG_W_SEPT * s + SUNEUNG_W_JUNE * j;
    return { value, basis: 'blend' };
  }
  if (s != null) return { value: s, basis: 'september' };
  if (j != null) return { value: j, basis: 'june' };
  return { value: null, basis: 'september' };
}

/* ───────────────────────── 모드 2: 전 회차 섞기 ───────────────────────── */

/** 코호트 한 명분 입력 — 회차별 과목 백분위. */
export interface CohortRoundInput {
  studentId: string;
  /** `mock_result` 의 3학년 회차들(3·5·6·7월). 9월은 참고 등급에서 따로 받는다. */
  rounds: { month: number; subjects: Record<string, { percentile?: number | null }> }[];
  /** 9월 참고 등급(마킹 -> 원점수 -> EBS 컷). 백분위가 없는 과목은 건너뛴다. */
  september?: Map<string, ReferenceGrade> | null;
}

export interface SuneungCohortContext {
  /** 과목키 -> (학생 -> 전 회차 혼합 백분위). 이미 9월 분포에 순위로 맞춰진 값이다. */
  byStudent: Map<string, Map<string, number>>;
  /** 과목키 -> 섞는 데 실제로 쓰인 회차 수(화면이 근거를 말할 수 있게) */
  roundsUsed: Map<string, number>;
}

const ALL_ROUND_MONTHS = [3, 5, 6, 7];

/**
 * 전 회차를 섞은 수능 예상 백분위를 **코호트 단위로** 만든다.
 *
 * ## 왜 코호트 단위인가
 * 학평(3·5·7월)과 평가원(6·9월)은 응시 집단이 달라 백분위 수준이 통째로 다르다. 그래서
 * **회차 안에서 표준화**해야 섞을 수 있고, 표준화에는 그 회차를 본 학생 전체가 필요하다.
 * 한 명만 보고는 할 수 없는 계산이라 per-student 함수로 만들 수 없다.
 *
 * ## 절대 수준은 9월에서 가져온다
 * 섞은 z 는 "이 코호트 안에서 몇 등쯤"까지만 말한다. 백분위(전국 척도)로 돌리려면 분포가
 * 필요한데, **수능 분포를 모르므로 9월(가장 최근 평가원) 분포를 쓴다**. 순위를 보존해
 * 그 분포를 입히므로(equating) 학평의 부풀려진 백분위가 결과에 새어 들지 않는다.
 */
export function buildSuneungCohortContext(inputs: CohortRoundInput[]): SuneungCohortContext {
  // 과목키 -> 월 -> (학생 -> 백분위)
  const raw = new Map<string, Map<number, Map<string, number>>>();
  const put = (key: string, month: number, id: string, pct: number) => {
    /*
      ⚠️ **백분위 0 은 결측이다** — 미응시(`grade = 0`)와 같은 규약이고, 성적 처리가 덜 된
      회차도 0 으로 온다. 그대로 표준화에 넣으면 그 학생이 그 회차 최하위로 잡혀 z 가
      통째로 밀린다(2026-09-06 적대적 검증 — 산점도만 고치고 이 경로는 남아 있었다).
      결측 판정을 화면마다 두지 않기 위해 **값이 들어오는 문 앞에서** 한 번에 거른다.
    */
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return;
    let byMonth = raw.get(key);
    if (!byMonth) { byMonth = new Map(); raw.set(key, byMonth); }
    let byStu = byMonth.get(month);
    if (!byStu) { byStu = new Map(); byMonth.set(month, byStu); }
    byStu.set(id, pct);
  };

  for (const inp of inputs) {
    for (const r of inp.rounds) {
      if (!ALL_ROUND_MONTHS.includes(r.month)) continue;
      for (const [name, v] of Object.entries(r.subjects ?? {})) {
        const pct = typeof v?.percentile === 'number' ? v.percentile : null;
        if (pct != null) put(canonicalSubjectKey(name), r.month, inp.studentId, pct);
      }
    }
    inp.september?.forEach((ref, name) => {
      if (ref.percentile != null) put(canonicalSubjectKey(name), 9, inp.studentId, ref.percentile);
    });
  }

  const byStudent = new Map<string, Map<string, number>>();
  const roundsUsed = new Map<string, number>();

  for (const [key, byMonth] of raw) {
    const sept = byMonth.get(9);
    // 9월이 없으면 되돌릴 분포가 없다 — 그 과목은 모드 2로 낼 수 없다
    if (!sept || sept.size < 10) continue;

    /*
      회차별 표준화 — z = Φ⁻¹(백분위) 를 그 회차 안에서 다시 (x−평균)/표준편차 한다.
      Φ⁻¹ 만으로는 부족하다: 학평은 재학생만이라 분포 자체가 위로 밀려 있어, 표준화하지 않으면
      "학평을 섞을수록 좋아 보이는" 편향이 들어온다.
    */
    const zByMonth = new Map<number, Map<string, number>>();
    let used = 0;
    for (const [month, byStu] of byMonth) {
      if (byStu.size < 10) continue;
      const zs = [...byStu].map(([id, p]) => [id, percentileToZ(p)] as const);
      const mean = zs.reduce((a, b) => a + b[1], 0) / zs.length;
      const sd = Math.sqrt(zs.reduce((a, b) => a + (b[1] - mean) ** 2, 0) / Math.max(1, zs.length - 1));
      if (!(sd > 0)) continue;
      zByMonth.set(month, new Map(zs.map(([id, z]) => [id, (z - mean) / sd])));
      used += 1;
    }
    if (used === 0) continue;

    // 학생별 평균 z — 가중치는 균등이다(측정: w 를 바꿔도 거의 변하지 않는다)
    const mixed: { id: string; z: number }[] = [];
    const ids = new Set<string>();
    zByMonth.forEach((m) => m.forEach((_v, id) => ids.add(id)));
    for (const id of ids) {
      const vals: number[] = [];
      zByMonth.forEach((m) => { const v = m.get(id); if (v != null) vals.push(v); });
      if (vals.length === 0) continue;
      mixed.push({ id, z: vals.reduce((a, b) => a + b, 0) / vals.length });
    }
    if (mixed.length < 10) continue;

    /*
      순위를 9월 백분위 분포에 되돌린다(equating). 9월을 안 본 학생은 분포를 만들 재료가
      없으므로 **9월 보유자만** 순위 매핑 대상이다 — 없는 사람에게 자리를 주면 남의 자리를 민다.
    */
    const eligible = mixed.filter((x) => sept.has(x.id)).sort((a, b) => b.z - a.z);
    const targets = [...sept.values()].sort((a, b) => b - a);
    const out = new Map<string, number>();
    eligible.forEach((x, i) => out.set(x.id, Math.round(targets[i] * 10) / 10));
    byStudent.set(key, out);
    roundsUsed.set(key, used);
  }

  return { byStudent, roundsUsed };
}

/**
 * 학생 한 명의 수능 예상.
 *
 * @param september 9월 참고 등급(마킹 → 원점수 → EBS 컷). 과목키는 마킹 표기.
 * @param juneSubjects 6월 공식 성적의 subjects 맵. 과목키는 성적표 표기(다를 수 있다).
 */
export function buildSuneungForecast(
  september: Map<string, ReferenceGrade> | null | undefined,
  juneSubjects: Record<string, {
    percentile?: number | null; grade?: number | null; raw_score?: number | null;
  }> | null | undefined,
  options?: {
    /** 기본 `pyeonggawon`(6·9월). `all-rounds` 는 `cohort`·`studentId` 가 함께 있어야 한다. */
    mode?: SuneungMode;
    cohort?: SuneungCohortContext | null;
    studentId?: string | null;
  }
): SuneungForecast {
  const mode: SuneungMode = options?.mode ?? 'pyeonggawon';
  const cohort = mode === 'all-rounds' ? options?.cohort ?? null : null;
  const sid = options?.studentId ?? null;
  // 6월을 정규화 키로 색인 — 성적표 `사회·문화` 와 마킹 `사회문화` 가 같은 과목이다
  const juneByKey = new Map<string, { name: string; point: ExamPoint }>();
  for (const [name, v] of Object.entries(juneSubjects ?? {})) {
    const grade = isValidExamGrade(v?.grade) ? v!.grade! : null;
    /* 백분위 0 은 결측이다(미응시·미처리) — 위 `put` 과 같은 규약을 여기서도 지킨다 */
    const percentile = typeof v?.percentile === 'number' && v.percentile > 0 ? v.percentile : null;
    /* 미응시는 원점수 0 으로 저장된다(등급 0 과 같은 규약) — 0 은 값이 아니라 결측이다 */
    const rawScore = typeof v?.raw_score === 'number' && v.raw_score > 0 ? v.raw_score : null;
    if (grade == null && percentile == null) continue;
    juneByKey.set(canonicalSubjectKey(name),
                  { name, point: { percentile, grade, rawScore, estimated: false } });
  }

  const septByKey = new Map<string, { name: string; point: ExamPoint }>();
  september?.forEach((ref, name) => {
    septByKey.set(canonicalSubjectKey(name), {
      name,
      point: { percentile: ref.percentile, grade: ref.grade,
               rawScore: typeof ref.rawScore === 'number' && ref.rawScore > 0 ? ref.rawScore : null,
               estimated: true },
    });
  });

  /*
    다룰 과목 목록.
    · 국·수·영·한국사는 두 회차 어디에 있든 담는다.
    · **탐구는 9월에 있는 과목만** 담는다 — 6월에만 있는 탐구는 그 학생이 바꾼 과목이라
      수능 예상에 넣으면 안 본 과목을 예상하는 셈이 된다(사용자 지정 규칙).
  */
  const keys = new Set<string>();
  for (const [k, v] of septByKey) { void v; keys.add(k); }
  for (const [k, v] of juneByKey) {
    const area = subjectArea(v.name);
    if (area === '과학탐구' || area === '사회탐구') continue;
    keys.add(k);
  }

  const subjects: SubjectForecast[] = [];
  for (const key of keys) {
    const s = septByKey.get(key) ?? null;
    const j = juneByKey.get(key) ?? null;
    const name = s?.name ?? j?.name ?? key;
    const area = subjectArea(name);

    // 백분위가 어느 한쪽에라도 있으면 상대평가 과목이다(영어·한국사는 양쪽 다 없다)
    const scale: 'percentile' | 'grade' =
      s?.point.percentile != null || j?.point.percentile != null ? 'percentile' : 'grade';

    let percentile: number | null = null;
    let grade: number | null = null;
    let rawScore: number | null = null;
    let rawMax: number | null = null;
    let basis: ForecastBasis;

    if (scale === 'percentile') {
      /*
        `all-rounds` 는 코호트 문맥에서 이미 섞인 값을 쓴다(회차별 표준화 + 9월 분포로 순위 환원).
        그 과목이 문맥에 없으면(9월 미응시·표본 부족) **조용히 평가원 2회로 떨어진다** —
        모드를 골랐다고 값이 사라지면 화면이 빈칸이 되고, 그건 틀린 값보다도 나쁘다.
      */
      const mixed = cohort && sid ? cohort.byStudent.get(key)?.get(sid) ?? null : null;
      if (mixed != null) {
        percentile = mixed;
        basis = 'blend';
      } else {
        const r = pick(j?.point ?? null, s?.point ?? null, 'percentile');
        percentile = r.value == null ? null : Math.round(r.value * 10) / 10;
        basis = r.basis;
      }
      grade = percentile == null ? null : gradeFromPercentile(percentile);
    } else {
      /*
        ## 절대평가는 **원점수를 섞는다** (2026-09-05 사용자 확인 요청 → 수정)

        종전에는 등급을 그대로 섞었다. 그러면 89점과 90점이 2등급/1등급으로 **먼저 갈린 뒤**
        평균되어, 컷 근처의 정보가 섞기 전에 이미 사라진다(6월 2등급 + 9월 1등급 = 1.4등급
        같은 값이 나오는데 실제로는 89→90 한 점 차이일 수도, 70→95 일 수도 있다).
        만점이 전 회차 고정이라 원점수는 그대로 비교되므로, 원점수를 섞고 **마지막에** 절대
        컷을 적용하는 쪽이 정확하다. 원점수가 없는 회차는 종전대로 등급을 섞는다.
      */
      const rawMix = pick(j?.point ?? null, s?.point ?? null, 'rawScore');
      const absKey = ABSOLUTE_CUTS[area] ? area : ABSOLUTE_CUTS[name] ? name : null;
      const derived = rawMix.value == null || !absKey
        ? null : absoluteGradeFromRaw(Math.round(rawMix.value * 10) / 10, absKey);
      if (rawMix.value != null && absKey && derived != null) {
        rawScore = Math.round(rawMix.value * 10) / 10;
        rawMax = ABSOLUTE_MAX[absKey] ?? null;
        grade = derived;
        basis = rawMix.basis;
      } else {
        const r = pick(j?.point ?? null, s?.point ?? null, 'grade');
        grade = r.value == null ? null : Math.round(r.value * 100) / 100;
        basis = r.basis;
      }
    }

    subjects.push({ subject: name, area, scale, june: j?.point ?? null, september: s?.point ?? null,
                    percentile, grade, rawScore, rawMax, basis });
  }

  // 표시 순서는 공용 단일 출처(국어 → 수학 → 영어 → 과학탐구 → 사회탐구 → 한국사)
  const order = new Map(sortSubjects(subjects.map((x) => x.subject)).map((n, i) => [n, i]));
  subjects.sort((a, b) => (order.get(a.subject) ?? 99) - (order.get(b.subject) ?? 99));

  const coreGrades = subjects
    .filter((x) => CORE_AREAS.includes(x.area) && x.grade != null)
    .map((x) => x.grade!);
  const pcts = subjects
    .filter((x) => AVERAGE_PERCENTILE_AREAS.includes(x.area) && x.percentile != null)
    .map((x) => x.percentile!);

  return {
    subjects,
    coreAverageGrade: coreGrades.length
      ? Math.round((coreGrades.reduce((a, b) => a + b, 0) / coreGrades.length) * 100) / 100
      : null,
    averagePercentile: pcts.length
      ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10
      : null,
  };
}
