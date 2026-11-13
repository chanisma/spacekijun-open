import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import cytoscape from 'cytoscape';
import type {
  CollectionReturnValue,
  Core,
  Css,
  ElementDefinition,
  LayoutOptions,
  StylesheetStyle,
} from 'cytoscape';
import fcose from 'cytoscape-fcose';
import {
  ChevronDown,
  ChevronUp,
  Filter,
  Loader2,
  Maximize2,
  RotateCcw,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import KgVersionPicker from './KgVersionPicker';
import {
  ENTITY_TYPE_LABELS,
  buildInquiryGraphElements,
  entityColor,
  entityTypeLabel,
  isV7Workspace,
  relationColor,
  relationLabelKo,
} from '../utils/inquiryGraph';
import { V7_EDGE_LEGEND } from '../utils/inquiryGraphV7';
import { classifyEdge, edgeForce, isSharedConcept, nodeRepulsionWeight } from '../utils/graphLayoutForces';
import { placeNewNodes } from '../utils/newNodePlacement';
import { SIZED_TYPES } from '../utils/nodeImportance';
import {
  loadGraphPositions,
  positionsStorageKey,
  saveGraphPositions,
} from '../utils/graphPositions';
import type { InquiryAnalysisResult, InquiryWorkspace, SavedInquiryDesign } from '../types';
import { buildStarShadows } from '../utils/starfield';
import '../styles/starfield.css';

cytoscape.use(fcose);

/**
 * 신뢰도 하한 기본값 (2026-09-12 사용자 지시로 0.7 → 0.5).
 * 0.5 는 슬라이더의 **최솟값**이므로 "기본은 거르지 않는다"는 뜻이다 —
 * 추출이 낮은 신뢰도로 낸 것도 일단 보여 주고, 걸러 볼지는 보는 사람이 정한다.
 */
const DEFAULT_MIN_CONFIDENCE = 0.5;

/**
 * 학생 허브 엣지 숨김의 기본값 = **켬** (2026-09-12 사용자 지시).
 * 라이브 실측으로 엣지의 52.6% 가 학생 허브라, 켜 두지 않으면 활동 사이의 연결이
 * 그 아래 묻힌다. 허브 자체는 노드로 남아 있으므로 구조는 잃지 않는다.
 */
const DEFAULT_HIDE_STUDENT_EDGES = true;

/**
 * 좌상단 세로 줄의 **공용 폭** (2026-09-12 사용자 지시).
 * 검색창과 선택 노드 목록이 위아래로 붙어 있어 폭이 다르면 줄이 어긋나 보인다.
 * 한 상수를 공유해 둘이 갈라질 수 없게 한다.
 */
const CHROME_COLUMN_WIDTH = 'w-[320px] max-w-[calc(100vw-2rem)]';
// Graph accent — the single primary accent, matching the Tailwind `brand`
// (indigo) token used across the React chrome. Cytoscape can't read Tailwind
// classes, so the hexes live here and stay in sync with the brand palette:
//   ACCENT      = brand-400 (#818cf8)  — selected node ring / edge highlight
//   ACCENT_SOFT = brand-300 (#a5b4fc)  — Student node border
const GRAPH_ACCENT = '#818cf8';
const GRAPH_ACCENT_SOFT = '#a5b4fc';
/** 아카데미 별자리의 강조색 — `game.module.css` 의 `--gold`(#e6c68e). 선택 고리·선택 엣지가 이 색을 쓴다. */
const CONSTELLATION_ACCENT = '#e6c68e';
/**
 * 캔버스 크롬(확대·검색·선택 목록·필터·범례)의 색은 **CSS 변수 한 벌**로만 정한다 (2026-10-02).
 *
 * 같은 캔버스를 탐구 설계(슬레이트·인디고)와 별빛 아카데미(자주·황금)가 함께 쓴다. 종전엔
 * 클래스에 `slate-900`·`brand-400` 이 박혀 있어 아카데미 안에서만 지도가 다른 앱처럼 보였고,
 * 아카데미 쪽 CSS 가 선택자로 덮어쓰려다 검색창 폭·패딩까지 함께 깨뜨렸다. 지금은 JSX 가
 * `var(--kg-*)` 만 쓰고 값은 이 표가 모드별로 준다 — 색을 바꾸려면 여기 한 줄, 다른 화면이
 * 같은 캔버스를 쓰려면 행 하나를 더한다. 포털로 나가는 요소(버전 목록)는 변수가 닿지 않아
 * `kgVersionPickerContentClass` 로 색을 직접 받는다.
 */
const CHROME_THEMES = {
  inquiry: {
    '--kg-sky': 'radial-gradient(ellipse at bottom, #1a1a2e 0%, #0a0a12 100%)',
    '--kg-surface': '#0f172ae6', '--kg-surface-strong': '#0f172af2',
    '--kg-border': '#334155', '--kg-divider': '#1e293b',
    '--kg-text': '#e2e8f0', '--kg-text-strong': '#f1f5f9', '--kg-muted': '#94a3b8', '--kg-faint': '#64748b',
    '--kg-hover': '#1e293b', '--kg-accent': GRAPH_ACCENT, '--kg-accent-strong': '#6366f1',
    '--kg-active-bg': '#4f46e5', '--kg-active-border': '#6366f1', '--kg-active-text': '#ffffff', '--kg-active-muted': '#e0e7ff',
    '--kg-toggle-bg': '#164e6399', '--kg-toggle-text': '#67e8f9',
  },
  constellation: {
    '--kg-sky': 'radial-gradient(ellipse at bottom, #2a2040 0%, #110d1c 100%)',
    '--kg-surface': '#231b32e6', '--kg-surface-strong': '#231b32f7',
    '--kg-border': '#d4b27880', '--kg-divider': '#d4b27833',
    '--kg-text': '#efdfc0', '--kg-text-strong': '#f8ecd4', '--kg-muted': '#c2ad8f', '--kg-faint': '#ad9a80',
    '--kg-hover': '#34284a', '--kg-accent': CONSTELLATION_ACCENT, '--kg-accent-strong': '#dab576',
    '--kg-active-bg': '#dab576', '--kg-active-border': CONSTELLATION_ACCENT, '--kg-active-text': '#2a1d2b', '--kg-active-muted': '#5a4324',
    '--kg-toggle-bg': '#dab57633', '--kg-toggle-text': '#f1d7a3',
  },
} as const;
export type GraphChromeTheme = keyof typeof CHROME_THEMES;
/** 포털 밖(버전 목록)용 — 변수가 닿지 않으므로 색을 직접. */
const VERSION_PICKER_CONTENT_CLASS: Record<GraphChromeTheme, string | undefined> = {
  inquiry: undefined,
  constellation: 'border-[#d4b27880] bg-[#231b32] text-[#efdfc0]',
};
/**
 * 확대·축소 **한 걸음**. 좌상단 버튼과 마우스 휠이 이 상수 하나를 공유한다
 * (2026-09-12 사용자 지시 — 휠 한 번이 버튼 한 번과 같은 폭으로 움직여야 한다).
 * 종전엔 버튼은 1.4배, 휠은 cytoscape 내장 로직(`wheelSensitivity`)이라 폭이 서로 달랐고
 * 그 폭이 브라우저·입력기기의 `deltaY` 에 따라 또 달라졌다.
 */
const ZOOM_STEP = 1.4;
const ZOOM_MIN = 0.18;
const ZOOM_MAX = 3.2;
/**
 * 휠 **한 번**의 기준. "한 번"은 이벤트 한 개가 아니다 — 마우스는 한 칸에 이벤트 하나지만
 * 트랙패드는 같은 동작에 수십 개를 쏟아낸다. 그래서 델타를 **칸 수로 정규화해 누적**하고
 * 한 칸이 찰 때마다 한 걸음 움직인다.
 *
 * 브라우저마다 단위가 다르다: Chrome 은 픽셀로 한 칸 ≈ 100, Firefox 는 줄 단위로 한 칸 = 3줄.
 * `deltaMode` 를 보지 않고 픽셀로만 재면 Firefox 에서 한 칸이 반 걸음이 된다.
 */
const WHEEL_PIXELS_PER_STEP = 100;
const WHEEL_LINES_PER_STEP = 3;

/** 휠 델타를 **칸 수**로. 부호는 그대로(양수 = 아래로 = 축소). */
function wheelSteps(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY / WHEEL_LINES_PER_STEP; // DOM_DELTA_LINE
  if (event.deltaMode === 2) return event.deltaY;                        // DOM_DELTA_PAGE
  return event.deltaY / WHEEL_PIXELS_PER_STEP;                           // DOM_DELTA_PIXEL
}
// Below this zoom level edge labels are hidden (they overlap into noise and
// text rendering dominates frame cost on dense graphs). Hovering an edge or
// selecting it always forces its label visible.
const EDGE_LABEL_MIN_ZOOM = 0.75;
// Hover focus (neighborhood highlight) waits this long so sweeping the cursor
// across the canvas doesn't strobe the dim state.
const FOCUS_HOVER_DELAY_MS = 130;

type LayoutPreset = 'free' | 'concentric';

// Concentric preset: Student at the center, narrative containers (Thread) and
// concrete records (Activity/Book) on inner rings, abstract traits outside.
const CONCENTRIC_LEVELS: Record<string, number> = {
  Student: 7,
  Thread: 6,
  Activity: 5,
  Book: 4,
  Achievement: 4,
  Competency: 3,
  Role: 3,
  Attitude: 2,
  Interest: 2,
  Concept: 1,
  Person: 1,
};

interface FilterOption {
  value: string;
  label: string;
  count: number;
  color: string;
}

function elementData(element: ElementDefinition): Record<string, unknown> {
  return (element.data ?? {}) as Record<string, unknown>;
}

function sortKo(a: FilterOption, b: FilterOption) {
  return a.label.localeCompare(b.label, 'ko');
}

function collectNodeTypeOptions(elements: ElementDefinition[]): FilterOption[] {
  const counts = new Map<string, number>();

  for (const element of elements) {
    if (element.group !== 'nodes') continue;
    const type = String(elementData(element).type ?? '');
    if (!type) continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return Array.from(counts, ([value, count]) => ({
    value,
    label: entityTypeLabel(value),
    count,
    color: entityColor(value),
  })).sort(sortKo);
}

function collectRelationOptions(elements: ElementDefinition[]): FilterOption[] {
  const counts = new Map<string, number>();

  for (const element of elements) {
    if (element.group !== 'edges') continue;
    const type = String(elementData(element).type ?? '');
    if (!type) continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return Array.from(counts, ([value, count]) => ({
    value,
    label: relationLabelKo(value),
    count,
    color: relationColor(value),
  })).sort(sortKo);
}

const graphStyles: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'background-color': 'data(color)',
      shape: 'data(shapeVal)',
      color: '#f8fafc',
      'font-size': 'data(fontSize)',
      'text-wrap': 'wrap',
      'text-max-width': 122,
      'text-valign': 'center',
      'text-halign': 'center',
      'text-outline-color': 'data(color)',
      'text-outline-width': 2,
      width: 'data(nodeSize)',
      height: 'data(nodeSize)',
      'border-width': 'data(borderW)',
      'border-color': '#475569',
      'overlay-padding': 5,
      // data() mappers for enum-typed props (shape) aren't representable in
      // the Css typings, hence the unknown-cast on this block.
    } as unknown as Css.Node,
  },
  {
    selector: 'node[type = "Student"]',
    style: {
      'border-color': GRAPH_ACCENT_SOFT,
      'font-weight': 700,
      'z-index': 20,
    },
  },
  {
    selector: 'node[type = "Thread"]',
    style: {
      'border-color': '#818cf8',
      'border-style': 'double',
    },
  },
  {
    selector: 'node[scope = "saved"]',
    style: {
      'border-color': '#f8fafc',
      'border-style': 'double',
      'border-width': 4,
      'background-blacken': -0.08,
    },
  },
  {
    selector: 'node[scope = "preview"]',
    style: {
      'border-color': '#f59e0b',
      'border-style': 'dashed',
      'border-width': 3,
      'background-blacken': -0.12,
      // 새 별은 항상 위에 그리고 호박색 후광을 두른다 — 자리가 근처 라벨과 섞여도
      // "이게 새 것" 이 읽히게(2026-09-14). z-index 는 노드끼리만 비교된다.
      'z-index': 10,
      'underlay-color': '#f59e0b',
      'underlay-padding': 9,
      'underlay-opacity': 0.28,
      'underlay-shape': 'ellipse',
    },
  },
  {
    // Real glow ring via underlay-* (supported cytoscape properties). The old
    // implementation used CSS `box-shadow`, which cytoscape silently ignores.
    selector: 'node[selected = "true"]',
    style: {
      'border-color': GRAPH_ACCENT,
      'border-width': 5,
      'underlay-color': GRAPH_ACCENT,
      'underlay-padding': 7,
      'underlay-opacity': 0.28,
      'z-index': 999,
    } as unknown as Css.Node,
  },
  {
    selector: 'node.search-hit',
    style: {
      'underlay-color': '#fbbf24',
      'underlay-padding': 10,
      'underlay-opacity': 0.45,
      'z-index': 998,
    } as unknown as Css.Node,
  },
  {
    selector: 'edge',
    style: {
      width: 'data(edgeWidth)',
      'line-color': 'data(edgeColor)',
      'line-style': 'data(lineStyle)',
      'target-arrow-color': 'data(edgeColor)',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.8,
      // 층마다 무게가 다르다(§15) — 신 KG는 활동↔활동을 진하게, 개념선을 옅게 준다.
      // 구 KG는 모든 엣지가 0.68을 싣고 오므로 이전과 같다.
      opacity: 'data(edgeOpacity)',
      'curve-style': 'bezier',
      label: 'data(labelKo)',
      'font-size': 8,
      color: '#cbd5e1',
      'text-rotation': 'autorotate',
      'text-background-color': '#0f172a',
      'text-background-opacity': 0.82,
      'text-background-padding': '2px',
      // data(lineStyle) mapper isn't representable in the Css typings.
    } as unknown as Css.Edge,
  },
  {
    selector: 'edge[scope = "saved"]',
    style: {
      width: 3,
      opacity: 0.9,
    },
  },
  {
    selector: 'edge[scope = "preview"]',
    style: {
      width: 3,
      'line-style': 'dashed',
      opacity: 0.95,
    },
  },
  {
    // Zoomed-out declutter: labels off below EDGE_LABEL_MIN_ZOOM. Later rules
    // (hovered / selected) re-force visibility per edge.
    selector: 'edge.edge-label-hidden',
    style: {
      'text-opacity': 0,
      'text-background-opacity': 0,
    },
  },
  {
    selector: 'edge.hovered',
    style: {
      opacity: 1,
      'text-opacity': 1,
      'text-background-opacity': 0.82,
      'z-index': 900,
    },
  },
  {
    selector: 'edge[selected = "true"]',
    style: {
      width: 4,
      'line-color': GRAPH_ACCENT,
      'target-arrow-color': GRAPH_ACCENT,
      opacity: 1,
      'text-opacity': 1,
      'text-background-opacity': 0.82,
      'z-index': 999,
    },
  },
  {
    // 개념은 기본 숨김. 노드·엣지를 함께 감춘다 — 엣지만 숨기면 개념 노드가 전부
    // 고아가 되어(00-00239 기준 53개) 고립 영역이 개념으로 가득 찬다.
    selector: '.concept-hidden',
    style: { display: 'none' },
  },
  {
    // 미리보기가 떠 있는 동안 그 이웃 밖은 한 단계 물린다(`applyPreviewEmphasis`).
    // hover 의 dimmed 보다 앞에 두어 두 상태가 겹치면 hover 가 이긴다.
    selector: 'node.preview-backdrop',
    style: { opacity: 0.35, 'text-opacity': 0.35 },
  },
  {
    selector: 'edge.preview-backdrop',
    style: { opacity: 0.2, 'text-opacity': 0 },
  },
  {
    // Hover focus mode: everything outside the hovered node's neighborhood
    // fades back. Placed after highlight rules on purpose — while focusing,
    // out-of-neighborhood selected elements dim too, keeping focus honest.
    selector: 'node.dimmed',
    style: {
      opacity: 0.15,
      'text-opacity': 0,
    },
  },
  {
    selector: 'edge.dimmed',
    style: {
      opacity: 0.08,
      'text-opacity': 0,
    },
  },
  {
    selector: 'node.filtered-out, edge.filtered-out',
    style: {
      display: 'none',
    },
  },
];

