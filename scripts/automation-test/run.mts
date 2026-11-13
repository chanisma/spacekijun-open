// 자동화 업무 회귀 (2026-10-23) — npx tsx scripts/automation-test/run.mts
//
// 이 부류는 오류를 내지 않고 조용히 틀린다: 화면의 «다음 실행»이 서버 판정과 다르면 승인한 것과 다른 시각에
// 나가고, 변수 이름이 한쪽만 바뀌면 저장이 CHECK 에서 거부된다. 그래서 두 벌을 같은 표로 잰다.
//   ① cron 판정 표 — 같은 표를 sql-parity.mts 가 서버 함수로 다시 잰다
//   ② 본문 변수 목록 ↔ 마이그레이션 known_tokens
//   ③ 선택기 → cron · 다음 실행 · 규칙 변환 · 설정 검사
//   ④ 엣지 함수 입구(가짜 fetch)
//   ⑤ 배선(라우트·메뉴·관리 탭·알림)
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  cronMatches, cronValid, kstToMs, kstWall, nextRuns, specToCron, formatRunAt,
} from '../../src/lib/automationCron.ts';
import {
  audienceToFacultyRule, facultyRuleToAudience, isPerRecipient, tokensForMode, validateCoolmsgConfig,
  type CoolmsgConfig,
} from '../../src/lib/automationConfig.ts';
import { createHandler } from '../../supabase/functions/automation-runner/handler.js';
import { CRON_CASES } from './cases.ts';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`✗ ${name}`, detail ?? '');
  }
}

const MIGRATION = readFileSync(new URL('../../supabase/migrations/20261023165000_automation_scheduler.sql', import.meta.url), 'utf8');

