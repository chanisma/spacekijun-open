/**
 * evalog 역량분석 · 활동 타임라인 회귀 (순수 로직).
 *
 *   npx tsx scripts/evalog-competency-test/run.mts
 *
 * ── 왜 이 테스트가 유일한 방어선인가 ────────────────────────────────────────
 * 이 기능의 결함은 **오류를 내지 않는다**. 지식그래프 층을 분절 활동에 잘못 붙이면
 * 화면은 멀쩡하게 그려지고 역량만 엉뚱한 활동에 달린다 — 교사가 근거 인용을 읽고
 * "이건 이 활동 얘기가 아닌데?" 하고 알아차리기 전까지 조용하다. 특히:
 *
 *  ① `entity_id`를 배열 위치로 계산하면 라이브 60,245건 중 37%만 맞는다.
 *  ② `layer`를 안 가리면 역량이 두 배로 세어지고 절반은 활동을 모른다.
 *  ③ 학기로 버킷을 나누면 라이브의 95%가 '학기 없음'에 쌓인다.
 *  ④ Thread 의 학년 범위를 `sources[0]`에서 읽으면 3개년 사슬이 1학년으로 보인다.
 *  ⑤ '새로 등장한 개념'을 학년 순서 없이 계산하면 1학년 개념이 새것이 아니게 된다.
 */
import {
  assembleKgLayers, entityRowsFromKgJson, extractResearchQuestion,
  isSegmentScopedEngine, plainEvidence, recordIdOf, relationRowsFromKgJson,
  type KgEntityRowLite, type KgRelationRowLite,
} from '../../src/features/evalog/utils/kgLayers';
import {
  TRAIT_KIND_ORDER, areaLabel, areaOf, areaOfKgCategory, areaTone,
  buildActivityLedger, buildCompetencyView, groupByGrade,
  type LedgerRecordRow,
} from '../../src/features/evalog/utils/activityLedger';
import type { ActivitySegmentation } from '../../src/features/evalog/types/segmentation';

let pass = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass += 1; return; }
  failures.push(detail ? `${name} — ${detail}` : name);
}
const eq = (name: string, actual: unknown, expected: unknown) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
    `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);

// ─────────────────────────────────────────────────────────────────────────────
// 픽스처 — 라이브 모양을 그대로 베낀다(00-00305·9ed5ca84 계열)
// ─────────────────────────────────────────────────────────────────────────────

const REC_A = '9ed5ca84-af2e-42f0-8a8b-6846719bf518';
const REC_B = '5d8b9d85-cea8-4662-982b-4cdfb476fb08';
const REC_C = 'a09f3571-3d99-4e16-ae24-fba82e48a441';

/**
 * 기록 A 의 분절. **`entity_id` 의 `#n` 이 배열 위치와 어긋난다** — 라이브에서
 * `activities[1].entity_id === 'act:...#3'` 인 실제 사례를 그대로 옮긴 것이다.
 */
const segA: ActivitySegmentation = {
  version: 1,
  generated_at: '2026-09-01T00:00:00Z',
  model: 'solar-pro4',
  sentences: ['문장0.', '문장1.', '문장2.', '문장3.'],
  activities: [
    {
      entity_id: `act:${REC_A}#1`,
      title: '정수정전·이춘풍전 상호텍스트 비평문 작성',
      did: '두 고전소설을 상호텍스트적으로 분석하는 비평문을 작성함.',
      sentence_ids: [0, 1],
      subject_matter: ['상호텍스트성', '정수정전'],
      sources: ['정수정전'],
      detail_markers: ['주제', '방법', '결과'],
      usefulness: { score: 6, matters: 2, sources: 1, markers: 3, sentences: 2, chars: 210 },
    },
    {
      entity_id: `act:${REC_A}#3`,
      title: '『나는 누구인가』 서평 작성',
      did: '철학적 물음을 통해 자아 정체성을 성찰함.',
      sentence_ids: [2, 3],
      subject_matter: ['자아 정체성'],
      sources: [],
      detail_markers: ['독서'] as never,
      usefulness: { score: 4, matters: 1, sources: 0, markers: 1, sentences: 2, chars: 120 },
      field_mismatch: true,
    },
  ],
  record_level: [],
};

const segB: ActivitySegmentation = {
  version: 1,
  generated_at: '2026-09-01T00:00:00Z',
  model: 'solar-pro4',
  sentences: ['문장0.'],
  activities: [
    {
      entity_id: `act:${REC_B}#8`,
      title: '환경 문제와 지속 가능성 프로젝트',
      did: '기후 위기와 해수면 상승을 탐구함.',
      sentence_ids: [0],
      subject_matter: ['기후 위기', '탄소 중립'],
      sources: [],
      detail_markers: ['주제'],
      usefulness: { score: 10, matters: 2, sources: 0, markers: 1, sentences: 1, chars: 400 },
    },
  ],
  record_level: [],
};

