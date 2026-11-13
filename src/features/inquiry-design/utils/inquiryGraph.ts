import type cytoscape from 'cytoscape';
import { isNewPipelineEngine } from '@/services/studentKgService';
import {
  computeImportanceScale,
  type ImportanceEdge,
  type ImportanceNode,
} from './nodeImportance';
import {
  kgConfidence,
  kgEdgeLayer,
  kgEvidenceList,
  kgPrimaryGrade,
  kgSourceLabel,
  kgSourceList,
} from './kgProperties';
import {
  v7EdgeStyle,
  v7EntityColor,
  v7EntityShape,
  v7NodeBorderWidth,
  v7NodeFontSize,
  v7NodeSize,
} from './inquiryGraphV7';
import type {
  InquiryAnalysisResult,
  InquiryWorkspace,
  KgRelationRow,
  SavedInquiryDesign,
} from '../types';

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  Student: '학생',
  Competency: '역량',
  Activity: '활동',
  Attitude: '태도',
  Interest: '관심분야',
  Concept: '개념',
  Book: '독서',
  Achievement: '성취',
  Person: '인물',
  Role: '역할',
  Thread: '탐구 스레드',
};

const ENTITY_COLORS: Record<string, string> = {
  Student: '#3B82F6',
  Competency: '#8B5CF6',
  Activity: '#06B6D4',
  Attitude: '#10B981',
  Interest: '#F59E0B',
  Concept: '#EAB308',
  Book: '#EC4899',
  Achievement: '#EF4444',
  Person: '#F97316',
  Role: '#A855F7',
  Thread: '#6366F1',
};

const ENTITY_SHAPES: Record<string, string> = {
  Student: 'ellipse',
  Competency: 'round-rectangle',
  Activity: 'diamond',
  Attitude: 'ellipse',
  Interest: 'star',
  Concept: 'hexagon',
  Book: 'rectangle',
  Achievement: 'octagon',
  Person: 'ellipse',
  Role: 'round-rectangle',
  Thread: 'round-rectangle',
};

const RELATION_COLORS: Record<string, string> = {
  DEMONSTRATED: '#8B5CF6',
  PERFORMED: '#06B6D4',
  SHOWED_ATTITUDE: '#10B981',
  INTERESTED_IN: '#F59E0B',
  ENGAGED_WITH: '#EAB308',
  CONTAINS_CONCEPT: '#FACC15',
  APPLIES_CONCEPT: '#22D3EE',
  SUPPORTED_BY_CONCEPT: '#A78BFA',
  USES_CONCEPT: '#14B8A6',
  READ: '#EC4899',
  ACHIEVED: '#EF4444',
  HELD_ROLE: '#A855F7',
  RELATED_TO: '#64748b',
  APPLIED_IN: '#22D3EE',
  EVIDENCED_BY: '#FB923C',
  DEVELOPS_INTO: '#34D399',
  MOTIVATED_BY: '#FBBF24',
  SUPPORTS: '#A78BFA',
  INSPIRED_BY: '#F472B6',
  DEEPENED_FROM: '#818CF8',
  PART_OF: '#94A3B8',
};

const DASHED_RELATIONS = new Set([
  'RELATED_TO',
  'CONTAINS_CONCEPT',
  'APPLIES_CONCEPT',
  'SUPPORTED_BY_CONCEPT',
  'USES_CONCEPT',
  'APPLIED_IN',
  'EVIDENCED_BY',
  'DEVELOPS_INTO',
  'MOTIVATED_BY',
  'SUPPORTS',
  'INSPIRED_BY',
  'DEEPENED_FROM',
  'PART_OF',
]);