function applySelectionData(cy: Core, selectedNodeIds: Set<string>, selectedEdgeIds: Set<string>) {
  cy.batch(() => {
    cy.nodes('[scope = "existing"]').forEach((node) => {
      node.data('selected', selectedNodeIds.has(node.id()) ? 'true' : 'false');
    });
    cy.edges('[scope = "existing"]').forEach((edge) => {
      edge.data('selected', selectedEdgeIds.has(edge.id()) ? 'true' : 'false');
    });
  });
}

function applyEdgeLabelVisibility(cy: Core) {
  const hide = cy.zoom() < EDGE_LABEL_MIN_ZOOM;
  cy.batch(() => {
    cy.edges().toggleClass('edge-label-hidden', hide);
  });
}

/**
 * 자리 없는 노드를 빈자리에 놓는다 — 규칙은 `utils/newNodePlacement.ts` 가 갖는다
 * (앵커 하나·바깥 방향·실측 상자 충돌 판정). 종전의 "이웃 무게중심 + 고정 반지름" 은
 * 그래프 한가운데(가장 빽빽한 곳)에 새 별을 겹쳐 놓았다(2026-09-14).
 * `knownIds` 는 놓이는 대로 갱신되어 새 노드끼리(planned→planned)도 서로 앵커가 된다.
 */
function seedNewNodePositions(cy: Core, newNodeIds: string[], knownIds: Set<string>, spacing: number) {
  const occupied = new Map<string, { x: number; y: number }>();
  cy.nodes().forEach((node) => {
    if (knownIds.has(node.id()) && !node.hasClass('concept-hidden') && !node.hasClass('filtered-out')) {
      occupied.set(node.id(), { ...node.position() });
    }
  });
  const student = cy.getElementById('student');
  const fallback = student.nonempty() && knownIds.has('student') ? { ...student.position() } : undefined;
  const { positions } = placeNewNodes({
    newIds: newNodeIds.filter((id) => cy.getElementById(id).nonempty()),
    neighborsOf: (id) => cy.getElementById(id).neighborhood('node').map((n) => n.id()),
    sizeOf: (id) => {
      const bb = cy.getElementById(id).boundingBox({ includeLabels: true, includeOverlays: false });
      return { w: bb.w, h: bb.h };
    },
    occupied,
    fallback,
    spacing,
  });
  positions.forEach((p, id) => {
    cy.getElementById(id).position(p);
    knownIds.add(id);
  });
}

/**
 * 미리보기 강조 — 미리보기 노드가 있는 동안 그 1-hop 이웃 밖의 모든 요소를 한 단계 물린다.
 * 배치를 고쳐도 라벨은 근처 라벨과 섞일 수 있어, **어느 쪽이 새 것인지**를 자리와 별개로
 * 색으로도 말한다. hover 의 `dimmed`(0.15) 보다 옅게(0.35) — 지도는 계속 읽혀야 한다.
 */
function applyPreviewEmphasis(cy: Core) {
  const preview = cy.nodes('[scope = "preview"]');
  cy.batch(() => {
    if (preview.empty()) {
      cy.elements().removeClass('preview-backdrop');
      return;
    }
    const keep = preview.closedNeighborhood();
    cy.elements().addClass('preview-backdrop');
    keep.removeClass('preview-backdrop');
  });
}

