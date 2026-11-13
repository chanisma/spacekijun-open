// plan 스키마 유도: 스펙의 plan.* 참조를 수집해 "plan이 담아야 할 키·타입"을
// 자동 결정한다. 별도 스키마 문서를 사람이 관리하지 않는다(단일 출처=스펙).

import {
  isPersonKind, personRoleOf,
  type Plan, type PersonTarget, type RowGroupTarget, type ScalarTarget,
  type TableGroupTarget, type WorkSpec,
} from './types';
import { parseHwpxSection } from './hwpxIndex';
import { resolveLocator } from './locator';
import { repeatReplacementRange } from './repeatRegion';

export interface PlanFieldSchema {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'unknown';
  /** array일 때 행 객체 필드 */
  itemFields?: { key: string; type: 'string' | 'number' | 'unknown'; note?: string; prose?: boolean }[];
  repeatBlock?: {
    rows: number;
    cells: { key: string; row: number; span: number; label: string; parent?: string }[];
  };
  /**
   * array일 때 항목 수 하한·상한(rowGroup의 minRows/maxRows, tableGroup의 minItems/maxItems).
   * 엔진은 상한 초과분을 **조용히 잘라내므로**(`src.slice(0, maxRows)`) 폼이 그 전에 막아야 한다.
   * 같은 배열을 여러 타깃이 쓰면 가장 좁은 구간이 유효하다.
   */
  minItems?: number;
  maxItems?: number;
  note?: string;
  /** 사람이 읽을 이름 — 이 키를 쓰는 타깃의 라벨(폼 표시용, key는 보조 표기) */
  label?: string;
  /** 비워도 되는 입력(예: 서술 본문) — validatePlan이 누락으로 치지 않음 */
  optional?: boolean;
  /** 서술 본문 필드(최상위 prose 타깃) — 본 계획 호출이 아니라 전용 배치 단계가 채운다 */
  prose?: boolean;
  /**
   * 사람 이름 필드 — 계획 검토 폼이 명단 다중 선택으로 받는다(값은 이어 붙인 문자열).
   * LLM은 절대 채우지 않는다: 학교 문서에 없는 교사·학생 이름을 지어내는 것이 최악의 실패다.
   */
  person?: 'teacher' | 'student';
  requiredBy: string[]; // 타깃 id들
}

const PLAN_REF = /(?:^|[^A-Za-z0-9_])plan\.([A-Za-z0-9_.[\]]+)/g;

/**
 * 스펙의 plan 키 정규화: rowGroup.rowSource가 `plan.pick-1000Rows`처럼 식별자 외
 * 문자를 담으면 참조 정규식·수식 언어가 오파싱한다 — 실행·저장 경로 진입 시 정제해
 * 과거에 저장된 불량 키도 자가 치유한다(변경 없으면 원본 반환).
 */
export function normalizeSpecPlanKeys<T extends { targets: unknown[] }>(spec: T): T {
  let changed = false;
  const targets = (spec.targets as Array<Record<string, unknown>>).map((t) => {
    if ((t.kind !== 'rowGroup' && t.kind !== 'tableGroup') || typeof t.rowSource !== 'string') return t;
    const m = /^plan\.(.+)$/.exec(t.rowSource);
    if (!m) return t;
    const clean = m[1].replace(/[^A-Za-z0-9_]/g, '');
    if (!clean || clean === m[1]) return t;
    changed = true;
    return { ...t, rowSource: `plan.${clean}` };
  });
  return changed ? { ...spec, targets } : spec;
}

function collectPlanRefs(s: string | undefined, out: Set<string>): void {
  if (!s) return;
  PLAN_REF.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLAN_REF.exec(s))) out.add(m[1].split('.')[0].replace(/\[\d+\]/, ''));
}

