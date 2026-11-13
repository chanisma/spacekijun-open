/**
 * 에이전트(MCP)가 한글 양식으로 «생성 방식»을 만들 때 쓰는 순수 로직 (2026-10-20).
 *
 * 사용자 결정 — 채울 자리(타깃)는 **서버 자동 탐지(detectSpecDraft)가 아니라 사용자의 에이전트가** 고르고,
 * 이름·작성 지시도 에이전트가 대화 맥락으로 붙인다. 그래서 서버가 하는 일은 셋뿐이다:
 *   ① 문서 지도 — 에이전트가 자리를 고를 수 있게 문단·표·셀 주소·누름틀을 글로 보여 준다(describeTemplate)
 *   ② 스펙 조립 — 에이전트가 적은 타깃을 웹과 같은 WorkSpec 모양으로 다듬는다(buildAgentSpec)
 *   ③ 시험 채움 — 웹 엔진(fillDocument)으로 견본 값을 실제로 채워 보고, 못 찾은 자리·겹친 자리를 거부한다(checkAgentSpec)
 * ③이 없으면 잘못 짚은 자리가 **오류 없이** 저장되고, 문서를 만들 때에야 «그 칸이 비었다»로 드러난다.
 *
 * ⚠️ 이 파일은 엣지 함수 `mcp` 가 쓰는 묶음(supabase/functions/_shared/docgenAgentSpec.bundle.js)의 원본이다.
 *    고치면 `npx tsx scripts/mcp-docgen/build-bundle.mts` 로 다시 묶을 것 — 회귀(scripts/mcp-agent-test/docgen.mts)가
 *    묶음이 원본과 같은지 검사한다. 그래서 `@/` 별칭을 쓰지 않는다(상대 경로만).
 */
import { parseHwpxSection, type CellNode, type HwpxIndex, type TableNode } from '../../task-workflow/document/spec/hwpxIndex';
import { resolveLocator } from '../../task-workflow/document/spec/locator';
import { fillDocument } from '../../task-workflow/document/spec/engine';
import { derivePlanSchema, normalizeSpecPlanKeys, type PlanFieldSchema } from '../../task-workflow/document/spec/planSchema';
import type { Locator, Target, WorkSpec } from '../../task-workflow/document/spec/types';

const FP_LEN = 48;
const fp = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, FP_LEN);
const clip = (s: string, n: number) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
};
/**
 * 지도에 싣는 원문 — **공백을 줄이지 않는다**. 에이전트가 이 글자를 텍스트 앵커로 그대로 옮겨 적으므로
 * `(     )학급` 을 `( )학급` 으로 보이면 엔진이 못 찾는다(실측). JSON 문자열로 보여 줄바꿈은 \n 으로 드러난다.
 * 잘렸으면 따옴표 밖에 … 를 붙인다(잘린 글자를 앵커로 쓰면 안 된다는 표시).
 */
const exact = (s: string, n: number) => (s.length > n ? `${JSON.stringify(s.slice(0, n))}…` : JSON.stringify(s));

/** 섹션마다 표 순번이 0부터 다시 시작한다 — 로케이터의 table.index 는 **문서 전체** 순번이다(locator.findTable). */
function globalTables(indexes: HwpxIndex[]) {
  const out: { g: number; section: number; table: TableNode; parent?: { g: number; cell: CellNode } }[] = [];
  const byNode = new Map<TableNode, number>();
  let g = 0;
  indexes.forEach((idx, section) => {
    for (const table of idx.tables) {
      byNode.set(table, g);
      out.push({ g, section, table });
      g++;
    }
  });
  for (const entry of out) {
    for (const row of entry.table.rows) {
      for (const cell of row.cells) {
        for (const inner of cell.tables) {
          const ig = byNode.get(inner);
          const child = ig != null ? out[ig] : undefined;
          if (child) child.parent = { g: entry.g, cell };
        }
      }
    }
  }
  return out;
}

export interface DescribeOptions {
  /** 이 섹션만 */
  section?: number;
  /** 이 표만(문서 전체 순번) — 셀을 자르지 않고 전부 보인다 */
  table?: number;
  /** 결과 글자 수 상한(넘으면 큰 표의 셀을 접고 table 로 다시 부르라고 안내) */
  maxChars?: number;
}

