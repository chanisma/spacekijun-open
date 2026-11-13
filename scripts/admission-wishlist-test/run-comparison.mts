/**
 * 지망 보드·비교표 회귀 하니스.
 * 실행: npx tsx scripts/admission-wishlist-test/run-comparison.mts
 *
 * 무엇을 고정하는가
 *  A) 교과군 요약(`naesinSummary`) — 서버 `get_wishlist_naesin` 과 같은 가중평균 식,
 *     한국사·사회 분리, 진로선택/P·F 제외.
 *  B) 항목 파생값(`itemInsight`) — 카드와 비교표가 같은 숫자를 쓰는지의 근거.
 *     특히 5등급제 학생의 **비교 가능 등급(9등급 환산)** 과 회차별 최저 판정.
 *  C) 비교표 행 정의(`comparisonRows`) — 화면·인쇄·엑셀이 같은 정의를 읽으므로
 *     여기가 곧 내보내기 스펙이다. rowSpan 불변식·빈 지망 열 정렬을 못 박는다.
 *  I) 반영 교과 선택(`naesinRule.selectSubjectVariant`) — `subjects_all` 은 **그 대학의
 *     모든 전형 규칙**을 담고 있어, 고르지 않고 이어 붙이면 남의 전형 반영 교과가 섞인다.
 *     전형명으로 하나를 고를 수 있을 때만 확정하고 **아니면 보류**하는 규칙을 고정한다.
 *  D) 정원 규칙(`tierRules`) — 상한은 **총합 하나**(16)뿐이고, 지원희망 6은 경고만이다.
 *     칸별 상한을 두면 **칸 이동이 막히는** 결함이 생기므로 그 불변식을 여기서 고정한다.
 *  H) 수능최저 구조화(`csatRule`) — **LLM 산출물을 코드가 최종 판정**하는 경계.
 *     모델이 지어낸 라벨·조건, 파서가 영역을 놓친 조건을 **버리는지**를 고정한다.
 *     통과시키면 틀린 수능최저 기준이 확신 있게 표시된다.
 *  F) 고사 일정(`admissionSchedule`) — 인덱스로 압축된 외부 구조를 푸는 유일한 경로.
 *     특히 **발표일 자동 채움을 언제 보류하는지**(모집단위별 상이 등)를 고정한다.
 *  G) 표 영역 구분(`SECTION_*`) — 행이 30줄을 넘어 축이 흐려지는 것을 막는 구조.
 *  E) 전형 변경사항(`admissionChange`) — 외부 사이트 JSON 을 그대로 받는 유일한 경로라
 *     파싱·검증이 무너지면 잘못된 입시 정보가 상담에 들어간다. 특히 **"자료 없음"과
 *     "변경 없음"을 구분**하는 규칙을 고정한다.
 */
import {
  summarizeNaesin, normalizeSubjectGroup,
  NAESIN_COMBOS, NAESIN_SINGLE_GROUPS,
  type NaesinSubjectInput,
} from '../../src/features/admission-wishlist/utils/naesinSummary';
import {
  computeItemInsight, yearStatsOf, pickMockRound,
  type StudentContext,
} from '../../src/features/admission-wishlist/utils/itemInsight';
import {
  autoFallbackText, buildComparisonRows, computeLabelSpans, toExportMatrix,
  planValue, draftFromItem, toCsatCheck, schedulesFor, otherSchedulesFor,
  cellHasControl, shouldWrapCell,
  type ComparisonColumn,
} from '../../src/features/admission-wishlist/utils/comparisonRows';
import {
  canAdd, addRejectReason, canMoveTier, isTotalFull, totalCount,
  remainingSlots, applyOverflow, splitByTier,
} from '../../src/features/admission-wishlist/utils/tierRules';
import { parseCsatRule } from '../../src/features/admission-wishlist/utils/csat';
import {
  selectSubjectVariant, subjectVariants, parseNaesinRule,
} from '../../src/features/admission-wishlist/utils/naesinRule';
import {
  buildCsatRules, buildCsatRulesFromLabels, parseScopeResponse,
  pickRuleForDepartment, verifyAreaCoverage, mapCsatRule, normalizeForMatch,
  type CsatRule, type LlmScopeAnswer,
} from '../../src/features/admission-wishlist/utils/csatRule';
import {
  extractScheduleDb, toScheduleRows, validateScheduleRows, mmddToDate,
  formatExamDate, formatSchedule, formatSchedules, resolveAnnounceDate,
  scheduleRelevance, announceSummary, matchesTrack, isMySchedule,
  matchesAdmissionName, EXAM_TYPES,
  type AdmissionSchedule, type RawScheduleDb,
} from '../../src/features/admission-wishlist/utils/admissionSchedule';
import {
  SECTION_ORDER, SECTION_LABELS,
} from '../../src/features/admission-wishlist/utils/comparisonRows';
import {
  parseComparisonYears, toChangeRow, validateChangeRows, mapChange,
  summarizeChanges, changesFullText, groupByComparison, keywordLabel,
  type RawChangeRecord,
} from '../../src/features/admission-wishlist/utils/admissionChange';
import {
  MAX_APPLY_SLOTS, MAX_TOTAL_SLOTS,
} from '../../src/features/admission-wishlist/types';
import type { WishlistItem } from '../../src/features/admission-wishlist/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${detail}`); }
}
const near = (a: number | null | undefined, b: number, eps = 0.005) =>
  a != null && Math.abs(a - b) < eps;

/* ═══════════════════ A. 교과군 요약 ═══════════════════ */
console.log('\nA. 교과군 요약 (naesinSummary)');

function sub(
  subjectGroup: string, rank: number | null, units = 4, category = 'regular'
): NaesinSubjectInput {
  return { category, subjectGroup, units, rank };
}

check('subject_group 정규화 — 사회(역사/도덕포함) → 사회',
  normalizeSubjectGroup('사회(역사/도덕포함)') === '사회');
check('subject_group 정규화 — 한국사는 사회로 접히지 않는다',
  normalizeSubjectGroup('한국사') === '한국사');
check('subject_group 정규화 — 기술・가정/… → 기타',
  normalizeSubjectGroup('기술・가정/제2외국어/한문/교양') === '기타');
check('subject_group 정규화 — 빈 값 → 기타', normalizeSubjectGroup(null) === '기타');

{
  // 국어 2등급(4단위) / 수학 3등급(4단위) → 전교과 2.5
  const s = summarizeNaesin([sub('국어', 2), sub('수학', 3)]);
  check('전교과 = 단순 가중평균', near(s.combos['전교과'].avg, 2.5),
    String(s.combos['전교과'].avg));
  check('전교과 과목 수', s.combos['전교과'].count === 2);
  check('단위 합', s.combos['전교과'].units === 8);
}

{
  // 이수단위가 다르면 가중평균 — 국어 1등급(2단위), 수학 4등급(6단위)
  //   (1*2 + 4*6) / 8 = 3.25   (산술평균 2.5 와 달라야 한다)
  const s = summarizeNaesin([sub('국어', 1, 2), sub('수학', 4, 6)]);
  check('이수단위 가중 반영 (산술평균 아님)', near(s.combos['전교과'].avg, 3.25),
    String(s.combos['전교과'].avg));
}

{
  const rows = [
    sub('국어', 2), sub('영어', 2), sub('수학', 2),
    sub('사회(역사/도덕포함)', 5), sub('과학', 1), sub('한국사', 9),
    sub('기술・가정/제2외국어/한문/교양', 9),
  ];
  const s = summarizeNaesin(rows);
  check('국영수사과 = 6개 교과군 중 5개만', near(s.combos['국영수사과'].avg, (2 + 2 + 2 + 5 + 1) / 5),
    String(s.combos['국영수사과'].avg));
  check('국영수사 (과학 제외)', near(s.combos['국영수사'].avg, (2 + 2 + 2 + 5) / 4));
  check('국영수과 (사회 제외)', near(s.combos['국영수과'].avg, (2 + 2 + 2 + 1) / 4));
  check('한국사·기타는 국영수사과에서 빠진다', s.combos['국영수사과'].count === 5);
  check('전교과에는 한국사·기타가 들어간다', s.combos['전교과'].count === 7);
  check('교과군별 — 사회', near(s.groups['사회'].avg, 5));
  check('교과군별 — 한국사는 별도', near(s.groups['한국사'].avg, 9));
}

{
  // 진로선택(career)·성취도만 있는 과목은 서버 평균과 같은 이유로 제외
  const s = summarizeNaesin([
    sub('국어', 2), sub('과학', null, 4, 'career'), sub('교양', null),
  ]);
  check('rank 없는 과목 제외', s.combos['전교과'].count === 1);
  check('category=career 제외', near(s.combos['전교과'].avg, 2));
}

{
  const s = summarizeNaesin([sub('국어', 2, 0)]); // 0단위 = 가중치 없음
  check('units<=0 제외 → 데이터 없음', s.hasData === false && s.combos['전교과'].avg === null);
}

{
  const s = summarizeNaesin(null);
  check('입력 없음 → 전 조합 null', NAESIN_COMBOS.every((c) => s.combos[c.key].avg === null));
  check('입력 없음 → 전 교과군 null', NAESIN_SINGLE_GROUPS.every((g) => s.groups[g].avg === null));
}

/* ═══════════════════ B. 항목 파생값 ═══════════════════ */
console.log('\nB. 항목 파생값 (itemInsight)');

