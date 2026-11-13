// 스펙 오버레이 뷰(R1): 문서 페이지를 SVG로 렌더하고 스펙 타깃을 시각 하이라이트.
// 셀 클릭/텍스트 클릭 = 원터치 타깃 지정 제안(onDesignate). Studio iframe 불필요.
// 페이지는 IntersectionObserver로 lazy 렌더(다페이지 문서 대비 — form2 19p 실측).
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadCoreDocument, type CoreDocument } from '@/lib/rhwp/coreEngine';
import type { WorkSpec } from '@/features/task-workflow/document/spec';
import {
  buildLayoutModel, cellsInRect, cellsInRectAcrossPages, hitTest, KIND_COLORS,
  linearSelectionRects, namespaceSvgIds, resolveCrossPageDrag, textHitAt, textRangeAnchor,
  textRangeAnchorAcrossPages,
  type HitResult, type LayoutModel, mapSpecTargets, type FieldLocation, type TargetPlacement,
} from '@/features/task-workflow/document/spec/overlayMap';
import { Grid2x2, MousePointer2, Rows3, TextCursor } from 'lucide-react';

/** 지정 선택 모드(2026-07-27): 일반=자동 판정, 셀=셀 scalar만, 반복 행=rowGroup만, 텍스트=텍스트만 */
type DesignateMode = 'auto' | 'cell' | 'rows' | 'text';
const DESIGNATE_MODES: Array<{ key: DesignateMode; label: string; icon: typeof MousePointer2; hint: string }> = [
  { key: 'auto', label: '일반', icon: MousePointer2, hint: '자동 판정 — 셀 클릭·드래그·텍스트를 상황에 맞게 지정' },
  { key: 'cell', label: '셀', icon: Grid2x2, hint: '셀 단위 선택 — 드래그해도 셀별 단답으로 지정(표 전용)' },
  { key: 'rows', label: '반복 행', icon: Rows3, hint: '반복 행 선택 — 행을 클릭/드래그해 rowGroup으로 지정(표 전용)' },
  { key: 'text', label: '텍스트', icon: TextCursor, hint: '텍스트 선택 — 커서로 글을 긁듯 범위 지정(표 무시)' },
];

const DEFAULT_PAGE = { w: 794, h: 1123 };

export interface SpecOverlayViewProps {
  /** 문서 바이트 공급자(참조 고정 필요 — 변경 시 재로드) */
  loadSource: () => Promise<Blob | ArrayBuffer | Uint8Array>;
  spec: WorkSpec | null;
  selectedTargetId?: string | null;
  onSelectTarget?: (targetId: string) => void;
  /** 빈 위치 클릭 시 지정 제안(셀 우선, 텍스트 런 폴백) */
  onDesignate?: (hit: NonNullable<HitResult>) => void;
  className?: string;
}

