// 제출 받기 작업(submit.file / submit.document / submit.physical) 회귀 — 2026-10-01 신설.
//
// 설계: docs/plans/2026-10-01-submission-action-overhaul.md
// 서버 동작 17종은 2026-10-01 운영 DB 롤백 드라이런으로 확인했다(대상 59명 할 일 — 자동 보내기·완료 가드·
// 제출·받음·취소·직접 쓰기 거부·비대상 거부·담당자 추가 시 명단 따라가기·익명 거부·입력 받기 무변화).
// 여기는 화면 쪽 모델·배선과, 조용히 깨지는 마이그레이션 불변식을 정적으로 못 박는다.
//
// 실행: npx tsx --tsconfig tsconfig.app.json scripts/submit-action-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildSubmitRows, defaultSubmitConfig, isSubmitActionType, parseSubmitConfig, serializeSubmitConfig,
  submitProgress, validateSubmitConfig, type SubmissionRow,
} from '../../src/lib/submitAction';
import {
  AUDIENCE_CRITERION_ORDER, describeAudienceRule, isTaskAssigneesOnly, parseAudienceRule, TASK_SCOPED_CRITERIA,
} from '../../src/lib/audienceRule';
import { TASK_ACTION_CATEGORY_ORDER, getTaskActionDefinition } from '../../src/features/task-workflow/actionRegistry';
import { affordanceForUse } from '../../src/features/task-workflow/utils/actionPanelMode';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};
const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

console.log('① 설정 모델');
{
  const d = defaultSubmitConfig('submit.file');
  check('기본 대상 = 이 할 일의 담당자뿐', isTaskAssigneesOnly(d.audience));
  check('비어 있는 저장값 → 기본값', parseSubmitConfig('submit.file', {}).audience.include[0]?.type === 'task_assignees');
  check('config 전체를 받아도 submit 키를 읽는다',
    parseSubmitConfig('submit.physical', { submit: { guide: '원본 제출', forms: [{ id: 'g', name: 'a', url: 'https://x' }] } }).forms.length === 1);
  check('URL 없는 양식은 버린다', parseSubmitConfig('submit.physical', { submit: { forms: [{ id: 'g' }] } }).forms.length === 0);
  check('양식 문서는 양식이 있어야', validateSubmitConfig('submit.document', defaultSubmitConfig('submit.document')) === '양식을 고르세요.');
  check('파일은 기본값으로 바로 유효', validateSubmitConfig('submit.file', d) === null);
  check('대상이 비면 막힌다', validateSubmitConfig('submit.file', { ...d, audience: { include: [], exclude: [] } }) !== null);
  const fileJson = serializeSubmitConfig('submit.file', { ...d, template: { id: 't' }, forms: [{ id: 'g', name: 'a', url: 'u', size: 1, type: '', uploaded_at: '', uploaded_by: '' }] });
  check('종류에 없는 칸은 싣지 않는다', !('template' in fileJson) && !('forms' in fileJson));
  check('제출 유형 판정', isSubmitActionType('submit.document') && !isSubmitActionType('collect.input'));
}

console.log('② 사람별 현황');
{
  const targets = [
    { id: 't1', resource_id: 'a', name: '가', reasons: ['할 일 담당자'], removed: false },
    { id: 't2', resource_id: 'b', name: '나', reasons: [], removed: false },
    { id: 't3', resource_id: 'c', name: '다', reasons: [], removed: true },
    { id: 't4', resource_id: null, name: '라', reasons: [], removed: false },
  ];
  const sub = (rid: string, at: string): SubmissionRow => ({
    id: rid + at, resource_id: rid, name: null, kind: 'file', file_name: 'f', file_url: 'u', google_drive_id: null,
    mime_type: null, file_size: null, document_id: null, document_title: null, received_at: null, created_at: at, updated_at: at,
  });
  const rows = buildSubmitRows(targets, [sub('a', '2026-10-01T01:00'), sub('a', '2026-10-01T03:00')]);
  check('낸 사람은 done, 마지막 시각', rows.find((r) => r.target.id === 't1')?.done === true && rows.find((r) => r.target.id === 't1')?.lastAt === '2026-10-01T03:00');
  check('안 낸 사람이 먼저, 빠진 사람은 맨 아래', rows[0].target.done === undefined && !rows[0].done && rows[rows.length - 1].target.removed);
  const p = submitProgress(rows);
  check('진척 모수에서 빠진 사람·미연결 제외', p.total === 2 && p.done === 1 && p.pending.join() === '나');
}

