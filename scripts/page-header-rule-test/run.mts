// 머리글 규약 회귀 — 2026-09-22 신설.
//
// 규약(사용자): "Header 에 기능명을 별도로 표시하지 않아도 사용자는 어디로 들어왔는지 알 수 있다."
// 머리글 카드에는 기능명·아이콘을 쓰지 않는다. 예외는 생기부 분석(evalog)처럼 UI 구조가 완전히 다른
// 앱형 화면뿐이다(CLAUDE.md "UI 큰 틀 규약" §1).
//
// 이 부류는 되살아나도 오류가 나지 않는다 — 새 화면을 옛 화면에서 복사하면 제목 블록이 딸려 온다.
// 그래서 정리한 화면마다 **그 기능명 문자열이 머리글 JSX 로 돌아오지 않았는지**를 본다.
// 하위 화면 제목(새 시험 시간표·새 모의고사 감독표·새 시간표 생성·시간표 이름)은 "어느 흐름·어느
// 대상인가"를 말하므로 규약 대상이 아니다 — 여기서도 검사하지 않는다.
//
// 실행: npx tsx scripts/page-header-rule-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

let fails = 0;
let count = 0;
const check = (name: string, cond: boolean, detail = '') => {
  count += 1;
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` — ${detail}`}`);
  if (!cond) fails += 1;
};

/** JSX 텍스트 노드로 그 문자열이 나오는가(주석·문자열 리터럴 안의 언급은 세지 않는다) */
const rendersText = (src: string, text: string) =>
  new RegExp(`>\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<`).test(src);

type Case = { screen: string; file: string; title: string; extra?: (src: string) => [string, boolean][] };

const CASES: Case[] = [
  { screen: '교실 기기', file: 'src/features/classroom-link/ClassroomPage.tsx', title: '교실 기기',
    extra: (s) => [['<h1> 없음', !/<h1/.test(s)]] },
  { screen: '내 할 일', file: 'src/components/tasks/TaskHeader.tsx', title: '내 할 일',
    extra: (s) => [['MY_TASKS_LABEL 을 그리지 않는다', !s.includes('MY_TASKS_LABEL')]] },
  { screen: '입시 정보', file: 'src/features/ipsi-hub/components/IpsiHubHeader.tsx', title: '입시 정보',
    extra: (s) => [['<h1>/<h2> 없음', !/<h[12]\b/.test(s)]] },
  { screen: '공지사항', file: 'src/features/notice-board/NoticeBoardPage.tsx', title: '공지사항',
    extra: (s) => [['<h1> 없음', !/<h1\b/.test(s)], ['"게시 중 N" 배지 없음(전체 북마크 숫자와 중복)', !/게시 중 \{/.test(s)]] },
  { screen: '구매 신청', file: 'src/features/purchase-requests/PurchaseRequestsPage.tsx', title: '구매 신청 게시판' },
  { screen: '전자서명', file: 'src/features/e-signature/SignatureRequestsPage.tsx', title: '전자서명',
    extra: (s) => [['<h1>/<h2> 없음', !/<h[12]\b/.test(s)]] },
  { screen: '전자서명 안내 목업', file: 'src/features/e-signature/components/guide/scenes.tsx', title: '전자서명' },
  { screen: '전화번호부', file: 'src/pages/Calls.tsx', title: '전화번호부',
    extra: (s) => [['<h1> 없음', !/<h1\b/.test(s)]] },
  { screen: '연수 이수 현황', file: 'src/features/training-certificate/components/TrainingHeader.tsx', title: '연수 이수 현황',
    extra: (s) => [['<h1> 없음', !/<h1\b/.test(s)], ['보여 줄 것이 없으면 머리글을 그리지 않는다', /if \(!isManager && !showSearch\) return null/.test(s)]] },
  { screen: '발급번호(공용 셸)', file: 'src/features/issue-register/components/IssueRegisterShell.tsx', title: '발급대장',
    extra: (s) => [['<h1> 없음', !/<h1\b/.test(s)], ['title/subtitle/icon prop 없음', !/\b(title|subtitle|icon)\s*[:?]/.test(s.split('interface Props')[1]?.split('}')[0] ?? '')]] },
  { screen: '시험 시간표(목록)', file: 'src/features/exam-schedule/ExamSchedulePage.tsx', title: '시험 시간표',
    extra: (s) => [['목록 머리글에 title="시험 시간표" 없음', !s.includes('title="시험 시간표"')]] },
  { screen: '시간표 생성(목록)', file: 'src/features/timetable-generator/TimetableGeneratorPage.tsx', title: '새 학기 시간표 생성',
    extra: (s) => [['"새 학기 시간표 생성" 문구 없음', !s.includes('새 학기 시간표 생성')]] },
];

console.log('\n머리글에 기능명·아이콘을 쓰지 않는다');
for (const c of CASES) {
  const src = read(c.file);
  check(`${c.screen}: 기능명 "${c.title}" 을 그리지 않는다`, !rendersText(src, c.title), c.file);
  for (const [name, ok] of c.extra?.(src) ?? []) check(`${c.screen}: ${name}`, ok, c.file);
}

console.log('\n규약이 문서에 있다');
check('CLAUDE.md "UI 큰 틀 규약" §1 에 규약이 있다', read('CLAUDE.md').includes('머리글에 기능명·아이콘을 쓰지 않는다'));

console.log(`\n${count - fails}/${count} 통과`);
if (fails) process.exit(1);