export function derivePlanSchema(spec: WorkSpec, sections?: string[]): PlanFieldSchema[] {
  const indexes = sections?.map(parseHwpxSection);
  const fields = new Map<string, PlanFieldSchema>();
  const add = (
    key: string, type: PlanFieldSchema['type'], targetId: string,
    note?: string, label?: string, optional?: boolean, prose?: boolean,
    person?: PlanFieldSchema['person'],
  ) => {
    const f = fields.get(key) ?? { key, type, requiredBy: [], note, label, optional, prose, person };
    if (f.type === 'unknown') f.type = type;
    if (!f.requiredBy.includes(targetId)) f.requiredBy.push(targetId);
    if (note && !f.note) f.note = note;
    if (label && !f.label) f.label = label;
    if (!optional) f.optional = false; // 하나라도 필수 사용처가 있으면 필수
    if (prose) f.prose = true;
    if (person && !f.person) f.person = person;
    // 이름 필드는 **항상 선택**이다 — 값은 사람이 명단에서 고르므로, 서술 타깃의 sources처럼
    // 같은 키를 읽기만 하는 사용처가 필수로 끌어올리면 "안 고른 상태"에서 AI 계획 생성이
    // 매번 검증에 걸린다. 문서 차원의 필수 여부는 target.required + verify가 따로 본다.
    // (누적값 f.person으로 판단해 add 호출 순서에 좌우되지 않게 한다)
    if (f.person) f.optional = true;
    fields.set(key, f);
  };

  for (const t of spec.targets) {
    const refs = new Set<string>();
    if (t.kind === 'scalar') {
      collectPlanRefs((t as ScalarTarget).source, refs);
      for (const r of refs) add(r, (t as ScalarTarget).valueType === 'number' ? 'number' : 'string', t.id, t.instruction, t.label);
      if (!refs.size && !(t as ScalarTarget).source) add(t.id, 'string', t.id, t.instruction, t.label);
      continue;
    }
    if (isPersonKind(t.kind)) {
      // scalar와 같은 키 유도(공유 source 허용) + person 표식·선택 처리.
      // optional인 이유: 사람이 고르기 전에는 비어 있는 것이 정상이라 validatePlan이
      // "누락"으로 잡으면 AI 계획 생성이 매번 실패한다.
      const p = t as PersonTarget;
      const role = personRoleOf(t.kind);
      const who = role === 'teacher' ? '교사' : '학생';
      const note = `${who} 이름 — 계획 검토에서 명단으로 선택(AI가 채우지 않음)`;
      collectPlanRefs(p.source, refs);
      for (const r of refs) add(r, 'string', t.id, note, t.label, true, false, role);
      if (!refs.size && !p.source) add(t.id, 'string', t.id, note, t.label, true, false, role);
      continue;
    }
    if (t.kind === 'choice') {
      const c = t as { select?: string; options?: { label: string; value?: unknown }[] };
      collectPlanRefs(c.select, refs);
      // 사용자가 유형을 choice로 바꾸며 options를 아직 안 채운 스펙도 있다 — 미정의는 빈 목록으로
      const options = Array.isArray(c.options) ? c.options : [];
      const note = options.length > 0
        ? `택1: ${options.map((o) => o.value ?? o.label).join(' | ')}`
        : '택1(선택지 미정의 — 스펙 검수에서 options를 채우세요)';
      for (const r of refs) add(r, 'string', t.id, note, t.label);
      if (!refs.size && !c.select) add(t.id, 'string', t.id, note, t.label);
      continue;
    }
    if (t.kind === 'rowGroup' || t.kind === 'tableGroup') {
      // 반복 행(행 복제)과 표 묶음(표 복제)은 plan에서 같은 모양이다 — 항목 객체의 배열.
      // 차이는 문서에 찍는 방식뿐이라 스키마 유도는 열/셀 정의만 바꿔 공유한다.
      const g = t as RowGroupTarget | TableGroupTarget;
      collectPlanRefs(g.rowSource, refs);
      const itemFields: PlanFieldSchema['itemFields'] = [];
      const seen = new Set<string>();
      const addItemField = (
        src: string | undefined, numeric: boolean, note?: string, prose?: boolean,
      ) => {
        if (!src) return;
        const re = /(?:^|[^A-Za-z0-9_])row\.([A-Za-z0-9_]+)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
          if (seen.has(m[1])) continue;
          seen.add(m[1]);
          // 서술 셀은 계획 단계에서 상세 문장이 필요하다(프롬프트가 분량을 요구)
          itemFields.push({ key: m[1], type: numeric ? 'number' : 'unknown', note, prose: prose || undefined });
        }
      };
      if (t.kind === 'rowGroup') {
        for (const col of (g as RowGroupTarget).rowSchema ?? []) {
          const numeric = col.kind === 'computed' || !!col.formula;
          addItemField(col.source, numeric, col.instruction, col.kind === 'prose');
          addItemField(col.formula, numeric, col.instruction, col.kind === 'prose');
        }
      } else {
        const tg = g as TableGroupTarget;
        addItemField(tg.caption?.source, false, '표 소제목');
        for (const c of tg.cellSchema ?? []) {
          addItemField(c.source, false, c.instruction, c.kind === 'prose');
        }
      }
      const min = t.kind === 'rowGroup' ? (g as RowGroupTarget).minRows : (g as TableGroupTarget).minItems;
      const max = t.kind === 'rowGroup' ? (g as RowGroupTarget).maxRows : (g as TableGroupTarget).maxItems;
      for (const r of refs) {
        add(r, 'array', t.id, g.instruction, t.label);
        const f = fields.get(r)!;
        f.itemFields = mergeItemFields(f.itemFields, itemFields);
        if (t.kind === 'rowGroup' && indexes && (t.repeatUnit ?? (t.detector === 'rowGroup' ? 'row' : 'block')) === 'block') {
          const resolved = resolveLocator(indexes, t.locator);
          if (resolved.kind === 'rows' && !resolved.keepRows.length) {
            const [a, b] = resolved.dataRows;
            const replacement = t.replaceRows ?? repeatReplacementRange(indexes[resolved.section].xml, resolved.table, [a, b], t.rowSchema.map((c) => c.col));
            const containers = resolved.table.rows.flatMap((row) => row.cells).filter((c) => c.span.rows > 1
              && c.addr.row <= a && c.addr.row + c.span.rows - 1 >= b
              && (c.addr.row < a || c.addr.row + c.span.rows - 1 > b));
            const context = `반복 원본은 ${a}~${b}행, 기존 예시 대체 구간은 ${replacement[0]}~${replacement[1]}행이다. 대체 구간의 옛 예시 행은 결과에 남기지 않는다.`
              + (containers.length ? ` 상위 병합 구역(${containers.map((c) => `${c.addr.col}열: ${c.text.trim()}`).join(', ')}) 안에서 하위 항목을 생성한다. 늘어난 하위 행도 이 상위 병합에 포함된다.` : '');
            f.note = [f.note, context].filter(Boolean).join('\n');
            const cells = resolved.table.rows.flatMap((row) => row.cells)
              .filter((cell) => cell.addr.row >= a && cell.addr.row + cell.span.rows <= b + 1);
            f.repeatBlock = { rows: b - a + 1, cells: [] };
            for (const cell of cells) {
              const col = t.rowSchema.find((c) => c.col === cell.addr.col && c.kind !== 'keep');
              const key = col?.source?.match(/^row\.([A-Za-z0-9_]+)$/)?.[1];
              if (!key) continue;
              const parent = cells.filter((p) => p.addr.col < cell.addr.col && p.span.rows > cell.span.rows
                && p.addr.row <= cell.addr.row && cell.addr.row + cell.span.rows <= p.addr.row + p.span.rows)
                .sort((x, y) => y.addr.col - x.addr.col)[0];
              const parentCol = parent && t.rowSchema.find((c) => c.col === parent.addr.col);
              const header = resolved.table.rows.flatMap((row) => row.cells).filter((c) => c.addr.row < a
                && c.addr.col <= cell.addr.col && cell.addr.col < c.addr.col + c.span.cols).at(-1)?.text;
              f.repeatBlock.cells.push({ key, row: cell.addr.row - a, span: cell.span.rows,
                label: col.instruction || header || `${cell.addr.col}열`,
                parent: parentCol?.source?.match(/^row\.([A-Za-z0-9_]+)$/)?.[1] });
            }
          }
        }
        if (min != null) f.minItems = Math.max(f.minItems ?? 0, min);
        if (max != null) f.maxItems = Math.min(f.maxItems ?? max, max);
      }
      continue;
    }
    if (t.kind === 'prose') {
      const p = t as { sources?: string[] };
      for (const s of p.sources ?? []) collectPlanRefs(s, refs);
      for (const r of refs) add(r, 'unknown', t.id, t.instruction, t.label);
      // 서술 타깃 자체도 계획에 노출 — **문서에 들어갈 본문**이다(2026-07-27 의미 변경).
      // 비워 두면 AI 계획 생성의 전용 배치 단계가 작성하고, 사람이 계획 검토에서 고칠 수
      // 있다. 채움 단계는 이 값을 그대로 쓴다(예전처럼 매번 새로 생성하지 않는다).
      add(t.id, 'string', t.id,
        `서술 본문(비우면 AI가 작성)${t.instruction ? ` — ${t.instruction}` : ''}`,
        t.label, true, true);
      continue;
    }
    if (t.kind === 'computed') {
      collectPlanRefs((t as { formula: string }).formula, refs);
      for (const r of refs) add(r, 'number', t.id);
    }
  }
  for (const c of spec.constraints ?? []) {
    const refs = new Set<string>();
    for (const v of Object.values(c)) if (typeof v === 'string') collectPlanRefs(v, refs);
    for (const r of refs) add(r, 'unknown', `constraint:${c.kind}`);
  }
  return [...fields.values()];
}

