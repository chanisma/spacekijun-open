// 업무 체계 어휘 회귀 — 2026-09-20 신설 (Phase 0).
//
// `Event > Task > Work` → `Work > Task > Action` 재정의를 지키는 정적 검사.
// 사전 = docs/features/task-hierarchy.md, 절차 = docs/plans/2026-09-20-work-task-action-hierarchy.md
//
// 잡으려는 사고 4종:
//
//  ① **같은 낱말, 다른 개념을 함께 바꾸는 것.** `event` 는 캘린더 일정(행사·출장)이기도
//     하고, `action` 은 명령 팔레트·버튼이기도 하며, `student_puzzle_progress.event_id`
//     는 아카데미 퍼즐이다. 일괄 치환이 여기 닿으면 **오류 없이** 캘린더가 깨진다.
//
//  ② **이행 중에 구 어휘로 새 코드가 느는 것.** 이 작업은 여러 커밋에 걸치는데,
//     그 사이 누가 `.from('event')` 를 하나 더 추가하면 이행이 끝나도 남는다.
//
//  ③ **탭 값처럼 구/신이 교차하는 대응을 부분 문자열로 치환하는 것.**
//     `myWork → myTasks` 인데 `myEvents → myWorks` 다. `myWorks` 가 `myWork` 를
//     포함하므로 어느 순서로 치환해도 한쪽이 망가진다.
//
//  ④ **Phase 를 건너뛰는 것.** `Work` 라는 이름은 최하위(구)에서 최상위(신)로 올라간다.
//     Action 으로 먼저 비우지 않고 Event 를 Work 로 바꾸면 한 이름이 두 계층을 동시에
//     가리키는 커밋이 생긴다.
//
// **이 부류는 빌드도 타입 검사도 통과한다** — 정적 검사가 유일한 방어선이다.
//
// 실행: npx tsx scripts/task-vocabulary-test/run.mts
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// 탭 대응표는 **앱이 실제로 쓰는 것**을 가져온다 — 여기 베껴 쓰면 둘이 갈라져도 통과한다.
import { LEGACY_TASK_TABS, MY_TASKS_TABS, TASK_TABS } from '../../src/lib/taskTabs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'src');

/**
 * 이행이 어디까지 끝났는가. **Phase 를 마칠 때마다 한 칸 올린다.**
 *   0 사전·가드 · 1 Work→Action(클라) · 2 Event→Work(클라)
 *   3 문구·값 · 4 DB task_work* · 5 DB event · 6 문서·정리
 */