const segC: ActivitySegmentation = {
  version: 1,
  generated_at: '2026-09-01T00:00:00Z',
  model: 'solar-pro4',
  sentences: ['문장0.', '문장1.'],
  activities: [
    {
      entity_id: `act:${REC_C}#0`,
      title: '윤리 사상 적용 토론',
      did: '가치 충돌 문제를 다각도로 해석함.',
      sentence_ids: [0],
      subject_matter: ['공리주의'],
      sources: [],
      detail_markers: ['평가'],
      usefulness: { score: 5, matters: 1, sources: 0, markers: 1, sentences: 1, chars: 150 },
    },
    {
      entity_id: `act:${REC_C}#1`,
      title: '익명성 보장 찬반 논증',
      did: '표현의 자유와 사회적 책임을 견줌.',
      sentence_ids: [1],
      subject_matter: ['표현의 자유'],
      sources: [],
      detail_markers: ['평가'],
      usefulness: { score: 3, matters: 1, sources: 0, markers: 1, sentences: 1, chars: 90 },
    },
  ],
  record_level: [],
};

const rows: LedgerRecordRow[] = [
  {
    id: REC_A, grade: 2, semester: null, category: 'regular', subject_name: '문학',
    content: '문장0. 문장1. 문장2. 문장3.', segmentation: segA, analysis: null,
  },
  {
    id: REC_B, grade: 2, semester: 2, category: '자율활동', subject_name: '자율활동',
    content: '문장0.', segmentation: segB, analysis: null,
  },
  {
    id: REC_C, grade: 1, semester: null, category: 'career', subject_name: '생활과 윤리',
    content: '문장0. 문장1.', segmentation: segC, analysis: null,
  },
  // 분절 없는 메타데이터 뼈대 — 라이브의 2,382행이 전부 이 모양이다.
  {
    id: 'stub-1', grade: 3, semester: null, category: '자율활동', subject_name: '자율활동',
    content: '{"영역":"자율활동","시간":0}', segmentation: null, analysis: null,
  },
];

const ACT_A1 = 'acti_aaa111';
const ACT_A3 = 'acti_aaa333';
const ACT_B8 = 'acti_bbb888';
const COMP_1 = 'comp_111111';
const COMP_2 = 'comp_222222';
const ACHI_1 = 'achi_111111';
const THREAD = 'thre_999999';
const INTEREST = 'inte_777777';

const src = (grade: number, subject: string, category: string, activityId: string, semester: number | null = null) =>
  ({ grade, semester, subject, category, activity_id: activityId });

const entities: KgEntityRowLite[] = [
  {
    entity_id: ACT_A1, label: '정수정전·이춘풍전 상호텍스트 비평문 작성', type: 'Activity',
    properties: {
      level: 3, usefulness: 6, confidence: 0.87,
      sources: [src(2, '문학', 'seteuk', `act:${REC_A}#1`)],
      evidence: [
        '고전소설 두 편을 상호텍스트적으로 분석하는 비평문을 작성함.',
        '연구 질문: 두 작품의 여성 인물의 서사 지향점은 어떤 사회적 의미를 지니는가',
      ],
    },
  },
  {
    entity_id: ACT_A3, label: '『나는 누구인가』 서평 작성', type: 'Activity',
    properties: {
      level: 1, usefulness: 4, confidence: 0.8,
      sources: [src(2, '문학', 'seteuk', `act:${REC_A}#3`)],
      evidence: ['철학적 물음으로 자아 정체성을 성찰함.'],
    },
  },
  {
    entity_id: ACT_B8, label: '환경 문제와 지속 가능성 프로젝트', type: 'Activity',
    properties: {
      level: 3, usefulness: 10, confidence: 0.87,
      sources: [src(2, '자율활동', 'autonomy', `act:${REC_B}#8`, 2)],
      evidence: ['기후 위기의 심각성을 인식하고 대안을 탐구함.'],
    },
  },
  {
    entity_id: COMP_1, label: '고전소설을 상호텍스트적으로 분석하는 비평문을 작성함', type: 'Competency',
    properties: {
      confidence: 0.8,
      sources: [src(2, '문학', 'seteuk', `act:${REC_A}#1`)],
      evidence: ['엔티티 대표 인용'],
    },
  },
  {
    entity_id: COMP_2, label: '기후 위기 자료를 분석해 대안을 제시함', type: 'Competency',
    properties: {
      confidence: 0.75,
      sources: [src(2, '자율활동', 'autonomy', `act:${REC_B}#8`, 2)],
      evidence: [],
    },
  },
  {
    entity_id: ACHI_1, label: '탄소 중립 기사문 작성', type: 'Achievement',
    properties: {
      confidence: 0.85,
      sources: [src(2, '자율활동', 'autonomy', `act:${REC_B}#8`, 2)],
      evidence: ['기사문을 작성하고 스톱모션을 제작함.'],
    },
  },
  { entity_id: 'conc_1', label: '상호텍스트성', type: 'Concept', properties: {} },
  { entity_id: 'conc_2', label: '기후 위기', type: 'Concept', properties: {} },
  {
    entity_id: THREAD, label: '환경과 기후 위기', type: 'Thread',
    properties: { confidence: 0.8, sources: [src(2, '자율활동', 'autonomy', `act:${REC_B}#8`, 2)] },
  },
  {
    entity_id: INTEREST, label: '환경·기후 문제 탐구와 실천', type: 'Interest',
    properties: {
      sources: [
        src(2, '자율활동', 'autonomy', `act:${REC_B}#8`, 2),
        src(2, '문학', 'seteuk', `act:${REC_A}#1`),
      ],
    },
  },
];