function mergeItemFields(
  a: PlanFieldSchema['itemFields'],
  b: PlanFieldSchema['itemFields'],
): PlanFieldSchema['itemFields'] {
  const out = [...(a ?? [])];
  for (const f of b ?? []) {
    const exist = out.find((x) => x.key === f.key);
    if (!exist) out.push(f);
    else if (f.prose && !exist.prose) exist.prose = true; // 한 곳이라도 서술 열이면 서술로
  }
  return out;
}

/** LLM plan 생성 프롬프트에 넣을 스키마 설명 텍스트 */
export function planSchemaPrompt(schema: PlanFieldSchema[]): string {
  return schema
    .map((f) => {
      // 행 형식을 예시로 못박는다 — 배열(2차원)로 반환하면 값이 유실되므로(실측 결함)
      const item = f.itemFields?.length
        ? ` — 각 행은 키 있는 객체: {${f.itemFields.map((i) => `"${i.key}": ${i.type === 'number' ? '숫자' : '"값"'}`).join(', ')}}`
          + ` (항목 의미: ${f.itemFields
              .map((i) => `${i.key}=${i.note ?? i.type}${i.prose ? '[서술형: 2~3문장으로 구체적으로]' : ''}`)
              .join(', ')})`
        : '';
      const name = f.label ? ` "${f.label}"` : '';
      const opt = f.optional ? ' (선택)' : '';
      // 항목 수 범위를 알려야 상한 초과분이 채움에서 잘려 나가는 일이 줄어든다
      const bounds = f.type === 'array' && (f.minItems != null || f.maxItems != null)
        ? ` (항목 ${f.minItems ?? 1}~${f.maxItems ?? '제한 없음'}개)`
        : '';
      // 서술 본문은 구역별 전용 호출이 양식 예시·분량까지 보고 쓴다 — 여기서 대충 채우면
      // 그 값이 "사용자 확정"으로 남아 전용 단계가 건너뛴다. 빈 문자열을 명시 요구한다.
      if (f.prose) {
        return `- ${f.key}${name}: string — **빈 문자열 ""로 둘 것**(서술 본문은 별도 단계가 작성)`
          + ` [사용처: ${f.requiredBy.join(', ')}]`;
      }
      // 이름은 실재하는 사람이라 추측이 곧 오답이다 — 사용자가 명단에서 고른 값만 쓴다.
      // 이미 값이 있으면 [사용자 입력값]으로 전달되어 다른 필드의 맥락이 된다.
      if (f.person) {
        return `- ${f.key}${name}: string — **빈 문자열 ""로 둘 것**`
          + `(${f.person === 'teacher' ? '교사' : '학생'} 이름은 사용자가 명단에서 직접 고른다. 이름을 지어내지 말 것)`
          + ` [사용처: ${f.requiredBy.join(', ')}]`;
      }
      const block = f.repeatBlock;
      const structure = block ? `\n  [반복 단위] 선택 영역 전체 ${block.rows}행이 한 묶음이다. 배열은 최하위 행 순서로 기록하고 길이는 ${block.rows}의 배수로 생성한다. 묶음마다 모든 병합이 새로 시작하며 묶음 사이를 합치지 않는다.\n`
        + block.cells.map((c) => `  ${c.key}(${c.label}): 묶음 내 ${c.row + 1}~${c.row + c.span}행${c.parent ? `, 상위 ${c.parent}에 포함` : ''}. ${c.span > 1 ? '해당 구역의 모든 행에 같은 상위 값을 기록한다.' : '이 하위 행에 해당하는 값을 작성한다.'}`).join('\n')
        + '\n  월→주→차시처럼 상위 항목 아래에 하위 항목을 배치한다. 상위 값이 바뀌면 해당 병합 묶음을 새로 시작한다. 서로 다른 상위 값을 한 병합 셀에 줄바꿈으로 합치지 않는다.' : '';
      return `- ${f.key}${name}: ${f.type}${opt}${bounds}${f.note ? ` — ${f.note}` : ''}${item} [사용처: ${f.requiredBy.join(', ')}]${structure}`;
    })
    .join('\n');
}

