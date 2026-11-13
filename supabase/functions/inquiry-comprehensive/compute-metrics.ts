// Pure deterministic graph metrics. No LLM. No I/O.
// Input: KG entity & relation rows from student_kg_entities / student_kg_relations.
// Output: structured metrics consumed by detect-weaknesses + frontend mini-chart.

export interface KgEntityRow {
  entity_id: string;
  label: string;
  type: string;
  properties: Record<string, unknown> | null;
}

export interface KgRelationRow {
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  properties: Record<string, unknown> | null;
}

export interface KgComprehensiveMetrics {
  totalEntities: number;
  byType: Record<string, number>;
  gradeDistribution: Record<string, { activities: number; books: number }>;
  threadCoverage: Array<{
    id: string;
    label: string;
    activityCount: number;
    sourceSubjects: string[];
  }>;
  interestCoverage: Array<{
    id: string;
    label: string;
    activityCount: number;
    bookCount: number;
    sourceSubjects: string[];
  }>;
  competencyCoverage: Array<{
    id: string;
    label: string;
    subjectCount: number;
    subjects: string[];
  }>;
  conceptCoverage: Array<{
    id: string;
    label: string;
    activityCount: number;
  }>;
}

type SourceRecord = { grade?: number | null; subject?: string | null };

function sourcesOf(entity: KgEntityRow): SourceRecord[] {
  const raw = entity.properties?.sources;
  if (!Array.isArray(raw)) return [];
  return raw as SourceRecord[];
}

function uniqueSubjects(entities: KgEntityRow[]): string[] {
  const set = new Set<string>();
  for (const e of entities) {
    for (const s of sourcesOf(e)) {
      if (s.subject && s.subject.trim().length > 0) set.add(s.subject);
    }
  }
  return Array.from(set);
}

export function computeMetrics(
  entities: KgEntityRow[],
  relations: KgRelationRow[]
): KgComprehensiveMetrics {
  const byType: Record<string, number> = {};
  for (const e of entities) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }

  // Grade distribution (Activity & Book only — these are time-anchored)
  const gradeDistribution: Record<string, { activities: number; books: number }> = {};
  for (const e of entities) {
    if (e.type !== 'Activity' && e.type !== 'Book') continue;
    const grade = sourcesOf(e)[0]?.grade;
    if (typeof grade !== 'number') continue;
    const key = String(grade);
    if (!gradeDistribution[key]) gradeDistribution[key] = { activities: 0, books: 0 };
    if (e.type === 'Activity') gradeDistribution[key].activities++;
    else gradeDistribution[key].books++;
  }

  const byId = new Map(entities.map((e) => [e.entity_id, e]));

  // Helper: collect activities that flow into a target entity via any incoming relation.
  function incomingActivities(targetId: string): KgEntityRow[] {
    const out: KgEntityRow[] = [];
    for (const r of relations) {
      if (r.target_entity_id !== targetId) continue;
      const src = byId.get(r.source_entity_id);
      if (src?.type === 'Activity') out.push(src);
    }
    return out;
  }

  function incomingBooks(targetId: string): KgEntityRow[] {
    const out: KgEntityRow[] = [];
    for (const r of relations) {
      if (r.target_entity_id !== targetId) continue;
      const src = byId.get(r.source_entity_id);
      if (src?.type === 'Book') out.push(src);
    }
    return out;
  }

  function partOfActivities(threadId: string): KgEntityRow[] {
    const out: KgEntityRow[] = [];
    for (const r of relations) {
      if (r.target_entity_id !== threadId) continue;
      if (r.relation_type !== 'PART_OF') continue;
      const src = byId.get(r.source_entity_id);
      if (src?.type === 'Activity') out.push(src);
    }
    return out;
  }

  function linkedActivitiesAny(entityId: string): KgEntityRow[] {
    const out: KgEntityRow[] = [];
    for (const r of relations) {
      const otherId =
        r.source_entity_id === entityId ? r.target_entity_id :
        r.target_entity_id === entityId ? r.source_entity_id :
        null;
      if (!otherId) continue;
      const other = byId.get(otherId);
      if (other?.type === 'Activity') out.push(other);
    }
    return out;
  }

  const threadCoverage = entities
    .filter((e) => e.type === 'Thread')
    .map((thread) => {
      const acts = partOfActivities(thread.entity_id);
      return {
        id: thread.entity_id,
        label: thread.label,
        activityCount: acts.length,
        sourceSubjects: uniqueSubjects([thread, ...acts]),
      };
    });

  const interestCoverage = entities
    .filter((e) => e.type === 'Interest')
    .map((interest) => {
      const acts = incomingActivities(interest.entity_id);
      const books = incomingBooks(interest.entity_id);
      return {
        id: interest.entity_id,
        label: interest.label,
        activityCount: acts.length,
        bookCount: books.length,
        sourceSubjects: uniqueSubjects([interest, ...acts, ...books]),
      };
    });

  const competencyCoverage = entities
    .filter((e) => e.type === 'Competency')
    .map((c) => {
      const subjects = Array.from(new Set(
        sourcesOf(c).map((s) => s.subject).filter((x): x is string => !!x)
      ));
      return {
        id: c.entity_id,
        label: c.label,
        subjectCount: subjects.length,
        subjects,
      };
    });

  const conceptCoverage = entities
    .filter((e) => e.type === 'Concept')
    .map((c) => ({
      id: c.entity_id,
      label: c.label,
      activityCount: linkedActivitiesAny(c.entity_id).length,
    }));

  return {
    totalEntities: entities.length,
    byType,
    gradeDistribution,
    threadCoverage,
    interestCoverage,
    competencyCoverage,
    conceptCoverage,
  };
}