const rel = (
  source: string, target: string, relation: string, properties: Record<string, unknown>,
): KgRelationRowLite => ({
  source_entity_id: source, target_entity_id: target, relation_type: relation, properties,
});

const relations: KgRelationRowLite[] = [
  // 학생 허브 층 — 중복 저장된 짝. 이걸 세면 역량이 두 배가 된다.
  rel('student', COMP_1, 'DEMONSTRATED', { layer: 'student', confidence: 0.8 }),
  rel('student', COMP_2, 'DEMONSTRATED', { layer: 'student', confidence: 0.75 }),
  rel('student', ACHI_1, 'ACHIEVED', { layer: 'student', confidence: 0.85 }),
  rel('student', ACT_A1, 'PERFORMED', { layer: 'student' }),
  rel('student', INTEREST, 'INTERESTED_IN', { layer: 'student' }),
  // 활동 층 — 이것만 써야 "어느 활동이 이 역량을 보였는가"에 답할 수 있다.
  rel(ACT_A1, COMP_1, 'DEMONSTRATED', { layer: 'local', confidence: 0.8, evidence: '관계 근거 A1' }),
  rel(ACT_B8, COMP_2, 'DEMONSTRATED', { layer: 'local', confidence: 0.75, evidence: '관계 근거 B8' }),
  rel(ACT_B8, ACHI_1, 'ACHIEVED', { layer: 'local', confidence: 0.85 }),
  // 같은 연결이 두 번 들어온 경우
  rel(ACT_A1, COMP_1, 'DEMONSTRATED', { layer: 'local', confidence: 0.8, evidence: '관계 근거 A1' }),
  // 개념
  rel(ACT_A1, 'conc_1', 'CONTAINS_CONCEPT', { layer: 'concept' }),
  rel(ACT_B8, 'conc_2', 'CONTAINS_CONCEPT', { layer: 'concept' }),
  // 주제 사슬
  rel(ACT_A1, THREAD, 'PART_OF', { layer: 'thread' }),
  rel(ACT_B8, THREAD, 'PART_OF', { layer: 'thread' }),
  // 시간 서사
  rel(ACT_B8, ACT_A1, 'DEEPENED_FROM', { layer: 'activity', confidence: 0.7 }),
  rel(ACT_A1, ACT_A3, 'RELATED_TO', { layer: 'activity', confidence: 0.6 }),
  // 대상이 없는 관계 — 조용히 활동에 붙어선 안 된다.
  rel(ACT_A1, 'comp_missing', 'DEMONSTRATED', { layer: 'local', evidence: '사라진 노드' }),
];

const layers = assembleKgLayers({
  versionId: 'ver-1', version: 3, engine: 'solar-pro4-seg-v8',
  createdAt: '2026-09-12T01:00:00Z', entities, relations,
});

/** id 종류 단언에 쓰는 프로브(원장은 아래에서 다시 만든다 — 여기서는 키만 본다). */
const ledgerKeysProbe = buildActivityLedger(rows, layers).byKey.keys();

// ─────────────────────────────────────────────────────────────────────────────
// 1. 키 해석
// ─────────────────────────────────────────────────────────────────────────────

eq('recordIdOf: v8 분절 키', recordIdOf(`act:${REC_A}#3`), REC_A);
eq('recordIdOf: pro3 기록 uuid', recordIdOf(REC_A), REC_A);
eq('recordIdOf: 접두 없는 분절 키', recordIdOf(`${REC_A}#12`), REC_A);
eq('recordIdOf: 빈 값', recordIdOf(null), null);
eq('recordIdOf: 빈 문자열', recordIdOf(''), null);

check('isSegmentScopedEngine: v8', isSegmentScopedEngine('solar-pro4-seg-v8'));
check('isSegmentScopedEngine: v7', isSegmentScopedEngine('research-v7'));
check('isSegmentScopedEngine: pro3 는 기록 단위', !isSegmentScopedEngine('solar-pro3'));
check('isSegmentScopedEngine: 미상', !isSegmentScopedEngine(null));