function item(over: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: 'w1', studentCode: '00-00232', track: 'gyogwa',
    university: '테스트대', department: '테스트학과', admissionName: '교과전형',
    memo: null, sortOrder: 0, tier: 'apply',
    convertedScore: null, interviewDate: null,
    firstAnnounceDate: null, finalAnnounceDate: null,
    csatCheck6: null, csatCheck9: null,
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
    gyogwa: null, jonghap: null,
    adiga: {
      id: 'r1', university: '테스트대', major: '테스트학과', track: '교과',
      program: null, field: null, domain: null,
      grade50: 3.0, grade70: 3.5, grade_quality: null,
      recruit_2026: 20, competition_2026: 8.5, real_competition_2026: 4.2,
      waitlist_2026: 12, fill_rate_2026: 0.6,
      history: {
        years: {
          '2024': { grade50: 2.8, grade70: 3.2, recruit: 18, competition: 7.1, realCompetition: 3.4, waitlist: 9, fillRate: 0.5 },
          '2025': { grade50: 2.9, grade70: 3.4, recruit: 19, competition: 7.9, waitlist: 10, fillRate: 0.53 },
        },
      },
    },
    ...over,
  } as WishlistItem;
}

const ctx9 = (avg: number): StudentContext => ({
  naesin: { avgGrade: avg, isFiveTier: false, subjectCount: 40 },
  subjects: null, mock: null, mockRounds: null,
});

{
  // 9등급제 학생: comparableGrade = 원값 (환산 없음)
  const i = computeItemInsight(item(), ctx9(3.2));
  check('9등급제 — 환산값 없음', i.convertedGrade === null);
  check('9등급제 — comparableGrade = 원값', near(i.comparableGrade, 3.2));
  check('9등급제 — 50%컷(3.0)~70%컷(3.5) 사이 → 소신', i.fit === 'reach', i.fit);
  check('라벨 = 내 내신 평균 (과목 기록 없음)', i.gradeLabel === '내 내신 평균', i.gradeLabel);
}

{
  const i = computeItemInsight(item(), ctx9(2.0));  // 25%컷 = 2*3.0-3.5 = 2.5
  check('25%컷보다 우수 → 안정', i.fit === 'safe', i.fit);
}
{
  const i = computeItemInsight(item(), ctx9(4.5));
  check('70%컷 미달 → 위험', i.fit === 'danger', i.fit);
}
{
  const i = computeItemInsight(item({ adiga: null }), ctx9(3.2));
  check('컷 없음 → 판정불가', i.fit === 'unknown', i.fit);
}

{
  // 5등급제 학생: 컷과 척도가 달라 반드시 9등급으로 환산해 비교해야 한다.
  const ctx5: StudentContext = {
    naesin: { avgGrade: 2.15, isFiveTier: true, subjectCount: 40 },
    subjects: null, mock: null, mockRounds: null,
  };
  const i = computeItemInsight(item(), ctx5);
  check('5등급제 — 환산값 존재', i.convertedGrade != null);
  check('5등급제 — 환산은 원값보다 크다(불리해진다)',
    i.convertedGrade != null && i.convertedGrade > 2.15, String(i.convertedGrade));
  check('5등급제 — comparableGrade = 환산값',
    i.comparableGrade === i.convertedGrade);
  check('5등급제 — 라벨에 환산 명시', i.gradeLabel.includes('환산'), i.gradeLabel);
}

{
  // 회차별 수능최저: 6월은 충족, 9월은 미달이 되도록 구성.
  //   기준 = "국,수,영,탐(1) 2합 5"
  const gyogwa: WishlistItem['gyogwa'] = {
    id: 'g1', region: null, university: '테스트대', admission: '교과전형', unit: null,
    method: '교과 100', method_tags: [], unit_tags: [], quota: null, quota_text: null,
    // 라이브 표기 형식 — `admission_gyogwa_criteria.csat` 은 '중 N개 합 K' 로 저장된다
    csat_status: null, has_csat: true, csat: '국,수,영,탐(1) 중 2개 합 5',
    subjects_all: [], careers: [],
  };
  const ctxRounds: StudentContext = {
    naesin: { avgGrade: 3.0, isFiveTier: false, subjectCount: 40 },
    subjects: null,
    mock: { academicYear: 2026, examMonth: 9, subjects: [{ subject: '국어', grade: 3 }, { subject: '수학', grade: 4 }] },
    mockRounds: [
      { academicYear: 2026, examMonth: 9, subjects: [{ subject: '국어', grade: 3 }, { subject: '수학', grade: 4 }] },
      { academicYear: 2026, examMonth: 6, subjects: [{ subject: '국어', grade: 2 }, { subject: '수학', grade: 2 }] },
    ],
  };
  const i = computeItemInsight(item({ gyogwa }), ctxRounds);
  check('회차 판정 2건(6월·9월) 생성', i.csatRounds.length === 2);
  const jun = i.csatRounds.find((r) => r.label === '6월');
  const sep = i.csatRounds.find((r) => r.label === '9월');
  check('6월(2+2=4 ≤ 5) 충족', jun?.result?.judge?.verdict === 'meet', String(jun?.result?.judge?.verdict));
  check('9월(3+4=7 > 5) 미달', sep?.result?.judge?.verdict === 'fail', String(sep?.result?.judge?.verdict));

  check('pickMockRound — 최신 6월 회차를 고른다',
    pickMockRound(ctxRounds.mockRounds, 6)?.examMonth === 6);
  check('pickMockRound — 없는 월은 null',
    pickMockRound(ctxRounds.mockRounds, 11) === null);
}

{
  // 수능최저 자동 판정이 불가능해도 **회차 칸은 만든다** — 사람이 직접 채울 자리다.
  const i = computeItemInsight(item(), ctx9(3.0));
  check('has_csat 아님에도 회차 칸 2개', i.csatRounds.length === 2);
  check('자동 판정은 비어 있다', i.csatRounds.every((r) => r.autoVerdict === null));
  check('수동 판정도 비어 있다', i.csatRounds.every((r) => r.manualVerdict === null));
  check('표시값 없음', i.csatRounds.every((r) => r.verdict === null && !r.isManual));
  check('대표 배지도 없음', i.csatHeadline.verdict === null && !i.csatHeadline.isManual);
}

/* ── 수능최저 수동 판정(override) ── */
{
  const gyogwa: WishlistItem['gyogwa'] = {
    id: 'g1', region: null, university: '테스트대', admission: '교과전형', unit: null,
    method: '교과 100', method_tags: [], unit_tags: [], quota: null, quota_text: null,
    csat_status: null, has_csat: true, csat: '국,수,영,탐(1) 중 2개 합 5',
    subjects_all: [], careers: [],
  };
  const rounds = {
    naesin: { avgGrade: 3.0, isFiveTier: false, subjectCount: 40 },
    subjects: null,
    // 9월 = 3+4=7 > 5 → 자동 '미충족'
    mock: { academicYear: 2026, examMonth: 9, subjects: [{ subject: '국어', grade: 3 }, { subject: '수학', grade: 4 }] },
    mockRounds: [
      { academicYear: 2026, examMonth: 9, subjects: [{ subject: '국어', grade: 3 }, { subject: '수학', grade: 4 }] },
      { academicYear: 2026, examMonth: 6, subjects: [{ subject: '국어', grade: 2 }, { subject: '수학', grade: 2 }] },
    ],
  } satisfies StudentContext;

  // 자동은 9월 '미충족'인데 사람이 '충족'으로 덮어쓴 상태
  const overridden = computeItemInsight(item({ gyogwa, csatCheck9: 'fail' }), rounds);
  const sep = overridden.csatRounds.find((r) => r.month === 9)!;
  check('자동 판정은 그대로 보존된다', sep.autoVerdict === 'fail');

  const flipped = computeItemInsight(item({ gyogwa, csatCheck9: 'meet' }), rounds);
  const sep2 = flipped.csatRounds.find((r) => r.month === 9)!;
  check('수동 판정이 자동을 이긴다', sep2.verdict === 'meet' && sep2.isManual);
  check('덮어써도 자동 판정은 남는다(되돌리기 가능)', sep2.autoVerdict === 'fail');
  check('대표 배지도 수동값을 따른다(최신 회차 = 9월)',
    flipped.csatHeadline.verdict === 'meet' && flipped.csatHeadline.isManual);

  // 다른 회차(6월)를 덮어써도 최신 회차(9월) 배지는 자동값 유지
  const only6 = computeItemInsight(item({ gyogwa, csatCheck6: 'fail' }), rounds);
  check('6월만 덮어쓰면 9월은 자동 유지',
    only6.csatRounds.find((r) => r.month === 9)!.verdict === 'fail'
    && !only6.csatRounds.find((r) => r.month === 9)!.isManual);
  check('6월은 수동값 적용', only6.csatRounds.find((r) => r.month === 6)!.isManual);
  check('대표 배지는 최신 회차 기준이라 자동', !only6.csatHeadline.isManual);

  // 자동 판정이 아예 불가능한 종합전형에도 수동 저장이 통해야 한다
  const jonghapManual = computeItemInsight(
    item({ track: 'jonghap', csatCheck6: 'meet' }), rounds,
  );
  const jun = jonghapManual.csatRounds.find((r) => r.month === 6)!;
  check('종합전형 — 자동은 없지만 수동은 적용', jun.autoVerdict === null && jun.verdict === 'meet');
}

/* ═══════════════════ C. 비교표 행 정의 ═══════════════════ */
console.log('\nC. 비교표 (comparisonRows)');

const rows = buildComparisonRows();
const col = (it: WishlistItem, ctx: StudentContext): ComparisonColumn => ({
  item: it, insight: computeItemInsight(it, ctx),
});

{
  const spans = computeLabelSpans(rows);
  const total = spans.reduce((a, b) => a + b, 0);
  check('rowSpan 합 == 행 수 (열이 밀리지 않는다)', total === rows.length,
    `${total} vs ${rows.length}`);
  check('그룹 없는 행은 span 1',
    rows.every((r, i) => (r.group ? true : spans[i] === 1)));
  // 그룹의 첫 행만 span>0, 나머지는 0
  const compIdx = rows.map((r, i) => (r.group === 'competition' ? i : -1)).filter((i) => i >= 0);
  check('과년도 경쟁률 3개년 묶음', compIdx.length === 3);
  check('묶음 첫 행에만 라벨 셀', spans[compIdx[0]] === 3 && spans[compIdx[1]] === 0 && spans[compIdx[2]] === 0);
}

