type JsonRecord = Record<string, unknown>;
export const INQUIRY_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'summary',
    'inquiry_questions',
    'plan_steps',
    'entities',
    'relations',
    'student_prompt_questions',
    'risk_flags',
  ],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    inquiry_questions: {
      type: 'array',
      items: { type: 'string' },
    },
    plan_steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'method', 'output', 'expected_evidence'],
        properties: {
          title: { type: 'string' },
          method: { type: 'string' },
          output: { type: 'string' },
          expected_evidence: { type: 'string' },
        },
      },
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['entity_id', 'label', 'type', 'reuse_existing_id', 'properties', 'evidence'],
        properties: {
          entity_id: { type: 'string' },
          label: { type: 'string' },
          type: {
            type: 'string',
            enum: [
              'Student',
              'Competency',
              'Activity',
              'Attitude',
              'Interest',
              'Concept',
              'Book',
              'Achievement',
              'Person',
              'Role',
              'Thread',
            ],
          },
          reuse_existing_id: { type: ['string', 'null'] },
          properties: {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'target_context', 'notes'],
            properties: {
              status: { type: ['string', 'null'] },
              target_context: { type: ['string', 'null'] },
              notes: { type: ['string', 'null'] },
            },
          },
          evidence: { type: 'string' },
        },
      },
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'source_entity_id',
          'target_entity_id',
          'source_scope',
          'target_scope',
          'relation_type',
          'confidence',
          'evidence',
          'properties',
        ],
        properties: {
          source_entity_id: { type: 'string' },
          target_entity_id: { type: 'string' },
          source_scope: { type: 'string', enum: ['existing', 'planned'] },
          target_scope: { type: 'string', enum: ['existing', 'planned'] },
          relation_type: {
            type: 'string',
            enum: [
              'DEEPENED_FROM',
              'APPLIED_IN',
              'PART_OF',
              'SUPPORTS',
              'MOTIVATED_BY',
              'INSPIRED_BY',
              'EVIDENCED_BY',
              'RELATED_TO',
              'PERFORMED',
              'READ',
            ],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidence: { type: 'string' },
          properties: {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'notes'],
            properties: {
              status: { type: ['string', 'null'] },
              notes: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
    student_prompt_questions: {
      type: 'array',
      items: { type: 'string' },
    },
    risk_flags: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

function numericSourcePiece(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function temporalRankFromSource(source: unknown): number | null {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const record = source as JsonRecord;
  const grade = numericSourcePiece(record.grade);
  if (grade === null) return null;
  const semester = numericSourcePiece(record.semester) ?? 0;
  return grade * 10 + semester;
}

function buildEntityTemporalMap(existingEntities: unknown): Map<string, number> {
  const temporalMap = new Map<string, number>();
  if (!Array.isArray(existingEntities)) return temporalMap;

  for (const entity of existingEntities) {
    if (!entity || typeof entity !== 'object' || Array.isArray(entity)) continue;
    const record = entity as JsonRecord;
    const id = typeof record.id === 'string' ? record.id : null;
    if (!id || !Array.isArray(record.sources)) continue;

    const ranks = record.sources
      .map((source) => temporalRankFromSource(source))
      .filter((rank): rank is number => typeof rank === 'number');
    if (ranks.length > 0) temporalMap.set(id, Math.min(...ranks));
  }

  return temporalMap;
}

function swapRelationEndpoints(relation: JsonRecord) {
  const sourceEntityId = relation.source_entity_id;
  const sourceScope = relation.source_scope;
  relation.source_entity_id = relation.target_entity_id;
  relation.source_scope = relation.target_scope;
  relation.target_entity_id = sourceEntityId;
  relation.target_scope = sourceScope;

  const properties = relation.properties;
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    const record = properties as JsonRecord;
    const notes = typeof record.notes === 'string' && record.notes.trim() ? `${record.notes} ` : '';
    record.notes = `${notes}temporal_direction_normalized`.trim();
  }
}

// Inject a subject-bearing `sources` entry into every planned entity's
// `properties.sources` array. LLM-side schema is `additionalProperties:false`
// with only {status, target_context, notes}, so we attach sources after the
// structured-output validation. Existing entities (reuse_existing_id != null)
// are skipped — their original sources stay intact.
//
// Source shape matches the rest of the KG (utils/inquiryGraph.ts:nodeSourceLabel
// and InquiryDesignPage.tsx:sourceLabel read these keys):
//   { grade, semester, subject, category, source: 'inquiry_design' }
export function injectPlannedEntitySources(result: unknown, target: unknown): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  const record = result as JsonRecord;
  if (!Array.isArray(record.entities)) return result;
  if (!target || typeof target !== 'object' || Array.isArray(target)) return result;

  const targetRecord = target as JsonRecord;
  const subjectName = typeof targetRecord.name === 'string' ? targetRecord.name : null;
  if (!subjectName) return result;

  const grade = numericSourcePiece(targetRecord.grade);
  const semester = numericSourcePiece(targetRecord.semester);
  const kind = typeof targetRecord.kind === 'string' ? targetRecord.kind : null;
  const category =
    kind === 'subject' ? '교과' :
    kind === 'club' ? '동아리활동' :
    kind === 'autonomous' ? '자율활동' :
    kind === 'career' ? '진로활동' : null;

  const sourceEntry: JsonRecord = {
    grade,
    semester,
    subject: subjectName,
    subject_name: subjectName,
    category,
    source: 'inquiry_design',
  };

  for (const entity of record.entities) {
    if (!entity || typeof entity !== 'object' || Array.isArray(entity)) continue;
    const entityRecord = entity as JsonRecord;
    // Reused existing entities keep their original sources untouched.
    if (entityRecord.reuse_existing_id) continue;

    const properties = entityRecord.properties;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
      entityRecord.properties = { sources: [sourceEntry] } as JsonRecord;
      continue;
    }
    const propsRecord = properties as JsonRecord;
    const existing = propsRecord.sources;
    if (Array.isArray(existing)) {
      // Avoid duplicating if a prior pass (or rare LLM hallucination) inserted
      // a similar entry for the same subject.
      const dup = existing.some(
        (s) => s && typeof s === 'object' && !Array.isArray(s) && (s as JsonRecord).subject === subjectName
      );
      if (!dup) existing.push(sourceEntry);
    } else {
      propsRecord.sources = [sourceEntry];
    }
  }

  return result;
}

// Strip newly-created Thread entities. Thread is a meta-node aggregating
// long-running inquiry across multiple activities — a single activity design
// has no authority to create one. Existing Threads can still be referenced via
// `reuse_existing_id` (we don't drop those — they're identified by a non-null
// reuse_existing_id). Relations pointing to a dropped entity_id are also
// removed so we don't leave dangling edges in the response.
export function stripPlannedThreadEntities(result: unknown): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  const record = result as JsonRecord;
  if (!Array.isArray(record.entities)) return result;

  const droppedIds = new Set<string>();
  const keptEntities: unknown[] = [];
  for (const entity of record.entities) {
    if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
      keptEntities.push(entity);
      continue;
    }
    const entityRecord = entity as JsonRecord;
    const type = entityRecord.type;
    const isPlanned = !entityRecord.reuse_existing_id;
    if (type === 'Thread' && isPlanned) {
      const id = typeof entityRecord.entity_id === 'string' ? entityRecord.entity_id : null;
      if (id) droppedIds.add(id);
      continue;
    }
    keptEntities.push(entity);
  }
  record.entities = keptEntities;

  if (droppedIds.size > 0 && Array.isArray(record.relations)) {
    record.relations = record.relations.filter((relation) => {
      if (!relation || typeof relation !== 'object' || Array.isArray(relation)) return true;
      const relationRecord = relation as JsonRecord;
      const source = typeof relationRecord.source_entity_id === 'string' ? relationRecord.source_entity_id : '';
      const target = typeof relationRecord.target_entity_id === 'string' ? relationRecord.target_entity_id : '';
      return !droppedIds.has(source) && !droppedIds.has(target);
    });
  }

  return result;
}