eq('extractResearchQuestion', extractResearchQuestion([
  '본문 인용', '연구 질문: 무엇을 물었는가',
]), '무엇을 물었는가');
eq('extractResearchQuestion: 없음', extractResearchQuestion(['본문만']), null);
eq('plainEvidence: 연구 질문 줄 제거', plainEvidence(['본문', '연구 질문: Q']), ['본문']);

// ─────────────────────────────────────────────────────────────────────────────
// 2. 층 조립 — layer 분기·중복 접기·고아 관계
// ─────────────────────────────────────────────────────────────────────────────

eq('활동 노드 3개', layers.activities.size, 3);
eq('역량 2건 (학생 허브 층을 세지 않는다)',
  layers.traits.filter((t) => t.kind === 'competency').length, 2);
eq('성취 1건', layers.traits.filter((t) => t.kind === 'achievement').length, 1);
eq('중복 관계는 한 번만', layers.traits.length, 3);
check('대상 없는 관계는 활동에 붙지 않는다',
  !layers.activities.get(ACT_A1)!.traits.some((t) => t.entityId === 'comp_missing'));

const a1 = layers.activities.get(ACT_A1)!;
eq('관계 근거가 엔티티 근거보다 우선', a1.traits[0].evidence, '관계 근거 A1');
const b8 = layers.activities.get(ACT_B8)!;
eq('관계 근거가 없으면 엔티티 근거로 내려간다',
  b8.traits.find((t) => t.kind === 'achievement')!.evidence,
  '기사문을 작성하고 스톱모션을 제작함.');
eq('관계 근거·엔티티 근거 모두 없으면 null',
  b8.traits.find((t) => t.entityId === COMP_2)!.evidence, '관계 근거 B8');

eq('연구 질문이 Activity 인용에서 뽑힌다',
  a1.researchQuestion, '두 작품의 여성 인물의 서사 지향점은 어떤 사회적 의미를 지니는가');
check('연구 질문 줄은 일반 인용에 남지 않는다',
  !a1.evidence.some((e) => e.startsWith('연구 질문:')));

eq('활동 개념', a1.concepts, ['상호텍스트성']);
eq('활동 수준·유용성', [a1.level, a1.usefulness], [3, 6]);

// ─────────────────────────────────────────────────────────────────────────────
// 3. 시간 서사 — 양방향으로 채워야 카드 어디서 보든 같은 사슬이 보인다
// ─────────────────────────────────────────────────────────────────────────────

eq('DEEPENED_FROM: 앞 활동', b8.deepenedFrom, [ACT_A1]);
eq('DEEPENED_FROM 의 역방향이 자동으로 채워진다', a1.developsInto, [ACT_B8]);
eq('RELATED_TO 는 무방향', a1.relatedTo, [ACT_A3]);
eq('RELATED_TO 역방향', layers.activities.get(ACT_A3)!.relatedTo, [ACT_A1]);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Thread · Interest
// ─────────────────────────────────────────────────────────────────────────────

eq('Thread 구성원 2개', layers.threads[0].memberActivityIds.length, 2);
/*
 * ⚠️ 이 도메인에는 활동을 가리키는 id 가 두 종류 있고, 섞으면 **조용히 빈 결과**가 된다.
 *   · KG 엔티티 id — `acti_xxxxxx`
 *   · 분절 활동 id — `act:<기록id>#<n>`
 * 아래 단언들이 "어느 필드가 어느 것인지"를 못 박는다. 구현 중 이 혼동으로 세 번 깨졌고
 * 그중 하나는 화면에 raw id(`acti_aaa111`)가 그대로 찍히는 형태였다.
 */
check('Thread 구성원은 KG 엔티티 id 다',
  layers.threads[0].memberActivityIds.every((id) => layers.activities.has(id)),
  JSON.stringify(layers.threads[0].memberActivityIds));
check('시간 서사 엣지도 KG 엔티티 id 다',
  [...layers.activities.values()].every((a) =>
    [...a.deepenedFrom, ...a.developsInto, ...a.relatedTo].every((id) => layers.activities.has(id))));
check('KgTrait.activityId 도 KG 엔티티 id 다',
  layers.traits.every((t) => !t.activityId || layers.activities.has(t.activityId)));
check('Interest.activityIds 는 반대로 분절 활동 id 다',
  layers.interests.every((i) => i.activityIds.every((id) => id.startsWith('act:'))),
  JSON.stringify(layers.interests.map((i) => i.activityIds)));
check('분절 원장의 키는 분절 활동 id 다',
  [...ledgerKeysProbe].every((k) => k.startsWith('act:')));
eq('Thread 학년은 구성원에서 계산한다', layers.threads[0].grades, [2]);
eq('Interest 활동 역참조', layers.interests[0].activityIds.length, 2);

