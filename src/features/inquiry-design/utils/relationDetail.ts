import type {
  InquiryAnalysisEntity,
  InquiryAnalysisRelation,
  InquiryAnalysisResult,
  KgEntityRow,
  SavedInquiryDesign,
} from '../types';
import { parseDesignedEdgeId } from './inquiryGraph';

/**
 * 설계(저장·미리보기)로 **새로 그린 엣지**의 세부사항을 되찾는다.
 *
 * 기존 KG 엣지는 `workspace.kgRelations` 한 곳에서 찾으면 되지만, 설계가 만든 관계는
 * 그 표에 없다(`student_inquiry_design_relations` · 아직 저장되지 않은 미리보기).
 * 종전에는 세부사항 패널이 KG 만 뒤져서, 설계 엣지를 눌러도 **아무 일도 일어나지 않았다**
 * — 근거·신뢰도·메모는 처음부터 만들어져 저장까지 되고 있었는데 화면에 닿을 길이 없었다.
 *
 * 순수 함수로 떼어 둔 이유: 끝점 라벨 해석이 **scope 마다 다른 표를 본다**(planned = 이
 * 설계가 만든 엔티티, existing = KG 엔티티). 이걸 화면 안에 두면 한쪽만 고쳐져도
 * 라벨이 id 로 보일 뿐 오류가 나지 않는다.
 */
export interface RelationEndpointLabel {
  label: string;
  type: string;
}

export interface DesignedRelationDetail {
  origin: 'saved' | 'preview';
  /** 어느 설계에서 나온 관계인가 — 저장된 설계는 제목, 미리보기는 고정 문구. */
  originLabel: string;
  relationType: string;
  source: RelationEndpointLabel;
  target: RelationEndpointLabel;
  /** 0~1. 값이 없거나 숫자가 아니면 null(패널이 칩을 아예 그리지 않는다). */
  confidence: number | null;
  evidence: string;
  /** `properties.notes` — 근거 문장과 **다른 정보**다(왜 이 연결을 골랐는지). */
  notes: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function confidenceOf(relation: InquiryAnalysisRelation): number | null {
  const numeric = Number(relation.confidence);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * 끝점 하나의 표시 이름. **planned 는 이 설계가 만든 엔티티 목록에서만** 찾는다 —
 * 같은 `entity_id` 문자열이 KG 에도 있을 수 있어 표를 섞으면 남의 라벨을 붙인다.
 * 기존 엔티티를 재사용한 planned 항목(`reuse_existing_id`)은 KG 라벨로 되돌린다.
 */
function endpointLabel(
  scope: 'existing' | 'planned',
  entityId: string,
  plannedEntities: InquiryAnalysisEntity[],
  existingEntities: Map<string, KgEntityRow>
): RelationEndpointLabel {
  if (scope === 'planned') {
    const planned = plannedEntities.find((entity) => entity.entity_id === entityId);
    if (planned) {
      const reused = planned.reuse_existing_id ? existingEntities.get(planned.reuse_existing_id) : undefined;
      return {
        label: reused?.label ?? planned.label ?? entityId,
        type: reused?.type ?? planned.type ?? 'Entity',
      };
    }
    return { label: entityId, type: 'Entity' };
  }

  const existing = existingEntities.get(entityId);
  return { label: existing?.label ?? entityId, type: existing?.type ?? 'Entity' };
}

function buildDetail(
  origin: 'saved' | 'preview',
  originLabel: string,
  relation: InquiryAnalysisRelation,
  plannedEntities: InquiryAnalysisEntity[],
  existingEntities: Map<string, KgEntityRow>
): DesignedRelationDetail {
  return {
    origin,
    originLabel,
    relationType: relation.relation_type,
    source: endpointLabel(relation.source_scope, relation.source_entity_id, plannedEntities, existingEntities),
    target: endpointLabel(relation.target_scope, relation.target_entity_id, plannedEntities, existingEntities),
    confidence: confidenceOf(relation),
    evidence: text(relation.evidence),
    notes: text(relation.properties?.notes),
  };
}

export function resolveDesignedRelation(
  edgeId: string,
  input: {
    savedDesigns: SavedInquiryDesign[];
    preview: InquiryAnalysisResult | null;
    kgEntities: KgEntityRow[];
  }
): DesignedRelationDetail | null {
  const ref = parseDesignedEdgeId(edgeId);
  if (!ref) return null;

  const existingEntities = new Map(input.kgEntities.map((entity) => [entity.entity_id, entity]));

  if (ref.origin === 'preview') {
    const relation = input.preview?.relations[ref.index];
    if (!relation) return null;
    return buildDetail('preview', '미리보기 설계', relation, input.preview?.entities ?? [], existingEntities);
  }

  const design = input.savedDesigns.find((candidate) => candidate.id === ref.designId);
  const relation = design?.relations[ref.index];
  if (!design || !relation) return null;
  return buildDetail('saved', design.title || '저장된 설계', relation, design.entities, existingEntities);
}