/** {value:…}/{label:…}/{text:…} 래핑에서 원시값 회수 — LLM의 흔한 객체 감싸기 패턴 */
function unwrapPrimitive(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const k of ['value', 'label', 'text']) {
      const inner = o[k];
      if (typeof inner === 'string' || typeof inner === 'number' || typeof inner === 'boolean') return inner;
    }
  }
  return v;
}

/**
 * LLM plan 응답 정규화: 스키마상 원시값 필드에 온 객체 래핑을 회수하고,
 * 배열 필드는 행 셀 단위로 동일 처리한다. 회수 불가한 객체는 그대로 두어
 * validatePlan이 오류로 잡게 한다(재시도 루프의 교정 신호).
 *
 * 2026-07-27 실측 결함: LLM이 반복 행을 객체가 아니라 **배열(2차원 배열)**로 반환하면
 * (`[["8월 3주","4",…], …]`) 폼·엔진이 `row.c0`을 못 읽어 값이 통째로 사라진다.
 * 스키마의 itemFields 순서로 키를 부여해 회수한다(LLM은 스키마 설명 순서대로 값을 넣는다).
 */
export function normalizePlan(schema: PlanFieldSchema[], plan: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...plan };
  for (const f of schema) {
    const v = out[f.key];
    if (v == null) continue;
    if (f.type === 'array') {
      if (Array.isArray(v)) {
        const itemKeys = (f.itemFields ?? []).map((i) => i.key);
        out[f.key] = v.map((row) => {
          // 배열 행 → itemFields 순서로 객체화(길이 불일치는 있는 만큼만 매핑)
          if (Array.isArray(row) && itemKeys.length > 0) {
            const r: Record<string, unknown> = {};
            itemKeys.forEach((k, i) => { r[k] = unwrapPrimitive(row[i] ?? ''); });
            return r;
          }
          if (row && typeof row === 'object' && !Array.isArray(row)) {
            const r = { ...(row as Record<string, unknown>) };
            for (const k of Object.keys(r)) r[k] = unwrapPrimitive(r[k]);
            // 키 불일치(한글 라벨 등) 보정: 스키마 키가 하나도 없고 값 개수가 맞으면 순서로 재매핑
            if (itemKeys.length > 0 && !itemKeys.some((k) => k in r)) {
              const vals = Object.values(r);
              if (vals.length >= itemKeys.length) {
                const remapped: Record<string, unknown> = {};
                itemKeys.forEach((k, i) => { remapped[k] = vals[i] ?? ''; });
                return remapped;
              }
            }
            return r;
          }
          // 원시값 행(문자열 등) → 첫 키에 담아 회수
          if (itemKeys.length > 0 && (typeof row === 'string' || typeof row === 'number')) {
            const r: Record<string, unknown> = {};
            itemKeys.forEach((k, i) => { r[k] = i === 0 ? row : ''; });
            return r;
          }
          return row;
        });
      }
    } else {
      out[f.key] = unwrapPrimitive(v);
    }
  }
  return out;
}

