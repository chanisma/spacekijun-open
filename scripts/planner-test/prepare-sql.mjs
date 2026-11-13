import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const strip = text => text.replace(/^begin;\s*$/gmi, '').replace(/^(commit|rollback);\s*$/gmi, '');
const migration = readFileSync('supabase/migrations/20260920110000_planner_focus_sessions.sql', 'utf8');
let sql = 'begin;\n';
if (process.argv.includes('--with-migration')) sql += migration + '\n';
sql += strip(readFileSync('supabase/tests/planner_focus.sql', 'utf8')) + '\nrollback;\n';
mkdirSync('output/planner-ui', { recursive: true });
writeFileSync('output/planner-ui/focus-sql-check.sql', sql);
console.log('Prepared rollback-only focus-sql-check.sql');
if (process.argv.includes('--prepare-apply')) {
  const apply = `begin;\n${migration}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values ('20260920110000','planner_focus_sessions',array[$focus_migration$${migration}$focus_migration$]);\ncommit;\n`;
  writeFileSync('output/planner-ui/focus-apply.sql', apply);
  console.log('Prepared focus-apply.sql (atomic schema + migration history; not executed).');
}
