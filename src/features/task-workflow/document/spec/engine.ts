// fill 오케스트레이션: 스펙 + plan + knowledge → 새 섹션 XML.
// 결정적 kind(scalar/choice/computed/keep/rowGroup)는 코드가, prose만 LLM이 채운다.
// 모든 값은 문서가 아니라 plan/knowledge에서 파생 — 문서는 write-only 투영.
//
// 적용 순서(오프셋 충돌 방지):
//   0) keep 스냅샷(원본 기준)
//   A) rowGroup 외 타깃 편집 수집 → 일괄 적용 → 재색인
//   B) rowGroup 타깃을 하나씩: 현 색인에서 재해석 → 적용 → 재색인
// rowGroup은 표의 데이터 범위~마지막 행을 재조립하므로 다른 편집과 같은
// 오프셋 공간에 둘 수 없다. B가 항상 최신 좌표에서 동작하는 이유.

import {
  isPersonKind, joinPersonNames, splitPersonNames,
  type ChoiceTarget, type ComputedTarget, type FillReportItem, type PersonTarget, type Plan,
  type ProseTarget, type RowGroupTarget, type ScalarTarget, type TableGroupTarget, type WorkSpec,
} from './types';
import {
  applyEdits, type CellNode, decodeEntities, type Edit, editsClearLineSeg, editsSetRunText,
  editsSetCellText, editsSetCellSingleValue,
  findInParagraphs, type HwpxIndex, parseHwpxSection, type RunNode, type TableNode,
} from './hwpxIndex';
import { resolveLocator, resolvedRegionText } from './locator';
import { replaceTableRows } from './tableRows';
import { repeatReplacementRange } from './repeatRegion';
import { evaluateFormula, makeResolver, toNum, type Resolver } from './formula';

/** prose 생성기 — LLM 어댑터는 llm.ts, 스크립트는 스텁 주입 */
export interface ProseGenerator {
  generate(req: {
    documentType: string;
    instruction: string;
    scaffold?: string[];
    planExcerpt: Record<string, unknown>;
    siblingValues: Record<string, unknown>;
    currentText: string;
  }): Promise<{ paragraphs: string[] }>;
}

export interface FillInput {
  spec: WorkSpec;
  plan: Plan;
  knowledge?: Record<string, unknown>;
  prose?: ProseGenerator;
  /**
   * 저장된 확정 값 재주입(값-기반 완성본 재구성): 키가 있는 prose 타깃은 LLM을 호출하지
   * 않고 이 값을 그대로 기록한다. 같은 (섹션, spec, plan, knowledge, presetValues)면
   * 출력 바이트가 동일 — 완성본은 파일이 아니라 값만 저장해도 재구성 가능한 근거.
   */
  presetValues?: Record<string, unknown>;
}

/** 예시 분량 상한 — 유형별로 필요한 맥락의 크기가 다르다 */
const EXAMPLE_LIMITS = {
  /** 단답·택1: 구역 텍스트 그대로 */
  scalar: 500,
  /** 서술: 형식·어조·분량을 그대로 따라야 하므로 넉넉히 */
  prose: 1500,
  /** 반복 행: 열별 예시로 재구성한 뒤의 전체 상한 */
  rowGroup: 1800,
  /** 반복 행 열별 예시: 셀 하나 / 표본 행 수 */
  rowCell: 200,
  rowSamples: 3,
} as const;

/**
 * 타깃별 "양식 예시" 수집(2026-07-27): 각 타깃의 지정 구역에 원래 적혀 있던 텍스트를
 * plan 키(없으면 타깃 id) 기준으로 모아 plan LLM에 표기 형식 참고로 전달한다.
 * keep(불변)만 제외 — 서술은 계획 단계에서 확정되므로 여기서 함께 수집한다.
 *
 * **반복 행은 표 전체를 한 덩어리로 자르지 않는다**(2026-07-27 사용자 지적): 8열×20행
 * 표를 500자로 뭉개면 첫 1~2행만 남아 열별 표기 형식이 보이지 않는다. 열마다 기존 셀
 * 몇 개를 뽑아 `c0(시기): "8월 4주" | "8월 5주"` 형태로 재구성해 전달한다.
 * 해석 실패는 조용히 스킵(예시는 보조 정보).
 */
