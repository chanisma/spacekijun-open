/**
 * 설계가 그린 엣지의 «관계 세부사항» 회귀 테스트.
 *
 *   npx tsx --tsconfig tsconfig.app.json scripts/inquiry-edge-detail-test/run.mts
 *
 * ── 왜 이 테스트가 있는가 ────────────────────────────────────────────────
 * 탐구 설계가 만드는 관계는 처음부터 근거·신뢰도·메모를 **필수로** 갖고 있었다
 * (`supabase/functions/_shared/inquiryGraph.ts` 의 relations.required, 라이브 실측
 * 14/14 evidence·confidence · 12/14 notes). 그런데 화면에서는 그 엣지를 눌러도
 * 아무 일도 일어나지 않았다 — 원인이 둘이고 **둘 다 오류를 내지 않는다**:
 *   ① 캔버스의 엣지 tap 핸들러가 scope 가 existing 이 아니면 그냥 return 했다.
 *   ② 세부사항 패널이 `workspace.kgRelations` 만 뒤져서, 설계 관계는 영영 못 찾는다.
 * 빌드도 타입 검사도 통과하므로 정적·순수 검사가 유일한 방어선이다.
 *
 * 지키려는 불변식:
 *   ① 엣지 id 는 만드는 쪽과 읽는 쪽이 **왕복**한다(형식이 한쪽만 바뀌면 여기서 걸린다)
 *   ② 같은 두 노드를 같은 술어로 잇는 관계가 둘이어도 id 가 **갈린다**
 *   ③ 끝점 라벨은 scope 마다 **다른 표**에서 온다(planned = 설계 · existing = KG)
 *   ④ 캔버스가 설계·미리보기 엣지의 클릭을 삼키지 않는다
 *   ⑤ 노드 tap 은 여전히 기존 KG 만 고른다(엣지와 달리 «분석 출처 선택»이다)
 */
import { readFileSync } from 'node:fs';
import {
  buildInquiryGraphElements,
  designEdgeId,
  kgEdgeId,
  parseDesignedEdgeId,
  previewEdgeId,
} from '../../src/features/inquiry-design/utils/inquiryGraph.ts';
import { resolveDesignedRelation } from '../../src/features/inquiry-design/utils/relationDetail.ts';
import type {
  InquiryAnalysisRelation,
  InquiryAnalysisResult,
  InquiryWorkspace,
  KgEntityRow,
  SavedInquiryDesign,
} from '../../src/features/inquiry-design/types.ts';

const read = (path: string) => readFileSync(path, 'utf8');
/** 주석에 옛 코드가 인용돼 있다 — 설명문만 보고 통과하지 않도록 걷어내고 본다. */
const code = (path: string) =>
  read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

// ── 표본 ────────────────────────────────────────────────────────────────
function kgEntity(entityId: string, label: string, type: string): KgEntityRow {
  return {
    id: `row-${entityId}`,
    kg_version_id: 'v1',
    student_id: 'S1',
    entity_id: entityId,
    label,
    type,
    properties: {},
  };
}

function relation(patch: Partial<InquiryAnalysisRelation> = {}): InquiryAnalysisRelation {
  return {
    source_entity_id: 'acti_old',
    target_entity_id: 'new_activity',
    source_scope: 'existing',
    target_scope: 'planned',
    relation_type: 'SUPPORTS',
    confidence: 0.93,
    evidence: '기존 수학-기술 융합 경험이 새 탐구를 직접 뒷받침한다.',
    properties: { status: 'planned', notes: '수학 개념을 기술 원리로 확장하는 기존 역량을 활용' },
    ...patch,
  };
}

const kgEntities = [
  kgEntity('acti_old', '자율주행 원리 탐구', 'Activity'),
  kgEntity('conc_geo', '기하 변환', 'Concept'),
];