/** plan이 스키마를 충족하는지 사전 검증(LLM 응답 게이트) */
export function validatePlan(schema: PlanFieldSchema[], plan: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const f of schema) {
    const v = plan[f.key];
    if (v == null) {
      if (!f.optional) errors.push(`plan.${f.key} 누락`);
      continue;
    }
    if (f.type === 'array' && !Array.isArray(v)) errors.push(`plan.${f.key}는 배열이어야 함`);
    if (f.type === 'number' && typeof v !== 'number' && Number.isNaN(Number(v))) errors.push(`plan.${f.key}는 숫자여야 함`);
    // 원시값 필드의 객체는 문서에 "[object Object]"로 새겨진다 — 오류로 잡아 재시도 유도
    if (f.type !== 'array' && typeof v === 'object' && !Array.isArray(v)) {
      errors.push(`plan.${f.key}는 원시값(문자열/숫자)이어야 함 — 객체 금지`);
    }
    if (f.type === 'array' && Array.isArray(v)) {
      if (f.repeatBlock) {
        const block = f.repeatBlock;
        if (v.length % block.rows !== 0) errors.push(`plan.${f.key}: 선택 영역 ${block.rows}행 단위로 완전한 반복 묶음을 생성해야 함`);
        for (let start = 0; start < v.length; start += block.rows) {
          for (const cell of block.cells.filter((c) => c.span > 1)) {
            const values = v.slice(start + cell.row, start + cell.row + cell.span)
              .map((row) => row && typeof row === 'object' ? (row as Record<string, unknown>)[cell.key] : undefined)
              .filter((value) => value != null && String(value).trim()).map(String);
            if (new Set(values).size > 1) errors.push(`plan.${f.key}: ${start / block.rows + 1}번째 묶음의 ${cell.key}(${cell.label}) 상위 값이 병합 구역 안에서 달라짐`);
          }
        }
      }
      // 빈 배열은 "반복 행을 하나도 생성하지 않음" — LLM 응답 게이트에서 오류로 잡아
      // 재시도시킨다(2026-07-27: rows:[]가 조용히 통과되어 폼이 빈 채로 남던 결함)
      if (v.length === 0 && !f.optional) {
        errors.push(`plan.${f.key}가 빈 배열 — 최소 1행 이상 생성할 것`);
      }
      // 행은 반드시 키 있는 객체여야 한다 — 배열/원시값 행은 정규화로 회수되지 않은 것
      const itemKeys = (f.itemFields ?? []).map((i) => i.key);
      const badShape = v.some((row) => !row || typeof row !== 'object' || Array.isArray(row));
      if (badShape) {
        errors.push(
          `plan.${f.key}의 행은 배열이 아니라 키 있는 객체여야 함`
          + (itemKeys.length ? ` — 예: {${itemKeys.map((k) => `"${k}": "값"`).join(', ')}}` : ''),
        );
      }
      // 스키마 키가 하나도 없는 행(다른 키 이름 사용)도 값이 유실되므로 오류
      if (!badShape && itemKeys.length > 0) {
        const missingKeys = v.some((row) => !itemKeys.some((k) => k in (row as Record<string, unknown>)));
        if (missingKeys) {
          errors.push(`plan.${f.key}의 행 키가 스키마와 다름 — 항목 필드 키(${itemKeys.join(', ')})를 그대로 사용할 것`);
        }
      }
      const badCell = v.some((row) =>
        row && typeof row === 'object' && !Array.isArray(row)
        && Object.values(row as Record<string, unknown>).some((c) => c !== null && typeof c === 'object'));
      if (badCell) errors.push(`plan.${f.key}의 행 값에 객체가 있음 — 각 셀은 원시값이어야 함`);
    }
  }
  return errors;
}

