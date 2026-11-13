/**
 * 고전검사이론(CTT) 문항 분석 — **순수 함수만**.
 *
 * 학교가 이미 쓰던 업로드 리포트(`evalearn_grade_analysis`)의 지표를 그대로 계산한다.
 * 그 리포트는 사람이 매 회차 만들어 올려야 했고, 여기 옮겨 오면 회차마다 자동으로 나온다.
 *
 * 지표와 해석 기준은 리포트의 용어 카드를 따랐다:
 *   KR-20  이분채점 신뢰도            >=0.80 양호
 *   rpb    문항-총점 상관(변별도)      >=0.30 우수
 *   품질    A: KR-20>=.80 & rpb>=.25 / B: >=.70 & >=.15 / C: 그 외
 *   왜도    +면 저득점 쏠림, -면 고득점 쏠림
 *   첨도    +면 양극화(쌍봉), -면 평탄
 *   D      상위그룹 정답률 - 하위그룹 정답률
 *
 * **소표본 주의**: 리포트도 N<30 을 '소표본' 배지로 표시한다. 반 단위(24명)는 항상 여기에
 * 해당하므로 이 지표들을 반끼리 비교하는 데 쓰면 안 된다 — 학년 단위로 읽는 지표다.
 */
import { isValidExamGrade } from './mockResult';


/** 등급 그룹 — 리포트와 같은 경계(상 1~2 / 중상 3~4 / 중하 5~6 / 하 7~9) */
export type AbilityGroup = '상' | '중상' | '중하' | '하';
export const ABILITY_GROUPS: AbilityGroup[] = ['상', '중상', '중하', '하'];

/** 소표본 경계 — 리포트와 동일 */
export const SMALL_SAMPLE_THRESHOLD = 30;

export interface ItemResponse {
  /** 학생 식별자(그룹 매칭용) */
  studentId: string;
  /** 문항별 정오. 채점 불가는 null */
  correct: (boolean | null)[];
  /** 총점(원점수) */
  totalScore: number;
  /** 능력 그룹 — 등급이 없으면 원점수 사분위로 대체한다 */
  group: AbilityGroup | null;
}

export interface ItemStat {
  problemNumber: number;
  /** 응답한 학생 수 */
  answered: number;
  /** 교내 정답률 0~100 */
  correctRate: number;
  /** 그룹별 정답률 0~100 (응답자 없으면 null) */
  byGroup: Record<AbilityGroup, number | null>;
  /** 변별도 D = 상 - 하 (백분율 포인트). 그룹이 비면 null */
  discrimination: number | null;
  /** 점이연 상관 rpb — 문항 정오와 총점의 상관. 분산이 0이면 null */
  rpb: number | null;
  /**
   * rpb 의 95% 신뢰구간(Fisher z). **이 값 없이 문항을 변별도로 줄 세우지 말 것.**
   *
   * 2026-09-05 실측(`scripts/irt-probe`): 같은 회차의 응시자를 무작위로 반씩 갈라 각각
   * 다시 계산했더니 두 절반의 rpb 순위 상관이 **0.23~0.73** 이었다(과목당 126~190명).
   * 즉 개별 문항의 rpb 는 표본이 바뀌면 순위가 크게 흔들린다 — 학교 한 곳의 한 회차에서는
   * 구조적으로 그렇다. IRT 2PL 의 변별도 a 로 바꿔도 재현성은 0.45~0.72 로 비슷했다
   * (문제는 지표 선택이 아니라 표본 크기다).
   */
  rpbCI: [number, number] | null;
}

export interface SubjectReliability {
  /** 문항 수 */
  items: number;
  /** KR-20 내적 일관성 신뢰도. 문항 2개 미만이거나 총점 분산 0이면 null */
  kr20: number | null;
  /** 평균 rpb */
  meanRpb: number | null;
  /** 품질 등급 */
  quality: 'A' | 'B' | 'C' | null;
}

/**
 * 등급으로 능력 그룹을 정한다. 등급이 없으면 null — 호출자가 원점수 사분위로 대체한다.
 *
 * **유효 등급(1~9)만 받는다.** 미응시는 `grade=0` 으로 저장돼 있어(리로스쿨 적재 규약)
 * 단순히 `<=2` 로 판정하면 미응시자가 **최상위 그룹으로 들어간다** — 문항 변별도가
 * 통째로 망가진다. 판정은 `isValidExamGrade` 단일 출처를 쓴다.
 */
