// 지원 항목 1건에서 파생되는 판단값의 **단일 출처**.
//
// 왜 따로 뺐나: 이 값들(전형 반영 내신 / 9등급 환산 / 적합도 / 수능최저 충족)은
// 원래 `WishlistItemCard` 안 useMemo 에만 있었다. 비교표가 같은 계산을 다시 적으면
// 같은 학생·같은 전형인데 카드와 표의 숫자가 갈라지고, 상담 중에 그게 드러나면
// 두 숫자 중 어느 쪽도 못 믿게 된다. 그래서 계산은 여기 한 곳에만 둔다.
//
// React 비의존 순수 모듈 — Node 회귀 테스트가 그대로 import 한다.

import type { WishlistItem, FitVerdict, CsatCheckValue } from '../types';
import { computeFit, toGrade9 } from './fit';
import { parseNaesinRule, computeRuleNaesin, type NaesinRule, type NaesinResult, type SubjectRecord } from './naesinRule';
import {
  judgeCsat, judgeCsatForDepartment,
  type CsatDeptResult, type CsatVerdict, type MockSubject,
} from './csat';
import {
  pickRuleForDepartment, toParsedRule,
  type CsatRule, type RuleMatchKind,
} from './csatRule';

/** 학생 성적 컨텍스트 — 목록의 모든 항목이 공유한다(학생당 1회 fetch) */
export interface StudentContext {
  naesin: { avgGrade: number | null; isFiveTier: boolean; subjectCount?: number | null } | null;
  subjects: SubjectRecord[] | null;
  /** 수능최저 판정용 최신 회차 */
  mock: { academicYear: number | null; examMonth: number | null; subjects: MockSubject[] } | null;
  /** 6월·9월 등 회차별 판정용 전 회차 (최신 → 과거) */
  mockRounds?: Array<{ academicYear: number | null; examMonth: number | null; subjects: MockSubject[] }> | null;
  /**
   * 수능최저 구조화 규칙 (gyogwa_id → 규칙들).
   * 있으면 **원문 재해석보다 우선** 쓴다 — 학과 범위가 이미 갈라져 있어
   * 원문 파싱이 보류하던 경우(학과 분기 모호·계열 표기)를 판정할 수 있다.
   */
  csatRules?: Map<string, CsatRule[]> | null;
  /** 학생 계열 (인문/자연) — 계열 기준 규칙은 이걸 알 때만 쓴다 */
  series?: '인문' | '자연' | null;
}

/** `WishlistItem` 에서 수동 판정이 저장되는 필드 이름 */
export type CsatCheckField = 'csatCheck6' | 'csatCheck9';

/** 비교표에서 판정하는 모의고사 회차 정의 (UI·계산·저장·내보내기 공통 출처) */
export interface CsatRoundSpec {
  month: number;
  label: string;
  field: CsatCheckField;
}

/**
 * 한 회차에 대한 수능최저 판정.
 *
 * 값이 셋인 이유: 자동 판정(`autoVerdict`)과 사람이 저장한 판정(`manualVerdict`)을
 * 각각 보존하고, 화면에 쓸 값(`verdict`)은 **수동 우선**으로 파생한다. 자동값을
 * 덮어써 버리면 나중에 "원래 시스템은 뭐라고 했나"를 되물을 수 없다.
 */
export interface CsatRoundJudgement {
  /** 회차 라벨 (예: '6월', '9월') */
  label: string;
  month: number;
  field: CsatCheckField;
  academicYear: number | null;
  examMonth: number | null;
  /** 자동 판정 원본 (학과 매칭·파싱 결과 포함). 판정 못 하면 null */
  result: CsatDeptResult | null;
  /** 자동 판정 결론 — 보류·불가는 null */
  autoVerdict: CsatCheckValue | null;
  /** 사용자가 저장한 판정 — 없으면 null */
  manualVerdict: CsatCheckValue | null;
  /** 표시할 값 = 수동 우선, 없으면 자동 */
  verdict: CsatCheckValue | null;
  /** 표시값이 사용자 입력인지 */
  isManual: boolean;
  /**
   * 구조화 규칙으로 판정했다면 그 범위. 원문 파싱으로 판정했으면 null.
   * 화면이 "무엇을 근거로 이 학과에 이 기준을 적용했는지" 밝히는 데 쓴다.
   */
  ruleScope: { kind: RuleMatchKind; labels: string[]; matchedTerm: string | null } | null;
}