export function collectRegionExamples(spec: WorkSpec, sections: string[]): Record<string, string> {
  const indexes = sections.map(parseHwpxSection);
  const planKeyOf = (s?: string) => {
    const m = /(?:^|[^A-Za-z0-9_])plan\.([A-Za-z0-9_]+)/.exec(s ?? '');
    return m?.[1];
  };
  const out: Record<string, string> = {};
  for (const t of spec.targets) {
    if (t.kind === 'keep') continue;
    // 이름 타깃은 예시를 만들지 않는다(2026-08-22): 값은 사람이 명단에서 고르므로 참고할
    // "표기 형식"이 없고, 양식에 적힌 예시 이름("홍길동")이 프롬프트에 실리면 LLM이
    // 그것을 실재 인물처럼 복사한다. 근원에서 막아야 하는 이유 = 예시 키는 타깃 id가
    // 아니라 **plan 키**라서 소비하는 쪽에서 id로 거르면 빗나간다.
    if (isPersonKind(t.kind)) continue;
    try {
      const res = resolveLocator(indexes, t.locator);
      if (res.kind === 'stale') continue;

      if (t.kind === 'rowGroup') {
        const key = planKeyOf((t as RowGroupTarget).rowSource) ?? t.id;
        const text = rowGroupExample(t as RowGroupTarget, res);
        if (text) out[key] = text.slice(0, EXAMPLE_LIMITS.rowGroup);
        continue;
      }

      if (t.kind === 'tableGroup') {
        const key = planKeyOf((t as TableGroupTarget).rowSource) ?? t.id;
        const text = tableGroupExample(t as TableGroupTarget, res);
        if (text) out[key] = text.slice(0, EXAMPLE_LIMITS.rowGroup);
        continue;
      }

      const text = resolvedRegionText(res, indexes).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const key =
        t.kind === 'scalar'
          ? planKeyOf((t as ScalarTarget).source)
          : t.kind === 'choice'
            ? planKeyOf((t as ChoiceTarget & { select?: string }).select)
            : undefined;
      const limit = t.kind === 'prose' ? EXAMPLE_LIMITS.prose : EXAMPLE_LIMITS.scalar;
      out[key ?? t.id] = text.slice(0, limit);
    } catch { /* 스킵 — 예시는 보조 정보 */ }
  }
  return out;
}

/** 반복 행 예시를 "열별 기존 셀" 형태로 재구성 — 열 표기 형식이 보이도록 */
function rowGroupExample(rg: RowGroupTarget, res: ReturnType<typeof resolveLocator>): string {
  if (res.kind !== 'rows') return '';
  const table = res.table as never as { rows: Array<{ cells: Array<{ addr: { col: number }; text: string }> }> };
  const [from, to] = res.dataRows;
  const lines: string[] = [];
  for (const col of rg.rowSchema ?? []) {
    if (col.kind === 'keep') continue;
    const cellKey = /(?:^|[^A-Za-z0-9_])row\.([A-Za-z0-9_]+)/.exec(col.source ?? '')?.[1] ?? `col${col.col}`;
    const samples: string[] = [];
    for (let r = from; r <= to && samples.length < EXAMPLE_LIMITS.rowSamples; r++) {
      const text = (table.rows[r]?.cells.find((c) => c.addr.col === col.col)?.text ?? '')
        .replace(/\s+/g, ' ').trim();
      if (text) samples.push(`"${text.slice(0, EXAMPLE_LIMITS.rowCell)}"`);
    }
    if (samples.length) {
      lines.push(`${cellKey}${col.instruction ? `(${col.instruction})` : ''}: ${samples.join(' | ')}`);
    }
  }
  return lines.length ? `열별 기존 내용 예시:\n${lines.join('\n')}` : '';
}

/**
 * 표 복제 예시를 "지정 셀별 기존 내용"으로 재구성 — 셀마다 표기 형식·분량이 보이도록.
 * 표 전체 텍스트를 통째로 자르면 앞 몇 셀만 남아 뒤쪽 셀의 형식이 사라진다(rowGroup과 동일 이유).
 */