/**
 * 계획 검토 폼의 "행 N개 추가" 용량 계산(2026-07-27).
 *
 * 엔진은 상한 초과분을 조용히 잘라내므로(`src.slice(0, maxRows)`) 폼이 그 전에 막아야 한다.
 * 상한이 없는 필드도 오입력(0을 여러 번 누른 경우 등)을 막을 안전망이 필요하다.
 *
 * @returns room = 더 넣을 수 있는 행 수, count = 이번에 실제로 추가될 행 수(≥0)
 */
export function rowAddCapacity(
  field: Pick<PlanFieldSchema, 'maxItems'>,
  currentRows: number,
  requested: number,
  fallbackMax = 100,
): { room: number; count: number } {
  const room = field.maxItems != null ? Math.max(0, field.maxItems - currentRows) : fallbackMax;
  const want = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 1;
  return { room, count: Math.min(want, room) };
}

/** 빈 행 하나 — 숫자 열은 0, 나머지는 빈 문자열(폼의 '행 추가'와 AI 재생성의 빈 칸 기준이 같아야 한다) */
export function blankPlanRow(
  cols: { key: string; type: 'string' | 'number' | 'unknown' }[],
): Record<string, unknown> {
  return Object.fromEntries(cols.map((c) => [c.key, c.type === 'number' ? 0 : '']));
}

