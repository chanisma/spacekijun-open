// Lazy embedding generation for KG entities.
// Builds a short text payload (label + source subjects + first evidence snippet)
// and calls OpenAI text-embedding-3-small. Results persist via the
// set_kg_entity_embedding RPC.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { KgEntityRow } from './compute-metrics.ts';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;

interface EnrichedEntity {
  entity_id: string;
  embedding: number[];
}

function buildEmbeddingText(entity: KgEntityRow): string {
  const props = entity.properties ?? {};
  const sources = (props.sources as Array<{ subject?: string | null }> | undefined) ?? [];
  const evidence = (props.evidence as string[] | undefined) ?? [];

  const subjects = Array.from(
    new Set(sources.map((s) => s.subject).filter((x): x is string => !!x))
  ).join(', ');
  const firstEvidence = evidence[0]?.slice(0, 160) ?? '';

  return [
    `[${entity.type}] ${entity.label}`,
    subjects ? `과목: ${subjects}` : '',
    firstEvidence ? `근거: ${firstEvidence}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

async function fetchExistingEmbeddings(
  supabase: SupabaseClient,
  kgVersionId: string
): Promise<Map<string, number[]>> {
  const { data, error } = await supabase
    .from('student_kg_entities')
    .select('entity_id, embedding')
    .eq('kg_version_id', kgVersionId)
    .not('embedding', 'is', null);
  if (error) throw new Error(`embedding fetch failed: ${error.message}`);

  const map = new Map<string, number[]>();
  for (const row of data ?? []) {
    if (!row.embedding) continue;
    // pgvector returns embeddings as string "[0.1,0.2,...]" via supabase-js
    const parsed = typeof row.embedding === 'string'
      ? JSON.parse(row.embedding)
      : row.embedding;
    if (Array.isArray(parsed) && parsed.length === EMBEDDING_DIMS) {
      map.set(row.entity_id, parsed as number[]);
    }
  }
  return map;
}

async function callOpenAIEmbeddings(inputs: string[], request: typeof fetch = fetch): Promise<number[][]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const res = await request('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI embedding ${res.status}: ${txt.slice(0, 200)}`);
  }
  const body = await res.json();
  return (body.data ?? []).map((row: { embedding: number[] }) => row.embedding);
}

export async function ensureEmbeddings(
  supabase: SupabaseClient,
  kgVersionId: string,
  entities: KgEntityRow[],
  request?: typeof fetch
): Promise<{ embeddings: Map<string, number[]>; generated: number }> {
  const existing = await fetchExistingEmbeddings(supabase, kgVersionId);
  const missing = entities.filter((e) => !existing.has(e.entity_id));
  if (missing.length === 0) {
    return { embeddings: existing, generated: 0 };
  }

  const inputs = missing.map(buildEmbeddingText);
  const vectors = await callOpenAIEmbeddings(inputs, request);

  if (vectors.length !== missing.length) {
    throw new Error(`embedding count mismatch: got ${vectors.length}, expected ${missing.length}`);
  }

  // Persist via RPC (RLS-aware) — parallelize but cap concurrency to be polite.
  const writes: Array<Promise<unknown>> = [];
  const CONCURRENCY = 8;
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY).map((entity, j) => {
      const vec = vectors[i + j];
      existing.set(entity.entity_id, vec);
      // pgvector accepts a JSON-stringified array as text input via PostgREST.
      return supabase.rpc('set_kg_entity_embedding', {
        p_kg_version_id: kgVersionId,
        p_entity_id: entity.entity_id,
        p_embedding: `[${vec.join(',')}]`,
      });
    });
    writes.push(...batch.map(request => Promise.resolve(request)));
    await Promise.all(batch);
  }

  return { embeddings: existing, generated: missing.length };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
