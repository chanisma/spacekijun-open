/**
 * 탐구 설계 — «이전 설계 가져오기» 확인 + 서버 작업 큐 회귀
 *
 *   npx tsx scripts/inquiry-prior-design-test/run.mts
 *
 * 두 변경 모두 **틀려도 오류가 나지 않는다**:
 *
 *  ① 대조가 너무 느슨하면 작년 설계를 올해 것으로 내놓고, 너무 빡빡하면 확인 대화가
 *    영영 안 떠서 종전(캐시가 말없이 옛 결과를 주던) 상태로 되돌아간다.
 *  ② 아카데미 연구대와 **같은 표·같은 워커**를 쓰므로 `surface` 를 한 군데라도
 *    빠뜨리면 두 기능의 의뢰가 서로 섞인다 — 오류가 아니라 "낯선 설계도가 뜬다".
 */
import { readFileSync } from 'node:fs';
import {
  designKeys,
  findPriorDesigns,
  priorSourceKey,
  sameTarget,
  selectionKeys,
} from '../../src/features/inquiry-design/utils/priorDesignMatch.ts';
import type {
  InquirySelectedSource,
  InquiryTarget,
  SavedInquiryDesign,
} from '../../src/features/inquiry-design/types.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`); return; }
  fail += 1;
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
}
const read = (path: string) => readFileSync(path, 'utf8');
/** 주석에는 옛 코드·설명이 인용돼 있다 — 설명문만 보고 통과하지 않도록 걷어낸다. */
const code = (path: string) =>
  read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── 표본 ─────────────────────────────────────────────────────────────────────
const TARGET: InquiryTarget = {
  id: 'curriculum:생명과학Ⅰ',
  kind: 'subject',
  name: '생명과학Ⅰ',
  academic_year: 2026,
  grade: 2,
  semester: 1,
  source: 'curriculum',
  ref: {},
};

function nodeSource(entityId: string): InquirySelectedSource {
  return {
    source_kind: 'kg_entity',
    kg_version_id: 'v1',
    source_entity_id: entityId,
    relation_hint: null,
    snapshot: { entity_id: entityId, label: entityId, type: 'Concept', properties: {}, relation_hint: null },
  };
}

function activitySource(content: string): InquirySelectedSource {
  return {
    source_kind: 'activity_record',
    activity_id: 'a-1',
    snapshot: { category: 'autonomous', subject_name: '', grade: 1, semester: 2, content },
  };
}

function design(patch: Partial<SavedInquiryDesign>): SavedInquiryDesign {
  return {
    id: 'd1',
    student_id: '00-00448',
    kg_version_id: 'v1',
    title: '효소 반응 속도 탐구',
    target_kind: 'subject',
    target_name: '생명과학Ⅰ',
    target_ref: {},
    academic_year: 2026,
    grade: 2,
    semester: 1,
    status: 'draft',
    selected_source_snapshot: [],
    llm_result: { title: 't', summary: 's' } as unknown as SavedInquiryDesign['llm_result'],
    student_rationale: '',
    reflection: null,
    llm_token_usage: {},
    observed_activity_id: null,
    observed_at: null,
    created_by: null,
    created_at: '2026-09-17T01:00:00Z',
    updated_at: '2026-09-17T01:00:00Z',
    sources: [],
    entities: [],
    relations: [],
    ...patch,
  };
}

// ── 1. 키 추출이 양쪽에서 대칭인가 ───────────────────────────────────────────
console.log('\n[1] 키 추출 — 선택 중인 근거와 저장된 근거가 같은 규칙을 쓴다');
{
  const selected = nodeSource('e:단백질');
  // 자동 초안은 부모 행만 만든다 → 자식 `sources` 가 없고 스냅샷 배열만 있다.
  const draftRow = design({ selected_source_snapshot: [selected.snapshot] });
  // 저장된 설계는 자식 행까지 있다.
  const savedRow = design({ id: 'd2', status: 'saved', sources: [selected], selected_source_snapshot: [] });

  check('선택 → node 키', priorSourceKey(selected.snapshot) === 'node:e:단백질');
  check('draft(스냅샷만) 과 일치', designKeys(draftRow).has('node:e:단백질'));
  check('saved(자식 행) 과 일치', designKeys(savedRow).has('node:e:단백질'));
  check('선택 집합과 draft 집합이 같다',
    [...selectionKeys([selected])].join() === [...designKeys(draftRow)].join());
}

