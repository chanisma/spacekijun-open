// 창의적 체험활동 순수 로직 회귀 — 라벨·계보·시수
// 실행: npx tsx scripts/creative-activities-test/run.mts
//
// 이 세 모듈은 화면 여러 곳이 공유하는 단일 출처라, 여기가 깨지면
// "카드에 34시간, 상세에 30시간" 같은 조용한 불일치가 생긴다.

import {
  ACTIVITY_AREA_GROUPS,
  ACTIVITY_AREAS,
  areaForGroup,
  getAreaGroup,
  getAreaGroupLabel,
  getAreaGroupTone,
  areaFromNeisLabel,
  areaFromTimetableActivityType,
  formatActivityPeriod,
  getAreaLabel,
  getAreaShortLabel,
  getAreaTone,
  getBudgetSourceLabel,
  getHostKindLabel,
  getOperatorLabel,
  getStatusClass,
  getStatusLabel,
  isSingleDay,
} from '../../src/features/creative-activities/utils/activityLabels';
import {
  buildLineageIndex,
  buildLineageTree,
  findLineageRoot,
  getLineageBadge,
  getLineageChain,
  getLineageGeneration,
  getLineageParentCandidates,
  groupByLineage,
  type LineageNode,
} from '../../src/features/creative-activities/utils/lineage';
import {
  DUPLICATE_ACTION_LABELS,
  isSimilarActivityName,
  normalizeActivityName,
  suggestedAction,
} from '../../src/features/creative-activities/utils/activityDuplicates';
import {
  buildCategories,
  getCategoryTone,
  parseCareerFields,
  UNCATEGORIZED,
  UNCATEGORIZED_LABEL,
  CATEGORY_PALETTE_SIZE,
} from '../../src/features/creative-activities/utils/categories';
import {
  buildDraftSystemPrompt,
  buildDraftUserPrompt,
  detectPersonNames,
  extractJsonObject,
  hasDateEvidence,
  redactNames,
  findMissingRecommended,
  findMissingRequired,
  isDraftReady,
  parseDraftResponse,
} from '../../src/features/creative-activities/utils/activityDraft';
import {
  budgetPerParticipant,
  countedParticipants,
  isCountedStatus,
  resolveParticipantHours,
  round1,
  sumActivityHours,
  sumAreaHours,
  sumAreaHoursByYear,
  type HoursActivityLike,
  type HoursParticipationLike,
} from '../../src/features/creative-activities/utils/hours';

let pass = 0;
function ok(cond: boolean, name: string) {
  if (!cond) { console.error('  ✗', name); process.exit(1); }
  console.log('  ✓', name); pass++;
}

// ══════════════════════════════════════════
console.log('\n[라벨 · 색상]');
// ══════════════════════════════════════════

ok(ACTIVITY_AREAS.length === 4, '영역은 4종(자율·동아리·진로·봉사)');
ok(getAreaLabel('autonomy') === '자율·자치', '영역 라벨: autonomy');
ok(getAreaLabel('club') === '동아리', '영역 라벨: club');
ok(getAreaShortLabel('autonomy') === '자율', '짧은 라벨은 칩 폭에 맞춰 축약');
ok(getAreaLabel(null) === '미분류', '영역이 없으면 미분류');

// 색이 곧 의미다 — 네 영역이 서로 다른 계열을 써야 카드 스캔이 가능하다
{
  const tones = ACTIVITY_AREAS.map((a) => getAreaTone(a).tone);
  ok(new Set(tones).size === 4, '네 영역의 색 계열이 서로 다르다');
  ok(getAreaTone('club').tone === 'violet', '동아리 = violet');
  ok(getAreaTone('service').tone === 'emerald', '봉사 = emerald');
  ok(getAreaTone(undefined).chip.includes('slate'), '미분류는 중립 슬레이트');
}

// 생기부·시간표 표기와의 다리
ok(areaFromNeisLabel('동아리활동') === 'club', '생기부 표기 → area');
ok(areaFromNeisLabel('자율·자치활동') === 'autonomy', '2022 개정 표기도 매핑');
ok(areaFromNeisLabel('자율 활동') === 'autonomy', '공백이 섞여도 매핑(정규화)');
ok(areaFromNeisLabel('행동특성및종합의견') === null, '창체가 아닌 항목은 null');
ok(areaFromNeisLabel(null) === null, 'null 입력 안전');
ok(areaFromTimetableActivityType('career') === 'career', 'teacher_timetable.activity_type → area');
ok(areaFromTimetableActivityType('subject') === null, '교과 슬롯은 창체가 아니다');

