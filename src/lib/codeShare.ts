/**
 * 코드 공유 — 순수 로직 단일 출처 (React·Supabase 비의존).
 *
 * 화면(`src/features/code-share/`)은 그리기만 하고, 아래 판정은 전부 여기서 한다:
 *  - 올라온 파일 묶음 정리(경로 정규화 · 무시 목록 · 공통 루트 벗기기 · 텍스트/이진 판정 · 한도)
 *  - 프로젝트 종류(html / static / node / other)와 진입 파일 판정
 *  - 정적 여러 파일 프로젝트를 **한 문서로 합치기**(상대 참조 → data: URL)
 *  - package.json 프로젝트를 Sandpack 설정으로 옮기기
 *  - 공개 범위 판정(서버 RLS 의 사본 — 화면이 무엇을 보여줄지만 정한다)
 *
 * 왜 data: URL 인가 — 실행 iframe 은 `sandbox="allow-scripts"` 로 **출처 없음(opaque origin)** 이다.
 * blob: URL 은 만든 출처에 묶여 있어 그 안에서 읽힌다는 보장이 없고(브라우저마다 다르다),
 * data: URL 은 출처가 없어 어디서나 읽힌다. 또 data: 는 Blob 없이 문자열만으로 만들 수 있어
 * 이 모듈이 브라우저 없이도 돌고(= 회귀 테스트가 된다) 결과가 결정적이다.
 *
 * 회귀 = `npx tsx scripts/code-share-test/run.mts`
 */

export type CodeProjectKind = 'html' | 'static' | 'node' | 'skill' | 'other';
export type CodeProjectVisibility = 'school' | 'link' | 'private';

/** 올리기 단계의 파일 한 장(저장 전) */
export interface CodeFileDraft {
  /** 정규화된 상대 경로 (`src/App.tsx`) */
  path: string;
  /** 텍스트 파일 본문. 이진이면 null */
  content: string | null;
  isBinary: boolean;
  size: number;
}

export const KIND_LABELS: Record<CodeProjectKind, string> = {
  html: '단일 HTML',
  static: '정적 사이트',
  node: 'npm 프로젝트',
  skill: 'Claude 스킬',
  other: '코드 모음',
};

export const KIND_RUN_HINTS: Record<CodeProjectKind, string> = {
  html: '이 화면 안에서 바로 실행됩니다.',
  static: '파일을 한 문서로 합쳐 이 화면 안에서 실행됩니다.',
  node: 'Sandpack(CodeSandbox 번들러)이 브라우저에서 빌드해 실행합니다 — 외부 서비스에 기댑니다.',
  skill: 'SKILL.md 와 참고 문서를 [문서] 보기에서 읽습니다. zip 을 받아 .claude/skills/ 에 풀면 Claude Code 에서 씁니다.',
  other: '실행할 진입 파일이 없어 코드 보기·내려받기만 됩니다.',
};

export const VISIBILITY_LABELS: Record<CodeProjectVisibility, string> = {
  school: '학교 전체',
  link: '링크를 아는 사람',
  private: '나만',
};

export const VISIBILITY_HINTS: Record<CodeProjectVisibility, string> = {
  school: '로그인한 모든 사람의 목록에 보입니다.',
  link: '목록에는 안 보이고, 링크를 받은 사람(로그인 필요)만 엽니다.',
  private: '나와 관리자만 봅니다.',
};

export const CODE_SHARE_LIMITS = {
  maxFiles: 300,
  /** 텍스트 파일 한 장 상한 — 이보다 크면 코드가 아니라 데이터다 */
  maxTextBytes: 1_000_000,
  maxBinaryBytes: 5 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  /** 정적 실행에서 data: URL 로 끼워 넣는 이진 자산의 합 상한(문서 하나가 너무 커지지 않게) */
  maxInlineAssetBytes: 8 * 1024 * 1024,
} as const;

// ── 1. 경로 정리 ─────────────────────────────────────────────────────────

/**
 * 업로드가 준 경로를 저장 형식으로. 역슬래시·`./`·앞 슬래시·빈 조각을 걷어낸다.
 * `..` 가 남으면 null — 사용자 폴더 밖을 가리키는 경로는 받지 않는다.
 */
export function normalizeProjectPath(raw: string): string | null {
  const parts = raw
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p !== '' && p !== '.');
  if (parts.length === 0) return null;
  if (parts.some((p) => p === '..')) return null;
  const joined = parts.join('/');
  if (joined.length > 400) return null;
  return joined;
}