// Thread 학년 범위가 sources[0] 가 아니라 구성원에서 오는지 — 학년이 갈린 구성원으로 확인
const spanning = assembleKgLayers({
  versionId: 'v', version: 1, engine: 'solar-pro4-seg-v8', createdAt: null,
  entities: [
    { entity_id: 'a1', label: 'A', type: 'Activity', properties: { sources: [src(1, 'x', 'seteuk', 'act:r#0')] } },
    { entity_id: 'a2', label: 'B', type: 'Activity', properties: { sources: [src(3, 'y', 'seteuk', 'act:r#1')] } },
    // Thread 자신의 sources 는 1학년만 가리킨다 — 이걸 믿으면 3개년 사슬이 1학년이 된다.
    { entity_id: 't1', label: 'T', type: 'Thread', properties: { sources: [src(1, 'x', 'seteuk', 'act:r#0')] } },
  ],
  relations: [
    rel('a1', 't1', 'PART_OF', { layer: 'thread' }),
    rel('a2', 't1', 'PART_OF', { layer: 'thread' }),
  ],
});
eq('Thread 학년 범위는 1·3학년', spanning.threads[0].grades, [1, 3]);

// ─────────────────────────────────────────────────────────────────────────────
// 5. 원장 결합 — entity_id 를 그대로 써야 한다
// ─────────────────────────────────────────────────────────────────────────────

const ledger = buildActivityLedger(rows, layers);

eq('분절 활동 5개 (뼈대 행은 들어오지 않는다)', ledger.activities.length, 5);
check('뼈대 행도 records 색인에는 있다', ledger.records.has('stub-1'));

const linkedA3 = ledger.byKey.get(`act:${REC_A}#3`)!;
eq('배열 위치(1)와 어긋나는 키도 제대로 붙는다', linkedA3.kg?.entityId, ACT_A3);
eq('배열 위치는 1', linkedA3.indexInRecord, 1);
check('field_mismatch 가 보존된다', linkedA3.fieldMismatch);

// 위치로 계산했다면 `act:...#1` 이 배열 1번(=실제 #3)에 붙어 KG 가 뒤바뀐다
eq('위치 계산 시 뒤바뀔 짝이 실제로는 올바르다',
  ledger.byKey.get(`act:${REC_A}#1`)!.kg?.entityId, ACT_A1);

eq('문턱을 못 넘은 활동은 KG 가 없다', ledger.byKey.get(`act:${REC_C}#1`)!.kg, null);
eq('고아 KG 활동 없음', ledger.orphanKgActivityIds, []);

// pro3(기록 단위)은 그 기록의 모든 분절에 같은 노드가 붙는다
const pro3 = assembleKgLayers({
  versionId: 'v', version: 1, engine: 'solar-pro3', createdAt: null,
  entities: [
    { entity_id: 'acti_rec', label: '기록 활동', type: 'Activity', properties: { sources: [src(1, '생활과 윤리', '진로활동', REC_C)] } },
    { entity_id: 'comp_x', label: '의사소통 역량', type: 'Competency', properties: { sources: [src(1, '생활과 윤리', '진로활동', REC_C)], evidence: ['근거'] } },
  ],
  relations: [rel('acti_rec', 'comp_x', 'DEMONSTRATED', { layer: 'local', evidence: '근거' })],
});
const pro3Ledger = buildActivityLedger(rows, pro3);
eq('pro3: 기록의 두 분절에 같은 노드가 붙는다', [
  pro3Ledger.byKey.get(`act:${REC_C}#0`)!.kg?.entityId,
  pro3Ledger.byKey.get(`act:${REC_C}#1`)!.kg?.entityId,
], ['acti_rec', 'acti_rec']);
check('pro3: 다른 기록에는 붙지 않는다', !pro3Ledger.byKey.get(`act:${REC_A}#1`)!.kg);

// ─────────────────────────────────────────────────────────────────────────────
// 6. 영역 — 진로선택 과목(`career`)과 창체 진로활동을 갈라야 한다
// ─────────────────────────────────────────────────────────────────────────────

eq("category 'career' 는 교과활동(진로선택)", areaOf('career'), 'subject');
eq("category '진로활동' 은 창체 진로", areaOf('진로활동'), 'career');
eq('regular → 교과활동', areaOf('regular'), 'subject');
eq('pe_arts → 교과활동', areaOf('pe_arts'), 'subject');
eq('행동특성및종합의견 → 행동특성', areaOf('행동특성및종합의견'), 'behavior');
eq('모르는 값 → 기타', areaOf('nope'), 'other');
eq("KG 'seteuk_career' → 교과활동", areaOfKgCategory('seteuk_career'), 'subject');
eq("KG 'autonomy' → 자율활동", areaOfKgCategory('autonomy'), 'autonomy');
eq("KG 'career' → 창체 진로 (KG 는 세특을 seteuk_* 로 쓴다)", areaOfKgCategory('career'), 'career');
eq('영역 라벨', areaLabel('subject'), '교과활동');
check('영역마다 색이 다르다',
  new Set(['subject', 'autonomy', 'club', 'career', 'behavior'].map((a) =>
    areaTone(a as never).bar)).size === 5);

