// 조건으로 학생 고르기 — 실제 선택기 스크린샷 + 불변식 (2026-10-01)
//
// 실제 SearchableMultiSelect(filterByStudent)를 모달 안에 띄우고, 서버 두 RPC 훅과 인증만 스텁으로 바꾼다
// (가짜 학생 — 이름은 지어낸 것). 학생 목록은 REST 응답을 가로채 준다. 390×844 · 1280×900.
// 방식은 scripts/meal-duty-test/run-screenshots.mjs 와 같다(mobile-modal-test fixture 페이지 사용).
//
//   $env:PLAYWRIGHT_MODULE = "C:\...\node_modules\playwright\index.mjs"
//   $env:MODAL_TEST_URL = "http://localhost:8080"      # 개발 서버를 먼저 켠다
//   node scripts/student-audience-test/run-screenshots.mjs
//
// 결과 png = .tmp/student-audience-shots/ (gitignore)
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);

const OUT = join(process.cwd(), '.tmp', 'student-audience-shots');
mkdirSync(OUT, { recursive: true });
const BASE = `${process.env.MODAL_TEST_URL || 'http://localhost:8080'}/scripts/mobile-modal-test/index.html`;
const { browserHash } = JSON.parse(readFileSync(new URL('../../node_modules/.vite/deps/_metadata.json', import.meta.url), 'utf8'));
const react = '/node_modules/.vite/deps/react.js';
const query = '/node_modules/.vite/deps/@tanstack_react-query.js';

// 가짜 학생: 2·3학년 × 1~3반 × 6명. 3학년은 2학년 때 반이 (현재 반 % 3) + 1 로 섞인다.
const STUDENTS = [];
const SURNAMES = ['가', '나', '다', '라', '마', '바'];
for (const grade of [2, 3]) {
  for (const cls of [1, 2, 3]) {
    for (let n = 1; n <= 6; n += 1) {
      const pastClass = grade === 3 ? ((cls + n) % 3) + 1 : cls;
      STUDENTS.push({
        id: `00000000-0000-4000-8000-${String(grade * 1000 + cls * 100 + n).padStart(12, '0')}`,
        name: `${SURNAMES[n - 1]}학생${grade}${cls}`,
        type: 'student',
        meta: {
          id: `2${grade === 3 ? 4 : 5}-1${cls}${String(n).padStart(2, '0')}`,
          grade, class: cls, number: n,
          snum2: `2${String(pastClass).padStart(2, '0')}${String(n).padStart(2, '0')}`,
        },
      });
    }
  }
}

// 가짜 교사 — 섞인 선택기(교사+학생)와 교직원 조건 흉내에 쓴다
const TEACHERS = [1, 2, 3].flatMap((g) => [0, 1].map((i) => ({
  id: `00000000-0000-4000-9000-${String(g * 10 + i).padStart(12, '0')}`, name: `${['가', '나'][i]}선생${g}`, type: 'teacher', homeroom: g,
})));

