// 내신 교과군 요약 (전교과 / 국영수사과 / 국영수사 / 국영수과 / 과목군별)
//
// 상담에서 실제로 쓰이는 숫자는 "전교과 평균" 하나가 아니라 **반영 교과 조합별 평균**이다.
// 대학마다 반영 교과가 다르므로(국영수사과, 국영수사, 국영수과 …) 같은 학생도 조합에
// 따라 등급이 0.5 이상 벌어진다. 이 모듈은 그 조합들을 한 번에 계산한다.
//
// 계산식은 서버 `get_wishlist_naesin` 과 **동일**하다:
//   가중평균 = Σ(rank × units) / Σ(units),  대상 = category='regular' ∧ rank≠null ∧ units>0
// (진로선택·P/F 과목은 등급이 없으므로 제외 — 서버와 어긋나면 같은 화면에서 두 숫자가
//  달라 보인다.)
//
// React 비의존 순수 모듈 — Node 회귀 테스트가 그대로 import 한다.

/** 계산 입력 한 건 (get_wishlist_subjects 한 행에서 필요한 필드만) */
export interface NaesinSubjectInput {
  category: string;
  subjectGroup: string;
  units: number;
  rank: number | null;
}

/** 정규화된 교과군 키 */
export type NaesinGroupKey = '국어' | '수학' | '영어' | '사회' | '과학' | '한국사' | '기타';

/**
 * 생기부 `subject_group` 원문 → 교과군 키.
 *
 * 주의: **한국사는 사회에 넣지 않는다.** 2015·2022 교육과정 편제에서 한국사는 사회와
 * 분리된 교과군이고 라이브 데이터도 별도 값으로 저장돼 있다. 대학이 "사회"에 한국사를
 * 포함해 반영하는 경우가 있지만 그 판단은 전형별 반영방법(naesinRule)의 몫이며,
 * 여기서 임의로 합치면 요약 숫자와 전형 반영 내신이 서로 어긋난다.
 */
export function normalizeSubjectGroup(raw: string | null | undefined): NaesinGroupKey {
  const g = (raw ?? '').trim();
  if (!g) return '기타';
  if (g.startsWith('국어')) return '국어';
  if (g.startsWith('수학')) return '수학';
  if (g.startsWith('영어')) return '영어';
  if (g.startsWith('한국사')) return '한국사';
  if (g.startsWith('사회')) return '사회';   // '사회(역사/도덕포함)'
  if (g.startsWith('과학')) return '과학';
  return '기타';
}

/** 한 조합의 계산 결과 */
export interface NaesinGroupStat {
  /** 가중평균 등급 (해당 과목이 없으면 null) */
  avg: number | null;
  /** 계산에 들어간 과목 수 */
  count: number;
  /** 계산에 들어간 이수단위 합 */
  units: number;
}

/** 표시할 조합 정의 — key 는 화면 라벨과 동일 */
export const NAESIN_COMBOS: Array<{ key: string; groups: NaesinGroupKey[] | null }> = [
  { key: '전교과', groups: null }, // null = 전 교과군
  { key: '국영수사과', groups: ['국어', '영어', '수학', '사회', '과학'] },
  { key: '국영수사', groups: ['국어', '영어', '수학', '사회'] },
  { key: '국영수과', groups: ['국어', '영어', '수학', '과학'] },
];

/** 개별 교과군 표시 순서 */
export const NAESIN_SINGLE_GROUPS: NaesinGroupKey[] = ['국어', '영어', '수학', '사회', '과학', '한국사'];

export interface NaesinSummary {
  /** 조합별 (전교과·국영수사과·국영수사·국영수과) */
  combos: Record<string, NaesinGroupStat>;
  /** 교과군별 (국어·영어·수학·사회·과학·한국사·기타) */
  groups: Record<NaesinGroupKey, NaesinGroupStat>;
  /** 계산 대상이 하나라도 있었는지 */
  hasData: boolean;
}

const EMPTY: NaesinGroupStat = { avg: null, count: 0, units: 0 };

function weightedAvg(rows: NaesinSubjectInput[]): NaesinGroupStat {
  let sum = 0;
  let units = 0;
  let count = 0;
  for (const r of rows) {
    if (r.rank == null || !Number.isFinite(r.rank)) continue;
    if (!Number.isFinite(r.units) || r.units <= 0) continue;
    sum += r.rank * r.units;
    units += r.units;
    count += 1;
  }
  if (units <= 0) return { ...EMPTY };
  // 서버와 같은 자리수(소수 3자리)로 반올림해 표시 단계에서만 2자리로 줄인다.
  return { avg: Math.round((sum / units) * 1000) / 1000, count, units };
}

/**
 * 교과군 요약 계산.
 * `category='regular'`(석차등급이 나오는 정량 과목)만 대상 — 서버 평균과 동일 모집단.
 */
export function summarizeNaesin(subjects: NaesinSubjectInput[] | null | undefined): NaesinSummary {
  const rows = (subjects ?? []).filter(
    (s) => s.category === 'regular' && s.rank != null && Number(s.units) > 0
  );

  const byGroup = new Map<NaesinGroupKey, NaesinSubjectInput[]>();
  for (const r of rows) {
    const k = normalizeSubjectGroup(r.subjectGroup);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k)!.push(r);
  }

  const groups = {} as Record<NaesinGroupKey, NaesinGroupStat>;
  for (const k of ['국어', '수학', '영어', '사회', '과학', '한국사', '기타'] as NaesinGroupKey[]) {
    groups[k] = weightedAvg(byGroup.get(k) ?? []);
  }

  const combos: Record<string, NaesinGroupStat> = {};
  for (const combo of NAESIN_COMBOS) {
    const pick = combo.groups
      ? rows.filter((r) => combo.groups!.includes(normalizeSubjectGroup(r.subjectGroup)))
      : rows;
    combos[combo.key] = weightedAvg(pick);
  }

  return { combos, groups, hasData: rows.length > 0 };
}
