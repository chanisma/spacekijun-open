/**
 * 참고 등급(EBS 예상 등급컷 기반) — **단일 출처**.
 *
 * ## 왜 "참고" 인가
 * `mock_grade_cut` 의 `source='EBS'` 는 EBS 가 추정한 예상 등급컷이다. 시험 주관사가 발표한
 * 공식 등급이 아니다. 그래서 이 모듈이 내는 등급은
 *   · **공식 등급이 없을 때만** 쓰고 (`mock_result[].grade` 가 있으면 그쪽이 이긴다)
 *   · 화면에 반드시 '참고'로 표시하며
 *   · **학생별로 저장하지 않는다** — 컷만 저장하고 읽을 때 계산한다.
 * 저장하지 않는 것이 핵심이다. 저장하는 순간 어딘가에서 공식 등급과 섞인다.
 *
 * ## 원점수
 * 등급컷은 원점수 기준이므로 원점수가 먼저 필요하다. 원점수 = Σ(맞은 문항의 배점) 이고,
 * 이 식이 공식 원점수와 정확히 일치함은 2026-03 에서 검증했다(영어 589/589 · 한국사 588/588 ·
 * 국어 399/399). 3학년 국어·수학은 공통+선택을 합쳐야 100점이 되는데,
 * `fetchMockProblems` 가 이미 공통과 선택을 병합해 문항 1~45(또는 1~30)로 돌려주므로
 * 여기서는 따로 트랙을 신경 쓰지 않아도 된다.
 *
 * ## 배점이 없으면 계산하지 않는다
 * 리로스쿨 CSV 에 배점이 없어 일부 회차는 `point` 가 전부 2로 들어가 있다. 그 상태로 계산하면
 * 국어 45문항이 90점 만점이 되어 1등급컷 90 을 아무도 넘지 못한다 — 틀린 등급을 조용히
 * 보여주느니 아무것도 보여주지 않는 편이 낫다. `maxScore` 와 실제 배점 합이 다르면 null.
 */
import type { MockProblem } from '../types';
import type { GradedMarkingItem } from './mockGrading';

export interface GradeCut {
  subject: string;
  source: 'EBS' | 'official';
  maxScore: number;
  /** 등급 -> 그 등급을 받는 최소 원점수 */
  cuts: Record<string, number>;
  isAbsolute: boolean;
  nationalMean: number | null;
  nationalSd: number | null;
  /**
   * 등급컷 지점의 누적 백분위. 키는 `max`(만점) + `"1".."8"`(각 등급컷).
   * 대응 원점수는 `maxScore` 와 `cuts` 에 있다. 영어·한국사는 절대평가라 없다.
   */
  cutPercentiles?: Record<string, number> | null;
}

export interface RawScoreResult {
  rawScore: number;
  /** 채점에 쓰인 문항들의 배점 합. maxScore 와 다르면 배점이 덜 적재된 것이다. */
  totalPoints: number;
  /** 정오를 판정하지 못한 문항 수 */
  ungraded: number;
}

/**
 * 원점수 계산. `gradeMarkingSubject` 결과와 문항 메타(배점)를 합친다.
 * 문항 메타가 없는 항목은 배점을 알 수 없으므로 총점에도 넣지 않는다.
 */
export function computeRawScore(
  items: GradedMarkingItem[],
  problemsByNumber: Map<number, Pick<MockProblem, 'point'>>
): RawScoreResult {
  let rawScore = 0;
  let totalPoints = 0;
  let ungraded = 0;

  for (const item of items) {
    const point = problemsByNumber.get(item.problemNumber)?.point;
    if (point == null) continue;
    totalPoints += point;
    if (item.isCorrect === true) rawScore += point;
    else if (item.isCorrect === null) ungraded += 1;
  }

  return { rawScore, totalPoints, ungraded };
}

/**
 * 원점수 -> 등급. 컷은 "그 등급을 받는 최소 원점수"라 위에서부터 내려오며 처음 만족하는 등급이 답이다.
 * 8등급 컷에도 못 미치면 9등급.
 */
export function gradeFromCuts(rawScore: number, cuts: Record<string, number>): number | null {
  if (!Number.isFinite(rawScore)) return null;
  for (let g = 1; g <= 8; g++) {
    const cut = cuts[String(g)];
    if (typeof cut === 'number' && rawScore >= cut) return g;
  }
  return 9;
}

export interface ReferenceGrade {
  grade: number;
  rawScore: number;
  maxScore: number;
  source: 'EBS' | 'official';
  isAbsolute: boolean;
  /** 전국 평균 대비 차이(전국 평균이 있을 때만) */
  vsNationalMean: number | null;
  /**
   * 원점수에서 근사한 백분위(0~100). 등급컷마다 함께 발표된 백분위를 앵커로 보간한다.
   * 절대평가(영어·한국사)는 백분위 자체가 없어 null.
   * **등급보다 이 값이 해상도가 높다** — 등급 한 칸이 백분위 10~20 폭을 덮는다.
   */
  percentile: number | null;
}

/**
 * 참고 등급을 낸다. 계산할 수 없으면 null — 화면은 그냥 아무것도 보여주지 않는다.
 *
 * 계산 불가 조건:
 *   · 등급컷이 없다(그 회차·과목이 아직 수집되지 않음)
 *   · **배점이 덜 적재됐다**(배점 합 ≠ 만점) — 이 상태의 원점수는 틀린 값이다
 */