ok(getHostKindLabel('club') === '동아리', '주최 종류 라벨');
ok(getOperatorLabel('external') === '외부 업체', '운영 형태 라벨');
ok(getBudgetSourceLabel('office') === '교육청 사업', '예산 출처 라벨');
ok(getBudgetSourceLabel(null) === '미지정', '예산 미지정');
ok(getStatusLabel('running') === '진행 중', '상태 라벨');
ok(getStatusClass('done').includes('emerald'), '완료는 에메랄드(dialogDesign 규약)');
ok(getStatusClass('cancelled').includes('rose'), '취소는 로즈');

// 기간 표기
ok(formatActivityPeriod('2026-03-27') === '3.27', '하루 활동');
ok(formatActivityPeriod('2026-03-27', '2026-03-27') === '3.27', '시작=종료도 하루로 표기');
ok(formatActivityPeriod('2026-03-27', '2026-03-29') === '3.27–3.29', '기간 활동');
ok(formatActivityPeriod('2026-11-05') === '11.5', '앞자리 0 제거');
ok(formatActivityPeriod(null) === '', 'null 안전');
ok(isSingleDay('2026-03-27', null) === true, 'ends_on 없으면 하루');
ok(isSingleDay('2026-03-27', '2026-03-28') === false, '이틀은 하루가 아님');

// ══════════════════════════════════════════
console.log('\n[계보]');
// ══════════════════════════════════════════

// 실제 모양: 혈액형 실험이 3년째 이어지고, 2026에 분기가 하나 생긴다
const nodes: LineageNode[] = [
  { id: 'a24', name: '혈액형 판별 실험', academic_year: 2024, lineage_parent_id: null },
  { id: 'a25', name: '혈액형·Rh 판별 실험', academic_year: 2025, lineage_parent_id: 'a24' },
  { id: 'a26', name: '혈액형 판별 실험 심화', academic_year: 2026, lineage_parent_id: 'a25' },
  { id: 'b26', name: '수혈 적합성 탐구', academic_year: 2026, lineage_parent_id: 'a25' },
  { id: 'z26', name: '원예 텃밭 가꾸기', academic_year: 2026, lineage_parent_id: null },
];
const idx = buildLineageIndex(nodes);

ok(getLineageGeneration('a24', idx) === 1, '첫 해 활동은 1년째');
ok(getLineageGeneration('a26', idx) === 3, '3대째 활동은 3년째');
ok(getLineageGeneration('b26', idx) === 3, '분기한 활동도 뿌리부터 센다');
ok(getLineageGeneration('z26', idx) === 1, '계보 없는 활동은 1년째');

// 배지는 2년째부터 — 모든 카드에 배지가 붙으면 정보가 사라진다
ok(getLineageBadge('a24', idx) === null, '1년째는 배지 없음');
ok(getLineageBadge('a26', idx) === '3년째', '3년째 배지');
ok(getLineageBadge('z26', idx) === null, '계보 없으면 배지 없음');

{
  const chain = getLineageChain('a26', idx);
  ok(chain.length === 3, '조상 사슬 길이');
  ok(chain[0].id === 'a24' && chain[2].id === 'a26', '사슬은 루트 → 자신 순');
}
ok(findLineageRoot('b26', idx)?.id === 'a24', '분기 활동의 뿌리 찾기');
ok(findLineageRoot('z26', idx)?.id === 'z26', '루트 자신의 뿌리는 자신');

{
  const tree = buildLineageTree('a24', idx)!;
  ok(tree.generation === 1, '트리 루트는 1대');
  ok(tree.children.length === 1 && tree.children[0].node.id === 'a25', '루트의 자식은 하나');
  ok(tree.children[0].children.length === 2, '2025에서 둘로 분기');
  const branchIds = tree.children[0].children.map((c) => c.node.id).sort();
  ok(branchIds.join(',') === 'a26,b26', '분기 자식 둘이 모두 잡힌다');
  ok(tree.children[0].children[0].generation === 3, '분기 자식은 3대');
}

// 부분 목록 안전성 — 필터된 화면에서 부모가 없을 수 있다
{
  const partial = buildLineageIndex(nodes.filter((n) => n.academic_year === 2026));
  ok(getLineageGeneration('a26', partial) === 1, '부모가 목록에 없으면 그 화면에서는 루트');
  ok(getLineageBadge('a26', partial) === null, '부분 목록에서는 배지를 만들지 않는다');
  ok(getLineageChain('a26', partial).length === 1, '끊긴 사슬은 자기 자신까지');
}

