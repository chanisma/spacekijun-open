// 관리자 대시보드 카탈로그 회귀 — `npx tsx scripts/admin-dashboard-test/run.mts`
//
// 이 화면의 실패 모드는 "조용함"이다. 건수를 세는 표 목록은 서버 RPC
// (`get_admin_dashboard_stats`)의 allowlist 에 있고, 라벨·그룹·이동 경로는
// 클라이언트 카탈로그에 있다. 둘이 어긋나도 **오류 없이** 나빠질 뿐이다:
//   · RPC 에만 있는 키 → 화면에서 '기타' 그룹에 영문 키 이름 그대로 뜬다.
//   · 카탈로그에만 있는 키 → 아무 데도 안 나온다(죽은 항목, 알 방법이 없다).
//   · route 오타 → 눌러도 아무 화면이 없다(라우터가 조용히 * 로 보낸다).
// 그래서 세 가지를 기계로 못 박는다.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATASET_CATALOG,
  DATASET_GROUPS,
  SKIP_REASON_LABEL,
  DATASET_STALE_HOURS,
  describeDatasetFreshness,
  formatDatasetTotal,
  groupDatasets,
  resolveDatasetEntry,
  summarizeDatasets,
  type DatasetCount,
} from '../../src/components/admin/adminDashboardCatalog';
import {
  ACADEMY_PROLOGUE_KEY,
  ACADEMY_STAGE_CATALOG,
  buildAcademyFunnel,
  buildAcademyPlayers,
  formatAcademyClassLabel,
  resolveAcademyStage,
  type AcademyChapterStat,
  type AcademyPlayer,
  type AcademyStats,
} from '../../src/components/admin/adminDashboardAcademy';
import {
  TAMA_STAGE_CATALOG,
  buildTamaStageRows,
  tamaFocusRate,
  tamaOldestWaitDays,
  tamaOpenOrders,
  tamaOwnersLine,
  type TamaStats,
} from '../../src/components/admin/adminDashboardTamagotchi';
import { STAGE_LABEL } from '../../src/features/tamagotchi/model/petModel';
import { TASK_PAGES } from '../../src/lib/taskTabs';

let pass = 0;
function ok(cond: boolean, name: string): void {
  if (!cond) {
    console.error('  ✗', name);
    process.exit(1);
  }
  console.log('  ✓', name);
  pass++;
}

const ROOT = join(import.meta.dirname, '..', '..');

/** 마이그레이션 중 `needle` 을 담은 **가장 최근** 파일 */
function latestMigrationWith(needle: string): { file: string; sql: string } {
  const dir = join(ROOT, 'supabase', 'migrations');
  const owning = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => readFileSync(join(dir, f), 'utf8').includes(needle));
  if (owning.length === 0) throw new Error(`${needle} 를 담은 마이그레이션을 찾지 못했습니다`);
  const file = owning[owning.length - 1];
  return { file, sql: readFileSync(join(dir, file), 'utf8') };
}

/**
 * allowlist 키를 뽑는다.
 *
 * 2026-10-08 부터 allowlist 는 `get_admin_dashboard_stats` 가 아니라 야간 스냅샷을 만드는
 * `admin_dashboard_count_datasets` 에 산다 — 그래서 함수 이름이 아니라 **allowlist 머리**
 * (`with allow(key, tbl, ts_col)`)를 담은 가장 최근 파일을 읽는다.
 */
function rpcDatasetKeys(): string[] {
  const { sql } = latestMigrationWith('with allow(key, tbl, ts_col)');
  // allowlist 표기는 시간이 지나며 바뀐다(`select * from (values` → `with allow(...) as (values`).
  // 시작은 첫 `(values`, 끝은 그 뒤 첫 `select` 로 잡아 두 형태를 모두 읽는다.
  const from = sql.indexOf('(values');
  if (from < 0) throw new Error('allowlist 블록(`(values`)을 찾지 못했습니다');
  // 끝은 **줄 첫머리의** select 로 잡는다. 단순 indexOf('select') 를 쓰면
  // `course_selection_submission` 안의 'select' 에 걸려 목록이 조용히 잘린다.
  const rest = sql.slice(from);
  const end = /\n[ \t]*select[ \t]/.exec(rest);
  const block = end ? rest.slice(0, end.index) : rest;
  const keys = [...block.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'\s*,/g)].map((m) => m[1]);
  if (keys.length === 0) throw new Error('allowlist 를 파싱하지 못했습니다');
  return keys;
}

/**
 * App.tsx 에 실제로 선언된 라우트 경로.
 *
 * 끝에 **선택 파라미터**가 붙은 라우트(`/academy/:place?`)는 그 앞부분(`/academy`)도
 * 실제로 열린다 — 이걸 모르면 멀쩡한 경로가 오타로 잡힌다.
 */
function declaredRoutes(): Set<string> {
  const app = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf8');
  const out = new Set<string>();
  for (const m of app.matchAll(/path="([^"]+)"/g)) {
    let path = m[1];
    out.add(path);
    // `/tasks/:page` 는 아무 조각이나 받지 않는다 — 열리는 것은 taskTabs 의 페이지뿐이다
    // (2026-10-05 탭 → 페이지). 패턴을 통째로 통과시키면 `/tasks/오타` 도 맞다고 나온다.
    if (path === '/tasks/:page') for (const page of TASK_PAGES) out.add(page.path);
    while (/\/:[^/]+\?$/.test(path)) {
      path = path.replace(/\/:[^/]+\?$/, '');
      out.add(path || '/');
    }
  }
  return out;
}