export function SpecOverlayView({
  loadSource, spec, selectedTargetId, onSelectTarget, onDesignate, className,
}: SpecOverlayViewProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [model, setModel] = useState<LayoutModel | null>(null);
  const [fields, setFields] = useState<FieldLocation[]>([]);
  const [svgs, setSvgs] = useState<Record<number, string>>({});
  const [pageSizes, setPageSizes] = useState<Record<number, { w: number; h: number }>>({});
  const docRef = useRef<CoreDocument | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setSvgs({});
    (async () => {
      try {
        const doc = await loadCoreDocument(await loadSource());
        if (cancelled) {
          doc.dispose();
          return;
        }
        docRef.current?.dispose();
        docRef.current = doc;
        const pages = Array.from({ length: doc.pageCount }, (_, p) => doc.pageLayouts(p));
        setModel(buildLayoutModel(pages));
        setFields(doc.fieldList());
        setStatus('ready');
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setMessage(e instanceof Error ? e.message : '문서를 열지 못했습니다.');
        }
      }
    })();
    return () => {
      cancelled = true;
      docRef.current?.dispose();
      docRef.current = null;
    };
  }, [loadSource]);

  // 보이는 페이지만 SVG 렌더
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const p = Number((e.target as HTMLElement).dataset.page);
          setSvgs((prev) => {
            if (prev[p] != null || !docRef.current) return prev;
            const svg = namespaceSvgIds(docRef.current.renderPageSvg(p), `pg${p}`);
            const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
            if (vb) setPageSizes((s) => ({ ...s, [p]: { w: Number(vb[1]), h: Number(vb[2]) } }));
            return { ...prev, [p]: svg };
          });
        }
      },
      { root: containerRef.current, rootMargin: '600px' },
    );
    containerRef.current.querySelectorAll('[data-page]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [status, model]);

  const placements: TargetPlacement[] = useMemo(
    () => (spec && model ? mapSpecTargets(spec, model, fields) : []),
    [spec, model, fields],
  );
  const byPage = useMemo(() => {
    const out = new Map<number, { placement: TargetPlacement; rect: { x: number; y: number; w: number; h: number } }[]>();
    for (const p of placements) {
      for (const r of p.rects) {
        if (!out.has(r.pageIndex)) out.set(r.pageIndex, []);
        out.get(r.pageIndex)!.push({ placement: p, rect: r });
      }
    }
    return out;
  }, [placements]);

  // 선택 타깃으로 스크롤
  useEffect(() => {
    if (!selectedTargetId || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-target="${selectedTargetId}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selectedTargetId, placements]);

  // 드래그 지정: 러버밴드로 다중 셀(→행 그룹/셀 묶음) 또는 텍스트 범위(→앵커) 선택.
  // 2026-07-27: 페이지 경계를 넘는 드래그 + 선택 모드(일반/셀/반복 행/텍스트) 지원.
  const dragRef = useRef<{ page: number; x: number; y: number } | null>(null);
  const [band, setBand] = useState<{ sp: number; sx: number; sy: number; cp: number; cx: number; cy: number } | null>(null);
  const [designateMode, setDesignateMode] = useState<DesignateMode>('auto');

  // 텍스트 모드 드래그 중: 브라우저 텍스트 선택처럼 줄 단위 선형 하이라이트
  const linearRects = useMemo(() => {
    if (!band || designateMode !== 'text' || !model) return [];
    let { sp, sx, sy, cp, cx, cy } = band;
    if (sp > cp) {
      [sp, cp] = [cp, sp];
      [sx, cx] = [cx, sx];
      [sy, cy] = [cy, sy];
    }
    return linearSelectionRects(model, sp, sx, sy, cp, cx, cy);
  }, [band, designateMode, model]);

  const pageCoords = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const size = pageSizes[pageIndex] ?? DEFAULT_PAGE;
    const scale = box.width / size.w;
    return { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
  };

  const handleMouseDown = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const { x, y } = pageCoords(pageIndex, e);
    dragRef.current = { page: pageIndex, x, y };
    setBand(null);
  };
  const handleMouseMove = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const { x, y } = pageCoords(pageIndex, e);
    if (pageIndex !== d.page || Math.abs(x - d.x) + Math.abs(y - d.y) > 6) {
      setBand({ sp: d.page, sx: d.x, sy: d.y, cp: pageIndex, cx: x, cy: y });
    }
  };
  const handleMouseUp = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setBand(null);
    if (!model || !d) return;
    const { x, y } = pageCoords(pageIndex, e);

    if (d.page === pageIndex) {
      const isClick = Math.abs(x - d.x) + Math.abs(y - d.y) <= 6;
      if (isClick) {
        // 타깃 하이라이트 클릭 = 선택(모드 무관)
        const hitPlacement = byPage.get(pageIndex)?.find(({ rect }) =>
          x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
        if (hitPlacement) {
          onSelectTarget?.(hitPlacement.placement.targetId);
          return;
        }
        if (!onDesignate) return;
        let hit: HitResult = null;
        if (designateMode === 'text') {
          hit = textHitAt(model, pageIndex, x, y);
        } else if (designateMode === 'cell') {
          const h = hitTest(model, pageIndex, x, y);
          hit = h?.kind === 'cell' ? h : null;
        } else if (designateMode === 'rows') {
          // 클릭한 y를 지나는 행 전체를 rowGroup으로
          const h = cellsInRect(model, pageIndex, -1e9, y, 1e9, y);
          hit = h ? { ...h, preferRowGroup: true } : null;
        } else {
          hit = hitTest(model, pageIndex, x, y);
        }
        if (hit) onDesignate(hit);
        return;
      }
      // 드래그(같은 페이지) — 모드별 판정
      if (designateMode === 'text') {
        const range = textRangeAnchor(model, pageIndex, d.x, d.y, x, y);
        if (range) {
          onDesignate?.({
            kind: 'text', anchor: range.anchor, endAnchor: range.endAnchor,
            paragraphs: range.paragraphs, section: range.section, rect: range.rect,
          });
        }
        return;
      }
      const cells = cellsInRect(model, pageIndex, d.x, d.y, x, y);
      if (designateMode === 'cell') {
        if (cells) onDesignate?.({ ...cells, preferScalars: true });
        return;
      }
      if (designateMode === 'rows') {
        if (cells) onDesignate?.({ ...cells, preferRowGroup: true });
        return;
      }
      // 일반(자동): 셀 우선(다중 셀), 아니면 텍스트 범위
      if (cells && cells.cells.length > 1) {
        onDesignate?.(cells);
        return;
      }
      const range = textRangeAnchor(model, pageIndex, d.x, d.y, x, y);
      if (range) {
        onDesignate?.({
          kind: 'text', anchor: range.anchor, endAnchor: range.endAnchor,
          paragraphs: range.paragraphs, section: range.section, rect: range.rect,
        });
      } else if (cells) onDesignate?.(cells);
      return;
    }

    // 페이지 경계를 넘은 드래그: 문서 순서로 정렬 후 모드별 판정
    let sp = d.page, sx = d.x, sy = d.y, ep = pageIndex, ex = x, ey = y;
    if (sp > ep) {
      [sp, ep] = [ep, sp];
      [sx, ex] = [ex, sx];
      [sy, ey] = [ey, sy];
    }
    if (designateMode === 'text') {
      const range = textRangeAnchorAcrossPages(model, sp, sx, sy, ep, ex, ey);
      if (range) {
        onDesignate?.({
          kind: 'text', anchor: range.anchor, endAnchor: range.endAnchor,
          paragraphs: range.paragraphs, section: range.section, rect: range.rect,
        });
      }
      return;
    }
    if (designateMode === 'cell' || designateMode === 'rows') {
      const cells = cellsInRectAcrossPages(model, sp, sx, sy, ep, ex, ey);
      if (cells) {
        onDesignate?.(designateMode === 'cell'
          ? { ...cells, preferScalars: true }
          : { ...cells, preferRowGroup: true });
      }
      return;
    }
    // 일반(자동): 시작·끝점이 같은 표의 셀 위일 때만 셀 병합 우선, 아니면 텍스트 합성 우선
    const hit = resolveCrossPageDrag(model, sp, sx, sy, ep, ex, ey);
    if (hit) onDesignate?.(hit);
  };

  // 페이지 p에 걸치는 러버밴드 부분 사각(페이지 경계를 넘는 드래그도 페이지별로 표시)
  const bandRectForPage = (p: number, pageH: number): { x: number; y: number; w: number; h: number } | null => {
    if (!band) return null;
    const [p0, p1] = band.sp <= band.cp ? [band.sp, band.cp] : [band.cp, band.sp];
    if (p < p0 || p > p1) return null;
    const x0 = Math.min(band.sx, band.cx);
    const x1 = Math.max(band.sx, band.cx);
    if (p0 === p1) {
      const y0 = Math.min(band.sy, band.cy);
      const y1 = Math.max(band.sy, band.cy);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    const topY = band.sp <= band.cp ? band.sy : band.cy; // p0 페이지에서의 시작 y
    const botY = band.sp <= band.cp ? band.cy : band.sy; // p1 페이지에서의 끝 y
    if (p === p0) return { x: x0, y: topY, w: x1 - x0, h: Math.max(pageH - topY, 0) };
    if (p === p1) return { x: x0, y: 0, w: x1 - x0, h: Math.max(botY, 0) };
    return { x: x0, y: 0, w: x1 - x0, h: pageH };
  };

  if (status === 'error') {
    return (
      <div className={cn('flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/60 p-8 text-center', className)}>
        <AlertCircle className="mb-2 h-6 w-6 text-red-500" />
        <p className="text-sm text-slate-600">{message}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn('relative overflow-auto bg-slate-200', className)}>
      {/* 지정 선택 모드 툴바 — 지정 가능한 화면(onDesignate)에서만 표시 */}
      {onDesignate && status === 'ready' && (
        <div className="sticky top-2 z-20 mx-auto flex w-fit items-center gap-0.5 rounded-full border border-slate-300 bg-white/95 p-0.5 shadow-md backdrop-blur">
          {DESIGNATE_MODES.map((m) => {
            const Icon = m.icon;
            const active = designateMode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                title={m.hint}
                aria-pressed={active}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition-colors',
                  active ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                )}
                onClick={() => setDesignateMode(m.key)}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
      )}
      {status === 'loading' && (
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />문서 분석 중(레이아웃 계산)
        </div>
      )}
      {model &&
        Array.from({ length: model.pageCount }, (_, p) => {
          const size = pageSizes[p] ?? DEFAULT_PAGE;
          return (
            <div
              key={p}
              data-page={p}
              className={cn(
                'relative mx-auto my-4 max-w-full select-none bg-white shadow',
                designateMode === 'text' && onDesignate ? 'cursor-text' : 'cursor-crosshair'
              )}
              style={{ width: size.w, aspectRatio: `${size.w} / ${size.h}` }}
              onMouseDown={(e) => handleMouseDown(p, e)}
              onMouseMove={(e) => handleMouseMove(p, e)}
              onMouseUp={(e) => handleMouseUp(p, e)}
            >
              {svgs[p] != null ? (
                // eslint-disable-next-line react/no-danger
                <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svgs[p] }} />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-300">{p + 1}쪽</div>
              )}
              {designateMode === 'text' && band ? (
                // 텍스트 모드: 브라우저 텍스트 선택처럼 줄 단위 하이라이트
                linearRects
                  .filter((r) => r.pageIndex === p)
                  .map((r, i) => (
                    <div
                      key={`sel-${i}`}
                      className="pointer-events-none absolute bg-sky-400/30"
                      style={{
                        left: `${(r.x / size.w) * 100}%`, top: `${(r.y / size.h) * 100}%`,
                        width: `${(r.w / size.w) * 100}%`, height: `${(r.h / size.h) * 100}%`,
                      }}
                    />
                  ))
              ) : (() => {
                const r = bandRectForPage(p, size.h);
                if (!r || r.w <= 0 || r.h <= 0) return null;
                return (
                  <div
                    className="pointer-events-none absolute border-2 border-dashed border-sky-500 bg-sky-200/20"
                    style={{
                      left: `${(r.x / size.w) * 100}%`, top: `${(r.y / size.h) * 100}%`,
                      width: `${(r.w / size.w) * 100}%`, height: `${(r.h / size.h) * 100}%`,
                    }}
                  />
                );
              })()}
              {(byPage.get(p) ?? []).map(({ placement, rect }, i) => {
                const color = KIND_COLORS[placement.kind];
                const size2 = pageSizes[p] ?? DEFAULT_PAGE;
                const pct = (v: number, base: number) => `${(v / base) * 100}%`;
                const selected = placement.targetId === selectedTargetId;
                return (
                  <div
                    key={`${placement.targetId}-${i}`}
                    data-target={placement.targetId}
                    title={`${placement.label} · ${placement.kind}`}
                    className={cn('absolute rounded-sm border-2 transition-colors', selected && 'ring-2 ring-offset-1')}
                    style={{
                      left: pct(rect.x, size2.w), top: pct(rect.y, size2.h),
                      width: pct(rect.w, size2.w), height: pct(rect.h, size2.h),
                      borderColor: color,
                      background: `${color}${selected ? '3d' : '24'}`,
                      ['--tw-ring-color' as string]: color,
                    }}
                  >
                    {i === 0 && (
                      <span
                        className="absolute -top-4 left-0 whitespace-nowrap rounded-t px-1 text-[10px] leading-4 text-white"
                        style={{ background: color }}
                      >
                        {placement.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
    </div>
  );
}
