/**
 * 반영 교과 선택 감사 — 라이브 `admission_gyogwa_criteria.subjects_all` 전수.
 *
 * 실행: npx tsx scripts/admission-wishlist-test/audit-reflected.mts
 *
 * 무엇을 재는가: `subjects_all` 은 **그 대학의 모든 전형 규칙**을 담고 있어, 고르지 않고
 * 이어 붙이면 남의 전형 반영 교과가 섞인다. 규칙이 둘 이상인 행에서
 *   ① 전형명으로 **하나로 좁혀지는 수**(= 반영 교과가 정확해진 행)
 *   ② 좁혀지지 않아 **보류**로 남는 수(= 손대지 않고 전체를 보여 주는 행)
 * 를 센다. 규칙이 옳아도 라이브에서 좁혀지는 행이 없으면 효과가 없으므로 이 숫자가
 * 곧 변경의 값어치이고, 보류 목록은 **왜 못 고르는지**를 사람이 확인하는 자리다.
 *
 * SQL 로 어림하지 말 것 — 정규화·토큰 분리 규칙이 코드에 있어 SQL 로 옮겨 적으면
 * 미묘하게 다른 값을 재게 된다(실제로 한 번 어긋났다). 여기서는 앱과 **같은 함수**를 부른다.
 */
import { readFileSync } from 'node:fs';
import { selectSubjectVariant, parseNaesinRule } from '../../src/features/admission-wishlist/utils/naesinRule';

function dotEnvValue(key: string): string | undefined {
  for (const f of ['.env.local', '.env']) {
    try {
      const line = readFileSync(f, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
      if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
    } catch { /* 파일 없음 */ }
  }
  return undefined;
}

const url = process.env.VITE_SUPABASE_URL ?? dotEnvValue('VITE_SUPABASE_URL');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? dotEnvValue('SUPABASE_SERVICE_ROLE_KEY')
  ?? process.env.VITE_SUPABASE_ANON_KEY ?? dotEnvValue('VITE_SUPABASE_ANON_KEY');
if (!url || !key) { console.error('Supabase 접속 정보 없음 (.env.local)'); process.exit(1); }

type Row = {
  id: string; university: string | null; admission: string | null;
  subjects_all: Array<{ subjects?: string; admission?: string; unit?: string; ratio?: string }> | null;
};

// PostgREST 는 요청당 1000행에서 **조용히 자른다**(오류가 아니라 부분 결과).
// 페이징하지 않으면 표본이 잘린 채 비율만 그럴듯하게 나온다.
const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
  const res = await fetch(
    `${url}/rest/v1/admission_gyogwa_criteria?select=id,university,admission,subjects_all`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` } },
  );
  if (!res.ok) { console.error(await res.text()); process.exit(1); }
  const page = (await res.json()) as Row[];
  rows.push(...page);
  if (page.length < 1000) break;
}

// 목적은 표시가 아니라 **내신 계산**이다 — 규칙을 그대로 재현할 수 있는 전형만 계산하므로,
// 반영 교과가 갈라지면(`multiple-rules`) 계산이 통째로 보류된다. 그 건수를 함께 센다.
let ruleCertain = 0, ruleMultiple = 0;
let single = 0, resolved = 0, withheld = 0, empty = 0;
const resolvedSamples: string[] = [];
const withheldAll: string[] = [];

for (const r of rows) {
  const g = { admission: r.admission, subjects_all: r.subjects_all ?? [], careers: [] };
  const { variant, ambiguous, all } = selectSubjectVariant(g as Parameters<typeof selectSubjectVariant>[0]);
  const distinct = new Set(all.map((v) => v.subjects)).size;
  if (distinct === 0) { empty++; continue; }
  if (distinct === 1) { single++; continue; }

  const rule = parseNaesinRule(g as Parameters<typeof parseNaesinRule>[0]);
  if (rule.certain) ruleCertain++;
  if (rule.uncertainties.includes('multiple-rules')) ruleMultiple++;

  const listing = all.map((v) => `[${v.admission ?? '없음'}] ${v.subjects}`).join('\n        ');
  const head = `  ${r.university ?? '?'} · ${r.admission ?? '(전형 없음)'}`;
  if (!ambiguous) {
    resolved++;
    if (resolvedSamples.length < 5) {
      resolvedSamples.push(`${head}\n    고름: ${variant?.subjects}\n    전체: ${listing}`);
    }
  } else {
    withheld++;
    withheldAll.push(`${head}\n    전체: ${listing}`);
  }
}

const multi = resolved + withheld;
const pct = (n: number) => (multi ? ` (${((n / multi) * 100).toFixed(1)}%)` : '');
console.log(`\n전체 gyogwa 행: ${rows.length}`);
console.log(`  규칙 없음        : ${empty}`);
console.log(`  규칙 1건(무영향) : ${single}`);
console.log(`  규칙 2건 이상    : ${multi}`);
console.log(`     ├ 확정 → 반영 교과가 정확해짐 : ${resolved}${pct(resolved)}`);
console.log(`     └ 보류 → 손대지 않음          : ${withheld}${pct(withheld)}`);
console.log(`
규칙 2건 이상인 행의 내신 계산`);
console.log(`  재현 가능(certain)              : ${ruleCertain}`);
console.log(`  반영 교과가 갈려 보류            : ${ruleMultiple}`);

if (resolvedSamples.length) console.log(`\n■ 확정된 예\n${resolvedSamples.join('\n')}`);
if (withheldAll.length) console.log(`\n■ 보류 (전량)\n${withheldAll.join('\n')}`);