// 순환 방어 — 서버 트리거가 막지만 클라이언트가 멈추면 안 된다
{
  const cyclic: LineageNode[] = [
    { id: 'c1', name: 'A', academic_year: 2025, lineage_parent_id: 'c2' },
    { id: 'c2', name: 'B', academic_year: 2026, lineage_parent_id: 'c1' },
  ];
  const cidx = buildLineageIndex(cyclic);
  const chain = getLineageChain('c1', cidx);
  ok(chain.length <= 2, '순환이 있어도 사슬이 무한해지지 않는다');
  const tree = buildLineageTree('c1', cidx);
  ok(tree !== null, '순환 그래프에서도 트리 생성이 끝난다');
}

// 계보 묶음 — 인사이트의 지속성 지표
{
  const groups = groupByLineage(nodes);
  ok(groups.length === 2, '계보 2개(혈액형 계열 · 원예)');
  ok(groups[0].root.id === 'a24', '오래 이어진 계보가 먼저');
  ok(groups[0].members.length === 4, '분기까지 한 계보에 묶인다');
  ok(groups[0].span === 3, '연도 span 3년');
  ok(groups[1].span === 1, '단발 활동은 span 1');
}

// 부모 후보 — 자기 자신·자손을 고를 수 없어야 순환이 안 생긴다
{
  const cands = getLineageParentCandidates('a25', nodes).map((n) => n.id).sort();
  ok(!cands.includes('a25'), '자기 자신은 부모 후보가 아니다');
  ok(!cands.includes('a26') && !cands.includes('b26'), '자손도 부모 후보가 아니다');
  ok(cands.includes('a24') && cands.includes('z26'), '조상·무관 활동은 후보');
  ok(getLineageParentCandidates(null, nodes).length === nodes.length, '신규 활동은 전부 후보');
}

// ══════════════════════════════════════════
console.log('\n[시수]');
// ══════════════════════════════════════════

const act: HoursActivityLike = { id: 'a26', area: 'club', academic_year: 2026, hours: 4 };

ok(resolveParticipantHours(act, { hours: null, status: 'active' }) === 4,
  '개별 시수가 없으면 활동 시수를 상속');
ok(resolveParticipantHours(act, { hours: 2, status: 'active' }) === 2,
  '개별 시수가 있으면 그것이 이긴다(부분 참여)');
ok(resolveParticipantHours(act, { hours: null, status: 'completed' }) === 4,
  '이수도 집계 대상');
ok(resolveParticipantHours(act, { hours: null, status: 'applied' }) === 0,
  '신청만 한 상태는 0 — 아직 하지 않은 시간을 실적으로 세지 않는다');
ok(resolveParticipantHours(act, { hours: 4, status: 'withdrawn' }) === 0,
  '중도 이탈은 개별 시수가 있어도 0');
ok(resolveParticipantHours({ hours: null }, { hours: null, status: 'active' }) === 0,
  '양쪽 다 없으면 0');
ok(resolveParticipantHours(null, { hours: 3, status: 'active' }) === 3,
  '활동 정보가 없어도 개별 시수는 산다');

ok(isCountedStatus('active') && isCountedStatus('completed'), '집계 대상 상태');
ok(!isCountedStatus('applied') && !isCountedStatus('withdrawn'), '비집계 상태');
ok(!isCountedStatus(null), 'null 상태는 비집계');

// 영역별 합계
{
  const activities: HoursActivityLike[] = [
    { id: 'x1', area: 'club', academic_year: 2026, hours: 4 },
    { id: 'x2', area: 'career', academic_year: 2026, hours: 2 },
    { id: 'x3', area: 'service', academic_year: 2025, hours: 8 },
    { id: 'x4', area: 'autonomy', academic_year: 2026, hours: 1.5 },
  ];
  const parts: HoursParticipationLike[] = [
    { activity_id: 'x1', student_code: '00-00646', status: 'active', hours: null },
    { activity_id: 'x2', student_code: '00-00646', status: 'completed', hours: null },
    { activity_id: 'x3', student_code: '00-00646', status: 'active', hours: 6 },
    { activity_id: 'x4', student_code: '00-00646', status: 'active', hours: null },
    { activity_id: 'x9', student_code: '00-00646', status: 'active', hours: 99 }, // 목록에 없는 활동
    { activity_id: 'x1', student_code: '00-00646', status: 'applied', hours: null },
  ];
  const sum = sumAreaHours(parts, activities);
  ok(sum.club === 4, '동아리 시수');
  ok(sum.career === 2, '진로 시수');
  ok(sum.service === 6, '봉사 시수는 개별 값 우선');
  ok(sum.autonomy === 1.5, '0.5 단위 시수 보존');
  ok(sum.total === 13.5, '총합에 목록 밖 활동·신청 상태가 섞이지 않는다');

  const byYear = sumAreaHoursByYear(parts, activities);
  ok(byYear.get(2026)?.total === 7.5, '2026 시수');
  ok(byYear.get(2025)?.total === 6, '2025 시수');
  ok(byYear.size === 2, '학년도 2개');
}