/** 게임 스토리 파일이 정본으로 갖는 장 제목 (`export const xTitle = '...'`) */
function storyTitle(file: string): string {
  const src = readFileSync(join(ROOT, 'src', 'features', 'academy', 'game', file), 'utf8');
  const m = /export const \w*[Tt]itle = '([^']+)'/.exec(src);
  if (!m) throw new Error(`${file} 에서 제목 상수를 찾지 못했습니다`);
  return m[1];
}

console.log('관리자 대시보드 카탈로그');

const rpcKeys = rpcDatasetKeys();
const catalogKeys = DATASET_CATALOG.map((e) => e.key);

ok(rpcKeys.length > 40, `RPC allowlist 파싱 (${rpcKeys.length}개)`);
ok(new Set(rpcKeys).size === rpcKeys.length, 'RPC allowlist 에 중복 키 없음');
ok(new Set(catalogKeys).size === catalogKeys.length, '카탈로그에 중복 키 없음');

const missingInCatalog = rpcKeys.filter((k) => !catalogKeys.includes(k));
ok(
  missingInCatalog.length === 0,
  `RPC 키가 모두 카탈로그에 있다 (누락: ${missingInCatalog.join(', ') || '없음'})`,
);

const deadEntries = catalogKeys.filter((k) => !rpcKeys.includes(k));
ok(
  deadEntries.length === 0,
  `카탈로그에 죽은 항목 없음 (RPC 에 없는 키: ${deadEntries.join(', ') || '없음'})`,
);

const groupIds = new Set(DATASET_GROUPS.map((g) => g.id));
const badGroup = DATASET_CATALOG.filter((e) => !groupIds.has(e.group)).map((e) => e.key);
ok(badGroup.length === 0, `모든 항목이 정의된 그룹에 속한다 (이상: ${badGroup.join(', ') || '없음'})`);

// '기타'는 미등록 키의 착지점이므로 그룹 정의에 반드시 있어야 한다
ok(groupIds.has('other'), "미등록 키 착지 그룹('other')이 정의돼 있다");
ok(resolveDatasetEntry('완전히_없는_키').group === 'other', '미등록 키는 기타 그룹으로 떨어진다');
ok(resolveDatasetEntry('tasks').label === '세부 할 일', '등록된 키는 카탈로그 라벨을 쓴다');

const routes = declaredRoutes();
const badRoutes = DATASET_CATALOG.filter((e) => e.route && !routes.has(e.route.split('?')[0])).map(
  (e) => `${e.key}→${e.route}`,
);
ok(badRoutes.length === 0, `route 가 모두 실제 라우트다 (이상: ${badRoutes.join(', ') || '없음'})`);

// ------------------------------------------------------------------ 집계 함수
const exact = (total: number, recent: number | null, skipped: DatasetCount['skipped'] = null): DatasetCount =>
  ({ total, recent, exact: true, skipped, as_of: null });

const fixture: Record<string, DatasetCount> = {
  tasks: exact(83, 2),
  events: exact(27, 0),
  meetings: exact(267, 189),
  afterschool: exact(1083, null, 'no_timestamp'), // created_at 이 없는 표
  // 20MB 를 넘어 서버가 세지 않은 표 — 추정치이고 recent 도 없다
  kg_entities: { total: 100951, recent: null, exact: false, skipped: 'too_large', as_of: '2026-08-09T07:46:59+09:00' },
  깜짝등장_새표: exact(5, 5), // 카탈로그 미등록
};

const grouped = groupDatasets(fixture);
const workRows = grouped.find((g) => g.id === 'work')?.rows ?? [];
ok(
  workRows.map((r) => r.key).join(',') === 'events,tasks',
  '그룹 안 순서는 카탈로그 순서를 따른다(건수순 아님)',
);
ok(
  grouped.find((g) => g.id === 'other')?.rows[0]?.key === '깜짝등장_새표',
  '미등록 키는 기타 그룹에 담긴다',
);
ok(grouped.every((g) => g.rows.length > 0), '빈 그룹은 만들지 않는다');
ok(groupDatasets({}).length === 0, '자료가 없으면 그룹도 없다(빈 배열)');