// Fade newly added elements from transparent to their stylesheet opacity, then
// release the bypass so the stylesheet resumes control (edges have non-1
// resting opacities per scope).
function fadeInAdded(added: CollectionReturnValue) {
  added.forEach((ele) => {
    const target = Number(ele.style('opacity'));
    const resolved = Number.isFinite(target) && target > 0 ? target : 1;
    ele.style('opacity', 0);
    ele.animate(
      { style: { opacity: resolved } },
      { duration: 420, easing: 'ease-out', complete: () => ele.removeStyle('opacity') }
    );
  });
}

// Gently bring the camera to the newly added nodes plus their anchors, so an
// analysis preview "sprouting" off existing records is noticed without a jump.
function focusOnAdded(cy: Core, added: CollectionReturnValue) {
  const nodes = added.nodes();
  if (nodes.length === 0) return;
  const focus = nodes.union(nodes.neighborhood('node'));
  cy.animate({
    fit: { eles: focus, padding: 130 },
    duration: 480,
    easing: 'ease-in-out-cubic',
  });
}

/**
 * 고립 노드를 본체 밖 전용 영역에 배치한다 (§11에서 검증한 방식).
 *
 * force 레이아웃은 **엣지로만** 위치를 정하므로 엣지가 없는 노드를 놓을 근거가 없다.
 * 그대로 두면 서로 밀어내다 가운데로 몰리고 본체까지 밀어낸다. 신 KG의 고립 활동은
 * 25~28개라 그 양이 화면을 지배한다(§13).
 *
 * 배치 근거는 데이터가 준다 — **열 = 학년**(시간 축), 열 안은 라벨 순.
 * 학년이 없으면 마지막 열로 보낸다.
 */
function placeIsolatedNodes(cy: Core) {
  const isolated = visuallyIsolated(cy);
  if (isolated.length === 0) return;

  const core = cy.nodes().not(isolated).filter((n) => !n.hasClass('concept-hidden'));
  const box = core.nonempty() ? core.boundingBox() : { x1: 0, y1: 0, x2: 0, y2: 0 };

  const groups = new Map<string, ReturnType<typeof cy.nodes>[number][]>();
  isolated.forEach((n) => {
    const g = n.data('grade');
    const key = g === null || g === undefined || g === '' ? '기타' : String(g);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  });

  // 간격은 고정값이 아니라 **실측 크기**로 잡는다. 라벨이 노드 밖으로 번지므로
  // `nodeSize`만 믿으면 겹친다.
  const GAP = 16;
  let colW = 0;
  isolated.forEach((n) => { colW = Math.max(colW, n.outerWidth()); });
  const coreH = Math.max(420, box.y2 - box.y1);

  let x = box.x2 + 180;
  [...groups.keys()]
    .sort((a, b) => (a === '기타' ? 1 : b === '기타' ? -1 : Number(a) - Number(b)))
    .forEach((key) => {
      const members = groups.get(key)!;
      let y = box.y1;
      members.forEach((n) => {
        const h = n.outerHeight();
        if (y + h > box.y1 + coreH) { y = box.y1; x += colW + 40; }
        n.position({ x: x + n.outerWidth() / 2, y: y + h / 2 });
        y += h + GAP;
      });
      x += colW + 70;
    });
}

/** 화면상 외톨이 — 숨겨진(개념 토글 끔) 엣지는 연결로 치지 않는다. */
function visuallyIsolated(cy: Core) {
  return cy.nodes().filter(
    (n) =>
      !n.hasClass('concept-hidden') &&
      n.connectedEdges().filter((e) => !e.hasClass('concept-hidden')).length === 0,
  );
}

/**
 * 노드 간격 배수. 1.0 이 종전 값이다.
 *
 * **왜 슬라이더인가**: 적절한 간격은 노드 수에 따라 다른데(활동 11개인 1학년과 196개인 3학년이
 * 같은 값일 리가 없다), 무엇이 적절한지는 **직접 움직여 봐야 안다**. 그래서 먼저 손잡이를 주고,
 * 그 값을 보고 나서 노드 수에 따른 기본값을 정한다 — 기본값을 먼저 지어내면 근거가 없다.
 */
export const SPACING_MIN = 0.5;
export const SPACING_MAX = 3;
export const SPACING_DEFAULT = 1;

/**
 * 노드 수에 따른 **기본** 간격 (2026-09-12, 슬라이더를 직접 써 본 뒤 사용자 승인).
 *
 * 왜 필요한가 — 라이브 실측으로 한 그래프의 노드 수가 **25배** 벌어진다:
 * 1학년(26학번) 중앙값 8·최대 30 · 2학년 파일럿 93 · 3학년 파일럿 196.
 * 고정 1.0 은 8개짜리에 맞춘 값이라 196개에서는 덩어리가 된다.
 *
 * 왜 로그인가 — fcose 의 반발력은 거리 제곱에 반비례하고(`layout-base` 의 `calcRepulsionForce`)
 * 노드가 N개면 서로 미는 쌍이 N² 개다. 면적이 N 에 비례해 자라야 밀도가 유지되므로
 * **선형 지름 ∝ √N**, 즉 배수는 N 에 로그로 붙는 것이 맞다. 선형으로 올리면 큰 그래프가 발산한다.
 *
 * 30개 이하는 **손대지 않는다**(1.0) — 작은 그래프는 애초에 밀집이 문제가 아니고,
 * 오히려 벌리면 서로 상관없어 보인다. 상한 1.9 는 슬라이더 최대(3.0)보다 한참 아래다 —
 * 자동은 출발점만 정하고 더 벌릴지는 사람이 정한다.
 */
export function adaptiveSpacing(nodeCount: number): number {
  if (!Number.isFinite(nodeCount) || nodeCount <= 30) return SPACING_DEFAULT;
  const k = SPACING_DEFAULT + 0.3 * Math.log2(nodeCount / 30);
  // 슬라이더 눈금이 0.1 이라 거기에 맞춘다 — 자동값이 눈금 사이에 있으면
  // 손잡이를 한 칸만 움직여도 값이 튀어 "내가 뭘 했는지"를 알 수 없다.
  return Math.min(1.9, Math.round(k * 10) / 10);
}

/** fcose 가 힘 함수에 넘겨 주는 최소 형태. cytoscape 타입을 끌어오지 않고 필요한 것만 받는다. */
type CyNodeLike = { data: (key: string) => unknown; neighborhood: (selector: string) => { length: number } };
type CyEdgeLike = { source: () => CyNodeLike; target: () => CyNodeLike };

function buildLayout(
  cy: Core,
  preset: LayoutPreset,
  opts: { randomize: boolean; animate: boolean; v7?: boolean; spacing?: number; fit?: boolean },
) {
  const k = opts.spacing ?? SPACING_DEFAULT;
  // 고립 노드를 force에서 뺀다 — 놓을 근거가 없어 서로 밀어내다 본체까지 밀어낸다.
  // 배치는 `placeIsolatedNodes`가 레이아웃 종료 후 데이터 축(학년)으로 한다.
  const eles = opts.v7 ? cy.elements().not(visuallyIsolated(cy)) : cy.elements();
  const common = {
    eles,
    animate: opts.animate,
    animationDuration: 560,
    fit: opts.fit ?? true,
    padding: 72,
  };
  if (preset === 'concentric') {
    return cy.layout({
      name: 'concentric',
      concentric: (node: { data: (key: string) => unknown }) =>
        CONCENTRIC_LEVELS[String(node.data('type'))] ?? 1,
      levelWidth: () => 1,
      minNodeSpacing: Math.round(26 * k),
      startAngle: (Math.PI * 3) / 2,
      ...common,
    } as unknown as LayoutOptions);
  }
  // 타입별 힘 (2026-09-12). 스칼라를 함수로 바꾼다 — fcose 는 세 값을 모두
  // `optFn(opt, ele)` 로 풀어 주므로 함수면 요소마다, 숫자면 전부 같은 값이 된다.
  // 무엇을 어떤 근거로 갈랐는지는 `graphLayoutForces.ts` 가 갖는다(앱과 측정 스크립트의 단일 출처).
  const typeOf = (n: { data: (k: string) => unknown }) => n.data('type');
  // 개념↔활동 엣지는 그 개념이 활동 몇 개에 걸렸는지로 갈린다(`isSharedConcept` 참고).
  const forceOf = (e: CyEdgeLike) => {
    const s = e.source();
    const t = e.target();
    const concept = typeOf(s) === 'Concept' ? s : typeOf(t) === 'Concept' ? t : null;
    const sharedConcept = concept ? isSharedConcept(concept.neighborhood('node[type = "Activity"]').length) : false;
    return edgeForce(typeOf(s), typeOf(t), { sharedConcept });
  };
  return cy.layout({
    name: 'fcose',
    quality: 'default',
    randomize: opts.randomize,
    nodeDimensionsIncludeLabels: true,
    // 간격은 두 축을 함께 움직여야 한다 — 엣지 길이만 늘리면 연결된 것만 벌어지고
    // 고립 노드 덩어리는 그대로 뭉쳐 있다. 반발력도 같이 키운다(제곱이 아니라 선형으로
    // 올려야 값이 커질 때 레이아웃이 발산하지 않는다).
    idealEdgeLength: (e: CyEdgeLike) => Math.round(120 * k * forceOf(e).length),
    edgeElasticity: (e: CyEdgeLike) => forceOf(e).elasticity,
    nodeRepulsion: (n: CyNodeLike) => Math.round(8000 * k * nodeRepulsionWeight(typeOf(n))),
    ...common,
  } as unknown as LayoutOptions);
}

interface InquiryGraphCanvasProps {
  constellation?: boolean;
  workspace: InquiryWorkspace;
  savedDesigns: SavedInquiryDesign[];
  preview?: InquiryAnalysisResult | null;
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;
  onToggleNode: (entityId: string) => void;
  onToggleEdge: (edgeId: string) => void;
  /**
   * KG 버전 선택 — 페이지가 아니라 캔버스가 그린다.
   *
   * 그래프 통계(노드·엣지·신뢰도)를 이 선택기의 `i` 안에 접어 넣기로 했는데(사용자 지시),
   * 그 값들은 캔버스 안에만 있다. 선택기를 페이지에 두면 통계를 위로 끌어올려야 하고
   * 그러면 캔버스가 상태를 바깥에 알리는 경로가 하나 더 생긴다. 선택기를 내리는 쪽이 싸다.
   */
  kgVersionId: string | null;
  onKgVersionChange: (id: string | null) => void;
  /**
   * 바깥이 가리키는 노드 하나를 검색 적중처럼 비추고 그리로 카메라를 보낸다 (2026-10-03, 제1장 안내).
   * 검색창과 같은 표시(`search-hit`)를 쓰므로 학생은 «찾아진 별»을 이미 아는 모양으로 본다.
   */
  highlightNodeId?: string | null;
}

