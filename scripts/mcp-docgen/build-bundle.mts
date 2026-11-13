/**
 * 엣지 함수 mcp · mcp-docgen 이 쓰는 src 코드 묶기 (2026-10-20).
 *
 * 엣지 함수는 src/ 를 직접 import 할 수 없다(배포 묶음은 supabase/functions 안만 담고, src 의 import 는
 * 확장자가 없어 Deno 가 못 읽는다). 그래서 웹 코드를 한 파일로 묶어 _shared 에 둔다 — **웹과 같은 규칙**을 쓰려는 것이다
 * (규칙을 두 벌로 쓰지 않는다). 묶음 다섯:
 *   docgenAgentSpec.bundle.js — src/features/document-generation/mcp/ (+ 웹 문서 엔진) · 문서 생성 도구
 *   mcpEdgeData.bundle.js     — src/lib/mcpEdgeData.ts (+ 전화번호부 자료) · 데이터 카탈로그의 엣지 데이터셋
 *   mcpSchoolOps.bundle.js    — src/lib/mcpSchoolOps.ts · 수업 교체 후보 · 급식지도·자습 감독 초안 · 설문 결과(웹 순수 함수)
 *   mcpLibraryOps.bundle.js   — src/lib/mcpLibraryOps.ts + neis-kb/guides(NEIS_GUIDES_RAW) · 나이스 안내 검색 · 코드 공유 파일 정리
 *   mcpWorkOps.bundle.js      — src/lib/mcpWorkOps.ts · 업무 진행하기(기능 지식 · 자동화 수준 · 진행·결과 정리 · 돌아보기 지표)
 *
 * 쓰는 법: npx tsx scripts/mcp-docgen/build-bundle.mts          → 묶음을 다시 쓴다
 *          npx tsx scripts/mcp-docgen/build-bundle.mts --check  → 원본과 다르면 실패(회귀가 부른다)
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** neis-kb/guides 의 안내 전부 — 파일 경로 순(묶음 내용이 매번 같게). 웹은 import.meta.glob 으로 같은 파일을 싣는다 */
function neisGuidesRaw(): unknown[] {
  const dir = resolve(root, 'neis-kb/guides');
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.json') ? [join(d, e.name)] : []));
  return walk(dir).sort().map((f) => JSON.parse(readFileSync(f, 'utf8')));
}

export const BUNDLES = [
  {
    out: resolve(root, 'supabase/functions/_shared/docgenAgentSpec.bundle.js'),
    entry: resolve(root, 'src/features/document-generation/mcp/index.ts'),
    source: 'src/features/document-generation/mcp/ (+ 웹 문서 엔진)',
  },
  {
    out: resolve(root, 'supabase/functions/_shared/mcpEdgeData.bundle.js'),
    entry: resolve(root, 'src/lib/mcpEdgeData.ts'),
    source: 'src/lib/mcpEdgeData.ts (+ src/data/extensionDirectory.ts)',
  },
  {
    out: resolve(root, 'supabase/functions/_shared/mcpSchoolOps.bundle.js'),
    entry: resolve(root, 'src/lib/mcpSchoolOps.ts'),
    source: 'src/lib/mcpSchoolOps.ts (+ timetableSwapUtils · swapBurden · mealDuty · selfStudySupervision · schoolDay · surveyAggregate)',
  },
  {
    out: resolve(root, 'supabase/functions/_shared/mcpLibraryOps.bundle.js'),
    entry: resolve(root, 'src/lib/mcpLibraryOps.ts'),
    source: 'src/lib/mcpLibraryOps.ts (+ neisScreens.generated · neisScreenModel · codeShare) + neis-kb/guides',
    /** 묶음 끝에 함께 싣는 자료 — 안내 JSON(웹은 Vite glob 으로 싣는데 esbuild 에는 glob 이 없다) */
    extra: () => `export const NEIS_GUIDES_RAW = ${JSON.stringify(neisGuidesRaw())};`,
  },
  {
    out: resolve(root, 'supabase/functions/_shared/mcpWorkOps.bundle.js'),
    entry: resolve(root, 'src/lib/mcpWorkOps.ts'),
    source: 'src/lib/mcpWorkOps.ts (업무 진행하기 — 기능 지식 · 자동화 수준 · 진행 정리 · 결과 정리 · 돌아보기 지표)',
  },
] as const;
/** 예전 이름(문서 생성 묶음) — 회귀가 쓴다 */
export const BUNDLE_PATH = BUNDLES[0].out;

export async function bundleText(which: (typeof BUNDLES)[number] = BUNDLES[0]): Promise<string> {
  const extra = 'extra' in which ? which.extra() : null;
  const out = await build({
    ...(extra
      ? { stdin: { contents: `export * from ${JSON.stringify(which.entry.replace(/\\/g, '/'))};\n${extra}`, resolveDir: root, loader: 'ts' as const } }
      : { entryPoints: [which.entry] }),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    write: false,
    legalComments: 'none',
    charset: 'utf8',
    logLevel: 'silent',
    // 타입만 쓰는 `@/` import 가 남아 있어도 풀리게(값 import 는 상대 경로로 쓴다)
    alias: { '@': resolve(root, 'src') },
  });
  return `// 자동 생성 파일 — 고치지 말 것. 원본 = ${which.source}
// 다시 만들기: npx tsx scripts/mcp-docgen/build-bundle.mts
` + out.outputFiles[0].text;
}

/** 줄 끝은 보지 않는다 — 윈도 체크아웃(core.autocrlf)은 묶음을 CRLF 로 바꿔 놓는다(내용은 같다) */
export const sameBundle = (a: string, b: string) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let stale = 0;
  for (const b of BUNDLES) {
    const text = await bundleText(b);
    if (process.argv.includes('--check')) {
      const now = existsSync(b.out) ? readFileSync(b.out, 'utf8') : '';
      if (!sameBundle(now, text)) {
        console.error(`${basename(b.out)} 가 원본과 다릅니다 — npx tsx scripts/mcp-docgen/build-bundle.mts 로 다시 묶으세요.`);
        stale++;
      }
    } else {
      writeFileSync(b.out, text);
      console.log(`썼다: ${basename(b.out)} (${(text.length / 1024).toFixed(1)}KB)`);
    }
  }
  if (process.argv.includes('--check')) {
    if (stale) process.exitCode = 1;
    else console.log('묶음 최신');
  }
}