const summary = summarizeDatasets(fixture);
ok(summary.all === 83 + 27 + 267 + 1083 + 100951 + 5, '총계는 추정치까지 포함한 모든 표의 합');
ok(summary.recent === 2 + 0 + 189 + 5, '최근 30일 합계는 null 을 0으로 센다(=하한)');
ok(
  summary.top.map((r) => r.key).join(',') === 'meetings,깜짝등장_새표,tasks',
  '상위 목록은 최근 신규 내림차순이고 0건은 제외한다',
);
ok(summarizeDatasets({}).top.length === 0, '자료가 없으면 상위 목록도 비어 있다');
ok(summarizeDatasets(fixture, 2).top.length === 2, 'topN 을 지킨다');

// ------------------------------------------------- 정확/추정 표시 (500 재발 방지)
// 큰 표를 매번 세면 authenticated 의 8초 statement_timeout 을 넘겨 500 이 났다.
// 서버는 이제 추정치를 주고, 화면은 그것을 정확한 값처럼 그리면 안 된다.
ok(formatDatasetTotal(exact(83, 2)) === '83', '정확한 값은 숫자만');
ok(
  formatDatasetTotal({ total: 100951, recent: null, exact: false, skipped: 'too_large', as_of: null })
    === '약 100,951',
  "추정치는 '약' 을 붙이고 천단위 구분",
);
ok(summary.allApproximate === true, '추정치가 섞이면 합계도 추정으로 표시된다');
ok(
  summarizeDatasets({ tasks: exact(83, 2) }).allApproximate === false,
  '전부 정확하면 합계도 정확으로 표시된다',
);
// 상위 목록은 recent 기준이라 recent 가 없는 추정 표는 못 들어온다 — 착시 방지
ok(
  !summary.top.some((r) => r.key === 'kg_entities'),
  'recent 를 못 구한 표는 최근 신규 상위에 끼지 않는다',
);
// 사유 라벨이 비어 있으면 화면이 "0건"과 "못 셌음"을 구분하지 못한다
ok(
  SKIP_REASON_LABEL.no_timestamp !== undefined &&
    SKIP_REASON_LABEL.too_large !== undefined &&
    SKIP_REASON_LABEL.budget !== undefined,
  '생략 사유 3종에 모두 화면 문구가 있다',
);

// ─────────────────────────────────────────── 별빛 탐구 아카데미 장별 진행
//
// 여기도 실패 모드가 "조용함"이다. 서버 `academy` 블록의 장 키와 클라이언트 라벨이
// 어긋나도 오류가 아니라 **영문 키가 그대로 화면에 뜨거나 장이 통째로 빠질** 뿐이고,
// 장 제목이 게임과 달라져도 아무도 모른다.

console.log('\n별빛 탐구 아카데미');

/** RPC 의 `declared(ord, key, final_step)` 블록에서 (키, 마지막 단계) 를 뽑는다 */
function rpcAcademyStages(): Array<{ key: string; finalStep: number }> {
  const dir = join(ROOT, 'supabase', 'migrations');
  const owning = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => readFileSync(join(dir, f), 'utf8').includes('declared(ord, key, final_step)'));
  if (owning.length === 0) throw new Error('academy declared 블록을 가진 마이그레이션을 찾지 못했습니다');

  const sql = readFileSync(join(dir, owning[owning.length - 1]), 'utf8');
  const from = sql.indexOf('declared(ord, key, final_step)');
  // 마지막 항목까지 포함해야 한다 — 닫는 괄호 **다음**까지 자른다(빠뜨리면 한 줄이 조용히 준다)
  const block = sql.slice(from, sql.indexOf(')', sql.indexOf('sky_first_light', from)) + 1);
  const rows = [...block.matchAll(/\(\s*\d+\s*,\s*'([a-z_]+)'\s*,\s*(\d+)\s*\)/g)];
  if (rows.length === 0) throw new Error('academy declared 목록을 파싱하지 못했습니다');
  return rows.map((m) => ({ key: m[1], finalStep: Number(m[2]) }));
}

const rpcStages = rpcAcademyStages();
const stageKeys = ACADEMY_STAGE_CATALOG.map((s) => s.key);

ok(rpcStages.length === 6, `RPC 장 목록 파싱 (${rpcStages.length}개: 5장 + 막간)`);
ok(new Set(stageKeys).size === stageKeys.length, '장 카탈로그에 중복 키 없음');

// 프롤로그는 academy_chapters 가 아니라 academy_prologues 에 있어 RPC 의 chapters 목록에 없다.
// 클라이언트가 깔때기 맨 앞에 합성하므로 카탈로그에는 있어야 한다.
ok(!rpcStages.some((s) => s.key === ACADEMY_PROLOGUE_KEY), '프롤로그는 RPC 장 목록에 없다(다른 표)');
ok(stageKeys[0] === ACADEMY_PROLOGUE_KEY, '카탈로그 첫 항목은 프롤로그다(깔때기 분모)');

const missingStages = rpcStages.filter((s) => !stageKeys.includes(s.key)).map((s) => s.key);
ok(missingStages.length === 0, `RPC 장 키가 모두 카탈로그에 있다 (누락: ${missingStages.join(', ') || '없음'})`);

