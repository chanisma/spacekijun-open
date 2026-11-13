import { useCallback, useEffect, useMemo, useRef } from 'react';
import cytoscape from 'cytoscape';
import type { Core, ElementDefinition, LayoutOptions, Stylesheet } from 'cytoscape';
import { Maximize2, Network, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

export interface WordContextText {
  text: string;
  category: string;
  source: string;
}

export interface WordContextFilter {
  category: string;
  source?: string;
}

interface WordContextGraphProps {
  word: string;
  texts: WordContextText[];
  filter: WordContextFilter | null;
  onFilterChange: (filter: WordContextFilter | null) => void;
}

interface SourceAggregate {
  source: string;
  recordCount: number;
  occurrenceCount: number;
}

interface CategoryAggregate {
  category: string;
  color: string;
  recordCount: number;
  occurrenceCount: number;
  sources: SourceAggregate[];
}

interface GraphData {
  categories: CategoryAggregate[];
  elements: ElementDefinition[];
  totalOccurrences: number;
  sourceCount: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  '교과 세특': '#2563eb',
  '자율활동': '#059669',
  '동아리활동': '#d97706',
  '진로활동': '#7c3aed',
  '행동특성': '#db2777',
};

const CATEGORY_ORDER = ['교과 세특', '자율활동', '동아리활동', '진로활동', '행동특성'];
const FALLBACK_CATEGORY_COLOR = '#64748b';
const KEYWORD_NODE_ID = 'keyword-root';
const ZOOM_FACTOR = 1.25;

const graphStyles: Stylesheet[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': 132,
      'font-family': 'sans-serif',
      'font-size': 12,
      'font-weight': 600,
      'overlay-opacity': 0,
      'transition-property': 'opacity, border-width, underlay-opacity',
      'transition-duration': 180,
    },
  },
  {
    selector: 'node[kind = "keyword"]',
    style: {
      width: 104,
      height: 104,
      shape: 'ellipse',
      'background-color': '#4338ca',
      'border-color': '#c7d2fe',
      'border-width': 5,
      color: '#ffffff',
      'font-size': 15,
      'font-weight': 700,
      'text-outline-color': '#4338ca',
      'text-outline-width': 2,
    },
  },
  {
    selector: 'node[kind = "category"]',
    style: {
      width: 146,
      height: 64,
      shape: 'round-rectangle',
      'background-color': 'data(color)',
      'border-color': '#ffffff',
      'border-width': 2,
      color: '#ffffff',
      'text-outline-color': 'data(color)',
      'text-outline-width': 2,
    },
  },
  {
    selector: 'node[kind = "source"]',
    style: {
      width: 148,
      height: 54,
      shape: 'round-rectangle',
      'background-color': '#ffffff',
      'border-color': 'data(color)',
      'border-width': 3,
      color: '#334155',
      'font-size': 11,
      'text-outline-width': 0,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 'data(width)',
      'curve-style': 'bezier',
      'line-color': 'data(color)',
      'target-arrow-color': 'data(color)',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.7,
      opacity: 0.62,
      'overlay-opacity': 0,
      'transition-property': 'opacity, width',
      'transition-duration': 180,
    },
  },
  {
    selector: '.graph-hidden',
    style: {
      display: 'none',
    },
  },
  {
    selector: '.context-muted',
    style: {
      opacity: 0.25,
    },
  },
  {
    selector: 'node.context-selected',
    style: {
      'border-width': 5,
      'underlay-color': '#fbbf24',
      'underlay-opacity': 0.24,
      'underlay-padding': 7,
    },
  },
  {
    selector: 'edge.context-selected',
    style: {
      width: 3.5,
      opacity: 1,
    },
  },
];

function countOccurrences(text: string, word: string): number {
  if (!word) return 0;

  let count = 0;
  let index = 0;
  while ((index = text.indexOf(word, index)) !== -1) {
    count++;
    index += word.length;
  }
  return count;
}