export interface ItemInsight {
  /** 5등급제 학생인지 (컷과 척도가 달라 환산이 필요) */
  isFiveTier: boolean;
  /** 전형 반영방법 파싱 결과 (certain=false 면 계산 보류) */
  parsedRule: NaesinRule | null;
  /** 전형 맞춤 내신 계산 결과 */
  ruleNaesin: NaesinResult | null;
  /** 반영방법을 재현할 수 없어 계산을 보류했는지 */
  naesinWithheld: boolean;
  /** 적합도 판정에 쓴 내신 (그 학생의 척도 기준값) */
  effectiveGrade: number | null;
  /** 5등급제 학생의 9등급 환산값 (9등급제면 null) */
  convertedGrade: number | null;
  /** 컷과 **같은 척도**로 비교 가능한 등급 — 5등급제면 환산값, 아니면 원값 */
  comparableGrade: number | null;
  /** 표시 라벨 — 이 숫자가 무엇인지 (전형 반영 내신 / 전과목 평균 / 환산) */
  gradeLabel: string;
  /** 적합도 */
  fit: FitVerdict;
  /** 최신 회차 기준 수능최저 **자동** 판정 (교과·has_csat 일 때만) */
  csat: CsatDeptResult | null;
  /** 회차별 수능최저 판정 (6월·9월 …) — 비교표 '최저 충족여부' 행 */
  csatRounds: CsatRoundJudgement[];
  /**
   * 카드·보드 배지에 쓸 대표 판정.
   * 최신 모의 회차에 사용자가 저장한 판정이 있으면 그것을, 없으면 자동 판정을 쓴다.
   */
  csatHeadline: { verdict: CsatCheckValue | null; isManual: boolean };
  /**
   * 이 항목의 **세부전공에 적용되는** 수능최저 조건.
   * 구조화 규칙으로 범위를 가려낸 경우만 채워진다 — 못 가리면 null 이고 화면은 원문 전체를 보여준다.
   */
  csatApplied: { conditionText: string; scopeLabels: string[]; scopeKind: RuleMatchKind } | null;
}

/**
 * 전 회차 중 특정 월(6·9월 등) 회차를 고른다.
 * `mockRounds` 는 최신 → 과거 순이므로 **가장 먼저 만나는 것이 가장 최근 회차**다.
 */
export function pickMockRound(
  rounds: StudentContext['mockRounds'],
  month: number
): { academicYear: number | null; examMonth: number | null; subjects: MockSubject[] } | null {
  return (rounds ?? []).find((r) => r.examMonth === month) ?? null;
}

/**
 * 비교표에서 판정·저장하는 회차 (모의고사 6월·9월).
 * 회차를 늘리려면 여기 한 줄 + `admission_wishlist` 컬럼 하나를 함께 추가한다
 * (UI·계산·저장·엑셀이 전부 이 배열을 돈다).
 */
export const CSAT_ROUND_MONTHS: CsatRoundSpec[] = [
  { month: 6, label: '6월', field: 'csatCheck6' },
  { month: 9, label: '9월', field: 'csatCheck9' },
];

/** CsatVerdict('meet'|'fail'|'unknown') → 저장 가능한 값. 'unknown'/없음은 null */
function toCheckValue(v: CsatVerdict | null | undefined): CsatCheckValue | null {
  return v === 'meet' || v === 'fail' ? v : null;
}

/**
 * 항목 1건의 파생 판단값 계산.
 * 카드(`WishlistItemCard`)와 비교표(`ComparisonTable`)가 **모두 이 함수**를 쓴다.
 */