{
  const c = col(item(), ctx9(3.2));
  const byKey = (k: string) => rows.find((r) => r.key === k)!;
  check('대학 행', byKey('university').text(c) === '테스트대');
  check('전형 행에 트랙+전형명', byKey('admission').text(c) === '학생부교과 · 교과전형',
    byKey('admission').text(c));
  check('지원 수준 행 = 적합도 라벨', byKey('fit').text(c) === '소신', byKey('fit').text(c));
  check('내신 vs 70%컷 (양쪽 2자리 정렬)', byKey('myGrade').text(c) === '3.20 vs 3.50',
    byKey('myGrade').text(c));

  // 2026 은 adiga 최상위, 2024·2025 는 history — 표는 그 차이를 몰라야 한다
  check('경쟁률 2026 (실질 병기)', byKey('competition-2026').text(c) === '8.50:1 (실질 4.20:1)',
    byKey('competition-2026').text(c));
  check('경쟁률 2024 (history)', byKey('competition-2024').text(c) === '7.10:1 (실질 3.40:1)',
    byKey('competition-2024').text(c));
  check('경쟁률 2025 — 실질 없으면 병기 안 함', byKey('competition-2025').text(c) === '7.90:1',
    byKey('competition-2025').text(c));
  check('추합 2026 (충원율 %)', byKey('waitlist-2026').text(c) === '12명 (60%)',
    byKey('waitlist-2026').text(c));
  check('합격자 70% 2024', byKey('g70-2024').text(c) === '3.20', byKey('g70-2024').text(c));
  check('정수 컷도 자리를 채운다',
    byKey('g50-2026').text(col(item({ adiga: { ...item().adiga!, grade50: 3 } }), ctx9(3.2))) === '3.00');
  check('모집인원 2025', byKey('recruit-2025').text(c) === '19명', byKey('recruit-2025').text(c));
  check('종합전형 수능최저 = 모집요강 확인',
    byKey('csat').text(col(item({ track: 'jonghap' }), ctx9(3.2))) === '모집요강 확인');
  check('교과 + has_csat 아님 → 없음', byKey('csat').text(c) === '없음', byKey('csat').text(c));
}

{
  // history 가 아예 없는 항목도 표가 깨지지 않아야 한다
  const bare = item({ adiga: null });
  const c = col(bare, ctx9(3.2));
  const stats = yearStatsOf(bare.adiga);
  check('adiga 없음 → 연도 지표 전부 null', stats['2026'].competition === null);
  check('adiga 없음 → 경쟁률 셀 "-"',
    rows.find((r) => r.key === 'competition-2026')!.text(c) === '-');
}

{
  // 편집 초안이 저장값을 덮어 읽는가 (저장 전에도 표·내보내기가 최신 입력을 반영)
  const it = item({ convertedScore: '900', memo: '저장된 메모' });
  const saved = col(it, ctx9(3.0));
  check('초안 없으면 저장값', planValue(saved, 'convertedScore') === '900');

  const edited: ComparisonColumn = {
    ...saved,
    draft: { ...draftFromItem(it), convertedScore: '987.5', memo: '' },
  };
  check('초안 있으면 초안값', planValue(edited, 'convertedScore') === '987.5');
  check('초안으로 지운 값은 빈 문자열', planValue(edited, 'memo') === '');
  check('편집 행 text 는 빈 값을 "-" 로',
    rows.find((r) => r.key === 'memo')!.text(edited) === '-');
  check('draftFromItem 은 null 을 빈 문자열로',
    draftFromItem(item()).convertedScore === '');
}

{
  // 학교 일정: 사용자 입력이 없으면 종합전형 면접 시간 정보를 참고값으로 보여준다
  const withInterview = item({
    track: 'jonghap',
    jonghap: {
      code: 'j1', name: '테스트대', region: null, recruitment: 10,
      has_doc_eval: true, doc_top_factors: [{ name: '학업역량', value: 40, standard: null }],
      doc_parsed_ratios: null, doc_section_text: null, doc_content_tables: null,
      has_interview: true, interview_status: '실시', interview_methods: ['개별면접'],
      interview_blocks: null, interview_top_factors: null,
      interview_primary_time: '11월 22일', interview_primary_process: null, interview_primary_source: null,
    },
  });
  const c = col(withInterview, ctx9(3.0));
  // '학교 일정'(수동 입력) 행은 제거됐다 — 고사 일정 자동 자료가 그 자리를 대신한다
  check('학교 일정 수동 입력 행은 없다', rows.every((r) => r.key !== 'interviewDate'));
  check('종합 전형요소 = 서류 + 면접 요약',
    rows.find((r) => r.key === 'method')!.text(c) === '서류: 학업역량 40 + 면접 (개별면접) · 실시',
    rows.find((r) => r.key === 'method')!.text(c));
}

{
  // 내보내기 — 빈 지망 자리를 유지해야 열과 지망 번호가 어긋나지 않는다
  const c = col(item(), ctx9(3.2));
  const m = toExportMatrix([c], 6);
  check('헤더 = 항목/세부 + 6지망', m[0].length === 8 && m[0][2] === '1지망' && m[0][7] === '6지망');
  check('내보내기 행 수 = 헤더 + 정의 행', m.length === rows.length + 1);
  check('1지망 열에 값', m[1][2] === '테스트대');
  check('빈 2~6지망 열은 "-"', m[1].slice(3).every((v) => v === '-'));
  check('모든 행의 열 수가 같다', m.every((r) => r.length === m[0].length));
}

/* ── 수동 판정 표기 (표·인쇄·엑셀 공통) ── */
{
  const gyogwa: WishlistItem['gyogwa'] = {
    id: 'g1', region: null, university: '테스트대', admission: '교과전형', unit: null,
    method: '교과 100', method_tags: [], unit_tags: [], quota: null, quota_text: null,
    csat_status: null, has_csat: true, csat: '국,수,영,탐(1) 중 2개 합 5',
    subjects_all: [], careers: [],
  };
  const ctxR: StudentContext = {
    naesin: { avgGrade: 3.0, isFiveTier: false, subjectCount: 40 },
    subjects: null,
    mock: { academicYear: 2026, examMonth: 9, subjects: [{ subject: '국어', grade: 3 }, { subject: '수학', grade: 4 }] },
    mockRounds: [
      { academicYear: 2026, examMonth: 9, subjects: [{ subject: '국어', grade: 3 }, { subject: '수학', grade: 4 }] },
    ],
  };
  const rowsAll = buildComparisonRows();
  const row9 = rowsAll.find((r) => r.key === 'csat-9월')!;
  const row6 = rowsAll.find((r) => r.key === 'csat-6월')!;

  const auto = col(item({ gyogwa }), ctxR);
  check('자동 판정은 "(직접)" 표기가 없다', row9.text(auto) === '미충족', row9.text(auto));
  check('6월 성적이 없으면 사유를 적는다', row6.text(auto) === '성적 없음', row6.text(auto));

  const savedItem = item({ gyogwa, csatCheck9: 'meet' });
  check('저장된 수동 판정은 "(직접)"',
    row9.text(col(savedItem, ctxR)) === '충족 (직접)', row9.text(col(savedItem, ctxR)));

  // 저장 전 초안도 표·엑셀에 즉시 반영돼야 한다
  const base = col(item({ gyogwa }), ctxR);
  const draft: ComparisonColumn = {
    ...base,
    draft: { ...draftFromItem(item({ gyogwa })), csatCheck9: 'meet' },
  };
  check('초안이 자동 판정을 덮어 표에 반영', row9.text(draft) === '충족 (직접)', row9.text(draft));
  check('초안을 비우면 자동으로 되돌아간다',
    row9.text({ ...base, draft: { ...draftFromItem(item({ gyogwa })), csatCheck9: '' } }) === '미충족');

  check('회차 행은 편집 대상(field 보유)', row9.field === 'csatCheck9' && row6.field === 'csatCheck6');
  check('toCsatCheck — 빈 문자열은 null', toCsatCheck('') === null);
  check('toCsatCheck — 알 수 없는 값은 null', toCsatCheck('maybe') === null);
  check('toCsatCheck — meet/fail 통과', toCsatCheck('meet') === 'meet' && toCsatCheck('fail') === 'fail');

  check('자동 사유 — 종합은 모집요강 확인',
    autoFallbackText(col(item({ track: 'jonghap' }), ctxR), 9) === '모집요강 확인');
  check('자동 사유 — 최저 없는 교과는 해당 없음',
    autoFallbackText(col(item(), ctxR), 9) === '해당 없음');
  check('자동 사유 — 최저 있고 성적 있으면 판정 보류',
    autoFallbackText(col(item({ gyogwa }), ctxR), 9) === '판정 보류');
}


/* ═══════════════════ I. 반영 교과 선택 ═══════════════════ */
console.log('\nI. 반영 교과 선택 (selectSubjectVariant)');

/** subjects_all 만 골라 담는 최소 gyogwa (반영 교과 선택 검사 전용) */
const mkGyogwa = (
  subjects_all: Array<{ subjects: string; admission?: string; unit?: string; ratio?: string }>,
  admission: string | null,
) => ({ admission, subjects_all, careers: [] } as unknown as NonNullable<WishlistItem['gyogwa']>);

