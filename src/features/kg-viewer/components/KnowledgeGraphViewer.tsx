import React, { useRef, useEffect, useCallback, useState } from 'react';
import cytoscape, { type Core, type ElementDefinition, type StylesheetStyle } from 'cytoscape';
import { cn } from '@/lib/utils';
import type { KgEntity, KgJson } from '@/services/studentKgService';

// ─── Entity type → color mapping (스킬 출력의 영문 타입 기준) ───
const ENTITY_COLORS: Record<string, string> = {
  Competency: '#059669',   // emerald — 역량
  Activity: '#4F46E5',     // indigo — 활동
  Achievement: '#7C3AED',  // violet — 수상/성취
  Attitude: '#D97706',     // amber — 인성/태도
  Interest: '#DC2626',     // red — 진로/관심분야
  Concept: '#0891B2',      // cyan — 교과개념
  Book: '#CA8A04',         // yellow — 독서
  Person: '#6366F1',       // indigo-light — 인물
  Role: '#2563EB',         // blue — 역할
  Thread: '#DB2777',       // pink — 탐구 스레드
  Student: '#1E293B',      // slate-800 — 학생 (중심 노드)
};

// ─── Entity type → 한글 레이블 (범례 표시용) ───
const TYPE_LABELS: Record<string, string> = {
  Competency: '역량',
  Activity: '활동',
  Achievement: '성취',
  Attitude: '태도',
  Interest: '관심분야',
  Concept: '교과개념',
  Book: '독서',
  Person: '인물',
  Role: '역할',
  Thread: '탐구스레드',
  Student: '학생',
};

const DEFAULT_NODE_COLOR = '#6B7280'; // gray-500
const EDGE_COLOR = '#94A3B8';         // slate-400
const SELECTED_COLOR = '#F59E0B';     // amber-500
const GRAPH_WHEEL_SENSITIVITY = 1.15;
const ZOOM_STEP = 2;

function truncateSourceLabel(value: string, maxLength = 24): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function formatEntitySource(source: { category?: string; subject?: string; grade?: number; semester?: number | null }): string {
  const period = [
    source.grade ? `${source.grade}학년` : '',
    source.semester ? `${source.semester}학기` : '',
  ].filter(Boolean).join(' ');
  const subject = source.subject || source.category || '';
  return [period, subject].filter(Boolean).join(' · ');
}

function entityDisplayLabel(entity: KgJson['entities'][number]): string {
  if (entity.type !== 'Activity' && entity.type !== 'Book') return entity.name;

  const sourceLabels = (entity.sources ?? []).map(formatEntitySource).filter(Boolean);
  const sourceLabel =
    sourceLabels.length > 0
      ? truncateSourceLabel(sourceLabels.length > 1 ? `${sourceLabels[0]} 외 ${sourceLabels.length - 1}` : sourceLabels[0])
      : '출처 미상';

  return `${entity.name}\n출처: ${sourceLabel}`;
}

// ─── Cytoscape stylesheet ───
const cytoscapeStyles: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'background-color': 'data(color)',
      color: '#FFFFFF',
      'text-outline-color': 'data(color)',
      'text-outline-width': 2,
      'font-size': 11,
      width: 'data(size)',
      height: 'data(size)',
      'border-width': 0,
      'text-wrap': 'ellipsis',
      'text-max-width': '80px',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'border-color': SELECTED_COLOR,
      'border-opacity': 1,
    },
  },
  {
    selector: 'edge',
    style: {
      label: 'data(label)',
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': EDGE_COLOR,
      'line-color': EDGE_COLOR,
      width: 1.5,
      'font-size': 9,
      color: '#64748B',
      'text-rotation': 'autorotate',
      'text-background-color': '#FFFFFF',
      'text-background-opacity': 0.8,
      'text-background-padding': '2px',
      opacity: 0.7,
    },
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': SELECTED_COLOR,
      'target-arrow-color': SELECTED_COLOR,
      width: 2.5,
      opacity: 1,
    },
  },
];