const deadStages = stageKeys.filter((k) => k !== ACADEMY_PROLOGUE_KEY && !rpcStages.some((s) => s.key === k));
ok(deadStages.length === 0, `카탈로그에 죽은 장 없음 (RPC 에 없는 키: ${deadStages.join(', ') || '없음'})`);

ok(
  stageKeys.filter((k) => k !== ACADEMY_PROLOGUE_KEY).join(',') === rpcStages.map((s) => s.key).join(','),
  '카탈로그 순서가 RPC 의 이야기 순서와 같다',
);

// 장 제목은 게임 스토리 파일이 정본 — 여기 옮겨 적은 라벨이 그것을 담고 있어야 한다.
// (스토리 모듈을 import 하면 관리자 번들이 아카데미 에셋 그래프를 끌어온다)
const TITLE_SOURCE: Record<string, string> = {
  [ACADEMY_PROLOGUE_KEY]: 'prologueStory.ts',
  first_star: 'chapterStory.ts',
  library_questions: 'libraryChapterStory.ts',
  dorm_first_plan: 'dormChapterStory.ts',
  post_first_letter: 'postChapterStory.ts',
  sky_first_light: 'skyChapterStory.ts',
};
for (const [key, file] of Object.entries(TITLE_SOURCE)) {
  const title = storyTitle(file);
  ok(
    resolveAcademyStage(key).label.includes(title),
    `${key} 라벨이 게임 제목('${title}')을 담는다`,
  );
}

// 단계 수는 서버 선언이 DB CHECK(academy_chapters_step_check)와 같아야 한다.
// 다르면 진행률 막대가 조용히 틀린다 — 값 자체는 화면이 아니라 서버에서 오므로
// 여기서는 "선언이 이야기 파일의 상수와 맞는가"만 못 박는다(상수가 있는 두 장).
const skySrc = readFileSync(join(ROOT, 'src/features/academy/game/skyChapterStory.ts'), 'utf8');
const postSrc = readFileSync(join(ROOT, 'src/features/academy/game/postChapterStory.ts'), 'utf8');
ok(
  rpcStages.find((s) => s.key === 'sky_first_light')?.finalStep ===
    Number(/SKY_CHAPTER_END = (\d+)/.exec(skySrc)?.[1]),
  'RPC 의 제5장 단계 수 = SKY_CHAPTER_END',
);
ok(
  rpcStages.find((s) => s.key === 'post_first_letter')?.finalStep ===
    Number(/POST_CHAPTER_END = (\d+)/.exec(postSrc)?.[1]),
  'RPC 의 제4장 단계 수 = POST_CHAPTER_END',
);

ok(resolveAcademyStage('제6장_없는_키').label === '제6장_없는_키', '미등록 장은 키 이름 그대로 보인다');
ok(ACADEMY_STAGE_CATALOG.filter((s) => s.interlude).length === 1, '막간은 하나이고 장과 구분된다');

// ------------------------------------------------------------ 깔때기 계산
const stat = (o: Partial<AcademyChapterStat> & { key: string }): AcademyChapterStat => ({
  final_step: null,
  student_total: 0,
  student_done: 0,
  student_progress_sum: 0,
  faculty_total: 0,
  faculty_done: 0,
  step_max: null,
  last_activity: null,
  ...o,
});

const academyFixture: AcademyStats = {
  players: { total: 12, student: 10, faculty: 2, student_active_7d: 4, active_7d: 5 },
  // 건너뛴 2명도 student_done 에 들어 있다(라이브: skipped 행도 completed_at 을 찍는다)
  prologue: { student_total: 10, student_done: 8, student_skipped: 2, faculty_total: 2, faculty_done: 2 },
  chapters: [
    stat({ key: 'first_star', final_step: 16, student_total: 8, student_done: 5, student_progress_sum: 12, step_max: 16, faculty_total: 2, faculty_done: 2 }),
    stat({ key: 'library_questions', final_step: 18, student_total: 5, student_done: 5, step_max: 18 }),
    stat({ key: 'dorm_first_plan', final_step: 36, student_total: 4, student_done: 0, student_progress_sum: 36, step_max: 20 }),
    stat({ key: 'post_first_letter', final_step: 30 }),
    stat({ key: 'postlude', final_step: 9 }),
    // 서버 선언(29)보다 진행된 기록(31) = 선언이 낡았다
    stat({ key: 'sky_first_light', final_step: 29, student_total: 1, student_done: 0, student_progress_sum: 31, step_max: 31 }),
  ],
};

const funnel = buildAcademyFunnel(academyFixture);
const byKey = new Map(funnel.map((r) => [r.key, r]));

ok(funnel.length === 7, '프롤로그를 앞에 붙여 7줄(프롤로그 + 5장 + 막간)');
ok(funnel[0].key === ACADEMY_PROLOGUE_KEY, '첫 줄은 프롤로그');
ok(
  funnel.map((r) => r.key).slice(1).join(',') === academyFixture.chapters.map((c) => c.key).join(','),
  '장 순서는 서버가 준 순서를 그대로 쓴다',
);

