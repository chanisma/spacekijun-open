/**
 * 에이전트(MCP)가 이미 있는 «생성 방식»으로 문서를 쓰는 순수 로직 (2026-10-20).
 *
 * 사용자 결정 2026-10-20 — 모든 칸(서술 포함)은 **에이전트가 대화 맥락으로 쓴다**. 서버는 AI 를 부르지 않고
 * 웹 문서 엔진으로 채우기·검사만 한다. 웹 러너(runSpecFillPipeline)에서 «계획 생성(LLM)»만 빠진 같은 길이다:
 *   계획 정규화(normalizePlan) → 빠진 칸(missingPlanInputs)·형식(validatePlan) → 채움(fillDocument, 서술 = 계획의 본문)
 *   → 검증(verifyDocument). 그래서 같은 계획이면 웹에서 다시 열어도(완성 문서 = 값) 같은 문서가 된다.
 *
 * ⚠️ 이 파일도 _shared/docgenAgentSpec.bundle.js 에 묶인다(index.ts) — 고치면 scripts/mcp-docgen/build-bundle.mts.
 */
import { derivePlanSchema, missingPlanInputs, normalizePlan, normalizeSpecPlanKeys, validatePlan, type PlanFieldSchema } from '../../task-workflow/document/spec/planSchema';
import { fillDocument, type FillOutput } from '../../task-workflow/document/spec/engine';
import { verifyDocument } from '../../task-workflow/document/spec/verify';
import { resolveKnowledge } from '../../task-workflow/document/spec/knowledge';
import { splitPersonNames, type CheckResult, type WorkSpec } from '../../task-workflow/document/spec/types';

export interface AgentPlanField {
  key: string;
  label?: string;
  type: string;
  /** 무엇을 적을지 — 스펙의 작성 지시·택1 선택지·반복 묶음 설명이 여기 모인다 */
  note?: string;
  optional?: boolean;
  /** 사람 이름 칸 — 재직 교직원(teacher)·재학생(student) 이름을 정확히 */
  person?: 'teacher' | 'student';
  /** 서술 본문 — 문서에 그대로 들어갈 글 */
  prose?: boolean;
  items?: { key: string; type: string; note?: string; prose?: boolean }[];
  minItems?: number;
  maxItems?: number;
  /** 반복 묶음: 행 N개가 한 묶음 — 배열 길이는 N 의 배수, 병합 칸은 묶음 안에서 같은 값 */
  rowsPerItem?: number;
}

/**
 * 에이전트에게 보이는 스키마 — `row.__index1` 같은 `__` 열은 엔진이 스스로 채우는 자동 번호다(engine: `{__index0, __index1, ...row}`).
 * 칸으로 보이면 에이전트가 채워야 하는 줄 알고, 비우면 «행 안에 빈 칸»으로 막히며, 채우면 자동 번호를 덮는다.
 */
function agentSchema(spec: WorkSpec, sections: string[]): PlanFieldSchema[] {
  return derivePlanSchema(spec, sections).map((f) => (f.itemFields
    ? { ...f, itemFields: f.itemFields.filter((i) => !i.key.startsWith('__')) }
    : f));
}

/**
 * 스키마의 안내문은 웹 계획 검토 화면을 위한 것이라 이 경로에서는 틀린 말이 된다(2026-10-20 운영 시험) —
 * 서술 칸 «비우면 AI가 작성»(여기엔 AI 가 없다), 사람 칸 «계획 검토에서 명단으로 선택»(여기엔 명단 화면이 없다).
 */
function agentNote(f: PlanFieldSchema): string | undefined {
  if (f.person) return `${f.person === 'teacher' ? '재직 교직원' : '재학생'} 이름 — 명단의 이름 그대로, 여러 명이면 «이름, 이름» (없는 이름·동명이인은 거부된다)`;
  if (f.prose && f.note) return f.note.replace(/^서술 본문\(비우면 AI가 작성\)/, '서술 본문 — 문서에 그대로 들어갈 글을 직접 쓴다');
  return f.note;
}