export function InquiryGraphCanvas({
  constellation = false,
  workspace,
  savedDesigns,
  preview,
  selectedNodeIds,
  selectedEdgeIds,
  onToggleNode,
  onToggleEdge,
  kgVersionId,
  onKgVersionChange,
  highlightNodeId = null,
}: InquiryGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const layoutRef = useRef<ReturnType<Core['layout']> | null>(null);
  const signatureRef = useRef('');
  const hoverTimerRef = useRef<number | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const zoomRafRef = useRef(false);
  const grabbingRef = useRef(false);

  // Latest props mirrored into refs so the mount-once cytoscape handlers never
  // go stale and the instance never needs recreating (recreation was the old
  // design's core flaw: every preview re-ran the whole layout).
  const onToggleNodeRef = useRef(onToggleNode);
  const onToggleEdgeRef = useRef(onToggleEdge);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const selectedEdgeIdsRef = useRef(selectedEdgeIds);
  onToggleNodeRef.current = onToggleNode;
  onToggleEdgeRef.current = onToggleEdge;
  selectedNodeIdsRef.current = selectedNodeIds;
  selectedEdgeIdsRef.current = selectedEdgeIds;

  const [filterOpen, setFilterOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  // 신 파이프라인 KG인가(§15). 엣지 층 범례처럼 신 KG에만 있는 표시를 가르는 기준.
  const isV7 = useMemo(() => isV7Workspace(workspace), [workspace]);
  // 개념 엣지 표시. **기본은 숨김** — 00-00239 기준 111개라 켜 두면 활동 간 연결(본체)을
  // 덮는다. 개념을 노드에서 뺀 이유(§10)가 엣지 형태로 되살아나는 것을 막는다.
  const [showConceptEdges, setShowConceptEdges] = useState(false);
  const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<string>>(new Set());
  const [hiddenRelationTypes, setHiddenRelationTypes] = useState<Set<string>>(new Set());
  const [minConfidence, setMinConfidence] = useState(DEFAULT_MIN_CONFIDENCE);
  /**
   * 학생 허브 엣지 숨김 (2026-09-12 사용자 요청).
   *
   * **관계 유형 필터로는 못 한다** — 학생 허브가 쓰는 술어(`DEMONSTRATED`·`READ`·`ACHIEVED`…)를
   * 활동→잎 엣지가 **그대로 다시 쓴다**(라이브 실측: DEMONSTRATED 가 학생 721 · 활동 721 로 정확히 같은 수).
   * 그 유형을 끄면 사람 층 연결까지 함께 사라진다. 그래서 별도 스위치이고,
   * 판정은 술어가 아니라 **끝점 타입**(`classifyEdge`)으로 한다.
   */
  const [hideStudentEdges, setHideStudentEdges] = useState(DEFAULT_HIDE_STUDENT_EDGES);
  /**
   * 학년 필터 (2026-09-12 사용자 요청) — **그 노드가 처음 나타난 학년** 기준.
   *
   * `data.grade` 는 `kgPrimaryGrade()` 가 출처 중 **가장 이른 학년**으로 정한 값이다
   * ("언제 처음 등장했는가"가 시간 축의 자연스러운 기준). 한 노드가 여러 학년에 걸쳐
   * 있어도 하나로 접히므로, 이 필터는 "3학년에 새로 생긴 것만" 같은 질문에 답한다.
   * 학년을 모르는 노드(출처에 학년이 없거나 학생 허브)는 `(학년 없음)` 으로 따로 둔다.
   */
  const [hiddenGrades, setHiddenGrades] = useState<Set<string>>(new Set());
  const [spacing, setSpacing] = useState(SPACING_DEFAULT);
  // `startLayout` 의 의존성에 spacing 을 넣으면 슬라이더를 움직일 때마다 그 콜백이 새로 만들어져
  // 이를 의존하는 effect 들이 줄줄이 다시 돈다(레이아웃이 두 번 돌고 카메라가 튄다). ref 로 읽는다.
  const spacingRef = useRef(SPACING_DEFAULT);
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>('free');
  const presetRef = useRef<LayoutPreset>('free');
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<string[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const elements = useMemo<ElementDefinition[]>(
    () =>
      buildInquiryGraphElements({
        workspace,
        savedDesigns,
        preview,
      }),
    [workspace, savedDesigns, preview]
  );

  /**
   * 적응형 기본 간격.
   *
   * **effect 가 아니라 렌더 중에 맞춘다** — `startLayout` 이 `spacingRef` 를 **동기로** 읽는데,
   * 학생을 바꾸면 아래 element-sync effect 가 그 자리에서 레이아웃을 시작한다.
   * effect 로 간격을 고치면 그 레이아웃은 **이전 학생의 간격**으로 돌고 240ms 뒤에 다시 도는
   * 이중 배치가 된다. React 가 공식적으로 권하는 "렌더 중 상태 조정" 패턴이라
   * 자식이 그려지기 전에 다시 렌더되므로 ref 가 항상 맞다.
   */
  const graphSignature = `${workspace.student?.id ?? 'unknown'}::${workspace.kgVersion?.id ?? 'no-kg'}`;
  const autoSpacing = useMemo(
    () => adaptiveSpacing(elements.reduce((n, def) => n + (def.group === 'nodes' ? 1 : 0), 0)),
    [elements]
  );
  // 빈 문자열로 시작해 **첫 렌더에서도** 자동값을 한 번 맞춘다
  // (`graphSignature` 로 초기화하면 큰 그래프를 처음 열 때만 1.0 으로 남는다).
  const [spacingSignature, setSpacingSignature] = useState('');
  // 슬라이더가 움직여서 생긴 변화만 재배치한다. 자동으로 맞춘 값은 element-sync 가 이미 그리므로
  // 이 표시가 없으면 학생을 바꿀 때마다 레이아웃이 두 번 돈다.
  const spacingFromSliderRef = useRef(false);
  if (spacingSignature !== graphSignature) {
    setSpacingSignature(graphSignature);
    setSpacing(autoSpacing);
    spacingFromSliderRef.current = false;
  }
  spacingRef.current = spacing;

  /**
   * 지금 고른 노드 목록 (2026-09-12 사용자 요청 — 검색 아래).
   *
   * 캔버스에서 고른 것이 **화면 밖으로 스크롤되면 무엇을 골랐는지 알 수 없다**.
   * 우측 패널이 목록을 갖고 있지만 패널을 접으면 함께 사라지고, 애초에 고르는 자리와
   * 확인하는 자리가 화면 양 끝으로 갈라져 있었다.
   *
   * `elements` 에서 만든다 — 선택 id 만으로는 라벨·색을 알 수 없고, 선택이 바뀔 때마다
   * cytoscape 를 조회하면 렌더 중에 그래프를 읽게 된다.
   */
  const selectedNodeList = useMemo(() => {
    if (selectedNodeIds.size === 0) return [] as Array<{ id: string; label: string; color: string; type: string }>;
    const out: Array<{ id: string; label: string; color: string; type: string }> = [];
    for (const def of elements) {
      if (def.group !== 'nodes') continue;
      const id = String(def.data?.id ?? '');
      if (!selectedNodeIds.has(id)) continue;
      out.push({
        id,
        // 라벨에는 출처가 줄바꿈으로 붙어 있다(`sourceAwareNodeLabel`). 한 줄만 쓴다.
        label: String(def.data?.label ?? id).split('\n')[0],
        color: String(def.data?.color ?? '#64748b'),
        type: String(def.data?.type ?? ''),
      });
    }
    return out;
  }, [elements, selectedNodeIds]);

  /** 이 그래프에 실제로 있는 학년만 낸다 — 없는 학년을 목록에 두면 끄고 켤 것이 없다. */
  const gradeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const def of elements) {
      if (def.group !== 'nodes') continue;
      // 학생 허브는 학년이 없다 — 특정 학년의 산물이 아니라 **전 학년을 잇는 중심**이다.
      // 세면 `학년 없음` 개수가 1씩 부풀고, 그 칸을 끄면 허브가 사라져 그래프가 흩어진다.
      if (String(def.data?.type ?? '') === 'Student') continue;
      const raw = def.data?.grade;
      const key = Number.isFinite(Number(raw)) && Number(raw) > 0 ? String(Number(raw)) : '';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      // 숫자 학년이 먼저(1→3), `(학년 없음)`은 맨 뒤.
      .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : Number(a[0]) - Number(b[0])))
      .map(([value, count]) => ({ value, label: value ? `${value}학년` : '학년 없음', count }));
  }, [elements]);

  const nodeTypeOptions = useMemo(() => collectNodeTypeOptions(elements), [elements]);
  // 크기 조정이 실제로 일어난 그래프인가. 데드존(노드 4개 미만·사실상 평평)에 걸려
  // 전부 기본 크기면 "크기 = 중요도" 설명이 거짓말이 되므로 범례에 두지 않는다.
  const sizedAnything = useMemo(() => {
    const sizes = new Map<string, Set<number>>();
    for (const def of elements) {
      if (def.group !== 'nodes') continue;
      const type = String(def.data?.type ?? '');
      if (!SIZED_TYPES.has(type)) continue;
      const set = sizes.get(type) ?? new Set<number>();
      set.add(Number(def.data?.nodeSize ?? 0));
      sizes.set(type, set);
    }
    return [...sizes.values()].some((set) => set.size > 1);
  }, [elements]);
  const relationOptions = useMemo(() => collectRelationOptions(elements), [elements]);
  // 이 그래프에 학생 허브 엣지가 몇 개인가. 0 이면 스위치를 두지 않는다 —
  // 신 파이프라인(v7) KG 에는 학생 노드가 아예 없어 끌 것이 없다.
  const studentEdgeCount = useMemo(() => {
    const typeById = new Map<string, unknown>();
    for (const def of elements) {
      if (def.group === 'nodes') typeById.set(String(def.data?.id ?? ''), def.data?.type);
    }
    return elements.reduce((n, def) => {
      if (def.group !== 'edges') return n;
      const cls = classifyEdge(typeById.get(String(def.data?.source ?? '')), typeById.get(String(def.data?.target ?? '')));
      return n + (cls === 'student' ? 1 : 0);
    }, 0);
  }, [elements]);

  // Parallax pixel-star shadows for the cosmos background. Generated once per
  // mount; this canvas owns the only starfield while a workspace is open.
  const starShadows = useMemo(() => ({
    small: buildStarShadows(700, 2000),
    medium: buildStarShadows(200, 2000),
    large: buildStarShadows(100, 2000),
  }), []);

  /**
   * 필터 버튼의 주황 점 = **기본값에서 벗어났는가**.
   *
   * 종전엔 "숨겨진 요소가 하나라도 있는가"였는데, 학생 허브 숨김이 **기본 켬**이 된 지금
   * 그 정의로는 구 파이프라인 그래프에서 **점이 늘 켜져** 신호가 죽는다.
   * 이 표시가 답해야 할 질문은 "내가 뭘 건드려서 이렇게 보이나"이므로 기준은 기본값이다.
   */
  const hiddenAnything =
    hiddenNodeTypes.size > 0
    || hiddenGrades.size > 0
    || hiddenRelationTypes.size > 0
    || minConfidence !== DEFAULT_MIN_CONFIDENCE
    || hideStudentEdges !== DEFAULT_HIDE_STUDENT_EDGES;

  const persistNow = useCallback(() => {
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || !signatureRef.current) return;
    const positions: Record<string, { x: number; y: number }> = {};
    cy.nodes().forEach((node) => {
      if (String(node.data('scope') ?? '') === 'preview') return;
      const p = node.position();
      positions[node.id()] = { x: Math.round(p.x), y: Math.round(p.y) };
    });
    saveGraphPositions(positionsStorageKey(signatureRef.current), positions);
  }, []);

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(persistNow, 600);
  }, [persistNow]);

  const startLayout = useCallback(
    (preset: LayoutPreset, opts: { randomize: boolean; animate: boolean; fit?: boolean; onStop?: () => void }) => {
      const cy = cyRef.current;
      if (!cy) return;
      layoutRef.current?.stop();
      setLayoutRunning(true);
      const layout = buildLayout(cy, preset, { randomize: opts.randomize, animate: opts.animate, fit: opts.fit, v7: isV7, spacing: spacingRef.current });
      layout.one('layoutstop', () => {
        // 고립 노드는 force에서 빠져 있으므로(buildLayout) 본체가 자리를 잡은 뒤
        // 데이터 축으로 따로 놓는다. concentric은 타입 고리가 이미 자리를 정한다.
        if (isV7 && preset !== 'concentric') {
          placeIsolatedNodes(cy);
          if (opts.fit !== false) cy.fit(undefined, 60);
        }
        setLayoutRunning(false);
        schedulePersist();
        opts.onStop?.();
      });
      layoutRef.current = layout;
      layout.run();
    },
    [schedulePersist, isV7]
  );

  const changeLayoutPreset = useCallback(
    (preset: LayoutPreset) => {
      setLayoutPreset(preset);
      presetRef.current = preset;
      startLayout(preset, { randomize: preset === 'free', animate: true });
    },
    [startLayout]
  );

  const relayout = useCallback(() => {
    startLayout(presetRef.current, { randomize: presetRef.current === 'free', animate: true });
  }, [startLayout]);

  /**
   * 간격 슬라이더 → 재배치.
   *
   * **디바운스가 필요하다** — `<input type="range">` 의 `change` 는 드래그하는 동안 계속 발화하므로
   * 그대로 걸면 레이아웃이 수십 번 시작·중단되며 화면이 요동친다. 240ms 는 손을 멈춘 것으로
   * 볼 만한 최소치다(키보드 화살표로 연속 조작할 때도 한 번만 돈다).
   *
   * **재배치는 `randomize: false`** — 간격만 바꾸는 것이지 새로 그리는 게 아니다. 무작위로 다시
   * 시작하면 사용자가 눈으로 따라가던 배치가 통째로 바뀌어, 슬라이더가 무엇을 했는지 알 수 없다.
   */
  useEffect(() => {
    // 자동으로 맞춘 값은 건너뛴다 — 학생·버전이 바뀔 때의 배치는 element-sync 가
    // 이미 새 간격으로 돌리므로, 여기서 또 돌리면 240ms 뒤에 화면이 한 번 더 움직인다.
    if (!spacingFromSliderRef.current) return;
    const timer = window.setTimeout(() => {
      startLayout(presetRef.current, { randomize: false, animate: true });
    }, 240);
    return () => window.clearTimeout(timer);
  }, [spacing, startLayout]);

  const focusSearchNode = useCallback((id: string) => {
    const cy = cyRef.current;
    if (!cy) return;
    const node = cy.getElementById(id);
    if (node.empty()) return;
    cy.nodes().removeClass('search-hit');
    node.addClass('search-hit');
    cy.animate({
      center: { eles: node },
      zoom: Math.max(cy.zoom(), 1.05),
      duration: 380,
      easing: 'ease-in-out-cubic',
    });
  }, []);

  const cycleSearch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const next = (searchIndex + 1) % searchMatches.length;
    setSearchIndex(next);
    focusSearchNode(searchMatches[next]);
  }, [focusSearchNode, searchIndex, searchMatches]);

  /** 지정한 화면 좌표를 고정점으로 한 걸음. 버튼(화면 중앙)과 휠(커서 위치)이 공유한다. */
  const zoomAt = useCallback((factor: number, renderedPosition: { x: number; y: number }) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.stop();
    cy.zoom({
      level: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cy.zoom() * factor)),
      renderedPosition,
    });
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    zoomAt(factor, { x: el.clientWidth / 2, y: el.clientHeight / 2 });
  }, [zoomAt]);

  const fitAll = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.animate({ fit: { eles: cy.elements(), padding: 72 }, duration: 300 });
  }, []);

  // ── Mount once: create the cytoscape instance and wire interactions ──────
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: graphStyles,
      minZoom: ZOOM_MIN,
      maxZoom: ZOOM_MAX,
      layout: { name: 'preset' },
    });

    cyRef.current = cy;

    cy.on('tap', 'node', (event) => {
      const data = event.target.data();
      if (data.scope !== 'existing') return;
      onToggleNodeRef.current(String(data.id));
    });

    // 노드 탭과 달리 scope 로 거르지 않는다. 노드는 분석 **출처 선택**이라 기존
    // KG 노드만 고를 수 있어야 하지만, 엣지 탭은 **세부사항 열람**이다. 설계·미리보기
    // 엣지도 근거·신뢰도·메모를 갖고 있으므로(생성 스키마의 필수 필드) 함께 연다.
    cy.on('tap', 'edge', (event) => {
      const data = event.target.data();
      onToggleEdgeRef.current(String(data.id));
    });

    cy.on('dbltap', (event) => {
      // Ignore double-click on empty background. Cytoscape reports the core
      // instance itself as the event target when nothing is hit.
      if (event.target === cy) return;
      cy.fit(undefined, 72);
    });

    // Hover focus mode: after a short dwell, dim everything outside the
    // hovered node's 1-hop neighborhood.
    cy.on('mouseover', 'node', (event) => {
      const node = event.target;
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = window.setTimeout(() => {
        hoverTimerRef.current = null;
        if (grabbingRef.current || cy.destroyed()) return;
        const neighborhood = node.closedNeighborhood();
        cy.batch(() => {
          cy.elements().addClass('dimmed');
          neighborhood.removeClass('dimmed');
        });
      }, FOCUS_HOVER_DELAY_MS);
    });

    cy.on('mouseout', 'node', () => {
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      cy.elements().removeClass('dimmed');
    });

    cy.on('grab', 'node', () => {
      grabbingRef.current = true;
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      cy.elements().removeClass('dimmed');
    });

    cy.on('free', 'node', () => {
      grabbingRef.current = false;
      schedulePersist();
    });

    cy.on('mouseover', 'edge', (event) => event.target.addClass('hovered'));
    cy.on('mouseout', 'edge', (event) => event.target.removeClass('hovered'));

    cy.on('zoom', () => {
      if (zoomRafRef.current) return;
      zoomRafRef.current = true;
      window.requestAnimationFrame(() => {
        zoomRafRef.current = false;
        const current = cyRef.current;
        if (current && !current.destroyed()) applyEdgeLabelVisibility(current);
      });
    });

    return () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
      persistNow();
      layoutRef.current?.stop();
      layoutRef.current = null;
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // The academy changes presentation only; IDs, relationships, selection and saved designs stay shared.
    const starStyles = graphStyles.map(rule => {
      if (rule.selector === 'node') return { ...rule, style: { ...rule.style,
        shape: 'ellipse', width: 28, height: 28, 'border-width': 2, 'border-color': '#ead4a3',
        'font-size': 12, 'text-valign': 'bottom', 'text-margin-y': 10,
        'text-outline-color': '#161024', 'text-outline-width': 2,
        'underlay-color': '#ccb9ec', 'underlay-padding': 10, 'underlay-opacity': 0.14, 'underlay-shape': 'ellipse',
      } as unknown as Css.Node };
      if (rule.selector === 'node[type = "Student"]') return { ...rule, style: { ...rule.style, width: 52, height: 52, 'underlay-padding': 20 } as unknown as Css.Node };
      if (rule.selector === 'node[type = "Thread"]') return { ...rule, style: { ...rule.style, width: 42, height: 42, 'border-width': 4, 'underlay-padding': 20 } as unknown as Css.Node };
      // 선택 고리·선택 엣지·엣지 라벨 바탕도 아카데미 색으로 — 크롬만 황금이고 그래프는 인디고면 반쪽이다.
      if (rule.selector === 'node[selected = "true"]') return { ...rule, style: { ...rule.style, 'border-color': CONSTELLATION_ACCENT, 'underlay-color': CONSTELLATION_ACCENT } as unknown as Css.Node };
      if (rule.selector === 'edge[selected = "true"]') return { ...rule, style: { ...rule.style, 'line-color': CONSTELLATION_ACCENT, 'target-arrow-color': CONSTELLATION_ACCENT } as unknown as Css.Edge };
      if (rule.selector === 'edge') return { ...rule, style: { ...rule.style, color: '#e5d6bd', 'text-background-color': '#161024' } as unknown as Css.Edge };
      return rule;
    });
    cy.style(constellation ? starStyles : graphStyles);
  }, [constellation]);

  /**
   * 휠 확대·축소를 직접 맡는다 (2026-09-12 사용자 지시).
   *
   * cytoscape 내장 휠은 `deltaY` 에 **연속 비례**하므로 한 걸음의 폭이 브라우저·입력기기마다
   * 다르고 좌상단 버튼(1.4배)과도 어긋난다. 여기서는 델타를 **칸 수로 누적**해
   * 한 칸이 찰 때마다 버튼과 **같은 한 걸음**을 움직인다 — "한 번"은 이벤트 하나가 아니다.
   *
   * 고정점은 **커서 위치**다(버튼은 화면 중앙). 휠 확대는 가리킨 곳이 제자리에 남는 것이
   * 보편적인 기대라, 폭만 맞추고 이 관례는 지킨다.
   */
  useEffect(() => {
    const el = containerRef.current;
    const cy = cyRef.current;
    if (!el || !cy) return;
    // 내장 휠을 끈다. 프로그램 호출(`cy.zoom()`)은 이 설정과 무관하므로 버튼은 그대로 동작한다.
    cy.userZoomingEnabled(false);

    let pending = 0;
    const onWheel = (event: WheelEvent) => {
      // 막지 않으면 페이지가 함께 스크롤된다. 그래서 passive 로 붙일 수 없다.
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const steps = wheelSteps(event);

      // 트랙패드 핀치는 `ctrlKey` 가 붙은 휠로 온다. 그쪽은 손가락이 연속으로 움직이는
      // 조작이라 계단으로 만들면 튄다 — 비례 확대를 그대로 둔다.
      if (event.ctrlKey) {
        zoomAt(Math.pow(ZOOM_STEP, -steps), at);
        return;
      }

      // 방향이 바뀌면 쌓인 것을 버린다. 안 그러면 되돌릴 때 먼저 앞서 쌓인 만큼을 소진해야 한다.
      if (pending !== 0 && Math.sign(steps) !== Math.sign(pending)) pending = 0;
      pending += steps;
      while (Math.abs(pending) >= 1) {
        const dir = Math.sign(pending);
        pending -= dir;
        // deltaY 양수 = 아래로 굴림 = 축소.
        zoomAt(dir > 0 ? 1 / ZOOM_STEP : ZOOM_STEP, at);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);


  // ── Element sync: full reset on student/KG change, incremental otherwise ──
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const signature = `${workspace.student?.id ?? 'unknown'}::${workspace.kgVersion?.id ?? 'no-kg'}`;
    const defsById = new Map(elements.map((def) => [String(def.data?.id ?? ''), def]));

    if (signature !== signatureRef.current || cy.nodes().empty()) {
      // Full reset — different student or first population.
      layoutRef.current?.stop();
      signatureRef.current = signature;
      cy.elements().remove();
      cy.add(elements);
      applySelectionData(cy, selectedNodeIdsRef.current, selectedEdgeIdsRef.current);
      applyEdgeLabelVisibility(cy);

      const saved = loadGraphPositions(positionsStorageKey(signature));
      const known = new Set<string>();
      if (saved) {
        cy.nodes().forEach((node) => {
          const p = saved[node.id()];
          if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
            node.position(p);
            known.add(node.id());
          }
        });
      }

      const total = cy.nodes().length;
      if (known.size >= Math.max(3, total * 0.5)) {
        // Majority restored — keep the user's remembered arrangement, seed the
        // few unknown nodes near their neighbors, skip the layout entirely.
        const unknown = cy
          .nodes()
          .filter((node) => !known.has(node.id()))
          .map((node) => node.id());
        seedNewNodePositions(cy, unknown, known, spacingRef.current);
        applyPreviewEmphasis(cy);
        cy.fit(undefined, 72);
        setLayoutRunning(false);
        schedulePersist();
      } else {
        startLayout(presetRef.current, { randomize: true, animate: false });
      }
      applyPreviewEmphasis(cy);
      return;
    }

    // Incremental update — same student & KG version. Never **randomize** the
    // whole graph: remove what's gone, refresh data, seed new nodes locally,
    // then settle with a non-randomized pass (below).
    const removed = cy.elements().filter((ele) => !defsById.has(ele.id()));
    const existingIds = new Set<string>();
    cy.elements().forEach((ele) => {
      existingIds.add(ele.id());
    });
    const addedDefs = elements.filter((def) => !existingIds.has(String(def.data?.id ?? '')));

    cy.batch(() => {
      if (removed.length > 0) removed.remove();
      cy.elements().forEach((ele) => {
        const def = defsById.get(ele.id());
        if (!def?.data) return;
        for (const [key, value] of Object.entries(def.data)) {
          if (key === 'id' || key === 'source' || key === 'target') continue;
          if (ele.data(key) !== value) ele.data(key, value);
        }
      });
    });

    if (addedDefs.length > 0) {
      const known = new Set<string>();
      cy.nodes().forEach((node) => {
        known.add(node.id());
      });
      const added = cy.add(addedDefs);
      seedNewNodePositions(cy, added.nodes().map((node) => node.id()), known, spacingRef.current);
      applySelectionData(cy, selectedNodeIdsRef.current, selectedEdgeIdsRef.current);
      applyEdgeLabelVisibility(cy);
      fadeInAdded(added);
      /**
       * 정착 패스 (2026-09-14 사용자 제안). 빈자리 배치는 **출발점**이고, 라벨 겹침까지 푸는 것은
       * 힘이다 — 간격 슬라이더와 같은 `randomize: false` 한 번이면 전체 모양은 유지된 채 새 노드
       * 주변만 정돈된다(무작위 시작이 옛 결함이었지, 재배치 자체가 아니다). `fit: false` 로 전체
       * 보기 점프를 막고, 끝난 뒤 새 노드로 카메라를 모은다. 빈자리 배치를 빼면 안 된다 —
       * (0,0)이나 허브 위에서 출발한 노드가 그래프를 가로질러 끌려오며 지나는 노드를 흔든다.
       */
      if (added.nodes().nonempty()) {
        // 새 별(설계 미리보기)이 놓이면 **간격 슬라이더와 같은 재배치**를 한 번 돈다 (2026-10-03 사용자 결정 —
        // 기존 노드의 자리를 지키려 애쓰지 않는다. 노드를 더한 뒤 전체를 다시 배치하고 전체 보기로 맞춘다).
        // 빈자리 배치(seedNewNodePositions)는 출발점으로만 남긴다 — (0,0)에서 출발한 노드가 그래프를 가로질러
        // 끌려오며 지나는 노드를 흔드는 것을 막는다. 미리보기가 아닌 추가(설계 저장 등)는 종전처럼 자리를 지킨다.
        if (added.nodes('[scope = "preview"]').nonempty()) {
          startLayout(presetRef.current, { randomize: false, animate: true });
        } else {
          startLayout(presetRef.current, { randomize: false, animate: true, fit: false, onStop: () => focusOnAdded(cy, added) });
        }
      } else {
        schedulePersist();
      }
    }
    // 추가·제거 어느 쪽이든 미리보기 유무가 바뀌었을 수 있다 — 여기서 한 번에 맞춘다.
    applyPreviewEmphasis(cy);
  }, [elements, workspace, schedulePersist, startLayout]);

  // ── Selection sync ────────────────────────────────────────────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applySelectionData(cy, selectedNodeIds, selectedEdgeIds);
  }, [selectedEdgeIds, selectedNodeIds]);

  /**
   * 개념 표시/숨김. **노드와 엣지를 함께** 다룬다.
   *
   * 엣지만 숨기면 개념 노드가 전부 고아가 된다(00-00239 기준 53개) — 개념은 활동과만
   * 이어져 있어서다. 그러면 고립 영역이 개념으로 가득 차 정작 봐야 할 "어디에도 못 이은
   * 활동"이 묻힌다. 개념은 §10에서 **노드가 아니라 판단 재료**로 정한 것이므로
   * 기본 화면에서는 통째로 빠지는 것이 맞다.
   */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const hide = isV7 && !showConceptEdges;
    cy.batch(() => {
      cy.edges().forEach((edge) => {
        edge.toggleClass('concept-hidden', hide && String(edge.data('layer') ?? '') === 'concept');
      });
      cy.nodes().forEach((node) => {
        node.toggleClass('concept-hidden', hide && String(node.data('type') ?? '') === 'Concept');
      });
    });
  }, [showConceptEdges, isV7, elements]);

  // ── Type / relation / confidence filters ─────────────────────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      cy.nodes().forEach((node) => {
        const type = String(node.data('type') ?? '');
        const rawGrade = node.data('grade');
        const gradeKey = Number.isFinite(Number(rawGrade)) && Number(rawGrade) > 0 ? String(Number(rawGrade)) : '';
        // 학생 허브는 **학년 필터가 건드리지 않는다** (2026-09-12 사용자 지시).
        // 학년을 걸러 보는 목적은 "그 학년에 무엇을 했나"인데, 중심 노드가 함께 사라지면
        // 남은 노드들이 서로 이어지지 않은 조각으로 흩어진다. 감추려면 엔티티 유형에서 끈다.
        const gradeVisible = type === 'Student' || !hiddenGrades.has(gradeKey);
        if (!hiddenNodeTypes.has(type) && gradeVisible) {
          node.removeClass('filtered-out');
        } else {
          node.addClass('filtered-out');
        }
      });

      cy.edges().forEach((edge) => {
        const relationType = String(edge.data('type') ?? '');
        const confidence = Number(edge.data('confidence') ?? 1);
        const sourceVisible = !edge.source().hasClass('filtered-out');
        const targetVisible = !edge.target().hasClass('filtered-out');
        const relationVisible = !hiddenRelationTypes.has(relationType);
        const confidenceVisible = Number.isFinite(confidence) ? confidence >= minConfidence : true;
        const hubVisible =
          !hideStudentEdges
          || classifyEdge(edge.source().data('type'), edge.target().data('type')) !== 'student';

        if (sourceVisible && targetVisible && relationVisible && confidenceVisible && hubVisible) {
          edge.removeClass('filtered-out');
        } else {
          edge.addClass('filtered-out');
        }
      });
    });
  }, [elements, hiddenNodeTypes, hiddenRelationTypes, minConfidence, hideStudentEdges, hiddenGrades]);

  // ── Node search ───────────────────────────────────────────────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      cy.nodes().removeClass('search-hit');
      setSearchMatches([]);
      setSearchIndex(0);
      return;
    }
    const ids = cy
      .nodes()
      .not('.filtered-out')
      .filter((node) => String(node.data('label') ?? '').toLowerCase().includes(query))
      .map((node) => node.id());
    setSearchMatches(ids);
    setSearchIndex(0);
    if (ids.length > 0) {
      focusSearchNode(ids[0]);
    } else {
      cy.nodes().removeClass('search-hit');
    }
  }, [elements, focusSearchNode, searchQuery]);

  // 바깥 지정 노드 비추기 — 검색 effect 가 빈 검색어에서 `search-hit` 를 전부 지우므로 그 **뒤**에 둔다.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !highlightNodeId || searchQuery.trim()) return;
    const timer = window.setTimeout(() => { if (cyRef.current && !cyRef.current.destroyed()) focusSearchNode(highlightNodeId); }, 450);
    return () => window.clearTimeout(timer);
  }, [highlightNodeId, elements, focusSearchNode, searchQuery]);

  const toggleHiddenValue = (setter: Dispatch<SetStateAction<Set<string>>>, value: string) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const resetFilters = () => {
    setHiddenNodeTypes(new Set());
    setHiddenRelationTypes(new Set());
    setMinConfidence(DEFAULT_MIN_CONFIDENCE);
    setHideStudentEdges(DEFAULT_HIDE_STUDENT_EDGES);
    setHiddenGrades(new Set());
  };

  const chromeTheme: GraphChromeTheme = constellation ? 'constellation' : 'inquiry';
  return (
    <div
      className="starfield relative h-full min-h-[720px] w-full overflow-hidden"
      data-chrome-theme={chromeTheme}
      style={CHROME_THEMES[chromeTheme] as unknown as CSSProperties}
    >
      <div className="starfield-stage" aria-hidden>
        <div className="starfield-layer starfield-layer--small" style={{ boxShadow: starShadows.small }} />
        <div className="starfield-layer starfield-layer--small starfield-layer--clone" style={{ boxShadow: starShadows.small }} />
        <div className="starfield-layer starfield-layer--medium" style={{ boxShadow: starShadows.medium }} />
        <div className="starfield-layer starfield-layer--medium starfield-layer--clone" style={{ boxShadow: starShadows.medium }} />
        <div className="starfield-layer starfield-layer--large" style={{ boxShadow: starShadows.large }} />
        <div className="starfield-layer starfield-layer--large starfield-layer--clone" style={{ boxShadow: starShadows.large }} />
      </div>
      <div ref={containerRef} className="absolute inset-0" />

      {/* 좌상단 — **보는 방식이 위, 찾는 것이 아래** (2026-09-12 사용자 지시).
          확대·축소·전체보기·간격은 화면을 다루는 손잡이라 먼저 오고, 검색은 그 다음이다. */}
      <div className="absolute left-4 top-4 z-10 flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2">
        {/* 보는 방식 — 확대·축소·전체보기와 노드 간격을 한 줄에 둔다(2026-09-12 사용자 지시).
            셋 다 "무엇을 보느냐"가 아니라 "어떻게 보느냐"라 같은 자리가 맞다. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-md border border-[color:var(--kg-border)] bg-[color:var(--kg-surface)] shadow-sm">
            <button
              type="button"
              onClick={() => zoomBy(1.4)}
              title="확대"
              aria-label="확대"
              className="p-2 text-[color:var(--kg-text)] transition-colors duration-200 hover:bg-[color:var(--kg-hover)] hover:text-[color:var(--kg-accent)]"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.4)}
              title="축소"
              aria-label="축소"
              className="p-2 text-[color:var(--kg-text)] transition-colors duration-200 hover:bg-[color:var(--kg-hover)] hover:text-[color:var(--kg-accent)]"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={fitAll}
              title="전체 보기"
              aria-label="전체 보기"
              className="p-2 text-[color:var(--kg-text)] transition-colors duration-200 hover:bg-[color:var(--kg-hover)] hover:text-[color:var(--kg-accent)]"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-[color:var(--kg-border)] bg-[color:var(--kg-surface)] px-2.5 py-1.5 shadow-sm">
            <input
              type="range"
              min={SPACING_MIN * 10}
              max={SPACING_MAX * 10}
              step={1}
              value={Math.round(spacing * 10)}
              onChange={(event) => {
                // 손으로 움직인 것임을 표시한다 — 이 표시가 있을 때만 재배치 effect 가 돈다.
                spacingFromSliderRef.current = true;
                setSpacing(Number(event.target.value) / 10);
              }}
              className="w-24 accent-[color:var(--kg-accent-strong)]"
              title={`노드 간격 — 놓으면 다시 배치됩니다 (이 그래프 자동 기본값 ${autoSpacing.toFixed(1)}×)`}
              aria-label="노드 간격"
            />
            <span
              className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-[color:var(--kg-text)]"
              // 자동값 그대로면 옅게 — "내가 정한 값"과 "알아서 정해진 값"이 같은 굵기로 보이면
              // 슬라이더를 건드렸는지 아닌지를 화면이 말해 주지 못한다.
              style={spacing === autoSpacing ? undefined : { color: 'var(--kg-text-strong)' }}
            >
              {spacing.toFixed(1)}×
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className={cn('relative', CHROME_COLUMN_WIDTH)}>
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--kg-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  cycleSearch();
                }
                if (event.key === 'Escape') setSearchQuery('');
              }}
              placeholder="노드 검색 (Enter: 다음)"
              className="h-8 w-full rounded-md border border-[color:var(--kg-border)] bg-[color:var(--kg-surface)] pl-7 pr-16 text-xs text-[color:var(--kg-text-strong)] shadow-sm placeholder:text-[color:var(--kg-faint)] focus:border-[color:var(--kg-accent)] focus:outline-none"
            />
            {searchQuery && (
              <span className="pointer-events-none absolute right-7 top-1/2 -translate-y-1/2 font-mono text-[10px] tabular-nums text-[color:var(--kg-muted)]">
                {searchMatches.length > 0 ? `${searchIndex + 1}/${searchMatches.length}` : '0'}
              </span>
            )}
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[color:var(--kg-muted)] hover:text-[color:var(--kg-text)]"
                aria-label="검색 지우기"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {layoutRunning && (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--kg-border)] bg-[color:var(--kg-surface)] px-2.5 py-2 text-[11px] text-[color:var(--kg-text)] shadow-sm">
              <Loader2 className="h-3 w-3 animate-spin" />
              배치 계산 중…
            </div>
          )}
        </div>

        {selectedNodeList.length > 0 && (
          <div className={cn(CHROME_COLUMN_WIDTH, 'overflow-hidden rounded-md border border-[color:var(--kg-border)] bg-[color:var(--kg-surface)] shadow-sm')}>
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--kg-divider)] px-2.5 py-1.5">
              <span className="text-[11px] font-medium text-[color:var(--kg-text)]">
                선택한 노드 {selectedNodeList.length}
              </span>
              <span className="text-[10px] text-[color:var(--kg-faint)]">칩을 누르면 해제</span>
            </div>
            {/* 많이 골라도 캔버스를 잠식하지 않게 상한을 두고 스크롤한다. */}
            <div className="max-h-[30vh] space-y-1 overflow-y-auto p-1.5">
            {selectedNodeList.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onToggleNode(node.id)}
                  title={`${node.label} · ${node.type} — 눌러서 선택 해제`}
                  className="group flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors duration-200 hover:bg-[color:var(--kg-hover)]"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: node.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-[color:var(--kg-text)]">{node.label}</span>
                  <X className="h-3 w-3 shrink-0 text-[color:var(--kg-faint)] transition-colors group-hover:text-rose-400" />
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* 우상단 — 버전 선택 · 필터 (2026-09-12 사용자 지시).
          그래프 통계(노드·엣지·신뢰도)는 두지 않는다. 좌하단에 늘 펼쳐져 있던 것을
          `i` 안으로 접었다가 그것마저 걷어냈다 — **자주 볼 값이 아니면 자리를 차지하지 않는 편이 낫다.** */}
      <div className="absolute right-4 top-4 z-30 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/* 껍데기를 두르지 않는다 — 안에 드롭다운 하나뿐이면 상자는 테두리를 두 겹으로 만들 뿐이다.
              대신 트리거 자신이 캔버스 위에서 읽히도록 배경·테두리를 갖는다(옆 [필터] 버튼과 같은 높이). */}
          <KgVersionPicker
            versions={workspace.kgVersions}
            currentId={kgVersionId}
            onChange={onKgVersionChange}
            triggerClassName="border-[color:var(--kg-border)] bg-[color:var(--kg-surface)] text-[color:var(--kg-text)] hover:border-[color:var(--kg-accent)] hover:bg-[color:var(--kg-hover)]"
            contentClassName={VERSION_PICKER_CONTENT_CLASS[chromeTheme]}
          />

          <button
            type="button"
            onClick={() => setFilterOpen((value) => !value)}
            aria-pressed={filterOpen}
            className="relative inline-flex items-center gap-1 rounded-md border border-[color:var(--kg-border)] bg-[color:var(--kg-surface)] px-3 py-2 text-xs font-medium text-[color:var(--kg-text-strong)] shadow-sm transition duration-200 hover:border-[color:var(--kg-accent)] hover:bg-[color:var(--kg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--kg-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--kg-hover)] data-[active=true]:border-[color:var(--kg-active-border)] data-[active=true]:bg-[color:var(--kg-active-bg)] data-[active=true]:text-[color:var(--kg-active-text)]"
            data-active={filterOpen || hiddenAnything}
          >
            <Filter className="h-3.5 w-3.5" />
            필터
            {hiddenAnything && !filterOpen && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-400" title="숨겨진 요소가 있습니다" />
            )}
          </button>
        </div>

        {filterOpen && (
          <div className="w-fit min-w-[240px] max-w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[color:var(--kg-border)] bg-[color:var(--kg-surface-strong)] text-xs text-[color:var(--kg-text)] shadow-xl">
            <div className="max-h-[calc(100vh-9rem)] w-fit min-w-[240px] max-w-full space-y-4 overflow-y-auto p-4">
              <section className="space-y-2">
                <div className="font-semibold text-[color:var(--kg-muted)]">배치 방식</div>
                <div className="flex items-center gap-1.5">
                  {(['free', 'concentric'] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => changeLayoutPreset(preset)}
                      className={cn(
                        'rounded border px-2 py-1 transition-colors duration-200',
                        layoutPreset === preset
                          ? 'border-[color:var(--kg-active-border)] bg-[color:var(--kg-active-bg)] text-[color:var(--kg-active-text)]'
                          : 'border-[color:var(--kg-border)] text-[color:var(--kg-text)] hover:bg-[color:var(--kg-hover)]'
                      )}
                    >
                      {preset === 'free' ? '자유 배치' : '동심원'}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={relayout}
                    title="현재 방식으로 다시 배치"
                    className="rounded border border-[color:var(--kg-border)] p-1.5 text-[color:var(--kg-text)] transition-colors duration-200 hover:bg-[color:var(--kg-hover)]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </section>

              <section className="space-y-2">
                <div className="font-semibold text-[color:var(--kg-muted)]">엔티티 유형</div>
                <div className="space-y-1">
                  {nodeTypeOptions.map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-[color:var(--kg-hover)]">
                      <input
                        type="checkbox"
                        checked={!hiddenNodeTypes.has(option.value)}
                        onChange={() => toggleHiddenValue(setHiddenNodeTypes, option.value)}
                        className="h-3.5 w-3.5 accent-[color:var(--kg-accent-strong)]"
                      />
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                        style={{ backgroundColor: option.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 max-w-48 truncate">{option.label}</span>
                      <span className="text-[color:var(--kg-faint)]">{option.count}</span>
                    </label>
                  ))}
                </div>
              </section>

              {gradeOptions.length > 1 && (
                <section className="space-y-2">
                  <div className="font-semibold text-[color:var(--kg-muted)]">
                    학년 <span className="font-normal text-[color:var(--kg-faint)]">(처음 나타난 학년)</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {gradeOptions.map((option) => {
                      const hidden = hiddenGrades.has(option.value);
                      return (
                        <button
                          key={option.value || 'none'}
                          type="button"
                          onClick={() => toggleHiddenValue(setHiddenGrades, option.value)}
                          aria-pressed={!hidden}
                          className={cn(
                            'rounded border px-2 py-1 text-[11px] transition-colors duration-200',
                            hidden
                              ? 'border-[color:var(--kg-border)] text-[color:var(--kg-faint)] line-through opacity-60 hover:bg-[color:var(--kg-hover)]'
                              : 'border-[color:var(--kg-active-border)] bg-[color:var(--kg-active-bg)] text-[color:var(--kg-active-text)]'
                          )}
                        >
                          {option.label}
                          <span className={cn('ml-1', hidden ? 'text-[color:var(--kg-faint)]' : 'text-[color:var(--kg-active-muted)]')}>
                            {option.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {studentEdgeCount > 0 && (
                <section className="space-y-2">
                  <div className="font-semibold text-[color:var(--kg-muted)]">학생 허브</div>
                  <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-[color:var(--kg-hover)]">
                    <input
                      type="checkbox"
                      checked={hideStudentEdges}
                      onChange={() => setHideStudentEdges((v) => !v)}
                      className="mt-0.5 h-3.5 w-3.5 accent-[color:var(--kg-accent-strong)]"
                    />
                    <span className="min-w-0">
                      <span className="block">중심 노드 연결 숨기기</span>
                      <span className="block text-[10px] leading-tight text-[color:var(--kg-faint)]">
                        엣지 {studentEdgeCount}개. 가리면 활동 사이의 연결이 드러납니다.
                      </span>
                    </span>
                  </label>
                </section>
              )}

              <section className="space-y-2">
                <label className="flex items-center justify-between gap-3 font-semibold text-[color:var(--kg-muted)]">
                  <span>신뢰도 기준</span>
                  <span className="font-mono text-[color:var(--kg-accent)] tabular-nums">{minConfidence.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={Math.round(minConfidence * 100)}
                  onChange={(event) => setMinConfidence(Number(event.target.value) / 100)}
                  className="w-48 accent-[color:var(--kg-accent-strong)]"
                />
              </section>

              <section className="space-y-2">
                <div className="font-semibold text-[color:var(--kg-muted)]">관계 유형</div>
                <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {relationOptions.map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-[color:var(--kg-hover)]">
                      <input
                        type="checkbox"
                        checked={!hiddenRelationTypes.has(option.value)}
                        onChange={() => toggleHiddenValue(setHiddenRelationTypes, option.value)}
                        className="h-3.5 w-3.5 accent-[color:var(--kg-accent-strong)]"
                      />
                      <span
                        className="h-0.5 w-5 shrink-0 rounded-full"
                        style={{ backgroundColor: option.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 max-w-48 truncate">{option.label}</span>
                      <span className="text-[color:var(--kg-faint)]">{option.count}</span>
                    </label>
                  ))}
                </div>
              </section>

              <button
                type="button"
                onClick={resetFilters}
                className="w-full rounded border border-[color:var(--kg-border)] px-2 py-1.5 text-[color:var(--kg-text)] transition-colors duration-200 hover:bg-[color:var(--kg-hover)]"
              >
                필터 초기화
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex max-w-sm flex-col items-start gap-2 text-xs">
        <div className="pointer-events-auto overflow-hidden rounded-md border border-[color:var(--kg-border)] bg-[color:var(--kg-surface)] shadow-sm">
          <button
            type="button"
            onClick={() => setLegendOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--kg-text)] transition-colors duration-200 hover:bg-[color:var(--kg-hover)]"
            aria-expanded={legendOpen}
          >
            범례
            {legendOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>
          {legendOpen && (
            <div className="flex max-w-[240px] flex-wrap gap-x-2 gap-y-1 px-2.5 pb-2">
              {nodeTypeOptions.map((option) => {
                const hidden = hiddenNodeTypes.has(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleHiddenValue(setHiddenNodeTypes, option.value)}
                    title={`${option.label} ${hidden ? '표시하기' : '숨기기'}`}
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] transition-opacity duration-200 hover:bg-[color:var(--kg-hover)]',
                      hidden ? 'text-[color:var(--kg-faint)] line-through opacity-50' : 'text-[color:var(--kg-text)]'
                    )}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: option.color }}
                      aria-hidden="true"
                    />
                    {ENTITY_TYPE_LABELS[option.value] ?? option.value}
                    <span className="text-[color:var(--kg-faint)]">{option.count}</span>
                  </button>
                );
              })}
            </div>
          )}
          {/* 크기가 무엇을 뜻하는지 화면이 말해야 한다 — 특히 **그래프 안 상대값**이라는 사실을.
              다른 학생·다른 버전과 크기를 견주면 틀린다(정규화 기준이 그래프마다 다르다). */}
          {legendOpen && sizedAnything && (
            <div className="max-w-[240px] border-t border-[color:var(--kg-divider)] px-2.5 py-1.5 text-[9px] leading-tight text-[color:var(--kg-faint)]">
              활동·흐름·관심의 <span className="text-[color:var(--kg-muted)]">크기 = 연결 중요도</span>
              <br />
              (무엇과 이어졌는지로 가중 · 이 그래프 안에서만 비교)
            </div>
          )}
          {/* 신 KG는 엣지가 그래프의 본체다(§12) — 층마다 색·굵기가 달라 그 뜻을
              말해주지 않으면 색을 늘린 만큼 혼란만 는다. 구 KG에는 층이 없어 숨긴다. */}
          {legendOpen && isV7 && (
            <div className="max-w-[240px] border-t border-[color:var(--kg-divider)] px-2.5 py-1.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[9px] uppercase tracking-wide text-[color:var(--kg-faint)]">연결</span>
                {/* 개념 엣지는 기본 숨김이다. 켤 수 있게 두되, 켜면 왜 화면이 덮이는지
                    스스로 보이므로 설명이 따로 필요 없다. */}
                <button
                  type="button"
                  onClick={() => setShowConceptEdges((v) => !v)}
                  className={cn(
                    'rounded px-1 py-0.5 text-[9px] transition-colors',
                    showConceptEdges ? 'bg-[color:var(--kg-toggle-bg)] text-[color:var(--kg-toggle-text)]' : 'text-[color:var(--kg-faint)] hover:bg-[color:var(--kg-hover)]'
                  )}
                >
                  개념 {showConceptEdges ? '켬' : '끔'}
                </button>
              </div>
              <div className="flex flex-wrap gap-x-2 gap-y-1">
                {V7_EDGE_LEGEND.map((item) => (
                  <span
                    key={item.label}
                    title={item.hint}
                    className="inline-flex items-center gap-1 text-[10px] text-[color:var(--kg-text)]"
                  >
                    <span
                      className="h-0.5 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                      aria-hidden="true"
                    />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