/**
 * 문서 지도. 표 밖 문단과 표를 **문서 순서대로** 늘어놓고, 셀마다 주소(r행 c열)와 병합 크기를 적는다.
 * 원문을 그대로 보여 주는 이유: 에이전트가 텍스트 앵커(anchor)를 원문 그대로 옮겨 적어야 엔진이 찾는다.
 */
export function describeTemplate(sections: string[], opts: DescribeOptions = {}): string {
  const indexes = sections.map(parseHwpxSection);
  const tables = globalTables(indexes);
  const maxChars = opts.maxChars ?? 60000;

  const render = (cellLimit: number, collapseRows: number | null) => {
    const lines: string[] = [];
    const fieldCount = indexes.reduce((n, idx) => n + idx.fields.filter((f) => f.type === 'CLICK_HERE').length, 0);
    lines.push(`섹션 ${sections.length}개 · 표 ${tables.length}개 · 누름틀 ${fieldCount}개`);

    const tableLines = (entry: (typeof tables)[number], limit: number, collapse: number | null) => {
      const t = entry.table;
      // 표 안 표도 문서 순번이 따로 있어 table.index 로 바로 가리킨다(locator.findTable 이 중첩까지 센다)
      const where = entry.parent ? ` · T${entry.parent.g} 의 r${entry.parent.cell.addr.row}c${entry.parent.cell.addr.col} 안에 든 표` : '';
      const out = [`[T${entry.g}] ${t.rows.length}행 × ${t.colCnt}열${where}`];
      const rows = collapse != null && t.rows.length > collapse ? [...t.rows.slice(0, collapse)] : t.rows;
      rows.forEach((row, ri) => {
        const cells = row.cells.map((c) => {
          const span = c.span.rows > 1 || c.span.cols > 1 ? `(${c.span.rows}×${c.span.cols})` : '';
          const inner = c.tables.length ? ` ⟨표 ${c.tables.map((it) => `T${tables.find((x) => x.table === it)?.g}`).join(',')}⟩` : '';
          return `c${c.addr.col}${span} ${limit > 0 ? exact(c.text, limit) : '…'}${inner}`;
        });
        out.push(`  r${row.cells[0]?.addr.row ?? ri}: ${cells.join(' | ')}`);
      });
      if (rows.length < t.rows.length) out.push(`  … ${t.rows.length - rows.length}행 더 — table: ${entry.g} 로 다시 부르면 전부 보인다`);
      return out;
    };

    indexes.forEach((idx, si) => {
      if (opts.section != null && opts.section !== si) return;
      if (opts.table != null) return;
      lines.push('', `== 섹션 ${si} ==`);
      for (const f of idx.fields) {
        if (f.type === 'MEMO' && f.innerText.trim()) lines.push(`[메모 — 양식이 적어 둔 작성 안내] ${clip(f.innerText, 300)}`);
        if (f.type === 'CLICK_HERE') lines.push(`[누름틀] fieldId=${f.fieldId} 글자 ${exact(f.innerText, 60)}`);
      }
      // 표 밖 문단과 최상위 표를 시작 위치 순으로 섞는다(표 안 표는 바깥 표 뒤에 이어서)
      const tops = tables.filter((t) => t.section === si && !t.parent);
      const items: { start: number; render: () => string[] }[] = [
        ...idx.topParagraphs
          .filter((p) => p.text.trim())
          .map((p) => ({ start: p.start, render: () => [`¶ ${exact(p.text, Math.max(cellLimit, 200))}`] })),
        ...tops.map((t) => ({
          start: t.table.start,
          render: () => {
            const out = tableLines(t, cellLimit, collapseRows);
            const nested = (parent: number): string[] => tables
              .filter((x) => x.parent?.g === parent)
              .flatMap((x) => [...tableLines(x, cellLimit, collapseRows), ...nested(x.g)]);
            return [...out, ...nested(t.g)];
          },
        })),
      ];
      items.sort((a, b) => a.start - b.start);
      for (const it of items) {
        // 표를 감싼 문단의 글자는 표 앞에 오므로 문단이 먼저 나온다
        lines.push(...it.render());
      }
    });

    if (opts.table != null) {
      const entry = tables.find((t) => t.g === opts.table);
      if (!entry) lines.push(`표 T${opts.table} 가 없습니다 (T0 ~ T${tables.length - 1}).`);
      else lines.push('', `== 섹션 ${entry.section} ==`, ...tableLines(entry, 400, null));
    }
    return lines.join('\n');
  };

  let text = render(80, null);
  if (text.length > maxChars) text = render(40, 6);
  if (text.length > maxChars) text = render(0, 3);
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n… (잘림 — section 또는 table 을 지정해 나눠 읽을 것)`;
  }
  return text;
}

/** 에이전트에게 주는 작성 규칙 — read 도구 결과에 한 번 싣는다(tools/list 에 매번 싣지 않는다). */
export const AGENT_SPEC_GUIDE = [
  '■ 채울 자리(targets) 쓰는 법 — 위 지도를 보고 자리마다 하나씩. 값은 문서를 만들 때 사람이 계획 검토에서 넣거나 AI 가 채운다.',
  '공통: id(영문·숫자·_ — 계획의 칸 이름이 된다) · kind · locator · label(사람이 볼 칸 이름, 한국어) · instruction(무엇을 어떻게 적을지) · required(기본 true)',
  'locator 종류:',
  '  셀 = {"kind":"cell","table":{"index":T번호},"addr":{"row":r,"col":c}} — 그 셀 글자 전체를 바꾼다. 표 안에 든 표도 자기 T번호로 바로 가리킨다.',
  '  글자 = {"kind":"text","anchor":"원문 그대로","occurrence":n(같은 글자가 여러 번이면 몇 번째),"position":"replace"|"after"} — anchor 를 바꾸거나(replace) 그 뒤에 덧붙인다(after).',
  '         지도의 글자는 JSON 문자열이다 — 공백 개수까지 그대로 옮긴다(따옴표 밖 … 는 잘렸다는 뜻이니 그 부분은 앵커로 쓰지 않는다). 앵커는 한 문단 안의 글자여야 한다.',
  '         여러 문단 구역은 "endAnchor":"끝 글자" 를 함께 준다(prose 에 쓴다).',
  '  누름틀 = {"kind":"clickhere","fieldId":"…"}',
  '  행 묶음 = {"kind":"rowGroup","table":{"index":T},"rows":[시작행,끝행]} — 예시 행을 지우고 항목 수만큼 행을 복제한다.',
  '  표 통째 = {"kind":"table","table":{"index":T}} — tableGroup 에 쓴다.',
  'kind 종류:',
  '  scalar — 짧은 값. valueType: text|number|date|phone. template:"({})학급" 처럼 {} 자리에 값.',
  '  personTeacher · personStudent — 사람 이름(계획 검토에서 명단으로 고른다, AI 가 지어내지 않는다).',
  '  choice — □/■ 체크. options:[{"label":"문서에 적힌 선택지 글자"}…] 2개 이상, exclusive(기본 true). locator 는 선택지가 든 셀이나 글자.',
  '  prose — 긴 서술(AI 가 쓴다). scaffold:["유지할 골격 줄"], length:"3~5문장" 같은 분량.',
  '  rowGroup — 반복 행. rowSource:"plan.items", rowSchema:[{"col":0,"kind":"computed","formula":"row.__index1"},{"col":1,"kind":"scalar","source":"row.name","instruction":"…"},{"col":2,"kind":"prose","source":"row.detail"}], minRows·maxRows.',
  '  tableGroup — 같은 서식의 표를 항목마다 복제. rowSource:"plan.blocks", cellSchema:[{"addr":{"row":1,"col":1},"source":"row.title"}], caption:{"anchor":"표 위 소제목 원문","source":"row.caption"}.',
  '  computed — 계산. formula:"plan.a + plan.b" 또는 "sum(rows.표id.col3)", format: number|currency|text.',
  '  keep — 바꾸면 안 되는 구역(검사용).',
  '주의:',
  '  - 칸 이름표 셀(예: "성명")이 아니라 **값이 들어갈 빈 셀**을 가리킨다. 이름표와 값이 한 셀이면 text 앵커 + template.',
  '  - 한 셀·한 글자를 두 자리가 함께 가리키지 않는다(겹치면 거부된다).',
  '  - 날짜·학교명처럼 문서마다 같은 값은 scalar 로 두고 instruction 에 적는다. 원문의 예시 내용(다른 해의 날짜·사업명)을 instruction 에 옮기지 않는다.',
  '  - create_document_generation 은 저장 전에 견본 값으로 실제 채움을 해 본다. check_only:true 로 먼저 검사만 할 수 있다.',
].join('\n');

/** 에이전트가 넘긴 타깃 → 웹 스펙 모양. 형식 오류는 problems 로 모아 돌려준다(첫 오류에서 멈추지 않는다). */
export interface AgentSpecInput {
  documentType: string;
  instruction?: string | null;
  contextExample?: string | null;
  targets: unknown;
}

const TARGET_KINDS = new Set(['scalar', 'choice', 'prose', 'rowGroup', 'tableGroup', 'computed', 'keep', 'personTeacher', 'personStudent']);
const LOCATOR_KINDS = new Set(['clickhere', 'text', 'cell', 'cellRange', 'rowGroup', 'table']);
const ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
export const MAX_AGENT_TARGETS = 200;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isAddr = (v: unknown) => isObj(v) && Number.isInteger(v.row) && Number.isInteger(v.col) && (v.row as number) >= 0 && (v.col as number) >= 0;

export function buildAgentSpec(input: AgentSpecInput, sections: string[]): { spec: WorkSpec | null; problems: string[] } {
  const problems: string[] = [];
  const raw = input.targets;
  if (!Array.isArray(raw) || raw.length === 0) return { spec: null, problems: ['targets 는 자리 1개 이상의 배열입니다.'] };
  if (raw.length > MAX_AGENT_TARGETS) return { spec: null, problems: [`자리는 ${MAX_AGENT_TARGETS}개까지입니다.`] };

  const indexes = sections.map(parseHwpxSection);
  const tables = globalTables(indexes);
  const ids = new Set<string>();
  const targets: Target[] = [];

  raw.forEach((t, i) => {
    const at = `${i + 1}번째 자리`;
    if (!isObj(t)) { problems.push(`${at}: 객체가 아닙니다.`); return; }
    const id = typeof t.id === 'string' ? t.id.trim() : '';
    const name = id ? `${at}(${id})` : at;
    if (!ID_RE.test(id)) { problems.push(`${name}: id 는 영문으로 시작하는 영문·숫자·_ 48자까지입니다.`); return; }
    if (ids.has(id)) { problems.push(`${name}: id 가 겹칩니다.`); return; }
    ids.add(id);
    if (typeof t.kind !== 'string' || !TARGET_KINDS.has(t.kind)) {
      problems.push(`${name}: kind 는 ${[...TARGET_KINDS].join(' · ')} 중 하나입니다.`); return;
    }
    const loc = t.locator;
    if (!isObj(loc) || typeof loc.kind !== 'string' || !LOCATOR_KINDS.has(loc.kind)) {
      problems.push(`${name}: locator.kind 는 ${[...LOCATOR_KINDS].join(' · ')} 중 하나입니다.`); return;
    }
    const locator = { ...loc } as unknown as Locator;
    // 섹션은 표 자리에서는 서버가 정하고(아래), 글자·누름틀 자리에서는 있는 섹션 번호만 받는다
    delete locator.section;
    if ((loc.kind === 'text' || loc.kind === 'clickhere') && loc.section != null) {
      if (!(Number.isInteger(loc.section) && (loc.section as number) >= 0 && (loc.section as number) < sections.length)) {
        problems.push(`${name}: section 은 0 ~ ${sections.length - 1} 입니다.`); return;
      }
      locator.section = loc.section as number;
    }
    if (loc.kind === 'text') {
      if (typeof loc.anchor !== 'string' || !loc.anchor) { problems.push(`${name}: text 자리에는 anchor(원문 글자)가 필요합니다.`); return; }
      if (loc.occurrence != null && !(Number.isInteger(loc.occurrence) && (loc.occurrence as number) >= 1)) {
        problems.push(`${name}: occurrence 는 1 이상의 정수입니다.`); return;
      }
      if (loc.position != null && loc.position !== 'replace' && loc.position !== 'after') {
        problems.push(`${name}: position 은 replace · after 입니다.`); return;
      }
    }
    if (loc.kind === 'clickhere' && (typeof loc.fieldId !== 'string' || !loc.fieldId)) {
      // 누름틀이 하나뿐이면 그것이다(웹 스펙도 fieldId 없이 쓴다). 여럿이면 «첫 번째»가 조용히 잡히므로 요구한다.
      const ids = indexes.flatMap((idx) => idx.fields.filter((f) => f.type === 'CLICK_HERE').map((f) => f.fieldId));
      if (ids.length !== 1) { problems.push(`${name}: 누름틀이 ${ids.length}개라 fieldId 가 필요합니다.`); return; }
    }
    if (loc.kind === 'cell' || loc.kind === 'rowGroup' || loc.kind === 'cellRange' || loc.kind === 'table') {
      const ti = isObj(loc.table) ? loc.table.index : undefined;
      const entry = Number.isInteger(ti) ? tables.find((x) => x.g === ti) : undefined;
      if (!entry) { problems.push(`${name}: table.index 가 없는 표입니다 (T0 ~ T${tables.length - 1}).`); return; }
      // 에이전트는 지도의 **문서 전체** T번호를 쓴다. 저장은 섹션 + 섹션 안 순번으로 바꾼다 —
      // locator.findTable 은 section 이 있으면 그 섹션 안에서만 센다(전체 번호에 section 을 붙이면 섹션 1 이후 표를 못 찾는다, 실측).
      // 지문은 서버가 문서에서 채운다 — 사람이 손으로 옮겨 적으면 한 글자만 달라도 다른 표로 재바인딩된다
      locator.table = { index: entry.table.index, fingerprint: fp(entry.table.headerFingerprint) };
      locator.section = entry.section;
      if (loc.kind === 'cell') {
        const path = Array.isArray(loc.cellPath) ? loc.cellPath : loc.addr ? [loc.addr] : null;
        if (!path || path.length === 0 || !path.every(isAddr)) {
          problems.push(`${name}: cell 자리에는 addr {row, col} 또는 cellPath 가 필요합니다.`); return;
        }
        if (Array.isArray(loc.cellPath)) { locator.cellPath = loc.cellPath as Locator['cellPath']; delete locator.addr; }
        else locator.addr = loc.addr as Locator['addr'];
        delete locator.fingerprint;
      }
      if (loc.kind === 'rowGroup' || loc.kind === 'cellRange') {
        const rows = loc.rows;
        if (!Array.isArray(rows) || rows.length !== 2 || !rows.every((n) => Number.isInteger(n) && n >= 0)) {
          problems.push(`${name}: rows 는 [시작행, 끝행] 입니다.`); return;
        }
      }
    }

    const target: Record<string, unknown> = { ...t, id, locator };
    // 탐지 흔적은 받지 않는다 — 사람이 확정한 자리로 저장한다
    delete target.confirmRequired; delete target.detector; delete target.autoLabel; delete target.evidence;
    target.required = t.required === false ? false : true;
    for (const key of ['label', 'instruction'] as const) {
      if (target[key] != null && typeof target[key] !== 'string') { problems.push(`${name}: ${key} 는 글자입니다.`); return; }
      if (typeof target[key] === 'string') target[key] = (target[key] as string).trim().slice(0, key === 'label' ? 60 : 1000) || undefined;
    }
    if (t.kind === 'choice') {
      const options = t.options;
      if (!Array.isArray(options) || options.length < 2 || !options.every((o) => isObj(o) && typeof o.label === 'string' && o.label)) {
        problems.push(`${name}: choice 에는 options [{label}] 가 2개 이상 필요합니다.`); return;
      }
    }
    if ((t.kind === 'rowGroup' || t.kind === 'tableGroup') && (typeof t.rowSource !== 'string' || !/^plan\.[A-Za-z0-9_]+$/.test(t.rowSource))) {
      problems.push(`${name}: rowSource 는 "plan.영문키" 입니다.`); return;
    }
    if (t.kind === 'rowGroup' && (!Array.isArray(t.rowSchema) || t.rowSchema.length === 0)) {
      problems.push(`${name}: rowGroup 에는 rowSchema(열 정의)가 필요합니다.`); return;
    }
    if (t.kind === 'rowGroup' && loc.kind !== 'rowGroup') { problems.push(`${name}: rowGroup 의 locator.kind 는 rowGroup 입니다.`); return; }
    if (t.kind === 'tableGroup') {
      if (loc.kind !== 'table') { problems.push(`${name}: tableGroup 의 locator.kind 는 table 입니다.`); return; }
      if (!Array.isArray(t.cellSchema) || t.cellSchema.length === 0) { problems.push(`${name}: tableGroup 에는 cellSchema 가 필요합니다.`); return; }
    }
    if (t.kind === 'computed' && (typeof t.formula !== 'string' || !t.formula)) { problems.push(`${name}: computed 에는 formula 가 필요합니다.`); return; }
    targets.push(target as unknown as Target);
  });

  if (problems.length) return { spec: null, problems };
  const documentType = input.documentType.trim().slice(0, 120);
  const spec: WorkSpec = normalizeSpecPlanKeys({
    specVersion: 1,
    documentType,
    targets,
    ...(input.instruction?.trim() ? { instruction: input.instruction.trim().slice(0, 4000) } : {}),
    ...(input.contextExample?.trim() ? { contextExample: input.contextExample.trim().slice(0, 2000) } : {}),
  });
  return { spec, problems };
}

export interface AgentSpecCheck {
  ok: boolean;
  problems: string[];
  warnings: string[];
  /** 문서를 만들 때 사람이 계획 검토에서 보게 될 칸 */
  planFields: { key: string; label?: string; type: string; optional?: boolean; person?: string; prose?: boolean; items?: string[] }[];
}

/** 견본 계획 — 칸 모양만 맞춘 값. 실제 문서 값이 아니다(시험 채움 전용). */
function samplePlan(spec: WorkSpec, schema: PlanFieldSchema[]): Record<string, unknown> {
  const plan: Record<string, unknown> = {};
  for (const f of schema) {
    if (f.type === 'number') plan[f.key] = 1;
    else if (f.type === 'boolean') plan[f.key] = true;
    else if (f.type === 'array') {
      // 종류를 모르는 열(scalar 열은 'unknown')은 «1» — 합계 식(sum(표.colN))이 그 열을 더할 수 있다.
      // 글자 견본을 넣으면 식이 «not a number» 로 죽어 멀쩡한 스펙을 거부한다(2026-10-20 운영 시험에서 발견)
      const row = Object.fromEntries((f.itemFields ?? []).map((i) => [i.key, i.type === 'number' ? 1 : '1']));
      const n = Math.max(f.minItems ?? 0, Math.min(2, f.maxItems ?? 2));
      plan[f.key] = Array.from({ length: n }, () => ({ ...row }));
    } else if (f.person) plan[f.key] = '홍길동';
    else if (f.prose) plan[f.key] = '견본 문장입니다.';
    else if (f.type === 'unknown') plan[f.key] = '1'; // 식이 더할 수 있는 칸(위 행 열과 같은 이유)
    else plan[f.key] = '견본';
  }
  // 택1 은 선택지 글자여야 표시가 바뀐다
  for (const t of spec.targets) {
    if (t.kind !== 'choice') continue;
    const key = t.select?.match(/^plan\.([A-Za-z0-9_]+)$/)?.[1] ?? (t.select ? null : t.id);
    if (key && t.options?.[0]) plan[key] = t.options[0].value ?? t.options[0].label;
  }
  return plan;
}

/** 자리 하나가 차지하는 구역 열쇠 — 두 자리가 같은 열쇠면 엔진이 overlapping edits 로 죽는다. */
function regionKey(indexes: HwpxIndex[], loc: Locator): string | null {
  const res = resolveLocator(indexes, loc);
  if (res.kind === 'cell') return `s${res.section}:cell:${res.cell.start}`;
  if (res.kind === 'rows') return `s${res.section}:rows:${res.table.start}:${res.dataRows.join('-')}`;
  if (res.kind === 'table') return `s${res.section}:table:${res.table.start}`;
  if (res.kind === 'text') return `s${res.section}:text:${res.anchor}#${res.occurrence}`;
  return null;
}