{
  // 규칙이 하나뿐이면 고민할 것이 없다
  const g = mkGyogwa([{ subjects: '국,수,영,사,과', admission: '학생부교과' }], '학생부교과');
  const r = selectSubjectVariant(g);
  check('규칙 1건 — 그것으로 확정', r.variant?.subjects === '국,수,영,사,과' && !r.ambiguous);
}
{
  // ★ 핵심 ★ 배열에 다른 전형 규칙이 함께 들어 있어도 **내 전형 것만** 고른다.
  // 고르지 않고 이어 붙이면 "국,수,영,사,과 / 국,영,사"처럼 남의 규칙이 섞여
  // 반영 교과를 잘못 읽게 된다(라이브 60개 전형이 2건 이상 보유).
  const g = mkGyogwa([
    { subjects: '국,수,영,사,과', admission: '교과우수자' },
    { subjects: '국,영,사', admission: '교과균형' },
  ], '교과균형');
  const r = selectSubjectVariant(g);
  check('여러 규칙 — 행 전형명과 맞는 것만', r.variant?.subjects === '국,영,사' && !r.ambiguous);
  check('여러 규칙 — 전체는 그대로 보존(근거 모달용)', r.all.length === 2);
}
{
  // 어느 것도 맞지 않으면 **고르지 않는다**. 틀리게 고른 반영 교과는
  // 그럴듯한 내신 숫자를 만들어 내므로 침묵보다 나쁘다.
  const g = mkGyogwa([
    { subjects: '국,수,영,사,과', admission: '교과우수자' },
    { subjects: '국,영,사', admission: '교과균형' },
  ], '농어촌학생');
  check('맞는 규칙이 없으면 보류', selectSubjectVariant(g).ambiguous);
}
{
  // 둘 다 맞아떨어져도 보류 — 하나로 좁혀지지 않으면 확정하지 않는다
  const g = mkGyogwa([
    { subjects: '국,수,영,사,과', admission: '학생부교과(일반)' },
    { subjects: '국,영,사', admission: '학생부교과(지역)' },
  ], '학생부교과');
  check('여러 개가 맞으면 보류', selectSubjectVariant(g).ambiguous);
}
{
  // 같은 교과 문자열이 전형만 달리해 중복된 경우는 **모호하지 않다**(답이 하나뿐)
  const g = mkGyogwa([
    { subjects: '국,수,영,사,과', admission: '교과우수자' },
    { subjects: '국,수,영,사,과', admission: '교과균형' },
  ], '지역인재');
  const r = selectSubjectVariant(g);
  check('내용이 같으면 전형이 달라도 확정', !r.ambiguous && r.variant?.subjects === '국,수,영,사,과');
}
{
  check('빈 배열 — 고를 것이 없다', selectSubjectVariant(mkGyogwa([], '교과')).variant === null);
  check('빈 문자열 항목은 후보에서 제외',
    subjectVariants(mkGyogwa([{ subjects: '  ' }, { subjects: '국,영' }], null)).length === 1);
  check('gyogwa 자체가 없어도 안전', selectSubjectVariant(null).all.length === 0);
}
{
  // ② 통째로 같은 문자열 — 행에도 쉼표가 있으면 ①(변형만 쪼갠다)이 어긋난다.
  //    라이브: 인제대 행 `의예,약학` ↔ 변형 `의예, 약학`. 같은 전형인데 못 잡던 것.
  const g = mkGyogwa([
    { subjects: '국,수,영,과', admission: '의예, 약학' },
    { subjects: '(국,수,영)각 2과목+기타 교과 4과목', admission: '학생부교과, 면접' },
  ], '의예,약학');
  const r = selectSubjectVariant(g);
  check('통째로 같으면 확정 (행에도 쉼표가 있는 경우)',
    !r.ambiguous && r.variant?.subjects === '국,수,영,과');
}
{
  // ③ 수식어 차이 — 라이브: 송원대 행 `학생부 우수자` ↔ 변형 `학생부우수자 (일반)`
  const g = mkGyogwa([
    { subjects: '국,수,영 전 과목', admission: '면접우수자' },
    { subjects: '국,수,영 중 6과목(교과별 2과목)', admission: '학생부우수자 (일반)' },
  ], '학생부 우수자');
  const r = selectSubjectVariant(g);
  check('괄호 수식어가 붙어도 확정',
    !r.ambiguous && r.variant?.subjects === '국,수,영 중 6과목(교과별 2과목)');
}
{
  // ★ 단계 순서가 안전장치다 ★
  // ③(포함)은 가장 느슨해 혼자 두면 `교과` 가 `교과면접` 까지 잡는다.
  // ①(토큰 정확 일치)을 먼저 보므로 이미 확정되던 답이 뒤 단계 때문에 바뀌지 않는다.
  const g = mkGyogwa([
    { subjects: '국,수,영,사,과 중 10과목', admission: '교과면접' },
    { subjects: '국,수,영,사,과 중 8과목', admission: '교과' },
  ], '교과');
  const r = selectSubjectVariant(g);
  check('부분 문자열보다 정확 일치가 이긴다',
    !r.ambiguous && r.variant?.subjects === '국,수,영,사,과 중 8과목');
}
{
  // ③ 이 둘 이상을 잡으면 보류 — 느슨한 단계가 답을 지어내지 못하게 하는 유일성 요구
  const g = mkGyogwa([
    { subjects: 'A', admission: '교과우수' },
    { subjects: 'B', admission: '교과균형' },
  ], '교과');
  check('포함이 여럿이면 보류', selectSubjectVariant(g).ambiguous);
}
{
  // 라이브 잔여 보류 2건의 형태 — `admission` 칸에 전형이 아니라 **학과명**이 들어 있다.
  // 추측해서 고르면 남의 전형 반영 교과로 내신을 계산하게 되므로 보류가 정답이다.
  const g = mkGyogwa([
    { subjects: '국,수,영,사,과,한', admission: '교과우수자' },
    { subjects: '국,수,영,(사,과,한) 중 12과목', admission: '교과균형' },
  ], '군사학과');
  check('전형 칸에 학과명이 오면 보류 (라이브 서경대·대전대)', selectSubjectVariant(g).ambiguous);
}
{
  // 표시(비교표)와 계산(naesinRule)이 **같은 판정**을 써야 한다 —
  // 갈라지면 "표에는 국,영,사인데 계산은 국,수,영,사,과로" 하는 상태가 된다.
  const g = mkGyogwa([
    { subjects: '국,수,영,사,과', admission: '교과우수자' },
    { subjects: '국,영,사', admission: '교과균형' },
  ], '농어촌학생');
  const rule = parseNaesinRule(g);
  check('보류는 계산에도 전파된다(multiple-rules)',
    rule.uncertainties.includes('multiple-rules'), JSON.stringify(rule.uncertainties));
}
{
  // 비교표 행이 선택 결과를 그대로 쓰는가
  const rows = buildComparisonRows();
  const reflected = rows.find((r) => r.key === 'reflected')!;
  const one = col(item({
    gyogwa: mkGyogwa([
      { subjects: '국,수,영,사,과', admission: '교과우수자' },
      { subjects: '국,영,사', admission: '교과균형' },
    ], '교과균형'),
  }), ctx9(3.0));
  check('비교표 — 확정되면 고른 것만 적는다', reflected.text(one) === '국,영,사');
  check('비교표 — 근거 모달에 전체가 담긴다',
    (reflected.detail?.(one)?.sections ?? []).some((sec) => (sec.items?.length ?? 0) === 2));

  const many = col(item({
    gyogwa: mkGyogwa([
      { subjects: '국,수,영,사,과', admission: '교과우수자' },
      { subjects: '국,영,사', admission: '교과균형' },
    ], '농어촌학생'),
  }), ctx9(3.0));
  check('비교표 — 보류면 전체를 적는다(감추지 않는다)',
    many.item.gyogwa != null && reflected.text(many).includes('국,수,영,사,과') && reflected.text(many).includes('국,영,사'));

  check('비교표 — 자료가 없으면 대시',
    reflected.text(col(item({ gyogwa: null }), ctx9(3.0))) === '-');
  // 학년비율은 확정된 규칙의 것만 붙는다(남의 전형 비율을 끌어오면 안 된다)
  const ratio = col(item({
    gyogwa: mkGyogwa([{ subjects: '국,영,사', admission: '교과균형', ratio: '20/40/40' }], '교과균형'),
  }), ctx9(3.0));
  check('비교표 — 학년비율 병기', reflected.text(ratio).includes('학년비율 20/40/40'));
}

/* ═══════════════════ D. 정원 규칙 ═══════════════════ */
console.log('\nD. 정원 규칙 (tierRules)');

check('총 상한 16 · 지원희망 6', MAX_TOTAL_SLOTS === 16 && MAX_APPLY_SLOTS === 6);

// ★ 이 규칙이 존재하는 이유 ★
// 칸마다 상한을 두면(구 구현: 지원희망 6 · 관심대학 15) 지원희망 6 + 관심대학 15 에서
// **지원희망을 관심대학으로 내릴 수 없다**. 칸 이동은 총합을 바꾸지 않으므로
// 총합만 제한하면 이동이 막힐 일이 없다.
check('칸 이동은 언제나 가능하다', canMoveTier() === true);

check('총합 계산', totalCount({ apply: 6, interest: 4 }) === 10);
check('총합 15면 아직 담을 수 있다', canAdd({ apply: 6, interest: 9 }));
check('총합 16이면 막는다', !canAdd({ apply: 6, interest: 10 }));
check('지원희망 0 + 관심 16 도 가득 참', isTotalFull({ apply: 0, interest: 16 }));
check('지원희망 0 + 관심 15 는 아직 여유', canAdd({ apply: 0, interest: 15 }));
// 칸을 어떻게 나누든 총합만 같으면 같은 판정이다
check('배분이 달라도 총합이 같으면 같은 판정',
  canAdd({ apply: 6, interest: 9 }) === canAdd({ apply: 1, interest: 14 }));

