// Embedding-based KG hygiene detection.
//
// Two outputs:
//   1. duplicate_clusters — same-type entities (Interest/Thread/Concept) whose
//      embeddings cosine-similarity is above DUPLICATE_THRESHOLD. Treated as
//      one canonical entity when computing metrics.
//   2. missing_edges — cross-type pairs (Activity → Interest/Thread/Concept)
//      whose embeddings are above MISSING_EDGE_THRESHOLD AND have no explicit
//      relation. Added as inferred edges when computing activity counts.
//
// Thresholds were chosen high to favor precision over recall. A duplicate at
// 0.92 means two labels are essentially the same concept (e.g.
// "신경과학" vs "신경과학/정신건강"). For missing edges 0.86 catches obvious
// topical matches without overreaching.

import type { KgEntityRow, KgRelationRow } from './compute-metrics.ts';
import { cosineSimilarity } from './embedding-service.ts';

// Recall-focused thresholds. The LLM verifier (hygiene-verifier.ts) prunes
// false positives from the candidate pool. Korean short labels with
// text-embedding-3-small typically score 0.50-0.78 for truly related concepts,
// so we cast a wider net and rely on the verifier for precision.
export const DUPLICATE_THRESHOLD = 0.70;
export const MISSING_EDGE_THRESHOLD = 0.50;

const DUPLICATE_TYPES = new Set(['Interest', 'Thread', 'Concept', 'Competency']);
// Sources of inferred edges. Thread → Interest catches "탐구 mirror" cases where
// the Thread is a longitudinal grouping of activities pursuing a declared Interest
// but no explicit relation was extracted. We never merge these (different ontology
// roles), only add a REALIZES edge.
const MISSING_EDGE_SOURCE_TYPES = new Set(['Activity', 'Thread']);
const MISSING_EDGE_TARGETS = new Set(['Interest', 'Thread', 'Concept']);

export interface DuplicateCluster {
  type: string;
  canonical_entity_id: string;
  canonical_label: string;
  member_entity_ids: string[];
  member_labels: string[];
  max_similarity: number;
}

export interface InferredEdge {
  source_entity_id: string;
  source_label: string;
  source_type: string;
  target_entity_id: string;
  target_label: string;
  target_type: string;
  similarity: number;
  suggested_relation_type: string;
}

export interface HygieneFindings {
  duplicate_clusters: DuplicateCluster[];
  missing_edges: InferredEdge[];
}

function suggestRelationType(sourceType: string, targetType: string): string {
  if (sourceType === 'Thread' && targetType === 'Interest') return 'REALIZES';
  if (sourceType === 'Activity' && targetType === 'Thread') return 'PART_OF';
  if (sourceType === 'Activity' && targetType === 'Interest') return 'RELATED_TO';
  if (sourceType === 'Activity' && targetType === 'Concept') return 'USES_CONCEPT';
  return 'RELATED_TO';
}

/**
 * Union-Find clustering — keeps it O(n²) similarity + near-linear union, fine
 * for KGs in the low-hundreds of entities.
 */
function unionFind<T>(items: T[]) {
  const parent = items.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  function groups(): Map<number, number[]> {
    const map = new Map<number, number[]>();
    for (let i = 0; i < items.length; i++) {
      const r = find(i);
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(i);
    }
    return map;
  }
  return { find, union, groups };
}