// ─────────────────────────────────────────────────────────────────────────────
// 7. 학년 축 — 학기로 나누지 않는다
// ─────────────────────────────────────────────────────────────────────────────

const bands = groupByGrade(ledger.activities, layers);
eq('학년 밴드 2개 (1·2학년)', bands.map((b) => b.label), ['1학년', '2학년']);

const g2 = bands.find((b) => b.grade === 2)!;
eq('2학년 활동 3개', g2.stats.activities, 3);
eq('2학년 영역 순서 = 교과활동 → 자율활동', g2.areas.map((a) => a.area), ['subject', 'autonomy']);
eq('학기가 있는 활동은 1개뿐', g2.stats.withSemester, 1);
check('학기가 있어도 밴드가 갈리지 않는다', bands.length === 2);

const g1Pre = bands.find((b) => b.grade === 1)!;
eq('2학년 역량 2건', g2.stats.traits.competency, 2);
eq('2학년 성취 1건', g2.stats.traits.achievement, 1);
eq('2학년 활동 3개 모두 KG 가 붙었다', g2.stats.withKg, 3);
eq('1학년은 문턱을 넘은 활동이 없다', g1Pre.stats.withKg, 0);

// 개념 집계 — 1회짜리는 세지 않는다(개수로 정렬하면 가나다순 앞머리가 상위처럼 보인다)
const g1 = bands.find((b) => b.grade === 1)!;
eq('1회짜리 개념은 되풀이 목록에 없다', g1.stats.repeatedConcepts, []);
eq('2학년 되풀이 개념 없음(픽스처의 개념이 모두 1회)', g2.stats.repeatedConcepts, []);
eq('되풀이가 없으면 새 개념도 없다', [g1.stats.newConcepts, g2.stats.newConcepts], [[], []]);

// 되풀이 개념 · 새 개념 — 같은 개념이 두 활동에 걸린 경우로 확인한다
const repeatRows: LedgerRecordRow[] = [
  {
    id: 'r1', grade: 1, semester: null, category: 'regular', subject_name: '수학',
    content: 'a', analysis: null,
    segmentation: {
      version: 1, generated_at: '', model: null, sentences: ['s'], record_level: [],
      activities: [
        { entity_id: 'act:r1#0', title: 'A', did: '', sentence_ids: [0], subject_matter: ['확률'], sources: [], detail_markers: [], usefulness: null },
        { entity_id: 'act:r1#1', title: 'B', did: '', sentence_ids: [0], subject_matter: ['확률', '통계'], sources: [], detail_markers: [], usefulness: null },
      ],
    },
  },
  {
    id: 'r2', grade: 2, semester: null, category: 'regular', subject_name: '수학',
    content: 'b', analysis: null,
    segmentation: {
      version: 1, generated_at: '', model: null, sentences: ['s'], record_level: [],
      activities: [
        { entity_id: 'act:r2#0', title: 'C', did: '', sentence_ids: [0], subject_matter: ['확률', '미적분'], sources: [], detail_markers: [], usefulness: null },
        { entity_id: 'act:r2#1', title: 'D', did: '', sentence_ids: [0], subject_matter: ['확률', '미적분'], sources: [], detail_markers: [], usefulness: null },
      ],
    },
  },
];
const repeatBands = groupByGrade(buildActivityLedger(repeatRows, null).activities, null);
eq('1학년 되풀이 개념 = 확률 2회',
  repeatBands[0].stats.repeatedConcepts, [{ label: '확률', count: 2 }]);
eq('1학년 개념은 새로 등장', repeatBands[0].stats.newConcepts, ['확률']);
eq('2학년 되풀이 = 미적분·확률 각 2회',
  repeatBands[1].stats.repeatedConcepts.map((c) => c.label).sort(),
  ['미적분', '확률']);
eq('1학년에 나온 확률은 2학년의 새 개념이 아니다',
  repeatBands[1].stats.newConcepts, ['미적분']);

// 주제군(Interest)은 학년별로 갈라 센다
eq('2학년 주제군', g2.stats.interests, [{ label: '환경·기후 문제 탐구와 실천', count: 2 }]);
eq('1학년 주제군 없음', g1.stats.interests, []);

// 학년 미상은 버리지 않고 맨 뒤
const withUnknown = groupByGrade([
  ...ledger.activities,
  { ...ledger.activities[0], key: 'x', grade: null },
], layers);
eq('학년 미상은 맨 뒤', withUnknown[withUnknown.length - 1].label, '학년 미상');