ok(byKey.get('first_star')!.studentInProgress === 3, '진행 중 = 도달 − 완료');
ok(byKey.get('first_star')!.reachRatio === 0.8, '깔때기 비율의 분모는 프롤로그 도달 인원(8/10)');
ok(byKey.get(ACADEMY_PROLOGUE_KEY)!.reachRatio === 1, '첫 단계의 깔때기 비율은 1');
ok(byKey.get(ACADEMY_PROLOGUE_KEY)!.skipped === 2, '프롤로그는 건너뛴 인원을 따로 들고 있다');
ok(byKey.get('first_star')!.skipped === null, '건너뜀은 프롤로그 전용이다');
// 건너뛰기도 completed_at 을 찍으므로 그대로 세면 안 읽은 사람이 '완료'가 된다
ok(byKey.get(ACADEMY_PROLOGUE_KEY)!.studentCompleted === 6, '프롤로그 끝까지 = 완료 8 − 건너뜀 2');
ok(byKey.get('first_star')!.studentCompleted === 5, '다른 장은 끝까지 = 완료 그대로');
// 전원이 건너뛴 라이브 상황(완료 1 · 건너뜀 1)이 0 으로 떨어지고 음수가 되지 않는다
const allSkipped = buildAcademyFunnel({
  players: { total: 1, student: 1, faculty: 0, student_active_7d: 1, active_7d: 1 },
  prologue: { student_total: 1, student_done: 1, student_skipped: 1, faculty_total: 0, faculty_done: 0 },
  chapters: [],
});
ok(allSkipped[0].studentCompleted === 0, '전원이 건너뛰면 끝까지 감상 0명');

// 완료자를 섞으면 "어디까지 갔는지"가 평균에 묻힌다 → 진행 중인 사람만으로 센다
ok(
  byKey.get('first_star')!.inProgressRatio === 12 / (3 * 16),
  '진행 중 평균은 완료자를 빼고 계산한다',
);
ok(byKey.get('dorm_first_plan')!.inProgressRatio === 36 / (4 * 36), '진행 중만 있는 장도 같은 식');
ok(byKey.get('library_questions')!.inProgressRatio === null, '전원 완료면 진행 중 평균은 없다');
ok(byKey.get('post_first_letter')!.inProgressRatio === null, '도달 0명이면 진행 중 평균은 없다');
ok(byKey.get('post_first_letter')!.reachRatio === 0, '도달 0명이면 막대도 0');

ok(byKey.get('sky_first_light')!.stepDrift === true, '선언보다 진행된 기록이 있으면 drift 로 드러낸다');
ok(byKey.get('first_star')!.stepDrift === false, '선언과 맞으면 drift 아님');
ok(byKey.get('sky_first_light')!.inProgressRatio === 1, 'drift 가 있어도 진행률은 100% 를 넘지 않는다');
ok(byKey.get('postlude')!.interlude === true, '막간은 막간으로 표시된다');
ok(byKey.get('first_star')!.facultyInProgress === 0, '교직원 진행 중도 같은 식으로 센다');

// 아무도 시작하지 않았을 때 0으로 나누지 않는다
const emptyFunnel = buildAcademyFunnel({
  players: { total: 0, student: 0, faculty: 0, student_active_7d: 0, active_7d: 0 },
  prologue: { student_total: 0, student_done: 0, student_skipped: 0, faculty_total: 0, faculty_done: 0 },
  chapters: [stat({ key: 'first_star', final_step: 16 })],
});
ok(emptyFunnel.every((r) => r.reachRatio === 0 && r.inProgressRatio === null), '참여자 0명이어도 NaN 이 없다');

// 막간은 깔때기 분모가 될 수 없다 — 장 사이의 관문이라 도달 인원이 장보다 적다
const interludeFirst = buildAcademyFunnel({
  players: { total: 1, student: 1, faculty: 0, student_active_7d: 0, active_7d: 0 },
  prologue: { student_total: 0, student_done: 0, student_skipped: 0, faculty_total: 0, faculty_done: 0 },
  chapters: [stat({ key: 'postlude', final_step: 9, student_total: 4 }), stat({ key: 'first_star', final_step: 16, student_total: 2 })],
});
ok(interludeFirst[0].reachRatio === 0, '막간은 분모 후보에서 제외된다(프롤로그 0명 → 전부 0)');

// ------------------------------------------------------------ 참여자 명단
//
// 깔때기와 달리 여기는 **사람 이름이 걸린 화면**이라 조용한 실패가 더 나쁘다:
//   · 학반을 못 풀면 빈칸이 아니라 '없음'을 지어낼 수 있고,
//   · 명단이 상한에 잘렸는데 아무 말이 없으면 "이게 전부"로 읽힌다.
//   · 완료를 100% 막대로 그리면 '다 한 사람'과 '마지막 단계인 사람'이 같아 보인다.

