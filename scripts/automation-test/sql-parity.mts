// cron 판정 두 벌 대조 (2026-10-23) — npx tsx scripts/automation-test/sql-parity.mts [--applied]
//
// cases.ts 의 표를 서버 automation_private.cron_matches 로 재서 화면(TS)과 같은 답인지 본다.
// 기본은 마이그레이션 파일을 `begin … rollback` 안에 실어 돌린다(적용 전에도 잰다, DB 에 아무것도 남지 않는다).
// --applied 면 이미 적용된 함수를 그대로 부른다(운영 확인용 — 역시 읽기만 한다).
// 필요: npx supabase (linked).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cronMatches, kstToMs, kstWall } from '../../src/lib/automationCron.ts';
import { CRON_CASES } from './cases.ts';

const applied = process.argv.includes('--applied');
const migration = readFileSync(new URL('../../supabase/migrations/20261023165000_automation_scheduler.sql', import.meta.url), 'utf8');
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const values = CRON_CASES.map((c, i) => `(${i}, ${q(c.expr)}, ${q(c.at)}::timestamp)`).join(',\n  ');
const probe = `select coalesce(jsonb_agg(jsonb_build_object('i', i, 'm', automation_private.cron_matches(e, t)) order by i), '[]') as r
from (values
  ${values}
) v(i, e, t);`;
const sql = applied ? probe : `begin;\n${migration}\n${probe}\nrollback;\n`;

const dir = mkdtempSync(join(tmpdir(), 'automation-parity-'));
const file = join(dir, 'parity.sql');
writeFileSync(file, sql, 'utf8');
const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', file], { encoding: 'utf8', shell: true });
const rows = JSON.parse(out.slice(out.indexOf('{'))).rows as Array<{ r: Array<{ i: number; m: boolean }> }>;
const sqlResult = rows[rows.length - 1].r;

let bad = 0;
for (const { i, m } of sqlResult) {
  const c = CRON_CASES[i];
  const [d, t] = c.at.split(' ');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const ts = cronMatches(c.expr, kstWall(kstToMs(y, mo, da, h, mi)));
  if (ts !== m || m !== c.match) {
    bad++;
    console.error(`✗ ${c.expr} @ ${c.at}: 기대 ${c.match} · 화면 ${ts} · 서버 ${m}`);
  }
}
console.log(`sql-parity: ${sqlResult.length - bad}/${CRON_CASES.length} 일치${applied ? ' (적용된 함수)' : ' (롤백 실행)'}`);
if (bad > 0 || sqlResult.length !== CRON_CASES.length) process.exit(1);
