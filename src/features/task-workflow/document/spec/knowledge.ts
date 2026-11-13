// knowledge 해석: 스펙이 선언한 외부 지식 소스를 실제 값으로.
// db 접근은 주입 함수로 추상화 — 앱은 supabase, 스크립트는 픽스처를 꽂는다.

import type { KnowledgeSource, WorkSpec } from './types';

export type DbFetch = (q: { table: string; select?: string; params?: Record<string, unknown> }) => Promise<unknown>;

export interface KnowledgeAdapters {
  db?: DbFetch;
  /** user-input 키에 대해 이미 수집된 값 */
  userInputs?: Record<string, unknown>;
}

export interface KnowledgeResult {
  values: Record<string, unknown>;
  missing: string[]; // required인데 해석 실패한 키
}

export async function resolveKnowledge(spec: WorkSpec, adapters: KnowledgeAdapters): Promise<KnowledgeResult> {
  const values: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const k of spec.knowledge ?? []) {
    const v = await resolveOne(k, adapters);
    if (v === undefined) {
      if (k.required) missing.push(k.key);
      continue;
    }
    values[k.key] = v;
  }
  return { values, missing };
}

async function resolveOne(k: KnowledgeSource, adapters: KnowledgeAdapters): Promise<unknown> {
  const s = k.source;
  if (s.type === 'static') return s.value;
  if (s.type === 'user-input') return adapters.userInputs?.[k.key];
  if (s.type === 'db') {
    if (!adapters.db) return undefined;
    try {
      return await adapters.db({ table: s.table, select: s.select, params: s.params });
    } catch {
      return undefined;
    }
  }
  return undefined;
}