const fieldOf = (f: PlanFieldSchema): AgentPlanField => ({
  key: f.key,
  ...(f.label ? { label: f.label } : {}),
  type: f.type,
  ...(agentNote(f) ? { note: agentNote(f) } : {}),
  ...(f.optional ? { optional: true } : {}),
  ...(f.person ? { person: f.person } : {}),
  ...(f.prose ? { prose: true } : {}),
  ...(f.itemFields?.length ? { items: f.itemFields.map((i) => ({ key: i.key, type: i.type, ...(i.note ? { note: i.note } : {}), ...(i.prose ? { prose: true } : {}) })) } : {}),
  ...(f.minItems != null ? { minItems: f.minItems } : {}),
  ...(f.maxItems != null ? { maxItems: f.maxItems } : {}),
  ...(f.repeatBlock ? { rowsPerItem: f.repeatBlock.rows } : {}),
});

/** 계획 모양 견본 — 에이전트가 키를 틀리지 않게(값은 설명일 뿐) */
function planSkeleton(schema: PlanFieldSchema[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of schema) {
    if (f.type === 'array') {
      out[f.key] = [Object.fromEntries((f.itemFields ?? []).map((i) => [i.key, i.type === 'number' ? 0 : `<${i.note ?? i.key}>`]))];
    } else if (f.type === 'number') out[f.key] = 0;
    else out[f.key] = `<${f.label ?? f.key}>`;
  }
  return out;
}

export function describeForFill(rawSpec: WorkSpec, sections: string[]) {
  const spec = normalizeSpecPlanKeys(rawSpec);
  const schema = agentSchema(spec, sections);
  return {
    documentType: spec.documentType,
    ...(spec.instruction ? { instruction: spec.instruction } : {}),
    ...(spec.contextExample ? { contextExample: spec.contextExample } : {}),
    fields: schema.map(fieldOf),
    planExample: planSkeleton(schema),
  };
}

export interface PreparedPlan {
  spec: WorkSpec;
  plan: Record<string, unknown>;
  problems: string[];
  /** 사람 이름 칸에 적힌 이름 — 명단 대조는 DB 가 한다(정확히 한 명이 아니면 거부) */
  people: { teacher: string[]; student: string[] };
}

/** 계획 받기 — 모양을 맞추고 빠진 칸·형식 오류를 모은다. 모르는 키는 버린다(문서에 안 쓰이는 값이 저장되지 않게). */
export function prepareAgentPlan(rawSpec: WorkSpec, sections: string[], rawPlan: unknown): PreparedPlan {
  const spec = normalizeSpecPlanKeys(rawSpec);
  const schema = agentSchema(spec, sections);
  const problems: string[] = [];
  if (!rawPlan || typeof rawPlan !== 'object' || Array.isArray(rawPlan)) {
    return { spec, plan: {}, problems: ['plan 은 {칸 키: 값} 객체입니다 (get_document_generation 의 fields·plan_example 대로).'], people: { teacher: [], student: [] } };
  }
  const keys = new Set(schema.map((f) => f.key));
  const unknown = Object.keys(rawPlan).filter((k) => !keys.has(k));
  if (unknown.length) problems.push(`모르는 칸입니다: ${unknown.join(', ')} — 칸 키는 ${[...keys].join(', ')}`);
  const picked = Object.fromEntries(Object.entries(rawPlan as Record<string, unknown>).filter(([k]) => keys.has(k)));
  const plan = normalizePlan(schema, picked);
  // 행에 적힌 `__` 키는 버린다 — 자동 번호를 덮지 않게
  for (const f of schema) {
    const v = plan[f.key];
    if (f.type === 'array' && Array.isArray(v)) {
      plan[f.key] = v.map((row) => (row && typeof row === 'object' && !Array.isArray(row)
        ? Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([k]) => !k.startsWith('__')))
        : row));
    }
  }

  for (const m of missingPlanInputs(schema, plan)) {
    const f = schema.find((x) => x.key === m.key);
    problems.push(`${m.label}(${m.key}): ${m.reason === 'empty' ? '비었습니다' : m.reason === 'rows' ? '행이 없습니다' : '행 안에 빈 칸이 있습니다'}${f?.person ? ' — 사람 이름 칸' : ''}`);
  }
  // 서술 칸은 스키마상 «비우면 AI 가 쓴다»(optional)지만 이 경로에는 AI 가 없다 — 필수 서술이 비면 문서에 빈 칸이 남는다
  for (const t of spec.targets) {
    if (t.kind !== 'prose' || t.required === false) continue;
    const v = plan[t.id];
    if (typeof v !== 'string' || !v.trim()) problems.push(`${t.label ?? t.id}(${t.id}): 서술 본문이 비었습니다 — 문서에 들어갈 글을 직접 쓰세요`);
  }
  for (const e of validatePlan(schema, plan)) {
    if (!problems.some((p) => e.includes(p))) problems.push(e);
  }
  for (const f of schema) {
    const v = plan[f.key];
    if (f.type === 'array' && Array.isArray(v)) {
      if (f.minItems != null && v.length < f.minItems) problems.push(`${f.label ?? f.key}(${f.key}): ${f.minItems}행 이상이어야 합니다 (지금 ${v.length})`);
      // 엔진은 상한을 넘는 행을 **조용히 잘라낸다** — 웹 폼이 막는 것을 여기서도 막는다
      if (f.maxItems != null && v.length > f.maxItems) problems.push(`${f.label ?? f.key}(${f.key}): ${f.maxItems}행까지입니다 (지금 ${v.length}) — 넘는 행은 문서에 안 들어간다`);
    }
  }

  const people = { teacher: [] as string[], student: [] as string[] };
  for (const f of schema) {
    if (!f.person) continue;
    const names = splitPersonNames(plan[f.key]);
    people[f.person].push(...names);
  }
  people.teacher = [...new Set(people.teacher)];
  people.student = [...new Set(people.student)];
  return { spec, plan, problems: [...new Set(problems)], people };
}

