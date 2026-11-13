/**
 * PDF 문서에 서명 날인 (브라우저 전용).
 *
 * **원본 PDF 를 그대로 두고 서명 이미지만 얹는다**(pdf-lib). 페이지를 래스터화해 다시
 * PDF 로 굽는 방법도 있지만 그러면 텍스트가 사라져 선택·검색이 안 되고, 파일이 몇 배로
 * 커지며, 인쇄 품질이 떨어진다.
 *
 * 좌표에서 **가장 틀리기 쉬운 지점: PDF 는 원점이 좌하단**이다. 위쪽에 지정한 서명이
 * 아래쪽에 찍히는데, 페이지 한가운데 근처 박스는 얼추 맞아 보여서 늦게 발견된다.
 * 변환은 `signatureField.rectToPdf` 단일 출처를 쓴다(회귀 테스트가 이 뒤집기를 못 박는다).
 *
 * pdf-lib 은 300KB 가 넘으므로 **동적 import** 한다 — 서명 화면을 열지 않는 사용자에게
 * 번들에 실려 나가면 안 된다.
 */
import { rasterizeSignature } from '@/lib/signatureRaster';
import { fitContain, isPageBox, rectToPdf } from './signatureField';
import type { StampItem } from './stampImage';

export async function stampPdf(source: Blob, items: StampItem[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');

  const pdf = await PDFDocument.load(await source.arrayBuffer(), {
    // 서명 필드가 있는 원본도 열 수 있게 — 우리는 이미지만 얹는다
    ignoreEncryption: true,
  });
  const pages = pdf.getPages();

  for (const item of items) {
    if (!isPageBox(item.placement)) continue;

    const page = pages[item.placement.page];
    if (!page) continue; // 페이지가 줄어든 문서로 바뀐 경우 — 조용히 건너뛴다

    const { width, height } = page.getSize();

    // 인쇄 300dpi 를 노리고 굽는다. PDF point 는 72dpi 이므로 배율 ≈ 300/72 ≈ 4.2
    const boxPt = rectToPdf(item.placement, { width, height });
    const raster = await rasterizeSignature(item.signature, {
      scale: Math.max(3, Math.ceil((boxPt.w / 100) * 4)),
    });
    if (!raster) continue;

    const png = await pdf.embedPng(raster.bytes);
    const fitted = fitContain({ width: raster.width, height: raster.height }, boxPt);

    page.drawImage(png, { x: fitted.x, y: fitted.y, width: fitted.w, height: fitted.h });
  }

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
