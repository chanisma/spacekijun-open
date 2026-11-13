/**
 * 이미지 문서에 서명 날인 (브라우저 전용).
 *
 * 셋 중 가장 단순하다 — 원본을 캔버스에 그리고 그 위에 서명 PNG 를 얹는다.
 * 좌표는 정규화 값이라 **원본 픽셀 크기에 곱하기만** 하면 된다(리사이즈된 미리보기에서
 * 지정했더라도 원본 해상도에 그대로 대응된다 — 정규화 좌표를 쓰는 이유가 이것이다).
 */
import { rasterizeSignature } from '@/lib/signatureRaster';
import { fitContain, isPageBox, rectToPixels, type SignaturePlacement } from './signatureField';

export interface StampItem {
  placement: SignaturePlacement;
  /** 서명 획 벡터(연수·결재와 같은 형식) */
  signature: unknown;
}

/** 원본이 손실 포맷이어도 결과는 PNG 로 낸다 — JPEG 재인코딩은 서명 선을 뭉갠다. */
const OUTPUT_MIME = 'image/png';

export async function stampImage(source: Blob, items: StampItem[]): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const page = { width: canvas.width, height: canvas.height };

  for (const item of items) {
    if (!isPageBox(item.placement)) continue; // 이미지엔 페이지가 하나뿐이라 셀 배치는 없다

    // 서명은 칸 크기에 맞춰 **고해상도로** 굽는다. 작게 굽고 확대하면 계단이 생긴다.
    const boxPx = rectToPixels(item.placement, page);
    const raster = await rasterizeSignature(item.signature, {
      scale: Math.max(2, Math.ceil((boxPx.w / 600) * 4)),
    });
    if (!raster) continue;

    const fitted = fitContain({ width: raster.width, height: raster.height }, boxPx);
    const blob = new Blob([raster.bytes as BlobPart], { type: 'image/png' });
    const sigBitmap = await createImageBitmap(blob);
    ctx.drawImage(sigBitmap, fitted.x, fitted.y, fitted.w, fitted.h);
    sigBitmap.close?.();
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('이미지를 만들지 못했습니다.'))),
      OUTPUT_MIME,
    );
  });
}
