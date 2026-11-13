/**
 * `student_kg_entities` / `student_kg_relations` 행 → `StudentKgLayers` 평탄화.
 *
 * **순수 함수만 둔다**(React·supabase 비의존) — 회귀가 여기를 찍는다:
 * `npx tsx scripts/evalog-competency-test/run.mts`.
 *
 * 설계 노트는 `types/kgLayers.ts` 머리글에 있다. 여기서는 "왜 이 규칙인가"만 적는다.
 */
import type {
  KgActivityNode, KgSourceRef, KgThread, KgTrait, KgTraitKind, StudentKgLayers,
} from '../types/kgLayers';

/** 최소한의 행 모양. 생성 타입에 기대지 않는다(이 테이블들은 `as any` 로 읽히는 곳이다). */
export interface KgEntityRowLite {
  entity_id: string;
  label: string | null;
  type: string | null;
  properties: Record<string, unknown> | null;
}
export interface KgRelationRowLite {
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  properties: Record<string, unknown> | null;
}

/** KG 엔티티 타입 → 사람 층 종류. 여기 없는 타입은 층으로 취급하지 않는다. */
const TRAIT_KIND_BY_TYPE: Record<string, KgTraitKind> = {
  Competency: 'competency',
  Achievement: 'achievement',
  Attitude: 'attitude',
  Role: 'role',
  Book: 'book',
  Person: 'person',
};

/**
 * 활동 → 층을 잇는 관계 종류. **`layer === 'local'` 만 쓴다.**
 *
 * 같은 뜻의 관계가 두 층으로 중복 저장되어 있다(실측: `DEMONSTRATED` 가
 * `local` 6,222 · `student` 6,221). `student` 층은 학생 허브에서 나가는 엣지라
 * "어느 활동이 이 역량을 보였는가"에 답하지 못한다 — 층을 안 가리면 항목이 두 배로
 * 늘고 그 절반은 활동을 모르는 상태가 된다.
 */
const LOCAL_TRAIT_RELATIONS = new Set([
  'DEMONSTRATED', 'ACHIEVED', 'SHOWED_ATTITUDE', 'HELD_ROLE', 'READ', 'INSPIRED_BY',
]);

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v)
      : null;

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
};

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => str(x)).filter((x): x is string => !!x) : [];

const EMPTY_SOURCE: KgSourceRef = {
  grade: null, semester: null, subject: null, category: null, activityId: null,
};

function parseSource(raw: unknown): KgSourceRef {
  if (!raw || typeof raw !== 'object') return EMPTY_SOURCE;
  const r = raw as Record<string, unknown>;
  return {
    grade: num(r.grade),
    semester: num(r.semester),
    subject: str(r.subject),
    category: str(r.category),
    activityId: str(r.activity_id),
  };
}

function firstSource(props: Record<string, unknown> | null): KgSourceRef {
  const arr = props?.sources;
  if (!Array.isArray(arr) || arr.length === 0) return EMPTY_SOURCE;
  return parseSource(arr[0]);
}