export function detectHygiene(
  entities: KgEntityRow[],
  relations: KgRelationRow[],
  embeddings: Map<string, number[]>
): HygieneFindings {
  // ── 1. duplicate clusters per type ──
  const duplicate_clusters: DuplicateCluster[] = [];
  for (const type of DUPLICATE_TYPES) {
    const typed = entities.filter((e) => e.type === type && embeddings.has(e.entity_id));
    if (typed.length < 2) continue;

    const uf = unionFind(typed);
    const pairMax = new Map<string, number>();

    for (let i = 0; i < typed.length; i++) {
      for (let j = i + 1; j < typed.length; j++) {
        const sim = cosineSimilarity(
          embeddings.get(typed[i].entity_id)!,
          embeddings.get(typed[j].entity_id)!
        );
        if (sim >= DUPLICATE_THRESHOLD) {
          uf.union(i, j);
          pairMax.set(`${i}-${j}`, sim);
        }
      }
    }

    for (const idxs of uf.groups().values()) {
      if (idxs.length < 2) continue;
      const members = idxs.map((k) => typed[k]);
      // Canonical = entity with the most outgoing+incoming activity links
      const activityDegree = (eid: string) =>
        relations.filter((r) =>
          (r.source_entity_id === eid || r.target_entity_id === eid)
        ).length;
      members.sort((a, b) => activityDegree(b.entity_id) - activityDegree(a.entity_id));
      const [canonical, ...rest] = members;
      let maxSim = 0;
      for (let i = 0; i < idxs.length; i++) {
        for (let j = i + 1; j < idxs.length; j++) {
          const key = idxs[i] < idxs[j] ? `${idxs[i]}-${idxs[j]}` : `${idxs[j]}-${idxs[i]}`;
          maxSim = Math.max(maxSim, pairMax.get(key) ?? 0);
        }
      }
      duplicate_clusters.push({
        type,
        canonical_entity_id: canonical.entity_id,
        canonical_label: canonical.label,
        member_entity_ids: [canonical.entity_id, ...rest.map((e) => e.entity_id)],
        member_labels: [canonical.label, ...rest.map((e) => e.label)],
        max_similarity: Number(maxSim.toFixed(4)),
      });
    }
  }

  // ── 2. missing edges (Activity → Interest/Thread/Concept ; Thread → Interest mirror) ──
  const existingPairs = new Set<string>();
  for (const r of relations) {
    existingPairs.add(`${r.source_entity_id}->${r.target_entity_id}`);
    existingPairs.add(`${r.target_entity_id}->${r.source_entity_id}`);
  }

  const sources = entities.filter(
    (e) => MISSING_EDGE_SOURCE_TYPES.has(e.type) && embeddings.has(e.entity_id)
  );
  const targets = entities.filter(
    (e) => MISSING_EDGE_TARGETS.has(e.type) && embeddings.has(e.entity_id)
  );

  const missing_edges: InferredEdge[] = [];
  for (const src of sources) {
    for (const tgt of targets) {
      if (src.entity_id === tgt.entity_id) continue;
      // Skip same-type pairs: those go through duplicate detection instead.
      if (src.type === tgt.type) continue;
      const key = `${src.entity_id}->${tgt.entity_id}`;
      if (existingPairs.has(key)) continue;
      const sim = cosineSimilarity(
        embeddings.get(src.entity_id)!,
        embeddings.get(tgt.entity_id)!
      );
      if (sim < MISSING_EDGE_THRESHOLD) continue;
      missing_edges.push({
        source_entity_id: src.entity_id,
        source_label: src.label,
        source_type: src.type,
        target_entity_id: tgt.entity_id,
        target_label: tgt.label,
        target_type: tgt.type,
        similarity: Number(sim.toFixed(4)),
        suggested_relation_type: suggestRelationType(src.type, tgt.type),
      });
    }
  }

  // Sort each output by descending strength so UI gets the most actionable first.
  duplicate_clusters.sort((a, b) => b.max_similarity - a.max_similarity);
  missing_edges.sort((a, b) => b.similarity - a.similarity);

  return { duplicate_clusters, missing_edges };
}

/**
 * Apply hygiene findings to the graph in-memory:
 *   - Merge duplicate-cluster members into their canonical entity (rewrite
 *     relations to point at canonical). Members themselves are removed.
 *   - Append inferred edges as synthetic relations so activity counts reflect
 *     them.
 *
 * Returns NEW arrays; inputs are not mutated.
 */
export function applyHygiene(
  entities: KgEntityRow[],
  relations: KgRelationRow[],
  hygiene: HygieneFindings
): { entities: KgEntityRow[]; relations: KgRelationRow[] } {
  // Build remap: non-canonical id → canonical id
  const remap = new Map<string, string>();
  const removedIds = new Set<string>();
  for (const cluster of hygiene.duplicate_clusters) {
    const [canonical, ...rest] = cluster.member_entity_ids;
    for (const member of rest) {
      remap.set(member, canonical);
      removedIds.add(member);
    }
  }

  const remappedRelations = relations
    .map((r) => ({
      ...r,
      source_entity_id: remap.get(r.source_entity_id) ?? r.source_entity_id,
      target_entity_id: remap.get(r.target_entity_id) ?? r.target_entity_id,
    }))
    .filter((r) => r.source_entity_id !== r.target_entity_id);

  const inferred: KgRelationRow[] = hygiene.missing_edges.map((edge) => ({
    source_entity_id: remap.get(edge.source_entity_id) ?? edge.source_entity_id,
    target_entity_id: remap.get(edge.target_entity_id) ?? edge.target_entity_id,
    relation_type: edge.suggested_relation_type,
    properties: { inferred: true, similarity: edge.similarity },
  }));

  // Deduplicate (canonical remap can produce duplicate triples)
  const seen = new Set<string>();
  const allRelations: KgRelationRow[] = [];
  for (const r of [...remappedRelations, ...inferred]) {
    const key = `${r.source_entity_id}|${r.target_entity_id}|${r.relation_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    allRelations.push(r);
  }

  const remainingEntities = entities.filter((e) => !removedIds.has(e.entity_id));
  return { entities: remainingEntities, relations: allRelations };
}
