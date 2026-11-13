// 일회성 점검용. 실제 회귀는 run.mts.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolveLegacyToast } from '../../src/lib/toastMessage.ts';

const GENERIC = new Set(['오류','성공','알림','완료','경고','안내','확인','정보','실패','에러','주의']);
const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx"', { encoding: 'utf8' }).split('\n').filter(Boolean);
let collapsed = 0, kept = 0;
const cEx: string[] = [], kEx: string[] = [];
for (const f of files) {
  let src = ''; try { src = readFileSync(f, 'utf8'); } catch { continue; }
  if (!/\btoast\s*\(/.test(src)) continue;
  const L = src.split('\n');
  for (let i = 0; i < L.length; i++) {
    if (!/\btoast\s*\(\s*\{/.test(L[i])) continue;
    const chunk = L.slice(i, i + 7).join(' ').replace(/\s+/g, ' ');
    const t = chunk.match(/title:\s*(['"])(.*?)\1/)?.[2];
    const d = chunk.match(/description:\s*(['"])(.*?)\1/)?.[2];
    if (!t || !d || GENERIC.has(t)) continue;
    const r = resolveLegacyToast({ title: t, description: d, variant: /variant:\s*['"]destructive['"]/.test(chunk) ? 'destructive' : undefined });
    if (r.description === undefined) { collapsed++; if (cEx.length < 20) cEx.push(`${t} ┃ ${d}`); }
    else { kept++; if (kEx.length < 12) kEx.push(`${t} ┃ ${d}`); }
  }
}
console.log('동어반복으로 판정해 설명문을 버린 것:', collapsed);
cEx.forEach(e => console.log('   DROP  ', e));
console.log('\n두 줄을 유지한 것:', kept);
kEx.forEach(e => console.log('   KEEP  ', e));
