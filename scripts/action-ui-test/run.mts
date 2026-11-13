// 작업 화면 UI 정리 회귀 (2026-10-06 — 앱 밖에서 처리·입력 받기·제출 받기·메시지 보내기 검토).
// 되살아나도 빌드·타입 검사는 통과하는 부류라 정적 검사 + 순수 함수로 못 박는다.
//
// 실행: npx tsx --tsconfig tsconfig.app.json --import ./scripts/css-stub.mjs scripts/action-ui-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { presetUrlAfterSwitch } from '../../src/lib/externalScreens';
import { collectAnswerModeLabel, collectRowProgress, pendingBreakdown, COLLECT_MODE_LABEL } from '../../src/lib/collectInput';
import { SUBMIT_STATE_LABEL } from '../../src/lib/submitAction';
import { affordanceForUse } from '../../src/features/task-workflow/utils/actionPanelMode';
import { getTaskActionDefinition } from '../../src/features/task-workflow/actionRegistry';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};
const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

console.log('① 앱 밖에서 처리');
check('주소 없는 칩으로 바꾸면 앞 칩의 기본 주소를 지운다', presetUrlAfterSwitch('K-에듀파인', 'https://klef.go.kr', '') === '');
check('사람이 직접 적은 주소는 지킨다', presetUrlAfterSwitch('K-에듀파인', 'https://my.example.kr', '') === 'https://my.example.kr');
check('새 칩에 주소가 있으면 그것', presetUrlAfterSwitch('기타', 'https://a.kr', 'https://b.kr') === 'https://b.kr');
const ext = read('src/features/task-workflow/components/ExternalScreenActionRunner.tsx');
check('외부 시스템에 «처리 완료 기록» 칸이 없다(아무도 못 보는 기록)', !ext.includes('<ManualCompletionRecord'));
check('외부 시스템은 자동 저장 + 저장 상태', ext.includes('window.setTimeout(() => void handleSave(draft), 1000)') && ext.includes('<SaveStatus'));
const neis = read('src/features/task-workflow/components/NeisScreenActionRunner.tsx');
check('NEIS 안내에 [안내 저장] 버튼이 없다(자동 저장)', !/>\s*안내 저장\s*</.test(neis) && neis.includes('onBlur={commitNote}'));
const panel = read('src/features/task-workflow/components/TaskActionPanel.tsx');
check('앱 밖 작업은 보통 크기 창 + 보이는 제목', panel.includes("compact ? 'max-h-[85vh] w-[96vw] max-w-2xl'") && panel.includes('{compact ? ('));
check('아이콘은 유형으로(외부 시스템 = 지구본)', panel.includes("if (type === 'external.screen') return { Icon: Globe"));

console.log('② 공통 — 저장 안 한 변경 · 책임자 판정');
check('작업 창이 닫기 전에 묻는다', panel.includes('unsaved.unsavedMessage()') && panel.includes('<RunnerUnsavedProvider'));
for (const p of [
  'src/features/task-workflow/components/collect/CollectInputRunner.tsx',
  'src/features/task-workflow/components/submit/SubmitActionRunner.tsx',
  'src/features/task-workflow/components/submit/SubmitRespondPanel.tsx',
  'src/features/task-workflow/components/message/MessageSendRunner.tsx',
]) check(`${p.split('/').pop()} 가 저장 안 한 변경을 알린다`, read(p).includes('useRunnerUnsaved('));
check('응답 창도 닫기 전에 묻는다', read('src/features/task-workflow/components/collect/CollectRespondDialog.tsx').includes('unsaved.unsavedMessage()'));
const msgDef = getTaskActionDefinition('message.send');
const msgAction = { action_type: 'message.send', created_by: 'creator' } as never;
check('공동 책임자도 메시지를 쓸 수 있다', affordanceForUse(msgAction, msgDef ?? null, { userId: 'other', canUseDefinition: true, canManage: true }).kind === 'run');
check('책임자가 아니면 막힌다', affordanceForUse(msgAction, msgDef ?? null, { userId: 'other', canUseDefinition: true, canManage: false }).kind === 'none');
const subDef = getTaskActionDefinition('submit.file');
check('제출 요청의 대상은 제출할 수 있다', affordanceForUse({ action_type: 'submit.file', created_by: 'x' } as never, subDef ?? null, { userId: 'me', canUseDefinition: true, collectTarget: true }).kind === 'run');
check('사용 보기가 제출 요청의 대상도 판정한다', panel.includes("const isRequest = action.action_type === 'collect.input' || isSubmitActionType(action.action_type);"));