console.log('\n[2] 활동 기록 — 스냅샷에 id 가 없어 내용 접두로 맞춘다');
{
  const long = '학급 자율 탐구로 미세먼지 농도를 측정하고 '.repeat(20);
  const selected = activitySource(long.slice(0, 1200));
  const row = design({ selected_source_snapshot: [{ ...selected.snapshot }] });
  check('키가 뽑힌다', priorSourceKey(selected.snapshot)?.startsWith('act|') === true);
  check('저장본과 일치', designKeys(row).has(priorSourceKey(selected.snapshot)!));

  // 200자 뒤가 달라도 같은 기록으로 본다(저장 시 1200자로 잘리므로 뒤는 믿을 수 없다).
  const tailDiffers = activitySource(long.slice(0, 1199) + 'X');
  check('200자 이후 차이는 무시', priorSourceKey(tailDiffers.snapshot) === priorSourceKey(selected.snapshot));

  // 앞이 다르면 다른 기록이다.
  const headDiffers = activitySource('전혀 다른 활동 내용');
  check('앞이 다르면 다른 키', priorSourceKey(headDiffers.snapshot) !== priorSourceKey(selected.snapshot));
}

console.log('\n[3] 키를 못 뽑는 스냅샷은 집합에서 빠진다');
{
  check('빈 객체', priorSourceKey({}) === null);
  check('null', priorSourceKey(null) === null);
  check('내용이 공백뿐', priorSourceKey({ content: '   ' }) === null);
  check('배열은 객체가 아니다', priorSourceKey([]) === null);
}

// ── 4. 대상 대조 ─────────────────────────────────────────────────────────────
console.log('\n[4] 대상 — 이름만 같고 시기가 다르면 다른 대상이다');
{
  check('완전 일치', sameTarget(design({}), TARGET));
  check('학년도 다름', !sameTarget(design({ academic_year: 2025 }), TARGET));
  check('학년 다름', !sameTarget(design({ grade: 3 }), TARGET));
  check('학기 다름', !sameTarget(design({ semester: 2 }), TARGET));
  check('학기 null vs 1', !sameTarget(design({ semester: null }), TARGET));
  check('kind 다름', !sameTarget(design({ target_kind: 'career' }), TARGET));
  check('이름 다름', !sameTarget(design({ target_name: '생명과학Ⅱ' }), TARGET));
  check('이름 앞뒤 공백은 무시', sameTarget(design({ target_name: ' 생명과학Ⅰ ' }), TARGET));
}

// ── 5. 후보 찾기 ─────────────────────────────────────────────────────────────
console.log('\n[5] 후보 — 대상과 근거 집합이 모두 같아야 한다');
{
  const a = nodeSource('e:A');
  const b = nodeSource('e:B');
  const rows = [
    design({ id: 'same', selected_source_snapshot: [a.snapshot, b.snapshot] }),
    design({ id: 'subset', selected_source_snapshot: [a.snapshot] }),
    design({ id: 'superset', selected_source_snapshot: [a.snapshot, b.snapshot, nodeSource('e:C').snapshot] }),
    design({ id: 'other-term', academic_year: 2025, selected_source_snapshot: [a.snapshot, b.snapshot] }),
  ];
  const found = findPriorDesigns(rows, TARGET, [a, b]);
  check('정확히 같은 집합만 후보', found.map((d) => d.id).join() === 'same', found.map((d) => d.id).join());

  // 순서가 달라도 집합이 같으면 같다.
  const reordered = findPriorDesigns(rows, TARGET, [b, a]);
  check('선택 순서는 무관', reordered.map((d) => d.id).join() === 'same');

  check('대상이 없으면 아무것도 찾지 않는다', findPriorDesigns(rows, null, [a, b]).length === 0);
}

console.log('\n[6] 근거를 하나도 안 골랐으면 «근거 없음»끼리만 맞는다');
{
  const a = nodeSource('e:A');
  const rows = [
    design({ id: 'empty', selected_source_snapshot: [] }),
    design({ id: 'has-one', selected_source_snapshot: [a.snapshot] }),
  ];
  check('빈 선택 → 빈 설계만', findPriorDesigns(rows, TARGET, []).map((d) => d.id).join() === 'empty');
  check('선택 있음 → 빈 설계는 제외', findPriorDesigns(rows, TARGET, [a]).map((d) => d.id).join() === 'has-one');
}