export function groupFromGrade(grade: number | null | undefined): AbilityGroup | null {
  if (!isValidExamGrade(grade)) return null;
  if (grade <= 2) return '상';
  if (grade <= 4) return '중상';
  if (grade <= 6) return '중하';
  return '하';
}

/**
 * 원점수 사분위로 능력 그룹을 정한다(등급이 없는 회차용).
 * 상위 25% = 상 … 하위 25% = 하. 동점이 많으면 그룹 크기가 고르지 않을 수 있다.
 */
export function assignGroupsByScore(scores: { studentId: string; totalScore: number }[]): Map<string, AbilityGroup> {
  const sorted = [...scores].sort((a, b) => b.totalScore - a.totalScore);
  const n = sorted.length;
  const out = new Map<string, AbilityGroup>();
  if (n === 0) return out;
  sorted.forEach((s, i) => {
    const q = i / n;
    out.set(s.studentId, q < 0.25 ? '상' : q < 0.5 ? '중상' : q < 0.75 ? '중하' : '하');
  });
  return out;
}

function variance(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
}

/**
 * 문항별 통계. `responses[*].correct` 는 문항 순서(0-based)로 정렬돼 있어야 한다.
 */
export function computeItemStats(responses: ItemResponse[], itemCount: number): ItemStat[] {
  const totals = responses.map((r) => r.totalScore);
  const totalSd = Math.sqrt(variance(totals));

  const out: ItemStat[] = [];
  for (let i = 0; i < itemCount; i++) {
    let answered = 0;
    let correct = 0;
    const groupTally: Record<AbilityGroup, { c: number; n: number }> = {
      '상': { c: 0, n: 0 }, '중상': { c: 0, n: 0 }, '중하': { c: 0, n: 0 }, '하': { c: 0, n: 0 },
    };
    const correctTotals: number[] = [];
    const wrongTotals: number[] = [];

    for (const r of responses) {
      const v = r.correct[i];
      if (v == null) continue;
      answered += 1;
      if (v) { correct += 1; correctTotals.push(r.totalScore); }
      else wrongTotals.push(r.totalScore);
      if (r.group) {
        groupTally[r.group].n += 1;
        if (v) groupTally[r.group].c += 1;
      }
    }

    const byGroup = Object.fromEntries(
      ABILITY_GROUPS.map((g) => {
        const t = groupTally[g];
        return [g, t.n > 0 ? Math.round((t.c / t.n) * 1000) / 10 : null];
      })
    ) as Record<AbilityGroup, number | null>;

    // rpb = (M1 - M0)/SD * sqrt(p*q)  — 총점 분산이 0이거나 한쪽이 비면 정의되지 않는다
    let rpb: number | null = null;
    if (totalSd > 0 && correctTotals.length > 0 && wrongTotals.length > 0) {
      const m1 = correctTotals.reduce((a, b) => a + b, 0) / correctTotals.length;
      const m0 = wrongTotals.reduce((a, b) => a + b, 0) / wrongTotals.length;
      const p = correctTotals.length / answered;
      rpb = Math.round(((m1 - m0) / totalSd) * Math.sqrt(p * (1 - p)) * 1000) / 1000;
    }

    /*
      Fisher z 변환으로 상관의 신뢰구간을 낸다. z = atanh(r) 은 표본분포가 대략 정규이고
      표준오차가 1/sqrt(n-3) 라, 부트스트랩 없이 O(1) 로 구간이 나온다.
      n=150 이면 폭이 대략 ±0.16 이라 "0.30 이상 = 고변별" 같은 칸 나누기가 성립하지 않는다.
    */
    let rpbCI: [number, number] | null = null;
    if (rpb != null && answered > 4) {
      const z = Math.atanh(Math.max(-0.999, Math.min(0.999, rpb)));
      const se = 1 / Math.sqrt(answered - 3);
      const r3 = (x: number) => Math.round(Math.tanh(x) * 1000) / 1000;
      rpbCI = [r3(z - 1.96 * se), r3(z + 1.96 * se)];
    }

    const hi = byGroup['상'];
    const lo = byGroup['하'];

    out.push({
      problemNumber: i + 1,
      answered,
      correctRate: answered > 0 ? Math.round((correct / answered) * 1000) / 10 : 0,
      byGroup,
      discrimination: hi != null && lo != null ? Math.round((hi - lo) * 10) / 10 : null,
      rpb,
      rpbCI,
    });
  }
  return out;
}

