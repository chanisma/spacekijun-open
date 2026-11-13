import type { KgJson } from '@/services/studentKgService';

/**
 * Cytoscape.js element data for the HTML template.
 * Converts KgJson (skill output) → { nodes, edges } format
 * expected by the visual.html template's __GRAPH_DATA__ placeholder.
 */

interface CyNodeData {
  id: string;
  label: string;
  type: string;
  confidence?: number;
  sources?: string;       // JSON.stringify of sources array
  evidence?: string;      // evidence joined by ' | '
  sourceCount?: number;
}

interface CyEdgeData {
  source: string;
  target: string;
  label: string;
  type: string;           // predicate name (used for color/style)
  confidence?: number;
  evidence?: string;
}

interface CyElement {
  data: CyNodeData | CyEdgeData;
}

interface GraphData {
  nodes: Array<{ data: CyNodeData }>;
  edges: Array<{ data: CyEdgeData }>;
}

/**
 * Transforms a KgJson (skill output format) into Cytoscape.js graph data
 * compatible with the visual.html template.
 *
 * @param data - The raw skill JSON
 * @param studentName - Student display name (for center node label)
 * @param studentInfo - e.g. "3-3-21" (grade-class-number)
 */
export function kgJsonToGraphData(
  data: KgJson,
  studentName?: string,
  studentInfo?: string
): GraphData {
  const nodes: Array<{ data: CyNodeData }> = [];
  const edges: Array<{ data: CyEdgeData }> = [];

  const entityIds = new Set(data.entities.map((e) => e.id));

  // Student center node
  const studentLabel = studentName
    ? `${studentName}${studentInfo ? `\n(${studentInfo})` : ''}`
    : data.student_code;

  nodes.push({
    data: {
      id: 'student',
      label: studentLabel,
      type: 'Student',
    },
  });
  entityIds.add('student');

  // Entity nodes
  for (const entity of data.entities) {
    nodes.push({
      data: {
        id: entity.id,
        label: entity.name,
        type: entity.type,
        confidence: entity.confidence,
        sources: JSON.stringify(entity.sources),
        evidence: entity.evidence?.join(' | ') ?? '',
        sourceCount: entity.sources?.length ?? 0,
      },
    });
  }

  // Edges from triples (deduplicated)
  const seenEdges = new Set<string>();
  for (const triple of data.triples) {
    const source = triple.subject === 'Student' ? 'student' : triple.subject;
    const target = triple.object;

    if (!entityIds.has(source) || !entityIds.has(target)) continue;

    const key = `${source}-${target}-${triple.predicate}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);

    edges.push({
      data: {
        source,
        target,
        label: triple.predicate,
        type: triple.predicate,
        confidence: triple.confidence,
        evidence: triple.evidence,
      },
    });
  }

  return { nodes, edges };
}
