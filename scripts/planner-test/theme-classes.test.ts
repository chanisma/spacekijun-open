// 플래너 테마 두 벌의 클래스 이름 대조 (2026-10-03).
// 이번 주·하루·월별 일정·목표 쪽은 아카데미와 일반 플래너가 같은 컴포넌트를 쓰고 CSS 모듈만 갈아 끼운다(plannerTheme.tsx).
// 컴포넌트가 쓰는 `css.X` 가 한쪽 모듈에 없으면 **오류 없이 모양만 빠진다**(CSS 모듈은 없는 키에 undefined 를 준다) — 그래서 여기서 못 박는다.
// npx tsx --test scripts/planner-test/theme-classes.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const game = 'src/features/academy/game/';
const shared = ['PlannerBook.tsx', 'BookWeek.tsx', 'BookDay.tsx', 'BookMonth.tsx', 'BookGoals.tsx', 'DayTimeline.tsx', 'InkLine.tsx', 'usePlanDrag.tsx'];
const read = (path: string) => readFileSync(path, 'utf8');
const classesOf = (cssText: string) => new Set([...cssText.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
const used = new Set(shared.flatMap(f => [...read(game + f).matchAll(/\bcss\.([a-zA-Z]\w*)/g)].map(m => m[1])));
const formUsed = new Set([...read(game + 'PlannerSheetForms.tsx').matchAll(/\bcss\.([a-zA-Z]\w*)/g)].map(m => m[1]));
const book = classesOf(read(game + 'book.module.css'));
const dorm = classesOf(read(game + 'dormitory.module.css'));
const paper = classesOf(read('src/features/planner/plannerPaper.module.css'));

test('공용 컴포넌트가 쓰는 클래스가 두 테마 모두에 있다', () => {
  assert.ok(used.size > 60, `클래스를 제대로 모았다(${used.size})`);
  assert.deepEqual([...used].filter(c => !book.has(c)), [], '아카데미(book.module.css)에 없는 클래스');
  assert.deepEqual([...used].filter(c => !paper.has(c)), [], '앱 테마(plannerPaper.module.css)에 없는 클래스');
});

test('자세히 적기 양식의 클래스가 두 테마 모두에 있다', () => {
  assert.deepEqual([...formUsed].sort(), ['actions', 'form', 'horizonPick', 'pickTime', 'timeFields']);
  assert.deepEqual([...formUsed].filter(c => !dorm.has(c)), [], '아카데미(dormitory.module.css)에 없는 클래스');
  assert.deepEqual([...formUsed].filter(c => !paper.has(c)), [], '앱 테마에 없는 클래스');
});

test('공용 컴포넌트는 CSS 모듈을 직접 import 하지 않는다 — 테마를 거친다', () => {
  for (const f of [...shared, 'PlannerSheetForms.tsx']) {
    assert.doesNotMatch(read(game + f), /import css from '\.\/(book|dormitory)\.module\.css'/, f);
    assert.match(read(game + f), /usePlannerTheme\(\)/, f);
  }
});

test('게임 말투는 테마의 words 로만 — 공용 컴포넌트에 박아 두지 않는다', () => {
  for (const f of shared) {
    const code = read(game + f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const word of ['STARLIGHT PLANNER', '깃펜으로 적기', '깃펜 줄에', '미완의 성도', '>모든 별<']) assert.ok(!code.includes(word), `${f}: «${word}»`);
  }
});

test('끌기는 포인터 끌기 — HTML5 draggable 을 되살리지 않는다', () => {
  for (const f of shared) assert.doesNotMatch(read(game + f), /draggable=\{|onDragStart=|dataTransfer/, f);
});

test('일반 플래너는 공용 컴포넌트를 앱 테마로 감싼다', () => {
  const page = read('src/features/planner/PlannerPage.tsx');
  for (const name of ['BookWeek', 'BookDay', 'BookMonth', 'BookGoals', 'TaskSheetForm', 'GoalSheetForm', 'PlannerThemeProvider']) assert.ok(page.includes(`<${name} `), name);
  assert.doesNotMatch(page, /^import .*Pomodoro/m, '포모도로는 2026-10-03 사용자 결정으로 화면에서 뺐다');
});