/**
 * KR-20 = k/(k-1) × (1 − Σp·q / σ²총점).
 * 문항이 2개 미만이거나 총점 분산이 0이면 정의되지 않는다.
 */
export function computeReliability(responses: ItemResponse[], items: ItemStat[]): SubjectReliability {
  const k = items.length;
  const totalVar = variance(responses.map((r) => r.totalScore));

  let kr20: number | null = null;
  if (k >= 2 && totalVar > 0) {
    const sumPQ = items.reduce((s, it) => {
      const p = it.correctRate / 100;
      return s + p * (1 - p);
    }, 0);
    kr20 = Math.round((k / (k - 1)) * (1 - sumPQ / totalVar) * 1000) / 1000;
  }

  const rpbs = items.map((i) => i.rpb).filter((v): v is number => v != null);
  const meanRpb = rpbs.length > 0 ? Math.round((rpbs.reduce((a, b) => a + b, 0) / rpbs.length) * 1000) / 1000 : null;

  let quality: SubjectReliability['quality'] = null;
  if (kr20 != null && meanRpb != null) {
    if (kr20 >= 0.8 && meanRpb >= 0.25) quality = 'A';
    else if (kr20 >= 0.7 && meanRpb >= 0.15) quality = 'B';
    else quality = 'C';
  }

  return { items: k, kr20, meanRpb, quality };
}

/** 왜도 — +면 저득점 쏠림, −면 고득점 쏠림 (리포트 해석과 동일) */
export function skewness(values: number[]): number | null {
  const n = values.length;
  if (n < 3) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const m2 = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  if (m2 === 0) return null;
  const m3 = values.reduce((s, v) => s + (v - mean) ** 3, 0) / n;
  return Math.round((m3 / m2 ** 1.5) * 10) / 10;
}

/** 초과첨도 — +면 양극화(쌍봉 의심), −면 평탄 */
export function kurtosis(values: number[]): number | null {
  const n = values.length;
  if (n < 4) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const m2 = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  if (m2 === 0) return null;
  const m4 = values.reduce((s, v) => s + (v - mean) ** 4, 0) / n;
  return Math.round((m4 / m2 ** 2 - 3) * 10) / 10;
}

/** 난이도 구분 — 리포트 기준(학교 정답률): 쉬움 >=85%, 어려움 <30% */
export type ItemDifficulty = '쉬움' | '보통' | '어려움';
export function classifyItemDifficulty(correctRate: number): ItemDifficulty {
  if (correctRate >= 85) return '쉬움';
  if (correctRate < 30) return '어려움';
  return '보통';
}

/** 변별 구분 — 고변별 rpb>=0.3, 역변별 rpb<0 (문항이 거꾸로 작동) */
export type ItemDiscriminationBand = '고변별' | '저변별' | '역변별' | '미상';
export function classifyDiscrimination(rpb: number | null): ItemDiscriminationBand {
  if (rpb == null) return '미상';
  if (rpb < 0) return '역변별';
  if (rpb >= 0.3) return '고변별';
  return '저변별';
}

/**
 * 그 판정이 **표본으로 뒷받침되는가**. 신뢰구간이 경계(0.3 또는 0)를 걸치면 판정이 뒤집힐 수 있다.
 *
 * 이 화면은 문항마다 '고변별/저변별'을 단정해 왔는데, 실측 재현성이 0.23~0.73 이라
 * 상당수 문항에서 그 단정이 표본 요동이다(위 `rpbCI` 주석). 값을 감추지는 않는다 —
 * **확실한 것과 불확실한 것을 구분해서 보여 주는 것**이 목적이다.
 */
export function isDiscriminationConclusive(stat: Pick<ItemStat, 'rpb' | 'rpbCI'>): boolean {
  if (stat.rpb == null || !stat.rpbCI) return false;
  const [lo, hi] = stat.rpbCI;
  if (lo < 0 && hi > 0) return false;      // 역변별인지조차 모른다
  return !(lo < 0.3 && hi >= 0.3);         // 고변별 경계를 걸친다
}
