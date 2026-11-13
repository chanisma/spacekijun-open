/**
 * 연수 서명 링크 회귀 — `npx tsx scripts/training-sign-link-test/run.mts` (+ `--db` 면 운영 권한·흐름을 rollback 트랜잭션으로)
 * 막는 것: anon 에 표·관리 함수가 열림 · 알림이 QR 화면으로 안 감 · 기본 기한 계산 어긋남 ·
 *         링크 서명이 서명 표시(meta.assignee[이름].signature)를 안 올림 · 참석자가 남의 링크를 받음.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trainingSignLinkPath, trainingSignQrPath } from '../../src/services/trainingSignLinkService';
import { getNotificationDestination } from '../../src/components/notifications/notificationNavigation';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
};

const MID = '11111111-2222-3333-4444-555555555555';

// ── 알림 목적지 ────────────────────────────────────────────────────────────
const training = getNotificationDestination({ type: 'schedule_created', meta: { meeting_kind: 'training' }, related_meeting_id: MID } as never);
check('새 연수 알림 → 내 서명 QR', training?.to === trainingSignQrPath(MID), training);
const duty = getNotificationDestination({ type: 'schedule_created', meta: {}, related_meeting_id: MID } as never);
check('업무 알림은 종전대로 일정 상세', duty?.to === '/schedule' && (duty?.state as { scheduleId?: string })?.scheduleId === MID, duty);
const old = getNotificationDestination({ type: 'schedule_created', meta: null, related_meeting_id: MID } as never);
check('옛 연수 알림(meta 없음)도 일정 상세', old?.to === '/schedule', old);

// ── 링크 글 ────────────────────────────────────────────────────────────────
check('링크 경로', trainingSignLinkPath('abc') === '/training-sign-link/abc');

// ── 운영 DB (rollback) ──────────────────────────────────────────────────────
if (process.argv.includes('--db')) {
  const sql = `begin;
create temp table o(k text, v jsonb); grant all on o to anon, authenticated;
insert into o select 'anon-exec', to_jsonb(array_agg(p.proname order by p.proname)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('get_training_by_token', 'sign_training_with_token', 'get_training_sign_links',
    'set_training_sign_link_expiry', 'training_sign_sync_tokens', 'training_sign_link_on_meeting', 'training_sign_new_token',
    'training_sign_default_expiry', 'is_training_creator', 'mcp_set_training_sign_link_expiry')
    and has_function_privilege('anon', p.oid, 'execute');
insert into o select 'anon-by-token', to_jsonb(has_function_privilege('anon', 'public.get_training_by_token(text)', 'execute'));
insert into o select 'anon-tables', to_jsonb(has_table_privilege('anon', 'public.training_sign_token', 'select') or has_table_privilege('anon', 'public.training_sign_link', 'select') or has_table_privilege('anon', 'public.training_signature', 'select'));
insert into o select 'auth-token-table', to_jsonb(has_table_privilege('authenticated', 'public.training_sign_token', 'select'));
insert into o select 'default-expiry', to_jsonb(public.training_sign_default_expiry('2026-10-28 08:00+00') = '2026-11-05 00:00+09');
insert into meeting (id, kind, starts_at, ends_at, meta, created_by, creator)
values ('${MID}', 'training', '2026-10-28 06:00+00', '2026-10-28 08:00+00',
  '{"title":"회귀 연수","assignee":{"가":{"name":"가","signature":0},"나":{"name":"나","signature":0}}}', null, null);
insert into o select 'tokens', to_jsonb(count(*)) from training_sign_token where meeting_id = '${MID}';
select set_config('t.tk', (select token from training_sign_token where meeting_id = '${MID}' and signer_name = '가'), true);
set local role anon;
insert into o values ('anon-get', public.get_training_by_token(current_setting('t.tk')));
insert into o values ('anon-sign', public.sign_training_with_token(current_setting('t.tk'), '{"v":1,"w":10,"h":5,"s":[[1,2,3,4]]}'));
reset role;
insert into o select 'flag', meta->'assignee'->'가'->'signature' from meeting where id = '${MID}';
insert into o select 'source', to_jsonb(source) from training_signature where meeting_id = '${MID}';
update training_sign_link set expires_at = now() - interval '1 minute' where meeting_id = '${MID}';
set local role anon;
insert into o values ('expired', public.get_training_by_token((select token from training_sign_token where meeting_id = '${MID}' and signer_name = '나')));
reset role;
select * from o;
rollback;`;
  const file = join(tmpdir(), 'training-sign-link-check.sql');
  writeFileSync(file, sql);
  // anon 은 표를 못 읽으므로 '나'의 토큰은 role 을 되돌린 상태에서 읽어야 한다 — 위 expired 줄은 anon 으로 표를 읽어 실패하지 않게 따로
  const fixed = sql.replace(
    `set local role anon;\ninsert into o values ('expired', public.get_training_by_token((select token from training_sign_token where meeting_id = '${MID}' and signer_name = '나')));\nreset role;`,
    `select set_config('t.tk2', (select token from training_sign_token where meeting_id = '${MID}' and signer_name = '나'), true);\nset local role anon;\ninsert into o values ('expired', public.get_training_by_token(current_setting('t.tk2')));\nreset role;`,
  );
  writeFileSync(file, fixed);
  const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', file], { encoding: 'utf8', shell: true });
  const rows = Object.fromEntries((JSON.parse(out.slice(out.indexOf('{'))).rows as Array<{ k: string; v: unknown }>).map((r) => [r.k, r.v]));
  check('anon 이 부를 수 있는 연수 서명 함수 = 토큰 둘뿐',
    JSON.stringify(rows['anon-exec']) === JSON.stringify(['get_training_by_token', 'sign_training_with_token']), rows['anon-exec']);
  check('anon 은 표를 못 읽는다', rows['anon-tables'] === false);
  check('로그인 사용자도 토큰 표를 직접 못 읽는다', rows['auth-token-table'] === false);
  check('기본 기한 = 연수 끝 + 7일의 끝', rows['default-expiry'] === true);
  check('참석자마다 토큰', rows.tokens === 2, rows.tokens);
  const got = rows['anon-get'] as Record<string, unknown>;
  check('토큰 조회는 그 사람과 연수만', got?.ok === true && got?.signer_name === '가' && !('assignee' in (got ?? {})), got);
  check('링크 서명 성공', (rows['anon-sign'] as Record<string, unknown>)?.ok === true, rows['anon-sign']);
  check('서명 표시가 올라간다', rows.flag === 1, rows.flag);
  check('출처 = link', rows.source === 'link', rows.source);
  check('기한 지나면 expired', (rows.expired as Record<string, unknown>)?.reason === 'expired', rows.expired);
}

console.log(`training-sign-link: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
