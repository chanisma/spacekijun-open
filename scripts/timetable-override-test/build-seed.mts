// 엑셀(격자형) → 운영 시간표 시드 SQL. 관리 화면 업로드와 같은 파서(parseOverrideGrid)를 쓴다.
//
// 실행: npx tsx scripts/timetable-override-test/build-seed.mts <xlsx> <out.sql> \
//         --title "…" --kind csat --year 2026 --semester 2 --from 2026-10-26 --to 2026-11-18 --grades 3 \
//         [--fix 항인수=강예준 --fix 징완영=임도윤]
// 이름 고치기는 엑셀 오타용이다. 교사 id 는 SQL 이 재직 교사 이름으로 찾고, 못 찾으면 적용을 멈춘다.
import { readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { findTeacherClashes, parseOverrideGrid, type GridSheet } from '../../src/lib/timetableOverride';

const [xlsxPath, outPath, ...rest] = process.argv.slice(2);
const opt = (k: string) => {
  const i = rest.indexOf(`--${k}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const fixes = new Map<string, string>();
rest.forEach((v, i) => {
  if (v === '--fix') {
    const [a, b] = rest[i + 1].split('=');
    fixes.set(a, b);
  }
});
const need = (k: string) => {
  const v = opt(k);
  if (!v) throw new Error(`--${k} 가 필요합니다`);
  return v;
};

const wb = XLSX.read(readFileSync(xlsxPath));
const sheets: GridSheet[] = wb.SheetNames.map((name) => ({
  name,
  rows: XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[name], { header: 1, defval: null }),
}));
const parsed = parseOverrideGrid(sheets);
const slots = parsed.slots.map((s) => ({ ...s, teacher_name: fixes.get(s.teacher_name) ?? s.teacher_name }));
const clashes = findTeacherClashes(slots);
if (parsed.warnings.length) console.warn('경고:\n  ' + parsed.warnings.join('\n  '));
if (clashes.length) throw new Error('같은 시간 두 칸: ' + clashes.join(', '));

const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const grades = need('grades').split(',').map(Number);
const values = slots
  .map((s) => `(${s.day_of_week},${s.period},${s.grade},${q(s.class_label)},${q(s.subject_name)},${q(s.activity_type)},${q(s.teacher_name)},${q(s.raw)})`)
  .join(',\n  ');

const sql = `-- 생성: scripts/timetable-override-test/build-seed.mts (${slots.length}칸)
do $$
declare v_id uuid; v_missing text;
begin
  with x(t) as (values ${[...new Set(slots.map((s) => `(${q(s.teacher_name)})`))].join(',')})
  select string_agg(t, ', ') into v_missing from x
  where (select count(*) from public.resource r where r.name = x.t and r.type in ('teacher','staff') and coalesce(r.status,'active') = 'active') <> 1;
  if v_missing is not null then raise exception '재직 교직원 한 명으로 정해지지 않는 이름: %', v_missing; end if;

  insert into public.timetable_override (title, kind, academic_year, semester, start_date, end_date, grades, note)
  values (${q(need('title'))}, ${q(need('kind'))}, ${Number(need('year'))}, ${Number(need('semester'))},
          ${q(need('from'))}, ${q(need('to'))}, array[${grades.join(',')}]::smallint[], ${q(opt('note') ?? null)})
  returning id into v_id;

  insert into public.timetable_override_slot (override_id, day_of_week, period, grade, class_label, subject_name, activity_type, teacher_name, teacher_resource_id, meta)
  select v_id, x.d, x.p, x.g, x.c, x.s, x.a, x.t,
         (select r.id from public.resource r where r.name = x.t and r.type in ('teacher','staff') and coalesce(r.status,'active') = 'active'),
         jsonb_build_object('raw', x.raw, 'source', 'xlsx_override_grid')
  from (values
  ${values}
  ) as x(d, p, g, c, s, a, t, raw);
  raise notice 'override % slots %', v_id, (select count(*) from public.timetable_override_slot where override_id = v_id);
end $$;
`;
writeFileSync(outPath, sql, 'utf8');
console.log(`칸 ${slots.length} · 교사 ${new Set(slots.map((s) => s.teacher_name)).size}명 · 과목 없는 칸 ${slots.filter((s) => !s.subject_name).length} → ${outPath}`);