/** 폴더째 올릴 때 늘 따라오지만 저장하면 안 되는 것 */
const IGNORED_SEGMENTS = new Set([
  'node_modules', 'dist', 'build', 'coverage', '__MACOSX', 'out', '.next', '.vite', '.cache', '.turbo',
]);
const IGNORED_BASENAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock', 'Thumbs.db', 'desktop.ini',
]);

/** 점으로 시작하지만 받아 주는 폴더 — Claude 스킬은 `.claude/skills/<이름>/` 째로 올라온다 */
const ALLOWED_DOT_SEGMENTS = new Set(['.claude']);

/**
 * 무시할 경로인가. 점으로 시작하는 조각(`.git`·`.env`·`.DS_Store`)은 전부 뺀다 —
 * `.env` 에 API 키가 들어 있는 바이브코딩 프로젝트가 흔해서, 받아 주는 순간 공유된다.
 * 예외는 `.claude` 하나(스킬 폴더). 그 안의 `.env` 같은 것은 여전히 빠진다.
 */
export function isIgnoredProjectPath(path: string): boolean {
  const parts = path.split('/');
  if (parts.some((p) => IGNORED_SEGMENTS.has(p))) return true;
  if (parts.some((p) => p.startsWith('.') && !ALLOWED_DOT_SEGMENTS.has(p))) return true;
  return IGNORED_BASENAMES.has(parts[parts.length - 1]);
}

/**
 * 모든 경로가 같은 첫 폴더 아래에 있으면 그 폴더를 벗긴다(zip 의 루트 폴더 · 폴더 선택).
 * 되풀이한다 — `my-app/my-app-main/index.html` 같은 이중 포장도 있다.
 * 파일이 하나뿐이면 폴더 없이 그 이름만 남긴다.
 */
export function stripCommonRoot(paths: string[]): Map<string, string> {
  let current = paths.slice();
  const original = paths.slice();
  for (;;) {
    const firsts = new Set(current.map((p) => p.split('/')[0]));
    const allNested = current.every((p) => p.includes('/'));
    if (firsts.size !== 1 || !allNested || current.length === 0) break;
    current = current.map((p) => p.slice(p.indexOf('/') + 1));
  }
  const out = new Map<string, string>();
  original.forEach((p, i) => out.set(p, current[i]));
  return out;
}

// ── 2. 텍스트 / 이진 ──────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx', 'vue', 'svelte', 'astro',
  'json', 'jsonc', 'json5', 'md', 'mdx', 'txt', 'csv', 'tsv', 'xml', 'svg', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'env',
  'py', 'rb', 'php', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'swift', 'sh', 'bat', 'ps1', 'sql', 'r',
  'map', 'lock', 'gitignore', 'editorconfig', 'prettierrc', 'eslintrc', 'babelrc', 'npmrc', 'nvmrc', 'htaccess',
  'LICENSE', 'README', 'Makefile', 'Dockerfile', 'Procfile',
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript', jsx: 'text/javascript',
  ts: 'text/typescript', tsx: 'text/typescript', json: 'application/json', md: 'text/markdown',
  txt: 'text/plain', csv: 'text/csv', xml: 'application/xml', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  ico: 'image/x-icon', avif: 'image/avif', bmp: 'image/bmp',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  mp4: 'video/mp4', webm: 'video/webm',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  pdf: 'application/pdf', wasm: 'application/wasm', glb: 'model/gltf-binary', gltf: 'model/gltf+json',
};

export function extensionOf(path: string): string {
  const base = path.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return base; // `Makefile` · `.gitignore` 는 이름 자체가 확장자 구실
  return base.slice(dot + 1).toLowerCase();
}

/** 확장자로 텍스트인지. 모르는 확장자는 **이진**으로 둔다 — 그대로 저장하면 아무것도 잃지 않는다 */
export function isTextPath(path: string): boolean {
  const ext = extensionOf(path);
  return TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(ext.toLowerCase());
}

export function mimeOf(path: string): string {
  return MIME_BY_EXTENSION[extensionOf(path)] ?? (isTextPath(path) ? 'text/plain' : 'application/octet-stream');
}

// ── 3. 묶음 정리 · 한도 ──────────────────────────────────────────────────

export interface RawUploadEntry {
  path: string;
  size: number;
}

