// 공문 판단함 회귀 (2026-10-30) — npx tsx scripts/official-doc-test/run.mts
// ① 엣지 official-doc-ingest: 키 형식·동작 허용 목록·RPC 인자·오류 이름 ② 목록 판정(src/lib/officialDocInbox.ts)
import { createHandler } from '../../supabase/functions/official-doc-ingest/handler.js';
import { EMPTY_FACETS, NONE, bodyBlocks, compareDocs, dateRangeOf, shiftDateKey, sortDocs, parentDocOf, daysUntil, facetOptions, matchesFacets, matchesFilter, matchesQuery, needsAction } from '../../src/lib/officialDocInbox';
import type { OfficialDoc } from '../../src/features/official-docs/officialDocService';
import { agreesWithTriage, initialDraft, peopleByNames, ruleInsert, taskInsert, titleKeywords, validateDraft, workInsert } from '../../src/lib/officialDocDecision';
import { TASK_META_ROLLOVER_POLICY, WORK_META_ROLLOVER_POLICY } from '../../src/lib/workRollover';

let failed = 0;
const check = (name: string, cond: boolean) => { console.log(`  ${cond ? '✓' : '✗'} ${name}`); if (!cond) failed++; };
const KEY = 'a'.repeat(64);

console.log('[① 엣지 입구]');
const calls: Array<{ url: string; body: unknown }> = [];
const fake = async (url: string, init: { body: string }) => {
  calls.push({ url, body: JSON.parse(init.body) });
  if (url.endsWith('official_doc_ingest') && (JSON.parse(init.body).p_docs?.[0]?.doc_no === 'boom'))
    return new Response(JSON.stringify({ message: '알 수 없는 실행기' }), { status: 400 });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
const handle = createHandler({ url: 'https://x.supabase.co/', serviceKey: 'svc' }, fake as unknown as typeof fetch);
const post = (body: unknown, key = KEY) =>
  handle(new Request('https://e/official-doc-ingest', { method: 'POST', headers: { 'x-runner-key': key }, body: JSON.stringify(body) }));

check('GET 거부', (await handle(new Request('https://e/', { method: 'GET' }))).status === 405);
check('키 없으면 401', (await post({ action: 'knowledge' }, '')).status === 401);
check('모르는 동작 400', (await post({ action: 'drop' })).status === 400);
check('docs 없으면 400', (await post({ action: 'ingest' })).status === 400);
check('301건 거부', (await post({ action: 'ingest', docs: Array(301).fill({}) })).status === 400);
calls.length = 0;
check('knowledge 200', (await post({ action: 'knowledge', year: 2026 })).status === 200);
check('knowledge → RPC 인자(키는 sha256)', calls[0]?.url.endsWith('/rpc/official_doc_knowledge') &&
  (calls[0].body as { p_key_hash: string; p_year: number }).p_key_hash.length === 64 &&
  (calls[0].body as { p_key_hash: string }).p_key_hash !== KEY && (calls[0].body as { p_year: number }).p_year === 2026);
check('ingest 200', (await post({ action: 'ingest', docs: [{ doc_no: 'x', title: 't' }] })).status === 200);
calls.length = 0;
check('unassigned → RPC official_doc_unassigned(키 해시만)', (await post({ action: 'unassigned' })).status === 200 &&
  calls[0]?.url.endsWith('/rpc/official_doc_unassigned') && Object.keys(calls[0].body as object).join() === 'p_key_hash');
calls.length = 0;
await post({ action: 'refs', numbers: ['재무과-23621', 7, 'x'.repeat(81)] });
check('refs → 문자열 번호만(80자 이하) RPC 로', calls[0]?.url.endsWith('/rpc/official_doc_refs') &&
  JSON.stringify((calls[0].body as { p_numbers: string[] }).p_numbers) === '["재무과-23621"]');
check('모르는 실행기 → 401 unknown_runner', (await (await post({ action: 'ingest', docs: [{ doc_no: 'boom' }] })).json()).error === 'unknown_runner');

console.log('[② 목록 판정]');
const doc = (over: Partial<OfficialDoc>): OfficialDoc => ({
  id: Math.random().toString(), doc_no: 'n', registered_at: '2026-10-30T09:00:00+09:00', title: '제목', sender: '교육청',
  approver_name: '홍길동', approval_type: '접수', process_status: '진행', body: null, body_status: 'none',
  first_seen_at: '', triage: null, decision: null, ...over,
});
const tri = (over: Record<string, unknown>) => ({ id: 't', engine: 'llm', model: 'haiku', prompt_version: '1', nature: null,
  needs_action: null, deadline: null, confidence: null, question: null, result: {}, created_at: '2026-10-30', ...over }) as OfficialDoc['triage'];
const today = new Date(2026, 9, 30);
check('기한 D-5', daysUntil('2026-11-04', today) === 5);
check('기한 형식이 아니면 null', daysUntil('11월 4일', today) === null);
check('LLM 판정이 우선', needsAction(doc({ triage: tri({ needs_action: false, result: { rules: { 수준: '의무' } } }) })) === false);
check('LLM 값이 없으면 규칙 수준(의무)', needsAction(doc({ triage: tri({ result: { rules: { 수준: '의무' } } }) })) === true);
const decided = doc({ decision: { id: 'd', decision: 'info', nature: null, assignee_names: [], reason: null, created_at: '' } });
check('결정된 문서는 판단 대기가 아니다', !matchesFilter(decided, 'pending') && matchesFilter(decided, 'decided'));
check('검색은 낱말마다(모두 포함)', matchesQuery(doc({ title: '[긴급] 자료 제출' }), '긴급 홍길동') && !matchesQuery(doc({}), '없는말'));
const order = [decided, doc({ title: '대기' }), doc({ title: '처리', triage: tri({ needs_action: true }) })].sort(compareDocs).map((d) => d.title);
check('정렬: 처리 필요 → 대기 → 결정됨', order.join() === '처리,대기,제목');

// 드롭다운 필터
const fA = doc({ title: 'A', approver_name: '김', triage: tri({ nature: '제출', deadline: '2026-11-01', result: { obligation: '의무', sender_official: true } }) });
const fB = doc({ title: 'B', approver_name: '이', triage: tri({ nature: '홍보', result: { obligation: '협조', sender_official: false } }) });
const fC = doc({ title: 'C', approver_name: null, decision: { id: 'd', decision: 'ignore', nature: null, assignee_names: [], reason: null, created_at: '' } });
const all3 = [fA, fB, fC];
const pick = (f: Partial<typeof EMPTY_FACETS>) => all3.filter((d) => matchesFacets(d, { ...EMPTY_FACETS, ...f }, today)).map((d) => d.title).join();
check('빈 조건은 전부', pick({}) === 'A,B,C');
check('성격', pick({ nature: '제출' }) === 'A' && pick({ nature: NONE }) === 'C');
check('의무 여부', pick({ obligation: '협조' }) === 'B');
check('발신 구분(모르면 안 걸림)', pick({ sender: 'official' }) === 'A' && pick({ sender: 'other' }) === 'B');
check('기한 3일 이내 / 없음', pick({ deadline: 'd3' }) === 'A' && pick({ deadline: 'none' }) === 'B,C');
check('담당 · 담당 없음', pick({ approver: '이' }) === 'B' && pick({ approver: NONE }) === 'C');
check('결정 종류 · 아직 안 함', pick({ decision: 'ignore' }) === 'C' && pick({ decision: NONE }) === 'A,B');
check('조건은 모두 걸린다(AND)', pick({ nature: '제출', obligation: '협조' }) === '');
const natOpts = facetOptions(all3, { ...EMPTY_FACETS, obligation: '의무' }, 'nature', today);
check('항목 건수 = 다른 조건을 건 뒤의 수, 0건은 숨김', natOpts.map((o) => `${o.label}${o.count}`).join() === '제출1');
check('고른 값은 0건이어도 남는다', facetOptions(all3, { ...EMPTY_FACETS, nature: '추천' }, 'nature', today).some((o) => o.value === '추천' && o.count === 0));
const blocks = bodyBlocks('1. 관련\n| 구분 | 기한 |\n| --- | --- |\n| 고 | 11/6 |\n붙임 1부. 끝.');
check('본문 덩어리: 줄 · 표(구분 줄 버림) · 줄', blocks.length === 3 && JSON.stringify(blocks[1].table) === '[["구분","기한"],["고","11/6"]]'
  && blocks[2].lines?.[0] === '붙임 1부. 끝.');
const parentDoc = doc({ doc_no: 'P-1', title: '원' });
const child = doc({ doc_no: 'C-1', triage: tri({ result: { parent: [{ doc_no: 'P-1', title: '원', issued_no: '재무과-1' }] } }) });
check('후속 공문 → 원 공문(목록에 있으면)', parentDocOf(child, [parentDoc, child])?.title === '원' && parentDocOf(parentDoc, [parentDoc]) === null);

console.log('[②-2 접수 기간·표시 순서 (2026-11-04)]');
check('최근 7일 = 오늘 포함 7일', JSON.stringify(dateRangeOf('d7', '2026-11-04')) === JSON.stringify({ from: '2026-10-29', to: '2026-11-04' }));
check('최근 30일 — 달 넘김', dateRangeOf('d30', '2026-03-05').from === '2026-02-04');
check('윤년 날짜 계산', shiftDateKey('2028-03-01', -1) === '2028-02-29');
check('학년도 = 3월 1일부터', dateRangeOf('year', '2026-11-04').from === '2026-03-01' && dateRangeOf('year', '2027-02-10').from === '2026-03-01');
check('전체 기간 = 끝 없음', JSON.stringify(dateRangeOf('all', '2026-11-04')) === JSON.stringify({ from: null, to: null }));
check('직접 지정 — 거꾸로 넣으면 바꾼다', JSON.stringify(dateRangeOf('custom', '2026-11-04', { from: '2026-11-03', to: '2026-10-01' })) === JSON.stringify({ from: '2026-10-01', to: '2026-11-03' }));
check('직접 지정 — 형식이 아니면 끝 없음', dateRangeOf('custom', '2026-11-04', { from: 'x', to: null }).from === null);
{
  const a = doc({ doc_no: 'a', registered_at: '2026-10-28T09:00:00+09:00' });
  const b = doc({ doc_no: 'b', registered_at: '2026-10-30T09:00:00+09:00', decision: { id: 'd', decision: 'info', nature: null, work_id: null, task_id: null, work_candidate_id: null, assignee_names: [], reason: null, created_at: '' } });
  const c = doc({ doc_no: 'c', registered_at: '2026-10-29T09:00:00+09:00' });
  check('최근 접수순', sortDocs([a, b, c], 'newest').map((d) => d.doc_no).join() === 'b,c,a');
  check('오래된 접수순', sortDocs([a, b, c], 'oldest').map((d) => d.doc_no).join() === 'a,c,b');
  check('처리 순 = 결정 안 한 것 먼저', sortDocs([a, b, c], 'priority').at(-1)?.doc_no === 'b');
  const child = doc({ doc_no: 'child', triage: tri({ result: { parent: [{ doc_no: 'b', title: '', issued_no: '' }] } }) });
  check('원 공문은 기간 밖(related)에서도 찾는다', parentDocOf(child, [child, a, ...[b]])?.doc_no === 'b' && parentDocOf(child, [child, a]) === null);
}

console.log('[③ 결정 (2단계)]');
const roster = [{ id: 'p1', name: '홍길동' }, { id: 'p2', name: '한서윤' }, { id: 'p3', name: '홍길동' }, { id: 'p4', name: '이몽룡' }];
check('동명이인은 고르지 않는다(추측 금지)', peopleByNames(['홍길동', '한서윤', '없는사람'], roster).map((p) => p.id).join() === 'p2');
check('제목 낱말: 꼬리표·흔한 말 제외', titleKeywords('[긴급] 행정사무감사 요구자료(1인 수의계약) 제출').join() === '행정사무감사,요구자료');
const aiDoc = doc({ title: '[긴급] 수의계약 현황 제출', sender: '전북특별자치도교육청 재무과', approver_name: '한서윤',
  triage: tri({ needs_action: true, nature: '제출', deadline: '2026-11-02',
    result: { summary: '11/2까지 제출', work_candidates: [{ id: 'c1', name: '계약' }], assignees: [{ name: '이몽룡' }] } }) });
const d0 = initialDraft(aiDoc, roster);
check('초안: 할 일 있음 → 기존 업무에 연결, 기한·후보·담당 채움', d0.kind === 'link_work' && d0.taskDue === '2026-11-02' && d0.candidateId === 'c1'
  && d0.assignees.map((a) => a.id).join() === 'p4,p2' && d0.taskTitle === '수의계약 현황 제출');
check('초안: 연결할 업무를 안 고르면 저장 불가', validateDraft(d0) === '연결할 업무를 고르세요.');
check('초안: 업무를 고르면 저장 가능', validateDraft({ ...d0, workId: 'w1' }) === null);
check('무관·홍보 판정은 무시가 기본', initialDraft(doc({ triage: tri({ nature: '홍보', needs_action: false }) }), roster).kind === 'ignore');
const t = taskInsert({ ...d0, workId: 'w1' }, aiDoc, new Date('2026-10-30T00:00:00Z'));
check('할 일: 일회성 · 담당자 pending · 공문 링크', t.type === 'one_time' && (t.meta.assignees as Array<{ status: string }>)[0].status === 'pending'
  && (t.meta as Record<string, { doc_no: string }>).fromOfficialDoc.doc_no === 'n');
const w = workInsert({ ...d0, kind: 'create_work', newWorkName: '계약 실적 보고', managers: [roster[1]] }, aiDoc, 2026, '행정실');
check('새 업무: 학년도·부서·공문 링크 + 첫 할 일', w.work.meta.year === 2026 && w.work.meta.department === '행정실' && 'fromOfficialDoc' in w.work.meta && w.tasks.length === 1);
const rule = ruleInsert({ ...d0, makeRule: true, reason: '계약은 행정실' }, 'dec1', { workId: 'w1', candidateId: null }, 2026);
check('규칙: 발신 + 제목 낱말 → 결정·업무·담당, 바로 active', rule.status === 'active' && (rule.condition as { sender: string }).sender === '전북특별자치도교육청 재무과'
  && (rule.condition as { title_all: string[] }).title_all.length > 0 && rule.outcome.work_id === 'w1' && rule.note === '계약은 행정실');
check('규칙 조건이 비면 저장 불가', validateDraft({ ...d0, workId: 'w1', makeRule: true, ruleSender: '', ruleKeywords: '' }) !== null);
const dec = (over: Record<string, unknown>) => ({ id: 'd', decision: 'link_work', nature: null, work_id: null, task_id: null, work_candidate_id: null, assignee_names: [], reason: null, created_at: '', ...over }) as OfficialDoc['decision'];
check('정확도: 같은 후보를 고르면 일치', agreesWithTriage({ ...aiDoc, decision: dec({ work_candidate_id: 'c1' }) }) === true);
check('정확도: 할 일 있음 ↔ 참고만이면 불일치', agreesWithTriage({ ...aiDoc, decision: dec({ decision: 'info' }) }) === false);
check('정확도: 결정이 없으면 셈에서 뺀다', agreesWithTriage(aiDoc) === null);
check('연간 가져오기가 공문 링크를 옮기지 않는다', (TASK_META_ROLLOVER_POLICY as Record<string, string>).fromOfficialDoc === 'drop'
  && (WORK_META_ROLLOVER_POLICY as Record<string, string>).fromOfficialDoc === 'drop');

console.log('[③ 가벼운 목록(p_slim, 2026-11-13)]');
{
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync('supabase/migrations/20261113110000_official_doc_list_speed.sql', 'utf-8');
  const slimBlock = sql.slice(sql.indexOf("'result', case when not v_slim"), sql.indexOf("'created_at', t.created_at) end"));
  const kept = new Set([...slimBlock.matchAll(/'([a-z_]+)', t\.result->'\1'/g)].map((m) => m[1]));
  // 목록 판정·결정 기본값이 접힌 행(가벼운 행)에서 읽는 판정 칸 — 가벼운 목록에서 빠지면 오류 없이 필터·건수·정확도가 틀린다
  const used = new Set<string>();
  for (const f of ['src/lib/officialDocInbox.ts', 'src/lib/officialDocDecision.ts']) {
    for (const m of readFileSync(f, 'utf-8').matchAll(/result\?\.([a-z_]+)/g)) used.add(m[1]);
  }
  const missing = [...used].filter((k) => k !== 'work_candidates' && !kept.has(k));
  check(`목록이 쓰는 판정 칸이 가벼운 목록에 있다 (${[...used].join(', ')})`, missing.length === 0 && /'work_candidates', case when/.test(slimBlock));
  if (missing.length) console.log('    빠진 칸:', missing.join(', '));
  const inbox = readFileSync('src/features/official-docs/components/OfficialDocInbox.tsx', 'utf-8');
  check('판단함은 가벼운 목록을 받고, 펼친 행·결정 창은 상세를 받는다', inbox.includes('listOfficialDocs({ ...range, slim: true })')
    && inbox.includes('useOfficialDocFull(doc, open)') && inbox.includes('fetchQuery(detailQuery(doc))'));
  check('정책은 문장마다 한 번 — 행마다 함수를 부르지 않는다', /using \(\(select public\.is_admin\(\)\)\)/.test(sql)
    && sql.includes('any ((select public.official_doc_my_names())::text[])'));
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