// ── 카드 순서: 유용성 높은 순 (2026-09-13) ──
// **기록 안 순서와 일부러 반대**로 점수를 준다 — 그렇지 않으면 옛 규칙(기록 순)으로도
// 같은 결과가 나와 단언이 아무것도 못 잡는다.
const orderRows: LedgerRecordRow[] = [{
  id: 'ord', grade: 1, semester: null, category: 'regular', subject_name: '수학',
  content: 'x', analysis: null,
  segmentation: {
    version: 1, generated_at: '', model: null, sentences: ['s'], record_level: [],
    activities: [
      { entity_id: 'act:ord#0', title: '낮음', did: '', sentence_ids: [0], subject_matter: [], sources: [], detail_markers: [], usefulness: { score: 2, matters: 0, sources: 0, markers: 0, sentences: 1, chars: 10 } },
      { entity_id: 'act:ord#1', title: '가장 높음', did: '', sentence_ids: [0], subject_matter: [], sources: [], detail_markers: [], usefulness: { score: 11, matters: 0, sources: 0, markers: 0, sentences: 1, chars: 10 } },
      { entity_id: 'act:ord#2', title: '중간', did: '', sentence_ids: [0], subject_matter: [], sources: [], detail_markers: [], usefulness: { score: 7, matters: 0, sources: 0, markers: 0, sentences: 1, chars: 10 } },
      { entity_id: 'act:ord#3', title: '점수 없음', did: '', sentence_ids: [0], subject_matter: [], sources: [], detail_markers: [], usefulness: null },
      { entity_id: 'act:ord#4', title: '0점', did: '', sentence_ids: [0], subject_matter: [], sources: [], detail_markers: [], usefulness: { score: 0, matters: 0, sources: 0, markers: 0, sentences: 1, chars: 10 } },
    ],
  },
}];
const orderBand = groupByGrade(buildActivityLedger(orderRows, null).activities, null);
eq('유용성 높은 순으로 놓인다',
  orderBand[0].areas[0].activities.map((a) => a.title),
  ['가장 높음', '중간', '낮음', '0점', '점수 없음']);
eq('0점은 점수 없음보다 앞이다 (0 과 모름은 다르다)',
  orderBand[0].areas[0].activities.slice(-2).map((a) => a.usefulness),
  [0, null]);

// 동점이면 과목 → 기록 → 기록 안 순서로 결정된다 (실측상 이 사슬이 대부분을 정한다)
const tieRows: LedgerRecordRow[] = [
  {
    // `#n` 접미는 **순서가 아니다**(파이프라인의 원본 활동 번호). 동점 타이브레이크는
    // 기록 안 **배열 위치**를 쓴다 — 그래서 `#5` 가 `#2` 보다 먼저 온다.
    id: 'b-rec', grade: 1, semester: null, category: 'regular', subject_name: '나과목',
    content: 'x', analysis: null,
    segmentation: {
      version: 1, generated_at: '', model: null, sentences: ['s'], record_level: [],
      activities: [
        { entity_id: 'act:b-rec#5', title: 'B배열0', did: '', sentence_ids: [0], subject_matter: [], sources: [], detail_markers: [], usefulness: { score: 5, matters: 0, sources: 0, markers: 0, sentences: 1, chars: 1 } },
        { entity_id: 'act:b-rec#2', title: 'B배열1', did: '', sentence_ids: [0], subject_matter: [], sources: [], detail_markers: [], usefulness: { score: 5, matters: 0, sources: 0, markers: 0, sentences: 1, chars: 1 } },
      ],
    },
  },
  {
    id: 'a-rec', grade: 1, semester: null, category: 'regular', subject_name: '가과목',
    content: 'y', analysis: null,
    segmentation: {
      version: 1, generated_at: '', model: null, sentences: ['s'], record_level: [],
      activities: [
        { entity_id: 'act:a-rec#0', title: 'A', did: '', sentence_ids: [0], subject_matter: [], sources: [], detail_markers: [], usefulness: { score: 5, matters: 0, sources: 0, markers: 0, sentences: 1, chars: 1 } },
      ],
    },
  },
];
eq('동점은 과목 가나다 → 기록 안 배열 위치(`#n` 이 아니다)',
  groupByGrade(buildActivityLedger(tieRows, null).activities, null)[0]
    .areas[0].activities.map((a) => a.title),
  ['A', 'B배열0', 'B배열1']);

// 정렬이 결정적인가 — 입력 순서를 뒤집어도 같은 결과
const reversed = groupByGrade([...ledger.activities].reverse(), layers);
eq('정렬 결정적: 밴드', reversed.map((b) => b.label), bands.map((b) => b.label));
eq('정렬 결정적: 2학년 활동 순서',
  reversed.find((b) => b.grade === 2)!.areas.flatMap((a) => a.activities.map((x) => x.key)),
  g2.areas.flatMap((a) => a.activities.map((x) => x.key)));
eq('동점 묶음도 입력 순서를 뒤집어도 같다',
  groupByGrade(buildActivityLedger([...tieRows].reverse(), null).activities, null)[0]
    .areas[0].activities.map((a) => a.title),
  ['A', 'B배열0', 'B배열1']);

