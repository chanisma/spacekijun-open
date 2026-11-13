// 할 일 작업 「입력 받기」 + 대상 규칙 + 업무분장 + 교과 분류 회귀
//   npx tsx scripts/collect-input-test/run.mts
//
// 이 부류는 오류 없이 조용히 틀린다 — 표가 멀쩡히 그려지는데 모수가 틀리거나(0단위 자동 완료),
// 남의 비공개 응답이 보이거나, 다른 학년도 부서 명단이 지워진다. 순수 로직 + 정적 배선으로 못 박는다.
// 서버 쪽 판정(권한·잠금·가시성)은 2026-09-23 드라이런으로 실측했다 — docs/features/collect-input.md.
import { readFileSync } from 'node:fs';
import {
  describeAudienceRule, parseAudienceRule, summarizeResolution, validateAudienceRule,
  type AudienceRow,
} from '../../src/lib/audienceRule';
import {
  buildCollectTable, collectTableToSheet, dimensionsFromLines, isCellComplete, parseCollectConfig,
  collectDueDay, collectDueLabel, pendingCollectRequests, pendingPeople, serializeCollectConfig, validateCollectConfig,
  type CollectBoard, type CollectField, type MyCollectRequest,
} from '../../src/lib/collectInput';
import {
  compareHeadsWithTag, isHolderActive, parseAreasText, referenceDateForYear, type DutySeat,
} from '../../src/lib/dutySeats';
import { GROUP_TO_CLUSTER, MULTI_GROUP_CLUSTERS, SUBJECT_CLUSTERS, SUBJECT_GROUPS } from '../../src/lib/subjectClassification';
import { shortDeptName } from '../../src/features/notice-board/utils/deptShortName';
import { buildNavBadges, EMPTY_NAV_BADGES, navBadgeCount, navBadgeLabel, navBadgeText } from '../../src/lib/navBadges';

let pass = 0;
function ok(cond: boolean, name: string) {
  if (!cond) { console.error('  ✗', name); process.exit(1); }
  console.log('  ✓', name); pass++;
}
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// ── 1. 대상 규칙 ──────────────────────────────────────────────────────────
console.log('대상 규칙');
const rule = parseAudienceRule({
  include: [{ type: 'teaching', grades: [1], subjectGroups: ['수학'] }, { type: 'bogus' }],
  exclude: [{ type: 'people', ids: ['p9'] }],
});
ok(rule.include.length === 1, '모르는 조건 유형은 버린다');
ok(describeAudienceRule(rule, { people: new Map([['p9', '홍길동']]) }) === '1학년 수학 수업 교사 (제외: 직접 지정 · 홍길동)', '한국어 요약');
ok(describeAudienceRule({ include: [], exclude: [] }) === '대상 미지정', '빈 규칙 요약');
ok(validateAudienceRule({ include: [], exclude: [] }) !== null, '조건 없음 거부');
ok(validateAudienceRule({ include: [{ type: 'department', ids: [] }], exclude: [] }) !== null, '빈 부서 조건 거부');
ok(validateAudienceRule({ include: [{ type: 'teaching' }], exclude: [] }) === null, '필터 없는 수업 조건 = 수업하는 교사 전원(허용)');
ok(validateAudienceRule({ include: [{ type: 'homeroom' }], exclude: [{ type: 'tag', ids: [] }] }) !== null, '빈 제외 조건도 거부');

const rows: AudienceRow[] = [
  { resource_id: 'a', name: '강', unit_key: '1|공통수학2', unit_label: '1학년 공통수학2', grade: 1, subject: '공통수학2', class_label: null, reasons: [] },
  { resource_id: 'b', name: '권', unit_key: '1|공통수학2', unit_label: '1학년 공통수학2', grade: 1, subject: '공통수학2', class_label: null, reasons: [] },
  { resource_id: 'c', name: '교감', unit_key: null, unit_label: '', grade: null, subject: null, class_label: null, reasons: ['교감'] },
  { resource_id: null, name: '소혜신', unit_key: 'person', unit_label: '', grade: null, subject: null, class_label: null, reasons: [] },
];
const s = summarizeResolution(rows);
ok(s.people === 2 && s.lines === 3 && s.units === 2, '미리보기 요약: 사람·줄·단위');
ok(s.noUnit.map((r) => r.name).join() === '교감', '수업 없음 = 단위 없고 연결된 사람');
ok(s.unlinked.map((r) => r.name).join() === '소혜신', '미연결 = resource 없는 이름');