export const RELATION_LABELS_KO: Record<string, string> = {
  DEMONSTRATED: '역량 발현',
  PERFORMED: '활동 수행',
  SHOWED_ATTITUDE: '태도 표출',
  INTERESTED_IN: '관심 분야',
  ENGAGED_WITH: '개념 탐구',
  CONTAINS_CONCEPT: '개념 포함',
  APPLIES_CONCEPT: '개념 적용',
  SUPPORTED_BY_CONCEPT: '개념 뒷받침',
  USES_CONCEPT: '개념 활용',
  READ: '독서',
  ACHIEVED: '성취 달성',
  HELD_ROLE: '역할 수행',
  RELATED_TO: '관련',
  APPLIED_IN: '적용',
  EVIDENCED_BY: '근거 활동',
  DEVELOPS_INTO: '발전',
  MOTIVATED_BY: '동기 부여',
  SUPPORTS: '뒷받침',
  INSPIRED_BY: '영감',
  DEEPENED_FROM: '심화',
  PART_OF: '소속',
};

export function entityColor(type?: string | null): string {
  return ENTITY_COLORS[type ?? ''] ?? '#64748b';
}

export function entityTypeLabel(type?: string | null): string {
  if (!type) return '기타';
  const ko = ENTITY_TYPE_LABELS[type];
  return ko ? `${type} (${ko})` : type;
}

function entityShape(type?: string | null): string {
  return ENTITY_SHAPES[type ?? ''] ?? 'ellipse';
}

function nodeSize(type?: string | null): number {
  if (type === 'Student') return 74;
  if (type === 'Thread') return 54;
  if (type === 'Activity') return 50;
  return 46;
}

function nodeFontSize(type?: string | null): number {
  return type === 'Student' ? 13 : 10;
}

function nodeBorderWidth(type?: string | null): number {
  if (type === 'Student') return 3;
  if (type === 'Thread') return 2.5;
  return 2;
}

export function relationLabelKo(type?: string | null): string {
  if (!type) return '관계';
  return RELATION_LABELS_KO[type] ?? type;
}

export function relationColor(type?: string | null): string {
  return RELATION_COLORS[type ?? ''] ?? '#64748b';
}

function relationLineStyle(type?: string | null): string {
  if (type === 'READ') return 'dotted';
  return DASHED_RELATIONS.has(type ?? '') ? 'dashed' : 'solid';
}

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function evidenceFromProperties(properties: Record<string, unknown> | null): string {
  return kgEvidenceList(properties).join(' | ');
}

function confidenceFromProperties(properties: Record<string, unknown> | null): number | undefined {
  return kgConfidence(properties);
}

function truncateSourceLabel(value: string, maxLength = 24): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function nodeSourceLabel(properties: Record<string, unknown> | null): string {
  const labels = kgSourceList(properties).map(kgSourceLabel).filter(Boolean);
  if (labels.length === 0) return '';
  return truncateSourceLabel(labels.length > 1 ? `${labels[0]} 외 ${labels.length - 1}` : labels[0]);
}

function sourceAwareNodeLabel(label: string, type?: string | null, properties?: Record<string, unknown> | null): string {
  // 흐름의 학문 분야 (2026-10-02, `scripts/kg-extract-v8/thread-fields.mts`). 주제군 관심분야 노드를 걷어 내고
  // 그 자리를 이 속성이 맡는다. 분야가 없는 옛 KG 는 이름만 그린다.
  if (type === 'Thread') {
    const field = typeof properties?.field === 'string' ? properties.field : '';
    return field ? `${label}\n분야: ${field}` : label;
  }
  if (type !== 'Activity' && type !== 'Book') return label;
  // 출처를 모르면 줄을 아예 쓰지 않는다 — 종전 «출처: 출처 미상»은 노드마다 같은 말을 되풀이해 이름만 가렸다(2026-10-03 UI 점검).
  const source = nodeSourceLabel(properties ?? null);
  return source ? `${label}\n출처: ${source}` : label;
}

function relationEvidence(relation: KgRelationRow): string {
  return kgEvidenceList(relation.properties).join(' | ');
}