// 부동소수 누적 오차 — 0.1을 세 번 더하면 0.30000000000000004가 된다
{
  const activities: HoursActivityLike[] = [
    { id: 'f1', area: 'club', academic_year: 2026, hours: 0.1 },
    { id: 'f2', area: 'club', academic_year: 2026, hours: 0.2 },
  ];
  const parts: HoursParticipationLike[] = [
    { activity_id: 'f1', student_code: 's', status: 'active', hours: null },
    { activity_id: 'f2', student_code: 's', status: 'active', hours: null },
  ];
  ok(sumAreaHours(parts, activities).total === 0.3, '누적 오차를 소수 1자리에서 끊는다');
  ok(round1(0.30000000000000004) === 0.3, 'round1 직접 확인');
}

// 활동 단위 합계 · 참여자 수
{
  const parts = [
    { hours: null, status: 'active' as const },
    { hours: 2, status: 'active' as const },
    { hours: null, status: 'applied' as const },
    { hours: null, status: 'withdrawn' as const },
  ];
  ok(sumActivityHours(act, parts) === 6, '활동 총 인정 시수 = 4 + 2');
  ok(countedParticipants(parts) === 2, '집계 참여자는 2명(신청·이탈 제외)');
}

// 1인당 예산 — 0으로 나누지 않는다
ok(budgetPerParticipant(340000, 17) === 20000, '1인당 예산');
ok(budgetPerParticipant(340000, 0) === null, '참여자 0명이면 null(0원으로 찍으면 무료로 오독)');
ok(budgetPerParticipant(null, 17) === null, '예산 미입력이면 null');
ok(budgetPerParticipant(0, 17) === 0, '예산 0원은 0원(null이 아니다)');
// ══════════════════════════════════════════
console.log('\n[영역 그룹 — 자율·진로 병합]');
// ══════════════════════════════════════════

ok(ACTIVITY_AREA_GROUPS.length === 3, '표시 그룹은 3종(자율·진로 / 동아리 / 봉사)');
ok(getAreaGroup('autonomy') === 'autonomy_career', '자율 → 자율·진로 그룹');
ok(getAreaGroup('career') === 'autonomy_career', '진로 → 자율·진로 그룹(생기부에서 비슷한 내용)');
ok(getAreaGroup('club') === 'club', '동아리는 단독 그룹');
ok(getAreaGroup('service') === 'service', '봉사는 단독 그룹');
ok(getAreaGroup(null) === 'autonomy_career', '미상은 자율·진로로 폴백');
ok(getAreaGroupLabel('autonomy_career') === '자율·진로', '그룹 라벨');

ok(getAreaGroupTone('autonomy_career').tone === getAreaGroupTone(getAreaGroup('career')).tone,
  '자율·진로가 한 색을 공유한다');
ok(getAreaGroupTone('club').tone === 'violet' && getAreaGroupTone('service').tone === 'emerald',
  '동아리 violet · 봉사 emerald 유지');

ok(areaForGroup('autonomy_career') === 'autonomy', '자율·진로 그룹은 autonomy로 저장');
ok(areaForGroup('club') === 'club' && areaForGroup('service') === 'service', '나머지는 그대로');
ok(ACTIVITY_AREAS.length === 4, 'DB area 값은 여전히 4종 — 기존 career 행이 살아 있어야 한다');
for (const a of ACTIVITY_AREAS) {
  ok(getAreaGroup(areaForGroup(getAreaGroup(a))) === getAreaGroup(a), `그룹 왕복 안정: ${a}`);
}

// ══════════════════════════════════════════
console.log('\n[진로·분야 카테고리]');
// ══════════════════════════════════════════

ok(JSON.stringify(parseCareerFields('의학, 생명공학')) === JSON.stringify(['의학', '생명공학']),
  '쉼표 구분');
ok(JSON.stringify(parseCareerFields(' 의학 ,  생명공학 ')) === JSON.stringify(['의학', '생명공학']),
  '앞뒤 공백 제거');
ok(JSON.stringify(parseCareerFields('의학\n생명공학·보건、간호')) === JSON.stringify(['의학', '생명공학', '보건', '간호']),
  '줄바꿈·가운뎃점·모점도 구분자');
ok(JSON.stringify(parseCareerFields('의학, 의학, 의 학')) === JSON.stringify(['의학', '의 학']),
  '중복 제거하되 내부 공백은 한 칸으로 정규화');