export function computeItemInsight(item: WishlistItem, ctx: StudentContext): ItemInsight {
  const { naesin, subjects, mock, mockRounds } = ctx;
  const isFiveTier = naesin?.isFiveTier ?? false;

  // 수능최저 — 교과 전형이고 has_csat 이며 모의 성적이 있을 때만 판정 시도.
  const csatText = item.gyogwa?.csat ?? null;
  const canJudgeCsat = !!item.gyogwa?.has_csat && !!csatText;
  const csat =
    canJudgeCsat && mock && mock.subjects.length > 0
      ? judgeCsatForDepartment(csatText, item.department, mock.subjects)
      : null;

  // 회차별(6·9월) 판정 — 같은 기준을 회차별 성적에 다시 적용하고,
  // 사용자가 저장한 수동 판정이 있으면 그것을 표시값으로 올린다.
  //
  // **자동 판정이 불가능한 항목도 회차 칸은 만든다** — 종합전형은 구조화된 최저
  // 데이터가 아예 없고 교과도 학과 분기가 모호하면 보류로 떨어지는데, 사람이
  // 직접 채워 넣을 자리가 바로 그 칸이기 때문이다.
  // 구조화 규칙이 있으면 그것으로 먼저 판정한다.
  // 원문 재해석은 학과 분기가 모호하거나 계열 표기(`인문:`/`자연:`)면 보류하는데,
  // 규칙은 그 범위를 이미 갈라 두었다(사람이 만든 게 아니라 검증을 통과한 것만 저장된다).
  const rules = (ctx.csatRules?.get(item.gyogwa?.id ?? '') ?? []) as CsatRule[];
  const ruleMatch = rules.length > 0
    ? pickRuleForDepartment(rules, item.department, ctx.series ?? null)
    : null;

  const csatRounds: CsatRoundJudgement[] = CSAT_ROUND_MONTHS.map((spec) => {
    const round = pickMockRound(mockRounds, spec.month);
    const hasMock = !!round && round.subjects.length > 0;

    let result: CsatDeptResult | null = null;
    let scope: CsatRoundJudgement['ruleScope'] = null;

    if (ruleMatch?.rule && hasMock) {
      const judged = judgeCsat(toParsedRule(ruleMatch.rule), round!.subjects);
      result = {
        kind: 'matched',
        judge: judged,
        appliedText: ruleMatch.rule.conditionText,
        matchedLabels: ruleMatch.rule.scopeLabels.length > 0 ? ruleMatch.rule.scopeLabels : null,
      };
      scope = {
        kind: ruleMatch.kind,
        labels: ruleMatch.rule.scopeLabels,
        matchedTerm: ruleMatch.matchedTerm ?? null,
      };
    } else if (canJudgeCsat && hasMock) {
      // 규칙이 없거나 범위를 못 고르면(ambiguous) 종전 경로 — 보류하면 보류한 채 둔다.
      result = judgeCsatForDepartment(csatText, item.department, round!.subjects);
    }

    const autoVerdict = toCheckValue(result?.judge?.verdict);
    const manualVerdict = toCheckValue(item[spec.field]);
    return {
      label: spec.label,
      month: spec.month,
      field: spec.field,
      academicYear: round?.academicYear ?? null,
      examMonth: round?.examMonth ?? null,
      result,
      autoVerdict,
      manualVerdict,
      verdict: manualVerdict ?? autoVerdict,
      isManual: manualVerdict != null,
      ruleScope: scope,
    };
  });

  // 대표 배지 — 카드가 보여주는 회차(최신 모의)에 수동 판정이 있으면 그것이 이긴다.
  const headlineRound = mock?.examMonth != null
    ? csatRounds.find((r) => r.month === mock.examMonth) ?? null
    : null;
  const headlineManual = headlineRound?.manualVerdict ?? null;
  const csatHeadline = {
    // 자동값은 회차 판정(구조화 규칙 반영)을 우선 쓰고, 그 회차가 없으면 원문 판정으로 폴백
    verdict: headlineManual ?? headlineRound?.autoVerdict ?? toCheckValue(csat?.judge?.verdict),
    isManual: headlineManual != null,
  };

  // 전형 반영방법 — 3학년(9등급제) 교과 전형에서만 적용.
  // 1·2학년(5등급제)은 교육과정 구성이 달라 전형 필터를 걸지 않고 전과목으로 본다.
  const parsedRule =
    item.track === 'gyogwa' && !isFiveTier ? parseNaesinRule(item.gyogwa ?? null) : null;

  const ruleNaesin =
    item.track === 'gyogwa' && subjects && subjects.length > 0
      ? computeRuleNaesin(subjects, isFiveTier ? null : parsedRule)
      : null;

  const naesinWithheld = ruleNaesin?.withheld ?? false;

  const effectiveGrade = isFiveTier
    ? naesin?.avgGrade ?? null
    : ruleNaesin?.avgGrade != null
      ? ruleNaesin.avgGrade
      : naesin?.avgGrade ?? null;

  const convertedGrade =
    isFiveTier && effectiveGrade != null
      ? toGrade9(effectiveGrade, true, naesin?.subjectCount ?? null)
      : null;

  const comparableGrade = convertedGrade ?? effectiveGrade;

  const gradeLabel = isFiveTier
    ? '내 내신(5등급제) → 9등급 환산'
    : ruleNaesin && !ruleNaesin.fallback && !naesinWithheld
      ? '전형 반영 내신'
      : '내 내신 평균';

  const fit: FitVerdict =
    effectiveGrade == null && !naesin
      ? 'unknown'
      : computeFit({
          studentGrade: effectiveGrade,
          studentIsFiveTier: isFiveTier,
          studentSubjectCount: naesin?.subjectCount ?? null,
          cutGrade70: item.adiga?.grade70 ?? null,
          cutGrade50: item.adiga?.grade50 ?? null,
        });

  return {
    isFiveTier,
    parsedRule,
    ruleNaesin,
    naesinWithheld,
    effectiveGrade,
    convertedGrade,
    comparableGrade,
    gradeLabel,
    fit,
    csat,
    csatRounds,
    csatHeadline,
    csatApplied: ruleMatch?.rule
      ? {
          conditionText: ruleMatch.rule.conditionText,
          scopeLabels: ruleMatch.rule.scopeLabels,
          scopeKind: ruleMatch.kind,
        }
      : null,
  };
}

