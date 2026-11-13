/**
 * 서명 벡터 → PNG 래스터화 (브라우저 전용).
 *
 * 화면·인쇄는 SVG로 충분하지만 **HWPX 결재란에 넣으려면 비트맵이 필요하다** —
 * 한글 문서의 그림 컨트롤은 BinData에 이미지 바이트를 담는 구조라 SVG를 직접 못 넣는다.
 * 저장은 계속 벡터로 하고 문서에 찍는 순간에만 고해상도로 굽는다(원본이 벡터라
 * 배율을 올려도 계단이 생기지 않는 것이 이 구조의 이득).
 *
 * `signatureStrokes.ts`는 DOM에 의존하지 않아야 회귀 테스트가 돌므로 캔버스를 쓰는
 * 이 함수만 따로 뺐다.
 */

import { parseSignatureStrokes, strokePaths, type SignatureStrokes } from '@/lib/signatureStrokes';

export interface RasterOptions {
  /** 서명 좌표계 폭 1단위당 픽셀 수. 문서용은 4 이상 권장(인쇄 300dpi 대응). */
  scale?: number;
  color?: string;
  /** 선 두께(서명 좌표계 기준 비율) */
  strokeWidthRatio?: number;
  /** 가장자리 여백(서명 좌표계 단위) */
  padding?: number;
}

export interface RasterResult {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/**
 * 서명을 투명 배경 PNG로 굽는다.
 * 배경을 칠하지 않는 것이 중요하다 — 결재란 셀 위에 얹히므로 흰 사각형이 칸 테두리를 가린다.
 */
export async function rasterizeSignature(
  value: unknown,
  options: RasterOptions = {},
): Promise<RasterResult | null> {
  const strokes = parseSignatureStrokes(value);
  if (!strokes) return null;

  const { scale = 4, color = '#111827', strokeWidthRatio = 0.006, padding = 4 } = options;

  const width = Math.max(1, Math.round((strokes.w + padding * 2) * scale));
  const height = Math.max(1, Math.round((strokes.h + padding * 2) * scale));

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return null;

  ctx.setTransform(scale, 0, 0, scale, padding * scale, padding * scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(strokes.w, strokes.h) * strokeWidthRatio;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Path2D는 SVG path 문자열을 그대로 받는다 → 화면 SVG와 완전히 같은 경로를 굽는다.
  for (const d of strokePaths(strokes)) {
    ctx.stroke(new Path2D(d));
  }

  const bytes = await canvasToPngBytes(canvas);
  return bytes ? { bytes, width, height } : null;
}

/** 다운로드·미리보기용 data URL */
export async function signatureToPngDataUrl(
  value: unknown,
  options?: RasterOptions,
): Promise<string | null> {
  const result = await rasterizeSignature(value, options);
  if (!result) return null;
  let binary = '';
  for (const byte of result.bytes) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}

export type { SignatureStrokes };

// ---------------------------------------------------------------------------

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToPngBytes(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Uint8Array | null> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    (canvas as HTMLCanvasElement).toBlob(resolve, 'image/png'),
  );
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}