ok(parseCareerFields('   ,  , ').length === 0, '빈 입력 → 빈 배열');
ok(JSON.stringify(parseCareerFields('AI, ai')) === JSON.stringify(['AI']),
  '대소문자만 다른 중복도 제거(첫 표기 유지)');

{
  const acts = [
    { id: 'a', career_fields: ['의학', '생명공학'] },
    { id: 'b', career_fields: ['의학'] },
    { id: 'c', career_fields: ['공학'] },
    { id: 'd', career_fields: [] },
    { id: 'e', career_fields: ['생명공학'] },
  ];
  const buckets = buildCategories(acts);
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  ok(byKey.get('의학')!.count === 2, '한 분야에 여러 활동');
  ok(byKey.get('생명공학')!.count === 2, '다중 분야 활동은 여러 버킷에 동시에 들어간다');
  ok(byKey.get('의학')!.activityIds.join(',') === 'a,b', '버킷 안 순서는 원본 순서 보존');
  ok(byKey.has(UNCATEGORIZED), '분야 없는 활동은 미지정 버킷');
  ok(byKey.get(UNCATEGORIZED)!.label === UNCATEGORIZED_LABEL, '미지정 라벨');

  ok(buckets[buckets.length - 1].key === UNCATEGORIZED, '미지정은 항상 맨 뒤');
  ok(buckets[0].count >= buckets[1].count, '개수 내림차순');
  const tied = buckets.filter((b) => b.count === 2).map((b) => b.label);
  ok(tied.join(',') === '생명공학,의학', '동점은 이름 오름차순(ko)');
}

{
  const buckets = buildCategories([{ id: 'x', career_fields: ['의학'] }]);
  ok(!buckets.some((b) => b.key === UNCATEGORIZED), '전원 분야가 있으면 미지정 버킷 없음');
  ok(buckets.length === 1, '버킷 1개');
}
ok(buildCategories([]).length === 0, '빈 목록 → 빈 버킷');

{
  ok(getCategoryTone('의학').bg === getCategoryTone('의학').bg, '같은 이름 → 같은 색(결정론)');
  ok(getCategoryTone(UNCATEGORIZED).bg === '#F6F7F9', '미지정은 중립 회색 — 색을 배정하지 않는 것이 곧 정보다');

  const names = ['의학','공학','교육','경영','예술','체육','인문','자연과학','사회','법학','언론','건축','간호','수학','컴퓨터'];
  const used = new Set(names.map((n) => getCategoryTone(n).bg));
  ok(used.size >= Math.min(6, CATEGORY_PALETTE_SIZE), `15개 분야가 최소 6색으로 갈라진다 (실제 ${used.size}색)`);
}

// ══════════════════════════════════════════
console.log('\n[AI 초안 — 파싱·되묻기]');
// ══════════════════════════════════════════

// JSON 추출 — 모델은 코드펜스나 잡담을 자주 붙인다
ok((extractJsonObject('{"a":1}') as any).a === 1, '평범한 JSON');
ok((extractJsonObject('```json\n{"a":1}\n```') as any).a === 1, '코드펜스 제거');
ok((extractJsonObject('```\n{"a":1}\n```') as any).a === 1, '언어 없는 펜스도 제거');
ok((extractJsonObject('네, 정리했습니다.\n{"a":1}\n도움이 되었길!') as any).a === 1,
  '앞뒤 잡담 제거');
ok(extractJsonObject('그냥 문장입니다') === null, 'JSON이 없으면 null');

// 완성된 초안 → 되묻지 않는다
{
  const r = parseDraftResponse(JSON.stringify({
    draft: {
      name: '혈액형 판별 실험', areaGroup: 'club',
      content: '항혈청으로 ABO·Rh를 판별했다.',
      careerFields: ['의학', '생명공학'], startsOn: '2026-08-27',
    },
    questions: [],
  }));
  ok(r.questions.length === 0, '필수가 다 차면 질문 없음');
  ok(isDraftReady(r.draft), '초안 준비 완료');
  ok(r.draft.careerFields!.length === 2, '분야 배열 파싱');
}

// 필수가 비면 **모델이 안 물어도** 우리가 묻는다 — 판정의 정본은 코드다
{
  const r = parseDraftResponse(JSON.stringify({
    draft: { areaGroup: 'club', content: '실험을 했다', startsOn: '2026-08-27' },
    questions: [],
  }));
  ok(r.questions.length === 1, '이름이 없으면 모델이 안 물어도 질문이 생긴다');
  ok(r.questions[0].includes('이름'), '이름을 묻는 질문');
  ok(!isDraftReady(r.draft), '준비되지 않음');
  ok(findMissingRequired(r.draft).join(',') === 'name', '결손 항목 = name');
}