// ── 2. 입력 받기 설정 ───────────────────────────────────────────────────────
console.log('입력 받기 설정');
const cfg = parseCollectConfig({ collect: {
  title: ' 점검 ', axis: 'subject', answerMode: 'shared', mode: 'shared',
  dimensions: [{ key: 'e1', label: '1차' }, { key: 'e2', label: '2차' }],
  fields: [{ key: 'ok', label: '점검', type: 'yesno', required: true }, { key: 'm', label: '비고', type: 'text' }, { key: 'x', label: '?', type: 'weird' }],
} });
ok(cfg.fields.length === 2, '모르는 항목 형식은 버린다');
ok(parseCollectConfig({}).fields.length === 1, 'config.collect 없으면 기본 항목 하나');
const ser = serializeCollectConfig({ ...cfg, axis: 'person' });
ok(ser.answerMode === 'each', '사람 축이면 응답 방식은 항상 each(과목당 한 번은 뜻이 없다)');
ok(ser.title === '점검', '제목 앞뒤 공백 제거');
ok(validateCollectConfig({ ...cfg, fields: [] }) !== null, '항목 0개 거부');
ok(validateCollectConfig({ ...cfg, fields: [{ key: 's', label: '상태', type: 'select', options: [' '] }] }) !== null, '보기 없는 고르기 거부');
ok(validateCollectConfig({ ...cfg, dimensions: [{ key: 'a', label: '1차' }, { key: 'b', label: '1차' }] }) !== null, '겹치는 구분 이름 거부');
const dims = dimensionsFromLines('1차 정기시험\n2차 정기시험, 1차 정기시험', [{ key: 'd1', label: '1차 정기시험' }]);
ok(dims.length === 2 && dims[0].key === 'd1' && dims[1].key !== 'd1', '구분 붙여넣기: 중복 제거·기존 키 보존');

// ── 3. 셀 완료 (서버 collect_cell_complete 와 같은 규칙) ─────────────────────
console.log('셀 완료');
const fields: CollectField[] = [{ key: 'ok', label: '점검', type: 'yesno', required: true }, { key: 'm', label: '비고', type: 'text' }];
ok(isCellComplete({ ok: 'no' }, fields), '"아니오"도 답이다(체크박스가 아니라 예/아니오인 이유)');
ok(!isCellComplete({ m: '메모만' }, fields), '필수 항목이 비면 미완료');
ok(isCellComplete({ m: 'x' }, [{ key: 'm', label: '비고', type: 'text' }]), '필수 없으면 하나라도 채우면 완료');
ok(!isCellComplete({}, [{ key: 'm', label: '비고', type: 'text' }]), '필수 없어도 빈 칸은 미완료');

