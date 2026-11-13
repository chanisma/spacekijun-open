// 자습실 통계 회귀 — 순수 표시 함수 + 정적 배선 검사.
//   npx tsx scripts/study-room-stats-test/run.mts
//
// 이 기능의 결함은 오류를 내지 않는다: 메뉴·라우트·직원 차단 셋 중 하나만 빠져도 빌드는 통과하고,
// 화면이 규칙 상수를 다시 적어 두면 서버 규칙이 바뀐 날 두 숫자가 조용히 갈라진다.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  dateColumns,
  dayStatus,
  defaultMonthFilters,
  formatRate,
  formatSigned,
  shiftMonth,
  studentNo,
  weekdaySessions,
} from '../../src/features/study-room-stats/utils/statsFormat';
import type { DayEntry, StatsRoom } from '../../src/features/study-room-stats/types';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`); } else { fail += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const read = (p: string) => readFileSync(p, 'utf8');

console.log('[① 표시 함수]');
{
  const f = defaultMonthFilters(new Date('2026-09-30T15:30:00Z')); // KST 10/1 00:30
  check('기본 기간은 KST 기준 이번 달', f.start === '2026-10-01' && f.end === '2026-10-31', `${f.start}~${f.end}`);
  check('기본은 미래 예약 빼기 · 필터 없음', !f.includeFuture && f.grade === null && f.room === null);
  const feb = shiftMonth({ ...f, start: '2026-01-01', end: '2026-01-31' }, 1);
  check('달 옮기기 — 2월 말일', feb.start === '2026-02-01' && feb.end === '2026-02-28', `${feb.start}~${feb.end}`);
  const dec = shiftMonth({ ...f, start: '2026-01-01', end: '2026-01-31' }, -1);
  check('달 옮기기 — 해 넘김', dec.start === '2025-12-01' && dec.end === '2025-12-31');

  const e = (s: DayEntry[1]): DayEntry => [1, s, null, 0];
  check('하루 대표 = 결석이 이긴다', dayStatus([e('attended'), e('absent')]) === 'absent');
  check('하루 대표 = 대기 > 인정 > 보완 > 출석', dayStatus([e('attended'), e('supplement'), e('excused'), e('pending')]) === 'pending'
    && dayStatus([e('attended'), e('supplement'), e('excused')]) === 'excused'
    && dayStatus([e('attended'), e('supplement')]) === 'supplement');
  check('기록 없는 날 = null', dayStatus(undefined) === null && dayStatus([]) === null);

  const cols = dateColumns('2026-09-04', '2026-09-08', new Set(['2026-09-06']));
  check('날짜 칸 — 주말은 기록이 있는 날만', cols.join(',') === '2026-09-04,2026-09-06,2026-09-07,2026-09-08', cols.join(','));

  const rooms: StatsRoom[] = [['a', '아침 자습실', true], ['b', '야간', false]];
  const both = weekdaySessions([0, 1], rooms);
  check('요일 칸 — 아침·야간 나눔', both.morning && both.evening);
  const none = weekdaySessions(undefined, rooms);
  check('요일 칸 — 신청 없으면 둘 다 꺼짐', !none.morning && !none.evening);

  check('학번 = 학년+반2+번호2', studentNo({ grade: 1, class: 4, number: 7 }) === '10407');
  check('학반 모르면 학적 코드', studentNo({ grade: null, class: null, number: null, sid: '00-00448' }) === '00-00448');
  check('출석률 없음 = 대시', formatRate(null) === '—' && formatRate(90.94) === '90.9%');
  check('온도 변화 부호', formatSigned(1.25) === '+1.3' && formatSigned(-0.5) === '-0.5' && formatSigned(0) === '0.0');
}

console.log('[② 메뉴·라우트·직원 차단 — 셋이 짝]');
{
  const nav = read('src/config/navigation.ts');
  const group = nav.slice(nav.indexOf('const academicOpsGroup'), nav.indexOf('};', nav.indexOf('const academicOpsGroup')));
  check('네비 항목 정의', /studyRoomStats:\s*\{[^}]*href:\s*'\/study-room-stats'/.test(nav));
  check('학사 운영 허브에 들어 있다', group.includes('commonNavItems.studyRoomStats'));
  check('메뉴 카탈로그', read('src/config/menuRegistry.ts').includes('commonNavItems.studyRoomStats'));
  check('직원에게 닫힘(학생 정보)', read('src/lib/routeAccess.ts').includes("'/study-room-stats'"));
  check('라우트 = TEACHER_ROLES', /path="\/study-room-stats" element=\{<ProtectedRoute allowed=\{TEACHER_ROLES\}>/.test(read('src/App.tsx')));
}

console.log('[③ 규칙은 서버 한 곳 — 화면은 그리기만]');
{
  const dir = 'src/features/study-room-stats';
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
  walk(dir);
  const code = files.filter((p) => /\.tsx?$/.test(p));
  const offenders = code.filter((p) => /(?<![\w.\-\[])(0\.5|28\.0|1\.0)(?![\d\w\]])/.test(read(p).replace(/\/\/.*$/gm, '')));
  check('온도 상수(28 · 0.5 · 1.0)를 다시 적지 않는다', offenders.length === 0, offenders.join(', '));
  const isMissed = code.filter((p) => /getHours\(\)\s*>=\s*23|>= ?23/.test(read(p)));
  check('23시 마감을 브라우저 시계로 판정하지 않는다', isMissed.length === 0, isMissed.join(', '));
  const svc = read(join(dir, 'services/studyRoomStatsService.ts'));
  const rpcs = [...svc.matchAll(/\.rpc\('([\w_]+)'/g)].map((m) => m[1]);
  check('통계는 계약 RPC(seaton_stats_*)만 부른다', rpcs.length === 4 && rpcs.every((n) => n.startsWith('seaton_stats_')), rpcs.join(','));
  check("seat_reservations 를 직접 읽지 않는다", !code.some((p) => read(p).includes("from('seat_reservations')")));
  const page = read(join(dir, 'StudyRoomStatsPage.tsx'));
  check('PageContainer 를 쓴다', page.includes('<PageContainer>'));
  check("토스트는 '@/lib/toast' 뿐(sonner 직접 금지)", !code.some((p) => read(p).includes("from 'sonner'")));
  check('recharts <Line> 은 drawLineProps 를 스프레드', code.every((p) => {
    const s = read(p);
    const lines = s.match(/<Line\s[^>]*>/g) ?? [];
    return lines.every((l) => l.includes('{...drawLineProps}'));
  }));
}

console.log('[④ 계약 마이그레이션 — 권한·규칙 위치]');
{
  const sql = read('supabase/migrations/20261009100000_seaton_stats_contract.sql');
  const publics = [...sql.matchAll(/create or replace function public\.(seaton_stats_\w+)\(/g)].map((m) => m[1]);
  check('공개 RPC 4개', publics.length === 4, publics.join(','));
  for (const fn of publics) {
    check(`${fn}: public·anon 회수`, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`).test(sql));
    const body = sql.slice(sql.indexOf(`function public.${fn}(`));
    const head = body.slice(0, body.indexOf('as $fn$'));
    check(`${fn}: security definer + search_path=''`, head.includes('security definer') && head.includes("set search_path = ''"));
    check(`${fn}: 첫 줄이 교사 가드`, /begin\s+perform seaton_private\.require_teacher\(\);/.test(body.slice(0, body.indexOf('end $fn$'))));
  }
  check('require_teacher = is_teacher_or_admin(직원 거부)', /require_teacher[\s\S]*?public\.is_teacher_or_admin\(auth\.uid\(\)\)/.test(sql));
  check('온도 상수는 temperature_rule() 한 곳', (sql.match(/28\.0::numeric/g) ?? []).length === 1);
  check('시계는 KST', sql.includes("at time zone 'Asia/Seoul'"));
  check('private 스키마는 아무에게도 안 열림', sql.includes('revoke all on schema seaton_private from public, anon, authenticated;'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