function categorySort(a: string, b: string): number {
  const aIndex = CATEGORY_ORDER.indexOf(a);
  const bIndex = CATEGORY_ORDER.indexOf(b);
  if (aIndex === -1 && bIndex === -1) return a.localeCompare(b, 'ko');
  if (aIndex === -1) return 1;
  if (bIndex === -1) return -1;
  return aIndex - bIndex;
}

function buildGraphData(word: string, texts: WordContextText[]): GraphData {
  const categoryMap = new Map<string, {
    recordCount: number;
    occurrenceCount: number;
    sources: Map<string, SourceAggregate>;
  }>();

  for (const item of texts) {
    const occurrences = countOccurrences(item.text, word);
    if (occurrences === 0) continue;

    const category = categoryMap.get(item.category) ?? {
      recordCount: 0,
      occurrenceCount: 0,
      sources: new Map<string, SourceAggregate>(),
    };
    category.recordCount++;
    category.occurrenceCount += occurrences;

    const source = category.sources.get(item.source) ?? {
      source: item.source,
      recordCount: 0,
      occurrenceCount: 0,
    };
    source.recordCount++;
    source.occurrenceCount += occurrences;
    category.sources.set(item.source, source);
    categoryMap.set(item.category, category);
  }

  const categories = Array.from(categoryMap.entries())
    .sort(([a], [b]) => categorySort(a, b))
    .map(([category, aggregate]) => ({
      category,
      color: CATEGORY_COLORS[category] ?? FALLBACK_CATEGORY_COLOR,
      recordCount: aggregate.recordCount,
      occurrenceCount: aggregate.occurrenceCount,
      sources: Array.from(aggregate.sources.values())
        .sort((a, b) => b.occurrenceCount - a.occurrenceCount || a.source.localeCompare(b.source, 'ko')),
    }));

  const totalOccurrences = categories.reduce((sum, category) => sum + category.occurrenceCount, 0);
  const elements: ElementDefinition[] = [
    {
      data: {
        id: KEYWORD_NODE_ID,
        kind: 'keyword',
        label: `${word}\n${totalOccurrences}회`,
      },
    },
  ];

  categories.forEach((category, categoryIndex) => {
    const categoryId = `category-${categoryIndex}`;
    elements.push({
      data: {
        id: categoryId,
        kind: 'category',
        category: category.category,
        color: category.color,
        label: `${category.category}\n${category.recordCount}건 · ${category.occurrenceCount}회`,
        recordCount: category.recordCount,
        occurrenceCount: category.occurrenceCount,
      },
    });
    elements.push({
      data: {
        id: `edge-keyword-${categoryIndex}`,
        source: KEYWORD_NODE_ID,
        target: categoryId,
        kind: 'category-edge',
        color: category.color,
        label: `${category.occurrenceCount}회`,
        width: Math.min(5, 1.5 + category.occurrenceCount * 0.35),
      },
    });

    category.sources.forEach((source, sourceIndex) => {
      const sourceId = `source-${categoryIndex}-${sourceIndex}`;
      elements.push({
        data: {
          id: sourceId,
          kind: 'source',
          category: category.category,
          sourceName: source.source,
          color: category.color,
          label: `${source.source}\n${source.recordCount}건 · ${source.occurrenceCount}회`,
          recordCount: source.recordCount,
          occurrenceCount: source.occurrenceCount,
        },
      });
      elements.push({
        data: {
          id: `edge-source-${categoryIndex}-${sourceIndex}`,
          source: categoryId,
          target: sourceId,
          kind: 'source-edge',
          color: category.color,
          label: `${source.occurrenceCount}회`,
          width: Math.min(4, 1 + source.occurrenceCount * 0.3),
        },
      });
    });
  });

  return {
    categories,
    elements,
    totalOccurrences,
    sourceCount: categories.reduce((sum, category) => sum + category.sources.length, 0),
  };
}