const player = (o: Partial<AcademyPlayer> & { user_id: string }): AcademyPlayer => ({
  name: '아무개',
  is_student: true,
  grade: null,
  class: null,
  number: null,
  stage_key: ACADEMY_PROLOGUE_KEY,
  stage_step: null,
  stage_final_step: null,
  stage_done: false,
  prologue_skipped: null,
  last_seen: null,
  ...o,
});

const playersFixture: AcademyStats = {
  ...academyFixture,
  players: { total: 5, student: 4, faculty: 1, student_active_7d: 3, active_7d: 4 },
  players_list: [
    player({ user_id: 'u1', name: '송소율', grade: '3', class: '3', number: '15', stage_key: 'first_star', stage_step: 6, stage_final_step: 16, prologue_skipped: false }),
    player({ user_id: 'u2', name: '테스트학생', grade: '2', class: '10', number: '1', stage_key: 'dorm_first_plan', stage_step: 1, stage_final_step: 36, prologue_skipped: true }),
    player({ user_id: 'u3', name: '권민결', is_student: false, stage_key: 'sky_first_light', stage_step: 29, stage_final_step: 29, stage_done: true }),
    // 서버 선언이 낡아 진행 기록이 단계 수를 넘은 경우(깔때기의 drift 와 같은 상황)
    player({ user_id: 'u4', name: '  ', stage_key: '제6장_없는_키', stage_step: 40, stage_final_step: 29 }),
    // 프롤로그만 있는 사람 — 단계 수를 서버가 모르므로 막대가 없다
    player({ user_id: 'u5', name: '새내기', stage_step: null, stage_final_step: null }),
  ],
};

const { rows: playerRows, hidden } = buildAcademyPlayers(playersFixture);
const byId = new Map(playerRows.map((r) => [r.key, r]));

ok(playerRows.length === 5, '명단이 사람 수만큼 펼쳐진다');
ok(
  playerRows.map((r) => r.key).join(',') === 'u1,u2,u3,u4,u5',
  '순서는 서버가 준 그대로다(최근 활동순 — 여기서 다시 정렬하면 상한 200명과 기준이 갈린다)',
);
ok(hidden === 0, '총계와 명단 길이가 같으면 생략된 인원이 없다');

// 상한(200명)에 걸리면 "외 N명"을 말할 수 있어야 한다 — 총계는 상한과 무관하게 정확하다
ok(
  buildAcademyPlayers({ ...playersFixture, players: { ...playersFixture.players, total: 630 } }).hidden === 625,
  '상한에 잘린 인원 = 총계 − 명단 길이',
);
// 총계가 명단보다 작게 오는 일은 없어야 하지만, 와도 음수를 보여 주지 않는다
ok(
  buildAcademyPlayers({ ...playersFixture, players: { ...playersFixture.players, total: 2 } }).hidden === 0,
  '생략 인원이 음수가 되지 않는다',
);
// 구버전 서버(명단 키 없음) — "외 N명"만 덩그러니 남지 않게 0 이어야 한다
const noList = buildAcademyPlayers(academyFixture);
ok(noList.rows.length === 0 && noList.hidden === 0, '서버가 명단을 주지 않으면 빈 서랍(생략 인원도 0)');

ok(byId.get('u1')!.classLabel === '3-3 15번', '학생 학반은 이메일 prefix 로 푼 meta 를 그대로 조립한다');
ok(byId.get('u3')!.classLabel === null, '교직원에게는 학반이 없다');
ok(byId.get('u5')!.classLabel === null, '학반을 못 풀면 지어내지 않고 이름만 둔다');
ok(formatAcademyClassLabel(player({ user_id: 'x', grade: '1', class: '4' })) === '1-4', '번호가 없으면 학년-반까지만');
ok(formatAcademyClassLabel(player({ user_id: 'x', grade: '1' })) === '1학년', '반이 없으면 학년만');
ok(formatAcademyClassLabel(player({ user_id: 'x', number: '7' })) === null, '학년이 없으면 번호만으로 만들지 않는다');

ok(byId.get('u1')!.stage.label.includes('제1장'), '현재 장 라벨이 붙는다');
ok(byId.get('u5')!.stage.key === ACADEMY_PROLOGUE_KEY, '챕터 기록이 없는 사람은 프롤로그다');
ok(byId.get('u4')!.stage.label === '제6장_없는_키', '미등록 장은 키 이름 그대로 보인다(사라지지 않는다)');

ok(byId.get('u1')!.progressRatio === 6 / 16, '진행 중이면 단계 비율을 그린다');
ok(byId.get('u3')!.progressRatio === null, '완료는 막대를 그리지 않는다(마지막 단계와 구분해야 한다)');
ok(byId.get('u5')!.progressRatio === null, '단계 수를 모르면(프롤로그) 막대가 없다');
ok(byId.get('u4')!.progressRatio === 1, '선언보다 진행된 기록도 100% 를 넘지 않는다');