// ─── Props ───
export interface KnowledgeGraphViewerProps {
  /** The KG JSON data to visualize */
  data: KgJson;
  /** Optional CSS class for the container */
  className?: string;
  /** Container height (default: 500px) */
  height?: number | string;
  /** Cytoscape layout name (default: 'cose') */
  layout?: string;
  /** Called when a node is tapped/clicked */
  onNodeClick?: (nodeId: string, label: string, type?: string) => void;
  /**
   * 노드 색을 바깥에서 정한다. `undefined` 를 돌려주면 기본(엔티티 타입별 색)을 쓴다.
   *
   * 왜 필요한가 — 이 뷰어는 색을 **타입 하나로** 정하는데, 그래프에 따라 색으로 말해야 할 것이
   * 타입이 아닌 경우가 있다. 탐구 탐색은 노드가 활동·개념 둘뿐이고 정작 중요한 것은
   * **탐구 수준(L0~L4)** 이라 타입으로는 표현되지 않는다.
   */
  nodeColor?: (entity: KgEntity) => string | undefined;
  /**
   * 범례를 바깥에서 정한다. 주면 타입 자동 범례 대신 이것을 그린다 —
   * `nodeColor` 로 색을 바꿔 놓고 범례만 타입별로 두면 **색과 설명이 어긋난다**.
   */
  legend?: { color: string; label: string }[];
}

/**
 * Converts KgJson data (스킬 출력 포맷) to Cytoscape element definitions.
 * - entities use `name` (not `label`), English `type`
 * - triples use `subject/predicate/object` (not source/target/label)
 * - "Student" subject gets mapped to a dedicated student node
 */
