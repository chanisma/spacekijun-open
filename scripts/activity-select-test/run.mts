/**
 * 목록 조회 열 목록이 DB 표와 어긋나지 않는지 검사한다.
 *
 * 목록은 `select *` 가 아니라 열을 **명시**한다(본문 전문·meta 를 빼려고 —
 * 실측 1,000행 brotli 217 KB → 117 KB, −46.2%). 그 대가로 **열이 늘면 여기에도 넣어야** 하는데,
 * 빠뜨리면 오류가 아니라 그 값이 목록에서 조용히 `undefined` 가 된다.
 *
 * **소스를 읽어 검사한다** — 서비스를 import 하면 `supabase/client.ts` 가 부팅되며
 * VITE 환경변수를 요구해 Node 에서 죽는다(이 저장소의 다른 규약 검사와 같은 이유).
 *
 * 실행: npx tsx scripts/activity-select-test/run.mts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

/** 목록에서 일부러 뺀 열 — 뺀 이유가 있으므로 여기 적어 둔다. */
const INTENTIONALLY_OMITTED = new Set([
  'content', // 전문은 상세·편집이 `fetchActivity(id)` 로 따로 받는다(목록엔 발췌만)
  'meta',    // 활동 목록·상세 어디서도 쓰지 않는다
]);

function env(name: string): string {
  for (const f of ['.env.local', '.env']) {
    try {
      const line = readFileSync(f, 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
      if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
    } catch { /* 없으면 다음 파일 */ }
  }
  throw new Error(`${name} 없음`);
}

const src = readFileSync('src/features/creative-activities/services/activityService.ts', 'utf8');
const block = /const ACTIVITY_LIST_COLUMNS = \[([\s\S]*?)\] as const;/.exec(src);
if (!block) { console.error('✗ ACTIVITY_LIST_COLUMNS 를 소스에서 찾지 못했다'); process.exit(1); }
const listCols = new Set([...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

const sb = createClient(env('VITE_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const { data, error } = await sb.rpc('activity_column_names');
if (error) throw error;
const dbCols = new Set((data as string[]) ?? []);

let fail = 0;
const missing = [...dbCols].filter((c) => !listCols.has(c) && !INTENTIONALLY_OMITTED.has(c));
const stale = [...listCols].filter((c) => !dbCols.has(c) && c !== 'content_excerpt');
if (missing.length) { console.error(`✗ 목록 열에 빠진 DB 열: ${missing.join(', ')}`); fail++; }
if (stale.length) { console.error(`✗ DB 에 없는 열을 고르고 있다: ${stale.join(', ')}`); fail++; }
if (!listCols.has('content_excerpt')) { console.error('✗ content_excerpt 누락 — 목록의 한 줄 발췌가 사라진다'); fail++; }
for (const c of INTENTIONALLY_OMITTED) {
  if (listCols.has(c)) { console.error(`✗ 일부러 뺀 열이 목록에 들어왔다: ${c} — 전송량이 되돌아간다`); fail++; }
}

console.log(fail ? `실패 ${fail}건` : `통과 — DB 열 ${dbCols.size} · 목록 ${listCols.size} · 의도적 제외 ${INTENTIONALLY_OMITTED.size}`);
process.exitCode = fail ? 1 : 0;