function fitVisibleGraph(cy: Core): void {
  const visibleElements = cy.elements().not('.graph-hidden');
  if (visibleElements.length > 0) {
    cy.fit(visibleElements, cy.width() < 640 ? 24 : 48);
  }
}

function arrangeGraph(cy: Core, filter: WordContextFilter | null): void {
  const keywordNode = cy.$id(KEYWORD_NODE_ID);
  const categoryNodes = cy.nodes().filter(node => node.data('kind') === 'category');
  const sourceNodes = cy.nodes().filter(node => node.data('kind') === 'source');
  const isCompact = cy.width() < 640;

  cy.batch(() => {
    cy.elements().removeClass('context-muted context-selected').addClass('graph-hidden');
    keywordNode.removeClass('graph-hidden');

    if (!filter) {
      categoryNodes.removeClass('graph-hidden');
    } else {
      categoryNodes
        .filter(node => node.data('category') === filter.category)
        .removeClass('graph-hidden')
        .addClass('context-selected');
      sourceNodes
        .filter(node => node.data('category') === filter.category)
        .removeClass('graph-hidden');
    }

    cy.edges().forEach(edge => {
      if (!edge.source().hasClass('graph-hidden') && !edge.target().hasClass('graph-hidden')) {
        edge.removeClass('graph-hidden');
      }
    });

    if (filter?.source) {
      const categorySourceNodes = sourceNodes.filter(node => node.data('category') === filter.category);
      categorySourceNodes
        .filter(node => node.data('sourceName') !== filter.source)
        .addClass('context-muted');
      categorySourceNodes
        .filter(node => node.data('sourceName') === filter.source)
        .addClass('context-selected');

      cy.edges().not('.graph-hidden').forEach(edge => {
        if (edge.target().data('kind') === 'source') {
          edge.addClass(
            edge.target().data('sourceName') === filter.source
              ? 'context-selected'
              : 'context-muted',
          );
        } else {
          edge.addClass('context-selected');
        }
      });
    }
  });

  if (!filter) {
    if (isCompact) {
      keywordNode.position({ x: 95, y: 0 });
      categoryNodes.forEach((node, index) => {
        node.position({
          x: (index % 2) * 190,
          y: 150 + Math.floor(index / 2) * 94,
        });
      });
    } else {
      keywordNode.position({ x: 0, y: 0 });
      categoryNodes.forEach((node, index) => {
        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / categoryNodes.length;
        node.position({
          x: Math.cos(angle) * 340,
          y: Math.sin(angle) * 190,
        });
      });
    }
  } else {
    const activeCategory = categoryNodes.filter(node => node.data('category') === filter.category);
    const activeSources = sourceNodes.filter(node => node.data('category') === filter.category);

    if (isCompact) {
      keywordNode.position({ x: 95, y: 0 });
      activeCategory.position({ x: 95, y: 145 });
      activeSources.forEach((node, index) => {
        node.position({
          x: (index % 2) * 190,
          y: 310 + Math.floor(index / 2) * 78,
        });
      });
    } else {
      const rowsPerColumn = Math.min(5, Math.max(1, activeSources.length));
      keywordNode.position({ x: 0, y: 0 });
      activeCategory.position({ x: 260, y: 0 });
      activeSources.forEach((node, index) => {
        const row = index % rowsPerColumn;
        const column = Math.floor(index / rowsPerColumn);
        node.position({
          x: 540 + column * 185,
          y: (row - (rowsPerColumn - 1) / 2) * 82,
        });
      });
    }
  }

  cy.layout({ name: 'preset', fit: false, animate: false } as LayoutOptions).run();
  fitVisibleGraph(cy);
}