// **지원희망 6 초과는 막지 않는다** — 목록을 짜는 도중 넘겨 담는 것이 정상이고,
// 제도상의 사실은 접수 전에 정리하면 된다.
check('지원희망 7이어도 담을 수 있다(총합 여유)', canAdd({ apply: 7, interest: 0 }));
check('지원희망 초과 개수 — 정원 이내면 0', applyOverflow(4) === 0 && applyOverflow(6) === 0);
check('지원희망 초과 개수 — 넘은 만큼', applyOverflow(9) === 3);

check('남은 자리', remainingSlots({ apply: 6, interest: 4 }) === 6);
check('가득 차면 남은 자리 0', remainingSlots({ apply: 8, interest: 10 }) === 0);

{
  const msg = addRejectReason({ apply: 6, interest: 10 });
  check('가득 차면 사유가 있다', msg != null);
  check('사유에 총 상한을 밝힌다', !!msg && msg.includes('16'));
  check('사유가 다음 행동을 안내한다', !!msg && msg.includes('정리'));
  check('여유가 있으면 사유 없음', addRejectReason({ apply: 1, interest: 1 }) === null);
}

{
  const rows = [
    { id: 'a', tier: 'apply' as const },
    { id: 'b', tier: 'interest' as const },
    { id: 'c', tier: 'apply' as const },
  ];
  const { apply, interest } = splitByTier(rows);
  check('splitByTier — 칸별로 가른다', apply.length === 2 && interest.length === 1);
  check('splitByTier — 원래 순서 보존', apply[0].id === 'a' && apply[1].id === 'c');
}
{
  // tier 컬럼이 생기기 전 행(=값 없음)은 지원희망으로 본다.
  // 관심대학으로 떨어뜨리면 기존 지망이 화면에서 통째로 사라진다.
  const legacy = splitByTier([{ id: 'x' }, { id: 'y', tier: null }, { id: 'z', tier: undefined }]);
  check('splitByTier — tier 없는 레거시 행은 지원희망', legacy.apply.length === 3 && legacy.interest.length === 0);
}
{
  const insightItem = item({ tier: 'interest' });
  check('관심대학 항목도 파생값은 동일하게 계산된다',
    computeItemInsight(insightItem, ctx9(3.2)).fit === 'reach');
}

/* ═══════════════════ E. 전형 변경사항 ═══════════════════ */
console.log('\nE. 전형 변경사항 (admissionChange)');

check('연도쌍 파싱 — 2028↔2027', (() => {
  const y = parseComparisonYears('2028↔2027');
  return y.after === 2028 && y.before === 2027;
})());
check('화살표 표기가 달라도 연도만 뽑는다', (() => {
  const y = parseComparisonYears('2027 -> 2026');
  return y.after === 2027 && y.before === 2026;
})());
check('순서가 뒤집혀 와도 큰 쪽이 after', (() => {
  const y = parseComparisonYears('2025↔2026');
  return y.after === 2026 && y.before === 2025;
})());
check('연도가 하나면 파싱 실패(null)', parseComparisonYears('2028 대입').after === null);
check('빈 문자열도 안전', parseComparisonYears('').after === null);

function raw(over: Partial<RawChangeRecord> = {}): RawChangeRecord {
  return {
    id: 'R0001', sheet: '2028 변경사항_학생부위주', row: 2,
    category: '학생부위주', comparison: '2028↔2027', region: '서울',
    university: '건국대', keywords: ['#수능최저'], item: 'KU지역균형(학생부교과)',
    afterLabel: '2028 대입', beforeLabel: '2027 대입',
    after: '국수영탐(1) 3개 영역 등급 합 8 이내', before: '수능최저학력기준 미적용',
    changeType: '강화/확대', keywordText: '#수능최저',
    ...over,
  };
}

{
  const r = toChangeRow(raw(), '2026-05-02');
  check('행 변환 — 연도쌍 분해', r.after_year === 2028 && r.before_year === 2027);
  check('행 변환 — 자료 기준일', r.source_date === '2026-05-02');
  check('행 변환 — 출처 URL 고정', r.source_url.includes('jinhak.esteacher.kr'));
  check("'미분류' 지역은 null 로 접는다", toChangeRow(raw({ region: '미분류' }), null).region === null);
  check('빈 before 는 null', toChangeRow(raw({ before: '   ' }), null).before_text === null);
}

{
  // 원본 사이트가 형식을 바꾸면 **조용히 절반만 들어가면 안 된다**
  check('검증 — 정상 행은 통과', validateChangeRows([toChangeRow(raw(), null)]).length === 0);
  check('검증 — id 중복 검출',
    validateChangeRows([toChangeRow(raw(), null), toChangeRow(raw(), null)]).length > 0);
  check('검증 — 대학명 없음 검출',
    validateChangeRows([toChangeRow(raw({ university: '' }), null)]).length > 0);
  check('검증 — 변경 후 내용 없음 검출',
    validateChangeRows([toChangeRow(raw({ after: '' }), null)]).length > 0);
  check('검증 — 연도쌍 파싱 실패 검출',
    validateChangeRows([toChangeRow(raw({ comparison: '2028 대입' }), null)]).length > 0);
  check('검증 — 연도 순서 이상 검출',
    validateChangeRows([{ ...toChangeRow(raw(), null), after_year: 2026, before_year: 2028 }]).length > 0);
}

{
  const rows = [toChangeRow(raw(), null)];
  const c = mapChange(rows[0] as unknown as Record<string, unknown>);
  check('DB 행 → 화면 형태', c.afterYear === 2028 && c.university === '건국대');
  check('키워드 라벨에서 # 제거', keywordLabel('#수능최저') === '수능최저');
}

{
  const mk = (over: Partial<ReturnType<typeof mapChange>>) => ({
    id: 'x', category: '학생부위주', comparison: '2028↔2027',
    afterYear: 2028, beforeYear: 2027, university: '건국대',
    admissionItem: null, keywords: ['#수능최저'], afterText: '후', beforeText: '전',
    changeType: '변경', ...over,
  });
  const a = mk({ id: 'a', keywords: ['#수능최저'] });
  const b = mk({ id: 'b', keywords: ['#반영교과'] });
  const cc = mk({ id: 'c', comparison: '2027↔2026', afterYear: 2027, beforeYear: 2026, keywords: ['#면접'] });

  check('요약 — 키워드 + 건수', summarizeChanges([a, b]) === '수능최저 · 반영교과 (2건)',
    summarizeChanges([a, b]));
  check('요약 — 없으면 빈 문자열', summarizeChanges([]) === '');

  const full = changesFullText([a]);
  check('전문 — 종류·키워드·전후를 모두 담는다',
    full.includes('변경') && full.includes('수능최저') && full.includes('전 → 후'), full);

  const g = groupByComparison([cc, a, b]);
  check('연도쌍 묶음 — 2쌍', g.length === 2);
  check('연도쌍 묶음 — 최신이 먼저', g[0].comparison === '2028↔2027', g[0].comparison);
  check('연도쌍 묶음 — 같은 쌍끼리 모인다', g[0].items.length === 2 && g[1].items.length === 1);
}

{
  // 비교표 행: 연도쌍을 **자료에서 받는다**(하드코딩하면 해가 바뀔 때 빈 행이 남는다)
  check('연도쌍을 안 주면 변경사항 행이 없다',
    buildComparisonRows().every((r) => r.kind !== 'changes'));
  const withChanges = buildComparisonRows(['2028↔2027', '2027↔2026']);
  const changeRows = withChanges.filter((r) => r.kind === 'changes');
  check('연도쌍 수만큼 행이 생긴다', changeRows.length === 2);
  check('변경사항 행은 하나로 묶인다', changeRows.every((r) => r.group === 'changes'));
  check('rowSpan 불변식 유지 (변경사항 포함)', (() => {
    const spans = computeLabelSpans(withChanges);
    return spans.reduce((a, b) => a + b, 0) === withChanges.length;
  })());

  const base = col(item(), ctx9(3.2));
  const row = changeRows[0];
  check('아직 안 불러왔으면 "…"', row.text({ ...base, changes: undefined }) === '…');
  // 핵심: 빈 배열은 "변경 없음"이 아니라 "자료 없음"이다 (수록 대학 64곳 한정)
  check('자료가 없으면 "자료 없음"', row.text({ ...base, changes: [] }) === '자료 없음');
  check('내 연도쌍 것만 담는다', (() => {
    const other = { id: 'z', category: '', comparison: '2026↔2025', afterYear: 2026, beforeYear: 2025,
      university: '', admissionItem: null, keywords: [], afterText: '딴것', beforeText: null, changeType: '변경' };
    return row.text({ ...base, changes: [other] }) === '자료 없음';
  })());
}


/* ═══════════════════ F. 고사 일정 ═══════════════════ */
console.log('\nF. 고사 일정 (admissionSchedule)');

check('MMDD → ISO', mmddToDate(915, 2026) === '2026-09-15');
check('MMDD 한 자리 월', mmddToDate(1103, 2026) === '2026-11-03');
check('연도는 자료에서 온다(코드에 박지 않음)', mmddToDate(915, 2027) === '2027-09-15');
check('잘못된 MMDD 는 null', mmddToDate(1345, 2026) === null && mmddToDate(0, 2026) === null);
check('null 안전', mmddToDate(null, 2026) === null);