export interface UploadPlan<T extends RawUploadEntry> {
  /** 저장할 것 (정규화된 경로로 바뀜) */
  kept: Array<T & { path: string }>;
  ignored: Array<{ path: string; reason: '무시 목록' | '경로 오류' }>;
}

/**
 * 올라온 항목을 정규화하고 거른다. 순서: 경로 정규화 → 무시 목록 → 공통 루트 벗기기.
 * 공통 루트는 **무시 목록을 거른 뒤** 센다 — `.git/` 때문에 루트가 안 벗겨지면 안 된다.
 */
export function planUpload<T extends RawUploadEntry>(entries: T[]): UploadPlan<T> {
  const ignored: UploadPlan<T>['ignored'] = [];
  const normalized: Array<{ entry: T; path: string }> = [];
  for (const entry of entries) {
    const path = normalizeProjectPath(entry.path);
    if (!path) { ignored.push({ path: entry.path, reason: '경로 오류' }); continue; }
    if (isIgnoredProjectPath(path)) { ignored.push({ path, reason: '무시 목록' }); continue; }
    normalized.push({ entry, path });
  }
  const stripped = stripCommonRoot(normalized.map((n) => n.path));
  const seen = new Set<string>();
  const kept: UploadPlan<T>['kept'] = [];
  for (const n of normalized) {
    const path = stripped.get(n.path) ?? n.path;
    if (seen.has(path)) continue;
    seen.add(path);
    kept.push({ ...n.entry, path });
  }
  return { kept, ignored };
}