// ① cron 판정
for (const c of CRON_CASES) {
  const [d, t] = c.at.split(' ');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const got = cronMatches(c.expr, kstWall(kstToMs(y, mo, da, h, mi)));
  check(`cron ${c.expr} @ ${c.at}`, got === c.match, { got, want: c.match });
}
for (const bad of ['61 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '* * * * 8', '*/0 * * * *', '5-3 * * * *', '* * * *', 'a * * * *']) {
  check(`cron 거부 ${bad}`, !cronValid(bad));
}

// ② 변수 목록 ↔ SQL known_tokens
function sqlTokens(mode: string): string[] {
  const m = new RegExp(`when '${mode}'\\s+then array\\[([^\\]]*)\\]`, 's').exec(MIGRATION);
  if (!m) return ['<없음>'];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
for (const mode of ['date', 'data'] as const) {
  check(`변수 목록 ${mode} = SQL`, JSON.stringify(tokensForMode(mode).map((t) => t.name)) === JSON.stringify(sqlTokens(mode)),
    { ts: tokensForMode(mode).map((t) => t.name), sql: sqlTokens(mode) });
}
check('render 가 데이터 변수를 다 안다', tokensForMode('data').filter((t) => !['날짜', '요일', '내일 날짜', '내일 요일'].includes(t.name))
  .every((t) => MIGRATION.includes(`when '${t.name}' then`)));
check('사람마다 변수 이름 = SQL', MIGRATION.includes("like '%{내 마감 임박 업무}%'"));

// ③ 선택기 → cron
check('평일', specToCron({ kind: 'weekdays', time: '08:30' }) === '30 8 * * 1-5');
check('매일', specToCron({ kind: 'daily', time: '00:05' }) === '5 0 * * *');
check('매주 일·월', specToCron({ kind: 'weekly', time: '09:00', days: [7, 1] }) === '0 9 * * 1,0');
check('매주 비면 null', specToCron({ kind: 'weekly', time: '09:00', days: [] }) === null);
check('매월 31', specToCron({ kind: 'monthly', time: '07:00', dayOfMonth: 31 }) === '0 7 31 * *');
check('매월 0 거부', specToCron({ kind: 'monthly', time: '07:00', dayOfMonth: 0 }) === null);
check('한 번', specToCron({ kind: 'once', time: '14:20', date: '2026-11-03' }) === '20 14 3 11 *');
check('시각 형식', specToCron({ kind: 'daily', time: '8:00' }) === null);
check('고급 공백 정리', specToCron({ kind: 'custom', time: '', cron: '  0  8 * *   1-5 ' }) === '0 8 * * 1-5');

// 다음 실행 — 2026-10-23(금) 10:00 KST 기준
const from = kstToMs(2026, 10, 23, 10, 0);
const wk = nextRuns('30 8 * * 1-5', from, 3).map(formatRunAt);
check('평일 다음 3회', JSON.stringify(wk) === JSON.stringify(['10/26(월) 08:30', '10/27(화) 08:30', '10/28(수) 08:30']), wk);
check('같은 분은 다음으로', nextRuns('0 10 * * *', from, 1).map(formatRunAt)[0] === '10/24(토) 10:00');
check('기간 끝', nextRuns('0 9 * * *', from, 5, { endsOn: '2026-10-25' }).length === 2);
check('기간 시작', nextRuns('0 9 * * *', from, 1, { startsOn: '2026-11-01' }).map(formatRunAt)[0] === '11/1(일) 09:00');
check('한 번 지난 날', nextRuns('20 14 3 11 *', from, 5, { startsOn: '2026-11-03', endsOn: '2026-11-03' }).length === 1);
check('2/29 는 윤년까지', nextRuns('0 9 29 2 *', from, 1, { horizonDays: 1500 }).map(formatRunAt)[0] === '2/29(화) 09:00');
check('15분마다', nextRuns('*/15 * * * *', from, 2).map(formatRunAt).join() === '10/23(금) 10:15,10/23(금) 10:30');

// 규칙 변환 — 조건 하나 = 묶음 하나
const rule = { include: [{ type: 'homeroom' as const, grades: [1] }, { type: 'department' as const, ids: ['d1'] }], exclude: [{ type: 'people' as const, ids: ['p1'] }] };
const stored = audienceToFacultyRule(rule);
check('규칙 → 묶음', stored?.include.length === 2 && stored.include.every((g) => g.all.length === 1) && stored.exclude[0].all[0].type === 'people');
check('묶음 → 규칙 왕복', JSON.stringify(facultyRuleToAudience(stored)) === JSON.stringify(rule));
check('빈 규칙 → null', audienceToFacultyRule({ include: [], exclude: [] }) === null);
check('여러 조건 묶음은 못 읽음', facultyRuleToAudience({ include: [{ all: [rule.include[0], rule.include[1]] }], exclude: [] }) === null);

// 설정 검사 — 서버 config_valid 와 같은 규칙
const base: CoolmsgConfig = { title: '안내', body: '{날짜} 안내', body_mode: 'date', recipients: { rule: null, people: ['x'] } };
check('정상', validateCoolmsgConfig(base) === null);
check('고정 문구에 변수', validateCoolmsgConfig({ ...base, body_mode: 'fixed' }) !== null);
check('날짜 방식에 데이터 변수', validateCoolmsgConfig({ ...base, body: '{급식지도 당번}' }) !== null);
check('받는 사람 없음', validateCoolmsgConfig({ ...base, recipients: { rule: null, people: [] } }) !== null);
check('제목 61자', validateCoolmsgConfig({ ...base, title: 'a'.repeat(61) }) !== null);
check('사람마다', isPerRecipient({ title: 'x', body: '{내 마감 임박 업무}', body_mode: 'data' }));
check('날짜 방식은 사람마다 아님', !isPerRecipient({ title: 'x', body: '{내 마감 임박 업무}', body_mode: 'date' }));

// ④ 엣지 함수 입구
const KEY_HEX = 'a'.repeat(64);
const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
const fakeFetch = async (url: string, init: { body: string }) => {
  const body = JSON.parse(init.body);
  calls.push({ url, body });
  if (body.p_key_hash !== createHash('sha256').update(KEY_HEX).digest('hex')) {
    return new Response(JSON.stringify({ message: '알 수 없는 실행기' }), { status: 400 });
  }
  if (url.endsWith('automation_runner_report') && body.p_run_id === '00000000-0000-0000-0000-000000000009') {
    return new Response(JSON.stringify({ message: '이 실행기가 가져간 회차가 아닙니다' }), { status: 400 });
  }
  return new Response(JSON.stringify({ ok: true, runs: [] }), { status: 200 });
};
const handle = createHandler({ url: 'https://x.supabase.co', serviceKey: 's' }, fakeFetch as unknown as typeof fetch);
const req = (body: unknown, key: string | null = KEY_HEX, method = 'POST') =>
  handle(new Request('https://x/functions/v1/automation-runner', {
    method, headers: key ? { 'x-runner-key': key } : {}, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  }));
check('GET 거부', (await req(null, KEY_HEX, 'GET')).status === 405);
check('키 없음', (await req({ action: 'claim' }, null)).status === 401);
check('키 모양', (await req({ action: 'claim' }, 'short')).status === 401);
check('모르는 동작', (await req({ action: 'drop' })).status === 400);
calls.length = 0;
check('claim 성공', (await req({ action: 'claim', max: 99 })).status === 200);
check('claim 상한 20', calls[0]?.body.p_max === 20 && calls[0].url.endsWith('/rest/v1/rpc/automation_runner_claim'));
check('키 원문은 보내지 않는다', !JSON.stringify(calls).includes(KEY_HEX));
check('모르는 실행기', (await req({ action: 'heartbeat' }, 'b'.repeat(64))).status === 401);
check('report 상태 검사', (await req({ action: 'report', run_id: '00000000-0000-0000-0000-000000000001', status: 'sending' })).status === 400);
check('report run_id 검사', (await req({ action: 'report', run_id: 'x', status: 'sent' })).status === 400);
check('남의 회차', (await req({ action: 'report', run_id: '00000000-0000-0000-0000-000000000009', status: 'sent' })).status === 409);
check('report 성공', (await req({ action: 'report', run_id: '00000000-0000-0000-0000-000000000001', status: 'sent', message_key: 1070, arrival: '즉시' })).status === 200);

// ⑤ 배선
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
check('라우트', /path="\/automations"[^\n]*FACULTY_ROLES[^\n]*AutomationsPage/.test(read('src/App.tsx')));
check('메뉴', read('src/config/navigation.ts').includes("href: '/automations'") && read('src/config/navigation.ts').includes('commonNavItems.automations,'));
check('메뉴 카탈로그(기본 관리자만)', /commonNavItems\.automations,[\s\S]{0,200}defaultVisibleToUsers: false/.test(read('src/config/menuRegistry.ts')));
check('관리 탭', read('src/pages/Admin.tsx').includes("case 'automations'") && read('src/components/admin/layout/AdminSidebar.tsx').includes('value: "automations"'));
check('알림 이동', read('src/components/notifications/notificationNavigation.ts').includes("type === 'automation_issue'"));
check('알림 아이콘', read('src/components/notifications/notificationUtils.tsx').includes("case 'automation_issue'"));
check('알림 카탈로그', read('src/components/admin/notificationEventCatalog.ts').includes("notificationType: 'automation_issue'"));
check('verify_jwt=false 선언', /\[functions\.automation-runner\]\s*\nverify_jwt = false/.test(read('supabase/config.toml')));
check('실행기 RPC 는 service_role 만', /revoke execute on function public\.automation_runner_claim[^;]*from public, anon, authenticated/.test(MIGRATION));
check('회차 표에 쓰기 정책 없음', !/on public\.automation_run\s+for (insert|update|delete|all)/.test(MIGRATION));
check('알림 priority 허용값', !/'normal'/.test(MIGRATION.split('notification_events').slice(1).join('')));

console.log(`automation-test: ${pass} 통과 · ${fail} 실패`);
if (fail > 0) process.exit(1);