{
  const db: RawScheduleDb = {
    meta: { collected: '2026-06-12', year: 2026, suneung: 1119 },
    unis: [['가천대학교[본교]', '가천대학교', '경기', 0], ['고려대학교[세종]', '고려대학교', '세종', 1]],
    paths: ['학생부위주(교과) > 일반 > 지역균형 > 학생부교과(지역균형)'],
    units: ['간호학과', '경영학과'],
    events: [
      [0, 1, 1, 1122, 1122, 0, [0], [907, 911], '12/18', '', 'CODE1'],
      [1, 0, 2, 1129, 1130, 0, [1], [907, 911], '11/17 / 12/10', '', '', 0],
    ],
  };
  const rows = toScheduleRows(db);
  check('행 2건 생성', rows.length === 2);
  check('id 는 순번 기반', rows[0].id === 'E0001' && rows[1].id === 'E0002');
  check('고사유형 인덱스 해석', rows[0].exam_type === '면접' && rows[1].exam_type === '논술');
  check('단계 보존', rows[0].stage === 1 && rows[1].stage === 2);
  check('고사일 변환', rows[0].exam_start === '2026-11-22' && rows[1].exam_end === '2026-11-30');
  check('원서접수 변환', rows[0].apply_start === '2026-09-07' && rows[0].apply_end === '2026-09-11');
  check('전형명 = 경로 마지막 세그먼트', rows[0].admission_name === '학생부교과(지역균형)');
  check('모집단위 인덱스 → 이름', rows[0].units[0] === '간호학과' && rows[1].units[0] === '경영학과');
  check('캠퍼스 없는 대학은 short', rows[0].university === '가천대학교');
  check('캠퍼스 있는 대학은 full', rows[1].university === '고려대학교[세종]');
  check('검증 통과', validateScheduleRows(rows).length === 0);
}

{
  const db: RawScheduleDb = {
    meta: { year: 2026 },
    unis: [['A', 'A', '서울', 0]],
    paths: ['x > y'],
    units: [],
    events: [[0, 1, 1, 1130, 1122, 0, [], 0, '', '', 'C']],
  };
  check('검증 — 고사 기간 역전 검출', validateScheduleRows(toScheduleRows(db)).length > 0);
}

check('DB 리터럴 못 찾으면 예외', (() => {
  try { extractScheduleDb('<html>no db here</html>'); return false; } catch { return true; }
})());
check('고사유형 순서는 원본 인덱스 (바꾸면 안 됨)',
  EXAM_TYPES[0] === '논술' && EXAM_TYPES[1] === '면접' && EXAM_TYPES[2] === '실기');

function sched(over: Partial<AdmissionSchedule> = {}): AdmissionSchedule {
  return {
    id: 'S1', university: '가천대학교', examType: '면접', stage: 1,
    examStart: '2026-11-22', examEnd: '2026-11-22',
    admissionPath: '', admissionName: '학생부교과(지역균형)',
    applyStart: '2026-09-07', applyEnd: '2026-09-11',
    announceText: '12/18', units: ['간호학과'], examTime: null, note: null,
    ...over,
  };
}

check('날짜 표기에 요일', formatExamDate('2026-11-22') === '11/22(일)', formatExamDate('2026-11-22'));
check('한 줄 표기', formatSchedule(sched()) === '면접 11/22(일)', formatSchedule(sched()));
check('기간이면 ~ 로', formatSchedule(sched({ examEnd: '2026-11-23' })) === '면접 11/22(일) ~ 11/23(월)');
check('2차는 표시', formatSchedule(sched({ stage: 2 })).includes('2차'));
check('같은 문구는 접는다', formatSchedules([sched(), sched({ id: 'S2' })]) === '면접 11/22(일)');

check('발표일 — 단일 값이면 채운다', resolveAnnounceDate([sched()], 2026) === '2026-12-18');
check("발표일 — '모집단위별 상이'( / 포함)면 보류",
  resolveAnnounceDate([sched({ announceText: '11/17 / 12/10' })], 2026) === null);
check('발표일 — 값이 서로 다르면 보류',
  resolveAnnounceDate([sched(), sched({ id: 'S2', announceText: '12/19' })], 2026) === null);
check('발표일 — 날짜로 못 읽으면 보류',
  resolveAnnounceDate([sched({ announceText: '12월 중' })], 2026) === null);
check('발표일 — 없으면 null', resolveAnnounceDate([sched({ announceText: null })], 2026) === null);
check('발표일 원문은 보류돼도 보여 준다',
  announceSummary([sched({ announceText: '11/17 / 12/10' })]) === '11/17 / 12/10');

check('관련도 — 전형명 일치', scheduleRelevance(sched(), '학생부교과(지역균형)', null) >= 1);
check('관련도 — 모집단위 일치', scheduleRelevance(sched(), null, '간호학과') >= 1);
check('관련도 — 둘 다면 더 높다',
  scheduleRelevance(sched(), '학생부교과(지역균형)', '간호학과') === 2);
check('관련도 — 무관하면 0', scheduleRelevance(sched(), '논술전형', '철학과') === 0);

/* ═══════════════════ G. 표 영역 구분 ═══════════════════ */
console.log('\nG. 표 영역 구분');

{
  const all = buildComparisonRows(['2028↔2027']);
  check('모든 행에 영역이 있다', all.every((r) => SECTION_ORDER.includes(r.section)));
  const order: string[] = [];
  for (const r of all) if (order[order.length - 1] !== r.section) order.push(r.section);
  check('영역이 흩어지지 않는다(연속 블록)', order.length === new Set(order).size, order.join(' > '));
  check('모든 영역에 이름이 있다', SECTION_ORDER.every((sec) => !!SECTION_LABELS[sec]));

  const byKey = (k: string) => all.find((r) => r.key === k)!;
  check('수능최저 항목은 csat 영역', byKey('csat').section === 'csat' && byKey('csat-6월').section === 'csat');
  check('내신 항목은 naesin 영역',
    byKey('myGrade').section === 'naesin' && byKey('g70-2026').section === 'naesin'
    && byKey('convertedScore').section === 'naesin');
  check('경쟁 지표는 competition 영역',
    byKey('competition-2026').section === 'competition' && byKey('recruit-2026').section === 'competition');
  check('일정 항목은 schedule 영역',
    byKey('examSchedule').section === 'schedule' && byKey('finalAnnounceDate').section === 'schedule');
  check('rowSpan 불변식 유지', (() => {
    const spans = computeLabelSpans(all);
    return spans.reduce((a, b) => a + b, 0) === all.length;
  })());
}

{
  const base = col(item(), ctx9(3.2));
  const row = buildComparisonRows().find((r) => r.key === 'examSchedule')!;
  check('일정 — 로딩 중', row.text({ ...base, schedules: undefined }) === '…');
  check('일정 — 자료 없음', row.text({ ...base, schedules: [] }) === '자료 없음');
  check('일정 — 있으면 요약', row.text({ ...base, schedules: [sched()] }) === '면접 11/22(일)');

  const fin = buildComparisonRows().find((r) => r.key === 'finalAnnounceDate')!;
  check('최종 발표일 — 자료값 제안',
    fin.autoValue!({ ...base, schedules: [sched()], scheduleYear: 2026 }) === '2026-12-18');
  check('최종 발표일 — 보류면 제안 없음',
    fin.autoValue!({ ...base, schedules: [sched({ announceText: '11/17 / 12/10' })], scheduleYear: 2026 }) === null);
  check('최종 발표일 — 보류여도 원문은 표기',
    fin.text({ ...base, schedules: [sched({ announceText: '11/17 / 12/10' })], scheduleYear: 2026 })
      .includes('모집단위 확인'));
  check('최종 발표일 — 사용자 입력이 자료를 이긴다',
    fin.text({ ...base, schedules: [sched()], scheduleYear: 2026,
      draft: { ...draftFromItem(item()), finalAnnounceDate: '2026-12-25' } }) === '2026-12-25');

  const first = buildComparisonRows().find((r) => r.key === 'firstAnnounceDate')!;
  check('1차 발표일은 자동 제안이 없다(자료에 없음)', first.autoValue === undefined);
}


/* ═══════════════════ H. 수능최저 구조화 ═══════════════════ */
console.log('\nH. 수능최저 구조화 (csatRule)');

// 라이브 표기 — 기본 조건 + 학과 분기
const CSAT_SRC = '국,수,영,탐 중 2개 합 5, 한 5 의예,한의예: 국,수,영,탐 중 3개 합 4, 한 5';

function ans(over: Partial<LlmScopeAnswer> = {}): LlmScopeAnswer {
  return { blockIndex: 0, scopeKind: 'default', labels: [], departmentTerms: [], series: null, ...over };
}

{
  const { rows, rejected } = buildCsatRules('g1', CSAT_SRC, [
    ans({ blockIndex: 0, scopeKind: 'default' }),
    ans({ blockIndex: 1, scopeKind: 'department', labels: ['의예', '한의예'], departmentTerms: ['의예과', '한의예과'] }),
  ], 'solar-pro3');
  check('정상 답안 2건 채택', rows.length === 2 && rejected.length === 0);
  // ★ 숫자는 모델이 아니라 파서가 채운다 — 이 기능의 안전 근거
  check('수치는 파서가 채운다(모델 아님)',
    rows[0].mode === 'sum' && rows[0].pick_count === 2 && rows[0].threshold === 5,
    `${rows[0].mode} ${rows[0].pick_count} ${rows[0].threshold}`);
  check('분기 블록 수치도 파서가', rows[1].pick_count === 3 && rows[1].threshold === 4);
  check('조건은 원문에서 가져온다', CSAT_SRC.includes(rows[1].condition_text));
  check('학과어 저장', rows[1].department_terms.join(',') === '의예과,한의예과');
  check('모델명 기록', rows[0].model === 'solar-pro3');
}