/* ─────────────────────── 비교표용 과년도 데이터 ─────────────────────── */

/** 비교표에서 보여주는 연도 (adiga 는 2026 을 현재값, 그 이전을 history 에 담는다) */
export const HISTORY_YEARS = ['2024', '2025', '2026'] as const;
export type HistoryYear = (typeof HISTORY_YEARS)[number];

export interface YearStat {
  competition: number | null;
  realCompetition: number | null;
  waitlist: number | null;
  fillRate: number | null;
  grade50: number | null;
  grade70: number | null;
  recruit: number | null;
}

const EMPTY_YEAR: YearStat = {
  competition: null, realCompetition: null, waitlist: null,
  fillRate: null, grade50: null, grade70: null, recruit: null,
};

/**
 * 연도별 지표를 한 모양으로 정규화한다.
 * 2026 은 adiga 최상위 컬럼에, 2024·2025 는 `history.years` 에 들어 있어 접근 경로가
 * 다르다 — 표를 그리는 쪽이 그 차이를 알 필요가 없도록 여기서 흡수한다.
 */
export function yearStatsOf(adiga: WishlistItem['adiga']): Record<HistoryYear, YearStat> {
  const years = adiga?.history?.years ?? {};
  const out = {} as Record<HistoryYear, YearStat>;
  for (const y of HISTORY_YEARS) {
    if (y === '2026') {
      out[y] = adiga
        ? {
            competition: numOrNull(adiga.competition_2026),
            realCompetition: numOrNull(adiga.real_competition_2026),
            waitlist: numOrNull(adiga.waitlist_2026),
            fillRate: numOrNull(adiga.fill_rate_2026),
            grade50: numOrNull(adiga.grade50),
            grade70: numOrNull(adiga.grade70),
            recruit: numOrNull(adiga.recruit_2026),
          }
        : { ...EMPTY_YEAR };
      continue;
    }
    const yr = years[y];
    out[y] = yr
      ? {
          competition: numOrNull(yr.competition),
          realCompetition: numOrNull(yr.realCompetition),
          waitlist: numOrNull(yr.waitlist),
          fillRate: numOrNull(yr.fillRate),
          grade50: numOrNull(yr.grade50),
          grade70: numOrNull(yr.grade70),
          recruit: numOrNull(yr.recruit),
        }
      : { ...EMPTY_YEAR };
  }
  return out;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