const design: SavedInquiryDesign = {
  id: 'design-1',
  student_id: 'S1',
  kg_version_id: 'v1',
  title: '핀홀 카메라 거리 추정',
  target_kind: 'subject',
  target_name: '기하',
  target_ref: {},
  academic_year: 2026,
  grade: 2,
  semester: 2,
  status: 'saved',
  selected_source_snapshot: [],
  llm_result: null,
  student_rationale: '',
  reflection: null,
  llm_token_usage: {},
  observed_activity_id: null,
  observed_at: null,
  created_by: null,
  created_at: '',
  updated_at: '',
  sources: [],
  entities: [
    { entity_id: 'new_activity', label: '카메라 거리 추정 탐구', type: 'Activity', reuse_existing_id: null, properties: {}, evidence: '' },
    { entity_id: 'new_concept', label: '핀홀 모델', type: 'Concept', reuse_existing_id: null, properties: {}, evidence: '' },
  ],
  relations: [
    relation(),
    relation({
      source_entity_id: 'new_concept',
      target_entity_id: 'new_activity',
      source_scope: 'planned',
      relation_type: 'PART_OF',
      confidence: 0.96,
      evidence: '핀홀 카메라와 화면 좌표의 거리 변환은 전체 탐구의 핵심 계산 부분이다.',
      properties: { status: 'planned', notes: '핵심 수학 모델' },
    }),
  ],
};

const preview: InquiryAnalysisResult = {
  title: '미리보기',
  summary: '',
  inquiry_questions: [],
  plan_steps: [],
  entities: [
    { entity_id: 'p_activity', label: '미리보기 활동', type: 'Activity', reuse_existing_id: null, properties: {}, evidence: '' },
  ],
  relations: [
    relation({ target_entity_id: 'p_activity', evidence: '미리보기 근거', properties: { status: 'planned', notes: '미리보기 메모' } }),
  ],
  student_prompt_questions: [],
  risk_flags: [],
};

const resolveInput = { savedDesigns: [design], preview, kgEntities };

function emptyWorkspace(savedDesigns: SavedInquiryDesign[]): InquiryWorkspace {
  return {
    student: null,
    kgVersion: null,
    kgVersions: [],
    kgJson: null,
    kgEntities,
    kgRelations: [],
    targets: [],
    activityRecords: [],
    savedDesigns,
    comprehensiveRecommendations: [],
    historyEntityLabels: new Map(),
  } as unknown as InquiryWorkspace;
}

// ── ① id 왕복 ───────────────────────────────────────────────────────────
console.log('\n[1] 엣지 id 는 만드는 쪽과 읽는 쪽이 왕복한다');
{
  check(
    'design id 왕복',
    JSON.stringify(parseDesignedEdgeId(designEdgeId('design-1', 3)))
      === JSON.stringify({ origin: 'saved', designId: 'design-1', index: 3 })
  );
  check(
    'preview id 왕복',
    JSON.stringify(parseDesignedEdgeId(previewEdgeId(0)))
      === JSON.stringify({ origin: 'preview', index: 0 })
  );
  check('기존 KG id 는 설계 id 로 읽히지 않는다', parseDesignedEdgeId(kgEdgeId('rel-uuid')) === null);
  check(
    '형식이 어긋나면 null',
    parseDesignedEdgeId('design::a::b::c') === null && parseDesignedEdgeId('preview::x') === null
  );
}

// ── ② 중복 관계도 id 가 갈린다 ──────────────────────────────────────────
console.log('\n[2] 같은 끝점·같은 술어가 둘이어도 엣지 id 가 갈린다');
{
  const twin = { ...design, relations: [relation(), relation()] };
  const elements = buildInquiryGraphElements({
    workspace: emptyWorkspace([twin]),
    savedDesigns: [twin],
    preview: null,
  });
  const edgeIds = elements.filter((e) => e.group === 'edges').map((e) => String(e.data?.id));
  check('중복 관계 2건이 모두 그려진다', edgeIds.length === 2, `edges=${edgeIds.length}`);
  check('두 엣지의 id 가 다르다', new Set(edgeIds).size === edgeIds.length, edgeIds.join(' / '));

  // 그려진 id 를 그대로 되풀어 관계로 돌아와야 한다.
  const first = resolveDesignedRelation(edgeIds[0], { ...resolveInput, savedDesigns: [twin] });
  const second = resolveDesignedRelation(edgeIds[1], { ...resolveInput, savedDesigns: [twin] });
  check('두 id 가 각각 관계로 되돌아온다', !!first && !!second);
}