// "미상"류를 값으로 받으면 되묻기가 무력해진다
for (const junk of ['미상', '모름', '알 수 없음', 'unknown', 'N/A', '  ']) {
  const r = parseDraftResponse(JSON.stringify({
    draft: { name: junk, areaGroup: 'club', content: 'x', startsOn: '2026-08-27' },
  }));
  ok(findMissingRequired(r.draft).includes('name'), `"${junk}"는 값이 아니라 결손`);
}

// 영역·날짜 검증
{
  const r = parseDraftResponse(JSON.stringify({
    draft: { name: 'A', areaGroup: '동아리', content: 'x', startsOn: '2026-08-27' },
  }));
  ok(r.draft.areaGroup === undefined, '허용값이 아닌 영역은 버린다');
  ok(findMissingRequired(r.draft).includes('areaGroup'), '영역을 되묻는다');
}
{
  const r = parseDraftResponse(JSON.stringify({
    draft: { name: 'A', areaGroup: 'club', content: 'x', startsOn: '2026/08/27' },
  }));
  ok(r.draft.startsOn === undefined, 'ISO가 아닌 날짜는 버린다');
}
{
  const r = parseDraftResponse(JSON.stringify({
    draft: { name: 'A', areaGroup: 'club', content: 'x', startsOn: '2026-02-31' },
  }));
  ok(r.draft.startsOn === undefined, '존재하지 않는 날짜(2/31)는 버린다');
}
{
  const r = parseDraftResponse(JSON.stringify({
    draft: { name: 'A', areaGroup: 'club', content: 'x', startsOn: '2026-08-27', endsOn: '2026-08-20' },
  }));
  ok(r.draft.endsOn === undefined, '종료일이 시작일보다 앞이면 버린다(CHECK 위반 방지)');
}
{
  const r = parseDraftResponse(JSON.stringify({
    draft: { name: 'A', areaGroup: 'club', content: 'x', startsOn: '2026-08-27', endsOn: '2026-08-27' },
  }));
  ok(r.draft.endsOn === undefined, '시작=종료면 하루로 본다(ends_on 비움)');
}

// 이미 채운 것을 또 묻지 않는다 — 같은 걸 두 번 물으면 이 기능이 가장 빨리 죽는다
{
  const r = parseDraftResponse(JSON.stringify({
    draft: { name: 'A', areaGroup: 'club', content: 'x', startsOn: '2026-08-27' },
    questions: ['활동 이름이 무엇인가요?', '날짜가 언제인가요?'],
  }));
  ok(r.questions.length === 0, '필수가 다 찼으면 모델 질문도 버린다');
}

// 응답이 깨져도 던지지 않고 질문으로 되돌린다
{
  const r = parseDraftResponse('모델이 이상한 말을 했습니다');
  ok(r.questions.length === 1, '파싱 실패 → 되묻기로 회복');
  ok(Object.values(r.draft).every((v) => v === undefined), '초안은 비어 있다');
}

// 결손이 여러 개면 모두 묻되 4개를 넘기지 않는다
{
  const r = parseDraftResponse('{"draft":{}}');
  ok(r.questions.length === 4, '필수 4개가 모두 비면 4개를 묻는다');
  ok(r.questions.length <= 4, '한 번에 4개를 넘지 않는다');
}

// 권장 항목은 되묻지 않는다(진로·분야)
{
  const r = parseDraftResponse(JSON.stringify({
    draft: { name: 'A', areaGroup: 'club', content: 'x', startsOn: '2026-08-27' },
  }));
  ok(r.questions.length === 0, '분야가 비어도 되묻지는 않는다');
  ok(findMissingRecommended(r.draft).join(',') === 'careerFields', '권장 결손으로만 표시');
}

// 대화 누적 — 이전 답변이 빠지면 같은 걸 또 묻게 된다
{
  ok(buildDraftUserPrompt(['첫 설명']) === '첫 설명', '첫 턴은 그대로');
  const p = buildDraftUserPrompt(['첫 설명', '8월 27일이요']);
  ok(p.includes('첫 설명') && p.includes('8월 27일이요'), '이후 턴은 누적된다');
  ok(p.indexOf('첫 설명') < p.indexOf('8월 27일이요'), '순서 보존');
}

// 시스템 프롬프트가 지켜야 할 규칙을 실제로 담고 있는가
{
  const sp = buildDraftSystemPrompt('2026-08-28', 2026);
  ok(sp.includes('2026-08-28'), '오늘 날짜를 싣는다(상대 날짜 해석 기준)');
  ok(sp.includes('만들어내지 마라'), '지어내기 금지 지시');
  ok(sp.includes('사람 이름'), '사람 이름 생성 금지 지시');
  ok(sp.includes('YYYY-MM-DD'), '날짜 형식 지시');
}