export function validateProjectFiles(files: CodeFileDraft[]): string[] {
  const errors: string[] = [];
  if (files.length === 0) errors.push('파일이 없습니다.');
  if (files.length > CODE_SHARE_LIMITS.maxFiles) errors.push(`파일이 너무 많습니다 (${files.length}개, 최대 ${CODE_SHARE_LIMITS.maxFiles}개).`);
  let total = 0;
  for (const f of files) {
    total += f.size;
    if (!f.isBinary && f.size > CODE_SHARE_LIMITS.maxTextBytes) errors.push(`${f.path}: 텍스트 파일이 너무 큽니다 (${formatBytes(f.size)}).`);
    if (f.isBinary && f.size > CODE_SHARE_LIMITS.maxBinaryBytes) errors.push(`${f.path}: 파일이 너무 큽니다 (${formatBytes(f.size)}).`);
  }
  if (total > CODE_SHARE_LIMITS.maxTotalBytes) errors.push(`전체 용량이 너무 큽니다 (${formatBytes(total)}, 최대 ${formatBytes(CODE_SHARE_LIMITS.maxTotalBytes)}).`);
  return errors;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── 4. 종류 · 진입 파일 ──────────────────────────────────────────────────

const depth = (p: string) => p.split('/').length;

/**
 * 실행 진입 HTML. `index.html` 을 얕은 것부터, 없으면 유일한 .html, 그것도 없으면 가장 얕은 .html.
 * (node 프로젝트도 Vite 는 루트 index.html 이 진입이라 같은 규칙이 맞다)
 */
export function detectEntryPath(paths: string[]): string | null {
  const htmls = paths.filter((p) => /\.html?$/i.test(p)).sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  if (htmls.length === 0) return null;
  const index = htmls.find((p) => /(^|\/)index\.html?$/i.test(p));
  return index ?? htmls[0];
}

/** Claude 스킬의 정의 파일 경로(루트의 SKILL.md). 대소문자는 관대하게 */
export function findSkillManifest(paths: string[]): string | null {
  return paths.find((p) => /^skill\.md$/i.test(p)) ?? null;
}

export function detectProjectKind(paths: string[]): CodeProjectKind {
  if (findSkillManifest(paths)) return 'skill';
  if (paths.includes('package.json')) return 'node';
  const htmls = paths.filter((p) => /\.html?$/i.test(p));
  if (htmls.length === 0) return 'other';
  if (paths.length === 1) return 'html';
  return 'static';
}

// ── 4-1. 마크다운 문서 (스킬 · README) ──────────────────────────────────

export const isMarkdownPath = (p: string) => /\.(md|mdx|markdown)$/i.test(p);

/**
 * 읽기 보기에 보여 줄 문서 순서: SKILL.md → README.md → 나머지(얕은 것·이름순).
 * 문서가 하나도 없으면 빈 배열 — 화면이 [문서] 보기를 감춘다.
 */
export function listMarkdownPaths(paths: string[]): string[] {
  const md = paths.filter(isMarkdownPath);
  const rank = (p: string) => (/^skill\.md$/i.test(p) ? 0 : /^readme\.md$/i.test(p) ? 1 : 2);
  return md.sort((a, b) => rank(a) - rank(b) || depth(a) - depth(b) || a.localeCompare(b));
}

export interface Frontmatter {
  data: Record<string, string>;
  body: string;
}

/**
 * `---` 로 둘러싼 머리말(name · description …)을 떼어 낸다. 값은 한 줄 `key: value` 만 본다 —
 * 스킬 머리말이 그 모양이고, 중첩 YAML 까지 해석하려 들면 파서 하나를 더 들이게 된다.
 * 따옴표로 감싼 값은 벗기고, 여러 줄 값(`>`·`|`)은 이어지는 들여쓴 줄을 공백으로 잇는다.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string> = {};
  let key: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) {
      key = kv[1];
      let v = kv[2].trim();
      if (v === '>' || v === '|' || v === '>-' || v === '|-') v = '';
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      data[key] = v;
    } else if (key && /^\s+\S/.test(line)) {
      data[key] = `${data[key]} ${line.trim()}`.trim();
    }
  }
  return { data, body: text.slice(m[0].length) };
}

/**
 * 문서 안의 링크가 묶음의 다른 파일을 가리키면 그 경로를, 외부면 null.
 * `references/x.md#절` 처럼 해시가 붙어도 파일로 간다.
 */
export function resolveMarkdownLink(fromPath: string, href: string, paths: string[]): string | null {
  if (isExternalRef(href)) return null;
  const target = resolveRelativePath(fromPath, href);
  if (!target) return null;
  if (paths.includes(target)) return target;
  // `references/x` 처럼 확장자를 뺀 링크
  const withMd = `${target}.md`;
  return paths.includes(withMd) ? withMd : null;
}

// ── 5. 정적 프로젝트 → 한 문서 (data: URL 치환) ──────────────────────────

export interface StaticSourceFile {
  path: string;
  /** 텍스트 본문 — css·js 는 안의 참조도 다시 치환된다 */
  text?: string;
  /** 이진 파일은 호출부가 base64 data: URL 로 만들어 넘긴다 */
  dataUrl?: string;
  size: number;
}

export interface AssembledDocument {
  html: string;
  /** 참조했지만 묶음에 없는 경로 — 화면이 "이 파일은 외부 또는 누락" 으로 말한다 */
  missing: string[];
  /** 끼워 넣은 파일 수 */
  inlined: number;
  /** 상한 때문에 끼워 넣지 못한 이진 파일 */
  skipped: string[];
}

/** `http:`·`//`·`data:`·`#`·`mailto:` 처럼 우리 묶음 밖을 가리키는 참조인가 */
export function isExternalRef(ref: string): boolean {
  const r = ref.trim();
  if (r === '' || r.startsWith('#') || r.startsWith('//')) return true;
  return /^[a-z][a-z0-9+.-]*:/i.test(r);
}

/** `from` 파일 기준 상대 참조를 묶음 경로로. 쿼리·해시는 떼고, 루트 절대(`/a.css`)는 루트 기준 */
export function resolveRelativePath(fromPath: string, ref: string): string | null {
  const clean = ref.trim().replace(/[?#].*$/, '');
  if (clean === '') return null;
  const base = clean.startsWith('/') ? [] : fromPath.split('/').slice(0, -1);
  const parts = clean.split('/');
  const out = base.slice();
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (out.length === 0) return null; out.pop(); continue; }
    out.push(part);
  }
  return out.length ? out.join('/') : null;
}

type Resolver = (fromPath: string, ref: string) => string | null;

/** CSS 안의 `url(...)` 과 `@import "..."` */
export function rewriteCssUrls(css: string, cssPath: string, resolve: Resolver): string {
  return css
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (whole, q: string, ref: string) => {
      if (isExternalRef(ref)) return whole;
      const url = resolve(cssPath, ref);
      return url ? `url(${q}${url}${q})` : whole;
    })
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (whole, q: string, ref: string) => {
      if (isExternalRef(ref)) return whole;
      const url = resolve(cssPath, ref);
      return url ? `@import ${q}${url}${q}` : whole;
    });
}