function tableGroupExample(tg: TableGroupTarget, res: ReturnType<typeof resolveLocator>): string {
  if (res.kind !== 'table') return '';
  const lines: string[] = [];
  if (tg.caption?.anchor) {
    const key = /(?:^|[^A-Za-z0-9_])row\.([A-Za-z0-9_]+)/.exec(tg.caption.source ?? '')?.[1] ?? 'caption';
    lines.push(`${key}(표 소제목): "${tg.caption.anchor.replace(/\s+/g, ' ').trim()}"`);
  }
  for (const c of tg.cellSchema ?? []) {
    const cell = cellByAddr(res.table, c.addr.row, c.addr.col);
    const text = (cell?.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const key = /(?:^|[^A-Za-z0-9_])row\.([A-Za-z0-9_]+)/.exec(c.source ?? '')?.[1]
      ?? `r${c.addr.row}c${c.addr.col}`;
    const limit = c.kind === 'prose' ? EXAMPLE_LIMITS.prose : EXAMPLE_LIMITS.rowCell;
    lines.push(`${key}${c.instruction ? `(${c.instruction})` : ''}: "${text.slice(0, limit)}"`);
  }
  return lines.length ? `표 1개의 기존 내용 예시(항목마다 이 표가 한 개씩 생성됨):\n${lines.join('\n')}` : '';
}

/** 반복 행의 서술 열 배치 생성에 쓰는 열 정보(원본 예시·지침 포함) */
export interface RowProseColumn {
  targetId: string;
  /** plan 배열 키(rowSource의 plan.<key>) */
  planKey: string;
  /** 행 객체의 셀 키(row.<cellKey>) */
  cellKey: string;
  col: number;
  instruction?: string;
  /** 원본 표의 이 열에 원래 있던 내용(양식 예시 — 분량·형식 기준) */
  examples: string[];
}

/**
 * 반복 행의 서술(prose) 열 목록과 원본 예시 수집(2026-07-27).
 * 한 번의 plan 호출로 전 열을 만들면 셀마다 주의가 분산돼 키워드 나열이 되므로,
 * 열별 배치 생성을 위해 열 지침과 **그 열의 기존 셀 텍스트**를 모은다.
 */
export function collectRowProseColumns(spec: WorkSpec, sections: string[]): RowProseColumn[] {
  const indexes = sections.map(parseHwpxSection);
  const out: RowProseColumn[] = [];
  for (const t of spec.targets) {
    if (t.kind !== 'rowGroup') continue;
    const rg = t as RowGroupTarget;
    const planKey = /(?:^|[^A-Za-z0-9_])plan\.([A-Za-z0-9_]+)/.exec(rg.rowSource ?? '')?.[1];
    if (!planKey) continue;
    let table: { rows: Array<{ cells: Array<{ addr: { col: number }; text: string }> }> } | null = null;
    let range: [number, number] = [0, -1];
    try {
      const res = resolveLocator(indexes, t.locator);
      if (res.kind === 'rows') {
        table = res.table as never;
        range = res.dataRows;
      }
    } catch { /* 예시 없이 진행 */ }
    for (const col of rg.rowSchema ?? []) {
      if (col.kind !== 'prose') continue;
      const cellKey = /(?:^|[^A-Za-z0-9_])row\.([A-Za-z0-9_]+)/.exec(col.source ?? '')?.[1];
      if (!cellKey) continue;
      const examples: string[] = [];
      if (table) {
        for (let r = range[0]; r <= Math.min(range[1], range[0] + 4); r++) {
          const cell = table.rows[r]?.cells.find((c) => c.addr.col === col.col);
          const text = (cell?.text ?? '').replace(/\s+/g, ' ').trim();
          if (text) examples.push(text.slice(0, 300));
        }
      }
      out.push({ targetId: t.id, planKey, cellKey, col: col.col, instruction: col.instruction, examples });
    }
  }
  return out;
}

export interface FillOutput {
  sections: string[];
  report: FillReportItem[];
  /** keep 타깃의 채움 전 구역 텍스트(verify에서 후 텍스트와 대조) */
  keepSnapshots: Record<string, string>;
  /** 타깃별 확정 값(제약 평가·감사용) */
  values: Record<string, unknown>;
  rows: Record<string, Record<string, unknown>[]>;
}

/**
 * 텍스트를 바꾼 문단들의 줄 레이아웃 캐시 제거(2026-07-27) — stale linesegarray가
 * 남으면 렌더러가 옛 줄 폭에 새 텍스트를 밀어넣어 글자가 퍼지거나 페이지를 넘는다.
 *
 * `seen`은 **한 섹션의 편집 묶음 전체**에서 공유해야 한다: 같은 문단을 여러 타깃이
 * 건드리면 동일 범위 제거 edit가 두 번 생겨 applyEdits가 overlapping으로 거부한다
 * (실측: form2에서 prose 블록 문단과 scalar 앵커 문단이 겹침).
 */
function clearLineSegEdits(
  xml: string, paras: Array<{ start: number; end: number }>, seen: Set<number>,
): Edit[] {
  const out: Edit[] = [];
  for (const p of paras) {
    if (seen.has(p.start)) continue;
    seen.add(p.start);
    out.push(...editsClearLineSeg(xml, p));
  }
  return out;
}

/**
 * 셀 값이 실제로 기록되는 문단 — editsSetCellText는 첫 런에만 쓰고 나머지는 비운다.
 * 캐시 제거를 이 문단으로 한정해야 경고·검증 부하가 폭증하지 않는다(실측: 셀당 전 문단을
 * 지우면 22페이지 문서에서 569문단 → Studio 사전 검증이 60초 타임아웃).
 */
function writtenParagraphOf(cell: { paragraphs: Array<{ start: number; end: number; runs: unknown[] }> }) {
  return cell.paragraphs.find((p) => p.runs.length > 0) ?? null;
}

/** offset을 포함하는 문단(텍스트 앵커 편집 지점의 문단 식별) */
function paraAtOffset<T extends { start: number; end: number }>(paras: T[], offset: number): T | null {
  return paras.find((p) => offset >= p.start && offset < p.end) ?? null;
}

function formatValue(v: unknown, t: ScalarTarget | ComputedTarget): string {
  if ((t as ComputedTarget).format === 'currency' || (t as ScalarTarget).valueType === 'number') {
    try { return toNum(v).toLocaleString('ko-KR'); } catch { /* 문자열 그대로 */ }
  }
  return String(v ?? '');
}

export async function fillDocument(sections: string[], input: FillInput): Promise<FillOutput> {
  const { spec, plan, prose } = input;
  const knowledge = input.knowledge ?? {};
  const report: FillReportItem[] = [];
  const keepSnapshots: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const rows: Record<string, Record<string, unknown>[]> = {};

  let current = [...sections];
  let indexes: HwpxIndex[] = current.map(parseHwpxSection);

  const ctx = () => ({ plan, knowledge, target: values, rows, ...values });
  const resolver = (): Resolver => makeResolver(ctx());

  // ── 0) keep 스냅샷(원본 기준) ──
  for (const t of spec.targets) {
    if (t.kind !== 'keep') continue;
    const res = resolveLocator(indexes, t.locator);
    if (res.kind === 'stale') {
      report.push({ targetId: t.id, status: 'stale', detail: res.reason });
      continue;
    }
    keepSnapshots[t.id] = resolvedRegionText(res, indexes);
    report.push({ targetId: t.id, status: 'kept' });
  }

  // ── 1) 행/항목 데이터 확정(rowSource + computed 열) ──
  for (const t of spec.targets) {
    if (t.kind === 'tableGroup') {
      // 표 복제 항목: 열 수식이 없으므로 자동 번호만 붙여 그대로 보관
      const tg = t as TableGroupTarget;
      const src = resolver()(tg.rowSource);
      if (!Array.isArray(src)) {
        report.push({ targetId: t.id, status: 'error', detail: `rowSource not array: ${tg.rowSource}` });
        rows[t.id] = [];
        continue;
      }
      rows[t.id] = src.slice(0, tg.maxItems ?? src.length).map((item, i) => ({
        __index0: i, __index1: i + 1, ...(item as Record<string, unknown>),
      }));
      continue;
    }
    if (t.kind !== 'rowGroup') continue;
    const rg = t as RowGroupTarget;
    const src = resolver()(rg.rowSource);
    if (!Array.isArray(src)) {
      report.push({ targetId: t.id, status: 'error', detail: `rowSource not array: ${rg.rowSource}` });
      rows[t.id] = [];
      continue;
    }
    const bounded = src.slice(0, rg.maxRows ?? src.length);
    rows[t.id] = bounded.map((row, i) => {
      // __index1: 연번 열용 자동 번호(1-base)
      const out: Record<string, unknown> = { __index0: i, __index1: i + 1, ...(row as Record<string, unknown>) };
      for (const col of rg.rowSchema) {
        // 열 하나의 식 오류가 fill 전체를 죽이지 않게 열 단위로 격리(값은 비움, 아래 report에 남김)
        try {
          if (col.kind === 'computed' && col.formula) {
            out[`col${col.col}`] = evaluateFormula(col.formula, makeResolver({ ...ctx(), row: out }));
          } else if (col.source) {
            out[`col${col.col}`] = makeResolver({ ...ctx(), row: out })(col.source);
          }
        } catch (e) {
          out[`col${col.col}`] = undefined;
          report.push({
            targetId: t.id, status: 'error',
            detail: `row ${i} col ${col.col}: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }
      return out;
    });
  }

  // ── 2) scalar/choice/computed 값 확정(문서 기록 전) ──
  // 타깃 하나의 소스·수식 오류가 fill 전체를 죽이지 않게 타깃 단위로 격리한다
  // (예: detect가 남긴 자리표시 수식). 값은 비워 두고 report에 error로 남기면
  // 이후 기록 단계가 'no value'로 건너뛰고 verify가 실패를 드러낸다.
  for (const t of spec.targets) {
    try {
      if (t.kind === 'scalar' || isPersonKind(t.kind)) {
        // 이름 타깃의 plan 값은 이미 이어 붙인 문자열이라 scalar와 값 해석이 같다
        const s = t as ScalarTarget | PersonTarget;
        values[t.id] = s.source ? resolver()(s.source) : (plan as Record<string, unknown>)[t.id];
      } else if (t.kind === 'choice') {
        const c = t as ChoiceTarget;
        const sel = c.select ? resolver()(c.select) : (plan as Record<string, unknown>)[t.id];
        const opt = (c.options ?? []).find((o) => o.value === sel || o.label === sel || String(o.value) === String(sel));
        values[t.id] = opt ? { label: opt.label, value: opt.value ?? opt.label, selectedValue: opt.value ?? opt.label } : undefined;
      } else if (t.kind === 'computed') {
        values[t.id] = evaluateFormula((t as ComputedTarget).formula, resolver());
      }
    } catch (e) {
      values[t.id] = undefined;
      report.push({ targetId: t.id, status: 'error', detail: e instanceof Error ? e.message : String(e) });
    }
  }

  // ── A) rowGroup 외 타깃 기록 ──
  const editsBySection: Edit[][] = current.map(() => []);
  // 섹션별 '줄 캐시 이미 제거한 문단' 추적 — 타깃 간 중복 제거 edit 방지
  const clearedSegs: Set<number>[] = current.map(() => new Set<number>());
  for (const t of spec.targets) {
    if (t.kind === 'keep' || t.kind === 'rowGroup' || t.kind === 'tableGroup') continue;
    try {
      const res = resolveLocator(indexes, t.locator);
      if (res.kind === 'stale') {
        report.push({ targetId: t.id, status: 'stale', detail: res.reason });
        continue;
      }

      if (t.kind === 'scalar' || t.kind === 'computed' || isPersonKind(t.kind)) {
        const v = values[t.id];
        if (v == null || v === '') {
          report.push({ targetId: t.id, status: 'skipped', detail: 'no value' });
          continue;
        }
        // 이름은 저장(기본 구분자)과 표시(스펙 separator)를 분리한다
        const base = isPersonKind(t.kind)
          ? joinPersonNames(splitPersonNames(v), (t as PersonTarget).separator)
          : formatValue(v, t as ScalarTarget);
        const tpl = t.kind === 'computed' ? undefined : (t as ScalarTarget | PersonTarget).template;
        const text = tpl ? tpl.replace('{}', base) : base;
        if (res.kind === 'cell') {
          editsBySection[res.section].push(...editsSetCellText(res.cell, text));
          const wrote = writtenParagraphOf(res.cell);
          if (wrote) editsBySection[res.section].push(...clearLineSegEdits(indexes[res.section].xml, [wrote], clearedSegs[res.section]));
        } else if (res.kind === 'text') {
          const hit = findInParagraphs(indexes[res.section].xml, res.paras, res.anchor, res.occurrence);
          if (!hit) { report.push({ targetId: t.id, status: 'stale', detail: 'anchor hit failed' }); continue; }
          if (res.position === 'after') {
            const last = hit.segments[hit.segments.length - 1];
            editsBySection[res.section].push({ start: last.end, end: last.end, text: escapeInline(text) });
          } else {
            hit.segments.forEach((seg, i) => {
              editsBySection[res.section].push({ start: seg.start, end: seg.end, text: i === 0 ? escapeInline(text) : '' });
            });
          }
          // 길이가 달라진 문단의 줄 캐시 제거
          const touched = hit.segments
            .map((seg) => paraAtOffset(res.paras, seg.start))
            .filter((p): p is NonNullable<typeof p> => p != null);
          editsBySection[res.section].push(...clearLineSegEdits(indexes[res.section].xml, touched, clearedSegs[res.section]));
        }
        report.push({ targetId: t.id, status: 'filled' });
        continue;
      }

      if (t.kind === 'choice') {
        const c = t as ChoiceTarget;
        const chosen = values[t.id] as { label: string } | undefined;
        if (!chosen) { report.push({ targetId: t.id, status: 'skipped', detail: 'no selection' }); continue; }
        const mark = c.mark ?? { unchecked: '□', checked: '■' };
        if (res.kind !== 'cell' && res.kind !== 'text') { report.push({ targetId: t.id, status: 'stale', detail: 'choice needs cell/text' }); continue; }
        const paras = res.kind === 'cell' ? res.cell.paragraphs : res.paras;
        const xml = indexes[res.section].xml;
        const joined = paras.map((p) => p.text).join('\n');
        let flipped = 0;
        for (const opt of c.options ?? []) {
          const isChosen = opt.label === chosen.label;
          if (!isChosen && c.exclusive === false) continue;
          const li = joined.indexOf(opt.label);
          if (li < 0) { report.push({ targetId: t.id, status: 'stale', detail: `option not found: ${opt.label}` }); continue; }
          let mi = -1; let mc = '';
          for (let k = li - 1; k >= 0; k--) {
            const ch = joined[k];
            if (ch === mark.checked || ch === mark.unchecked || ch === '☑' || ch === '□' || ch === '■' || ch === '☐') { mi = k; mc = ch; break; }
            if (ch === '\n') break;
          }
          if (mi < 0) continue;
          const want = isChosen ? mark.checked : mark.unchecked;
          if (mc === want) continue;
          const occ = countChar(joined.slice(0, mi + 1), mc);
          const hit = findInParagraphs(xml, paras, mc, occ);
          if (!hit || hit.segments.length !== 1) continue;
          editsBySection[res.section].push({ start: hit.segments[0].start, end: hit.segments[0].end, text: escapeInline(want) });
          flipped++;
        }
        report.push({ targetId: t.id, status: 'filled', detail: `marks changed: ${flipped}` });
        continue;
      }

      if (t.kind === 'prose') {
        const p = t as ProseTarget;
        if (res.kind !== 'cell' && res.kind !== 'text') { report.push({ targetId: t.id, status: 'stale', detail: 'prose needs cell/text' }); continue; }
        const preset = input.presetValues?.[t.id];
        let paragraphs: string[];
        if (typeof preset === 'string' && preset.length > 0) {
          paragraphs = preset.split('\n');
        } else {
          if (!prose) { report.push({ targetId: t.id, status: 'skipped', detail: 'no prose generator' }); continue; }
          const planExcerpt: Record<string, unknown> = {};
          for (const key of p.sources ?? []) planExcerpt[key] = resolver()(key);
          // plan[타깃id] = 사람이 계획 검토에서 적은 서술 방향 지침(선택) — LLM 참고자료로 전달
          const guide = (plan as Record<string, unknown>)[t.id];
          if (guide != null && guide !== '') planExcerpt[`plan.${t.id}`] = guide;
          // 지정 구역의 기존 텍스트(셀 내용 또는 텍스트 선택 구간)를 양식 예시로 전달 —
          // LLM이 문장 구조·형식을 따라 쓰게 한다(2026-07-27 사용자 요청)
          const currentText = res.kind === 'cell' ? res.cell.text : resolvedRegionText(res, indexes);
          const gen = await prose.generate({
            documentType: spec.documentType,
            instruction: [spec.instruction, p.instruction].filter(Boolean).join('\n'),
            scaffold: p.scaffold,
            planExcerpt,
            siblingValues: { ...values },
            currentText,
          });
          paragraphs = gen.paragraphs;
        }
        values[t.id] = paragraphs.join('\n');
        if (res.kind === 'cell') {
          writeParagraphsToCell(editsBySection[res.section], res.cell.paragraphs, paragraphs);
          editsBySection[res.section].push(...clearLineSegEdits(indexes[res.section].xml, res.cell.paragraphs, clearedSegs[res.section]));
        } else if (res.endAnchor) {
          // 블록 대체: anchor~endAnchor 구간(여러 문단)을 생성 문단들로 교체
          const range = editsReplaceTextBlock(
            editsBySection[res.section], indexes[res.section].xml, res.paras,
            res.anchor, res.occurrence, res.endAnchor, paragraphs,
          );
          if (!range) {
            report.push({ targetId: t.id, status: 'stale', detail: 'block anchors not resolved' });
            continue;
          }
          // 대체된 구간(anchor~endAnchor)의 문단만 줄 캐시 제거 — res.paras는 섹션 전체
          // 문단이라 그대로 지우면 수백 개가 비표준 상태가 된다(실측 511개)
          editsBySection[res.section].push(...clearLineSegEdits(
            indexes[res.section].xml, res.paras.slice(range.si, range.ei + 1), clearedSegs[res.section],
          ));
        } else {
          const hit = findInParagraphs(indexes[res.section].xml, res.paras, res.anchor, res.occurrence);
          if (hit) {
            // 단일 앵커 = 문단 하나에 다 들어간다 — 줄바꿈은 escapeInline이 lineBreak로 기록
            const text = paragraphs.join('\n');
            hit.segments.forEach((seg, i) => editsBySection[res.section].push({ start: seg.start, end: seg.end, text: i === 0 ? escapeInline(text) : '' }));
            const touched = hit.segments
              .map((seg) => paraAtOffset(res.paras, seg.start))
              .filter((p): p is NonNullable<typeof p> => p != null);
            editsBySection[res.section].push(...clearLineSegEdits(indexes[res.section].xml, touched, clearedSegs[res.section]));
          }
        }
        report.push({ targetId: t.id, status: 'filled' });
        continue;
      }
    } catch (e) {
      report.push({ targetId: t.id, status: 'error', detail: e instanceof Error ? e.message : String(e) });
    }
  }

  current = current.map((xml, i) => applyEdits(xml, editsBySection[i]));
  indexes = current.map(parseHwpxSection);

  // ── B) rowGroup 타깃: 하나씩 최신 좌표에서 ──
  for (const t of spec.targets) {
    if (t.kind !== 'rowGroup') continue;
    const rg = t as RowGroupTarget;
    try {
      const res = resolveLocator(indexes, t.locator);
      if (res.kind !== 'rows') {
        report.push({ targetId: t.id, status: 'stale', detail: res.kind === 'stale' ? res.reason : 'rowGroup needs rows locator' });
        continue;
      }
      const data = rows[t.id] ?? [];
      if ((rg.minRows ?? 1) > data.length) {
        report.push({ targetId: t.id, status: 'error', detail: `rows ${data.length} < min ${rg.minRows ?? 1}` });
        continue;
      }
      const { table } = res;
      const [a, b] = res.dataRows;
      const xml = indexes[res.section].xml;
      const replaceRange = rg.replaceRows ?? (rg.repeatUnit === 'row' || rg.detector === 'rowGroup' || res.keepRows.length
        ? [a, b] as [number, number]
        : repeatReplacementRange(xml, table, [a, b], rg.rowSchema.map((c) => c.col)));
      current[res.section] = replaceTableRows(
        xml, table, replaceRange, res.keepRows ?? [], rg.rowTemplate ?? 0, data.length,
        rg.rowSchema.filter((col) => col.kind !== 'keep').map((col) => col.col),
        (fragment, index, mergedIndexes) => fillRowFragment(fragment, rg, data[index] ?? {}, mergedIndexes?.map((i) => data[i])),
        rg.repeatUnit ?? (rg.detector === 'rowGroup' ? 'row' : 'block'),
        [a, b],
      );
      indexes[res.section] = parseHwpxSection(current[res.section]);
      report.push({ targetId: t.id, status: 'filled', detail: `${data.length} rows` });
    } catch (e) {
      report.push({ targetId: t.id, status: 'error', detail: e instanceof Error ? e.message : String(e) });
    }
  }

  // ── C) tableGroup 타깃: 표를 감싼 문단째 항목 수만큼 복제 ──
  // rowGroup과 같은 이유로 표 하나씩 재색인한다(문단 통째 교체라 오프셋 공간이 바뀐다).
  for (const t of spec.targets) {
    if (t.kind !== 'tableGroup') continue;
    const tg = t as TableGroupTarget;
    try {
      const res = resolveLocator(indexes, t.locator);
      if (res.kind !== 'table') {
        report.push({
          targetId: t.id, status: 'stale',
          detail: res.kind === 'stale' ? res.reason : 'tableGroup needs table locator',
        });
        continue;
      }
      const items = rows[t.id] ?? [];
      if (items.length < (tg.minItems ?? 1)) {
        report.push({ targetId: t.id, status: 'error', detail: `items ${items.length} < min ${tg.minItems ?? 1}` });
        continue;
      }
      const xml = indexes[res.section].xml;
      const host = hostParagraphRange(xml, res.table);
      if (!host) {
        report.push({ targetId: t.id, status: 'stale', detail: 'host paragraph of table not found' });
        continue;
      }
      const hostXml = xml.slice(host.start, host.end);
      const built = items.map((item) => fillTableGroupFragment(hostXml, tg, item));
      current[res.section] = applyEdits(current[res.section], [
        { start: host.start, end: host.end, text: built.join('') },
      ]);
      indexes[res.section] = parseHwpxSection(current[res.section]);
      report.push({ targetId: t.id, status: 'filled', detail: `${items.length} tables` });
    } catch (e) {
      report.push({ targetId: t.id, status: 'error', detail: e instanceof Error ? e.message : String(e) });
    }
  }

  return { sections: current, report, keepSnapshots, values, rows };
}

/**
 * 표를 감싼 문단의 원문 경계.
 *
 * 인덱서의 문단 노드가 아니라 **원문에서 직접** 찾는다. 표 앞 런에는 `hp:p`가 없고 셀
 * 문단은 전부 `table.end` 이전이라 이 탐색이 정확하며(실측), 인덱서가 어긋나도 복제
 * 경계가 흔들리지 않는다. `'<hp:p '`(뒤 공백)로 찾으므로 `<hp:pos …>` 같은 접두 태그에
 * 걸리지 않는다. 찾은 구간이 표를 실제로 감싸는지 검증한 뒤에만 반환한다.
 */
function hostParagraphRange(
  xml: string, table: { start: number; end: number },
): { start: number; end: number } | null {
  const start = xml.lastIndexOf('<hp:p ', table.start);
  const closeAt = xml.indexOf('</hp:p>', table.end);
  if (start < 0 || closeAt < 0) return null;
  const end = closeAt + '</hp:p>'.length;
  return start < table.start && table.end <= end ? { start, end } : null;
}

/** 표 안에서 주소로 셀 찾기 — 병합 셀도 cellAddr 주소를 하나 차지하므로 (row,col)이 그대로 통한다 */
function cellByAddr(table: TableNode, row: number, col: number): CellNode | null {
  return table.rows.flatMap((r) => r.cells).find((c) => c.addr.row === row && c.addr.col === col) ?? null;
}

/**
 * 복제본 1벌 만들기: 표를 감싼 문단 XML을 프래그먼트로 재색인해 캡션·셀을 채운다.
 * (rowGroup의 fillRowFragment와 같은 이유로 프래그먼트 자체를 재색인한다)
 */
function fillTableGroupFragment(
  hostXml: string, tg: TableGroupTarget, item: Record<string, unknown>,
): string {
  const frag = parseHwpxSection(hostXml);
  const table = frag.tables[0];
  if (!table) throw new Error('host paragraph has no table');
  const resolve = makeResolver({ row: item });
  const edits: Edit[] = [];
  const cleared = new Set<number>();

  // 캡션 — 표 앞 런(셀이 아님). 원본 소제목 문자열을 앵커로 찾아 값으로 치환한다.
  if (tg.caption?.anchor && tg.caption.source) {
    const hostPara = frag.topParagraphs[0];
    const v = resolve(tg.caption.source);
    const text = v == null ? '' : String(v);
    if (hostPara && text) {
      const hit = findInParagraphs(hostXml, [hostPara], tg.caption.anchor, 1);
      if (hit) {
        hit.segments.forEach((seg, i) => {
          edits.push({ start: seg.start, end: seg.end, text: i === 0 ? escapeInline(text) : '' });
        });
        edits.push(...clearLineSegEdits(hostXml, [hostPara], cleared));
      }
    }
  }

  for (const c of tg.cellSchema ?? []) {
    const cell = cellByAddr(table, c.addr.row, c.addr.col);
    if (!cell) continue;
    const v = c.source ? resolve(c.source) : undefined;
    if (v == null || v === '') continue;
    const text = typeof v === 'number' ? v.toLocaleString('ko-KR') : String(v);
    try {
      edits.push(...editsSetCellSingleValue(hostXml, cell, text));
    } catch { /* 런 없는 셀 — 건너뜀 */ }
  }
  return applyEdits(hostXml, edits);
}

/** 행 프래그먼트에 열 값 기록(프래그먼트 자체 재색인) */
function fillRowFragment(
  rowXml: string, rg: RowGroupTarget, row: Record<string, unknown>, mergedRows?: Record<string, unknown>[],
): string {
  const frag = parseHwpxSection(rowXml);
  const cells = frag.orphanRows[0]?.cells ?? [];
  const edits: Edit[] = [];
  for (const col of rg.rowSchema) {
    const cell = cells.find((c) => c.addr.col === col.col);
    if (!cell || col.kind === 'keep') continue;
    const texts = (mergedRows ?? [row]).map((item) => {
      let v: unknown;
      if (col.kind === 'computed') v = item[`col${col.col}`];
      else if (col.source) v = makeResolver({ row: item })(col.source);
      else v = item[`col${col.col}`];
      return typeof v === 'number' ? v.toLocaleString('ko-KR') : String(v ?? '');
    });
    const unique = [...new Set(texts.filter((value) => value.trim()))];
    if (mergedRows && unique.length > 1) {
      throw new Error(`${col.col}열의 같은 병합 구역에 서로 다른 값이 있습니다. 상위 항목별로 반복 묶음을 나눠 주세요.`);
    }
    const text = unique[0] ?? '';
    try {
      // 값 기록 + 여분 문단 제거 + 줄 캐시 제거 — 복제 원본의 문단 수가 많아도 빈 줄이 남지 않는다
      edits.push(...editsSetCellSingleValue(rowXml, cell, text));
    } catch { /* 런 없는 셀 — 건너뜀 */ }
  }
  return applyEdits(rowXml, edits);
}

/**
 * anchor~endAnchor 블록(여러 문단)을 생성 문단들로 대체.
 * 문단 XML 구조는 유지하고 텍스트만 조작: 시작 문단은 앵커 이전 보존+line1 기록,
 * 중간 문단들에 나머지 line 배분(부족=비움·초과=마지막에 합침), 끝 문단은
 * endAnchor까지 비우고 이후 텍스트 보존. 성공 여부 반환(실패 시 편집 미추가).
 */
function editsReplaceTextBlock(
  edits: Edit[], xml: string, paras: { start: number; end: number; runs: RunNode[] }[],
  anchor: string, occurrence: number, endAnchor: string, lines: string[],
): { si: number; ei: number } | null {
  const startHit = findInParagraphs(xml, paras as never, anchor, occurrence);
  if (!startHit || !startHit.segments.length) return null;
  const startPos = startHit.segments[0].start;
  const startEnd = startHit.segments[startHit.segments.length - 1].end;
  // startPos 이후의 endAnchor 첫 매치
  let endHit: ReturnType<typeof findInParagraphs> = null;
  for (let occ = 1; occ <= 50; occ++) {
    const h = findInParagraphs(xml, paras as never, endAnchor, occ);
    if (!h) break;
    if (h.segments[0].start >= startPos) { endHit = h; break; }
  }
  if (!endHit || !endHit.segments.length) return null;
  const endStart = endHit.segments[0].start;
  const endEnd = endHit.segments[endHit.segments.length - 1].end;

  const paraOf = (pos: number) => paras.findIndex((p) => p.start <= pos && pos < p.end);
  const si = paraOf(startPos);
  const ei = paraOf(endEnd - 1);
  if (si < 0 || ei < 0 || ei < si) return null;
  if (si === ei) return null; // 같은 문단이면 단일 앵커 경로가 맞음

  const middles = paras.slice(si + 1, ei);
  const rest = lines.slice(1);
  // 중간 문단이 없어 한 문단에 몰아 넣을 때 줄바꿈을 공백으로 뭉개지 않는다 —
  // `\n`은 escapeInline이 <hp:lineBreak/>로 기록한다(2026-08-16 수정)
  const firstLine = middles.length === 0 && rest.length ? lines.join('\n') : (lines[0] ?? '');

  // 시작 문단: 앵커 첫 세그먼트 → line1, 나머지 세그먼트·앵커 이후 조각 비움
  edits.push({ start: startHit.segments[0].start, end: startHit.segments[0].end, text: escapeInline(firstLine) });
  for (let i = 1; i < startHit.segments.length; i++) {
    edits.push({ start: startHit.segments[i].start, end: startHit.segments[i].end, text: '' });
  }
  for (const r of paras[si].runs) {
    for (const tp of r.tParts) {
      if (tp.start >= startEnd && tp.end > tp.start) edits.push({ start: tp.start, end: tp.end, text: '' });
      else if (tp.start < startEnd && tp.end > startEnd) edits.push({ start: startEnd, end: tp.end, text: '' });
    }
  }
  // 중간 문단들: 나머지 line 배분
  if (middles.length) writeParagraphsToCell(edits, middles as { runs: RunNode[] }[], rest);
  // 끝 문단: endAnchor 및 그 이전 조각 비움(이후 텍스트 보존)
  for (const seg of endHit.segments) edits.push({ start: seg.start, end: seg.end, text: '' });
  for (const r of paras[ei].runs) {
    for (const tp of r.tParts) {
      if (tp.end <= endStart && tp.end > tp.start) edits.push({ start: tp.start, end: tp.end, text: '' });
      else if (tp.start < endStart && tp.end > endStart && tp.start < tp.end) edits.push({ start: tp.start, end: endStart, text: '' });
    }
  }
  return { si, ei };
}

/** 셀의 기존 문단들에 생성 문단 배분(부족하면 마지막에 합침, 남으면 비움) */
function writeParagraphsToCell(edits: Edit[], paras: { runs: RunNode[] }[], lines: string[]): void {
  if (!paras.length) return;
  const n = paras.length;
  for (let i = 0; i < n; i++) {
    let text = '';
    // 문단이 모자라 마지막에 합칠 때 `\n` 유지 — editsSetRunText(encodeRunText)가
    // <hp:lineBreak/>로 기록한다. 공백으로 합치면 AI 답안의 줄바꿈이 사라진다(2026-08-16 수정)
    if (i < lines.length) text = i === n - 1 ? lines.slice(i).join('\n') : lines[i];
    const runs = paras[i].runs;
    if (!runs.length) continue;
    edits.push(...editsSetRunText(runs[0], text));
    for (let r = 1; r < runs.length; r++) {
      for (const tp of runs[r].tParts) {
        if (tp.end > tp.start) edits.push({ start: tp.start, end: tp.end, text: '' });
      }
    }
  }
}

function countChar(s: string, ch: string): number {
  let c = 0;
  for (const x of s) if (x === ch) c++;
  return c;
}

/**
 * hp:t 안에 기록할 인라인 텍스트 — XML 이스케이프 + `\r?\n` → `<hp:lineBreak/>`.
 * 날 줄바꿈 문자는 hp:t 안에서 렌더되지 않으므로(셀 경로의 encodeRunText와 같은 이유)
 * 태그로 바꿔야 계획 검토에서 적은 답안의 줄바꿈이 문서에 나타난다(2026-08-16 수정).
 */
function escapeInline(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<hp:lineBreak/>');
}

export { decodeEntities };