console.log('③ 대상 조건 «이 할 일의 담당자»');
{
  check('조건 목록에 있다(맨 앞)', AUDIENCE_CRITERION_ORDER[0] === 'task_assignees');
  check('할 일 맥락 조건으로 분류', TASK_SCOPED_CRITERIA.includes('task_assignees'));
  check('저장값에서 살아남는다(모르는 조건은 버리는 파서)', parseAudienceRule({ include: [{ type: 'task_assignees' }] }).include.length === 1);
  check('요약 문구', describeAudienceRule({ include: [{ type: 'task_assignees' }], exclude: [] }) === '이 할 일의 담당자');
  check('담당자뿐 판정 — 다른 조건이 섞이면 아님',
    !isTaskAssigneesOnly({ include: [{ type: 'task_assignees' }, { type: 'homeroom', grades: [1] }], exclude: [] }));
  const builder = read('src/components/audience/AudienceRuleBuilder.tsx');
  // 2026-10-06: 메시지 보내기도 서버가 할 일로 푼다(send_task_message → expand_task_audience, 20261006100000)
  //   — 켜는 곳은 서버가 펼치는 작업뿐이어야 한다(안 펼치는 곳에서 켜면 그 조건이 조용히 0명이 된다)
  check('편집기는 켠 곳에서만 고르게 한다(켠 곳 = 서버가 할 일로 푸는 작업)',
    /allowTaskScoped \|\| !TASK_SCOPED_CRITERIA\.includes\(t\)/.test(builder)
    && /allowTaskScoped/.test(read('src/features/task-workflow/components/message/MessageSendRunner.tsx'))
    && read('supabase/migrations/20261006100000_task_message_task_assignees.sql').includes('expand_task_audience'));
  check('미리보기는 할 일 맥락으로 푼다', /resolve_task_audience/.test(read('src/features/task-workflow/services/collectInputService.ts'))
    && /useAudiencePreview\(draft\.audience, 'person', !started, board\.action\.task_id\)/.test(read('src/features/task-workflow/components/submit/SubmitActionRunner.tsx')));
}

