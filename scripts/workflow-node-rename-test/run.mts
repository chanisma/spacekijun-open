// 업무 흐름 노드 이름 → 원본 이름 동기화 제안 회귀 — 2026-09-23 신설.
//
// 못 박는 것:
//  ① 묻는 조건 — 업무·할 일 노드 ∧ 원본 있음 ∧ 이름이 달라짐 ∧ 매니저 ∨ admin.
//     서버 RLS(work·task UPDATE)는 로그인 사용자 전원에게 열려 있어 **권한은 이 판정이 유일한 방어선**이다.
//  ② 편집 한 번에 한 번만 — 원본과 다른 약칭을 쓰던 노드를 클릭만 하고 나가면 묻지 않는다.
//  ③ 배선 — 인스펙터가 onBlur 에서 판정하고, 쓰기는 .select 로 0행(RLS 차단)을 오류로 만든다.
//
// 실행: npx tsx --tsconfig tsconfig.app.json scripts/workflow-node-rename-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canRenameSource,
  getLinkedSourceName,
  getSourceRenameProposal,
  shouldAskOnCommit,
} from '../../src/features/task-workflow/utils/nodeRename';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};

const ME = 'res-me';
const OTHER = 'res-other';
const work = (id: string, name: string, managers: string[], tasks: { id: string; title: string }[] = [], legacy?: string) =>
  ({ id, name, meta: { managers: managers.map((m) => ({ id: m, name: m })) }, tasks, ...(legacy ? { manager_id: legacy } : {}) }) as never;
const node = (kind: string, entityId: string | null, label: string) =>
  ({ id: 'n1', type: 'workflowNode', position: { x: 0, y: 0 }, data: { kind, entityId, label, metadata: {} } }) as never;

const works = [
  work('w1', '1학기 성적 처리', [ME], [{ id: 't1', title: '세특 입력' }]),
  work('w2', '남의 업무', [OTHER], [{ id: 't2', title: '남의 할 일' }]),
  work('w3', '레거시 업무', [], [], ME),
];
const me = { resourceId: ME, isAdmin: false };
const admin = { resourceId: 'res-admin', isAdmin: true };

console.log('① 묻는 조건');
const p1 = getSourceRenameProposal(node('event', 'w1', '1학기 성적 처리 (최종)'), works, me);
check('매니저가 업무 노드 이름을 바꾸면 묻는다', p1?.kind === 'work' && p1.currentName === '1학기 성적 처리' && p1.nextName === '1학기 성적 처리 (최종)');
const p2 = getSourceRenameProposal(node('task', 't1', ' 과목별 세특 입력 '), works, me);
check('할 일 노드 — 소속 업무 이름을 함께 준다, 앞뒤 공백은 뗀다', p2?.kind === 'task' && p2.workName === '1학기 성적 처리' && p2.nextName === '과목별 세특 입력');
check('같은 이름(공백만 다름)이면 묻지 않는다', getSourceRenameProposal(node('task', 't1', '  세특 입력'), works, me) === null);
check('빈 이름이면 묻지 않는다', getSourceRenameProposal(node('task', 't1', '   '), works, me) === null);
check('남의 업무면 묻지 않는다', getSourceRenameProposal(node('event', 'w2', '바꿈'), works, me) === null);
check('남의 업무의 할 일도 묻지 않는다', getSourceRenameProposal(node('task', 't2', '바꿈'), works, me) === null);
check('admin 은 남의 업무도 묻는다', getSourceRenameProposal(node('event', 'w2', '바꿈'), works, admin)?.entityId === 'w2');
check('레거시 manager_id 도 매니저로 인정', canRenameSource(works[2], me));
check('resource id 를 모르면 매니저가 아니다', !canRenameSource(works[0], { resourceId: null, isAdmin: false }));
check('원본이 없으면(삭제됨) 묻지 않는다', getSourceRenameProposal(node('event', 'gone', 'x'), works, me) === null);
check('연결 안 된 노드는 묻지 않는다', getSourceRenameProposal(node('task', null, 'x'), works, me) === null);
check('메모·영역 노드는 묻지 않는다', getSourceRenameProposal(node('note', 'w1', 'x'), works, admin) === null && getSourceRenameProposal(node('region', 'w1', 'x'), works, admin) === null);
check('너무 긴 이름(200자 초과)은 묻지 않는다', getSourceRenameProposal(node('event', 'w1', '가'.repeat(201)), works, me) === null);
check('원본 이름 조회', getLinkedSourceName(node('task', 't2', 'x'), works) === '남의 할 일' && getLinkedSourceName(node('note', 'w1', 'x'), works) === null);

