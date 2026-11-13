/**
 * 업무 상세 «업무 지식» 칸 — 순수 로직 + SSR 렌더 회귀 (2026-10-24).
 *
 *   npx tsx --tsconfig tsconfig.app.json --import ./scripts/css-stub.mjs scripts/work-knowledge-web-test/run.mts
 *
 * 로그인이 Google OAuth 라 브라우저로는 이 칸에 닿지 못한다 — 그림을 그리는 몸(WorkKnowledgeView)을 SSR 로 그려 본다.
 * 이 부류(책임자 아닌 사람에게 칸이 보임 · 지난 해 지식에 고치기 버튼 · 보관 이유 없이 보관)는 오류 없이 틀린다.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  archiveReasonError, knowledgeInputError, knowledgeOriginLabel, knowledgeTargetToColumns, lineageSummary, sortKnowledge,
  KNOWLEDGE_KIND_LABEL, WRITABLE_KNOWLEDGE_KINDS, type WorkKnowledgeData, type WorkKnowledgeItem,
} from '../../src/lib/workKnowledge';
import { WorkKnowledgeView } from '../../src/components/tasks/WorkKnowledgeSection';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
let fails = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${!cond && extra !== undefined ? ` — ${String(extra).slice(0, 300)}` : ''}`);
  if (!cond) fails++;
};
const render = (el: unknown) => { try { return renderToStaticMarkup(el as never); } catch (e) { return `RENDER ERROR ${e}`; } };
const noop = async () => {};

const item = (o: Partial<WorkKnowledgeItem>): WorkKnowledgeItem => ({
  knowledge_id: 1, kind: 'procedure', title: '제목', body: '내용', from: 'this_work', at: '2026-10-24T00:00:00Z', ...o,
});

console.log('① 순수 로직');
check('웹에서 고르는 종류 = 넷(인사이트 제외)', WRITABLE_KNOWLEDGE_KINDS.join() === 'procedure,tip,caution,reference');
check('종류 이름 = 서버 CHECK 다섯', Object.keys(KNOWLEDGE_KIND_LABEL).sort().join() === 'caution,insight,procedure,reference,tip');
check('출처: 이 업무', knowledgeOriginLabel({ from: 'this_work' }) === '이 업무');
check('출처: 2025년 업무 · 1년 전', knowledgeOriginLabel({ from: '1년 전 업무', source_year: 2025 }) === '2025년 업무 · 1년 전');
check('출처: 해를 모르면 «지난 업무»', knowledgeOriginLabel({ from: '2년 전 업무' }) === '지난 업무 · 2년 전');
check('계보 요약: 지난 해가 없으면 null', lineageSummary([{ work_id: 'a', name: 'x', generations_ago: 0 }]) === null);
check('계보 요약: 2개 해', lineageSummary([{ work_id: 'a', name: 'x', generations_ago: 0 }, { work_id: 'b', name: 'x', year: 2025, generations_ago: 1 }, { work_id: 'c', name: 'x', year: 2024, generations_ago: 2 }])?.startsWith('지난 2개 해(2025·2024)') === true);
check('입력 검사: 빈 제목', knowledgeInputError({ title: ' ', body: 'b' }) === '제목을 적어 주세요.');
check('입력 검사: 201자 제목', knowledgeInputError({ title: 'x'.repeat(201), body: 'b' }) !== null);
check('입력 검사: 빈 내용', knowledgeInputError({ title: 't', body: '' }) === '내용을 적어 주세요.');
check('입력 검사: 통과', knowledgeInputError({ title: 't', body: 'b', basis: '' }) === null);
check('붙일 곳 → 칸: 업무 전체', JSON.stringify(knowledgeTargetToColumns('')) === '{"task_id":null,"action_id":null}');
check('붙일 곳 → 칸: 할 일', JSON.stringify(knowledgeTargetToColumns('task:t1')) === '{"task_id":"t1","action_id":null}');
check('붙일 곳 → 칸: 작업(할 일은 서버가 채운다)', JSON.stringify(knowledgeTargetToColumns('action:a1')) === '{"task_id":null,"action_id":"a1"}');
check('보관 이유: 비우면 거부', archiveReasonError('  ') !== null && archiveReasonError('일정이 바뀜') === null);
check('정렬: 보관한 것은 맨 아래, 나머지는 서버 순서', sortKnowledge([item({ knowledge_id: 1, status: 'archived' }), item({ knowledge_id: 2 }), item({ knowledge_id: 3 })]).map((i) => i.knowledge_id).join() === '2,3,1');

console.log('② SSR 렌더');
const base = { tasks: [{ id: 't3', title: '계획 받기', actions: [{ id: 'a3', title: '출결 마감', type: 'neis.screen' }] }], showArchived: false, onToggleArchived: () => {}, onAdd: noop, onUpdate: noop, onArchive: noop, onRestore: noop };
const data: WorkKnowledgeData = {
  can_view: true, can_write: true,
  lineage: [{ work_id: 'w3', name: '업무', year: 2027, generations_ago: 0 }, { work_id: 'w2', name: '업무', year: 2026, generations_ago: 1 }, { work_id: 'w1', name: '업무', year: 2025, generations_ago: 2 }],
  items: [
    item({ knowledge_id: 11, kind: 'tip', title: '올해 요령', body: '부장 회의 뒤 보낸다', from: 'this_work', task_now: { task_id: 't3', title: '계획 받기' } }),
    item({ knowledge_id: 12, kind: 'caution', title: '마감 겹침', body: '중간고사와 겹치지 않게', from: '2년 전 업무', source_year: 2025, basis: '2025 응답 지연',
      task_now: { task_id: 't3', title: '계획 받기' }, action_now: { action_id: 'a3', title: '출결 마감', type: 'neis.screen' }, action_then: '출결 마감(옛)' }),
    item({ knowledge_id: 13, kind: 'insight', title: '다시 알림', body: '마감 3일 전이 좋다', from: '2년 전 업무', source_year: 2025,
      suggestions: [{ text: '마감 3일 전 다시 알림', task_title: '계획 받기' }], decision: 'applied',
      task_now: { task_id: 't3', title: '계획 받기' }, task_then: '계획 제출 받기' }),
  ],
};
let html = render(h(WorkKnowledgeView, { ...base, data }));
check('렌더 성공', !html.startsWith('RENDER ERROR'), html);
check('제목 «업무 지식 3» + 계보 요약', html.includes('업무 지식<!-- --> 3') || html.includes('업무 지식 3'), html.slice(0, 400));
check('계보 요약 문구', html.includes('지난 2개 해(2026·2025)의 지식도 함께 보입니다'));
check('지난 해 지식 출처 = 2025년 업무 · 2년 전', html.includes('2025년 업무 · 2년 전'));
check('주의 = 앰버 칩, 인사이트 = 바이올렛 칩(상태 색을 쓰지 않는다)', /data-kind="caution"[\s\S]*?bg-amber-50/.test(html) && /data-kind="insight"[\s\S]*?bg-violet-50/.test(html)
  && !/data-kind="tip"[\s\S]*?bg-emerald-50/.test(html));
check('옛 할 일 지식 → 올해 할 일 이름 + 지난 해 이름은 title', html.includes('할 일 · 계획 받기') && html.includes('지난 해 이름: 계획 제출 받기'));
check('인사이트 제안·«올해 따름»', html.includes('마감 3일 전 다시 알림') && html.includes('올해 따름'));
check('근거 표시', html.includes('근거 · 2025 응답 지연'));
check('작업 지식 = 올해 이어진 작업 이름 + 지난 해 이름은 title', html.includes('작업 · 출결 마감</span>') && html.includes('지난 해 이름: 출결 마감(옛)'));
// 고치기 = 이 업무의 지식만(지난 해 지식은 보관만 — 이어받은 책임자가 옛 기록을 고쳐 쓰지 않게)
const rows = html.split('<li ').slice(1);
const rowOf = (title: string) => rows.find((r) => r.includes(title)) ?? '';
check('이 업무 지식 = 고치기·보관', rowOf('올해 요령').includes('고치기') && rowOf('올해 요령').includes('보관'));
check('지난 해 지식 = 보관만(고치기 없음)', !rowOf('마감 겹침').includes('고치기') && rowOf('마감 겹침').includes('보관'));
check('남기기 버튼(책임자)', html.includes('지식 남기기'));

html = render(h(WorkKnowledgeView, { ...base, data, initialFormOpen: true }));
{
  const form = html.slice(html.indexOf('data-testid="work-knowledge-form"'), html.indexOf('</select>'));
  check('쓰기 칸 = 종류 넷(인사이트 없음)', (form.match(/role="radio"/g) ?? []).length === 4 && !form.includes('인사이트'), (form.match(/role="radio"/g) ?? []).length);
  check('쓰기 칸 = 붙일 곳(업무 전체 · 할 일 · 그 할 일의 작업)', /<option value=""[^>]*>업무 전체<\/option>/.test(form)
    && /<optgroup label="계획 받기">/.test(form) && /<option value="task:t3"[^>]*>할 일 · 계획 받기<\/option>/.test(form)
    && /<option value="action:a3"[^>]*>작업 · 출결 마감<\/option>/.test(form), form.slice(-400));
}
check('누르는 칸 = 휴대폰 44px', html.includes('min-h-[44px]'));

html = render(h(WorkKnowledgeView, { ...base, data: { ...data, can_write: false } }));
check('이어받은 책임자가 아니어도 볼 수 있는 경우(can_write 없음) = 남기기·고치기 없음, 보관은 있음', !html.includes('지식 남기기') && !html.includes('고치기') && html.includes('보관'));

html = render(h(WorkKnowledgeView, { ...base, data: { can_view: false } }));
check('책임자가 아니면 칸을 그리지 않는다', html === '', html);

html = render(h(WorkKnowledgeView, { ...base, data: { can_view: true, can_write: true, items: [] } }));
check('빈 상태가 «다음 해 담당자와 에이전트가 본다»를 말한다', html.includes('다음 해 담당자와 에이전트가 함께 봅니다'));

html = render(h(WorkKnowledgeView, { ...base, data: { ...data, items: [item({ knowledge_id: 9, status: 'archived', archived_reason: '일정이 바뀜' })] }, showArchived: true }));
check('보관한 지식 = 이유 + 다시 쓰기', html.includes('보관 · 일정이 바뀜') && html.includes('다시 쓰기'));

console.log('③ 배선');
const dlg = read('src/components/tasks/WorkDetailDialog.tsx');
check('업무 상세가 업무 지식 칸을 그린다', dlg.includes('<WorkKnowledgeSection workId={currentWork.id}'));
const sec = read('src/components/tasks/WorkKnowledgeSection.tsx');
check('읽기 = get_work_knowledge RPC(계보), 쓰기 = 표에 바로', sec.includes("rpc('get_work_knowledge'") && sec.includes(".from('work_knowledge').insert("));
check('쓰기에 작성 정보를 싣지 않는다(서버 트리거가 정한다)', !/author_role|author_resource_id|via:/.test(sec.slice(sec.indexOf('onAdd={'))));
check('insert 에 .select() 를 붙이지 않는다', !/\.insert\([\s\S]*?\)\s*\.select\(/.test(sec));
const mig = read('supabase/migrations/20261024180000_work_knowledge_web.sql');
check('웹 RPC 는 mcp_* 가 아니고 에이전트 허용에 묶이지 않는다', mig.includes('create or replace function public.get_work_knowledge') && !mig.includes('require_tool'));
check('웹 RPC 는 에이전트 도구와 같은 함수로 읽는다', mig.includes('mcp_private.wk_knowledge('));
check('웹 RPC = 로그인 필수 · anon 회수', mig.includes("if auth.uid() is null then") && mig.includes('revoke all on function public.get_work_knowledge(uuid, boolean) from public, anon'));

console.log('④ 지난 업무 가져오기 — 작업을 1:1 로 옮기고 원본을 남긴다');
const ro = read('src/services/workRolloverService.ts');
check('작업마다 rolled_over_from(원본 작업 id) — 이어가기만, 참고 모드는 계보를 남기지 않는다(2026-11-12)', /rolled_over_from: lineage \? a\.id : null,/.test(ro));
check('여러 개 둘 수 있는 종류 = 하나씩(새 instance_key)', /instance_key: multiple \? crypto\.randomUUID\(\) : ''/.test(ro));
check('하나뿐인 종류만 (할 일, 종류)당 하나로 접는다', /if \(!multiple\) \{[\s\S]*?singleFirst/.test(ro));
check('새 작업 id 대응은 rolled_over_from 으로(반환 순서에 기대지 않는다)', /\.select\('id, rolled_over_from'\)/.test(ro));
const actMig = read('supabase/migrations/20261024190000_mcp_work_knowledge_actions.sql');
check('작업 지식: 할 일은 서버가 작업에서 채운다', /new\.task_id := v_task;/.test(actMig));
check('작업 계보 = 순환·깊이 상한', /not \(a\.rolled_over_from = any \(l\.path\)\) and l\.depth < 20/.test(actMig));

console.log(fails ? `\n✗ ${fails}건 실패` : '\n✓ 모두 통과');
process.exitCode = fails ? 1 : 0;