/** 계획 값이 "빈 칸"인지 — AI 재생성 시 사용자가 채운 칸을 보존하는 기준(숫자 0은 시드 기본값이라 빈 것으로 본다) */
export function isEmptyPlanValue(value: unknown): boolean {
  if (value == null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'number') return value === 0;
  return false;
}

/**
 * 실행 게이트: 아직 채워지지 않은 입력 목록(2026-09-02 사용자 요청).
 *
 * "모든 내용이 입력되었을 때만 문서 생성이 눌린다"의 판정 단일 출처다. **필수 필드 +
 * 사람 필드**를 본다(사용자 결정) — 사람 필드는 스키마상 `optional: true`로 **강제**돼
 * 있지만(안 고른 상태에서 AI 계획 생성이 매번 검증에 걸리는 것을 막으려는 조치다)
 * 실제로는 비우면 안 되는 값이라, `!optional`만 보면 아무도 안 고른 채로 실행된다.
 *
 * **숫자 0은 "입력됨"으로 본다.** 병합용 `isEmptyPlanValue`는 0을 빈 값으로 치지만(시드가
 * 0이라 "안 건드림"과 구분이 안 된다) 게이트에서 같은 규칙을 쓰면 예산 0원·인원 0명을
 * 정말로 입력한 사용자가 **영구히 막힌다**. 게이트는 잘못 막는 쪽이 더 나쁘므로 0을 통과시킨다
 * — 대신 손대지 않은 숫자 칸도 통과한다는 뜻이라, 숫자 필드는 이 게이트로 보호되지 않는다.
 *
 * `(선택)` 표시 필드는 검사하지 않는다.
 */