// ══════════════════════════════════════════
console.log('\n[AI 초안 — 코드 강제(날짜·이름)]');
// ══════════════════════════════════════════
// 실측(2026-08-28, solar-pro3)에서 프롬프트만으로는 막히지 않은 두 가지를
// 코드가 최종 판정한다. 여기가 깨지면 지어낸 날짜와 실명이 생기부 근거에 들어간다.

// ── 날짜 단서 판정 ──
for (const t of [
  '2026-08-20에 했습니다', '2026년 8월 20일', '8월 20일에 했어요', '8/20에 했어요',
  '27일에 진행', '어제 했습니다', '오늘 진행', '그저께 했어요', '엊그제 했습니다',
  '지난주 금요일', '이번 주에 했어요', '다음 주 예정', '금요일에 했습니다', '지난달에 했어요',
]) {
  ok(hasDateEvidence(t), `날짜 단서 인식: "${t}"`);
}
for (const t of [
  '방송부에서 라디오 대본 쓰는 실습을 했어요',
  '과학실에서 실험했습니다',
  '',
]) {
  ok(!hasDateEvidence(t), `날짜 단서 없음: "${t || '(빈 문자열)'}"`);
}

// ── 날짜 게이트: 원문에 단서가 없으면 모델이 채워도 버린다 ──
{
  const raw = JSON.stringify({
    draft: { name: 'A', areaGroup: 'club', content: 'x', startsOn: '2026-08-28', endsOn: '2026-08-28' },
    dateEvidence: 'explicit',   // 모델이 거짓 신고를 해도
    questions: [],
  });
  const r = parseDraftResponse(raw, ['방송부에서 대본 실습을 했어요']);  // 원문엔 날짜가 없다
  ok(r.draft.startsOn === undefined, '원문에 날짜가 없으면 모델 신고를 무시하고 버린다');
  ok(r.questions.some((q) => q.includes('날짜')), '날짜를 되묻는다');
}
{
  const raw = JSON.stringify({
    draft: { name: 'A', areaGroup: 'club', content: 'x', startsOn: '2026-08-21' },
    dateEvidence: 'explicit',
  });
  const r = parseDraftResponse(raw, ['8월 21일에 대본 실습을 했어요']);
  ok(r.draft.startsOn === '2026-08-21', '원문에 날짜가 있으면 받는다');
  ok(r.questions.length === 0, '되묻지 않는다');
}
{
  // 모델이 스스로 none이라고 신고하면 원문에 단서가 있어도 버린다(보수적)
  const raw = JSON.stringify({
    draft: { name: 'A', areaGroup: 'club', content: 'x', startsOn: '2026-08-21' },
    dateEvidence: 'none',
  });
  const r = parseDraftResponse(raw, ['8월 21일쯤이었나 잘 기억이 안 나요']);
  ok(r.draft.startsOn === undefined, '모델이 none이라 신고하면 버린다');
}
{
  // turns를 안 넘기는 호출(구 시그니처)은 종전대로 동작한다
  const raw = JSON.stringify({ draft: { name: 'A', areaGroup: 'club', content: 'x', startsOn: '2026-08-21' } });
  ok(parseDraftResponse(raw).draft.startsOn === '2026-08-21', 'turns 없이 부르면 게이트를 적용하지 않는다');
}

// ── 이름 탐지 — 꼬리가 붙은 것만 잡는다(넓게 잡으면 멀쩡한 낱말이 지워진다) ──
{
  const found = detectPersonNames('윤하준 선생님이 인솔해서 정이안, 송수아 학생이 참여했습니다');
  ok(found.includes('윤하준'), '"이름 선생님" 탐지');
  ok(found.includes('송수아'), '"이름 학생" 탐지');
  ok(found.includes('정이안'), '쉼표로 나열된 이름도 탐지(꼬리는 마지막에만 붙는다)');
  ok(detectPersonNames('과학실에서 실험했습니다').length === 0, '꼬리가 없으면 잡지 않는다');
  ok(detectPersonNames('').length === 0, '빈 문자열 안전');
}

// ── 이름 가리기 ──
ok(redactNames('윤하준 선생님이 인솔', ['윤하준']) === '○○ 선생님이 인솔', '이름을 ○○로 가린다');
ok(redactNames('정이안과 김하가 참여', ['김하', '정이안']) === '○○과 ○○가 참여',
  '긴 이름부터 지워 짧은 이름이 긴 이름을 쪼개지 않는다');