console.log('\n[7] 상태 — 실행·보관된 설계는 가져오기 후보가 아니다');
{
  const rows = [
    design({ id: 'obs', status: 'observed' }),
    design({ id: 'arch', status: 'archived' }),
    design({ id: 'sav', status: 'saved', created_at: '2026-09-16T01:00:00Z' }),
    design({ id: 'prop', status: 'proposed', created_at: '2026-09-15T01:00:00Z' }),
    design({ id: 'drf', status: 'draft', created_at: '2026-09-14T01:00:00Z' }),
  ];
  const found = findPriorDesigns(rows, TARGET, []);
  // 실행(observed)된 설계를 다시 올려 저장하면 같은 것이 두 벌이 된다.
  check('observed/archived 제외', !found.some((d) => ['obs', 'arch'].includes(d.id)));
  // draft 가 «이어서 쓰라고 만들어 둔 것»이라 가장 먼저 권한다(생성 시각이 가장 옛것인데도).
  check('draft → proposed → saved 순', found.map((d) => d.id).join() === 'drf,prop,sav', found.map((d) => d.id).join());
}

console.log('\n[8] 결과가 없는 행(llm_result null)은 가져올 것이 없다');
{
  const rows = [design({ id: 'empty-result', llm_result: null })];
  check('제외된다', findPriorDesigns(rows, TARGET, []).length === 0);
}