/** `sources[]` 의 활동 id 전부(중복 제거). 분절 결합 키라 하나도 빠뜨리면 안 된다. */
function sourceActivityIds(props: Record<string, unknown> | null): string[] {
  const arr = props?.sources;
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const raw of arr) {
    const id = parseSource(raw).activityId;
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

const RESEARCH_QUESTION_PREFIX = '연구 질문:';

/**
 * 활동의 `evidence[]` 에서 연구 질문 줄을 뽑는다.
 *
 * 별도 컬럼이 아니라 인용 배열 안에 접두로 들어 있다(v8 Activity 의 83%).
 * `inquiry_activity.research_question` 이 정본이지만 **그 표는 교사 전용 RLS** 라
 * 학생 화면에서 0행이 된다 — 그래서 KG 안의 사본을 쓴다.
 */
export function extractResearchQuestion(evidence: string[]): string | null {
  for (const line of evidence) {
    if (line.startsWith(RESEARCH_QUESTION_PREFIX)) {
      const q = line.slice(RESEARCH_QUESTION_PREFIX.length).trim();
      if (q) return q;
    }
  }
  return null;
}

/** 연구 질문 줄을 뺀 나머지 인용. 화면이 같은 문장을 두 번 그리지 않게 한다. */
export function plainEvidence(evidence: string[]): string[] {
  return evidence.filter((line) => !line.startsWith(RESEARCH_QUESTION_PREFIX));
}

/**
 * KG 활동 id → `student_detailed_activities.id`.
 *
 * v8 = `act:<uuid>#<n>` · pro3 = `<uuid>`. 두 형태를 여기 한 곳에서만 푼다 —
 * 화면마다 `split('#')` 을 복붙하면 엔진이 하나 늘 때 조용히 어긋난다.
 */
export function recordIdOf(activityId: string | null | undefined): string | null {
  if (!activityId) return null;
  const body = activityId.startsWith('act:') ? activityId.slice(4) : activityId;
  const hash = body.indexOf('#');
  const id = hash >= 0 ? body.slice(0, hash) : body;
  return id || null;
}

/**
 * 엔진이 **분절 단위** 활동 id 를 쓰는가.
 *
 * pro3 는 기록 1행 = 활동 1개라 분절 활동에 붙지 않는다(붙는 척하면 안 된다 —
 * 기록 id 를 분절 활동 키로 찾으면 전부 미스가 되고, 화면은 "KG 없음"으로 잘못 말한다).
 */
export function isSegmentScopedEngine(engine: string | null | undefined): boolean {
  return !!engine && engine !== 'solar-pro3' && engine !== 'openai';
}

export interface AssembleKgLayersInput {
  versionId: string;
  version: number;
  engine: string | null;
  createdAt: string | null;
  entities: KgEntityRowLite[];
  relations: KgRelationRowLite[];
}

/**
 * 엔티티·관계 행을 활동 중심 구조로 접는다.
 *
 * 순서가 중요하다 — 활동 노드를 먼저 만들어 두고 관계를 걸어야, 대상이 없는
 * 관계(가드에 걸려 빠진 노드·다른 버전에서 온 id)가 활동에 잘못 붙지 않는다.
 */
export function assembleKgLayers(input: AssembleKgLayersInput): StudentKgLayers {
  const byEntityId = new Map<string, KgEntityRowLite>();
  for (const e of input.entities) {
    if (e.entity_id) byEntityId.set(e.entity_id, e);
  }

  const activities = new Map<string, KgActivityNode>();
  for (const e of input.entities) {
    if (e.type !== 'Activity') continue;
    const props = e.properties ?? {};
    const evidence = strArray(props.evidence);
    activities.set(e.entity_id, {
      entityId: e.entity_id,
      label: str(e.label) ?? '(제목 없음)',
      source: firstSource(props),
      sourceActivityIds: sourceActivityIds(props),
      level: num(props.level),
      usefulness: num(props.usefulness),
      confidence: num(props.confidence),
      researchQuestion: extractResearchQuestion(evidence),
      evidence: plainEvidence(evidence),
      traits: [],
      threadIds: [],
      concepts: [],
      deepenedFrom: [],
      developsInto: [],
      relatedTo: [],
    });
  }

  const threads = new Map<string, KgThread>();
  for (const e of input.entities) {
    if (e.type !== 'Thread') continue;
    threads.set(e.entity_id, {
      entityId: e.entity_id,
      label: str(e.label) ?? '(주제 없음)',
      memberActivityIds: [],
      grades: [],
      confidence: num((e.properties ?? {}).confidence),
    });
  }

  const interests = new Map<string, { label: string; activityIds: string[] }>();
  for (const e of input.entities) {
    if (e.type !== 'Interest') continue;
    const label = str(e.label);
    if (!label) continue;
    if (!interests.has(label)) interests.set(label, { label, activityIds: [] });
  }

  const traits: KgTrait[] = [];
  const seenTrait = new Set<string>();

  for (const r of input.relations) {
    const props = r.properties ?? {};
    const layer = str(props.layer);
    const relEvidence = str(props.evidence);
    const relConf = num(props.confidence);

    // ── 사람 층: 활동 → 역량/성취/태도/역할/도서/인물 ──
    if (layer === 'local' && LOCAL_TRAIT_RELATIONS.has(r.relation_type)) {
      const target = byEntityId.get(r.target_entity_id);
      const kind = target?.type ? TRAIT_KIND_BY_TYPE[target.type] : undefined;
      if (!target || !kind) continue;
      const activity = activities.get(r.source_entity_id);
      const tProps = target.properties ?? {};
      const trait: KgTrait = {
        kind,
        entityId: target.entity_id,
        label: str(target.label) ?? '(이름 없음)',
        // 관계 근거가 없으면 엔티티 대표 인용으로 내려간다(타입 주석의 우선순위).
        evidence: relEvidence ?? strArray(tProps.evidence)[0] ?? null,
        confidence: relConf ?? num(tProps.confidence),
        activityId: activity ? activity.entityId : null,
        source: activity ? activity.source : firstSource(tProps),
      };
      // 한 활동이 같은 항목을 두 번 가리키는 경우를 접는다.
      const dedupe = `${trait.activityId ?? '-'}::${trait.entityId}`;
      if (seenTrait.has(dedupe)) continue;
      seenTrait.add(dedupe);
      traits.push(trait);
      if (activity) activity.traits.push(trait);
      continue;
    }

    // ── 개념: 활동 → Concept ──
    if (r.relation_type === 'CONTAINS_CONCEPT') {
      const activity = activities.get(r.source_entity_id);
      const label = str(byEntityId.get(r.target_entity_id)?.label ?? null);
      if (activity && label && !activity.concepts.includes(label)) activity.concepts.push(label);
      continue;
    }

    // ── 주제 사슬: 활동 → Thread ──
    if (r.relation_type === 'PART_OF') {
      const activity = activities.get(r.source_entity_id);
      const thread = threads.get(r.target_entity_id);
      if (activity && thread) {
        if (!thread.memberActivityIds.includes(activity.entityId)) {
          thread.memberActivityIds.push(activity.entityId);
        }
        if (!activity.threadIds.includes(thread.entityId)) activity.threadIds.push(thread.entityId);
      }
      continue;
    }

    // ── 관심(주제군): 학생 → Interest. 활동 역참조는 Interest 쪽 sources 로 채운다. ──
    if (r.relation_type === 'INTERESTED_IN') {
      const target = byEntityId.get(r.target_entity_id);
      const label = str(target?.label ?? null);
      if (!label) continue;
      const bucket = interests.get(label) ?? { label, activityIds: [] };
      const srcs = (target?.properties ?? {}).sources;
      if (Array.isArray(srcs)) {
        for (const s of srcs) {
          const aid = parseSource(s).activityId;
          if (aid && !bucket.activityIds.includes(aid)) bucket.activityIds.push(aid);
        }
      }
      interests.set(label, bucket);
      continue;
    }

    // ── 시간 서사: 활동 ↔ 활동 ──
    if (layer === 'activity') {
      const from = activities.get(r.source_entity_id);
      const to = activities.get(r.target_entity_id);
      if (!from || !to) continue;
      if (r.relation_type === 'DEEPENED_FROM') {
        if (!from.deepenedFrom.includes(to.entityId)) from.deepenedFrom.push(to.entityId);
        if (!to.developsInto.includes(from.entityId)) to.developsInto.push(from.entityId);
      } else if (r.relation_type === 'DEVELOPS_INTO') {
        if (!from.developsInto.includes(to.entityId)) from.developsInto.push(to.entityId);
        if (!to.deepenedFrom.includes(from.entityId)) to.deepenedFrom.push(from.entityId);
      } else if (r.relation_type === 'RELATED_TO') {
        if (!from.relatedTo.includes(to.entityId)) from.relatedTo.push(to.entityId);
        if (!to.relatedTo.includes(from.entityId)) to.relatedTo.push(from.entityId);
      }
    }
  }

  // Thread 의 학년 범위는 **구성원에서** 계산한다(타입 주석 참고).
  for (const thread of threads.values()) {
    const grades = new Set<number>();
    for (const aid of thread.memberActivityIds) {
      const g = activities.get(aid)?.source.grade;
      if (typeof g === 'number') grades.add(g);
    }
    thread.grades = [...grades].sort((a, b) => a - b);
  }

  return {
    versionId: input.versionId,
    version: input.version,
    engine: input.engine,
    createdAt: input.createdAt,
    activities,
    threads: [...threads.values()].sort(
      (a, b) => b.memberActivityIds.length - a.memberActivityIds.length
        || a.label.localeCompare(b.label, 'ko'),
    ),
    interests: [...interests.values()].sort(
      (a, b) => b.activityIds.length - a.activityIds.length
        || a.label.localeCompare(b.label, 'ko'),
    ),
    traits,
  };
}

/** `kg_json.entities` → 행 모양. 비정규화 테이블이 비었을 때의 폴백(inquiry-design 과 같은 이유). */
export function entityRowsFromKgJson(kgJson: unknown): KgEntityRowLite[] {
  const entities = (kgJson as { entities?: unknown } | null)?.entities;
  if (!Array.isArray(entities)) return [];
  return entities.map((raw) => {
    const e = raw as Record<string, unknown>;
    return {
      entity_id: String(e.id ?? ''),
      label: str(e.name) ?? str(e.label),
      type: str(e.type),
      properties: {
        confidence: e.confidence,
        sources: e.sources,
        evidence: e.evidence,
        ...(e.properties && typeof e.properties === 'object'
          ? e.properties as Record<string, unknown>
          : {}),
      },
    };
  });
}

/** `kg_json.triples` → 행 모양. 트리플의 `subject === 'Student'` 는 학생 허브다(층 `student`). */
export function relationRowsFromKgJson(kgJson: unknown): KgRelationRowLite[] {
  const json = kgJson as { triples?: unknown; relations?: unknown } | null;
  const triples = Array.isArray(json?.triples) ? json?.triples
    : Array.isArray(json?.relations) ? json?.relations
      : null;
  if (!triples) return [];
  return triples.map((raw) => {
    const t = raw as Record<string, unknown>;
    const props = (t.properties && typeof t.properties === 'object'
      ? t.properties as Record<string, unknown>
      : {});
    return {
      source_entity_id: String(t.subject ?? t.source_entity_id ?? ''),
      target_entity_id: String(t.object ?? t.target_entity_id ?? ''),
      relation_type: String(t.predicate ?? t.relation_type ?? ''),
      properties: {
        confidence: t.confidence,
        evidence: t.evidence,
        ...props,
      },
    };
  });
}