export function missingPlanInputs(
  schema: PlanFieldSchema[],
  plan: Record<string, unknown>,
): { key: string; label: string; reason: 'empty' | 'rows' | 'cells' }[] {
  const out: { key: string; label: string; reason: 'empty' | 'rows' | 'cells' }[] = [];
  // 문자열만 공백을 빈 값으로 본다 — 숫자 0·false는 사용자가 고른 값일 수 있다
  const blank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');
  for (const f of schema) {
    // 사람 필드는 스키마가 optional로 강제하지만 게이트에서는 필수로 되돌린다
    const required = !f.optional || !!f.person;
    if (!required) continue;
    const label = f.label ?? f.key;
    const v = plan[f.key];
    if (f.type === 'array') {
      const rows = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
      if (rows.length === 0 || (f.minItems != null && rows.length < f.minItems)) {
        out.push({ key: f.key, label, reason: 'rows' });
        continue;
      }
      // 빈 칸이 있는 행은 문서에 빈 칸으로 찍힌다 — 행이 있는데 미완성인 상태를 구분해 알린다
      const cols = f.itemFields ?? [];
      if (cols.length && rows.some((r) => cols.some((c) => blank(r?.[c.key])))) {
        out.push({ key: f.key, label, reason: 'cells' });
      }
      continue;
    }
    if (blank(v)) out.push({ key: f.key, label, reason: 'empty' });
  }
  return out;
}

/** 게이트 메시지 — 버튼 옆·툴팁에서 같은 문구를 쓴다 */
export function describeMissingInput(m: { label: string; reason: 'empty' | 'rows' | 'cells' }): string {
  if (m.reason === 'rows') return `${m.label}: 행을 추가하세요`;
  if (m.reason === 'cells') return `${m.label}: 빈 칸이 있습니다`;
  return `${m.label}: 입력하세요`;
}

/** 배열(반복 행)의 셀이 빈 값인지 — 행·칸 단위 병합 기준 */
function isEmptyCellValue(value: unknown): boolean {
  return value == null || value === '' || (typeof value === 'number' && value === 0);
}

/**
 * AI plan 위에 사용자 값을 덮는 병합(2026-07-27): 스칼라는 사용자 값 통째 우선,
 * **배열(반복 행)은 행·칸 단위** — 같은 순서의 행에서 사용자가 채운 칸만 이기고
 * 빈 칸·빈 행은 AI 값으로 채워지며, AI가 행을 더 만들면 뒤에 붙는다.
 */
export function mergePlanWithUserValues(aiPlan: Plan, userFilled: Plan): Plan {
  const out: Plan = { ...aiPlan };
  for (const [key, uVal] of Object.entries(userFilled)) {
    const aVal = out[key];
    if (Array.isArray(uVal) && Array.isArray(aVal)) {
      const n = Math.max(uVal.length, aVal.length);
      const rows: unknown[] = [];
      for (let i = 0; i < n; i++) {
        const u = uVal[i] as Record<string, unknown> | undefined;
        const a = aVal[i] as Record<string, unknown> | undefined;
        if (u && a && typeof u === 'object' && typeof a === 'object') {
          const row: Record<string, unknown> = { ...a };
          for (const [ck, cv] of Object.entries(u)) {
            if (!isEmptyCellValue(cv)) row[ck] = cv;
          }
          rows.push(row);
        } else {
          rows.push(u ?? a);
        }
      }
      out[key] = rows as Plan[string];
    } else {
      out[key] = uVal;
    }
  }
  return out;
}