/**
 * 엣지 id 3종. **만드는 쪽과 읽는 쪽이 같은 모듈에 있어야 한다** — 세부사항 패널이
 * 이 id 를 되풀어 관계를 되찾으므로, 형식을 한쪽에서만 바꾸면 조용히 "관계를 못 찾는"
 * 상태가 된다(오류는 나지 않고 패널만 안 뜬다).
 *
 * 설계·미리보기 id 에 **배열 위치**를 쓰는 이유: 종전 형식
 * (`design::<설계id>::<출발>::<도착>::<술어>`)은 같은 두 노드를 같은 술어로 잇는 관계가
 * 둘이면 **같은 id** 가 되어 ①cytoscape 가 뒤엣것을 버리고 ②id 로 되찾을 때 엉뚱한
 * 근거를 보여준다. 위치는 그 배열 안에서 유일하다.
 */
export function kgEdgeId(relationId: string): string {
  return `kg::${relationId}`;
}

export function designEdgeId(designId: string, index: number): string {
  return `design::${designId}::${index}`;
}

export function previewEdgeId(index: number): string {
  return `preview::${index}`;
}

/** 설계·미리보기 엣지 id → 어느 설계의 몇 번째 관계인가. 기존 KG·미상 형식은 null. */
export type DesignedEdgeRef =
  | { origin: 'saved'; designId: string; index: number }
  | { origin: 'preview'; index: number };

export function parseDesignedEdgeId(edgeId: string): DesignedEdgeRef | null {
  const parts = edgeId.split('::');
  const index = Number(parts[parts.length - 1]);
  if (!Number.isInteger(index) || index < 0) return null;
  if (parts[0] === 'preview' && parts.length === 2) return { origin: 'preview', index };
  if (parts[0] === 'design' && parts.length === 3) return { origin: 'saved', designId: parts[1], index };
  return null;
}

function plannedNodeId(designId: string, entityId: string): string {
  return `${designId}::${entityId}`;
}

function relationEndpoint(designId: string, scope: string, entityId: string): string {
  return scope === 'planned' ? plannedNodeId(designId, entityId) : entityId;
}

function pushEdge(
  elements: cytoscape.ElementDefinition[],
  id: string,
  source: string,
  target: string,
  label: string,
  extra: Record<string, unknown> = {}
) {
  if (!source || !target || source === target) return;
  const confidence = toNumber(extra.confidence);
  elements.push({
    group: 'edges',
    data: {
      id,
      source,
      target,
      label,
      type: label,
      labelKo: relationLabelKo(label),
      edgeColor: relationColor(label),
      lineStyle: relationLineStyle(label),
      edgeWidth: confidence ? 1 + confidence * 2 : 2,
      // 기본값을 항상 넣어 둔다. 캔버스가 `data(edgeOpacity)`로 읽는데 값이 없는 엣지가
      // 있으면 그 엣지만 투명해진다. 0.68은 구 스타일이 쓰던 고정값이라 구 KG는 무변화.
      edgeOpacity: 0.68,
      ...extra,
    },
  });
}

/**
 * 이 워크스페이스가 신 파이프라인 KG인가(§15).
 * 판정 근거는 `source_stats.extraction_engine` 하나뿐이고, 비교는
 * `isNewPipelineEngine()`에 모아 둔다 — 문자열을 여기저기서 비교하면 어긋난다.
 */
export function isV7Workspace(workspace: InquiryWorkspace): boolean {
  const stats = workspace.kgJson?.source_stats as { extraction_engine?: string } | undefined;
  return isNewPipelineEngine(stats?.extraction_engine);
}

