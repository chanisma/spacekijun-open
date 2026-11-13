// 업무 흐름 복사 회귀 — 2026-09-23 신설.
//
// 못 박는 것:
//  ① 업무 노드와 함께 선택되는 노드 = **그래프의 선**으로 이어진 노드(방향 무관, 선 종류 무관).
//     종전엔 containerNodeId(업무를 올릴 때 자동 생성된 노드의 표시)만 봐서 직접 연결한 노드가 빠졌다.
//  ② 다른 업무 노드, 다른 업무에 포함된 노드에서 멈춘다.
//  ③ 서버는 보낸 제외 목록만 본다(containerNodeId 로 한 번 더 거르지 않는다) — 기준이 둘이면 어긋난다.
//  ④ 서버가 작업(Action)을 복사하고, 할 일 meta 의 작업 id(submission.actionId·actionFlow)를 새 id 로 바꾼다.
//
// 실행: npx tsx scripts/workflow-copy-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectAttachedNodeIds, toggleCopyExcluded } from '../../src/features/task-workflow/utils/workflowCopy';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};
const n = (id: string, kind: string, metadata: Record<string, unknown> = {}) => ({ id, data: { kind, metadata } });
const e = (source: string, target: string, relationType = 'flow') => ({ source, target, data: { relationType } });

// A 업무: 자동 생성 할 일 a1(containerNodeId), 직접 추가·연결한 a2(흐름), 거꾸로 그은 a3, 메모 m
// B 업무: 포함 선으로 b1. A→B 흐름, a2→b1 인계, 어디에도 안 이어진 x
const nodes = [
  n('A', 'event'), n('a1', 'task', { containerNodeId: 'A' }), n('a2', 'task'), n('a3', 'task'), n('m', 'note'),
  n('B', 'event'), n('b1', 'task'), n('x', 'task'),
];
const edges = [
  e('A', 'a1', 'contains'), e('a1', 'a2'), e('a3', 'A', 'related'), e('a2', 'm'),
  e('A', 'B'), e('B', 'b1', 'contains'), e('a2', 'b1', 'handoff'),
];
const set = (ids: string[]) => [...ids].sort().join(',');

console.log('① 선으로 이어진 노드');
const fromA = collectAttachedNodeIds('A', nodes, edges);
check('자동 생성·직접 연결·거꾸로 그은 선·메모까지', set(fromA) === 'a1,a2,a3,m', set(fromA));
check('안 이어진 노드는 따라오지 않는다', !fromA.includes('x'));

console.log('② 멈추는 곳');
check('다른 업무 노드에서 멈춘다(A→B 흐름)', !fromA.includes('B'));
check('다른 업무에 포함된 노드는 인계 선이 있어도 넘어가지 않는다', !fromA.includes('b1'));
check('B 는 자기 할 일만', set(collectAttachedNodeIds('B', nodes, edges)) === 'b1');
check('업무가 아닌 노드는 딸린 것이 없다', collectAttachedNodeIds('a1', nodes, edges).length === 0);
// 인계 선 하나만으로 이어진, 주인 없는 할 일은 그 업무의 것이 된다(업무 사이 선은 마지막에만)
const nodes2 = [n('A', 'event'), n('a1', 'task', { containerNodeId: 'A' }), n('y', 'task')];
const edges2 = [e('A', 'a1', 'contains'), e('a1', 'y', 'handoff')];
check('업무 안의 선이 없으면 인계·연관 선으로 잇는다', set(collectAttachedNodeIds('A', nodes2, edges2)) === 'a1,y');
// 두 업무 사이에 낀 할 일 — 흐름 선(업무 안)이 인계 선(업무 사이)을 이긴다
const nodes3 = [n('A', 'event'), n('B', 'event'), n('z', 'task')];
const edges3 = [e('A', 'z', 'flow'), e('B', 'z', 'handoff')];
check('흐름 선이 인계 선보다 먼저 소속을 정한다', set(collectAttachedNodeIds('A', nodes3, edges3)) === 'z' && collectAttachedNodeIds('B', nodes3, edges3).length === 0);

console.log('③ 토글');
const off = toggleCopyExcluded(new Set(), 'A', nodes, edges);
check('업무를 빼면 딸린 노드가 함께 빠진다', set([...off]) === 'A,a1,a2,a3,m');
const back = toggleCopyExcluded(off, 'A', nodes, edges);
check('다시 넣으면 함께 돌아온다(대칭)', back.size === 0);
const onlyTask = toggleCopyExcluded(off, 'a2', nodes, edges);
check('업무를 뺀 뒤 할 일 하나만 다시 넣을 수 있다', !onlyTask.has('a2') && onlyTask.has('A'));

console.log('④ 배선(정적)');
const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
const canvas = read('src/features/task-workflow/components/WorkflowCanvas.tsx');
check('캔버스가 선 기준 토글을 쓴다', canvas.includes('toggleCopyExcluded(prev, nodeId, nodes, edges)'));
check("캔버스에 containerNodeId 만 보는 복사 연쇄가 남아 있지 않다", !/copyExcluded[\s\S]{0,400}containerNodeId === nodeId/.test(canvas));
const sql = read('supabase/migrations/20260923140000_copy_task_workflow_actions.sql');
check('서버가 containerNodeId 로 한 번 더 거르지 않는다', !/DELETE FROM tmp_nodes/.test(sql));
check('서버가 작업을 복사한다(작성자 = 복사자)', /INSERT INTO public\.task_action[\s\S]*?auth\.uid\(\)/.test(sql));
check('실행 이력(RUN)은 복사하지 않는다', !/INSERT INTO public\.task_action_run/.test(sql));
check('submission.actionId 를 새 id 로 바꾼다', sql.includes("'{submission,actionId}'"));
check('actionFlow 를 새 id 로 바꾼다', sql.includes("'{actionFlow}'"));
check('한 개 유형 중복은 값 제출 연결을 우선해 하나만', /DISTINCT ON \(a\.task_id, a\.action_type\)[\s\S]*?origin' = 'submission'\) DESC/.test(sql));
check('여러 개 유형은 instance_key 를 새로', sql.includes("CASE WHEN a.instance_key = '' THEN '' ELSE gen_random_uuid()::text END"));

console.log(fails === 0 ? '\n통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
