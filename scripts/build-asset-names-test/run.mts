// 배포 파일 이름이 ASCII 인가 — Lovable 호스팅은 한글 이름 파일을 404 로 돌려준다(2026-10-12 /neis-guide 사고).
// 빌드도 로컬 미리보기도 통과하므로 이 검사가 방어선이다.
//   npx tsx scripts/build-asset-names-test/run.mts          (이름 규칙만)
//   npm run build && npx tsx scripts/build-asset-names-test/run.mts   (dist 까지)
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { asciiFileName } from '../../vite.config';

let failed = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed++;
};
const ascii = /^[A-Za-z0-9_./-]+$/;

const cases: Array<[string, string]> = [
  ['개별화교육계획관리__개별화교육계획관리', 'chunk'],
  ['편제및과목개설관리__이동수업(N_1)학생관리', 'N_1'],
  ['NeisGuidePage', 'NeisGuidePage'],
  ['index', 'index'],
  ['', 'chunk'],
];
for (const [input, want] of cases) check(asciiFileName(input) === want, `asciiFileName(${JSON.stringify(input)}) = ${want}`);

const dist = join(import.meta.dirname, '../../dist/assets');
if (existsSync(dist)) {
  const bad = readdirSync(dist).filter((f) => !ascii.test(f));
  check(bad.length === 0, `dist/assets 의 이름이 전부 ASCII (${bad.length}개 아님${bad.length ? ': ' + bad.slice(0, 3).join(', ') : ''})`);
} else {
  console.log('SKIP dist/assets 없음 — 빌드 뒤에 다시 돌리면 실제 산출물까지 본다');
}

console.log(failed ? `\n${failed}건 실패` : '\n모두 통과');
process.exit(failed ? 1 : 0);
