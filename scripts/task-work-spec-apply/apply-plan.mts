// 스펙 번들 + 계획(plan) JSON → 완성 HWPX.
//
// 외부 AI 에이전트(Claude Code 등)가 번들을 읽고 계획을 쓴 뒤, **직접 한글 문서를 만들도록**
// 하는 진입점이다. 에이전트가 HWPX XML을 손으로 고치면 줄 나눔 캐시(<hp:linesegarray>)·
// 표 행 재조립 같은 함정을 그대로 밟으므로, 앱과 **같은 채움 엔진**을 쓰게 한다.
//
// 사용:
//   npx tsx scripts/task-work-spec-apply/apply-plan.mts \
//     --bundle <spec-bundle.json> --plan <plan.json> [--template <양식.hwpx>] [--out <결과.hwpx>]
//
//   · --template 생략 시 번들과 같은 폴더의 `template.hwpx`를 쓴다(zip 번들 기본 구성).
//   · --out 생략 시 계획 파일 옆에 `<양식명>.filled.hwpx`로 저장한다.
//   · 서술(prose) 값은 plan에 들어 있는 문자열을 그대로 쓴다(LLM 호출 없음). 비어 있으면
//     그 타깃은 채워지지 않고 리포트에 표시된다 — 에이전트가 본문을 직접 써 넣어야 한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import JSZip from 'jszip';
import { fillDocument, verifyDocument } from '../../src/features/task-workflow/document/spec/index';
import type { Plan, SpecBundle, WorkSpec } from '../../src/features/task-workflow/document/spec/index';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const bundlePath = arg('bundle');
const planPath = arg('plan');
if (!bundlePath || !planPath) {
  console.error('사용: npx tsx scripts/task-work-spec-apply/apply-plan.mts --bundle <spec-bundle.json> --plan <plan.json> [--template <양식.hwpx>] [--out <결과.hwpx>]');
  process.exit(2);
}

const bundle = JSON.parse(readFileSync(resolve(bundlePath), 'utf-8')) as SpecBundle;
if (bundle.kind !== 'spacekijun.work-spec-bundle') {
  console.error(`스펙 번들이 아닙니다(kind=${String(bundle.kind)}).`);
  process.exit(2);
}
const plan = JSON.parse(readFileSync(resolve(planPath), 'utf-8')) as Plan;
const templatePath = resolve(arg('template') ?? join(dirname(resolve(bundlePath)), 'template.hwpx'));
const outPath = resolve(
  arg('out') ?? join(dirname(resolve(planPath)), `${(bundle.template.name || bundle.spec.documentType || 'document').replace(/[\\/:*?"<>|]/g, '_')}.filled.hwpx`),
);

// ── 양식 로드 ──
const zip = await JSZip.loadAsync(readFileSync(templatePath));
const sectionNames = Object.keys(zip.files)
  .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
  .sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
if (!sectionNames.length) {
  console.error(`HWPX 본문 섹션을 찾을 수 없습니다: ${templatePath}`);
  process.exit(2);
}
const sections: string[] = [];
for (const n of sectionNames) sections.push(await zip.file(n)!.async('text'));

// ── 채움: prose는 plan 값을 preset으로 승격(앱의 실행 경로와 동일 — LLM 무호출) ──
const spec = bundle.spec as WorkSpec;
const presetValues: Record<string, unknown> = {};
for (const t of spec.targets) {
  if (t.kind !== 'prose') continue;
  const v = plan[t.id];
  if (typeof v === 'string' && v.trim()) presetValues[t.id] = v;
}

const filled = await fillDocument(sections, { spec, plan, knowledge: {}, presetValues });
const checks = verifyDocument({ spec, filled, plan, knowledge: {} });

// ── 줄 레이아웃 캐시 재계산(앱의 normalizeHwpxLayout과 같은 경로) ──
const ROOT = join(import.meta.dirname, '..', '..');
const core = await import('file://' + join(ROOT, 'node_modules/@rhwp/core/rhwp.js').replaceAll('\\', '/'));
core.initSync({ module: readFileSync(join(ROOT, 'node_modules/@rhwp/core/rhwp_bg.wasm')) });

const out = new JSZip();
out.file('mimetype', await zip.file('mimetype')!.async('uint8array'), { compression: 'STORE' });
for (const name of Object.keys(zip.files)) {
  const f = zip.files[name];
  if (f.dir || name === 'mimetype') continue;
  const si = sectionNames.indexOf(name);
  if (si >= 0) out.file(name, filled.sections[si], { compression: 'DEFLATE' });
  else out.file(name, await f.async('uint8array'), { compression: 'DEFLATE' });
}
let bytes: Uint8Array = await out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
try {
  const doc = new core.HwpDocument(bytes);
  try {
    if (doc.reflowLinesegs() > 0) {
      const exported: Uint8Array = doc.exportHwpx();
      if (exported.length >= bytes.length * 0.5) bytes = exported;
    }
  } finally { doc.free(); }
} catch { /* 보정 실패는 무해 — 한글이 열 때 재계산한다 */ }
writeFileSync(outPath, bytes);

// ── 리포트 ──
const notFilled = filled.report.filter((r) => r.status !== 'filled');
const bad = checks.filter((c) => c.status !== 'pass');
console.log(`저장: ${outPath}`);
console.log(`타깃 ${filled.report.length}건 중 채움 ${filled.report.length - notFilled.length}건`);
if (notFilled.length) {
  console.log('채우지 못한 타깃:');
  for (const r of notFilled) console.log(`  - ${r.targetId}: ${r.status}${r.detail ? ` (${r.detail})` : ''}`);
}
if (bad.length) {
  console.log('검증 경고:');
  for (const c of bad) console.log(`  - [${c.status}] ${c.key}: ${c.message ?? ''}`);
}
process.exit(notFilled.some((r) => r.status === 'stale') ? 1 : 0);