export function computeReferenceGrade(
  raw: RawScoreResult,
  cut: GradeCut | null | undefined
): ReferenceGrade | null {
  if (!cut) return null;
  if (raw.totalPoints !== cut.maxScore) return null;

  const grade = gradeFromCuts(raw.rawScore, cut.cuts);
  if (grade == null) return null;

  return {
    grade,
    rawScore: raw.rawScore,
    maxScore: cut.maxScore,
    source: cut.source,
    isAbsolute: cut.isAbsolute,
    vsNationalMean: cut.nationalMean == null ? null : Math.round((raw.rawScore - cut.nationalMean) * 10) / 10,
    percentile: estimatePercentile(raw.rawScore, cut),
  };
}

/**
 * 원점수 -> **백분위 근사** (EBS 가 등급컷마다 함께 발표하는 백분위를 앵커로 선형보간).
 *
 * ## 왜 필요한가
 * 등급은 9칸뿐이라 **같은 등급 안의 차이가 통째로 사라진다** — 3등급 맨 위와 맨 아래가 같은
 * 값이 된다. 수능까지 남은 성적을 다루려면 그 해상도로는 부족하다. 백분위는 100칸이라
 * 같은 등급 안의 위치까지 남는다.
 *
 * ## 앵커
 *   (0, 0) · (cuts[8], p8) · … · (cuts[1], p1) · (maxScore, pMax)
 * 사이는 선형보간한다. 실제 원점수↔백분위 관계는 정규분포꼴이라 구간 안에서 곡선이지만,
 * 앵커가 9개라 구간이 좁아 직선으로 근사해도 오차가 크지 않다.
 *
 * ## 한계 (반드시 화면에 밝힐 것)
 *   · **EBS 추정 등급컷 위에 얹은 근사**다. 공식 백분위가 아니다.
 *   · 앵커 사이는 직선 가정이라 구간 가운데에서 오차가 가장 크다.
 *   · 만점 위·0점 아래는 없으므로 잘라낸다(clamp).
 * 그래서 이 값은 "몇 등인지"가 아니라 "대략 어디쯤인지"를 말하는 용도다.
 *
 * @returns 0~100 백분위. 백분위 앵커가 없으면(절대평가 등) null.
 */
export function estimatePercentile(
  rawScore: number,
  cut: Pick<GradeCut, 'maxScore' | 'cuts' | 'cutPercentiles'> | null | undefined
): number | null {
  if (!cut?.cutPercentiles || !Number.isFinite(rawScore)) return null;

  const pts: { raw: number; pct: number }[] = [{ raw: 0, pct: 0 }];
  let cutAnchors = 0;
  for (let g = 8; g >= 1; g--) {
    const raw = cut.cuts?.[String(g)];
    const pct = cut.cutPercentiles[String(g)];
    if (typeof raw === 'number' && typeof pct === 'number') {
      pts.push({ raw, pct });
      cutAnchors++;
    }
  }
  const pMax = cut.cutPercentiles.max;
  if (typeof pMax === 'number' && typeof cut.maxScore === 'number') {
    pts.push({ raw: cut.maxScore, pct: pMax });
  }
  /*
    **등급컷 앵커가 너무 적으면 계산하지 않는다.** (0,0) 과 만점만 있으면 `pts` 는 2개라
    보간은 되지만 0~만점을 직선 하나로 잇는 셈이라 근거가 없다 — 중간 점수에 대해
    "그럴듯하지만 아무 뜻 없는" 백분위가 나온다(회귀가 잡은 실제 결함). 실데이터는 늘 8개이므로
    이 하한은 방어이고, 걸리면 값을 내지 않는 편이 낫다.
  */
  if (cutAnchors < 3) return null;

  // 원점수 오름차순. 같은 원점수가 겹치면(1등급컷 = 만점인 과목이 실재한다) 높은 백분위를 남긴다
  pts.sort((a, b) => a.raw - b.raw || a.pct - b.pct);
  const anchors: { raw: number; pct: number }[] = [];
  for (const pt of pts) {
    const last = anchors[anchors.length - 1];
    if (last && last.raw === pt.raw) anchors[anchors.length - 1] = pt;
    else anchors.push(pt);
  }

  const x = Math.max(anchors[0].raw, Math.min(rawScore, anchors[anchors.length - 1].raw));
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (x <= b.raw) {
      const t = b.raw === a.raw ? 1 : (x - a.raw) / (b.raw - a.raw);
      const pct = a.pct + t * (b.pct - a.pct);
      return Math.round(Math.max(0, Math.min(100, pct)) * 10) / 10;
    }
  }
  return anchors[anchors.length - 1].pct;
}

/**
 * 백분위 -> 등급. 수능 9등급의 정의(누적 4·11·23·40·60·77·89·96%)를 뒤집은 표이고,
 * 값은 "그 등급을 받는 **최소** 백분위"다.
 *
 * 근사 백분위에서 등급을 되돌릴 때 쓴다 — 경계에서 원래 등급과 한 칸 어긋날 수 있다
 * (백분위 자체가 근사라서다). 등급이 이미 있으면 **그 등급이 정본**이고 이 함수를 쓰지 말 것.
 */
const PERCENTILE_GRADE_MIN = [96, 89, 77, 60, 40, 23, 11, 4];
export function gradeFromPercentile(percentile: number): number | null {
  if (!Number.isFinite(percentile)) return null;
  for (let g = 1; g <= 8; g++) if (percentile >= PERCENTILE_GRADE_MIN[g - 1]) return g;
  return 9;
}