console.log('② 편집 한 번에 한 번');
check('이번 편집에서 바뀌었으면 묻는다', shouldAskOnCommit('세특 입력', '세특 입력 v2'));
check('클릭만 하고 나가면 묻지 않는다(이미 약칭이어도)', !shouldAskOnCommit('약칭', '약칭'));
check('공백만 바꿨으면 묻지 않는다', !shouldAskOnCommit('세특 입력', '세특 입력 '));
check('편집을 시작하지 않았으면 묻지 않는다', !shouldAskOnCommit(null, '무엇이든'));

console.log('③ 배선(정적)');
const ROOT = join(import.meta.dirname, '..', '..');
const inspector = readFileSync(join(ROOT, 'src/features/task-workflow/components/WorkflowInspector.tsx'), 'utf-8');
check('입력칸을 벗어날 때 판정한다(입력마다 묻지 않는다)', /onBlur=\{commit\}/.test(inspector) && !/onChange=\{[^}]*getSourceRenameProposal/.test(inspector));
check('한글 조합 중 Enter 는 확정으로 보지 않는다', inspector.includes('isComposing'));
check(
  'Enter 는 preventDefault 후 blur — 안 하면 같은 Enter 가 방금 뜬 확인창의 첫 버튼을 눌러 바로 닫힌다',
  /isComposing\) \{[\s\S]*?event\.preventDefault\(\);\s*event\.currentTarget\.blur\(\)/.test(inspector),
);
check(
  '확인창은 열릴 때 버튼이 아니라 자신에게 포커스를 둔다',
  /onOpenAutoFocus=\{\(event\) => \{\s*event\.preventDefault\(\);/.test(inspector),
);
check('확인 버튼은 preventDefault 후 비동기(실패 시 모달이 남는다)', /event\.preventDefault\(\);\s*void applyRename\(\)/.test(inspector));
check('원본 열기는 헤더의 아이콘 버튼(본문의 큰 버튼 없음)', inspector.includes('aria-label={`원본 ${node.data.kind') && !/원본 \{node\.data\.kind === 'event' \? '업무' : '할 일'\} 열기\s*<ExternalLink/.test(inspector));
check('헤더 배경색은 헤더의 동그라미 팝오버(본문 격자 없음)', inspector.includes('<HeaderColorButton') && !inspector.includes('grid grid-cols-4 gap-2'));
check('세부 정보는 맨 아래 — 연결된 작업 뒤', inspector.indexOf('>세부 정보</p>') > inspector.indexOf('<TaskActionPanel'));
check("세부 정보에서 겹치는 '유형'을 뺐다", !inspector.includes('<dt className="text-slate-400">유형</dt>'));
const canvas = readFileSync(join(ROOT, 'src/features/task-workflow/components/WorkflowCanvas.tsx'), 'utf-8');
check(
  '확인창은 캔버스가 소유한다(빈 곳 클릭으로 편집을 마치면 인스펙터가 사라진다)',
  canvas.includes('<SourceRenameDialog') && !/function SourceLinkedLabelField[\s\S]*?<AlertDialog[\s\S]*?^}/m.test(inspector.split('export function SourceRenameDialog')[0]),
);
const hook = readFileSync(join(ROOT, 'src/features/task-workflow/hooks/useRenameWorkflowSource.ts'), 'utf-8');
check('쓰기는 반환 행으로 0행(RLS 차단)을 오류로 만든다', hook.includes(".select('id')") && hook.includes('!data?.length'));
check('업무 관리·내 할 일 쿼리를 무효화한다', hook.includes("'works-jsonb'") && hook.includes("'my-tasks-jsonb'"));

console.log(fails === 0 ? '\n통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