export function buildInquiryGraphElements(input: {
  workspace: InquiryWorkspace;
  savedDesigns: SavedInquiryDesign[];
  preview?: InquiryAnalysisResult | null;
}): cytoscape.ElementDefinition[] {
  const { workspace, savedDesigns, preview } = input;
  const elements: cytoscape.ElementDefinition[] = [];
  const nodeIds = new Set<string>();
  // 신 KG는 Student 노드를 만들지 않는다(§3) — 모든 활동과 이어지는 허브라
  // 예산과 주의를 방사형 엣지에 소모하고, 걷어내면 노드 31%가 고립됐다.
  // 여기서 그리면 엣지 하나 없는 고아 노드가 되므로 아예 만들지 않는다.
  const v7 = isV7Workspace(workspace);

  if (!v7) elements.push({
    group: 'nodes',
    data: {
      id: 'student',
      label: workspace.student?.name
        ? `${workspace.student.name}\n(${workspace.student.id})`
        : workspace.kgJson?.student_code ?? 'Student',
      type: 'Student',
      scope: 'center',
      color: entityColor('Student'),
      shapeVal: entityShape('Student'),
      nodeSize: nodeSize('Student'),
      fontSize: nodeFontSize('Student'),
      borderW: nodeBorderWidth('Student'),
      selectable: false,
    },
  });
  if (!v7) nodeIds.add('student');

  for (const entity of workspace.kgEntities) {
    elements.push({
      group: 'nodes',
      data: {
        id: entity.entity_id,
        label: sourceAwareNodeLabel(entity.label, entity.type, entity.properties),
        type: entity.type ?? 'Concept',
        scope: 'existing',
        color: v7 ? v7EntityColor(entity.type) : entityColor(entity.type),
        shapeVal: v7 ? v7EntityShape(entity.type) : entityShape(entity.type),
        nodeSize: v7 ? v7NodeSize(entity.type) : nodeSize(entity.type),
        fontSize: v7 ? v7NodeFontSize(entity.type) : nodeFontSize(entity.type),
        borderW: v7 ? v7NodeBorderWidth(entity.type) : nodeBorderWidth(entity.type),
        confidence: confidenceFromProperties(entity.properties),
        evidence: evidenceFromProperties(entity.properties),
        // 학년. 엣지가 없어 force가 놓을 근거가 없는 노드를 캔버스가 데이터 축으로
        // 배치할 때 쓴다(`placeIsolatedNodes`). 라벨 문자열에서 되파싱하지 않도록
        // 여기서 값으로 싣는다.
        grade: kgPrimaryGrade(entity.properties),
      },
    });
    nodeIds.add(entity.entity_id);
  }

  for (const relation of workspace.kgRelations) {
    if (!nodeIds.has(relation.source_entity_id) || !nodeIds.has(relation.target_entity_id)) continue;
    const id = kgEdgeId(relation.id);
    // 신 KG는 엣지의 `source`에 층(activity/recall/thread/concept/local)이 실려 있다.
    // 층마다 무게가 달라 같은 굵기로 그리면 본체(활동↔활동)가 개념선 111개에 묻힌다.
    //
    // PART_OF(활동 → Thread)도 **그린다**. 한때 Thread를 compound 상자로 그리며 이 선을
    // 뺐으나(§15-2), 상자가 오히려 시각적 복잡도를 올려 되돌렸다 — 상자는 자기 크기와
    // 배치를 따로 요구하는 반면, Thread를 노드로 두면 흐름 소속이 옅은 점선 하나로 끝난다.
    const layer = kgEdgeLayer(relation.properties);
    const v7Style = v7 ? v7EdgeStyle(layer, relation.relation_type) : null;
    pushEdge(elements, id, relation.source_entity_id, relation.target_entity_id, relation.relation_type, {
      scope: 'existing',
      confidence: confidenceFromProperties(relation.properties),
      evidence: relationEvidence(relation),
      layer,
      ...(v7Style
        ? { edgeColor: v7Style.color, edgeWidth: v7Style.width, lineStyle: v7Style.style, edgeOpacity: v7Style.opacity }
        : {}),
    });
  }

  for (const design of savedDesigns) {
    for (const entity of design.entities) {
      const id = plannedNodeId(design.id, entity.entity_id);
      elements.push({
        group: 'nodes',
        data: {
          id,
          entity_id: entity.entity_id,
          label: sourceAwareNodeLabel(entity.label, entity.type, entity.properties),
          type: entity.type,
          scope: 'saved',
          designId: design.id,
          color: entityColor(entity.type),
          shapeVal: entityShape(entity.type),
          nodeSize: nodeSize(entity.type),
          fontSize: nodeFontSize(entity.type),
          borderW: nodeBorderWidth(entity.type),
          evidence: entity.evidence,
        },
      });
      nodeIds.add(id);
    }

    for (let index = 0; index < design.relations.length; index += 1) {
      const relation = design.relations[index];
      const source = relationEndpoint(design.id, relation.source_scope, relation.source_entity_id);
      const target = relationEndpoint(design.id, relation.target_scope, relation.target_entity_id);
      if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
      pushEdge(elements, designEdgeId(design.id, index), source, target, relation.relation_type, {
        scope: 'saved',
        designId: design.id,
        confidence: relation.confidence,
        evidence: relation.evidence,
      });
    }
  }

  if (preview) {
    const previewId = 'preview';
    for (const entity of preview.entities) {
      if (entity.reuse_existing_id) continue;
      const id = plannedNodeId(previewId, entity.entity_id);
      elements.push({
        group: 'nodes',
        data: {
          id,
          entity_id: entity.entity_id,
          label: sourceAwareNodeLabel(entity.label, entity.type, entity.properties),
          type: entity.type,
          scope: 'preview',
          color: entityColor(entity.type),
          shapeVal: entityShape(entity.type),
          nodeSize: nodeSize(entity.type),
          fontSize: nodeFontSize(entity.type),
          borderW: nodeBorderWidth(entity.type),
          evidence: entity.evidence,
        },
      });
      nodeIds.add(id);
    }

    for (let index = 0; index < preview.relations.length; index += 1) {
      const relation = preview.relations[index];
      const source =
        relation.source_scope === 'planned'
          ? plannedNodeId(previewId, relation.source_entity_id)
          : relation.source_entity_id;
      const target =
        relation.target_scope === 'planned'
          ? plannedNodeId(previewId, relation.target_entity_id)
          : relation.target_entity_id;
      if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
      pushEdge(elements, previewEdgeId(index), source, target, relation.relation_type, {
        scope: 'preview',
        confidence: relation.confidence,
        evidence: relation.evidence,
      });
    }
  }

  applyImportanceSizing(elements);
  return elements;
}