export default function WordContextGraph({
  word,
  texts,
  filter,
  onFilterChange,
}: WordContextGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const filterRef = useRef(filter);
  const graphData = useMemo(() => buildGraphData(word, texts), [texts, word]);

  filterRef.current = filter;

  useEffect(() => {
    if (!containerRef.current || graphData.elements.length <= 1) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: graphData.elements,
      style: graphStyles,
      layout: {
        name: 'preset',
        fit: false,
        animate: false,
      } as LayoutOptions,
      minZoom: 0.55,
      maxZoom: 2.5,
      wheelSensitivity: 0.35,
    });

    cy.on('tap', 'node', event => {
      const node = event.target;
      const kind = String(node.data('kind'));

      if (kind === 'category') {
        onFilterChange({ category: String(node.data('category')) });
      } else if (kind === 'source') {
        onFilterChange({
          category: String(node.data('category')),
          source: String(node.data('sourceName')),
        });
      } else {
        onFilterChange(null);
      }
    });
    cy.on('tap', event => {
      if (event.target === cy) onFilterChange(null);
    });
    cy.on('mouseover', 'node', () => {
      if (containerRef.current) containerRef.current.style.cursor = 'pointer';
    });
    cy.on('mouseout', 'node', () => {
      if (containerRef.current) containerRef.current.style.cursor = 'grab';
    });

    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        cy.resize();
        arrangeGraph(cy, filterRef.current);
      });
    });
    resizeObserver.observe(containerRef.current);

    cyRef.current = cy;
    const fitFrame = requestAnimationFrame(() => arrangeGraph(cy, filterRef.current));

    return () => {
      cancelAnimationFrame(fitFrame);
      cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, [graphData.elements, onFilterChange]);

  useEffect(() => {
    if (cyRef.current) arrangeGraph(cyRef.current, filter);
  }, [filter, graphData.elements]);

  const handleZoom = useCallback((factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  }, []);

  const handleFit = useCallback(() => {
    if (cyRef.current) fitVisibleGraph(cyRef.current);
  }, []);

  const activeCategory = filter
    ? graphData.categories.find(category => category.category === filter.category)
    : null;
  const activeSource = filter?.source
    ? activeCategory?.sources.find(source => source.source === filter.source)
    : null;

  if (graphData.categories.length === 0) return null;

  return (
    <section className="glass-panel w-full min-w-0 overflow-hidden animate-in slide-in-from-top-4 duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="shrink-0 rounded-lg bg-brand-50 p-1.5 text-brand-600">
            <Network size={18} />
          </div>
          <h3 className="truncate font-semibold text-slate-800">“{word}” 연결 그래프</h3>
        </div>
        <span className="w-full text-xs text-slate-400 sm:w-auto sm:text-right">
          {graphData.categories.length}개 카테고리 · {graphData.sourceCount}개 교과/출처
        </span>
      </div>

      <div className="relative h-[500px] min-h-[500px] bg-white md:h-[460px] md:min-h-[460px]">
        <div
          ref={containerRef}
          className="h-full w-full cursor-grab bg-slate-50/40 active:cursor-grabbing"
          role="img"
          aria-label={`${word} 키워드의 카테고리와 교과 출처 연결 그래프`}
        />

        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={() => handleZoom(ZOOM_FACTOR)}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            title="그래프 확대"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={() => handleZoom(1 / ZOOM_FACTOR)}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            title="그래프 축소"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            onClick={handleFit}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            title="그래프 맞춤"
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => onFilterChange(null)}
            disabled={!filter}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
            title="선택 초기화"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div className="flex min-h-11 flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-2.5 text-xs">
        {filter && activeCategory ? (
          <>
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: activeCategory.color }}
            />
            <span className="font-semibold text-slate-700">{activeCategory.category}</span>
            {activeSource && (
              <>
                <span className="text-slate-300">/</span>
                <span className="font-medium text-slate-600">{activeSource.source}</span>
              </>
            )}
            <span className="text-slate-400">
              {(activeSource ?? activeCategory).recordCount}건 · {(activeSource ?? activeCategory).occurrenceCount}회
            </span>
          </>
        ) : (
          <span className="text-slate-500">
            전체 연결 · {texts.length}건 · {graphData.totalOccurrences}회
          </span>
        )}
      </div>
    </section>
  );
}