{
  // 모델이 지어낸 라벨 — 원문에 없으면 버린다
  const { rows, rejected } = buildCsatRules('g1', CSAT_SRC, [
    ans({ blockIndex: 1, scopeKind: 'department', labels: ['수의예'], departmentTerms: ['수의예과'] }),
  ], null);
  check('원문에 없는 라벨은 폐기', rows.length === 0 && rejected[0].reason === 'label-not-in-source');
}
{
  const { rejected } = buildCsatRules('g1', CSAT_SRC, [ans({ blockIndex: 9 })], null);
  check('없는 블록 지목은 폐기', rejected[0].reason === 'block-not-found');
}
{
  const { rejected } = buildCsatRules('g1', CSAT_SRC, [
    ans({ blockIndex: 1, scopeKind: 'department', labels: ['의예'], departmentTerms: [] }),
  ], null);
  check('학과 범위인데 학과어 없으면 폐기', rejected[0].reason === 'terms-missing');
}
{
  const { rejected } = buildCsatRules('g1', CSAT_SRC, [
    ans({ blockIndex: 1, scopeKind: 'department', labels: ['의예'], departmentTerms: ['전체'] }),
  ], null);
  check('포괄어("전체")는 폐기 — 범위를 넓히는 실수가 더 위험',
    rejected[0].reason === 'terms-forbidden');
}
{
  const { rejected } = buildCsatRules('g1', CSAT_SRC, [
    ans({ blockIndex: 1, scopeKind: 'department', labels: ['의예'],
          departmentTerms: Array.from({ length: 25 }, (_, i) => `학과${i}`) }),
  ], null);
  check('학과어 과다는 폐기', rejected[0].reason === 'terms-too-many');
}
{
  const src = '인문: 국,수,영,탐(1) 중 2개 합 6 자연: 국,수,영,과(1) 중 2개 합 6';
  const okRows = buildCsatRules('g2', src, [
    ans({ blockIndex: 0, scopeKind: 'series', labels: ['인문'], series: '인문' }),
  ], null).rows;
  check('계열 규칙 채택', okRows.length === 1 && okRows[0].series === '인문');
  const bad = buildCsatRules('g2', src, [
    ans({ blockIndex: 0, scopeKind: 'series', labels: ['인문'], series: '예체능' }),
  ], null).rejected;
  check('인문/자연 아닌 계열은 폐기', bad[0].reason === 'series-invalid');
}

// ★ `수(미/기)` 표기 — 파서 정규식에 `미기` 가 없어 국·수를 통째로 놓치던 자리 ★
//   (2026-09-01 수정 전에는 areas 가 {영,탐} 이 되어 국어·수학을 안 보는 기준이 됐다)
{
  const parsed = parseCsatRule('국,수(미/기),영,과(1) 중 3개 합 5')!;
  check('`수(미/기)` 를 포함해도 국·수를 읽는다',
    parsed.areas.has('국') && parsed.areas.has('수'), [...parsed.areas].join(''));
  check('`과(절사)` 4개 합도 정상',
    (() => { const r = parseCsatRule('국,수(미/기),영,과(절사) 4개 합 5')!;
      return r.areas.has('국') && r.areas.has('수') && r.count === 4 && r.threshold === 5; })());

  // 검증 자체는 그대로 살아 있다 — 파서가 놓치면 여전히 버린다
  check('놓친 영역을 검출하는 안전망은 유지',
    verifyAreaCoverage('국,수(미/기),영,과(1) 중 3개 합 5', ['영', '탐']).join(',') === '국,수');
  check('정상 조건은 누락 없음',
    verifyAreaCoverage('국,수,영,탐 중 2개 합 5', ['국', '수', '영', '탐']).length === 0);
  check("'절사'의 사는 탐구로 세지 않는다",
    verifyAreaCoverage('국,수,영,탐(절사) 중 3개 합 6', ['국', '수', '영', '탐']).length === 0);

  const { rows } = buildCsatRules('g3', '국,수(미/기),영,과(1) 중 3개 합 5', [ans({ blockIndex: 0 })], null);
  check('이제는 저장된다(파서 수정 효과)', rows.length === 1 && rows[0].areas.includes('수'));
}

/* ── 응답 파싱 ── */
check('코드블록에 싸여 와도 파싱',
  parseScopeResponse('```json\n{"blocks":[{"blockIndex":0,"scopeKind":"default"}]}\n```').length === 1);
check('JSON 아니면 빈 배열', parseScopeResponse('죄송합니다 답변할 수 없습니다').length === 0);
check('blocks 없으면 빈 배열', parseScopeResponse('{"result":[]}').length === 0);
check('알 수 없는 scopeKind 는 버린다',
  parseScopeResponse('{"blocks":[{"blockIndex":0,"scopeKind":"기타"}]}').length === 0);

/* ── 학과 매칭 ── */
{
  const rule = (over: Partial<CsatRule>): CsatRule => ({
    blockIndex: 0, scopeKind: 'default', scopeLabels: [], departmentTerms: [], series: null,
    conditionText: 'x', mode: 'sum', pickCount: 2, threshold: 5, tamCount: 1, areas: ['국'],
    ...over,
  });
  const def = rule({ blockIndex: 0, scopeKind: 'default' });
  const med = rule({ blockIndex: 1, scopeKind: 'department', departmentTerms: ['의예과', '의학과'] });
  const pharm = rule({ blockIndex: 2, scopeKind: 'department', departmentTerms: ['약학과'] });
  const humanities = rule({ blockIndex: 3, scopeKind: 'series', series: '인문' });

  check('학과 일치 → 그 규칙', pickRuleForDepartment([def, med], '의예과').kind === 'department');
  check('부분 일치도 인정', pickRuleForDepartment([def, med], '의학과(의예)').rule?.blockIndex === 1);
  check('매칭 근거를 알려준다', pickRuleForDepartment([def, med], '의예과').matchedTerm === '의예과');
  check('학과 불일치 → 기본 규칙', pickRuleForDepartment([def, med], '철학과').kind === 'default');
  // 어느 쪽인지 모르면 고르지 않는다 — 틀린 기준으로 확신 있게 판정하는 것이 최악
  check('두 학과 규칙이 걸리면 보류',
    pickRuleForDepartment([med, pharm], '의예과 약학과').kind === 'ambiguous');
  check('계열은 알려줄 때만 쓴다',
    pickRuleForDepartment([humanities], '철학과').kind === 'none');
  check('계열을 주면 매칭', pickRuleForDepartment([humanities], '철학과', '인문').kind === 'series');
  check('학과가 계열보다 우선',
    pickRuleForDepartment([med, humanities], '의예과', '인문').kind === 'department');
  check('규칙이 없으면 none', pickRuleForDepartment([], '의예과').kind === 'none');
}

check('매칭 정규화 — 괄호·공백 제거',
  normalizeForMatch('간호학과 (야간)') === '간호학과야간');
check('DB 행 → 화면 형태', mapCsatRule({
  block_index: 1, scope_kind: 'department', scope_labels: ['의예'],
  department_terms: ['의예과'], series: null, condition_text: 'c',
  mode: 'sum', pick_count: 3, threshold: 4, tam_count: 1, areas: ['국'],
}).pickCount === 3);


/* ── 최저 기준은 내 세부전공에 적용되는 조건만 ── */
{
  const RAW = '인문,생활과학: 국,수,영,탐(1)중 2개 합 8 간호,국어교육: 국,수,영,탐(1) 중 2개 합 6 의예: 국,수(미/기),영,과(절사) 4개 합 5';
  const gyogwa: WishlistItem['gyogwa'] = {
    id: 'gg1', region: null, university: '전북대', admission: '일반학생', unit: null,
    method: '교과 100', method_tags: [], unit_tags: [], quota: null, quota_text: null,
    csat_status: null, has_csat: true, csat: RAW, subjects_all: [], careers: [],
  };
  const rowCsat = buildComparisonRows().find((r) => r.key === 'csat')!;

  // 규칙이 없으면 원문 전체 (종전 동작 — 안전한 폴백)
  const noRule = col(item({ gyogwa, department: '의예과' }), ctx9(3.0));
  check('규칙 없으면 원문 전체', rowCsat.text(noRule) === RAW);

  // 손으로 쓴 사전으로 구조화 (LLM 없음)
  const built = buildCsatRulesFromLabels('gg1', RAW).rows.map(
    (r) => mapCsatRule(r as unknown as Record<string, unknown>),
  );
  check('사전으로 3블록 모두 구조화', built.length === 3, `${built.length}건`);

  const ctxWithRules = { ...ctx9(3.0), csatRules: new Map([['gg1', built]]) };
  const med = col(item({ gyogwa, department: '의예과' }), ctxWithRules);
  const nurse = col(item({ gyogwa, department: '간호학과' }), ctxWithRules);

  check('의예과 → 의예 조건만', rowCsat.text(med) === '[의예] 국,수(미/기),영,과(절사) 4개 합 5',
    rowCsat.text(med));
  check('간호학과 → 간호 조건만', rowCsat.text(nurse).startsWith('[간호,국어교육]'), rowCsat.text(nurse));
  check('원문 전체가 아니라 내 조건만', rowCsat.text(med).length < RAW.length);

  const medRule = built.find((r) => r.scopeLabels.includes('의예'))!;
  check('의예 조건 영역에 국·수 포함(파서 수정 효과)',
    medRule.areas.includes('국') && medRule.areas.includes('수'), medRule.areas.join(''));
  check('의예 조건 수치', medRule.pickCount === 4 && medRule.threshold === 5);
}

/* ── 영역 순서: 기본 → 전형·경쟁률 → 내신 → 수능최저 ── */
{
  const all = buildComparisonRows();
  const order: string[] = [];
  for (const r of all) if (order[order.length - 1] !== r.section) order.push(r.section);
  check('경쟁률이 내신보다 앞',
    order.indexOf('competition') < order.indexOf('naesin'), order.join(' > '));
  check('기본 정보가 맨 앞', order[0] === 'basic');
  check('영역이 흩어지지 않는다', order.length === new Set(order).size, order.join(' > '));
}