// ── 4. 표 모델 ──────────────────────────────────────────────────────────────
console.log('표 모델');
const baseBoard = (answer: 'each' | 'shared'): CollectBoard => ({
  action: { id: 'A', title: '점검', task_id: 't', created_by: 'u', archived_at: null, task_title: 'T', task_status: 'pending', work_title: 'W' },
  config: { axis: 'subject', answerMode: answer, mode: 'private', dimensions: [{ key: 'e1', label: '1차' }, { key: 'e2', label: '2차' }], fields },
  request: { action_id: 'A', task_id: 't', status: 'open', academic_year: 2026, semester: 2, axis: 'subject', answer_mode: answer, visibility: 'private', started_at: '', closed_at: null, closed_reason: null },
  viewer: { can_manage: true, is_target: false, resource_ids: ['a'] },
  targets: [
    { id: '1', unit_key: '1|수학', unit_label: '1학년 수학', resource_id: 'a', name: '강', reasons: [], removed: false },
    { id: '2', unit_key: '1|수학', unit_label: '1학년 수학', resource_id: 'b', name: '권', reasons: [], removed: false },
    { id: '3', unit_key: '2|수학', unit_label: '2학년 수학', resource_id: null, name: '소혜신', reasons: [], removed: false },
    { id: '4', unit_key: '3|수학', unit_label: '3학년 수학', resource_id: 'c', name: '빠짐', reasons: [], removed: true },
  ],
  responses: [
    { unit_key: '1|수학', dimension_key: 'e1', owner_key: 'a', responder_resource_id: 'a', responder_name: '강', values: { ok: 'yes' }, updated_at: '' },
    { unit_key: '1|수학', dimension_key: 'e2', owner_key: 'a', responder_resource_id: 'a', responder_name: '강', values: { ok: 'no' }, updated_at: '' },
    { unit_key: '1|수학', dimension_key: 'e1', owner_key: '', responder_resource_id: 'b', responder_name: '권', values: { ok: 'yes' }, updated_at: '' },
    { unit_key: '9|없음', dimension_key: 'e1', owner_key: 'z', responder_resource_id: 'z', responder_name: '옛날', values: { ok: 'yes' }, updated_at: '' },
  ],
});
const each = buildCollectTable(baseBoard('each'));
ok(each.rows.length === 4, 'each: 대상 줄마다 한 행(공동 담당은 각자)');
ok(each.rows.find((r) => r.people[0].name === '강')!.complete, '강: 1차·2차 모두 답함 = 완료');
ok(!each.rows.find((r) => r.people[0].name === '권')!.complete, '권: each 에서는 공용(owner_key="") 응답을 자기 것으로 세지 않는다');
ok(each.progress.rows === 2, '진척 모수에서 미연결·명단 밖 줄은 뺀다(0단위·응답 불가 줄이 모수를 흔들지 않게)');
ok(each.progress.completeRows === 1 && each.progress.cells === 4 && each.progress.completeCells === 2, '진척: 줄 1/2 · 칸 2/4');
ok(each.rows.at(-1)!.removed, '명단 밖 줄은 맨 뒤');
ok(each.orphanResponses.length === 2, '대상 줄이 없는 응답은 "명단 밖 응답"(지우지 않는다)');
ok(each.rows.find((r) => r.people[0].name === '강')!.mine && !each.rows.find((r) => r.people[0].name === '권')!.mine, '내 줄 판정 = 내 resource id');
ok(pendingPeople(each).join() === '권', '미완료 사람 = 연결된 사람만(미연결·명단 밖 제외)');

const shared = buildCollectTable(baseBoard('shared'));
const unit1 = shared.rows.find((r) => r.unitKey === '1|수학')!;
ok(unit1.people.length === 2 && unit1.ownerKey === '', 'shared: 단위당 한 행, 공동 담당 전원 표시');
ok(unit1.cells[0].complete && !unit1.cells[1].complete, 'shared: 공용 응답만 센다(1차 완료, 2차 미완료)');
ok(unit1.cells[0].responderName === '권', 'shared: 누가 입력했는지 남는다');
ok(unit1.mine, 'shared: 공동 담당 중 한 명이면 내 줄');

const sheet = collectTableToSheet(each);
ok(sheet[0].join('|') === '단위|대상|구분|점검|비고|완료', '내보내기 머리: 단위·대상·구분·항목·완료');
ok(sheet.length === 1 + 3 * 2, '내보내기: 명단 밖 줄은 빼고 줄×구분');
ok(sheet[1].includes('예') && sheet[2].includes('아니오'), '내보내기: 예/아니오를 사람이 읽는 말로');