// 서버 해석을 흉내 낸다 — current_class·past_class·club 만(이 하네스가 쓰는 조건)
const AUDIENCE_STUB = `
  import { useQuery } from '${query}';
  const STUDENTS = ${JSON.stringify(STUDENTS)};
  const CLUBS = { '천문반': STUDENTS.filter((s, i) => i % 4 === 0).map((s) => s.id) };
  const match = (c) => {
    if (c.type === 'current_class') return STUDENTS.filter((s) => (!c.grades?.length || c.grades.includes(s.meta.grade)) && (!c.classes?.length || c.classes.includes(s.meta.class)));
    if (c.type === 'past_class') return STUDENTS.filter((s) => s.meta['snum' + c.grade] && Number(s.meta['snum' + c.grade].slice(1, 3)) && c.classes.includes(Number(s.meta['snum' + c.grade].slice(1, 3))));
    if (c.type === 'club') return STUDENTS.filter((s) => c.names.some((n) => (CLUBS[n] ?? []).includes(s.id)));
    return [];
  };
  const resolve = (rule) => {
    const groups = []; let inc = new Set();
    rule.include.forEach((g, index) => {
      let set = null; const criteria = [];
      for (const c of g.all) { const ids = new Set(match(c).map((s) => s.id)); criteria.push({ type: c.type, count: ids.size, ...(c.type === 'past_class' ? { no_record: 0 } : {}) }); set = set ? new Set([...set].filter((x) => ids.has(x))) : ids; }
      groups.push({ side: 'include', index, count: set.size, criteria }); set.forEach((x) => inc.add(x));
    });
    const rows = STUDENTS.filter((s) => inc.has(s.id)).map((s) => ({ resource_id: s.id, name: s.name, student_code: s.meta.id, grade: s.meta.grade, class: s.meta.class, number: s.meta.number, reasons: [] }));
    return { academic_year: 2026, semester: 2, rows, groups, included: rows.length, excluded: 0 };
  };
  const vocab = { academic_year: 2026, semester: 2,
    classes: [2, 3].flatMap((g) => [1, 2, 3].map((c) => ({ grade: g, class: c, count: 6 }))),
    subjects: [{ subject: '인공지능 기초', grades: [2], count: 18 }], clubs: [{ name: '천문반', category: '과학', count: 9 }],
    my_homeroom: [{ grade: 3, class: 1 }], my_subjects: ['인공지능 기초'], max_period: 7,
    teachers: [{ id: 't-0', name: '가나다', subjects: ['인공지능 기초'] }],
    past_subjects: [{ subject: '프로그래밍', terms: ['2-1'], count: 9 }] };
  export const useStudentAudienceVocab = () => ({ data: vocab, isError: false });
  // 3단계 — 최근·즐겨찾기(메모리 표). 정준형은 앱의 진짜 함수를 쓴다(열쇠가 어긋나면 별표 상태가 안 맞는다)
  import { useMutation, useQueryClient } from '${query}';
  import { canonicalRule } from '/src/lib/studentAudienceRule.ts';
  const SAVED = [
    { id: 'p1', rule: { include: [{ all: [{ type: 'club', names: ['천문반'] }] }], exclude: [] }, label: '동아리 · 천문반', title: null,
      sentence: '천문반 동아리 학생', pinned: true, use_count: 1, last_used_at: '2026-09-30T09:00:00Z' },
    { id: 'r1', rule: { include: [{ all: [{ type: 'current_class', grades: [2], classes: [1] }] }], exclude: [] }, label: '현재 2학년 1반', title: null,
      sentence: null, pinned: false, use_count: 3, last_used_at: '2026-09-29T09:00:00Z' },
  ];
  export const useSavedStudentRules = () => useQuery({ queryKey: ['stub-saved'], queryFn: async () => SAVED.map((s) => ({ ...s })) });
  // 교직원 쪽 — 가짜 교사 6명(1~3학년 담임 각 2명). 담임 조건만 흉내 낸다
  const TEACHERS = ${JSON.stringify(TEACHERS)};
  export const useSavedFacultyRules = () => useQuery({ queryKey: ['stub-saved-f'], queryFn: async () => [] });
  export const useFacultyAudienceVocab = () => ({ data: { departments: [], tags: [], seats: [], clubs: [], subjects: [] }, isError: false });
  export function useFacultyAudienceResolution(rule, enabled) {
    return useQuery({ queryKey: ['stub-f', JSON.stringify(rule)], enabled, queryFn: async () => {
      const groups = []; const inc = new Set();
      rule.include.forEach((g, index) => {
        let set = null; const criteria = [];
        for (const c of g.all) {
          const ids = new Set(TEACHERS.filter((t) => c.type === 'homeroom' && (!c.grades?.length || c.grades.includes(t.homeroom))).map((t) => t.id));
          criteria.push({ type: c.type, count: ids.size }); set = set ? new Set([...set].filter((x) => ids.has(x))) : ids;
        }
        groups.push({ side: 'include', index, count: set.size, criteria }); set.forEach((x) => inc.add(x));
      });
      const rows = TEACHERS.filter((t) => inc.has(t.id)).map((t) => ({ resource_id: t.id, name: t.name, type: 'teacher', reasons: [] }));
      return { rows, groups, included: rows.length, excluded: 0 };
    } });
  }
  export function useRecordStudentRule() {
    const qc = useQueryClient();
    return useMutation({ mutationFn: async (input) => {
      const hit = SAVED.find((s) => canonicalRule(s.rule) === input.ruleKey);
      if (hit) { hit.use_count += 1; hit.pinned = hit.pinned || !!input.pin; }
      else SAVED.unshift({ id: 'n' + SAVED.length, rule: input.rule, label: input.label, title: null, sentence: input.sentence, pinned: !!input.pin, use_count: 1, last_used_at: new Date().toISOString() });
    }, onSettled: () => qc.invalidateQueries({ queryKey: ['stub-saved'] }) });
  }
  export function useUpdateSavedStudentRule() {
    const qc = useQueryClient();
    return useMutation({ mutationFn: async ({ id, pinned, remove }) => {
      const i = SAVED.findIndex((s) => s.id === id);
      if (i < 0) return;
      if (remove) SAVED.splice(i, 1); else SAVED[i].pinned = pinned;
    }, onSettled: () => qc.invalidateQueries({ queryKey: ['stub-saved'] }) });
  }
  // 검색창 @ 바로 추가가 부르는 해석 함수
  export async function resolveStudentAudience(rule) { return resolve(rule); }
  export async function resolveFacultyRule() { return { rows: [], groups: [], included: 0, excluded: 0 }; }
  export function useStudentAudienceResolution(rule, enabled) {
    return useQuery({ queryKey: ['stub', JSON.stringify(rule)], queryFn: async () => resolve(rule), enabled });
  }
`;