/* ── 고사 일정은 내 전형 것만 ── */
{
  check('트랙 판정 — 교과', matchesTrack('학생부위주(교과) > 일반 > x > 학생부교과(지역균형)', 'gyogwa'));
  check('트랙 판정 — 교과 지원자에게 논술은 아니다',
    !matchesTrack('논술위주 > 일반전형 > x > 논술위주(논술)', 'gyogwa'));
  check('트랙 판정 — 종합', matchesTrack('학생부위주(종합) > 일반 > x > 학생부종합(큰사람)', 'jonghap'));
  check('트랙 판정 — 종합 지원자에게 교과는 아니다',
    !matchesTrack('학생부위주(교과) > 일반 > x > 학생부교과', 'jonghap'));
  // 경로가 비면 판단하지 않고 통과 — 자료 결손으로 실제 일정이 사라지면 안 된다
  check('경로가 비면 통과', matchesTrack('', 'gyogwa') && matchesTrack('   ', 'jonghap'));

  const gyoPath = '학생부위주(교과) > 일반 > x > 학생부교과(지역균형)';
  const nonsulPath = '논술위주 > 일반전형 > x > 논술위주(논술)';
  const s1 = sched({ id: 'A', admissionPath: gyoPath, admissionName: '학생부교과(지역균형)', units: ['간호학과'] });
  const s2 = sched({ id: 'B', admissionPath: nonsulPath, admissionName: '논술위주(논술)', units: ['경영학과'], examType: '논술' });
  const s3 = sched({ id: 'C', admissionPath: gyoPath, admissionName: '학생부교과(농어촌학생)', units: ['철학과'] });

  const base = col(item({ track: 'gyogwa', admissionName: '학생부교과(지역균형)', department: '간호학과' }), ctx9(3.0));
  const got = schedulesFor({ ...base, schedules: [s1, s2, s3] });
  // **전형 이름으로 거른다** (2026-09-01 라이브 46건 실측으로 확정).
  // 한때 "거르면 실제 일정이 사라진다"고 보고 전부 보여줬으나 오판이었다 —
  // 매칭 0건은 자료 결손이 아니라 그 전형에 고사가 원래 없다는 뜻이다.
  check('내 전형 일정만 남는다', got.length === 1 && got[0].id === 'A',
    got.map((x) => x.id).join(','));
  check('나머지는 다른 전형으로 분리',
    otherSchedulesFor({ ...base, schedules: [s1, s2, s3] }).length === 2);

  // 이름 표기 차이 흡수 — 라이브 실측 형태
  check("'학생부종합(큰사람 전형)' ↔ '학생부종합(큰사람)'",
    matchesAdmissionName('학생부종합(큰사람)', '학생부종합(큰사람 전형)'));
  check('공백·괄호 차이 흡수',
    matchesAdmissionName('학생부교과(지역균형)', '학생부교과 (지역 균형) 전형'));
  check('다른 전형은 매칭하지 않는다',
    !matchesAdmissionName('학생부종합(큰사람)', '학생부교과(일반학생 전형)'));
  check('교과 지원자에게 논술 일정은 안 걸린다',
    !matchesAdmissionName('논술위주(논술)', '학생부교과(지역균형)'));
  // 인하대 실측: 서류형 지원인데 일정에는 면접형만 → 내 전형엔 면접이 없다
  check('서류형 ↔ 면접형은 다른 전형',
    !matchesAdmissionName('학생부종합(인하미래인재(면접형))', '학생부종합(인하미래인재(서류형))'));
  check('전형명이 없으면 거르지 않는다', matchesAdmissionName('아무거나', null));

  // 매칭 0건 = 이 전형에 고사가 없다
  const noMatch = col(item({ track: 'gyogwa', admissionName: '학생부교과(일반학생 전형)' }), ctx9(3.0));
  const none = { ...noMatch, schedules: [s1, s2, s3] };
  check('매칭 0건이면 빈 배열(폴백 없음)', schedulesFor(none).length === 0);
  const rowSched = buildComparisonRows().find((r) => r.key === 'examSchedule')!;
  check("다른 전형 일정이 있으면 '이 전형은 고사 없음'",
    rowSched.text(none) === '이 전형은 고사 없음', rowSched.text(none));
  check("대학 자료 자체가 없으면 '자료 없음'",
    rowSched.text({ ...noMatch, schedules: [] }) === '자료 없음');
  check('근거 모달에 다른 전형 목록을 담는다', (() => {
    const d = rowSched.detail!(none);
    return !!d && d.sections.some((x) => (x.heading ?? '').includes('다른 전형'));
  })());
}


/* ── 셀 근거(클릭 모달) ── */
{
  const RAW = '국,수,영,탐(1) 중 2개 합 8 의예: 국,수(미/기),영,과(절사) 4개 합 5';
  const gyogwa: WishlistItem['gyogwa'] = {
    id: 'gd1', region: null, university: '전북대', admission: '일반학생', unit: null,
    method: '교과 100', method_tags: [], unit_tags: [], quota: null, quota_text: null,
    csat_status: null, has_csat: true, csat: RAW, subjects_all: [], careers: [],
  };
  const rows2 = buildComparisonRows(['2028↔2027']);
  const byKey = (k: string) => rows2.find((r) => r.key === k)!;

  const MOCK4 = [
    { subject: '국어', grade: 2 }, { subject: '수학', grade: 3 },
    { subject: '영어', grade: 2 }, { subject: '생명과학', grade: 1 },
  ];
  // 실제 화면과 같은 경로: 구조화 규칙이 있는 상태에서 판정한다
  const builtRules = buildCsatRulesFromLabels('gd1', RAW).rows.map(
    (r) => mapCsatRule(r as unknown as Record<string, unknown>),
  );
  const ctxR: StudentContext = {
    naesin: { avgGrade: 3.0, isFiveTier: false, subjectCount: 40 },
    subjects: null,
    // 의예 조건이 **4개 영역**을 요구하므로 4영역을 갖춘 성적을 준다.
    // (2과목만 주면 영역이 모자라 judge 가 'unknown' 이 되는데 그건 정상 동작이다.)
    mock: { academicYear: 2026, examMonth: 9, subjects: MOCK4 },
    mockRounds: [{ academicYear: 2026, examMonth: 9, subjects: MOCK4 }],
    csatRules: new Map([['gd1', builtRules]]),
  };
  const c = col(item({ gyogwa, department: '의예과' }), ctxR);

  // 최저 기준 — 원문 전체가 근거로 들어간다
  const d1 = byKey('csat').detail!(c)!;
  check('최저 기준에 근거가 있다', !!d1 && d1.sections.length > 0);
  check('근거에 원문이 담긴다', d1.sections.some((x) => x.text === RAW));

  // 충족여부 — 계산에 쓴 영역이 들어간다
  const d2 = byKey('csat-9월').detail!(c);
  check('충족 판정에 근거가 있다', !!d2);
  check('계산에 쓴 영역을 보여준다',
    !!d2 && d2.sections.some((x) => x.heading === '계산에 쓴 영역' && (x.items?.length ?? 0) > 0));

  // 근거가 없으면 null — 눌러도 아무 일 없는 칸을 만들지 않는다
  const bare = col(item(), ctx9(3.0));
  check('최저 기준이 없으면 근거도 없다', byKey('csat').detail!(bare) === null);
  check('변경사항 자료가 없으면 근거 없음',
    byKey('change-2028↔2027').detail!({ ...bare, changes: [] }) === null);
  check('일정 자료가 없으면 근거 없음',
    byKey('examSchedule').detail!({ ...bare, schedules: [] }) === null);

  // 일정 — 전체 목록이 근거로
  const withSched = { ...bare, schedules: [sched(), sched({ id: 'S9', examStart: '2026-11-30', examEnd: '2026-11-30' })] };
  const d3 = byKey('examSchedule').detail!(withSched)!;
  check('일정 근거는 건마다 한 섹션', d3.sections.length === 2);
  check('일정 근거에 원서접수·발표일',
    d3.sections[0].items!.some((i) => i.label === '원서접수')
    && d3.sections[0].items!.some((i) => i.label === '합격자 발표'));

  // 편집 행에는 근거를 붙이지 않는다(입력칸이 클릭을 먹는다)
  check('편집 행은 근거 없음', byKey('convertedScore').detail === undefined);
}


/* ── 근거 셀 클릭 영역 (드롭다운이 모달을 열던 회귀) ── */
{
  const all = buildComparisonRows(['2028↔2027']);
  const byKey = (k: string) => all.find((r) => r.key === k)!;

  // 최저 충족여부는 편집 시 <select> 다 — 통째로 감싸면 드롭다운 클릭이
  // 부모 버튼까지 올라가 근거 모달이 함께 열린다(2026-09-01 실제 발생).
  check('충족여부(편집)는 컨트롤이 있다', cellHasControl(byKey('csat-6월'), true));
  check('충족여부(편집)는 셀을 감싸지 않는다',
    !shouldWrapCell(byKey('csat-6월'), true, /* hasDetail */ true));
  check('충족여부(열람)는 배지라 감싸도 된다',
    shouldWrapCell(byKey('csat-6월'), false, true));

  // 텍스트/날짜 입력도 같은 이유로 감싸면 안 된다
  check('환산점수(편집)는 컨트롤이 있다', cellHasControl(byKey('convertedScore'), true));
  check('최종 발표일(편집)도 컨트롤이 있다', cellHasControl(byKey('finalAnnounceDate'), true));

  // 컨트롤이 없는 칸은 통째로 클릭 영역이어야 한다(누르기 쉬워야 한다)
  check('최저 기준은 컨트롤이 없다', !cellHasControl(byKey('csat'), true));
  check('최저 기준은 셀 전체가 클릭 영역', shouldWrapCell(byKey('csat'), true, true));
  check('고사 일정도 셀 전체가 클릭 영역', shouldWrapCell(byKey('examSchedule'), true, true));

  // 근거가 없으면 어느 쪽도 감싸지 않는다
  check('근거 없으면 감싸지 않는다', !shouldWrapCell(byKey('csat'), true, false));
}

console.log(`\n${fail === 0 ? '✅' : '❌'} pass ${pass} / fail ${fail}`);
process.exit(fail === 0 ? 0 : 1);