export function normalizeInquiryTemporalRelations(result: unknown, existingEntities: unknown): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  const record = result as JsonRecord;
  if (!Array.isArray(record.relations)) return result;

  const temporalMap = buildEntityTemporalMap(existingEntities);
  for (const relation of record.relations) {
    if (!relation || typeof relation !== 'object' || Array.isArray(relation)) continue;
    const relationRecord = relation as JsonRecord;
    if (relationRecord.relation_type !== 'DEEPENED_FROM') continue;

    const sourceScope = relationRecord.source_scope;
    const targetScope = relationRecord.target_scope;
    const sourceId = typeof relationRecord.source_entity_id === 'string' ? relationRecord.source_entity_id : '';
    const targetId = typeof relationRecord.target_entity_id === 'string' ? relationRecord.target_entity_id : '';

    if (sourceScope === 'planned' && targetScope === 'existing') {
      swapRelationEndpoints(relationRecord);
      continue;
    }

    if (sourceScope === 'existing' && targetScope === 'existing') {
      const sourceRank = temporalMap.get(sourceId);
      const targetRank = temporalMap.get(targetId);
      if (sourceRank !== undefined && targetRank !== undefined && sourceRank > targetRank) {
        swapRelationEndpoints(relationRecord);
      }
    }
  }

  return result;
}

