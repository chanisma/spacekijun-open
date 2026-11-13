/**
 * 문서 페이지 렌더 — **세 포맷을 하나의 인터페이스로**.
 *
 * 박스 지정 UI 와 서명 화면이 포맷을 몰라도 되게 하는 것이 이 컴포넌트의 존재 이유다.
 * 각 포맷은 페이지를 다르게 그리지만, 밖에서 보면 전부 "가로 폭에 맞춰 늘어선 페이지들"이다.
 *
 *   HWPX  rhwp 가 SVG 문자열로 렌더 (task-workflow 의 SpecOverlayView 와 같은 엔진)
 *   PDF   pdfjs 로 캔버스에 그린다
 *   이미지 한 장짜리 페이지
 *
 * **좌표는 절대 픽셀로 밖에 내보내지 않는다** — 렌더 폭은 화면 크기에 따라 매번 다르다.
 * 오버레이는 `%` 로만 그리고, 드래그 결과도 정규화해서 돌려준다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SourceKind } from '../types';
import { ratioFromSvg } from '../lib/svgGeometry';

export interface RenderedPage {
  index: number;
  /** 원본 종횡비(높이/너비) — 폭이 정해지면 높이가 따라온다 */
  ratio: number;
  /** HWPX 는 SVG 문자열, 그 외는 이미지 URL */
  svg?: string;
  url?: string;
}

interface Props {
  source: Blob | null;
  sourceKind: SourceKind;
  /** 페이지 위에 겹칠 것(박스 등). 페이지 번호를 받아 그 페이지의 오버레이를 돌려준다 */
  renderOverlay?: (page: number) => React.ReactNode;
  /** 페이지 안에서 드래그가 끝났을 때. 좌표는 그 페이지 기준 CSS 픽셀 */
  onDragEnd?: (
    page: number,
    start: { x: number; y: number },
    end: { x: number; y: number },
    size: { width: number; height: number },
  ) => void;
  onPagesReady?: (count: number) => void;
  className?: string;
}

export const DocumentPageView: React.FC<Props> = ({
  source, sourceKind, renderOverlay, onDragEnd, onPagesReady, className,
}) => {
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!source) { setPages([]); setStatus('idle'); return; }
    let cancelled = false;
    const urls: string[] = [];

    setStatus('loading');
    (async () => {
      try {
        const rendered = await renderPages(source, sourceKind, urls);
        if (cancelled) return;
        setPages(rendered);
        setStatus('ready');
        onPagesReady?.(rendered.length);
      } catch (e) {
        if (cancelled) return;
        console.error('문서 렌더 실패', e);
        setMessage(e instanceof Error ? e.message : '문서를 열 수 없습니다.');
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      // objectURL 을 놓아 주지 않으면 큰 문서에서 메모리가 계속 쌓인다
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // onPagesReady 는 호출부에서 useCallback 으로 고정한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, sourceKind]);

  if (status === 'loading') {
    return (
      <div className={cn('flex items-center justify-center py-16 text-slate-400 gap-2', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">문서를 여는 중…</span>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 text-rose-500 gap-2', className)}>
        <AlertCircle className="h-6 w-6" />
        <p className="text-sm">{message}</p>
      </div>
    );
  }
  if (pages.length === 0) return null;

  return (
    <div className={cn('space-y-4', className)}>
      {pages.map((page) => (
        <PageCanvas
          key={page.index}
          page={page}
          overlay={renderOverlay?.(page.index)}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
};

/* ────────────────────────── 페이지 한 장 ────────────────────────── */

const PageCanvas: React.FC<{
  page: RenderedPage;
  overlay?: React.ReactNode;
  onDragEnd?: Props['onDragEnd'];
}> = ({ page, overlay, onDragEnd }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const pointAt = useCallback((e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!onDragEnd || e.button !== 0) return;
    const p = pointAt(e);
    // 포인터 캡처 — 드래그가 페이지 밖으로 나가도 끝까지 따라온다(밖으로 나간 값은 뒤에서 자른다)
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = pointAt(e);
    setDrag((d) => (d ? { ...d, x2: p.x, y2: p.y } : d));
  };

  const onPointerUp = () => {
    if (!drag || !onDragEnd || !ref.current) { setDrag(null); return; }
    const rect = ref.current.getBoundingClientRect();
    onDragEnd(
      page.index,
      { x: drag.x1, y: drag.y1 },
      { x: drag.x2, y: drag.y2 },
      { width: rect.width, height: rect.height },
    );
    setDrag(null);
  };

  return (
    /*
      쪽 번호를 위한 **여백을 실제로 확보한다**(`pt-5`).
      종전엔 `absolute -top-2` 로 페이지 위에 걸쳐 놨는데, 여백이 없으니 앞 페이지 하단이나
      sticky 툴바와 겹쳤다. 겹치지 않는 유일한 방법은 자리를 만들어 주는 것이다.
    */
    <div className="relative mx-auto w-full max-w-3xl pt-5">
      <div className="absolute left-0 top-0 text-[10px] font-medium text-slate-400">
        {page.index + 1}쪽
      </div>
      <div
        ref={ref}
        className={cn(
          'relative w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm',
          onDragEnd && 'cursor-crosshair select-none',
        )}
        style={{ aspectRatio: `1 / ${page.ratio}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
      >
        {page.svg ? (
          // rhwp 가 만든 SVG 를 그대로 넣는다. 폭 100% 로 늘려 컨테이너에 맞춘다.
          <div
            className="pointer-events-none absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: page.svg }}
          />
        ) : (
          <img
            src={page.url}
            alt={`${page.index + 1}쪽`}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        )}

        {overlay}

        {/* 드래그 중인 사각형 — 놓는 순간 실제 박스로 바뀐다 */}
        {drag && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-blue-500 bg-blue-500/10"
            style={{
              left: Math.min(drag.x1, drag.x2),
              top: Math.min(drag.y1, drag.y2),
              width: Math.abs(drag.x2 - drag.x1),
              height: Math.abs(drag.y2 - drag.y1),
            }}
          />
        )}
      </div>
    </div>
  );
};

/* ────────────────────────── 포맷별 렌더 ────────────────────────── */

async function renderPages(
  source: Blob,
  kind: SourceKind,
  urlSink: string[],
): Promise<RenderedPage[]> {
  if (kind === 'image') {
    const url = URL.createObjectURL(source);
    urlSink.push(url);
    const bitmap = await createImageBitmap(source);
    const ratio = bitmap.height / bitmap.width;
    bitmap.close?.();
    return [{ index: 0, ratio, url }];
  }

  if (kind === 'pdf') {
    // pdfjs 는 무겁다 — 문서를 실제로 열 때만 가져온다
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc ||= '/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await source.arrayBuffer()) }).promise;

    const out: RenderedPage[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      // 화면용이라 2배면 충분하다(날인은 원본 PDF 에 직접 하므로 이 해상도와 무관)
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      urlSink.push(url);
      out.push({ index: i - 1, ratio: viewport.height / viewport.width, url });
    }
    void doc.destroy();
    return out;
  }

  // HWPX — rhwp WASM
  const { loadCoreDocument } = await import('@/lib/rhwp/coreEngine');
  const doc = await loadCoreDocument(source);
  try {
    const out: RenderedPage[] = [];
    for (let p = 0; p < doc.pageCount; p += 1) {
      const svg = doc.renderPageSvg(p);
      out.push({ index: p, ratio: ratioFromSvg(svg), svg });
    }
    return out;
  } finally {
    doc.dispose();
  }
}

export default DocumentPageView;