// 2단계(AI) — 모델 호출만 바꿔 끼운다. 결과는 **앱의 진짜 파서**를 지나게 해서 정규화·경고까지 화면에 나온다
const DRAFT_STUB = `
  import { parseStudentRuleDraft } from '/src/lib/studentRuleDraft.ts';
  export async function generateStudentRuleDraft(sentence, vocab, students, signal, mentions = []) {
    window.__lastMentions = mentions.map((m) => m.label);
    await new Promise((r) => setTimeout(r, 150));
    const raw = JSON.stringify({ include: [{ all: [
      { type: 'current_class', grades: [3] }, { type: 'past_class', grade: 2, classes: [3] },
    ] }], exclude: [], unmatched: ['방과후'] });
    return parseStudentRuleDraft(raw, vocab, students, sentence);
  }
`;
const FACULTY_DRAFT_STUB = `
  export async function generateFacultyRuleDraft() { throw new Error('하네스에서는 쓰지 않는다'); }
`;

const AUTH_STUB = `
  export const useOptionalAuth = () => ({ effectiveRole: 'teacher' });
  export const useAuth = () => ({ effectiveRole: 'teacher', isAdmin: false, user: { id: 'u' } });
`;

const mount = `
  import {SearchableMultiSelect} from '/src/components/ui/searchable-multi-select.tsx';
  import {Dialog, DialogContent, DialogTitle} from '/src/components/ui/dialog.tsx';
  function Case(){
    const [values, setValues] = React.useState([]);
    return React.createElement(Dialog,{open:true,onOpenChange:()=>{}},
      React.createElement(DialogContent,{className:'max-w-lg'},
        React.createElement(DialogTitle,null,'참여 학생'),
        React.createElement('div',{className:'px-4 pb-6 space-y-2'},
          React.createElement(SearchableMultiSelect,{filterByStudent:true,filterByTeacher:!!window.__MIXED,selectedValues:values,onSelectionChange:setValues,placeholder:'학생 선택'}),
          React.createElement('div',{'data-testid':'count'}, String(values.length)))));
  }
  export {Case};`;