const CURRENT_PHASE = 5;

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : detail}`);
  if (!cond) fails += 1;
};
/** 아직 오지 않은 Phase 의 단언은 건너뛰되 무엇이 남았는지는 보여 준다. */
const later = (phase: number, name: string) => {
  if (CURRENT_PHASE >= phase) return false;
  console.log(`  · ${name} — 보류 (Phase ${phase})`);
  return true;
};

// ── 소스 수집 ───────────────────────────────────────────────────────────────
const SOURCES: string[] = [];
(function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) SOURCES.push(full);
  }
})(SRC);

const rel = (f: string) => relative(ROOT, f).split('\\').join('/');
const read = (f: string) => readFileSync(f, 'utf8');
/** supabase 가 생성하는 파일 — Phase 4·5 에서 통째로 다시 만들어지므로 표면 집계에서 뺀다 */
const GENERATED = 'src/integrations/supabase/types.ts';

function count(pattern: string, opts: { generated?: boolean; exclude?: string[] } = {}) {
  let total = 0;
  const files: string[] = [];
  for (const f of SOURCES) {
    if (!opts.generated && rel(f) === GENERATED) continue;
    if (opts.exclude?.includes(rel(f))) continue;
    const hits = read(f).match(new RegExp(pattern, 'g'));
    if (hits) {
      total += hits.length;
      files.push(rel(f));
    }
  }
  return { total, files };
}

// ── ① 범위 밖 카나리 — 모든 Phase 에서 검사 ──────────────────────────────────
//
// 사전 §4 의 자리들이다. 여기가 사라졌다면 위계 치환이 남의 도메인까지 닿은 것이다.
const OUT_OF_SCOPE: { file: string; needle: string; why: string }[] = [
  { file: 'src/types/domain.ts', needle: "'event'", why: '캘린더 MeetingKind (행사·출장)' },
  { file: 'src/hooks/useSchedule.ts', needle: "'event'", why: '캘린더 일정 kind' },
  { file: 'src/lib/scheduleUtils.ts', needle: "event: { short: '출장'", why: '캘린더 일정 라벨' },
  { file: 'src/services/notificationService.ts', needle: "case 'event': return '출장';", why: '캘린더 알림 라벨' },
  { file: 'src/services/googleCalendarExportService.ts', needle: "event: '출장'", why: '캘린더 export' },
  { file: 'src/services/googleCalendarService.ts', needle: "event: '출장'", why: '캘린더 연동' },
  { file: 'src/components/ui/action-search-bar.tsx', needle: 'ActionSearchBar', why: 'UI 명령 팔레트 — 새 Action 계층과 무관' },
];

console.log('① 범위 밖 카나리 — 같은 낱말, 다른 개념');
for (const c of OUT_OF_SCOPE) {
  const path = join(ROOT, c.file);
  check(
    `${c.why} — ${c.file}`,
    existsSync(path) && read(path).includes(c.needle),
    `\n      → "${c.needle}" 가 사라졌다. 위계 치환이 여기까지 닿았을 수 있다` +
      '\n      → docs/features/task-hierarchy.md §4 를 볼 것',
  );
}

// ── ② 어휘 사전이 있고 세 계층을 정의한다 ────────────────────────────────────
console.log('\n② 어휘 사전');
{
  const dictPath = join(ROOT, 'docs/features/task-hierarchy.md');
  const has = existsSync(dictPath);
  check('docs/features/task-hierarchy.md 가 있다', has, '\n      → 사전이 없으면 이 검사들의 근거가 없다');
  if (has) {
    const dict = read(dictPath);
    for (const term of ['Work', 'Task', 'Action', '업무', '할 일', '실행']) {
      check(`사전 항목: "${term}"`, dict.includes(term));
    }
  }
}

// ── ③ 탭 값 대응표 — 부분 문자열 충돌을 고정한다 ─────────────────────────────
//
// 사전 §3-1 과 같은 표여야 한다. Phase 3 에서 이 표가 `src/` 로 옮겨 가면
// 여기서 import 해 단일 출처로 만든다.
/** 구 → 신. 이름이 그대로인 탭(workflow·timeline)은 애초에 옮길 것이 없어 들어 있지 않다. */
// 2026-09-21: '내 할 일'이 별도 화면(`/my-tasks`)으로 나가면서 그쪽을 가리키던 값들은
// `MY_TASKS_TABS` 로 갈렸다. 충돌 판정은 **두 표를 합쳐서** 해야 한다 — `myWork` 는 여전히
// 받아 주는 구 값이고, `myWorks` 는 여전히 그것을 문자열로 품는다.
const TAB_VALUE_MAP: Record<string, string> = { ...LEGACY_TASK_TABS, ...MY_TASKS_TABS };

/** 신 값이 **다른** 구 값을 문자열로 품는 쌍 — 부분 문자열 치환이 망가뜨리는 자리 */
function substringCollisions(): string[] {
  const out: string[] = [];
  for (const [oldV, newV] of Object.entries(TAB_VALUE_MAP)) {
    if (oldV === newV) continue;
    for (const other of Object.keys(TAB_VALUE_MAP)) {
      if (other === oldV) continue;
      if (newV.includes(other)) out.push(`${oldV}→${newV} 가 구 값 ${other} 를 포함`);
    }
  }
  return out.sort();
}

/** 사전이 고정한 목록. 여기가 늘면 치환 규칙을 다시 짜야 한다. */
const DOCUMENTED_COLLISIONS = ['myEvents→myWorks 가 구 값 myWork 를 포함'];

console.log('\n③ 탭 값 대응표');
{
  const current = TASK_TABS.map((tab) => tab.value);
  check('현재 탭 값에 중복이 없다', new Set(current).size === current.length);
  check(
    '구 값이 현재 값과 겹치지 않는다',
    Object.keys(TAB_VALUE_MAP).every((old) => !current.includes(old as never)),
    '\n      → 겹치면 정규화가 무한히 제자리를 돈다',
  );
  const found = substringCollisions();
  check(
    `부분 문자열 충돌이 사전과 일치한다 (${found.length}건)`,
    JSON.stringify(found) === JSON.stringify(DOCUMENTED_COLLISIONS),
    `\n      → 발견: ${JSON.stringify(found)}` +
      `\n      → 사전: ${JSON.stringify(DOCUMENTED_COLLISIONS)}` +
      '\n      → 충돌이 늘었다면 탭 값 변경을 문자열 치환으로 처리할 수 없다.' +
      '\n        값 전체가 정확히 일치할 때만 바꿀 것 (docs/features/task-hierarchy.md §3-1)',
  );
}

// ── ④ 표면 증가 방지 — 이행 중에 구 어휘로 새 코드를 더하지 않는다 ───────────
//
// 상한은 "2026-09-20 착수 시점의 실측"이다. **줄어드는 것은 통과**, 느는 것만 막는다.
console.log('\n④ 구 어휘 표면 (상한 = 착수 시점 실측, 늘면 실패)');
const BASELINES: { name: string; pattern: string; max: number; hint: string }[] = [
  {
    name: "`.from('event')` 호출",
    pattern: "from\\('event'",
    max: 28,
    hint: 'Phase 5 에서 `.from(\'work\')` 가 된다. 그 전에는 늘리지 말 것',
  },
  {
    name: 'TaskWork · task_work 식별자 (생성 파일 제외)',
    pattern: 'TaskWork|task_work',
    max: 628,
    hint: 'Phase 1 에서 TaskAction 이 된다. workflow 는 유지이므로 이 수에 포함된다',
  },
];
for (const b of BASELINES) {
  const { total, files } = count(b.pattern);
  check(
    `${b.name}: ${total} ≤ ${b.max}`,
    total <= b.max,
    `\n      → ${files.length}개 파일에서 ${total}건 (상한 ${b.max})` +
      `\n      → ${b.hint}`,
  );
}

