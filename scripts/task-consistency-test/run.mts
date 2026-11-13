// 업무 관리·내 할 일 문구·일관성 묶음 회귀 (2026-10-06, 감사 문서 docs/plans/2026-10-05-task-ux-audit.md).
//
// 못 박는 것 — 전부 «되살아나도 빌드·타입 검사는 통과하는» 부류다:
//  ① 회차 이름 = «N회 · MM/DD» 한 벌(목록·할 일 상세·담당자 칩)
//  ② 홈 카드 이름 = 메뉴와 같은 «내 할 일»(«나의 업무»·«TASK»·«개인 업무» 금지)
//  ③ 양식 문서 제출 이름 한 벌(«문서 작성»은 HWPX 분류 이름과 겹친다)
//  ④ 취소된 할 일 행에 이유 칩
//  ⑤ `?task=` 딥링크를 못 찾으면 말한다(두 화면 같은 문구)
//
// 실행: npx tsx --tsconfig tsconfig.app.json scripts/task-consistency-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatRoundLabel } from '../../src/lib/taskDeadlines';
import { submissionModeLabel } from '../../src/lib/taskSubmissionConfig';
import { SUBMIT_KIND_LABEL } from '../../src/lib/submitAction';
import { REQUEST_KIND_LABEL } from '../../src/lib/collectInput';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};
const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');

console.log('① 회차 이름');
const rounds = ['2026-10-05', '2026-11-02', '2026-12-07'];
check('순번 + 날짜', formatRoundLabel(rounds, '2026-11-02') === '2회 · 11/02', formatRoundLabel(rounds, '2026-11-02'));
check('목록에 없는 날짜는 날짜만', formatRoundLabel(rounds, '2026-09-01') === '09/01');
for (const p of ['src/components/tasks/MyTaskInbox.tsx', 'src/components/tasks/TaskDetailDialog.tsx', 'src/components/tasks/TaskAssigneeSummary.tsx']) {
  const src = code(p);
  check(`${p.split('/').pop()} 가 formatRoundLabel 을 쓴다`, src.includes('formatRoundLabel(') && !/deadline\.slice\(5/.test(src));
}

console.log('② 홈 카드 이름');
const card = code('src/features/teacher-dashboard/components/TeacherTasksCard.tsx');
check('카드 제목 = «내 할 일»', card.includes('title="내 할 일"'));
check('«나의 업무»·«TASK»·«개인 업무»·«내 업무»가 화면 문구에 없다', !/나의 업무|'TASK'|TASK \{|개인 업무|내 업무/.test(card));
check('대시보드 구획 이름도 같다', code('src/features/teacher-dashboard/TeacherDashboardV2.tsx').includes('aria-label="내 할 일"'));

console.log('③ 양식 문서 제출 이름');
check('옛 라벨도 «양식 문서 제출»', submissionModeLabel('spec') === '양식 문서 제출');
check('세 곳이 같은 이름', SUBMIT_KIND_LABEL.document === '양식 문서 제출' && REQUEST_KIND_LABEL.document === '양식 문서 제출');

console.log('④ 취소된 할 일');
const inbox = code('src/components/tasks/MyTaskInbox.tsx');
check('취소 행에 이유 칩(로즈)', inbox.includes("group === 'cancelled' && (") && inbox.includes('INBOX_CHIP_TONE.cancelled'));
check('칩 색은 inboxChip 한 벌에', read('src/components/tasks/inboxChip.ts').includes("cancelled: 'bg-rose-50"));

console.log('⑤ 못 찾은 딥링크');
for (const p of ['src/features/work-ontology/TodayPage.tsx', 'src/pages/TaskManagement.tsx']) {
  check(`${p.split('/').pop()} 가 못 찾으면 알린다`, /if \(!opened\) toast\.info\(TASK_LINK_NOT_FOUND_MESSAGE\);\s*searchParams\.delete\('task'\)/.test(read(p)));
}

console.log('⑥ 진입점·흐름 정리 (2026-10-06)');
const page = read('src/pages/TaskManagement.tsx');
check('업무를 만들면 그 업무 상세가 열린다(?work= 딥링크)', /const handleWorkCreated[\s\S]*?searchParams\.set\('work', result\.workId\)/.test(page));
const create = read('src/components/tasks/WorkCreateDialog.tsx');
check('갈 길 없던 2단계(초기 할 일 설정)가 없다', !create.includes('currentStep') && !create.includes('초기 할 일 설정</h3>'));
check('타임라인에서 연 업무 상세에도 [수정]', page.includes('<WorkTimelineTab department={selectedDepartment?.name ?? null} onEditWork={handleWorkEdit} />')
  && read('src/components/tasks/WorkTimelineTab.tsx').includes('onEdit={onEditWork ?'));
const workCard = read('src/components/tasks/WorkCard.tsx');
check('전체 업무에서도 책임자인 업무는 [진행]', workCard.includes('onOpenPipeline={isManager ? openPipeline : undefined}'));
const table = read('src/components/tasks/WorkTaskTable.tsx');
check('행 버튼에 글자 — 진행', table.includes('<Route className="h-3.5 w-3.5" />진행'));
check('행 버튼에 글자 — 작업', read('src/components/tasks/IntegratedTaskView.tsx').includes('variant="compact"') && workCard.includes('variant="compact"')
  && read('src/features/task-workflow/components/TaskActionButton.tsx').includes("{variant === 'compact' && '작업'}"));
check('상태 열 머리글', table.includes('font-medium">상태</th>'));

console.log(fails === 0 ? '\n통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
