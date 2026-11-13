/**
 * 협업 보드 학생 접근 회귀 — `npx tsx scripts/collab-student-access-test/run.mts`
 *
 * 이 테스트가 막는 것은 **조용한 실패**다. 협업 보드의 신원 해석이
 * `user_resource` 조인 하나였는데 학생은 그 표를 쓰지 않는다
 * (이메일 prefix ↔ resource.meta->>'id'). 그래서 학생에게 그 집합은 항상 비고,
 * RLS 는 오류가 아니라 **false** 를 낸다 — 초대받은 학생이 자기 멤버십 행조차
 * 못 봐 보드가 목록에서 통째로 사라졌는데 화면 어디에도 오류가 없었다.
 * (2026-09-09 실측: 재학생 630명 중 user_resource 링크 12명, 초대된 학생 9명 전원 미보유)
 *
 * 잡는 것은 두 축이다.
 *  · 클라이언트 쓰기 경로가 user_resource 를 다시 직접 조회하는가(정적 검사)
 *  · SQL 정책이 collab_actor_resource_ids() 대신 user_resource 를 다시 쓰는가(정적 검사)
 *
 * 실제 RLS 동작은 라이브 세션 시뮬레이션으로 검증했다(README 아닌 커밋 메시지 참고).
 * 여기서는 그 결론이 코드에서 되돌려지는 것을 막는다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ── 1. 클라이언트 쓰기 경로 ────────────────────────────────────────
// 보드/노트/댓글 생성은 자기 resource id 를 실어 보내야 하는데,
// 그걸 user_resource 에서 직접 읽으면 학생에게 `.single()` 이 0행으로 터진다
// ("User resource not found. Please connect your profile first.").
const COLLAB_WRITE_FILES = ['src/hooks/useCollabBoards.ts', 'src/hooks/useCollabNotes.ts'];

for (const file of COLLAB_WRITE_FILES) {
  const src = read(file);
  check(
    `${file}: user_resource 직접 조회 없음`,
    !/from\(\s*['"]user_resource['"]\s*\)/.test(src),
    'unifiedAuth.getCurrentResourceId() 를 쓸 것 — 학생은 user_resource 에 행이 없다',
  );
  check(
    `${file}: unifiedAuth 신원 해석 사용`,
    src.includes('unifiedAuth.getCurrentResourceId()'),
    '신원 해석 단일 출처를 거치지 않으면 학생이 조용히 빠진다',
  );
}

// 목록 화면이 "내가 이 보드 멤버인가"를 판정하는 근거가 타입에 선언돼 있어야 한다.
// 이 필드가 사라지면 판정이 `undefined?.some()` 이 되어 항상 false 다(= 원래 버그).
const boardsHook = read('src/hooks/useCollabBoards.ts');
check(
  'CollabBoard 타입에 collab_board_members 선언',
  /collab_board_members\?:/.test(boardsHook),
  '목록 조회가 가져오는 멤버 행이 타입에 없으면 판정이 조용히 무너진다',
);

// ── 2. SQL 정책 ───────────────────────────────────────────────────
// collab 정책을 다시 쓰는 마이그레이션이 생겼을 때, 신원 해석이
// collab_actor_resource_ids() 를 거치는지 본다.
const migDir = 'supabase/migrations';
const migFiles = readdirSync(join(root, migDir)).filter((f) => f.endsWith('.sql'));

const policyOnCollab = /create\s+policy\s+[\s\S]*?\son\s+(?:public\.)?(collab_\w+)/gi;
const offenders: string[] = [];

for (const f of migFiles) {
  const sql = read(join(migDir, f));
  // 이 리팩터링 이전의 마이그레이션은 대상이 아니다 — 이후 것만 본다.
  if (f < '20260909171443') continue;
  if (!/create\s+policy/i.test(sql)) continue;
  policyOnCollab.lastIndex = 0;
  if (!policyOnCollab.test(sql)) continue;
  // 주석은 뺀다 — 왜 이렇게 고쳤는지 적은 설명이 스스로를 위반으로 만든다
  const code = sql.replace(/--[^\n]*/g, '');
  if (/user_resource/i.test(code)) offenders.push(f);
}

check(
  'collab 정책 마이그레이션이 user_resource 를 직접 쓰지 않음',
  offenders.length === 0,
  offenders.join(', '),
);

// 이번 마이그레이션 자체가 온전한지 — 헬퍼와 정책이 모두 존재해야 한다.
const helpers = read(`${migDir}/20260909171419_collab_student_identity_helpers.sql`);
for (const fn of [
  'collab_actor_resource_ids',
  'can_view_collab_board',
  'can_write_collab_board',
  'can_view_collab_note',
  'can_write_collab_note',
  'is_board_owner',
]) {
  check(`헬퍼 정의: ${fn}`, helpers.includes(`function public.${fn}(`));
}

