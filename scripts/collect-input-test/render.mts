/**
 * 홈 「나의 업무」 카드 안의 「입력 요청」 줄 — SSR 렌더 회귀 (2026-09-27)
 *
 * 실행: npx tsx --tsconfig tsconfig.app.json scripts/collect-input-test/render.mts
 * (`--tsconfig` 를 빠뜨리면 `React is not defined`)
 *
 * 입력 받기의 대상자는 할 일 담당자가 아니라서, 이 줄이 없거나 조용히 비면 대상자가 홈에서 요청을
 * 볼 길이 없다 — 오류는 나지 않는다. 그림으로 못 박는다.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TaskCardCollectRequests, DASHBOARD_COLLECT_LIMIT } from '../../src/features/teacher-dashboard/components/TaskCardCollectRequests';
import type { MyCollectRequest } from '../../src/lib/collectInput';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
};
const R = (id: string, done: number, total: number, due: string | null): MyCollectRequest => ({
  action_id: id, task_id: 't', task_title: '정보화기기 구입 예산 활용 접수', work_title: '2026년 정보화기기 구입 예산 운영',
  action_title: `요청 ${id}`, guide: null, due_date: due, visibility: 'shared', answer_mode: 'each', total, done,
  started_at: '2026-09-24T00:00:00Z',
});
const render = (requests: MyCollectRequest[]) =>
  renderToStaticMarkup(h(TaskCardCollectRequests, { requests, onOpen: () => {}, onMore: () => {} }));

console.log('[입력 요청 줄]');
check('요청이 없으면 아무것도 그리지 않는다(빈 상자 금지)', render([]) === '');

const one = render([R('a', 1, 3, '2026-09-30')]);
check('구획 이름·개수', one.includes('입력 요청') && />1<\/span>/.test(one));
check('진척 = N/M칸', one.includes('1/3칸'));
check('맥락 = 업무 › 할 일', one.includes('2026년 정보화기기 구입 예산 운영 › 정보화기기 구입 예산 활용 접수'));
// 마감을 맥락 줄 끝에 붙이면 긴 업무 이름의 truncate 에 잘려 휴대폰에서 사라진다(390px 스크린샷에서 발견)
check('마감은 맥락 줄이 아니라 진척 칩 아래(잘리지 않는 자리)', /title="[^"]*활용 접수">[^<]*<\/span>/.test(one) && !/활용 접수[^<]*까지/.test(one) && /1\/3칸<\/span><span[^>]*>09\/30 까지/.test(one));
check('긴 이름은 truncate + title(전문 확인)', /truncate[^"]*" title="요청 a"/.test(one));
check('담당이 아니어도 온다는 것을 말한다', one.includes('담당이 아니어도'));
check('더 보기 버튼 없음(1건)', !one.includes('건 더 보기'));

const many = render(['a', 'b', 'c', 'd', 'e'].map((id) => R(id, 0, 1, null)));
check(`최대 ${DASHBOARD_COLLECT_LIMIT}줄만 그린다`, (many.match(/aria-label="입력 요청 요청 /g) ?? []).length === DASHBOARD_COLLECT_LIMIT);
check('나머지는 «내 할 일에서 N건 더 보기»', many.includes(`내 할 일에서 ${5 - DASHBOARD_COLLECT_LIMIT}건 더 보기`));
check('마감이 없으면 마감 문구를 붙이지 않는다', !many.includes('까지'));

console.log(`\n${pass}건 통과${fail ? ` · ${fail}건 실패` : ''}`);
if (fail) process.exit(1);