// ── 9. 배선: 확인 대화가 실제로 문지기인가 ───────────────────────────────────
console.log('\n[9] 배선 — «설계하기» 가 확인을 거친다');
{
  const page = code('src/features/inquiry-design/InquiryDesignPage.tsx');
  check('문지기 analyze 가 후보를 찾는다', /const analyze = \(\) => \{[\s\S]{0,400}findPriorDesigns\(/.test(page));
  check('후보가 있으면 대화를 열고 멈춘다', /setPriorPromptOpen\(true\);\s*\n\s*return;/.test(page));
  // ⚠️ analyze 는 버튼 onClick 에 그대로 걸려 첫 인자로 MouseEvent 가 들어온다.
  // "건너뛰기"를 위치 인자로 만들면 누를 때마다 참이 되어 확인이 영영 안 뜬다.
  check('analyze 는 인자를 받지 않는다', /const analyze = \(\) =>/.test(page));
  check('실제 생성은 runAnalysis 가 한다', page.includes('const runAnalysis = async ()'));
  check('«새로 설계» 가 runAnalysis 를 부른다',
    /createNewDespitePrior = \(\) => \{[\s\S]{0,200}runAnalysis\(\)/.test(page));
  check('«가져오기» 가 resumeDesign 을 재사용한다',
    /reusePriorDesign = \(design[\s\S]{0,200}resumeDesign\(design\)/.test(page));
  check('다이얼로그가 렌더된다', page.includes('<PriorDesignPromptDialog'));
}

// ── 10. 배선: 작업 큐 ────────────────────────────────────────────────────────
console.log('\n[10] 배선 — 설계가 작업 큐로 간다');
{
  const page = code('src/features/inquiry-design/InquiryDesignPage.tsx');
  check('runAnalysis 가 의뢰를 접수한다', page.includes('startInquiryGeneration('));
  check('동기 분석을 부르지 않는다', !page.includes('requestInquiryAnalysis('));
  check('멱등 키를 보관한다', page.includes('requestKeyRef.current ??= crypto.randomUUID()'));
  check('완료된 의뢰를 resumeDesign 으로 연다',
    /openGenerationJob[\s\S]{0,600}resumeDesign\(draft\)/.test(page));
  check('진행 중이면 버튼을 잠근다', page.includes('generationActive={Boolean(activeGeneration)}'));

  const panel = code('src/features/inquiry-design/components/InquirySidePanel.tsx');
  check('패널이 generationActive 로 두 버튼을 잠근다',
    (panel.match(/analyzing \|\| generationActive \|\| conversationActive/g) ?? []).length === 2);
  check('의뢰 현황 자리가 있다', panel.includes('{generationSlot}'));
}

console.log('\n[11] 배선 — 쿼터 장부가 큐로 함께 옮겨졌는가');
{
  const page = code('src/features/inquiry-design/InquiryDesignPage.tsx');
  // 설계가 큐로 가면 `inquiry_design_llm_cache` 에 행이 생기지 않는다 —
  // 옛 함수를 그대로 두면 배지가 조용히 0 에 멈춘다.
  check('의뢰 수를 센다', page.includes('fetchInquiryRequestQuota('));
  check('캐시 기반 카운트를 쓰지 않는다', !page.includes('fetchInquiryQuota('));

  const service = code('src/features/inquiry-design/services/inquiryGenerationService.ts');
  check('클라 한도 상수가 있다', service.includes('INQUIRY_REQUEST_DAILY_LIMIT = 20'));
  const sql = read('supabase/migrations/20260918084736_inquiry_generation_jobs.sql');
  check('서버 한도와 짝이 맞는다', sql.includes('if used >= 20 then'));
}

// ── 12. 두 기능이 한 표를 쓴다 — surface 누락은 조용히 섞인다 ────────────────
console.log('\n[12] surface — 아카데미와 탐구 설계가 섞이지 않는가');
{
  const inquirySvc = code('src/features/inquiry-design/services/inquiryGenerationService.ts');
  check('조회에 surface 를 건다', /\.eq\('surface', INQUIRY_SURFACE\)/.test(inquirySvc));
  check('학생으로도 좁힌다', /\.eq\('student_id', studentId\)/.test(inquirySvc));

  const academySvc = code('src/features/academy/game/generationService.ts');
  // 이걸 빼면 교사가 낸 탐구 설계 의뢰가 연구대의 «진행 중»으로 섞여 들어온다.
  check('아카데미 조회도 surface 를 건다', academySvc.includes(".eq('surface','academy')"));
  // 타입이 두 벌이면 컬럼이 늘 때 한쪽만 고쳐진다.
  check('작업 행 타입은 한 벌', academySvc.includes('export type GenerationJob = InquiryGenerationJob'));

  const sql = read('supabase/migrations/20260918084736_inquiry_generation_jobs.sql');
  check('surface 컬럼을 만든다', sql.includes("add column if not exists surface text not null default 'academy'"));
  check('값을 두 개로 묶는다', sql.includes("check (surface in ('academy', 'inquiry-design'))"));
  // 아카데미 접수 RPC 는 활성 작업이 있으면 **그 행을 그대로 돌려준다**.
  // surface 를 안 걸면 아카데미에서 새 의뢰를 눌렀을 때 탐구 설계 작업이 돌아온다.
  check('아카데미 활성 조회에 surface 를 더한다',
    sql.includes("where owner_id=r.id and surface='academy' and status in ('queued','running','retry')"));
  check('아카데미 일일 한도에도 surface',
    sql.includes("where owner_id=r.id and surface='academy' and (created_at at time zone"));
  check('탐구 설계는 자기 surface 로 넣는다', sql.includes("'inquiry-design')\n  returning * into j;"));
}

console.log('\n[13] 접수 RPC 의 권한 가드');
{
  const sql = read('supabase/migrations/20260918084736_inquiry_generation_jobs.sql');
  // SQL 3값 논리: auth.uid() 가 null 이면 뒤의 비교가 false 가 아니라 NULL 이라
  // `if not (...)` 형태의 가드가 조용히 통과한다(전자서명에서 실제로 뚫렸던 구멍).
  check('맨 앞에서 로그인 여부를 끊는다',
    /create or replace function public\.inquiry_generation_start[\s\S]{0,900}if auth\.uid\(\) is null then/.test(sql));
  check('학생 범위는 기존 단일 출처로 판정', sql.includes('public.inquiry_design_can_access_student(p_student_id)'));
  check('페이로드의 학생과 인자를 대조', sql.includes("if coalesce(p_input->>'studentId','') <> p_student_id then"));
  check('KG 버전 소유권을 검사', sql.includes('from public.student_kg_versions where id = version_id and student_id = p_student_id'));
  check('모델 선택은 admin 전용', sql.includes("p_provider <> 'openai' and r.role <> 'admin'"));
  // 브라우저가 준 엔티티 목록은 믿지 않는다 — 워커가 검증된 버전에서 다시 읽는다.
  check('existingEntities 를 떼어 낸다', sql.includes("p_input - 'existingEntities' - 'owner_id'"));
  check('anon·public 에서 회수', sql.includes('revoke all on function public.inquiry_generation_start(uuid,text,jsonb,text) from public, anon'));
  check('authenticated 에만 부여', sql.includes('grant execute on function public.inquiry_generation_start(uuid,text,jsonb,text) to authenticated'));
  // 교사는 여러 학생의 설계를 나란히 맡을 수 있어야 한다(아카데미는 계정당 1개).
  check('잠금은 (계정, 학생) 단위', sql.includes("hashtextextended(r.id::text || ':' || p_student_id, 1401)"));
  check('활성 제한도 (계정, 학생) 단위',
    sql.includes("where owner_id = r.id and surface = 'inquiry-design' and student_id = p_student_id"));
}

console.log(fail === 0 ? `\n✅ 전체 통과 (${pass}건)\n` : `\n❌ 실패 ${fail}건 / 통과 ${pass}건\n`);
process.exit(fail === 0 ? 0 : 1);