// 익명 호출에서 3값 논리로 새지 않도록 두 함수 모두 auth.uid() 가드를 갖는다.
// (CLAUDE.md 2026-09-04: `not (col = auth.uid())` 형태는 uid 가 null 이면 NULL 이 되어 통과한다)
for (const fn of ['can_view_collab_board', 'can_write_collab_board']) {
  const body = helpers.slice(helpers.indexOf(`function public.${fn}(`));
  check(
    `${fn}: auth.uid() null 가드`,
    /select auth\.uid\(\) is not null and exists/.test(body.slice(0, 500)),
    '가드가 없으면 익명 호출에서 NULL 이 나와 판정이 무너진다',
  );
}

const policies = read(`${migDir}/20260909171443_collab_policies_student_aware.sql`);
for (const [table, count] of [
  ['collab_boards', 4],
  ['collab_board_members', 3],
  ['collab_notes', 4],
  ['collab_note_comments', 4],
] as const) {
  // drop + create 가 짝을 이루므로 정책 수의 두 배가 나온다
  const found = (policies.match(new RegExp(`on public\\.${table}(?![\\w])`, 'g')) || []).length;
  check(`${table}: 정책 ${count}개 재작성`, found === count * 2, `실제 ${found / 2}개`);
}

// 노트/댓글 INSERT 는 작성자 위조를 막아야 한다 — 학생에게 쓰기가 열린 지금 실재하는 위험.
for (const policy of ['create_notes', 'create_comments']) {
  const idx = policies.indexOf(`create policy ${policy} on`);
  check(
    `${policy}: author_id 검증`,
    idx >= 0 && /author_id in \(select public\.collab_actor_resource_ids\(\)\)/.test(
      policies.slice(idx, idx + 400),
    ),
    'board 만 보면 남의 이름으로 글을 쓸 수 있다',
  );
}

// ── 3. INSERT ... RETURNING 가시성 (2026-09-12) ───────────────────
// PostgreSQL 은 `INSERT ... RETURNING` 에 SELECT 정책을 **추가 WITH CHECK 로**
// 새 행에 적용한다. 클라이언트가 `.insert().select().single()` 이므로, 쓰기가
// 허용돼도 "방금 넣은 행을 읽을 수 없으면" INSERT 전체가 42501 로 죽는다.
// 오류 문구가 `new row violates row-level security policy` 라 INSERT 정책을
// 고치러 가게 되는데 거기엔 고칠 것이 없다 — 그래서 이 정적 검사가 방어선이다.
//
// `can_view_collab_board(id)` 는 STABLE SECURITY DEFINER 로 collab_boards 를
// **id 로 다시 읽는다** → 문장 시작 스냅샷에 삽입 중인 행이 없어 false 다.
// 교직원은 `is_staff_teacher_or_admin` 분기가 행을 보지 않고 참이라 통과해서
// **학생에게만** 보드 생성이 실패했다(2026-09-12 라이브 재현).
//
// 그래서 SELECT 정책에는 새 행의 **컬럼만으로 판정되는** 분기가 반드시 있어야 한다.
// 권한은 넓어지지 않는다 — can_view_collab_board 가 같은 조건을 이미 분기로 갖고 있어
// 기존 행에 대해 논리적 부분집합이다(학생 3명 실측: 가시 보드 수 old = new).
//
// 정책은 나중 마이그레이션이 덮어쓸 수 있으므로 **마지막 정의**를 검사한다.
// 특정 파일 하나만 보면 누가 옛 형태로 되돌려도 이 검사가 통과해 버린다.
const BOARD_SELECT_POLICY = /create\s+policy\s+view_all_boards\s+on\s+public\.collab_boards/i;

const boardSelectDefs = migFiles
  .filter((f) => BOARD_SELECT_POLICY.test(read(join(migDir, f))))
  .sort();

check('view_all_boards 정책 정의가 마이그레이션에 존재', boardSelectDefs.length > 0);

if (boardSelectDefs.length > 0) {
  const lastFile = boardSelectDefs[boardSelectDefs.length - 1];
  const sql = read(join(migDir, lastFile)).replace(/--[^\n]*/g, '');
  const body = sql.slice(sql.search(BOARD_SELECT_POLICY), sql.search(BOARD_SELECT_POLICY) + 600);

  check(
    `view_all_boards(${lastFile}): 새 행 컬럼으로 판정되는 분기 존재`,
    /created_by\s+in\s*\(\s*select\s+public\.collab_actor_resource_ids\(\)\s*\)/i.test(body),
    'created_by 분기가 없으면 학생의 보드 생성이 INSERT ... RETURNING 에서 42501 로 죽는다',
  );

  check(
    `view_all_boards(${lastFile}): 교직원 전체 열람 유지`,
    /is_staff_teacher_or_admin\(auth\.uid\(\)\)/i.test(body),
    '비공개 보드를 잠금 배지로 보여 주는 기존 UX 가 이 분기에 달려 있다',
  );
}

// 클라이언트가 RETURNING 형태를 쓴다는 사실 자체를 고정해 둔다 —
// 이것이 위 정책 요구의 근거다(.select() 를 지우면 근거도 달라진다).
check(
  'useCollabBoards: 보드 생성이 .insert().select() 형태',
  /from\('collab_boards'\)[\s\S]{0,400}?\.insert\([\s\S]{0,600}?\.select\(\)/.test(boardsHook),
  'RETURNING 을 쓰지 않게 바뀌었다면 위 정책 요구의 근거를 다시 적을 것',
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