export async function checkAgentSpec(spec: WorkSpec, sections: string[]): Promise<AgentSpecCheck> {
  const problems: string[] = [];
  const warnings: string[] = [];
  const indexes = sections.map(parseHwpxSection);
  const label = (t: Target) => (t.label ? `${t.id}(${t.label})` : t.id);

  const seen = new Map<string, string>();
  for (const t of spec.targets) {
    const res = resolveLocator(indexes, t.locator);
    if (res.kind === 'stale') { problems.push(`${label(t)}: 문서에서 자리를 찾지 못했습니다 — ${res.reason}`); continue; }
    if (t.locator.kind === 'text' && t.locator.anchor) {
      const count = indexes[res.kind === 'text' ? res.section : 0].fullText.split(t.locator.anchor).length - 1;
      const occ = t.locator.occurrence ?? 1;
      if (occ > count) problems.push(`${label(t)}: "${clip(t.locator.anchor, 30)}" 는 ${count}번만 나옵니다 (occurrence ${occ}).`);
      else if (count > 1 && t.locator.occurrence == null) warnings.push(`${label(t)}: "${clip(t.locator.anchor, 30)}" 가 ${count}번 나옵니다 — 첫 번째에 씁니다. 다른 곳이면 occurrence 를 주세요.`);
    }
    if (t.kind === 'keep') continue;
    const key = regionKey(indexes, t.locator);
    if (key && seen.has(key)) problems.push(`${label(t)}: ${seen.get(key)} 와 같은 자리를 가리킵니다.`);
    else if (key) seen.set(key, label(t));
    if (res.kind === 'cell' && t.kind !== 'choice' && /[□■☑☐]/.test(res.cell.text)) {
      warnings.push(`${label(t)}: 체크 표시(□)가 있는 셀입니다 — 선택지라면 kind:"choice" 가 맞습니다.`);
    }
  }

  const schema = derivePlanSchema(spec, sections);
  const planFields = schema.map((f) => ({
    key: f.key, label: f.label, type: f.type,
    ...(f.optional ? { optional: true } : {}),
    ...(f.person ? { person: f.person } : {}),
    ...(f.prose ? { prose: true } : {}),
    ...(f.itemFields?.length ? { items: f.itemFields.map((i) => i.key) } : {}),
  }));

  if (!problems.length) {
    const plan = samplePlan(spec, schema);
    const presetValues = Object.fromEntries(spec.targets.filter((t) => t.kind === 'prose').map((t) => [t.id, '견본 문장입니다.']));
    try {
      const out = await fillDocument(sections, {
        spec, plan, presetValues,
        prose: { generate: async () => ({ paragraphs: ['견본 문장입니다.'] }) },
      });
      for (const r of out.report) {
        const t = spec.targets.find((x) => x.id === r.targetId);
        const name = t ? label(t) : r.targetId;
        if (r.status === 'stale' || r.status === 'error') problems.push(`${name}: 시험 채움 실패 — ${r.detail ?? r.status}`);
        else if (r.status === 'skipped') warnings.push(`${name}: 시험 채움에서 건너뜀 — ${r.detail ?? ''}`);
        else if (t?.kind === 'choice' && r.detail === 'marks changed: 0') warnings.push(`${name}: 체크 표시를 하나도 바꾸지 못했습니다 — 선택지 글자 앞에 □ 가 있는지 확인하세요.`);
      }
      out.sections.forEach((xml) => parseHwpxSection(xml));
    } catch (e) {
      problems.push(`시험 채움이 실패했습니다 — ${e instanceof Error ? e.message : String(e)} (자리 둘이 겹치면 이렇게 됩니다)`);
    }
  }

  return { ok: problems.length === 0, problems, warnings, planFields };
}