ok(redactNames('내용', []) === '내용', '가릴 이름이 없으면 그대로');
ok(redactNames(undefined, ['홍길동']) === undefined, 'undefined 안전');

// ── 이름이 서술에 새어 나와도 코드가 막는다 (실측 실패 재현) ──
{
  const raw = JSON.stringify({
    draft: {
      name: '진로 체험', areaGroup: 'autonomy_career',
      content: '2026-08-20에 윤하준 선생님이 인솔하여 정이안, 송수아 학생이 진로 체험을 진행했습니다.',
      startsOn: '2026-08-20',
    },
    dateEvidence: 'explicit',
    mentionedNames: ['윤하준', '정이안', '송수아'],
    note: '윤하준 선생님 인솔',
  });
  const r = parseDraftResponse(raw, ['2026-08-20에 윤하준 선생님이 인솔해서 정이안, 송수아 학생이 진로 체험을 했습니다.']);
  const blob = JSON.stringify(r.draft) + (r.note ?? '');
  ok(!blob.includes('윤하준'), '교사 이름이 초안에 남지 않는다');
  ok(!blob.includes('정이안') && !blob.includes('송수아'), '학생 이름이 초안에 남지 않는다');
  ok(r.draft.startsOn === '2026-08-20', '날짜는 정상적으로 남는다');
  ok(r.draft.content!.includes('○○'), '가려진 자리가 보인다(폼에서 고칠 수 있게)');
}
{
  // 모델이 mentionedNames 신고를 빠뜨려도 원문에서 캐낸다
  const raw = JSON.stringify({
    draft: { name: 'A', areaGroup: 'club', content: '윤하준 선생님이 지도했습니다', startsOn: '2026-08-20' },
    dateEvidence: 'explicit',
  });
  const r = parseDraftResponse(raw, ['2026-08-20 윤하준 선생님이 지도']);
  ok(!r.draft.content!.includes('윤하준'), '신고 누락 시 원문 탐지가 받쳐 준다');
}

// ══════════════════════════════════════════
console.log('\n[중복 활동 판정]');
// ══════════════════════════════════════════
// "이미 같은 활동이 있는 경우"의 답은 둘이고 서로 다르다 —
// 같은 해면 합류(주최·참여자 추가), 지난해면 계보 연결(이어받기).

// 정규화 — 학교에서 같은 활동이 여러 표기로 적힌다
ok(normalizeActivityName('혈액형 판별 실험') === normalizeActivityName('혈액형판별실험'),
  '공백 차이를 흡수');
ok(normalizeActivityName('혈액형 판별 실험(2학기)') === normalizeActivityName('혈액형 판별 실험'),
  '괄호 부연 제거');
ok(normalizeActivityName('2026 혈액형 판별 실험') === normalizeActivityName('혈액형 판별 실험'),
  '앞 연도 표기 제거');
ok(normalizeActivityName('혈액형 판별 실험 2차') === normalizeActivityName('혈액형 판별 실험'),
  '회차 표기 제거');
ok(normalizeActivityName('혈액형·판별-실험') === normalizeActivityName('혈액형 판별 실험'),
  '구분 기호 제거');
ok(normalizeActivityName('혈액형 판별 실험 이어가기') === normalizeActivityName('혈액형 판별 실험'),
  '계보 접미 제거 — 원래 활동을 찾아야 한다');
ok(normalizeActivityName('') === '', '빈 입력 안전');

// 유사 판정
ok(isSimilarActivityName('혈액형 판별 실험', '혈액형판별실험'), '표기만 다른 같은 활동');
ok(isSimilarActivityName('혈액형 판별 실험', '혈액형 판별 실험 심화'), '심화는 같은 계열로 본다');
ok(!isSimilarActivityName('혈액형 판별 실험', '원예 텃밭 가꾸기'), '무관한 활동은 아니다');
ok(!isSimilarActivityName('실험', '혈액형 판별 실험'),
  '너무 짧은 이름은 포함으로 묶지 않는다(모든 활동에 걸린다)');
ok(isSimilarActivityName('진로 체험', '진로 체험'), '완전히 같은 짧은 이름은 같다');
ok(!isSimilarActivityName('', '혈액형 판별 실험'), '빈 이름은 매칭하지 않는다');

// 권하는 길 — 화면이 두 경우를 다르게 안내해야 한다
ok(suggestedAction(true) === 'join', '같은 해 → 합류');
ok(suggestedAction(false) === 'continue', '지난해 → 이어받기');
ok(DUPLICATE_ACTION_LABELS.join === '이 활동에 합류', '합류 라벨');
ok(DUPLICATE_ACTION_LABELS.continue === '이어받기', '이어받기 라벨');


console.log(`\n${pass}건 통과\n`);