async function flow(page, row) {
  await page.getByRole('combobox').click();
  await page.getByRole('button', { name: '조건', exact: true }).click();
  await page.getByText('조건으로 고르기').waitFor();
  await page.getByRole('button', { name: '조건 추가' }).click();
  await page.getByRole('button', { name: '예전 학년 때 반' }).click();
  await page.getByRole('button', { name: '2학년 때' }).click();
  await page.getByRole('button', { name: '3반', exact: true }).click();
  await page.getByText(/현재 학년별/).waitFor();
  const before = await page.getByRole('button', { name: /명 추가$/ }).innerText();
  const g3 = page.getByRole('button', { name: /^3학년 \d+명만$/ });
  const g3text = await g3.innerText();
  row.note = `「2학년 때 3반」 ${before} → ${g3text}`;
  await g3.click();
  await page.waitForTimeout(250);
  const after = await page.getByRole('button', { name: /명 추가$/ }).innerText();
  const expected = g3text.match(/(\d+)명만/)[1];
  if (!after.startsWith(`${expected}명`)) row.problems.push(`좁힌 뒤 인원 ${after} ≠ ${expected}`);
  if (!(await page.getByText('그리고 (이 중에서)').isVisible())) row.problems.push('좁히기가 같은 묶음 AND 로 들어가지 않았다');
  return expected;
}

/** 2단계: 문장 → [조건 만들기] → 편집기가 채워지고 AI 해석·경고가 보인다 */
async function aiFlow(page, row) {
  await page.getByRole('combobox').click();
  await page.getByRole('button', { name: '조건', exact: true }).click();
  await page.getByLabel('찾을 대상을 문장으로').fill('현재 3학년 중 2학년 때 3반이었던 방과후 학생');
  await page.getByRole('button', { name: '조건 만들기' }).click();
  await page.getByText('AI 가 만든 조건입니다').waitFor();
  const panel = await page.evaluate(() => document.body.innerText);
  if (!panel.includes('→ 현재 3학년 중 2학년 때 3반')) row.problems.push('AI 해석 요약이 없다');
  if (!panel.includes('「방과후」에 맞는 조건을 찾지 못했습니다')) row.problems.push('못 찾은 말 경고가 없다');
  if (!(await page.getByText('그리고 (이 중에서)').isVisible())) row.problems.push('편집기가 묶음으로 채워지지 않았다');
  const addText = await page.getByRole('button', { name: /명 추가$/ }).innerText();
  row.note = `AI → ${addText}`;
  await page.screenshot({ path: join(OUT, `ai-note-${page.viewportSize().width}.png`), animations: 'disabled' });
  // 사람이 고치면 AI 해석 표시는 사라진다(더 이상 AI 결과가 아니다)
  await page.getByRole('button', { name: '2학년', exact: true }).click();
  await page.waitForTimeout(150);
  if (await page.getByText('AI 가 만든 조건입니다').isVisible()) row.problems.push('고친 뒤에도 AI 해석이 남았다');
  return addText.match(/(\d+)명/)?.[1];
}

/** 섞인 선택기: 목록 거르기 [전체|교사|학생] + 조건 패널의 [학생|교직원] 토글 → 교직원 조건으로 추가 */
async function mixedFlow(page, row) {
  await page.getByRole('combobox').click();
  const tabs = page.getByRole('tablist', { name: '목록에서 볼 대상' });
  await tabs.waitFor();
  const optionNames = async () => page.evaluate(() => [...document.querySelectorAll('[cmdk-item]')].map((n) => n.textContent ?? ''));
  await tabs.getByRole('tab', { name: '교사' }).click();
  const teachersOnly = await optionNames();
  if (!teachersOnly.length || teachersOnly.some((t) => t.includes('학생'))) row.problems.push(`교사 거르기 실패: ${teachersOnly.slice(0, 3)}`);
  await tabs.getByRole('tab', { name: '학생' }).click();
  const studentsOnly = await optionNames();
  if (!studentsOnly.length || studentsOnly.some((t) => t.includes('선생'))) row.problems.push('학생 거르기 실패');
  await page.screenshot({ path: join(OUT, `mixed-list-${page.viewportSize().width}.png`), animations: 'disabled' });
  await page.getByRole('button', { name: '조건', exact: true }).click();
  const targets = page.getByRole('tablist', { name: '고를 대상' });
  await targets.getByRole('tab', { name: '교직원' }).click();
  await page.getByRole('button', { name: '조건 추가' }).filter({ visible: true }).click();
  await page.getByRole('button', { name: '담임', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: '2학년', exact: true }).filter({ visible: true }).click();
  const add = page.getByRole('button', { name: /명 추가$/ }).filter({ visible: true });
  await add.waitFor();
  const addText = await add.innerText();
  if (!/^2명/.test(addText)) row.problems.push(`교직원 조건 결과 ${addText} ≠ 2명`);
  await page.screenshot({ path: join(OUT, `mixed-faculty-${page.viewportSize().width}.png`), animations: 'disabled' });
  await add.click();
  await page.waitForTimeout(250);
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes('교직원 · 2학년 담임')) row.problems.push('섞인 선택기에서 칩 라벨에 대상이 붙지 않았다');
  row.note = `교사/학생 거르기 · 교직원 조건 → ${addText}`;
}