// ── ④-1 임베드 힌트 ↔ 실제 FK 제약 이름 ─────────────────────────────────────
//
// **FK 제약 이름은 API 계약이다.** PostgREST 임베드는 `manager:resource!fk_event_manager(...)` 처럼
// 제약 이름을 힌트로 쓴다. Phase 5a 에서 `fk_event_manager` 를 `work_manager_fkey` 로 "정리"했다가
// 업무 목록이 400(`Could not find a relationship`)으로 죽었다 — 배포된 구 번들도 같은 힌트를 쓰므로
// 호환 뷰로도 막을 수 없었다. 빌드·타입 검사·회귀·행 수 검증을 전부 통과한 결함이다.
//
// `supabase gen types` 가 만든 types.ts 에는 DB 의 실제 `foreignKeyName` 이 들어 있다 —
// 코드의 힌트가 전부 거기 있는지 대조한다. (제약 이름을 바꾸고 타입을 재생성하면 여기서 걸린다.)
console.log('\n④-1 임베드 힌트가 실제 FK 제약을 가리키는가');
{
  const types = read(join(ROOT, GENERATED));
  const known = new Set([...types.matchAll(/foreignKeyName:\s*"([^"]+)"/g)].map((m) => m[1]));
  const hints = new Map<string, string>();
  for (const f of SOURCES) {
    if (rel(f) === GENERATED) continue;
    for (const m of read(f).matchAll(/![a-z_]*(?:fkey|fk_)[a-z_]*/g)) hints.set(m[0].slice(1), rel(f));
  }
  check(`힌트 ${hints.size}종을 찾았다`, hints.size > 0);
  for (const [name, file] of hints) {
    check(
      `!${name}`,
      known.has(name),
      `\n      → ${file} 가 쓰는 제약이 DB 에 없다 — 이 임베드는 400 으로 죽는다` +
        '\n      → 제약 이름을 바꿨다면 되돌리거나, 같은 커밋에서 힌트를 함께 고칠 것',
    );
  }
}

// ── ⑤ Phase 진행 ────────────────────────────────────────────────────────────
console.log(`\n⑤ Phase 진행 (현재 ${CURRENT_PHASE})`);

// Phase 1 — Work 라는 이름을 비웠는가
if (!later(1, 'Phase 1 — 클라이언트 Work → Action')) {
  const tw = count('TaskWork(?!flow)');
  check(
    'TaskWork* 식별자가 없다 (TaskWorkflow* 는 유지)',
    tw.total === 0,
    `\n      → 남음: ${tw.files.slice(0, 8).join(', ')}${tw.files.length > 8 ? ' …' : ''}`,
  );
  check(
    'actionRegistry.ts 가 있다',
    existsSync(join(SRC, 'features/task-workflow/actionRegistry.ts')),
    '\n      → workRegistry.ts 를 actionRegistry.ts 로 옮길 것',
  );
  check(
    'workRegistry.ts 가 없다',
    !existsSync(join(SRC, 'features/task-workflow/workRegistry.ts')),
  );
}

// Phase 2 — 비운 이름을 Event 가 채웠는가
{
  const EVENT_FILES = [
    'EventCard.tsx', 'EventCreateDialog.tsx', 'EventDetailDialog.tsx', 'EventEditDialog.tsx',
    'EventGanttChart.tsx', 'EventList.tsx', 'EventTimelineFilters.tsx', 'EventTimelineTab.tsx',
    'guide/eventScenes.tsx',
  ];
  const WORK_FILES = [
    'WorkCard.tsx', 'WorkCreateDialog.tsx', 'WorkDetailDialog.tsx', 'WorkEditDialog.tsx',
    'WorkGanttChart.tsx', 'WorkList.tsx', 'WorkTimelineFilters.tsx', 'WorkTimelineTab.tsx',
    'guide/workScenes.tsx',
  ];
  const at = (f: string) => join(SRC, 'components/tasks', f);
  if (CURRENT_PHASE < 2) {
    // 아직이면 **원본이 그대로 있어야** 한다 — 일부만 손댄 상태를 잡는다
    const missing = EVENT_FILES.filter((f) => !existsSync(at(f)));
    check(
      `Event* 파일 ${EVENT_FILES.length}개가 그대로 있다 (Phase 2 미착수)`,
      missing.length === 0,
      `\n      → 사라짐: ${missing.join(', ')}` +
        '\n      → Phase 2 를 마쳤다면 CURRENT_PHASE 를 2 로 올릴 것',
    );
  } else {
    const left = EVENT_FILES.filter((f) => existsSync(at(f)));
    const absent = WORK_FILES.filter((f) => !existsSync(at(f)));
    check('Event* 파일이 남아 있지 않다', left.length === 0, `\n      → 남음: ${left.join(', ')}`);
    check('Work* 파일이 생겼다', absent.length === 0, `\n      → 없음: ${absent.join(', ')}`);
    const hooks = count('useEventsJsonb|useEventDetailJsonb|useCreateEventJsonb');
    check('구 Event 훅 이름이 없다', hooks.total === 0, `\n      → 남음: ${hooks.files.join(', ')}`);
  }
}

// Phase 3 — 문구와 값
if (!later(3, 'Phase 3 — 화면 문구 · 탭 값')) {
  check(
    '탭 값·라벨의 정본이 src/lib/taskTabs.ts 다',
    existsSync(join(SRC, 'lib/taskTabs.ts')),
  );
  const tabs = join(SRC, 'components/tasks/guide/tabs.ts');
  check(
    '안내 씬의 탭 상수가 정본을 import 한다 (베껴 쓰지 않는다)',
    existsSync(tabs) && read(tabs).includes("from '@/lib/taskTabs'"),
    '\n      → 베껴 쓰면 목업 탭 줄이 실제 화면과 조용히 어긋난다',
  );
  const old = count("'myEvents'|\"myEvents\"|'myWork'|\"myWork\"");
  check('구 탭 값(myWork · myEvents)이 남아 있지 않다', old.total === 0, `\n      → 남음: ${old.files.join(', ')}`);
  for (const phrase of ['내 이벤트', '이벤트 검색']) {
    const hit = count(phrase);
    check(`구 탭 라벨 "${phrase}" 가 없다`, hit.total === 0, `\n      → 남음: ${hit.files.join(', ')}`);
  }
  // 헤더는 2026-09-21 부터 탭 줄을 정본(`TASK_TABS`)에서 **생성**한다(아이콘만 표로 붙인다).
  // 예전엔 라벨을 직접 적었고, Phase 3 에서 **두 번 변환**돼 `내 업무`·`업무 검색` 이
  // `내 할 일`·`할 일 검색` 이 됐었다 → 라벨이 헤더에 다시 하드코딩되면 여기서 잡는다.
  const header = join(SRC, 'components/tasks/TaskHeader.tsx');
  const headerSrc = existsSync(header) ? read(header) : '';
  // 2026-10-05 탭 줄이 없어졌다(페이지 + 사이드바 서랍). 머리글이 정본에서 만드는 것은 업무 목록의 범위 전환뿐이다
  check('헤더가 범위 전환을 정본에서 생성한다', /WORK_LIST_SCOPES\.map\(/.test(headerSrc) && headerSrc.includes("from '@/lib/taskTabs'"));
  for (const tab of TASK_TABS) {
    check(
      `헤더에 탭 라벨 "${tab.label}" 을 베껴 쓰지 않았다`,
      !headerSrc.includes(`<span>${tab.label}</span>`),
      '\n      → 라벨은 src/lib/taskTabs.ts 에서만 온다',
    );
  }
  check(
    "'내 할 일'은 탭이 아니라 별도 화면이다",
    !TASK_TABS.some((tab) => (tab.value as string) === 'myTasks') && existsSync(join(SRC, 'features/work-ontology/TodayPage.tsx')),
  );
}

// Phase 4 — DB task_work* → task_action*
if (!later(4, 'Phase 4 — DB task_work* → task_action*')) {
  // 생성 파일(types.ts)에는 **호환 뷰**가 들어 있어 구 이름이 남는다 — 그건 의도된 것이라 뺀다.
  const tw = count('task_work(?!flow)');
  check('task_work* DB 이름이 없다 (생성 파일 제외)', tw.total === 0, `\n      → 남음: ${tw.files.slice(0, 8).join(', ')}`);
  // ⚠️ 여기서 잡는 `work_id` 는 **옛 `task_work_run.work_id`(= 작업 id)** 다. 새 어휘에서 `work_id` 는
  //    업무(Work)를 가리키는 이름이다(사전 §2 `task.event_id → task.work_id`). 업무를 가리키는 새 컬럼을
  //    가진 파일만 좁게 뺀다 — 그 파일에 옛 뜻의 work_id 가 섞이면 이 검사로는 못 잡으니 새로 늘리지 말 것.
  //    · services/workAiService.ts — task_ai_suggestion.work_id = 업무 id (2026-09-27, 업무 진행 화면)
  const WORK_REF_COLUMN_FILES = ['src/services/workAiService.ts'];
  const col = count('\\bwork_type\\b|\\bwork_id\\b', { exclude: WORK_REF_COLUMN_FILES });
  check('구 컬럼 이름(work_type · work_id)이 없다', col.total === 0, `\n      → 남음: ${col.files.slice(0, 6).join(', ')}`);
  // ⚠️ Storage 버킷은 **배포 뒤에** 옮긴다 — 배포된 구 클라이언트가 이 이름을 하드코딩한다.
  //    옮기기 전까지는 남아 있는 것이 정상이다(`…_compat_drop` 과 같은 시점).
  const bucket = count('task-work-documents');
  check(
    `Storage 버킷은 배포 후 이설 예정 (현재 ${bucket.total}곳)`,
    bucket.total > 0,
    '\n      → 이미 옮겼다면 이 검사를 "0이어야 한다"로 바꿀 것',
  );
}

// Phase 5 — DB event → work
if (!later(5, 'Phase 5 — DB event → work')) {
  // 생성 파일에는 **호환 뷰·래퍼**가 들어 있어 구 이름이 남는다 — 의도된 것이라 뺀다.
  const from = count("from\\('event'");
  check("`.from('event')` 가 없다", from.total === 0, `\n      → 남음: ${from.files.join(', ')}`);
  const rpc = count('get_task_event_detail|get_task_events|is_task_event_manager');
  check('구 RPC 이름이 없다', rpc.total === 0, `\n      → 남음: ${rpc.files.join(', ')}`);
  // ⚠️ 5b(배포 후)로 미룬 것 — **호환 층으로 감쌀 수 없어서** 구 번들이 그대로 읽는다.
  //    컬럼 `task.event_id` · `node_kind='event'` · `search_tasks` 판별자 `'event'`.
  const col = count('\\bevent_id\\b');
  check(
    `컬럼 event_id 는 5b 예정 (현재 ${col.total}곳)`,
    col.total > 0,
    '\n      → 이미 옮겼다면 이 검사를 "0이어야 한다"로 바꿀 것',
  );
}

console.log(fails === 0 ? '\n전부 통과' : `\n${fails}건 실패`);
process.exit(fails === 0 ? 0 : 1);