export interface AgentFillResult {
  filled: FillOutput;
  checks: CheckResult[];
  failed: CheckResult[];
  knowledge: Record<string, unknown>;
  knowledgeMissing: string[];
}

/** 채움 + 검증. 서술 칸은 계획의 본문을 그대로 쓴다 — 비면 비운 채로 남고 검증이 실패로 알린다(AI 를 부르지 않는다). */
export async function fillAgentPlan(spec: WorkSpec, sections: string[], plan: Record<string, unknown>): Promise<AgentFillResult> {
  // db 지식은 이 경로에 없다(에이전트 토큰은 표에 못 닿는다 — 운영 스펙 0건, 2026-10-20). 정적 값만 풀린다.
  const { values: knowledge, missing } = await resolveKnowledge(spec, {
    db: async () => { throw new Error('db knowledge unavailable'); },
    userInputs: {},
  });
  const presetValues: Record<string, unknown> = {};
  for (const t of spec.targets) {
    if (t.kind !== 'prose') continue;
    const v = plan[t.id];
    if (typeof v === 'string' && v.trim()) presetValues[t.id] = v;
  }
  const filled = await fillDocument(sections, {
    spec, plan, knowledge, presetValues,
    // 계획에 본문이 없는 서술 칸만 여기로 온다 — 빈 채로 둔다(지어내지 않는다)
    prose: { generate: async () => ({ paragraphs: [] }) },
  });
  const checks = verifyDocument({ spec, filled, plan, knowledge });
  return { filled, checks, failed: checks.filter((c) => c.status === 'fail'), knowledge, knowledgeMissing: missing };
}

/** 실행 기록 CHECK 행 — 웹 러너와 같은 규칙(키 100자 절단 뒤 다시 유일화, 40개까지) */
export function runChecksOf(checks: CheckResult[]) {
  const keyCount = new Map<string, number>();
  return checks.slice(0, 40).map((c) => {
    const base = c.key.slice(0, 90);
    const n = (keyCount.get(base) ?? 0) + 1;
    keyCount.set(base, n);
    return { key: n === 1 ? base : `${base}#${n}`, label: c.key.split(':')[0], status: c.status, message: c.message.slice(0, 500) };
  });
}