/**
 * 중요도를 노드 **지름**에 반영한다(`nodeImportance.ts` 가 규칙을 갖는다).
 *
 * **기존 KG 만 가지고 계산한다** — 설계·미리보기로 덧그린 노드(`scope` 가 `saved`/`preview`)는
 * 제안일 뿐인데, 그걸 정규화에 넣으면 분석을 돌릴 때마다 **원래 그래프의 크기가 출렁인다**.
 * 덧그린 노드 자신은 기본 크기를 그대로 쓴다.
 *
 * 요소를 만들 때 한 번 굽는다. 필터로 노드를 숨겨도 크기가 변하지 않는 것이 맞다 —
 * 필터를 만질 때마다 크기가 움직이면 어지럽다.
 */
function applyImportanceSizing(elements: cytoscape.ElementDefinition[]) {
  const existing = (def: cytoscape.ElementDefinition) => {
    const scope = String(def.data?.scope ?? '');
    return scope === 'existing' || scope === 'center';
  };

  const nodes: ImportanceNode[] = [];
  for (const def of elements) {
    if (def.group !== 'nodes' || !existing(def)) continue;
    nodes.push({ id: String(def.data?.id ?? ''), type: String(def.data?.type ?? '') });
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges: ImportanceEdge[] = [];
  for (const def of elements) {
    if (def.group !== 'edges') continue;
    const source = String(def.data?.source ?? '');
    const target = String(def.data?.target ?? '');
    if (!ids.has(source) || !ids.has(target)) continue;
    edges.push({ source, target });
  }

  const scale = computeImportanceScale(nodes, edges);
  if (!scale.size) return;

  for (const def of elements) {
    if (def.group !== 'nodes') continue;
    const k = scale.get(String(def.data?.id ?? ''));
    if (!k || !def.data) continue;
    def.data.nodeSize = Math.round(Number(def.data.nodeSize ?? 46) * k);
  }
}