// ── ③ 끝점 라벨은 scope 마다 다른 표에서 온다 ───────────────────────────
console.log('\n[3] 저장된 설계 관계의 세부사항');
{
  const detail = resolveDesignedRelation(designEdgeId('design-1', 0), resolveInput);
  check('관계를 찾는다', !!detail);
  check('origin = saved', detail?.origin === 'saved');
  check('어느 설계인지 밝힌다', detail?.originLabel === '핀홀 카메라 거리 추정', detail?.originLabel);
  check('existing 끝점은 KG 라벨', detail?.source.label === '자율주행 원리 탐구', detail?.source.label);
  check('planned 끝점은 설계 엔티티 라벨', detail?.target.label === '카메라 거리 추정 탐구', detail?.target.label);
  check('술어를 싣는다', detail?.relationType === 'SUPPORTS');
  check('신뢰도를 싣는다', detail?.confidence === 0.93);
  check('근거를 싣는다', (detail?.evidence ?? '').includes('뒷받침'));
  check('메모를 근거와 따로 싣는다', detail?.notes === '수학 개념을 기술 원리로 확장하는 기존 역량을 활용');

  const planned = resolveDesignedRelation(designEdgeId('design-1', 1), resolveInput);
  check(
    'planned→planned 양끝 모두 설계 라벨',
    planned?.source.label === '핀홀 모델' && planned?.target.label === '카메라 거리 추정 탐구',
    `${planned?.source.label} -> ${planned?.target.label}`
  );
}

console.log('\n[4] 미리보기 관계의 세부사항');
{
  const detail = resolveDesignedRelation(previewEdgeId(0), resolveInput);
  check('관계를 찾는다', !!detail);
  check('origin = preview', detail?.origin === 'preview');
  check('미리보기임을 밝힌다', (detail?.originLabel ?? '').includes('미리보기'), detail?.originLabel);
  check('근거·메모를 싣는다', detail?.evidence === '미리보기 근거' && detail?.notes === '미리보기 메모');
  check(
    '미리보기가 없으면 null',
    resolveDesignedRelation(previewEdgeId(0), { ...resolveInput, preview: null }) === null
  );
  check('범위를 벗어난 위치는 null', resolveDesignedRelation(previewEdgeId(9), resolveInput) === null);
  check('없는 설계 id 는 null', resolveDesignedRelation(designEdgeId('nope', 0), resolveInput) === null);
}

// ── ④⑤ 배선 ────────────────────────────────────────────────────────────
console.log('\n[5] 캔버스가 설계·미리보기 엣지 클릭을 삼키지 않는다');
{
  const canvas = code('src/features/inquiry-design/components/InquiryGraphCanvas.tsx');
  const edgeTap = canvas.slice(canvas.indexOf("cy.on('tap', 'edge'"), canvas.indexOf("cy.on('dbltap'"));
  check('엣지 tap 핸들러를 잘라 냈다', edgeTap.length > 40 && edgeTap.length < 400, `len=${edgeTap.length}`);
  check('엣지 tap 에 scope 가드가 없다', !edgeTap.includes("scope !== 'existing'"), edgeTap.trim());
  check('엣지 tap 이 콜백을 부른다', edgeTap.includes('onToggleEdgeRef.current'));

  const nodeTap = canvas.slice(canvas.indexOf("cy.on('tap', 'node'"), canvas.indexOf("cy.on('tap', 'edge'"));
  check('노드 tap 은 기존 KG 만 고른다(분석 출처 선택)', nodeTap.includes("scope !== 'existing'"));
}

console.log('\n[6] 패널이 설계 관계를 실제로 해석한다');
{
  const page = code('src/features/inquiry-design/InquiryDesignPage.tsx');
  check('패널이 resolveDesignedRelation 을 쓴다', page.includes('resolveDesignedRelation('));
  check('패널이 미리보기를 건네받는다', /preview=\{analysis\}[\s\S]{0,200}activeDetail=\{activeDetail\}/.test(page));
  check(
    '관계 블록이 relation 유무로 갈리지 않는다',
    page.includes('{endpoints && (') && !page.includes('{relation && endpoints && (')
  );
  check(
    '엣지 id 빌더를 페이지가 따로 갖지 않는다',
    !page.includes('function graphRelationId') && page.includes('kgEdgeId(')
  );
}

console.log(failures === 0 ? '\n전체 통과\n' : `\n실패 ${failures}건\n`);
process.exit(failures === 0 ? 0 : 1);
