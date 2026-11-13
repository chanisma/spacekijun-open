/**
 * 반영내신 규칙 파싱·계산 검증 하니스.
 * 실행: npx tsx scripts/admission-wishlist-test/run-naesin.mts
 *
 * 1~5) subjects_all[].ratio("20/30/50" = 1·2·3학년 반영비율) 학년가중 계산
 * 6~)  **계산 보류 게이트** — 규칙을 그대로 재현할 수 없으면 근사치를 내지 않는다.
 *      (2026-08 정책: 기본 환산·단순화 폴백 제거. 한서대 항공관광학과 오답 사례)
 */
import {
  parseNaesinRule,
  computeRuleNaesin,
  NAESIN_UNCERTAINTY_LABELS,
  type SubjectRecord,
  type NaesinUncertainty,
} from '../../src/features/admission-wishlist/utils/naesinRule';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${detail}`); }
}

// 학년1 국어 2등급 / 학년2 국어 3등급 / 학년3 국어 4등급 (각 4단위)
function subj(grade: number, rank: number): SubjectRecord {
  return {
    academicYear: 2024, grade, semester: 1, category: 'regular',
    subjectGroup: '국어', subject: `국어${grade}`, units: 4,
    rank, achievement: null, score: null,
  };
}
const SUBJECTS = [subj(1, 2), subj(2, 3), subj(3, 4)];

/** 진로선택 과목 (석차등급 없음 + 성취도) */
function career(subject: string, achievement: string, subjectGroup = '과학'): SubjectRecord {
  return {
    academicYear: 2024, grade: 3, semester: 1, category: 'career',
    subjectGroup, subject, units: 4, rank: null, achievement, score: null,
  };
}

function gyo(ratio?: string): any {
  return { subjects_all: [{ subjects: '국', ratio }], careers: [] };
}
/** 임의 반영방법 gyogwa 스텁 */
function rule(subjects: string, careers: any[] = [], admission: string | null = null): any {
  return { admission, subjects_all: [{ subjects, admission }], careers };
}
function has(r: any, code: NaesinUncertainty): boolean {
  return !!r && r.uncertainties.includes(code);
}

console.log('── 1) 학년별 비율 적용 (20/30/50) ──');
{
  const r = parseNaesinRule(gyo('20/30/50'));
  check('parse yearWeights {1:20,2:30,3:50}',
    !!r && JSON.stringify(r.yearWeights) === JSON.stringify({ 1: 20, 2: 30, 3: 50 }),
    r ? JSON.stringify(r.yearWeights) : 'null');
  check('certain=true', !!r && r.certain, JSON.stringify(r?.uncertainties));
  const c = computeRuleNaesin(SUBJECTS, r);
  // 학년평균 2/3/4 → (2*20+3*30+4*50)/100 = 330/100 = 3.3
  check('avgGrade=3.3 (학년가중), usedYearWeights', c.avgGrade === 3.3 && c.usedYearWeights,
    `avg=${c.avgGrade} used=${c.usedYearWeights}`);
}

console.log('\n── 2) 비율 없으면 flat 평균 ──');
{
  const r = parseNaesinRule(gyo(undefined));
  const c = computeRuleNaesin(SUBJECTS, r);
  check('avgGrade=3.0 (flat), usedYearWeights=false', c.avgGrade === 3 && !c.usedYearWeights,
    `avg=${c.avgGrade} used=${c.usedYearWeights}`);
}

console.log('\n── 3) 라벨 제거 ("간호: 40/30/30") ──');
{
  const r = parseNaesinRule(gyo('간호: 40/30/30'));
  check('parse yearWeights {1:40,2:30,3:30}',
    !!r && JSON.stringify(r.yearWeights) === JSON.stringify({ 1: 40, 2: 30, 3: 30 }),
    r ? JSON.stringify(r.yearWeights) : 'null');
  const c = computeRuleNaesin(SUBJECTS, r);
  // (2*40+3*30+4*30)/100 = (80+90+120)/100 = 2.9
  check('avgGrade=2.9', c.avgGrade === 2.9, `avg=${c.avgGrade}`);
}

console.log('\n── 4) 2값(모호) 비율 → 계산 보류 ──');
{
  const r = parseNaesinRule(gyo('30/70'));
  check('yearWeights=null (2값 모호)', !!r && r.yearWeights === null, r ? JSON.stringify(r.yearWeights) : 'null');
  check('certain=false + year-ratio-unapplied', !!r && !r.certain && has(r, 'year-ratio-unapplied'),
    JSON.stringify(r?.uncertainties));
  const c = computeRuleNaesin(SUBJECTS, r);
  // 예전엔 flat 3.0 으로 계산했다 — 비율을 못 쓰면 그 숫자는 전형 반영값이 아니다
  check('avgGrade=null (보류), withheld=true', c.avgGrade === null && c.withheld,
    `avg=${c.avgGrade} withheld=${c.withheld}`);
}

console.log('\n── 5) 일부 학년 데이터 없으면 재정규화 ──');
{
  const r = parseNaesinRule(gyo('20/30/50'));
  // 학년2,3만 존재 → den=30+50=80, num=3*30+4*50=290 → 290/80=3.625
  const c = computeRuleNaesin([subj(2, 3), subj(3, 4)], r);
  check('학년1 없음 → (3*30+4*50)/80=3.625', c.avgGrade === 3.625 && c.usedYearWeights,
    `avg=${c.avgGrade}`);
}

console.log('\n── 6) 한서대 항공관광학과 (실제 오답 사례) → 보류 ──');
{
  const HANSEO = '국,수,영(외,한문),(사,과,한)중 8과목(교과별 2과목)+진로선택 2과목=총 10과목';
  const r = parseNaesinRule(rule(HANSEO, [
    { method: '성취도별 환산점수', subject: '전 과목', criteria: 'A=9.5점, B=6.5점, C=3점', note: '2과목' },
  ]));
  check('certain=false', !!r && !r.certain, JSON.stringify(r?.uncertainties));
  check('  └ group-syntax (괄호 교과 묶음)', has(r, 'group-syntax'));
  check('  └ compound-quota (+진로선택 2과목=총 10과목)', has(r, 'compound-quota'));
  check('  └ career-unconvertible (A=9.5점 = 점수 환산)', has(r, 'career-unconvertible'));
  check('  └ career-quota (진로선택 2과목 별도)', has(r, 'career-quota'));
  check('careerConv=null (점수 환산을 등급으로 읽지 않음)', !!r && r.careerConv === null,
    JSON.stringify(r?.careerConv));
  const c = computeRuleNaesin([...SUBJECTS, career('생활과과학', 'A')], r);
  check('avgGrade=null (보류)', c.avgGrade === null && c.withheld, `avg=${c.avgGrade}`);
  check('usedSubjects=[] (근거 과목도 내보내지 않음)', c.usedSubjects.length === 0);
  check('모든 사유에 안내 문구 존재',
    c.uncertainties.every((u) => !!NAESIN_UNCERTAINTY_LABELS[u]));
}

console.log('\n── 7) 단순 규칙 + 등급 환산 → 계산 수행 ──');
{
  const r = parseNaesinRule(rule('국,수,영,사,과,한 중 12과목', [
    { method: '성취도별 환산등급', subject: '반영교과', criteria: 'A=1등급, B=2등급, C=4등급', note: '' },
  ]));
  check('certain=true', !!r && r.certain, JSON.stringify(r?.uncertainties));
  check('topN=12', r?.topN === 12, `${r?.topN}`);
  check('careerConv A=1/B=2/C=4', JSON.stringify(r?.careerConv) === JSON.stringify({ A: 1, B: 2, C: 4 }),
    JSON.stringify(r?.careerConv));
  const c = computeRuleNaesin([...SUBJECTS, career('생활과과학', 'C')], r);
  // 국어 2·3·4 + 진로선택 C=4등급 → (2+3+4+4)/4 = 3.25 (단위 동일)
  check('avgGrade=3.25 (진로선택 환산 반영)', c.avgGrade === 3.25, `avg=${c.avgGrade}`);
  check('withheld=false', !c.withheld);
}

console.log('\n── 8) 기본 환산 폴백 제거 (careers 없음 → 진로선택 제외) ──');
{
  const r = parseNaesinRule(rule('국,수,영,사,과,한'));
  check('certain=true (진로선택 반영 정보 없음은 보류 사유 아님)', !!r && r.certain,
    JSON.stringify(r?.uncertainties));
  const c = computeRuleNaesin([...SUBJECTS, career('생활과과학', 'A')], r);
  // 예전엔 A=1등급 기본 환산으로 (2+3+4+1)/4=2.5 였다 — 근거 없는 유리한 숫자
  check('avgGrade=3.0 (진로선택 미반영)', c.avgGrade === 3, `avg=${c.avgGrade}`);
  check('careerOmitted=true', c.careerOmitted);
  check('진로선택은 제외 목록에 사유와 함께',
    c.excludedSubjects.some((s) => s.subject === '생활과과학' && s.reason.includes('환산기준 없음')),
    JSON.stringify(c.excludedSubjects.map((s) => s.reason)));
}

console.log('\n── 9) 전형명으로 반영방법 변형 선택 (평택대 PTU) ──');
{
  const variants = [
    { subjects: '국,수,영,사,과,한 중 3과목', admission: 'PTU추천' },
    { subjects: '국,수,영,사,과,한 중 9과목', admission: 'PTU교과' },
  ];
  const r1 = parseNaesinRule({ admission: 'PTU추천', subjects_all: variants, careers: [] } as any);
  check('PTU추천 → 3과목 규칙 선택', r1?.topN === 3, `topN=${r1?.topN}`);
  check('  └ certain=true', !!r1 && r1.certain, JSON.stringify(r1?.uncertainties));
  const r2 = parseNaesinRule({ admission: 'PTU교과', subjects_all: variants, careers: [] } as any);
  check('PTU교과 → 9과목 규칙 선택', r2?.topN === 9, `topN=${r2?.topN}`);
  // 전형명이 어느 변형과도 맞지 않으면 어느 규칙인지 알 수 없다
  const r3 = parseNaesinRule({ admission: '알수없는전형', subjects_all: variants, careers: [] } as any);
  check('매칭 실패 → multiple-rules 보류', !!r3 && !r3.certain && has(r3, 'multiple-rules'),
    JSON.stringify(r3?.uncertainties));
}

console.log('\n── 10) 보류 트리거 개별 확인 ──');
{
  const cases: Array<[string, NaesinUncertainty]> = [
    ['인문: 국,수,영,사 자연: 국,수,영,과', 'department-branch'],
    ['1학년(국,영,사,과)+2,3학년(영,사)', 'grade-branch'],
    ['국,수,영,(사,과,한) 중 12과목', 'group-syntax'],
    ['국,수,영,사,과,한 중 12과목+진로선택 3과목=총 15과목', 'compound-quota'],
    ['국,수,영,사,과,한 중 3개 교과(이수단위 10단위 이상)', 'unit-condition'],
    ['국,수,영,사,과 중 9과목(3개 교과에서 1과목 필수)', 'required-subject'],
    ['국,영 10과목', 'unmodeled-text'],
  ];
  for (const [text, code] of cases) {
    const r = parseNaesinRule(rule(text));
    check(`"${text.slice(0, 26)}…" → ${code}`, has(r, code), JSON.stringify(r?.uncertainties));
    check('  └ 계산 보류', computeRuleNaesin(SUBJECTS, r).avgGrade === null);
  }
}

console.log('\n── 11) 교과별 N과목 + 기타교과 → per-group-scope 보류 ──');
{
  // '기'(기타)는 생기부 교과군 3개에 걸쳐 있어 "교과별 2과목"을 그대로 적용하면 과대 반영
  const r = parseNaesinRule(rule('국,수,영,사,과,한,한문 중 10과목 교과별 2과목'));
  check('per-group-scope', has(r, 'per-group-scope'), JSON.stringify(r?.uncertainties));
}

console.log('\n── 12) 통합사회·통합과학 약칭 교과군 ──');
{
  const r = parseNaesinRule(rule('국,수,영,사,통과,한'));
  check('heads에 과(통합과학) 포함', !!r && r.headGroups.has('과'), [...(r?.headGroups ?? [])].join(''));
  check('certain=true', !!r && r.certain, JSON.stringify(r?.uncertainties));
}

console.log('\n── 13) 진로선택 환산표 허점 (라이브 코퍼스 감사에서 발견) ──');
{
  // (a) 환산표가 A만 등급 — B·C 과목이 조용히 빠져 유리한 쪽으로 치우친다
  const partial = parseNaesinRule(rule('국,수,영,사,과,한', [
    { method: '성취도별 변환 환산등급', subject: '반영교과', criteria: 'A=1등급, B,C=성취도 비율 고려 산출', note: '' },
  ]));
  check('(a) 불완전 환산표(A만) → career-unconvertible',
    has(partial, 'career-unconvertible'), JSON.stringify(partial?.uncertainties));

  // (b) "10% 반영" — 진로선택을 부분 비중으로 반영. 학점가중평균으로 표현 불가
  const partialWeight = parseNaesinRule(rule('국,수,영,사,과,한', [
    { method: '성취도별 환산등급', subject: '반영교과', criteria: 'A=1등급, B=2등급, C=4등급', note: '10% 반영' },
  ]));
  check('(b) "10% 반영" → career-quota',
    has(partialWeight, 'career-quota'), JSON.stringify(partialWeight?.uncertainties));

  // (c) 조건부 환산 ("원점수가 표기된 경우 …")
  const conditional = parseNaesinRule(rule('국,수,영,사,과', [
    { method: '성취도별 환산등급', subject: '반영교과', note: '',
      criteria: 'A=1등급, B=3등급, C=5등급 (원점수가 표기된 경우 원점수별 환산등급 부여)' },
  ]));
  check('(c) 원점수 조건부 환산 → career-unconvertible',
    has(conditional, 'career-unconvertible'), JSON.stringify(conditional?.uncertainties));

  // (d) 진로선택은 "전 과목" 반영인데 교과 규칙은 국수영사과한으로 제한
  const scope = parseNaesinRule(rule('국,수,영,사,과,한', [
    { method: '성취도별 환산등급', subject: '전 과목', criteria: 'A=1등급, B=2등급, C=4등급', note: '' },
  ]));
  check('(d) 반영 범위 불일치 → career-scope', has(scope, 'career-scope'),
    JSON.stringify(scope?.uncertainties));

  // (e) 대조군 — 완전한 환산표 + 범위 일치 + 부가 조건 없음은 그대로 계산
  const ok = parseNaesinRule(rule('국,수,영,사,과,한', [
    { method: '성취도별 환산등급', subject: '반영교과', criteria: 'A=1등급, B=2등급, C=4등급', note: '' },
  ]));
  check('(e) 대조군은 certain 유지', !!ok && ok.certain, JSON.stringify(ok?.uncertainties));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
