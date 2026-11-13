// 통합 지갑 · seaton 공유 DB 계약 — 정적 회귀.
//   npx tsx scripts/seaton-wallet-test/run.mts
//
// SQL 동작 자체는 supabase/tests/seaton_wallet.sql · seaton_security.sql 이 실제 역할로 잰다.
// 여기서 지키는 것은 «오류 없이 갈라지는» 자리다:
//   - 출석 보상 판정식이 아카데미 청구(study_rows)와 어긋나면 같은 출석이 한쪽에서만 보상된다
//   - 공개 함수 하나가 anon 회수를 빠뜨려도 빌드·적용은 통과한다
//   - 보상 숫자가 두 곳에 적히면 한쪽만 바뀐다
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`); } else { fail += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const read = (p: string) => readFileSync(p, 'utf8');
const M2 = read('supabase/migrations/20261009110000_seaton_read_rpcs_and_delete_guard.sql');
const M3 = read('supabase/migrations/20261009120000_unified_wallet_seaton_cutover.sql');
const M4 = read('supabase/migrations/20261009130000_seat_reservations_select_narrow.sql');
const STUDY = read('supabase/migrations/20260913171542_academy_library_study_rewards.sql');

/** `create or replace function public.x(args)` 의 이름·인자 형 목록 */
function publicFunctions(sql: string): Array<{ name: string; head: string; body: string }> {
  const out: Array<{ name: string; head: string; body: string }> = [];
  const re = /create or replace function public\.(\w+)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const rest = sql.slice(m.index);
    const asAt = rest.search(/\nas \$/);
    const end = rest.search(/\$(fn|)\$;\n/);
    out.push({ name: m[1], head: rest.slice(0, asAt), body: rest.slice(0, end) });
  }
  return out;
}

console.log('[① 공개 함수 — 권한·search_path]');
for (const [label, sql] of [['M2', M2], ['M3', M3]] as const) {
  for (const f of publicFunctions(sql)) {
    check(`${label} ${f.name}: public·anon 회수`, new RegExp(`revoke all on function public\\.${f.name}\\([^)]*\\) from public, anon;`).test(sql));
    check(`${label} ${f.name}: search_path 고정`, /set search_path = ''/.test(f.head));
    if (/security definer/.test(f.head)) {
      check(`${label} ${f.name}: DEFINER 는 로그인 가드가 먼저`, /auth\.uid\(\) is null/.test(f.body) || /(\w+) uuid := auth\.uid\(\);[\s\S]*?if \1 is null/.test(f.body), f.name);
    }
  }
}
check('wallet_private 스키마는 아무에게도 안 열림', M3.includes('revoke all on schema wallet_private from public, anon, authenticated;'));
check('wallet_private 함수 전부 회수', M3.includes('revoke all on all functions in schema wallet_private from public, anon, authenticated;'));

console.log('[② 출석 보상 판정 = 아카데미 청구와 같은 식]');
{
  const academy = STUDY.match(/\(r\.attendance_status='attended' or \(r\.attendance_status is null and r\.is_attended\)\)/);
  const ours = M3.match(/coalesce\(p_status = 'attended' or \(p_status is null and p_is_attended\), false\)/);
  const norm = (s: string) => s.replace(/r\.attendance_status|p_status/g, 'S').replace(/r\.is_attended|p_is_attended/g, 'A').replace(/\s+/g, '').replace(/coalesce\((.*),false\)/, '($1)');
  check('두 식이 모두 있다', !!academy && !!ours);
  check('정규화하면 같은 식', !!academy && !!ours && norm(academy[0]) === norm(ours[0]), `${academy?.[0]} vs ${ours?.[0]}`);
  check('보상 시작일이 같다(2026-09-07)', STUDY.includes("date '2026-09-07'") && M3.includes("date '2026-09-07'"));
  check('자동 지급은 아카데미 영수증 표에 넣는다(이중 지급 = PK 충돌)', /insert into public\.academy_study_rewards\(reservation_id, user_id, reservation_date, source\)[\s\S]*?on conflict \(reservation_id\) do nothing/.test(M3));
  check('출석 트리거는 advisory 잠금을 잡지 않는다(청구와 교착 방지)', !/on_attendance\(\)[\s\S]*?pg_advisory_xact_lock[\s\S]*?end \$fn\$;\n\ndrop trigger if exists wallet_seaton_attendance/.test(M3));
  check('출석 트리거 실패가 출석 체크를 막지 않는다', /wallet attendance skipped/.test(M3));
}

console.log('[③ 보상 숫자는 한 곳]');
{
  const applies = [...M3.matchAll(/wallet_private\.apply\(new\.student_id, (-?\d+), '(\w+)'/g)].map((m) => `${m[2]}=${m[1]}`);
  check('출석 +5 · 회수 −5 · 피드백 +1', applies.join(',') === 'seaton_attendance=5,seaton_attendance_reversal=-5,seaton_review=1', applies.join(','));
  check('아카데미 영수증 금액 CHECK 도 5', /amount = 5|amount=5/.test(STUDY) || STUDY.includes('check (amount=5)') || STUDY.includes('CHECK ((amount = 5))') || /amount integer not null default 5 check/.test(STUDY), '20260913171542');
  check('집중 금액·상한은 다마고찌 credit_rule 을 읽는다(숫자 직접 금지)', /tama_private\.credit_rule\('focus'\)/.test(M3) && !/'seaton_focus', 'seaton', p_run::text/.test(M3.replace(/rule\.amount, 'seaton_focus'/, '')));
  check('집중 상한은 다마고찌 원장(kind=focus)을 센다', /from public\.tama_credit_ledger where user_id = p_user and earned_on = today and kind = 'focus'/.test(M3));
  check('집중은 다마고찌와 같은 잠금 키', M3.includes("hashtextextended('tama-credit:' || p_user::text, 0)"));
  check('퍼즐 = 2P 당 1코인 올림', /ceil\(p_points \/ 2\.0\)/.test(M3));
}

console.log('[④ 원장 kind 가 쓰는 곳과 맞다]');
{
  const declared = (M3.match(/kind text not null check \(kind in \(([\s\S]*?)\)\)/)?.[1] ?? '').match(/'(\w+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
  const used = new Set([...M3.matchAll(/wallet_private\.apply\([^,]+, [^,]+, '(\w+)'/g)].map((m) => m[1]));
  const missing = [...used].filter((k) => !declared.includes(k));
  check('apply 에 넘기는 kind 가 전부 CHECK 에 있다', missing.length === 0, missing.join(','));
  check('원장은 본인만 읽는다', /create policy wallet_ledger_owner_read on public\.wallet_ledger\s+for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/.test(M3));
  check('코인 음수 금지 CHECK', M3.includes('check (coins >= 0)'));
}

console.log('[⑤ 옛 클라이언트 호환]');
{
  check('unlock_puzzle_piece 반환 모양 유지', /function public\.unlock_puzzle_piece\(p_event_id uuid, p_piece_index integer\)\nreturns table\(piece_index integer, remaining_points integer, is_puzzle_completed boolean\)/.test(M3));
  check('부족 메시지는 «포인트가 부족합니다»로 시작(옛 화면이 그대로 보인다)', M3.includes("raise exception '포인트가 부족합니다."));
  check('award_focus_points 는 남아 있고 0 을 돌려준다', /function public\.award_focus_points\(p_session_id uuid\)\nreturns integer\nlanguage sql stable\nset search_path = ''\nas \$\$ select 0 \$\$;/.test(M3));
  check('get_student_points 는 손대지 않는다', !M3.includes('function public.get_student_points'));
  check('옛 포인트 동결 = puzzle_unlock 차감만', /new\.type <> 'puzzle_unlock' or new\.amount >= 0/.test(M3));
  check('학생 삭제 = 오늘 이후 · 출석 처리 전', /reservation_date >= \(now\(\) at time zone 'Asia\/Seoul'\)::date\s+and attendance_status is null\s+and not coalesce\(is_attended, false\)/.test(M2));
}

console.log('[⑥ 좌석 RPC 는 남의 신원을 돌려주지 않는다 · M4 는 정책 하나만]');
{
  const occ = M2.slice(M2.indexOf('function public.seaton_seat_occupancy'), M2.indexOf('end $fn$;', M2.indexOf('function public.seaton_seat_occupancy')));
  check('점유 RPC 반환 = 좌석·날짜·교시·is_mine', /returns table\(seat_number text, reservation_date date, period_id int, is_mine boolean\)/.test(occ) && !/student_id,/.test(occ.split('return query')[1] ?? ''));
  check('교사 홈 카드 RPC 는 교직원 가드', /seaton_day_attendance_rows[\s\S]*?is_staff_teacher_or_admin\(auth\.uid\(\)\)/.test(M2));
  const stmts = M4.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--'));
  check('M4 = USING true 정책 삭제 한 줄', stmts.length === 1 && stmts[0].includes('drop policy if exists "Authenticated users can read all reservations"'), stmts.join(' | '));
}

console.log('[⑦ spacekijun 쪽 배선]');
{
  const card = read('src/features/teacher-dashboard/services/seatReservationReadService.ts');
  check("교사 홈 카드는 표 대신 RPC", card.includes("'seaton_day_attendance_rows'") && !card.includes(".from('seat_reservations')"));
  check('아카데미 자습 장부가 자동 적립을 말한다', read('src/features/academy/game/GameStudyLedger.tsx').includes('저절로 들어와요'));
  check('다마고찌 집중 안내가 숲과 상한 공유를 말한다', read('src/features/tamagotchi/components/CreditPanels.tsx').includes('집중의 숲'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