// ── 5. 업무분장 ─────────────────────────────────────────────────────────────
console.log('업무분장');
ok(isHolderActive({ start_date: null, end_date: null }, '2026-09-23'), '기간 없음 = 늘 담당(between 이면 조용히 빠진다)');
ok(isHolderActive({ start_date: null, end_date: '2026-09-23' }, '2026-09-23'), '종료일 당일은 담당');
ok(!isHolderActive({ start_date: '2026-09-24', end_date: null }, '2026-09-23'), '시작 전은 아님');
ok(referenceDateForYear(2025, new Date('2026-09-23')) === '2026-02-28', '지난 학년도 기준일 = 학년도 끝(오늘로 보면 모두 공석)');
ok(referenceDateForYear(2027, new Date('2026-09-23')) === '2027-03-01', '다음 학년도 기준일 = 학년도 시작');
ok(parseAreasText('정보공시 | 정보공개및공시운영\n\n개인정보 보호').length === 2, '업무 영역 텍스트 파싱');
const seats = [
  { id: 's1', kind: 'head', name: '정보화부장', holders: [{ resource_id: 'r1', holder_name: '이', start_date: null, end_date: null }] },
  { id: 's2', kind: 'duty', name: '급식', holders: [{ resource_id: 'r2', holder_name: '세', start_date: null, end_date: null }] },
] as unknown as DutySeat[];
const cmp = compareHeadsWithTag(seats, ['r3'], '2026-09-23');
ok(cmp.seatOnly.map((x) => x.resourceId).join() === 'r1' && cmp.tagOnly.join() === 'r3', '부장 자리 ↔ 부장 태그 차이(업무 담당 자리는 비교하지 않는다)');

// ── 6. 교과 분류 · 부서명 ────────────────────────────────────────────────────
console.log('교과 분류 · 부서명');
const sqlGroups = read('supabase/migrations/20260923150000_subject_classification.sql')
  .match(/select array\[([\s\S]*?)\]::text\[\]/)![1].match(/'([^']+)'/g)!.map((x) => x.slice(1, -1));
ok(JSON.stringify(sqlGroups) === JSON.stringify([...SUBJECT_GROUPS]), '교과(군) 10종: SQL ↔ 클라이언트 일치(순서 포함)');
ok(shortDeptName('정보화부') !== shortDeptName('정보과'), '정보화부 탭 이름이 정보과와 겹치지 않는다');

// ── 6-1. 교과 묶음 (2026-09-24) ─────────────────────────────────────────────
console.log('교과 묶음');
const clusterSql = read('supabase/migrations/20260924100000_subject_clusters.sql');
const sqlClusters = clusterSql.match(/subject_cluster_names\(\)[\s\S]*?select array\[([\s\S]*?)\]::text\[\]/)![1]
  .match(/'([^']+)'/g)!.map((x) => x.slice(1, -1));
ok(JSON.stringify(sqlClusters) === JSON.stringify([...SUBJECT_CLUSTERS]), '묶음 7종: SQL ↔ 클라이언트 일치(순서 포함)');
const sqlMap = Object.fromEntries(
  [...clusterSql.matchAll(/when '([^']+)'\s+then '([^']+)'/g)].map((m) => [m[1], m[2]]),
);
ok(SUBJECT_GROUPS.every((g) => sqlMap[g] === GROUP_TO_CLUSTER[g]), '교과(군) → 묶음: SQL ↔ 클라이언트 일치(10종 전부)');
ok(GROUP_TO_CLUSTER['국어'] === '어문학과' && GROUP_TO_CLUSTER['제2외국어/한문'] === '어문학과' && GROUP_TO_CLUSTER['영어'] === '영어', '어문학과 = 국어·제2외국어/한문 (영어는 따로)');
ok(['기술·가정/정보', '체육', '예술', '교양'].every((g) => GROUP_TO_CLUSTER[g as keyof typeof GROUP_TO_CLUSTER] === '예체능'), '예체능 = 기가·정보·체육·예술·교양');
ok(/set cluster_override = '교양'[\s\S]*?where subject_name = '교육학'/.test(clusterSql), '교육학은 예외로 교양에 남긴다(예체능 제외)');
ok(JSON.stringify(MULTI_GROUP_CLUSTERS) === JSON.stringify(['어문학과', '예체능']), '규칙 편집기에 따로 보일 묶음 = 여러 교과(군)를 묶는 것만');
ok(/t\.subject_group = any[\s\S]*?or t\.subject_cluster = any/.test(clusterSql), '교과(군)와 묶음은 같은 차원 — OR');
ok(describeAudienceRule({ include: [{ type: 'teaching', grades: [2], subjectClusters: ['예체능'] }], exclude: [] }) === '2학년 예체능 수업 교사', '묶음 요약');
const builder = read('src/components/audience/AudienceRuleBuilder.tsx');
ok(builder.includes('clusters.includes(r.subject_cluster)'), '규칙 편집기 과목 후보도 묶음을 본다(서버와 같은 OR)');
const adminCls = read('src/components/admin/SubjectClassificationManagement.tsx');
ok(adminCls.includes('Boolean(r.cluster_override)'), '묶음 예외가 있으면 [원본대로](행 삭제)를 막는다 — 예외가 조용히 사라진다');

