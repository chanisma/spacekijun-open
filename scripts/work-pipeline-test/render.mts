/**
 * 업무 진행 화면 — 부품의 **SSR 렌더** 회귀 (2026-09-27).
 *
 * 실행: npx tsx --tsconfig tsconfig.app.json --import ./scripts/css-stub.mjs scripts/work-pipeline-test/render.mts
 * (`--tsconfig` 를 빠뜨리면 `React is not defined`, `--import` 를 빠뜨리면 `.css` 에서 죽는다)
 *
 * 순수 로직 회귀(`run.mts`)는 그림을 보지 못한다 — 계정 없는 사람이 표시 없이 섞이거나, 단계 줄이
 * 선택을 잃거나, 점검 패널이 렌더 중 터져도 전부 통과한다. 그런 것을 여기서 못 박는다.
 * (로그인이 Google OAuth 라 브라우저 자동화로는 이 화면에 닿을 수 없다)
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OutputBodyView } from '../../src/components/tasks/pipeline/OutputView';
import { PipelineStageBar } from '../../src/components/tasks/pipeline/PipelineStageBar';
import { TableEditor } from '../../src/components/tasks/pipeline/TableEditor';
import { RowPicker } from '../../src/components/tasks/pipeline/RowPicker';
import { WorkCheckPanel } from '../../src/components/tasks/pipeline/WorkCheckPanel';
import { buildStages, type OutputTable, type PipelineTaskLike } from '../../src/lib/workPipeline';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const render = (el: unknown): { html: string; error: string } => {
  try { return { html: renderToStaticMarkup(el as never), error: '' }; } catch (e) { return { html: '', error: String(e) }; }
};

const T = (id: string, order: number, extra: Partial<PipelineTaskLike> = {}): PipelineTaskLike => ({
  id, title: `할 일 ${id}`, order_index: order, status: 'pending', due_date: null, description: null, meta: {}, ...extra,
});

console.log('[① 단계 줄]');
{
  const stages = buildStages([T('a', 1, { status: 'completed', title: '공유' }), T('b', 2, { title: '접수' }), T('c', 2, { title: '병렬' }), T('d', 3, { title: '회의' })]);
  const { html, error } = render(h(PipelineStageBar, { stages, selectedTaskId: 'b', onSelect: () => {} }));
  check('렌더 성공', !error, error);
  check('단계 번호 ①②③', html.includes('①') && html.includes('②') && html.includes('③'));
  check('병렬 단계는 «동시에 2개»', html.includes('동시에 2개'));
  check('선택한 할 일 = aria-current', /aria-current="step"[^>]*>접수|접수[\s\S]{0,40}/.test(html) && html.includes('aria-current="step"'));
  check('끝난 단계 = 에메랄드, 지금 = 블루', html.includes('bg-emerald-50') && html.includes('bg-blue-50'));
  check('가로로 넘치면 자기 컨테이너가 스크롤(본문이 밀리지 않게)', html.includes('overflow-x-auto'));
}

console.log('[①-2 순서 없는 할 일 = 가로 배치 + 자동 줄바꿈]');
{
  const stages = buildStages([T('a', 1, { title: '공유' })]);
  const unordered = [T('x', 9, { title: '자산 대장' }), T('y', 9, { title: '만족도 조사' }), T('z', 9, { title: '예산 정산', status: 'cancelled' })];
  const { html, error } = render(h(PipelineStageBar, { stages, unordered, selectedTaskId: 'y', onSelect: () => {} }));
  check('렌더 성공', !error, error);
  const group = html.slice(html.indexOf('data-testid="unordered-group"'));
  check('개수 머리', group.includes('순서 없는 할 일 · 3개'));
  // 할 일 버튼을 담는 줄은 flex-col 이 아닌 가로 flex 여야 한다(세로로 쌓으면 «동시에 하는 한 단계»로 읽힌다)
  check('할 일들은 가로로 늘어놓고 자동 줄바꿈(flex-wrap, flex-col 아님)', /<div class="flex flex-wrap gap-1">(?:<button[^>]*>[^<]*<\/button>){3}<\/div>/.test(group));
  // 단계 줄은 min-w-max(내용만큼 늘어남)라 그 안에서는 flex-wrap 이 줄을 바꿀 폭이 없다
  check('단계 줄 밖(아래)에 둔다 — 안에 두면 줄바꿈이 일하지 않는다', html.indexOf('data-testid="unordered-group"') > html.lastIndexOf('</ol>'));
  check('한 칸은 최대 폭에서 자른다(좁은 화면에선 줄 폭까지) + 전문은 title', (group.match(/max-w-\[min\(13rem,100%\)\] truncate/g) ?? []).length === 3 && group.includes('title="자산 대장"'));
  check('고른 할 일 = aria-current, 취소 = 취소선', /aria-current="step"[^>]*>만족도 조사/.test(group) && /line-through[^>]*>예산 정산/.test(group));
}

console.log('[② 산출물 보기]');
{
  const people = render(h(OutputBodyView, { body: { kind: 'people', people: [{ resourceId: 'r1', name: '김교사' }, { resourceId: null, name: '이교사' }] } }));
  check('명단 렌더', !people.error && people.html.includes('김교사') && people.html.includes('이교사'), people.error);
  check('계정 없는 사람은 앰버 + 까닭(받는 사람으로 못 넘긴다)', people.html.includes('bg-amber-50') && people.html.includes('계정이 연결되지 않아'));
  const table: OutputTable = { columns: [{ key: 'n', label: '물품' }, { key: 'q', label: '금액' }], rows: Array.from({ length: 12 }, (_, i) => ({ key: `r${i}`, cells: { n: `물품${i}`, q: '100,000' } })) };
  const compact = render(h(OutputBodyView, { body: { kind: 'table', ...table }, compact: true }));
  check('표(좁게) — 8줄만 보이고 몇 줄 중인지 말한다', !compact.error && compact.html.includes('12줄 중 8줄 표시'), compact.error);
  check('합계는 코드가 계산해 보여 준다', compact.html.includes('합계 금액 1,200,000'));
  const empty = render(h(OutputBodyView, { body: { kind: 'table', columns: [], rows: [] } }));
  check('빈 표 = «아직 남긴 것이 없습니다»', empty.html.includes('아직 남긴 것이 없습니다'));
  const file = render(h(OutputBodyView, { body: { kind: 'file', files: [{ name: '보고서_최종_수정본_v3.hwpx', url: 'https://drive.google.com/x' }] } }));
  check('파일 이름 = truncate + title(긴 파일명 넘침 규약) — title 에 실제 주소까지(드라이브처럼 꾸민 링크를 가려낸다)', file.html.includes('truncate') && /title="보고서_최종_수정본_v3\.hwpx\shttps:\/\/drive\.google\.com\/x"/.test(file.html));
  const evil = render(h(OutputBodyView, { body: { kind: 'file', files: [{ name: '제출물.hwpx', url: 'javascript:alert(1)' }] } }));
  check('javascript: 주소는 링크로 그리지 않는다', !evil.html.includes('href="javascript') && !evil.html.includes('<a') && evil.html.includes('제출물.hwpx'));
}

console.log('[③ 표 편집기·행 고르기]');
{
  const value: OutputTable = { columns: [{ key: 'c1', label: '물품명' }], rows: [{ key: 'r1', cells: { c1: '노트북' } }] };
  const ed = render(h(TableEditor, { value, onChange: () => {} }));
  check('편집기 렌더', !ed.error && ed.html.includes('value="노트북"'), ed.error);
  check('휴대폰 입력 16px(iOS 확대 방지) — text-base md:text-xs', ed.html.includes('text-base') && ed.html.includes('md:text-xs'));
  check('줄·열 추가 버튼', ed.html.includes('줄 추가') && ed.html.includes('열 추가'));
  const ro = render(h(TableEditor, { value, onChange: () => {}, disabled: true }));
  check('읽기 전용이면 추가·삭제가 없다', !ro.html.includes('줄 추가') && !ro.html.includes('열 삭제'));
  const picker = render(h(RowPicker, { source: value, sourceLabel: '입력 받기 · 사용 신청', previous: null, onPick: () => {}, onCancel: () => {} }));
  check('행 고르기 렌더 + 기본 전부 선택', !picker.error && picker.html.includes('(1/1)') && picker.html.includes('1줄 가져오기'), picker.error);
}

console.log('[④ 점검 패널]');
{
  const tasks = [T('a', 1, { title: '공유' }), T('b', 2, { title: '회의 안내' })];
  const actions = [{ id: 'm', task_id: 'b', action_type: 'message.send', title: '회의 안내', config: { message: { body: '임시로 생성하여 저장', audience: { include: [] } } } }];
  const panel = render(h(WorkCheckPanel, { work: { id: 'w', name: '업무', status: 'active' }, tasks, actions, onSelectTask: () => {} }));
  check('점검 패널 렌더', !panel.error, panel.error);
  check('코드 규칙 결과가 곧바로 보인다(버튼 없이)', panel.html.includes('마감일이 없는 할 일이 2개') && panel.html.includes('자리표시 문구'));
  check('지적이 가리키는 할 일로 가는 칩', panel.html.includes('회의 안내'));
  check('AI 점검은 버튼으로만', panel.html.includes('AI 점검') && !panel.html.includes('맞아요'));
  const clean = render(h(WorkCheckPanel, { work: { id: 'w', name: '업무', status: 'completed' }, tasks: [T('a', 1, { status: 'completed' })], actions: [], onSelectTask: () => {} }));
  check('문제가 없으면 그렇게 말한다', clean.html.includes('규칙으로 찾은 문제가 없습니다'));
}

console.log(`\n${pass}건 통과${fail ? `, ${fail}건 실패` : ''}`);
if (fail) process.exit(1);