/** JS/TS 안의 상대 `import … from './x.js'` · `import('./x.js')` · `export … from './x'` */
export function rewriteJsImports(js: string, jsPath: string, resolve: Resolver): string {
  return js.replace(
    /((?:^|[^\w$.])(?:import|export)\s*(?:[^'"`;]*?\s+from\s*|\(\s*)?)(['"])(\.{1,2}\/[^'"\n]+)\2/g,
    (whole, head: string, q: string, ref: string) => {
      const url = resolve(jsPath, ref) ?? resolve(jsPath, `${ref}.js`);
      return url ? `${head}${q}${url}${q}` : whole;
    },
  );
}

/**
 * HTML 안의 `src`·`href`·`poster` 와 인라인 `<style>`·`<script>` 를 치환한다.
 * `<a href>` 는 건드리지 않는다 — 다른 페이지로 가는 링크는 한 문서 안에서 의미가 없다.
 */
export function rewriteHtmlReferences(html: string, htmlPath: string, resolve: Resolver): string {
  let out = html.replace(
    /<(link|script|img|source|video|audio|iframe|embed|object|track)\b([^>]*?)\s(src|href|poster|data)\s*=\s*(["'])([^"']*)\4/gi,
    (whole, tag: string, before: string, attr: string, q: string, ref: string) => {
      if (isExternalRef(ref)) return whole;
      const url = resolve(htmlPath, ref);
      return url ? `<${tag}${before} ${attr}=${q}${url}${q}` : whole;
    },
  );
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, open: string, body: string, close: string) =>
    `${open}${rewriteCssUrls(body, htmlPath, resolve)}${close}`);
  out = out.replace(/(<script\b[^>]*type\s*=\s*["']module["'][^>]*>)([\s\S]*?)(<\/script>)/gi, (_, open: string, body: string, close: string) =>
    `${open}${rewriteJsImports(body, htmlPath, resolve)}${close}`);
  return out;
}

/**
 * 텍스트 → data: URL. ⚠️ `encodeURIComponent` 는 `'`·`(`·`)` 를 **인코딩하지 않는다** — 그대로 두면
 * 홑따옴표가 든 JS 파일이 `from '…'` 안에서 문자열을 끊고, `)` 가 든 CSS 가 따옴표 없는 `url(…)` 을 끊는다
 * (오류 없이 모듈이 조용히 안 뜬다 — 샘플 폴더 회귀에서 실제로 잡혔다). 셋을 더 인코딩해 어느 자리에서도 안전하게.
 */
function toTextDataUrl(mime: string, text: string): string {
  const encoded = encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `data:${mime};charset=utf-8,${encoded}`;
}

/**
 * 정적 프로젝트를 iframe `srcdoc` 하나로. css·js 는 재귀로 안의 참조까지 치환하고
 * (순환 참조는 끊는다) 이진은 받은 data: URL 그대로 쓴다.
 */
export function assembleStaticDocument(files: StaticSourceFile[], entryPath: string): AssembledDocument {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const entry = byPath.get(entryPath);
  if (!entry || entry.text == null) {
    return { html: '', missing: [entryPath], inlined: 0, skipped: [] };
  }
  const missing = new Set<string>();
  const skipped = new Set<string>();
  const cache = new Map<string, string | null>();
  const inProgress = new Set<string>();
  let inlined = 0;
  let inlinedBinaryBytes = 0;

  const resolve: Resolver = (fromPath, ref) => {
    const target = resolveRelativePath(fromPath, ref);
    if (!target) return null;
    if (cache.has(target)) return cache.get(target) ?? null;
    const file = byPath.get(target);
    if (!file) { missing.add(target); cache.set(target, null); return null; }
    if (inProgress.has(target)) return null; // a.css ↔ b.css 순환
    let url: string | null = null;
    if (file.text != null) {
      inProgress.add(target);
      const ext = extensionOf(target);
      const body = ext === 'css'
        ? rewriteCssUrls(file.text, target, resolve)
        : /^(m?js|cjs|jsx|ts|tsx)$/.test(ext)
          ? rewriteJsImports(file.text, target, resolve)
          : file.text;
      inProgress.delete(target);
      url = toTextDataUrl(mimeOf(target), body);
      inlined += 1;
    } else if (file.dataUrl) {
      if (inlinedBinaryBytes + file.size > CODE_SHARE_LIMITS.maxInlineAssetBytes) {
        skipped.add(target);
      } else {
        inlinedBinaryBytes += file.size;
        url = file.dataUrl;
        inlined += 1;
      }
    }
    cache.set(target, url);
    return url;
  };

  const html = rewriteHtmlReferences(entry.text, entryPath, resolve);
  return { html, missing: [...missing], inlined, skipped: [...skipped] };
}

// ── 6. package.json 프로젝트 → Sandpack ─────────────────────────────────

export type SandpackTemplateName =
  | 'static' | 'vanilla' | 'vanilla-ts' | 'react' | 'react-ts'
  | 'vite' | 'vite-react' | 'vite-react-ts' | 'vite-vue' | 'vite-vue-ts' | 'vite-svelte' | 'vite-svelte-ts'
  | 'nextjs' | 'node';

export interface SandpackSetup {
  template: SandpackTemplateName;
  /** Sandpack 은 `/` 로 시작하는 경로를 쓴다 */
  files: Record<string, { code: string }>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  /** 이진 파일은 Sandpack 에 못 싣는다 — 화면이 알려 준다 */
  binaryPaths: string[];
  /** 판정 근거 한 줄 */
  reason: string;
}

function readPackageJson(text: string | undefined): { deps: Record<string, string>; devDeps: Record<string, string> } {
  if (!text) return { deps: {}, devDeps: {} };
  try {
    const pkg = JSON.parse(text) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return { deps: pkg.dependencies ?? {}, devDeps: pkg.devDependencies ?? {} };
  } catch {
    return { deps: {}, devDeps: {} };
  }
}

export function detectSandpackTemplate(
  paths: string[],
  deps: Record<string, string>,
  devDeps: Record<string, string>,
): { template: SandpackTemplateName; reason: string } {
  const all = { ...devDeps, ...deps };
  const hasTs = paths.some((p) => /\.tsx?$/.test(p)) || 'typescript' in all;
  const has = (name: string) => name in all;
  if (has('next')) return { template: 'nextjs', reason: 'next 의존성' };
  if (has('vite')) {
    if (has('react')) return { template: hasTs ? 'vite-react-ts' : 'vite-react', reason: 'vite + react' };
    if (has('vue')) return { template: hasTs ? 'vite-vue-ts' : 'vite-vue', reason: 'vite + vue' };
    if (has('svelte')) return { template: hasTs ? 'vite-svelte-ts' : 'vite-svelte', reason: 'vite + svelte' };
    return { template: 'vite', reason: 'vite' };
  }
  if (has('react-scripts') || has('react')) return { template: hasTs ? 'react-ts' : 'react', reason: 'react (CRA 형)' };
  if (paths.includes('index.html')) return { template: 'static', reason: 'package.json 은 있지만 번들러가 없고 index.html 이 있음' };
  if (paths.some((p) => /^(index|main|server|app)\.(m?js|ts)$/.test(p))) return { template: 'node', reason: '노드 스크립트' };
  return { template: hasTs ? 'vanilla-ts' : 'vanilla', reason: '기본' };
}

/**
 * Nodebox(Sandpack 의 브라우저 안 Node)가 돌릴 수 있는 빌드 도구 버전 — Sandpack 자체 vite 템플릿의 고정값
 * (`@codesandbox/sandpack-react` 2.20 의 `VITE_*_TEMPLATE`). ⚠️ 사용자의 `package.json` 을 그대로 넘기면
 * 이 고정이 덮여 vite 5 가 깔리고 `Cannot find module 'esbuild-wasm'` 으로 죽는다(2026-10-02 실제 증상).
 * 런타임 의존성(react·vue …)은 사용자 것을 쓰고 **도구만** 바꿔 끼운다.
 */
export const NODEBOX_VITE_TOOLCHAIN: Record<string, string> = {
  vite: '4.1.4',
  'esbuild-wasm': '0.17.12',
  '@vitejs/plugin-react': '3.1.0',
  '@vitejs/plugin-vue': '3.2.0',
  '@sveltejs/vite-plugin-svelte': '^2.0.2',
};

/** Nodebox 에서 못 도는 네이티브 도구 → 대체 */
const NODEBOX_TOOL_SWAPS: Record<string, string> = {
  '@vitejs/plugin-react-swc': '@vitejs/plugin-react',
};

export const isViteTemplate = (t: SandpackTemplateName) => t === 'vite' || t.startsWith('vite-');

/**
 * vite 계열 템플릿의 실행용 package.json. 사용자 devDependencies 에서 도구를 Nodebox 버전으로 바꾸고
 * `esbuild-wasm` 을 보장한다. 사용자의 scripts 는 쓰지 않는다(Nodebox 는 `dev: vite` 를 기대한다).
 */
export function buildNodeboxPackageJson(deps: Record<string, string>, devDeps: Record<string, string>): string {
  const dev: Record<string, string> = {};
  for (const [name, ver] of Object.entries(devDeps)) {
    const swapped = NODEBOX_TOOL_SWAPS[name] ?? name;
    dev[swapped] = NODEBOX_VITE_TOOLCHAIN[swapped] ?? ver;
  }
  // 사용자가 vite 를 dependencies 에 둔 경우도 있다
  const runtime: Record<string, string> = {};
  for (const [name, ver] of Object.entries(deps)) {
    const swapped = NODEBOX_TOOL_SWAPS[name] ?? name;
    if (NODEBOX_VITE_TOOLCHAIN[swapped]) dev[swapped] = NODEBOX_VITE_TOOLCHAIN[swapped];
    else runtime[swapped] = ver;
  }
  dev.vite = NODEBOX_VITE_TOOLCHAIN.vite;
  dev['esbuild-wasm'] = NODEBOX_VITE_TOOLCHAIN['esbuild-wasm'];
  return JSON.stringify({
    name: 'code-share-project',
    private: true,
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    dependencies: runtime,
    devDependencies: dev,
  }, null, 2);
}

export function buildSandpackSetup(files: Array<{ path: string; content: string | null }>): SandpackSetup {
  const paths = files.map((f) => f.path);
  const pkgText = files.find((f) => f.path === 'package.json')?.content ?? undefined;
  const { deps, devDeps } = readPackageJson(pkgText);
  const { template, reason } = detectSandpackTemplate(paths, deps, devDeps);
  const out: Record<string, { code: string }> = {};
  const binaryPaths: string[] = [];
  for (const f of files) {
    if (f.content == null) { binaryPaths.push(f.path); continue; }
    out[`/${f.path}`] = { code: f.content };
  }
  let dependencies = deps;
  let devDependencies = devDeps;
  if (isViteTemplate(template)) {
    // 실행용 package.json 으로 바꿔치기 — 사용자의 원본은 [코드] 탭(다른 Provider)에 그대로 보인다
    const pkg = buildNodeboxPackageJson(deps, devDeps);
    out['/package.json'] = { code: pkg };
    const parsed = JSON.parse(pkg) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    dependencies = parsed.dependencies;
    devDependencies = parsed.devDependencies;
  }
  return { template, files: out, dependencies, devDependencies, binaryPaths, reason };
}

// ── 7. 공개 범위 (서버 RLS 의 사본) ─────────────────────────────────────

export interface CodeProjectAccessFields {
  visibility: string;
  owner_resource_id: string;
}

export function isCodeProjectOwner(p: CodeProjectAccessFields, resourceId: string | null | undefined): boolean {
  return !!resourceId && p.owner_resource_id === resourceId;
}

/** 열람 — 학교 공개·링크 공개는 누구나, 비공개는 본인·관리자 */
export function canViewCodeProject(p: CodeProjectAccessFields, resourceId: string | null | undefined, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (p.visibility === 'school' || p.visibility === 'link') return true;
  return isCodeProjectOwner(p, resourceId);
}

/** 수정·삭제 — 본인·관리자 */
export function canEditCodeProject(p: CodeProjectAccessFields, resourceId: string | null | undefined, isAdmin: boolean): boolean {
  return isAdmin || isCodeProjectOwner(p, resourceId);
}

/** 가져가기(포크) — 볼 수 있으면 된다. 자기 것도 사본을 뜰 수 있다 */
export function canForkCodeProject(p: CodeProjectAccessFields, resourceId: string | null | undefined, isAdmin: boolean): boolean {
  return canViewCodeProject(p, resourceId, isAdmin);
}

// ── 8. 실행 iframe 의 sandbox ─────────────────────────────────────────────

/**
 * 업로드된 코드를 돌리는 iframe 의 sandbox 값. **`allow-same-origin` 을 절대 넣지 말 것** —
 * 그 순간 안의 코드가 우리 앱 출처가 되어 Supabase 세션·localStorage 에 손을 댄다.
 * `allow-top-navigation` 도 금지(안의 코드가 페이지를 바꿔치기한다).
 */
export const CODE_RUN_SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock';