// ── 7. 정적 배선 ────────────────────────────────────────────────────────────
console.log('정적 배선');
const registry = read('src/features/task-workflow/actionRegistry.ts');
ok(/'collect\.input':\s*\{[\s\S]*?category: 'collect'[\s\S]*?multiple: true/.test(registry), 'collect.input 등록(범주 collect, 여러 개)');
const panel = read('src/features/task-workflow/components/TaskActionPanel.tsx');
ok(panel.includes("action.action_type === 'collect.input' ? (") && panel.includes('<CollectInputRunner'), '러너 분기');
// 범주 순서의 단일 출처는 등록부(TASK_ACTION_CATEGORY_ORDER) — 패널에 사본이 없다(2026-10-01 바로잡음)
ok(/TASK_ACTION_CATEGORY_ORDER[\s\S]{0,120}'neis', 'collect', 'submit', 'message'/.test(read('src/features/task-workflow/actionRegistry.ts')), '연결 창 범주 순서에 collect·submit·message');
const service = read('src/features/task-workflow/services/taskActionService.ts');
ok(/deleteTaskAction[\s\S]*?hasCollectRequest\(actionId\)[\s\S]*?archived_at/.test(service), '보낸 요청이 있는 작업은 지우지 않고 보관');
const nav = read('src/components/notifications/notificationNavigation.ts');
ok(nav.includes("'collect_input_requested'") && nav.includes('/my-tasks?collect='), '알림 → /my-tasks?collect=');
const myTasks = read('src/features/work-ontology/TodayPage.tsx');
// 2026-10-05: 구획은 내 할 일 목록 안으로 — 어떤 요청을 행이 맡는지 알아야 같은 제출을 두 번 그리지 않는다
ok(myTasks.includes("searchParams.get('collect')") && read('src/components/tasks/MyTaskInbox.tsx').includes('<CollectRequestInbox'), '내 할 일: 딥링크 + 「입력 요청」 구획');
const deptDialog = read('src/components/admin/DepartmentMemberDialog.tsx');
ok(deptDialog.includes("rpc('set_department_members'") && !/\.from\('department_member'\)\s*\.delete\(\)/.test(deptDialog), '부서원 저장 = 학년도 RPC(전체 삭제 금지 — 다른 학년도를 지운다)');
const mig = read('supabase/migrations/20260923160000_collect_input.sql');
ok(mig.includes('(p.via_other or p.resource_id is null)'), '수업 조건으로만 들어와 단위가 모두 빠진 사람은 "수업 없음"이 아니라 제외(2026-09-23 드라이런에서 잡힘)');
ok(mig.includes('guard_collect_action_delete') && mig.includes('close_collect_on_task_end'), '삭제 차단·할 일 종료 시 마감 트리거');
ok(/revoke execute on function %s from public, anon/.test(mig), '새 RPC 는 PUBLIC·anon 양쪽 회수');
const seats2 = read('supabase/migrations/20260923153000_duty_seats.sql');
ok(seats2.includes("coalesce(p_start, '-infinity'::date)"), '담당 기간 판정은 NULL 을 열린 끝으로');
const seed = read('scripts/duty-seat-seed/build-sql.mts');
ok(seed.includes('자리 이름 중복'), '시드 생성기: 자리 이름 중복 검사(행정실·급식이 교무실 급식을 덮어쓴 사고)');

// ── 8. 2026-09-24: 매니저 겸 대상자 · 상세 모달 작업 · 동아리 ─────────────────
console.log('상세 모달 · 매니저 겸 대상자 · 동아리');
const runner = read('src/features/task-workflow/components/collect/CollectInputRunner.tsx');
ok(runner.includes('board.viewer.is_target') && runner.includes('내 입력'), '매니저이면서 대상자면 「내 입력」 탭(관리만이 아니라 자기 줄도 입력)');
const respond = read('src/features/task-workflow/components/collect/CollectRespondPanel.tsx');
ok(respond.includes("=== 'private'") && respond.includes('r.mine'), '개별 입력은 매니저에게도 내 줄만(서버는 매니저에게 전원을 준다)');
const detail = read('src/components/tasks/TaskDetailDialog.tsx');
ok(/<TaskActionPanel[\s\S]*?embedded/.test(detail) && !detail.includes('<TaskActionButton'), '할 일 상세: 연결된 작업을 본문에(푸터의 모달 위 모달 버튼 제거)');
ok(detail.indexOf('<TaskActionPanel') < detail.indexOf('담당자 — 요약'), '작업 목록이 완료 버튼(담당자 섹션)보다 위 — 작업 → 완료 순으로 읽힌다');
ok(detail.includes('taskFiles.length === 0') && detail.includes('첨부파일 없음'), '첨부파일이 없으면 한 줄');
const panel2 = read('src/features/task-workflow/components/TaskActionPanel.tsx');
// 2026-10-05 옛 제출 받기(meta.submission) 줄을 걷어 냈다 — 모달의 내 작업 패널과 겹칠 줄 자체가 없다
ok(!panel2.includes("kind === 'submission'") && !panel2.includes('SubmissionSettingsDialog'), '작업 패널에 옛 제출 줄이 없다(모달의 내 작업 패널과 중복되지 않는다)');
ok(panel2.includes('작업을 하지 않고도 완료할 수 있습니다'), '작업은 완료의 필요 조건이 아니라고 말한다');
const modeSrc = read('src/features/task-workflow/utils/actionPanelMode.ts');
ok(modeSrc.includes('viewer.collectTarget'), '입력 받기: 대상자면 사용 보기에서 바로 입력');
ok(describeAudienceRule({ include: [{ type: 'club', names: [] }], exclude: [] }) === '동아리 담당 교사 전원', '동아리 조건 요약(빈 목록 = 전원)');
ok(validateAudienceRule({ include: [{ type: 'club', names: [] }], exclude: [] }) === null, '빈 동아리 조건은 전원이라 허용');
const clubSql = read('supabase/migrations/20260924110000_club_audience.sql');
ok(/elsif v_type = 'club' then[\s\S]*?club_info/.test(clubSql), '서버 동아리 조건 = club_info 담당 교사');
ok(!/010-\d/.test(clubSql), '시트의 기장 개인 전화번호를 넣지 않는다');
const rosterSql = read('supabase/migrations/20260924130000_club_roster_sync.sql');
ok(!/delete from public\.club_info/i.test(rosterSql) && rosterSql.includes("'status', 'inactive'"), '없어진 동아리는 지우지 않고 지금은 없음으로 기록(사용자 결정)');
ok(rosterSql.includes("coalesce(c.meta->>'status', 'active') <> 'inactive'"), '대상 규칙(동아리 담당)에서 지금은 없는 동아리를 뺀다');
ok(rosterSql.includes("set status = 'archived'"), '창체의 같은 동아리도 보관(archived)');
const clubsHook = read('src/features/issue-register/hooks/useClubs.ts');
const clubForm = read('src/features/issue-register/components/ClubFormFields.tsx');
ok(clubsHook.includes('isClubActive') && clubForm.includes('(현재 없음)') && clubForm.includes('clubs.filter(isClubActive)'), '발급대장: 지금은 없는 동아리는 "(현재 없음)"으로 남고 [모든 동아리]에서는 빠진다');

// ── 8. 홈 「나의 업무」 카드의 입력 요청 (2026-09-27) ─────────────────────────
console.log('홈 나의 업무 카드 — 입력 요청');
{
  const R = (id: string, done: number, total: number, due: string | null, started = '2026-09-20T00:00:00Z'): MyCollectRequest => ({
    action_id: id, task_id: 't', task_title: 'T', work_title: 'W', action_title: id, guide: null,
    due_date: due, visibility: 'private', answer_mode: 'each', total, done, started_at: started,
  });
  const got = pendingCollectRequests([
    R('다함', 3, 3, '2026-09-28'),
    R('칸없음', 0, 0, '2026-09-28'),
    R('마감없음', 0, 2, null),
    R('늦은마감', 1, 2, '2026-10-05'),
    R('이른마감', 0, 1, '2026-09-30'),
    R('같은마감-나중', 0, 1, '2026-09-30', '2026-09-22T00:00:00Z'),
  ]).map((r) => r.action_id);
  ok(!got.includes('다함'), '다 채운 요청은 남은 일이 아니다');
  ok(!got.includes('칸없음'), '칸이 없는 요청(0/0)을 할 일로 띄우지 않는다');
  ok(got.join() === '이른마감,같은마감-나중,늦은마감,마감없음', '마감 가까운 순 · 같으면 먼저 온 것 · 마감 없음은 뒤');

  const card = read('src/features/teacher-dashboard/components/TeacherTasksCard.tsx');
  ok(card.includes('useMyCollectRequests()') && card.includes('placeInboxRequests(collectRequests, new Set(visibleTasks.map('),
    '카드는 내 할 일과 같은 조회 + lib 판정을 쓴다(카드에서 다시 거르지 않는다) — 그린 할 일 행의 제출은 행이 맡는다');
  ok(/<TaskCardCollectRequests[\s\S]*?<PersonalTaskTimeline/.test(card), '입력 요청은 타임라인·할 일 목록보다 위');
  ok(card.includes('pendingRequests.length === 0 ? ('), '할 일은 없고 입력 요청만 있을 때 «진행할 업무가 없습니다»를 그리지 않는다');
  ok(/<CollectRespondDialog[\s\S]*?actionId=\{collectActionId\}/.test(card), '누르면 제자리에서 응답 창(내 할 일과 같은 창)');
}
// ── 9. 입력 요청 — 마감 정규화 · 계획표 · 메뉴 배지 (2026-09-27) ──────────────────
console.log('입력 요청 — 마감 정규화 · 계획표 · 메뉴 배지');
{
  // 서버 due_date 는 두 모양 — 작업 설정 dueDate 또는 할 일 마감(timestamptz)::text
  ok(collectDueDay('2026-03-31') === '2026-03-31', '작업 설정 마감(날짜)은 그대로');
  ok(collectDueDay('2026-09-30 00:00:00+00') === '2026-09-30', '할 일 마감(timestamptz::text)은 앞 10자리 — 할 일 쪽과 같은 규칙');
  ok(collectDueDay(null) === null && collectDueDay('') === null && collectDueDay('모름') === null, '마감 없음·깨진 값 = null');
  ok(collectDueLabel('2026-09-30 00:00:00+00') === '09/30', '표기에 시각이 새지 않는다(«09/30 00:00:00+00 까지» 방지)');

  const R = (id: string, due: string | null): MyCollectRequest => ({
    action_id: id, task_id: 't', task_title: 'T', work_title: 'W', action_title: id, guide: null,
    due_date: due, visibility: 'private', answer_mode: 'each', total: 1, done: 0, started_at: '2026-09-20T00:00:00Z',
  });
  const order = pendingCollectRequests([R('b', '2026-10-01'), R('a', '2026-09-30 00:00:00+00')]).map((r) => r.action_id).join();
  ok(order === 'a,b', '두 모양이 섞여도 날짜로 정렬한다');

  ok(buildNavBadges({ pendingCollect: 0 }) === EMPTY_NAV_BADGES, '남은 요청이 없으면 배지 없음');
  const badges = buildNavBadges({ pendingCollect: 3 });
  ok(navBadgeCount(badges, '/work') === 3 && navBadgeCount(badges, '/tasks') === 0, '배지는 수행 화면(업무노트 — 옛 «내 할 일», 2026-11-12) 경로에만');
  ok(navBadgeText(120) === '99+' && navBadgeText(7) === '7', '좁은 자리 — 세 자리는 99+');
  // 2026-10-01 D3: 입력·제출 요청을 한 배지에 센다(사용자 결정) — 이름은 그 둘을 묶는 «요청»
  ok(navBadgeLabel('내 할 일', 2) === '내 할 일, 요청 2건' && navBadgeLabel('내 할 일', 0) === '내 할 일', '화면 읽기 이름이 무엇의 개수인지 말한다');

  const hook = read('src/hooks/useNavBadges.ts');
  ok(hook.includes('!isStudentView') && hook.includes('FACULTY_ROLES') && hook.includes('pendingCollectRequests(data)'),
    '배지 훅 = 교직원만(학생 미리보기 제외) + lib 판정');
  const sidebar = read('src/components/layout/Sidebar.tsx');
  const mobile = read('src/components/layout/MobileNavigation.tsx');
  ok((sidebar.match(/badge=\{navBadgeCount\(badges, (child|entry)\.href\)\}/g) ?? []).length === 2, '사이드바: 서랍 안·밖 메뉴 둘 다 배지');
  ok(sidebar.includes('badge > 0 && !isExpanded'), '사이드바 접힘 = 아이콘 모서리 숫자(이름이 없으므로)');
  ok((mobile.match(/badge=\{navBadgeCount\(badges, (child|entry)\.href\)\}/g) ?? []).length === 2, '모바일 시트: 서랍 안·밖 메뉴 둘 다 배지');
  ok(mobile.includes('const badge = item.isExternal ? 0 : navBadgeCount(badges, item.href);'), '모바일 하단 5칸도 배지(외부 메뉴 제외)');
  ok(!read('src/config/navigation.ts').includes('badge'), '메뉴 정의에 숫자를 싣지 않는다(배치 층마다 옮겨 실어야 한다)');

  const bridge = read('src/hooks/useBrowserNotifications.ts');
  ok(/row\.type === 'collect_input_requested'[\s\S]{0,120}queryKey: \[COLLECT_KEY\]/.test(bridge),
    '새 입력 요청 알림이 오면 입력 요청 조회를 새로 — 앱을 켜 둔 채여도 배지가 는다');

  const inbox = read('src/components/tasks/MyTaskInbox.tsx');
  ok(inbox.includes('const plannedCollect = placed.section;') && inbox.includes('collectDueDay(r.due_date) === date'),
    '계획표: 남은 요청(행이 맡지 않는 것)을 정규화한 마감 날짜 칸에 놓는다');
  ok(inbox.includes('undatedCollect') && inbox.includes('undatedCount'), '계획표: 마감 없는 요청은 «마감일 미정»에(건수에도 포함)');
  ok(inbox.includes('!entries.length && !collectEntries.length'), '휴대폰: 요청만 있는 날도 숨기지 않는다');
  ok(read('src/features/work-ontology/TodayPage.tsx').includes('onOpenCollect={setCollectActionId}'), '계획표의 요청을 누르면 응답 창');
  ok(!/due_date\.slice\(5\)/.test(read('src/features/task-workflow/components/collect/CollectRequestInbox.tsx')),
    '내 할 일 「입력 요청」 구획도 정규화된 마감을 쓴다');
}
console.log(`\n${pass}건 통과`);