// ─────────────────────────────────────────────────────────────────────────────
// 8. 역량분석 뷰
// ─────────────────────────────────────────────────────────────────────────────

const compView = buildCompetencyView(ledger, layers, 'competency');
eq('역량 개수', compView.counts.competency, 2);
eq('성취 개수', compView.counts.achievement, 1);
eq('태도 0', compView.counts.attitude, 0);
eq('역량은 모두 2학년', compView.groups.map((g) => g.label), ['2학년']);
eq('항목마다 활동이 붙는다',
  compView.groups[0].entries.every((e) => !!e.activity), true);
eq('학년·과목은 기록 쪽을 믿는다',
  compView.groups[0].entries.map((e) => [e.grade, e.area, e.subject]),
  [[2, 'subject', '문학'], [2, 'autonomy', '자율활동']]);
eq('v8 은 되풀이 라벨이 없다(진술문이라 유일하다)', compView.repeated, []);

const achView = buildCompetencyView(ledger, layers, 'achievement');
eq('층 전환 시 counts 는 그대로', achView.counts.competency, 2);
eq('성취 항목 1건', achView.groups.flatMap((g) => g.entries).length, 1);

// 되풀이 라벨은 pro3 모양(짧은 역량명)에서 뜻이 있다
const repeatLayers = assembleKgLayers({
  versionId: 'v', version: 1, engine: 'solar-pro3', createdAt: null,
  entities: [
    { entity_id: 'a1', label: 'A', type: 'Activity', properties: { sources: [src(1, 'x', '자율활동', REC_C)] } },
    { entity_id: 'c1', label: '의사소통 역량', type: 'Competency', properties: { sources: [src(1, 'x', '자율활동', REC_C)] } },
    { entity_id: 'c2', label: '의사소통 역량', type: 'Competency', properties: { sources: [src(1, 'x', '자율활동', REC_A)] } },
  ],
  relations: [
    rel('a1', 'c1', 'DEMONSTRATED', { layer: 'local' }),
    rel('a1', 'c2', 'DEMONSTRATED', { layer: 'local' }),
  ],
});
eq('같은 라벨 2건이 되풀이로 잡힌다',
  buildCompetencyView(buildActivityLedger(rows, repeatLayers), repeatLayers, 'competency').repeated,
  [{ label: '의사소통 역량', count: 2 }]);

// KG 가 없으면 빈 뷰 — 오류가 아니다
const noKg = buildCompetencyView(buildActivityLedger(rows, null), null, 'competency');
eq('KG 없음: 빈 뷰', [noKg.groups.length, noKg.repeated.length, noKg.counts.competency], [0, 0, 0]);
eq('KG 없음: 분절만으로도 원장이 만들어진다',
  buildActivityLedger(rows, null).activities.length, 5);

check('층 순서에 person 은 없다 (근거로 약하다)', !TRAIT_KIND_ORDER.includes('person'));

// ─────────────────────────────────────────────────────────────────────────────
// 9. kg_json 폴백
// ─────────────────────────────────────────────────────────────────────────────

const kgJson = {
  entities: [
    {
      id: 'acti_x', type: 'Activity', name: '폴백 활동', confidence: 0.9,
      sources: [src(1, '수학', 'seteuk', 'act:rec#0')], evidence: ['인용'],
    },
    { id: 'comp_x', type: 'Competency', name: '폴백 역량', confidence: 0.8, sources: [], evidence: ['근거'] },
  ],
  triples: [
    { subject: 'acti_x', predicate: 'DEMONSTRATED', object: 'comp_x', confidence: 0.8, evidence: '근거', properties: { layer: 'local' } },
    { subject: 'Student', predicate: 'PERFORMED', object: 'acti_x', confidence: 0.9, properties: { layer: 'student' } },
  ],
};
const fallbackEntities = entityRowsFromKgJson(kgJson);
const fallbackRelations = relationRowsFromKgJson(kgJson);
eq('폴백 엔티티 2개', fallbackEntities.length, 2);
eq('폴백 라벨은 name 에서', fallbackEntities[0].label, '폴백 활동');
eq('폴백 관계 2개', fallbackRelations.length, 2);
const fallbackLayers = assembleKgLayers({
  versionId: 'v', version: 1, engine: 'solar-pro4-seg-v8', createdAt: null,
  entities: fallbackEntities, relations: fallbackRelations,
});
eq('폴백에서도 역량이 활동에 붙는다', fallbackLayers.traits.length, 1);
eq('폴백: 활동 1개', fallbackLayers.activities.size, 1);
eq('kg_json 없음', entityRowsFromKgJson(null), []);
eq('triples 없음', relationRowsFromKgJson({ entities: [] }), []);

// ─────────────────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length}건 실패 (통과 ${pass}건)\n`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`✓ ${pass}건 모두 통과`);
