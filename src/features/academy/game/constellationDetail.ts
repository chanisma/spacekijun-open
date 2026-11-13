import type { InquiryAnalysisResult, InquiryWorkspace, SavedInquiryDesign } from '@/features/inquiry-design/types';
import { ENTITY_TYPE_LABELS, kgEdgeId, relationLabelKo } from '@/features/inquiry-design/utils/inquiryGraph';
import { kgConfidence, kgEvidenceList, kgSourceLabel, kgSourceList } from '@/features/inquiry-design/utils/kgProperties';
import { resolveDesignedRelation } from '@/features/inquiry-design/utils/relationDetail';

/**
 * 망원경·연구대 지도에서 **고른 별 하나 또는 길 하나**의 기록 — 패널은 그리기만 한다.
 *
 * 제목·내용 두 칸으로 접는다(2026-10-02 사용자 요청). 종전 패널은 노드만 다루고 근거 문장을
 * 줄줄이 늘어놓았는데, 엣지를 눌러도 아무것도 뜨지 않았고 범례 위에 겹쳐 떴다.
 * 읽기는 전부 `kgProperties`·`relationDetail` 의 정규화 창구를 거친다 — 직접 키를 파면
 * 신 KG(§15)에서 조용히 빈 값이 된다.
 */
export type ConstellationFocus = { kind: 'node' | 'edge'; id: string };

export interface ConstellationDetail {
  kind: 'node' | 'edge';
  /** 패널 이름이자 머리글의 첫 낱말 — «별의 기록» / «별 사이의 길». */
  heading: string;
  /** 유형·출처·신뢰도처럼 제목 위에 작게 놓는 꼬리표. */
  kicker: string;
  title: string;
  /** 내용 — 근거 문장. 비어 있으면 안내 한 줄. */
  body: string[];
  /** 설계 엣지의 메모(왜 이 연결을 골랐는지) — 근거와 다른 정보라 따로 둔다. */
  note?: string;
}

const NODE_HEADING = '별의 기록';
const EDGE_HEADING = '별 사이의 길';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function endpointLabel(workspace: InquiryWorkspace, entityId: string): string {
  if (entityId === 'student') return workspace.student?.name ? `${workspace.student.name} 학생` : '학생';
  return workspace.kgEntities.find(e => e.entity_id === entityId)?.label ?? entityId;
}

export function buildConstellationDetail(
  workspace: InquiryWorkspace,
  focus: ConstellationFocus,
  options: { preview?: InquiryAnalysisResult | null; savedDesigns?: SavedInquiryDesign[] } = {},
): ConstellationDetail | null {
  if (focus.kind === 'node') {
    const entity = workspace.kgEntities.find(e => e.entity_id === focus.id);
    if (!entity) return null;
    // 출처는 앞의 둘만 — 꼬리표는 한 줄이어야 한다. 셋 이상이면 «외 N»으로 센다.
    const sources = kgSourceList(entity.properties).map(kgSourceLabel).filter(Boolean);
    const sourceText = sources.length > 2 ? `${sources.slice(0, 2).join(' · ')} 외 ${sources.length - 2}` : sources.join(' · ');
    const evidence = kgEvidenceList(entity.properties);
    return {
      kind: 'node',
      heading: NODE_HEADING,
      // `entityTypeLabel` 은 «Activity (활동)» 꼴이라 꼬리표에는 한글만 쓴다.
      kicker: [entity.type ? ENTITY_TYPE_LABELS[entity.type] ?? entity.type : '', sourceText].filter(Boolean).join(' · '),
      title: entity.label,
      body: evidence.length ? evidence : ['아직 적힌 기록이 없어요.'],
    };
  }

  const relation = workspace.kgRelations.find(r => r.id === focus.id || kgEdgeId(r.id) === focus.id);
  if (relation) {
    const confidence = kgConfidence(relation.properties);
    const evidence = kgEvidenceList(relation.properties);
    return {
      kind: 'edge',
      heading: EDGE_HEADING,
      kicker: [relationLabelKo(relation.relation_type), confidence !== undefined ? `신뢰도 ${confidence.toFixed(2)}` : ''].filter(Boolean).join(' · '),
      title: `${endpointLabel(workspace, relation.source_entity_id)} → ${endpointLabel(workspace, relation.target_entity_id)}`,
      body: evidence.length ? evidence : ['이 길에는 적힌 근거가 없어요.'],
    };
  }

  // 기존 KG 에 없는 길 = 설계(저장·미리보기)가 새로 그린 엣지. 근거·신뢰도·메모는 처음부터 있다.
  const designed = resolveDesignedRelation(focus.id, {
    savedDesigns: options.savedDesigns ?? workspace.savedDesigns,
    preview: options.preview ?? null,
    kgEntities: workspace.kgEntities,
  });
  if (!designed) return null;
  const note = text(designed.notes);
  return {
    kind: 'edge',
    heading: EDGE_HEADING,
    kicker: [relationLabelKo(designed.relationType), designed.originLabel, designed.confidence !== null ? `신뢰도 ${designed.confidence.toFixed(2)}` : ''].filter(Boolean).join(' · '),
    title: `${designed.source.label} → ${designed.target.label}`,
    body: designed.evidence ? [designed.evidence] : ['이 길에는 적힌 근거가 없어요.'],
    ...(note ? { note } : {}),
  };
}
