// 확인 없는 동작 회귀 (2026-10-05, 감사 문서 docs/plans/2026-10-05-task-ux-audit.md §4-8).
//
// 못 박는 것:
//  ① 작업 연결 해제 — 무엇이 사라지는지가 유형마다 다르고, 요청·메시지 작업은 이력이 없어도 묻는다.
//     (종전엔 «실행 이력이 있을 때만» 물어, 요청을 보낸 입력·제출 작업이 확인 없이 풀렸다)
//  ② 업무 완료 — 끝나지 않은 할 일이 있을 때만 묻는다(완료하면 담당자들의 내 할 일에서 내려간다).
//  ③ 제출 취소 — 드라이브 파일까지 지우므로 묻는다(본인·책임자 두 자리).
//  ④ [완료하기] — 확인창 대신 되돌리기 토스트.
//
// 실행: npx tsx --tsconfig tsconfig.app.json scripts/task-confirm-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { disconnectEffect } from '../../src/features/task-workflow/utils/disconnectEffect';
import { workCompleteConfirmMessage } from '../../src/lib/taskStatus';
import { withdrawSubmissionConfirmMessage } from '../../src/lib/submitAction';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};
const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

console.log('① 작업 연결 해제');
for (const type of ['collect.input', 'submit.file', 'submit.document', 'submit.physical']) {
  const e = disconnectEffect(type, false);
  check(`${type} — 이력이 없어도 묻는다 · 요청 마감을 말한다`, e.confirm && e.message.includes('마감'));
}
check('메시지 보내기 — 발송 기록이 지워진다고 말한다', disconnectEffect('message.send', false).confirm && disconnectEffect('message.send', false).message.includes('메시지 기록'));
check('그 밖 — 이력이 있으면 묻는다', disconnectEffect('document.spec_fill', true).confirm);
check('그 밖 — 이력이 없으면 묻지 않는다', !disconnectEffect('document.spec_fill', false).confirm);
const panel = read('src/features/task-workflow/components/TaskActionPanel.tsx');
check('패널 해제가 disconnectEffect 로 묻는다', /const effect = disconnectEffect\(action\.action_type, ranWorkIds\.has\(action\.id\)\);\s*if \(effect\.confirm && !window\.confirm/.test(panel));
check('패널 버튼 설명도 같은 문구(모두에게 «결과 파일 포함»이 아니다)', panel.includes('deleteLabel={`연결 해제 — ${disconnectEffect(') && !panel.includes("'연결 해제(실행·검수 이력과 결과 파일 포함)'"));
check('편집 창의 해제 줄도 같은 문구', read('src/components/tasks/TaskActionsSection.tsx').includes('disconnectEffect(action.action_type, true).message'));

console.log('② 업무 완료');
const open = { status: 'pending', meta: { assignees: [{ id: 'a', status: 'completed' }, { id: 'b', status: 'pending' }] } };
const doneByAll = { status: 'pending', meta: { assignees: [{ id: 'a', status: 'completed' }] } };
const closed = { status: 'cancelled', meta: { assignees: [{ id: 'a', status: 'pending' }] } };
check('끝나지 않은 할 일이 없으면 묻지 않는다', workCompleteConfirmMessage('W', [doneByAll, closed]) === null);
check('남은 할 일 수를 센다', workCompleteConfirmMessage('W', [open, doneByAll, closed])?.includes('1개') === true);
check('담당자 없는 진행 중 할 일도 남은 것으로 센다', workCompleteConfirmMessage('W', [{ status: 'pending', meta: {} }]) !== null);
for (const p of ['src/components/tasks/IntegratedTaskView.tsx', 'src/components/tasks/WorkDetailDialog.tsx']) {
  check(`${p.split('/').pop()} 가 완료 전에 묻는다`, /workCompleteConfirmMessage\([^)]*\);\s*if \(message && !window\.confirm\(message\)\) return;/.test(read(p)));
}

console.log('③ 제출 취소');
check('본인 문구', withdrawSubmissionConfirmMessage('a.hwpx').startsWith('"a.hwpx" 제출을 취소할까요?'));
check('책임자 문구는 누구의 것인지 말한다', withdrawSubmissionConfirmMessage('a.hwpx', '홍길동').includes('홍길동 님의'));
check('드라이브 파일도 지워진다고 말한다', withdrawSubmissionConfirmMessage(null).includes('드라이브'));
for (const p of ['src/features/task-workflow/components/submit/SubmitRespondPanel.tsx', 'src/features/task-workflow/components/submit/SubmitActionRunner.tsx']) {
  const src = read(p);
  check(`${p.split('/').pop()} — 지우기 전에 묻는다`, /if \(!window\.confirm\(withdrawSubmissionConfirmMessage\([^)]*\)\)\) return;\s*remove\.mutate\(/.test(src)
    && !/onClick=\{\(\) => remove\.mutate\(/.test(src));
}

console.log('④ [완료하기] 되돌리기');
const inbox = read('src/components/tasks/MyTaskInbox.tsx');
check('완료 토스트에 되돌리기가 있다', /label: '되돌리기'[\s\S]{0,200}status: 'pending'/.test(inbox));
check('[완료하기]가 되돌리기 경로를 탄다', inbox.includes(': void completeWithUndo()}'));

console.log(fails === 0 ? '\n통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