console.log('④ 등록·배선');
{
  check('범주 순서에 submit(입력 받기 다음)', TASK_ACTION_CATEGORY_ORDER.join() .includes('collect,submit,message'));
  for (const t of ['submit.file', 'submit.document', 'submit.physical'] as const) {
    const d = getTaskActionDefinition(t);
    check(`${t} 등록(runner·multiple·submit 범주)`, d?.kind === 'runner' && d?.multiple === true && d?.category === 'submit');
  }
  const panel = read('src/features/task-workflow/components/TaskActionPanel.tsx');
  check('러너 분기', /isSubmitActionType\(action\.action_type\) \? \(\s*<SubmitActionRunner/.test(panel));
  check('실행 이력 서랍을 감춘다(제출물은 RUN 이 아니다)', /\|\| isSubmitActionType\(action\.action_type\);/.test(panel));
  const def = getTaskActionDefinition('submit.file');
  const action = { action_type: 'submit.file', created_by: 'me' } as never;
  check('대상 → 제출하기', affordanceForUse(action, def, { userId: 'x', canUseDefinition: true, collectTarget: true }).kind === 'run');
  check('만든 사람 → 현황 보기', (affordanceForUse(action, def, { userId: 'me', canUseDefinition: true }) as { label?: string }).label === '제출 현황 보기');
  check('그 밖 → 대상 아님', affordanceForUse(action, def, { userId: 'x', canUseDefinition: true }).kind === 'none');
  const spec = read('src/features/task-workflow/components/SpecFillActionRunner.tsx');
  check('양식 작성 러너가 호스트의 제출 함수를 쓴다', /if \(submission\.submit\) await submission\.submit\(saved\.id\);/.test(spec));
  const respond = read('src/features/task-workflow/components/submit/SubmitRespondPanel.tsx');
  check('양식은 defaultTemplate 자리로 넘긴다(문서의 action_id = 이 작업)', /defaultTemplate: cfg\.template/.test(respond));
  check('실물 대상자 화면에는 누를 것이 없다', !/useMarkActionReceived/.test(respond));
}

console.log('⑤ 서버 불변식(마이그레이션 정적 검사)');
{
  const sql = read('supabase/migrations/20261001180000_submission_actions.sql');
  check('완료 가드 = task 의 BEFORE UPDATE 트리거(상태·단위·직접 쓰기 한 곳)',
    /create trigger guard_submission_completion before update of meta on public\.task/.test(sql));
  check('가드 판정은 «열린» 요청 · 빠지지 않은 대상만',
    /q\.kind <> 'input' and q\.status = 'open'/.test(sql) && /t\.removed_at is null and t\.resource_id = p_resource_id/.test(sql));
  check('제출물 표 직접 쓰기 회수', /revoke insert, update, delete, truncate on public\.action_submission from anon, authenticated/.test(sql));
  check('내부 함수는 authenticated 에도 닫힘',
    ['_start_action_request', '_sync_action_targets', 'submission_sync_assignee', 'expand_task_audience']
      .every((f) => new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated`).test(sql)));
  check('담당자 변경을 따라가는 트리거', /create trigger follow_task_assignees_in_requests after update of meta on public\.task/.test(sql));
  // 2026-10-01 사용자 결정: 연결·저장만으로는 보내지 않는다 — 자동 보내기 트리거를 없앴다(D1 되돌림)
  const manual = read('supabase/migrations/20261001210000_submission_manual_send.sql');
  check('자동 보내기 트리거를 없앤다', /drop trigger if exists auto_start_submission_request on public\.task_action/.test(manual)
    && /drop function if exists public\.auto_start_submission_request\(\)/.test(manual));
  check('입력 받기 경로는 종전 잠금을 유지', /요청을 보낸 뒤에는 줄 단위·응답 방식·공개 방식을 바꿀 수 없습니다/.test(sql));
  check('양식 문서 검증은 문서의 action_id(옛 workId 아님)', /v_doc\.action_id is distinct from p_action_id/.test(sql) && !/'workId'/.test(sql));
}

console.log('⑥ 과제 단위별 제출 (2026-10-01 «단위별 제출 지원»)');
{
  const { heldUnits, unclaimedUnits } = await import('../../src/lib/submitAction');
  const units = [{ key: 'u1', label: '국어' }, { key: 'u2', label: '수학' }, { key: 'u3', label: '영어' }];
  const progress = { u1: { a: { status: 'pending' } }, u2: { a: { status: 'completed' }, b: { status: 'pending' } }, u3: {} };
  check('맡은 단위 = unitProgress 항목 존재', heldUnits(units, progress, 'a').map((u) => u.key).join() === 'u1,u2');
  check('아무도 안 맡은 단위', unclaimedUnits(units, progress).map((u) => u.key).join() === 'u3');
  const sub = (unit: string) => ({
    id: unit, resource_id: 'a', name: null, kind: 'file' as const, file_name: 'f', file_url: 'u', google_drive_id: null,
    mime_type: null, file_size: null, document_id: null, document_title: null, received_at: null, unit_key: unit,
    created_at: '2026-10-01', updated_at: '2026-10-01',
  });
  const targets = [
    { id: 't1', resource_id: 'a', name: '가', reasons: [], removed: false },
    { id: 't2', resource_id: 'c', name: '다', reasons: [], removed: false },
  ];
  const half = buildSubmitRows(targets, [sub('u1')], { units, progress });
  check('맡은 단위를 다 내야 done', half.find((r) => r.target.id === 't1')?.done === false
    && half.find((r) => r.target.id === 't1')?.units?.filter((u) => u.done).length === 1);
  const full = buildSubmitRows(targets, [sub('u1'), sub('u2')], { units, progress });
  check('다 내면 done', full.find((r) => r.target.id === 't1')?.done === true);
  check('맡은 단위가 없으면 done 아님(낼 것이 없다)', full.find((r) => r.target.id === 't2')?.done === false
    && full.find((r) => r.target.id === 't2')?.units?.length === 0);

  const sql = read('supabase/migrations/20261001190000_submission_units.sql');
  check('단위 할 일이면 축 unit 으로 보낸다', /when public\.task_has_units\(v_action\.task_id\) then 'unit'/.test(sql));
  check('대상은 언제나 사람으로 푼다(resolve_audience 는 unit 축을 모른다)', (sql.match(/case when v_(req\.)?axis = 'unit' then 'person'/g) ?? []).length === 2);
  check('단위 완료 가드(unitProgress 를 본다)', /단위 완료: unitProgress\[unit\]\[person\]\.status/.test(sql) && /unit_has_pending_submission\(new\.id/.test(sql));
  check('한 단위에 요청이 여럿이면 다 낸 뒤에만 완료(P6 드라이런 버그)', /if not public\.unit_has_pending_submission\(p_req\.task_id, p_resource_id, p_unit_key\) then/.test(sql));
  check('단위 할 일의 다시 맞추기는 단위로(담당자 상태 함수는 단위 할 일을 거부한다 — P6 드라이런 버그)',
    /if public\.task_has_units\(p_task_id\) then[\s\S]{0,900}set_task_unit_status\(p_task_id, v_unit\.unit_key, v_unit\.person::uuid, 'pending'\)/.test(sql));
  const respond = read('src/features/task-workflow/components/submit/SubmitRespondPanel.tsx');
  check('대상자 화면에 단위 고르기', /<UnitPicker choice=\{choice\}/.test(respond) && /unitKey: choice\.unitKey/.test(respond));
}

console.log('\n⑧ 드라이브 업로드 (2026-10-01 «양식을 올리지 못했습니다»)');
{
  const drive = read('src/services/googleDriveServiceNew.ts');
  const body = (name: string) => drive.slice(drive.indexOf(`public async ${name}(`), drive.indexOf(`public async ${name}(`) + 1600);
  // 폴더·권한은 gapi 클라이언트를 쓴다 — 호출부가 initialize() 를 잊어도 업로드가 스스로 준비해야 한다
  check('uploadFile 이 스스로 gapi 를 준비한다', /await this\.initialize\(\);/.test(body('uploadFile')));
  check('createNewFile 도 스스로 준비한다', /await this\.initialize\(\);/.test(body('createNewFile')));
  check('동시 초기화는 같은 약속을 기다린다', /this\.initPromise = this\.doInitialize\(\)/.test(drive));
  check('미리 확인은 토큰 «유효성»까지 본다', /public async hasValidToken\(\)[\s\S]{0,200}getValidGoogleToken\(\)/.test(drive));

  const runner = read('src/features/task-workflow/components/submit/SubmitActionRunner.tsx');
  check('실패 이유를 말한다(파일 이름만 말하지 않는다)', /failure = `양식을 올리지 못했습니다\([^`]*\) — \$\{driveErrorText\(reason\)\}`/.test(runner));
  check('양식이 안 올라가면 요청을 보내지 않는다',
    /const \{ failure, notice \} = await persist\(\);[\s\S]{0,120}if \(failure\) \{[\s\S]{0,200}요청은 보내지 않았습니다[\s\S]{0,40}return;\s*\}\s*const result = await start\.mutateAsync/.test(runner));
  check('설정 화면에 [드라이브 연결] 경로', /driveReturnPath=\{/.test(runner));
  const field = read('src/components/tasks/PhysicalFormFilesField.tsx');
  check('양식 칸이 유효성으로 미리 확인 + 연결 버튼', /hasValidToken\(\)/.test(field) && /<DriveConnectButton[\s\S]{0,120}returnPath=\{driveReturnPath\}/.test(field));
  check('대상자 파일 제출도 유효성으로 미리 확인', /getGoogleDriveService\(\)\.hasValidToken\(\)/.test(read('src/features/task-workflow/components/submit/SubmitRespondPanel.tsx')));
}

console.log('\n⑨ 보내기는 버튼으로만 · 뺀 양식은 드라이브에서도 (2026-10-01)');
{
  const runner = read('src/features/task-workflow/components/submit/SubmitActionRunner.tsx');
  check('보내기 전이면 언제나 [요청 보내기]', /\{!started && \(\s*<Button[\s\S]{0,300}요청 보내기/.test(runner) && !/assigneesOnly/.test(runner));
  check('저장만으로는 알림이 가지 않는다고 말한다', /\[요청 보내기\]를 눌러야 대상자에게 알림이 갑니다/.test(runner));
  check('뺀 양식은 설정 저장 «뒤에» 지운다',
    /await save\.mutateAsync\([\s\S]{0,600}deleteUnusedFormFiles\(action\.id, removed\)/.test(runner));

  const svc = read('src/features/task-workflow/services/submitActionService.ts');
  check('다른 작업이 같은 파일을 쓰면 남긴다', /\.neq\('id', actionId\)\s*\.contains\('config', \{ submit: \{ forms: \[\{ googleDriveId: driveId \}\] \} \}\)/.test(svc));
  check('옛 설정이 가리키는 파일도 남긴다', /\.contains\('meta', \{ submission: \{ forms: \[\{ googleDriveId: driveId \}\] \} \}\)/.test(svc));
  check('공유 여부를 모르면 지우지 않는다', /if \(actionError \|\| taskError\) \{[\s\S]{0,160}continue;/.test(svc));

  const drive = read('src/services/googleDriveServiceNew.ts');
  const delBody = drive.slice(drive.indexOf('public async deleteFileAndCleanupFolders('), drive.indexOf('private async cleanupEmptyFoldersUpward('));
  check('드라이브 삭제도 스스로 준비한다(없으면 아무것도 안 지우고 성공처럼 끝났다)', /await this\.initialize\(\);/.test(delBody));
  check('«이미 없음»은 404 일 때만', /if \(status === 404\) \{[\s\S]{0,120}return;\s*\}\s*throw error;/.test(delBody));
}

console.log(fails === 0 ? '\n모두 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