console.log('③ 입력 받기');
check('학급 축이면 «학급당 한 번»', collectAnswerModeLabel('shared', 'class').title === '학급당 한 번' && collectAnswerModeLabel('shared', 'subject').title === '과목당 한 번');
check('공개 방식 이름 = 누가 보나', COLLECT_MODE_LABEL.private.title === '요청한 사람만 봄' && COLLECT_MODE_LABEL.shared.respondent.includes('대상자 모두'));
const cell = (complete: boolean) => ({ dimensionKey: '', values: {}, complete }) as never;
check('일부 입력은 n/m(파랑)', JSON.stringify(collectRowProgress({ complete: false, cells: [cell(true), cell(false)] })) === JSON.stringify({ label: '1/2', tone: 'partial' }));
check('하나뿐인 칸이 비면 미완료', collectRowProgress({ complete: false, cells: [cell(false)] }).tone === 'todo');
const breakdown = pendingBreakdown({
  rows: [
    { removed: false, unlinked: false, complete: false, cells: [cell(true), cell(false)], people: [{ resourceId: 'a', name: '갑', reasons: [] }] },
    { removed: false, unlinked: false, complete: false, cells: [cell(false), cell(false)], people: [{ resourceId: 'b', name: '을', reasons: [] }] },
  ],
} as never);
check('미완료를 «일부 입력 / 미입력»으로 가른다', breakdown.partial.join() === '갑' && breakdown.untouched.join() === '을');
const runner = read('src/features/task-workflow/components/collect/CollectInputRunner.tsx');
check('[입력 닫기]에 확인', runner.includes("'입력 닫기'") && runner.includes('입력을 닫을까요?'));
check('설정은 탭을 옮겨도 내리지 않는다', runner.includes("tab === 'settings' || !started ? undefined : 'hidden'"));
check('[요청 보내기] 꺼진 이유', runner.includes('const sendBlockedReason'));
check('기한의 뜻이 툴팁이 아니라 글로', read('src/features/task-workflow/components/collect/CollectConfigEditor.tsx').includes('기한은 알림·목록에 보이기만 합니다'));
check('응답자 진행 = 칸', read('src/features/task-workflow/components/collect/CollectRespondPanel.tsx').includes('입력 {myCellsDone}/{myCells.length}칸'));

console.log('④ 제출 받기');
check('실물 상태 낱말 = 받음/받기 전/아직 안 받은', SUBMIT_STATE_LABEL.physical.pendingPeople === '아직 안 받은' && SUBMIT_STATE_LABEL.file.pendingPeople === '안 낸');
const submit = read('src/features/task-workflow/components/submit/SubmitActionRunner.tsx');
check('[요청 닫기]·[다시 열기]에 결과 확인', submit.includes('제출 요청을 닫을까요?') && submit.includes('제출 요청을 다시 열까요?'));
check('실물 «모두 받음»', submit.includes('function BulkReceive'));
check('실물 [받음]은 테두리 버튼(파란 주 버튼이 줄마다 늘어서지 않게)', !/size="sm" className="h-8 gap-1 bg-blue-600 px-3 text-xs text-white hover:bg-blue-700"\s*disabled=\{mark\.isPending \|\| !open\}/.test(submit));
const respond = read('src/features/task-workflow/components/submit/SubmitRespondPanel.tsx');
check('아무도 안 맡은 단위를 미리 고르지 않는다', respond.includes('if (unitAxis && !unitKey && mine.length > 0) setUnitKey(mine[0].key);'));
check('할 일 상세 = 요청마다 한 줄 · 동사 = requestVerb', read('src/components/tasks/TaskDetailDialog.tsx').includes('{requestVerb(request)}'));

console.log('⑤ 메시지 보내기');
const msg = read('src/features/task-workflow/components/message/MessageSendRunner.tsx');
check('자동 저장', msg.includes('save.mutate(draft'));
check('다시 보낼 때 경고', msg.includes('같은 사람에게 또 갑니다'));
check('확인창에 받는 사람 이름', msg.includes('받는 사람 <NamePreview names={linkedNames} />'));
check('AI 초안 되돌리기', msg.includes('초안 전의 글로 되돌리기'));
check('보낸 기록은 펼쳐 본다(툴팁 금지)', msg.includes('<details') && !msg.includes('title={s.body}'));

console.log('⑥ 2026-10-06 후속 — 담당자에게 메시지 · 낸 문서 열기');
check('메시지도 «이 할 일의 담당자»를 고른다(미리보기에 할 일 맥락)', msg.includes('allowTaskScoped') && msg.includes("useAudiencePreview(draft.audience, 'person', Boolean(canManage), action.task_id)"));
const mig = read('supabase/migrations/20261006100000_task_message_task_assignees.sql');
check('서버가 보낼 때 담당자 조건을 펼친다(한 줄만 바꾸고 못 찾으면 중단)', mig.includes('public.expand_task_audience(coalesce(v_cfg->') && mig.includes("raise exception '고칠 줄을 찾지 못했습니다"));
check('책임자가 낸 문서를 연다 · 엑셀에 값 열', submit.includes('downloadSubmittedDocument(s.document_id!') && submit.includes('...valueColumns.map((c) => values?.[c.key] ??'));
check('대상자도 낸 문서를 받는다', respond.includes('downloadSubmittedDocument(mine.document_id!'));

console.log(fails === 0 ? '\n통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
