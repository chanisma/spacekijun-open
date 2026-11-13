#!/usr/bin/env node
/**
 * 우리 학교 값으로 바꾸기 — 처음 설치할 때 한 번 실행한다.
 *
 *   1) school.config.example.json 을 school.config.json 으로 복사해 채운다
 *   2) node scripts/setup-school.mjs          (바뀔 곳만 보여 준다)
 *      node scripts/setup-school.mjs --write  (실제로 바꾼다)
 *
 * 공개판에는 자리표시값이 들어 있다:
 *   학교 이름 «샘플고등학교» · 줄임 «샘플고» · 학교 메일 도메인 «myschool.hs.kr»
 *   NEIS 시도교육청 코드 'Z99' · 학교 코드 '9999999' · Supabase 프로젝트 ref «your-project-ref»
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const cfgPath = path.join(root, 'school.config.json');
if (!fs.existsSync(cfgPath)) {
  console.error('school.config.json 이 없습니다. school.config.example.json 을 복사해 채우세요.');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const need = ['schoolName', 'shortName', 'emailDomain', 'neisOfficeCode', 'neisSchoolCode', 'supabaseProjectRef'];
for (const k of need) if (!cfg[k]) { console.error(`school.config.json 에 ${k} 가 비어 있습니다.`); process.exit(1); }

// 긴 것부터 (샘플고등학교 → 샘플고 순서가 중요)
const RULES = [
  ['샘플고등학교', cfg.schoolName],
  ['샘플고', cfg.shortName],
  ['myschool.hs.kr', cfg.emailDomain],
  ["'Z99'", `'${cfg.neisOfficeCode}'`],
  ['(Z99)', `(${cfg.neisOfficeCode})`],
  ["'9999999'", `'${cfg.neisSchoolCode}'`],
  ['(9999999)', `(${cfg.neisSchoolCode})`],
  ['your-project-ref', cfg.supabaseProjectRef],
];
const DIRS = ['src', 'supabase', 'public', 'index.html'];
const TEXT = /\.(ts|tsx|js|mjs|cjs|mts|json|md|sql|html|css|toml|txt)$/i;
const write = process.argv.includes('--write');
let files = 0, total = 0;

function visit(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const e of fs.readdirSync(p)) if (e !== 'node_modules' && e !== '.temp') visit(path.join(p, e)); return; }
  if (!TEXT.test(p)) return;
  const s = fs.readFileSync(p, 'utf8');
  let t = s, n = 0;
  for (const [a, b] of RULES) { const c = t.split(a).length - 1; if (c) { n += c; t = t.split(a).join(b); } }
  if (!n) return;
  files++; total += n;
  console.log(`${String(n).padStart(4)}  ${path.relative(root, p)}`);
  if (write) fs.writeFileSync(p, t);
}
for (const d of DIRS) { const p = path.join(root, d); if (fs.existsSync(p)) visit(p); }
console.log(`\n${files}개 파일 · ${total}곳 ${write ? '바꿨습니다' : '바뀝니다 (--write 로 실행)'}`);