/**
 * 새 Activity 는 **하나**다 — 설계 하나 = 활동 하나 (2026-10-03).
 *
 * Solar 가 실행 계획의 단계(주제 선정·방법 결정·분석·보고서 작성·성찰)를 **활동 노드 다섯 개**로
 * 풀어 그렸다(라이브 2026-10-03, 6개 중 5개가 Activity). 단계는 설계의 `plan_steps` 에 이미 있고
 * 별자리 지도에서는 «앞으로 할 탐구 하나»가 별 하나여야 한다. 프롬프트로도 말하지만 모델이
 * 흘리면 코드가 접는다: 설계 제목과 가장 비슷한 Activity 를 남기고 나머지 planned Activity 를
 * 그 노드로 **합친다**(관계는 옮기고, 자기 자신을 가리키게 된 관계와 중복은 버린다).
 * 같은 이유로 planned Concept 은 4개, Interest 는 1개까지만 — 넘치면 관계가 적은 것부터 뺀다.
 */
export const PLANNED_LIMITS = { Concept: 4, Interest: 1 } as const;
function bigramSet(text: string): Set<string> {
  const t = text.replace(/\s+/g, '').toLowerCase();
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}
function overlap(a: string, b: string): number {
  const x = bigramSet(a), y = bigramSet(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const g of x) if (y.has(g)) shared++;
  return shared / Math.max(x.size, y.size);
}
export function collapsePlannedEntities(result: unknown, design: unknown): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  const record = result as JsonRecord;
  if (!Array.isArray(record.entities)) return result;
  const entities = record.entities.filter((e): e is JsonRecord => !!e && typeof e === 'object' && !Array.isArray(e));
  const relations = Array.isArray(record.relations) ? record.relations.filter((r): r is JsonRecord => !!r && typeof r === 'object' && !Array.isArray(r)) : [];
  const title = design && typeof design === 'object' && typeof (design as JsonRecord).title === 'string' ? (design as JsonRecord).title as string : '';
  const idOf = (e: JsonRecord) => (typeof e.entity_id === 'string' ? e.entity_id : '');
  const planned = (type: string) => entities.filter(e => e.type === type && !e.reuse_existing_id);
  const degree = new Map<string, number>();
  for (const r of relations) for (const side of ['source_entity_id', 'target_entity_id']) { const id = r[side]; if (typeof id === 'string') degree.set(id, (degree.get(id) ?? 0) + 1); }

  const alias = new Map<string, string>(); // 합쳐진 id → 남는 id
  const dropped = new Set<string>();
  const activities = planned('Activity');
  if (activities.length > 1) {
    const keep = [...activities].sort((a, b) => overlap(String(b.label ?? ''), title) - overlap(String(a.label ?? ''), title) || (degree.get(idOf(b)) ?? 0) - (degree.get(idOf(a)) ?? 0))[0];
    if (title) keep.label = title;
    for (const a of activities) if (a !== keep) { alias.set(idOf(a), idOf(keep)); dropped.add(idOf(a)); }
  }
  for (const [type, limit] of Object.entries(PLANNED_LIMITS)) {
    const list = planned(type).sort((a, b) => (degree.get(idOf(b)) ?? 0) - (degree.get(idOf(a)) ?? 0));
    for (const extra of list.slice(limit)) dropped.add(idOf(extra));
  }
  if (!dropped.size) return result;
  record.entities = entities.filter(e => !dropped.has(idOf(e)));
  const seen = new Set<string>();
  record.relations = relations.flatMap(r => {
    const s = typeof r.source_entity_id === 'string' ? r.source_entity_id : '', t = typeof r.target_entity_id === 'string' ? r.target_entity_id : '';
    const source = alias.get(s) ?? s, target = alias.get(t) ?? t;
    if (dropped.has(source) || dropped.has(target) || source === target) return [];
    const key = `${source}|${target}|${String(r.relation_type ?? '')}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...r, source_entity_id: source, target_entity_id: target }];
  });
  return result;
}
