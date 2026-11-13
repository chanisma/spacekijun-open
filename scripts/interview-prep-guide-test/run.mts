/**
 * 면접 준비 안내 씬 회귀 (2026-09-18)
 *
 * 실행: `npx tsx --tsconfig tsconfig.app.json scripts/interview-prep-guide-test/run.mts`
 * (`--tsconfig` 를 빠뜨리면 `.tsx` 가 classic 런타임으로 컴파일돼 `React is not defined` 로 죽는다)
 *
 * 안내 씬은 **렌더가 성공해도 그림이 틀릴 수 있다** — 포인터가 엉뚱한 곳을 가리켜도,
 * 목업 문구가 실제 화면과 달라져도 오류가 나지 않는다. 그래서 두 가지를 못 박는다:
 *
 *  ① **좌표 산술** — 포인터 대상이 그 창 안에 있는가, 창이 무대 안에 있는가.
 *     실제로 이 기능에서도 세그먼트 알약을 흐름 배치로 뒀다가 포인터가 14px 빗나갔다.
 *     지금은 `boxOf`(목업)와 `centerOf`(포인터)가 **같은 상수**를 보고, 그 상수를
 *     `GUIDE_GEOMETRY` 로 내보내 이 테스트가 **실제 값**을 검사한다(베껴 쓰면 무의미하다).
 *  ② **문구 드리프트** — 목업 라벨이 실제 화면·루브릭·공통 질문 주제와 같은가.
 *     화면 문구를 바꾸면 안내가 없는 버튼을 가리키게 된다.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  SceneAnswer, ScenePractice, SceneRecord, SceneToday,
} from '../../src/features/interview-prep/components/guide/scenes';
import { GUIDE_GEOMETRY } from '../../src/features/interview-prep/components/guide/geometry';
import { STAGE_H, STAGE_W } from '../../src/components/walkthrough/WalkthroughStage';
import { WINDOW_CHROME as CH } from '../../src/components/walkthrough/stageCoords';
import {
  COMMON_QUESTION_THEMES, interviewRubric,
} from '../../supabase/functions/_shared/interviewPrep';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass += 1; } else { fail += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const SCENES = read('src/features/interview-prep/components/guide/scenes.tsx');
const DIALOG = read('src/features/interview-prep/components/guide/InterviewPrepGuideDialog.tsx');
const PAGE = read('src/features/interview-prep/InterviewPrepPage.tsx');

// 씬은 `useSceneTime()` 을 읽는다. SSR 에서는 0 이라 **시작 직전 상태**로 굳는다 —
// 구조(탭 줄·창 개수)는 그대로 검증되고, 시간에 따라 나타나는 문구는 소스에서 본다.
const html = {
  today: renderToStaticMarkup(h(SceneToday)),
  answer: renderToStaticMarkup(h(SceneAnswer)),
  practice: renderToStaticMarkup(h(ScenePractice)),
  record: renderToStaticMarkup(h(SceneRecord)),
};

console.log('\n[1] 네 씬이 모두 렌더된다');
for (const [key, markup] of Object.entries(html)) {
  check(`${key} 렌더`, markup.length > 500, `${markup.length}자`);
}

console.log('[2] 모든 씬이 같은 탭 줄을 이고 있다');
for (const [key, markup] of Object.entries(html)) {
  // 탭 줄이 없으면 "내가 앱의 어느 자리에 있는지"를 잃는다(스킬 규약).
  check(`${key} 에 오늘·연습·기록 탭 줄`,
    markup.includes('오늘') && markup.includes('연습') && markup.includes('기록'));
}

console.log('[3] 좌표 — 창은 무대 안, 포인터 대상은 그 창 안');
for (const [key, geo] of Object.entries(GUIDE_GEOMETRY)) {
  for (const [i, w] of geo.windows.entries()) {
    check(`${key} 창${i + 1} 이 무대(${STAGE_W}×${STAGE_H}) 안에 있다`,
      w.x >= 0 && w.y >= 0 && w.x + w.w <= STAGE_W && w.y + w.h <= STAGE_H,
      `x${w.x} y${w.y} w${w.w} h${w.h}`);
  }
  for (const [i, target] of geo.targets.entries()) {
    // 대상이 **어느 한 창의 본문 안**에 있어야 한다(제목줄 CH 아래).
    const inside = geo.windows.some((w) =>
      target.x >= w.x && target.y >= w.y + CH
      && target.x + target.w <= w.x + w.w
      && target.y + target.h <= w.y + w.h);
    check(`${key} 포인터 대상${i + 1} 이 창 본문 안에 있다`, inside,
      `x${target.x} y${target.y} w${target.w} h${target.h}`);
    const cx = target.x + target.w / 2;
    const cy = target.y + target.h / 2;
    check(`${key} 포인터 대상${i + 1} 중심이 무대 안에 있다`,
      cx > 0 && cx < STAGE_W && cy > 0 && cy < STAGE_H, `${cx},${cy}`);
  }
}

console.log('[4] 같은 씬의 창끼리 완전히 겹치지 않는다');
for (const [key, geo] of Object.entries(GUIDE_GEOMETRY)) {
  if (geo.windows.length < 2) continue;
  const [a, b] = geo.windows;
  const covered = a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
  const coveredRev = b.x <= a.x && b.y <= a.y && b.x + b.w >= a.x + a.w && b.y + b.h >= a.y + a.h;
  check(`${key} 두 창이 서로를 완전히 덮지 않는다`, !covered && !coveredRev);
  check(`${key} 창이 2개면 배지로 순번을 말한다`,
    (SCENES.match(new RegExp('badge="[①②③]"', 'g')) ?? []).length >= 2);
}

console.log('[5] 점수는 점으로 — 숫자로 쓰지 않는다');
{
  // 실제 화면이 `3 / 4` 를 쓰지 않는 것과 같은 이유(0~4 는 서열 척도라 합산을 부른다).
  for (const [key, markup] of Object.entries(html)) {
    check(`${key} 에 "n / 4" 표기가 없다`, !/\d\s*\/\s*4(?!\d)/.test(markup));
  }
  check('점 부품이 있다', SCENES.includes('const Dots'));
  check('총점을 그리지 않는다', !/총점/.test(SCENES));
}

console.log('[6] 문구가 실제 화면·루브릭과 어긋나지 않는다');
{
  // 루브릭 이름이 바뀌면 안내가 없는 항목을 설명하게 된다.
  for (const row of interviewRubric('general')) {
    check(`루브릭 '${row.label}' 이 씬에 있다`, SCENES.includes(row.label));
  }
  for (const theme of COMMON_QUESTION_THEMES) {
    check(`공통 질문 '${theme.label}' 이 씬에 있다`, SCENES.includes(theme.label));
  }
  const home = read('src/features/interview-prep/components/InterviewPrepHomeCard.tsx');
  check('홈 카드 제목이 같다', home.includes('오늘의 면접 질문') && SCENES.includes('오늘의 면접 질문'));
  check('홈 카드 버튼 문구가 같다', home.includes('오늘의 질문 받기') && SCENES.includes('오늘의 질문 받기'));
  const thread = read('src/features/interview-prep/components/InterviewThreadView.tsx');
  for (const phrase of ['질문 의도', '잘한 점', '먼저 보완할 점', '이 질문에 답하기', '답변 고쳐서 다시 받기']) {
    check(`'${phrase}' 가 화면과 씬에 모두 있다`, thread.includes(phrase) && SCENES.includes(phrase));
  }
  check('면책 문구가 같다',
    thread.includes('실제 입시 점수가 아닙니다') && SCENES.includes('실제 입시 점수가 아닙니다'));
  const practice = read('src/features/interview-prep/components/PracticeTab.tsx');
  check("'공통 질문' 이 화면과 씬에 모두 있다",
    practice.includes('공통 질문') && SCENES.includes('공통 질문'));
  check("'아직 질문 안 받은 활동' 이 화면과 씬에 모두 있다",
    practice.includes('아직 질문 안 받은 활동') && SCENES.includes('아직 질문 안 받은 활동'));
  const record = read('src/features/interview-prep/components/RecordTab.tsx');
  // '다룬 활동' 은 `CoverageBar` 가 갖는다(RecordTab 이 아니라 parts.tsx). 라벨의 실제
  // 주인을 봐야 한다 — 엉뚱한 파일을 보면 라벨이 바뀌어도 통과한다.
  const parts = read('src/features/interview-prep/components/parts.tsx');
  check("'다룬 활동' 이 화면과 씬에 모두 있다",
    parts.includes('다룬 활동') && SCENES.includes('다룬 활동'));
  check("'아직 약한 기준' 이 화면과 씬에 모두 있다",
    record.includes('아직 약한 기준') && SCENES.includes('아직 약한 기준'));
  // 교사 화면 탭 이름
  check('생기부 분석 탭 이름이 같다',
    read('src/features/evalog/components/evaluation/EvaluationPanel.tsx').includes('면접 준비')
    && SCENES.includes('면접 준비'));
}

console.log('[7] 단계 구성');
{
  const ids = [...DIALOG.matchAll(/^\s+id: '([a-z]+)',$/gm)].map((m) => m[1]);
  check('4단계다', ids.length === 4, ids.join(','));
  check('네 씬을 모두 쓴다',
    ['SceneToday', 'SceneAnswer', 'ScenePractice', 'SceneRecord'].every((s) => DIALOG.includes(`<${s} />`)));
  const labels = [...DIALOG.matchAll(/^\s+label: '([^']+)',$/gm)].map((m) => m[1]);
  check('단계 이름이 2~5자', labels.length === 4 && labels.every((l) => l.length >= 2 && l.length <= 5),
    labels.join(','));
  const points = [...DIALOG.matchAll(/points: \[/g)].length;
  check('모든 단계에 요점이 있다', points === 4, String(points));
  // 마지막 단계는 "끝난 뒤 어떻게 되는가" — 여기서는 **선생님이 본다**가 그것이다.
  check('마지막 단계가 교사 열람을 말한다', /선생님[^]*?본다|선생님도 봅니다|선생님이[^]*?봅니다/.test(DIALOG));
  check('안내가 "누를 때 만들어진다"를 말한다', DIALOG.includes('누를 때'));
  check('안내가 하루 한 번을 말한다', DIALOG.includes('하루에'));
}

console.log('[8] 진입점 — [사용 방법]은 액션 묶음 맨 왼쪽');
{
  check('페이지에 사용 방법 버튼이 있다', PAGE.includes('사용 방법') && PAGE.includes('HelpCircle'));
  check('안내 모달을 연다', PAGE.includes('<InterviewPrepGuideDialog'));
  // 툴바 children 안에서 버튼이 세그먼트(탭 전환기)보다 **먼저** 와야 한다.
  const btn = PAGE.indexOf('title="사용 방법"');
  const seg = PAGE.indexOf('<SegmentFilter<Tab>');
  check('탭 전환기보다 왼쪽에 있다', btn > 0 && seg > btn, `btn=${btn} seg=${seg}`);
}

console.log('[9] 글자 크기 하한 10px');
{
  const sizes = [...SCENES.matchAll(/fontSize: (\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  const small = sizes.filter((s) => s < 10);
  check(`모든 fontSize 가 10 이상 (${sizes.length}개)`, small.length === 0, small.join(','));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