ok(byId.get('u2')!.skippedPrologue === true, '프롤로그 건너뜀은 완료와 갈라 적는다');
ok(byId.get('u1')!.skippedPrologue === false, '끝까지 본 사람은 건너뜀이 아니다');
ok(byId.get('u5')!.skippedPrologue === false, '프롤로그 기록이 없으면(null) 건너뜀으로 치지 않는다');
ok(byId.get('u4')!.name === '이름 없음', '이름이 비어도 줄이 사라지지 않는다');
ok(byId.get('u3')!.isStudent === false, '교직원 여부가 줄마다 남는다(시험 플레이를 참여로 오해하지 않게)');

// ────────────────────────────────────── 기능별 자료 = 야간 스냅샷 (2026-10-08)
//
// 대시보드를 열 때마다 표 60여 개를 세느라 콜드에서 3~5초(8초 제한의 턱밑)가 걸렸다.
// 지금은 스냅샷을 읽는다. 아래가 되돌아가도 **오류는 없고 느려질 뿐**이라 정적으로 못 박는다.
{
  const stats = latestMigrationWith('function public.get_admin_dashboard_stats()');
  const body = stats.sql.slice(stats.sql.indexOf('function public.get_admin_dashboard_stats()'));
  const fnEnd = body.indexOf('$function$;');
  const fn = body.slice(0, fnEnd);
  ok(!/execute format\('select count\(\*\)/.test(fn), '대시보드 RPC 가 표를 전수로 세지 않는다(스냅샷을 읽는다)');
  ok(fn.includes('admin_dashboard_snapshot'), '대시보드 RPC 가 스냅샷 표를 읽는다');
  ok(/'bootstrap', 3500, 20\)/.test(fn), '스냅샷이 없을 때만 낮 예산(3.5초·20MB)으로 한 번 만든다');
  ok(fn.includes("'generated_at', v_snap->'generated_at'"), 'counting 에 스냅샷 기준 시각을 싣는다(화면이 언제 것인지 말한다)');

  const refresh = latestMigrationWith('function public.refresh_admin_dashboard_datasets()');
  const rfn = refresh.sql.slice(refresh.sql.indexOf('function public.refresh_admin_dashboard_datasets()'));
  ok(/is_admin\(\)/.test(rfn.slice(0, rfn.indexOf('$function$;'))), '[지금 다시 세기]는 관리자만');
  // 낮(authenticated, statement_timeout 8초)에 큰 상한으로 세면 500 이 재발한다(20260903 사고)
  ok(/'manual', 3500, 20\)/.test(rfn), '[지금 다시 세기]는 8초 제한 안의 예산·상한을 쓴다');
  ok(/interval '1 minute'/.test(rfn), '연달아 누르면 다시 세지 않는다(1분)');

  const cron = latestMigrationWith("'admin-dashboard-snapshot'");
  ok(/cron\.schedule\(\s*'admin-dashboard-snapshot',\s*'30 19 \* \* \*'/.test(cron.sql), '야간 집계 = 매일 19:30 UTC(04:30 KST)');
  ok(/admin_dashboard_snapshot_save\('nightly'/.test(cron.sql), '야간 집계는 nightly 출처로 저장한다');
  ok(
    /revoke all on function public\.admin_dashboard_count_datasets\(int, int\) from public, anon, authenticated/.test(cron.sql),
    '내부 세기 함수는 클라이언트가 직접 못 부른다(예산·상한을 마음대로 줄 수 있다)',
  );
}

// 기준 시각 문구 — 숫자가 언제 것인지 말하지 않는 대시보드는 조용히 거짓말을 한다
{
  const base = { counted: 1, estimated: 0, elapsed_ms: 1, budget_hit: false, size_cap_mb: 20 };
  const now = new Date('2026-10-09T12:00:00+09:00');
  const fresh = describeDatasetFreshness({ ...base, generated_at: '2026-10-09T04:30:00+09:00', source: 'nightly' }, now);
  ok(fresh.label.includes('야간 집계') && !fresh.stale, '오늘 새벽 야간 집계는 낡지 않았다');
  ok(/\d+\/\d+ \d\d:\d\d/.test(fresh.label), '기준 시각을 월/일 시:분으로 적는다');
  const old = describeDatasetFreshness(
    { ...base, generated_at: new Date(now.getTime() - (DATASET_STALE_HOURS + 1) * 3_600_000).toISOString(), source: 'nightly' },
    now,
  );
  ok(old.stale, `${DATASET_STALE_HOURS}시간을 넘으면 낡았다고 말한다(크론이 멈춤)`);
  ok(describeDatasetFreshness({ ...base, source: 'manual', generated_at: now.toISOString() }, now).label.includes('수동'), '수동 집계는 수동이라고 적는다');
  ok(!describeDatasetFreshness(base, now).stale, '구버전 서버(기준 시각 없음) = 방금 센 값');
  ok(describeDatasetFreshness({ ...base, generated_at: 'x' }, now).stale, '기준 시각을 못 읽으면 낡은 것으로 취급한다');
  ok(DATASET_STALE_HOURS > 24 && DATASET_STALE_HOURS < 48, '낡음 문턱은 하루(야간 집계 주기)보다 길고 이틀보다 짧다');
}

// ────────────────────────────────────────────────────── 다마고찌 블록
{
  // 단계 이름의 정본은 게임 모델 — 관리자 번들이 그것을 import 하지 않으므로 여기서 대조한다
  ok(
    TAMA_STAGE_CATALOG.length === Object.keys(STAGE_LABEL).length &&
      TAMA_STAGE_CATALOG.every((s) => STAGE_LABEL[s.key as keyof typeof STAGE_LABEL] === s.label),
    '단계 카탈로그 = 게임 모델 STAGE_LABEL(순서·이름)',
  );
  ok(
    TAMA_STAGE_CATALOG.map((s) => s.key).join() === Object.keys(STAGE_LABEL).join(),
    '단계 순서가 성장 순서와 같다',
  );

  const rows = buildTamaStageRows({ egg: 10, baby: 2, teen: 1 });
  ok(rows.length === 5, '0마리 단계도 행으로 남는다(빠지면 «그 단계가 없다»로 읽힌다)');
  ok(rows.find((r) => r.key === 'adult')!.count === 0, '어른 0마리');
  ok(Math.abs(rows.find((r) => r.key === 'egg')!.ratio - 10 / 13) < 1e-9, '비율 분모 = 전체 펫');
  const odd = buildTamaStageRows({ egg: 1, ghost: 2, '?': 1 });
  ok(odd.some((r) => r.key === 'ghost' && r.label === 'ghost'), '모르는 단계는 키 이름 그대로 뒤에 붙는다');
  ok(odd.some((r) => r.key === '?' && r.label === '단계 모름'), '단계 없음(?)은 «단계 모름»');
  ok(buildTamaStageRows({}).every((r) => r.ratio === 0), '펫이 없어도 0으로 나누지 않는다');

  const tama = (over: Partial<TamaStats['orders']> = {}): TamaStats => ({
    owners: { total: 13, student: 11, teacher: 1, admin: 1, other: 0 },
    pets: { total: 13, resting: 0, sick: 0, by_stage: { egg: 13 } },
    care: { today: 13, active_7d: 13, students_3days: 0 },
    daily: [],
    activity_30d: { gacha: 9, trades: 0, diary: 5, focus_started: 3, focus_completed: 0, visits: 0, coins: 4 },
    orders: { character_open: 0, decor_open: 0, oldest_open_at: null, ...over },
    event: null,
    push: { subscriptions: 3, users: 2, failing: 0 },
  });
  const now = new Date('2026-10-10T12:00:00+09:00');
  ok(tamaOpenOrders(tama({ character_open: 1, decor_open: 2 })) === 3, '열린 의뢰 = 캐릭터 + 꾸미기');
  ok(tamaOldestWaitDays(tama(), now) === null, '열린 의뢰가 없으면 대기 일수 없음');
  ok(
    tamaOldestWaitDays(tama({ decor_open: 1, oldest_open_at: '2026-10-07T09:00:00+09:00' }), now) === 3,
    '가장 오래된 의뢰가 며칠째인지',
  );
  ok(
    tamaOldestWaitDays(tama({ decor_open: 0, oldest_open_at: '2026-10-07T09:00:00+09:00' }), now) === null,
    '의뢰가 다 닫혔으면 남은 시각이 있어도 대기 일수를 말하지 않는다',
  );
  ok(tamaOwnersLine(tama().owners) === '교사 1 · 관리자 1', '교직원 줄(학생은 본문)');
  ok(tamaOwnersLine({ total: 3, student: 3, teacher: 0, admin: 0, other: 0 }) === '', '학생뿐이면 교직원 줄이 비어 있다');
  ok(tamaFocusRate(tama().activity_30d) === 0, '시작 3 · 완주 0 = 0%');
  ok(tamaFocusRate({ ...tama().activity_30d, focus_started: 0 }) === null, '시작이 없으면 완주율을 말하지 않는다(0% 금지)');

  // 서버 블록 키 ↔ 클라이언트 계약 — 이름이 어긋나면 화면이 undefined 를 그린다
  const stats = latestMigrationWith('function public.get_admin_dashboard_stats()');
  for (const key of ['owners', 'pets', 'care', 'daily', 'activity_30d', 'orders', 'event', 'push', 'by_stage', 'character_open', 'decor_open', 'oldest_open_at', 'students_3days', 'focus_completed']) {
    ok(stats.sql.includes(`'${key}'`), `다마고찌 블록이 '${key}' 를 싣는다`);
  }
  ok(/'tamagotchi',\s+v_tama/.test(stats.sql), '응답에 tamagotchi 블록이 있다');
  ok(!/tama_diary[^\n]*body/.test(stats.sql), '펫 일기는 본문을 읽지 않는다(건수만)');
}

console.log(`\n${pass}건 통과`);