/** @ — 문장 칸 자동완성: 「@천」 → 후보 → Enter 로 「@천문반 」 → 보낼 때 고른 이름이 함께 간다 */
async function atSentenceFlow(page, row) {
  await page.getByRole('combobox').click();
  await page.getByRole('button', { name: '조건', exact: true }).click();
  const input = page.getByLabel('찾을 대상을 문장으로');
  await input.click();
  await input.pressSequentially('현재 3학년 중 @천');
  const list = page.getByRole('listbox', { name: '이름 고르기' });
  await list.waitFor();
  await page.screenshot({ path: join(OUT, `at-sentence-${page.viewportSize().width}.png`), animations: 'disabled' });
  const first = await list.getByRole('option').first().innerText();
  if (!first.includes('천문반')) row.problems.push(`첫 후보가 천문반이 아니다: ${first}`);
  await input.press('Enter');
  const value = await input.inputValue();
  if (value !== '현재 3학년 중 @천문반 ') row.problems.push(`넣은 글자 ${JSON.stringify(value)}`);
  await input.pressSequentially('부원');
  await page.getByRole('button', { name: '조건 만들기' }).click();
  await page.getByText('AI 가 만든 조건입니다').waitFor();
  const sent = await page.evaluate(() => window.__lastMentions);
  if (JSON.stringify(sent) !== JSON.stringify(['천문반'])) row.problems.push(`AI 에 보낸 @ 이름 ${JSON.stringify(sent)}`);
  row.note = `@천 → ${value.trim()} → 보낸 이름 ${JSON.stringify(sent)}`;
}

/** @ — 기본 검색창: 「@천」 → 「이름으로 바로 추가」 → 누르면 AI 없이 부원 전원 */
async function atSearchFlow(page, row) {
  await page.getByRole('combobox').click();
  const search = page.getByPlaceholder('검색...');
  await search.fill('@천');
  await page.getByText('이름으로 바로 추가').waitFor();
  await page.screenshot({ path: join(OUT, `at-search-${page.viewportSize().width}.png`), animations: 'disabled' });
  await page.getByRole('option', { name: /천문반/ }).click();
  await page.waitForTimeout(300);
  if (page.viewportSize().width < 640) await page.getByRole('button', { name: /^완료/ }).click().catch(() => {});
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const count = await page.getByTestId('count').innerText();
  if (count !== '9') row.problems.push(`더한 인원 ${count} ≠ 9(천문반 부원)`);
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes('동아리 · 천문반')) row.problems.push('그룹 칩 「동아리 · 천문반」이 없다');
  row.note = `@천 → 천문반 ${count}명 바로 추가`;
}