function kgJsonToElements(data: KgJson, nodeColor?: (e: KgEntity) => string | undefined): ElementDefinition[] {
  const elements: ElementDefinition[] = [];

  // Build set of entity IDs for validation
  const entityIds = new Set(data.entities.map((e) => e.id));

  // Check if any triple references "Student" → create a student center node
  const hasStudentSubject = data.triples.some((t) => t.subject === 'Student');
  if (hasStudentSubject) {
    entityIds.add('student');
  }

  // Count degree from triples to determine node size
  const degreeMap = new Map<string, number>();
  for (const triple of data.triples) {
    const src = triple.subject === 'Student' ? 'student' : triple.subject;
    degreeMap.set(src, (degreeMap.get(src) ?? 0) + 1);
    degreeMap.set(triple.object, (degreeMap.get(triple.object) ?? 0) + 1);
  }

  // Student center node
  if (hasStudentSubject) {
    const degree = degreeMap.get('student') ?? 0;
    elements.push({
      data: {
        id: 'student',
        label: data.student_code,
        type: 'Student',
        color: ENTITY_COLORS.Student || DEFAULT_NODE_COLOR,
        size: Math.max(50, Math.min(80, 50 + degree * 2)),
      },
    });
  }

  // Entity nodes
  for (const entity of data.entities) {
    const degree = degreeMap.get(entity.id) ?? 0;
    const size = Math.max(30, Math.min(60, 30 + degree * 5));
    const color = nodeColor?.(entity) ?? ENTITY_COLORS[entity.type] ?? DEFAULT_NODE_COLOR;

    elements.push({
      data: {
        id: entity.id,
        label: entityDisplayLabel(entity),
        type: entity.type,
        color,
        size,
        confidence: entity.confidence,
      },
    });
  }

  // Edges from triples
  const seenEdges = new Set<string>();
  for (const triple of data.triples) {
    const source = triple.subject === 'Student' ? 'student' : triple.subject;
    const target = triple.object;

    // Skip references to non-existent entities
    if (!entityIds.has(source) || !entityIds.has(target)) continue;

    // Deduplicate
    const edgeKey = `${source}-${target}-${triple.predicate}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);

    elements.push({
      data: {
        id: edgeKey,
        source,
        target,
        label: triple.predicate,
      },
    });
  }

  return elements;
}

/**
 * KnowledgeGraphViewer — renders a KgJson object as an interactive
 * Cytoscape.js graph.
 *
 * Features:
 * - Automatic layout (COSE physics simulation)
 * - Color-coded entity types
 * - Degree-based node sizing
 * - Edge labels on hover
 * - Zoom controls (fit, zoom-in, zoom-out)
 * - Node click callback
 */
export function KnowledgeGraphViewer({
  data,
  className,
  height = 500,
  layout = 'cose',
  onNodeClick,
  nodeColor,
  legend,
}: KnowledgeGraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [selectedNode, setSelectedNode] = useState<{
    label: string;
    type: string;
  } | null>(null);

  // Build elements from KG data
  const elements = React.useMemo(() => kgJsonToElements(data, nodeColor), [data]);

  // Initialize / update Cytoscape instance
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy existing instance on data change
    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: cytoscapeStyles,
      layout: {
        name: layout,
        animate: true,
        animationDuration: 500,
        randomize: false,
        // COSE-specific options for nice spacing
        ...(layout === 'cose'
          ? {
              idealEdgeLength: 100,
              nodeOverlap: 20,
              nodeRepulsion: () => 4500,
              edgeElasticity: () => 100,
              gravity: 0.25,
              numIter: 1000,
              coolingFactor: 0.95,
            }
          : {}),
      } as cytoscape.LayoutOptions,
      minZoom: 0.3,
      maxZoom: 3,
      wheelSensitivity: GRAPH_WHEEL_SENSITIVITY,
    });

    // Node click handler
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeId = node.id();
      const label = node.data('label');
      const type = node.data('type');
      setSelectedNode({ label, type });
      onNodeClick?.(nodeId, label, type);
    });

    // Click on background clears selection
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements, layout, onNodeClick]);

  // ─── Zoom controls ───
  const handleFit = useCallback(() => {
    cyRef.current?.fit(undefined, 40);
    cyRef.current?.center();
  }, []);

  const handleZoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (cy) {
      cy.zoom({ level: cy.zoom() * ZOOM_STEP, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (cy) {
      cy.zoom({ level: cy.zoom() / ZOOM_STEP, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    }
  }, []);

  // Empty state
  if (!data.entities.length && !data.triples.length) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground',
          className
        )}
        style={{ height }}
      >
        <p className="text-sm">표시할 지식 그래프 데이터가 없습니다.</p>
      </div>
    );
  }

  // Collect unique entity types for the legend
  const entityTypes = Array.from(
    new Set(data.entities.map((e) => e.type).filter(Boolean))
  );

  return (
    <div className={cn('relative rounded-lg border bg-background', className)}>
      {/* Graph canvas */}
      <div
        ref={containerRef}
        style={{ height, width: '100%' }}
        className="rounded-lg"
      />

      {/* Zoom controls - top right */}
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button
          onClick={handleZoomIn}
          className="flex h-8 w-8 items-center justify-center rounded-md border bg-background text-sm shadow-sm hover:bg-accent"
          title="확대"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="flex h-8 w-8 items-center justify-center rounded-md border bg-background text-sm shadow-sm hover:bg-accent"
          title="축소"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={handleFit}
          className="flex h-8 w-8 items-center justify-center rounded-md border bg-background text-sm shadow-sm hover:bg-accent"
          title="전체 보기"
          aria-label="Fit to screen"
        >
          ⊡
        </button>
      </div>

      {/* Legend - bottom left. `legend` 를 주면 그것을 쓴다(색을 바꿔 놓고 타입 범례를 두면 어긋난다) */}
      {(legend?.length ? legend : entityTypes.map((t) => ({
        color: ENTITY_COLORS[t] || DEFAULT_NODE_COLOR,
        label: TYPE_LABELS[t] || t,
      }))).length > 0 && (
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-2 rounded-md border bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur-sm">
          {(legend?.length ? legend : entityTypes.map((t) => ({
            color: ENTITY_COLORS[t] || DEFAULT_NODE_COLOR,
            label: TYPE_LABELS[t] || t,
          }))).map((it) => (
            <span key={it.label} className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: it.color }} />
              {it.label}
            </span>
          ))}
        </div>
      )}

      {/* Selected node info - bottom right */}
      {selectedNode && (
        <div className="absolute bottom-2 right-2 rounded-md border bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur-sm">
          <span className="font-medium">{selectedNode.label}</span>
          {selectedNode.type && selectedNode.type !== 'unknown' && (
            <span className="ml-2 text-muted-foreground">({selectedNode.type})</span>
          )}
        </div>
      )}
    </div>
  );
}

export default KnowledgeGraphViewer;