/** 3단계: 즐겨찾기 불러오기 → [N명 추가] → 다시 열면 같은 줄의 사용 횟수가 는다 */
async function savedFlow(page, row) {
  await page.getByRole('combobox').click();
  await page.getByRole('button', { name: '조건', exact: true }).click();
  await page.getByText('즐겨찾기 · 최근').waitFor();
  await page.screenshot({ path: join(OUT, `saved-list-${page.viewportSize().width}.png`), animations: 'disabled' });
  const before = await page.evaluate(() => document.body.innerText);
  if (!before.includes('「천문반 동아리 학생」')) row.problems.push('저장된 문장이 목록에 없다');
  if (!before.includes('3회')) row.problems.push('사용 횟수 표시가 없다');
  await page.getByRole('button', { name: /동아리 · 천문반/ }).click();
  await page.getByRole('button', { name: /명 추가$/ }).waitFor();
  if (!(await page.getByRole('button', { name: '즐겨찾기됨' }).isVisible())) row.problems.push('불러온 조건이 즐겨찾기로 보이지 않는다');
  if (await page.getByText('즐겨찾기 · 최근').isVisible()) row.problems.push('편집 중에도 목록이 자리를 차지한다');
  const add = await page.getByRole('button', { name: /명 추가$/ }).innerText();
  await page.getByRole('button', { name: /명 추가$/ }).click();
  await page.waitForTimeout(250);
  // 추가하면 패널만 닫히고 선택기는 열린 채다 — [조건]을 다시 눌러 목록을 본다
  await page.getByRole('button', { name: '조건', exact: true }).click();
  await page.getByText('즐겨찾기 · 최근').waitFor();
  const after = await page.evaluate(() => document.body.innerText);
  if (!/2회/.test(after)) row.problems.push('추가한 조건의 사용 횟수가 늘지 않았다');
  // 별표 안 한 줄만 X 가 있다
  const removable = await page.getByRole('button', { name: '최근에서 지우기' }).count();
  if (removable !== 1) row.problems.push(`지우기 버튼 ${removable}개(별표 없는 1줄만 있어야 한다)`);
  row.note = `즐겨찾기 불러오기 → ${add} → 2회`;
}

const CASES = [
  { id: '01-panel-1280', viewport: { width: 1280, height: 900 }, apply: false },
  { id: '02-applied-1280', viewport: { width: 1280, height: 900 }, apply: true },
  { id: '03-panel-390', viewport: { width: 390, height: 844 }, apply: false },
  { id: '04-applied-390', viewport: { width: 390, height: 844 }, apply: true },
  { id: '05-ai-1280', viewport: { width: 1280, height: 900 }, ai: true },
  { id: '06-ai-390', viewport: { width: 390, height: 844 }, ai: true },
  { id: '07-saved-1280', viewport: { width: 1280, height: 900 }, saved: true },
  { id: '08-saved-390', viewport: { width: 390, height: 844 }, saved: true },
  { id: '09-mixed-1280', viewport: { width: 1280, height: 900 }, mixed: true },
  { id: '10-mixed-390', viewport: { width: 390, height: 844 }, mixed: true },
  { id: '11-at-sentence-1280', viewport: { width: 1280, height: 900 }, at: 'sentence' },
  { id: '12-at-sentence-390', viewport: { width: 390, height: 844 }, at: 'sentence' },
  { id: '13-at-search-1280', viewport: { width: 1280, height: 900 }, at: 'search' },
  { id: '14-at-search-390', viewport: { width: 390, height: 844 }, at: 'search' },
];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  for (const testCase of CASES) {
    const context = await browser.newContext({ viewport: testCase.viewport, deviceScaleFactor: 2, hasTouch: testCase.viewport.width < 640 });
    const page = await context.newPage();
    if (testCase.mixed) await page.addInitScript(() => { window.__MIXED = true; });
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/auth/v1/**', (r) => r.abort());
    await page.route('**/rest/v1/**', (r) => {
      const url = r.request().url();
      if (url.includes('/rest/v1/resource') && url.includes('student')) {
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify(STUDENTS) });
      }
      if (url.includes('/rest/v1/resource') && url.includes('teacher')) {
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify(TEACHERS) });
      }
      return r.fulfill({ contentType: 'application/json', body: '[]' });
    });
    const mocks = {
      '**/src/hooks/useStudentAudience.ts*': AUDIENCE_STUB,
      '**/src/services/studentRuleDraftService.ts*': DRAFT_STUB,
      '**/src/services/facultyRuleDraftService.ts*': FACULTY_DRAFT_STUB,
      '**/src/components/auth/AuthProvider.tsx*': AUTH_STUB,
      '**/scripts/mobile-modal-test/main.tsx*': `
        import React from '${react}';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import {QueryClient,QueryClientProvider} from '${query}';
        import '/src/index.css';
        ${mount}
        ReactDOM.createRoot(document.getElementById('root')).render(
          React.createElement(QueryClientProvider,{client:new QueryClient()},React.createElement(Case)));`,
    };
    for (const [glob, source] of Object.entries(mocks)) {
      const body = source.replace(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)(?=['"])/g, `$1?v=${browserHash}`);
      await page.route(glob, (r) => r.fulfill({ contentType: 'application/javascript', body }));
    }

    const row = { id: testCase.id, problems: [] };
    try {
      await page.goto(BASE);
      await page.locator('[data-slot="dialog-content"]').first().waitFor({ state: 'visible' });
      if (testCase.ai || testCase.saved || testCase.mixed || testCase.at) {
        if (testCase.ai) await aiFlow(page, row);
        else if (testCase.saved) await savedFlow(page, row);
        else if (testCase.at === 'sentence') await atSentenceFlow(page, row);
        else if (testCase.at === 'search') await atSearchFlow(page, row);
        else await mixedFlow(page, row);
        await page.screenshot({ path: join(OUT, `${testCase.id}.png`), animations: 'disabled' });
        for (const e of errors) row.problems.push(`페이지 오류 — ${e}`);
        results.push(row);
        await context.close();
        continue;
      }
      const expected = await flow(page, row);
      const geo = await page.evaluate(() => ({
        bodyOverflowsX: document.body.scrollWidth > innerWidth + 1,
        panelOverflowsX: [...document.querySelectorAll('div')].filter((d) => d.innerText?.startsWith('조건으로 고르기'))
          .some((d) => d.scrollWidth > d.clientWidth + 1),
      }));
      // [N명 추가]가 화면 안에 다 보여야 한다 — 팝오버가 아래로 넘치거나 시트 푸터에 깔리면 못 누른다
      const addBox = await page.getByRole('button', { name: /명 추가$/ }).boundingBox();
      const footer = await page.getByRole('button', { name: /^완료/ }).boundingBox().catch(() => null);
      const vh = testCase.viewport.height;
      if (!addBox || addBox.y + addBox.height > vh) row.problems.push(`[N명 추가]가 화면 밖 (${addBox?.y?.toFixed(0)}+${addBox?.height?.toFixed(0)} > ${vh})`);
      else if (footer && addBox.y + addBox.height > footer.y) row.problems.push('[N명 추가]가 시트 푸터에 깔린다');
      if (geo.bodyOverflowsX) row.problems.push('본문이 가로로 밀린다');
      if (geo.panelOverflowsX) row.problems.push('조건 패널이 가로로 넘친다');
      if (testCase.apply) {
        await page.getByRole('button', { name: /명 추가$/ }).click();
        await page.waitForTimeout(250);
        if (testCase.viewport.width < 640) {
          await page.getByRole('button', { name: /^완료/ }).click().catch(() => {});
          await page.waitForTimeout(250);
        } else {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(150);
        }
        const count = await page.getByTestId('count').innerText();
        if (count !== expected) row.problems.push(`선택 수 ${count} ≠ ${expected}`);
        const chip = page.getByText('현재 3학년 중 2학년 때 3반', { exact: false });
        if ((await chip.count()) === 0) row.problems.push('결과가 그룹 칩 하나로 접히지 않았다');
      }
      await page.screenshot({ path: join(OUT, `${testCase.id}.png`), animations: 'disabled' });
    } catch (e) {
      row.problems.push(`렌더 실패 — ${e.message.split('\n')[0]}`);
      await page.screenshot({ path: join(OUT, `${testCase.id}-FAILED.png`) }).catch(() => {});
    }
    for (const e of errors) row.problems.push(`페이지 오류 — ${e}`);
    results.push(row);
    await context.close();
  }
} finally {
  await browser.close();
}

let failed = 0;
for (const r of results) {
  if (r.problems.length === 0) console.log(`✓ ${r.id} ${r.note ?? ''}`);
  else { failed += 1; console.log(`✗ ${r.id}\n  - ${r.problems.join('\n  - ')}`); }
}
console.log(`\n스크린샷: ${OUT}`);
if (failed) process.exit(1);
