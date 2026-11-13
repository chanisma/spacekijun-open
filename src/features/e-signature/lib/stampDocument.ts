/**
 * 완성본 굽기 — 포맷에 따라 날인 엔진을 고른다.
 *
 * 브라우저 전용이다(rhwp WASM · pdf-lib · canvas 가 전부 클라이언트 라이브러리).
 * 무거운 의존은 **전부 동적 import** — 서명 화면을 열지 않는 사용자의 번들에 실리면 안 된다.
 */
import JSZip from 'jszip';
import { rasterizeSignature } from '@/lib/signatureRaster';
import { isPageBox, rectToPixels, fitContain, type PageBoxPlacement } from './signatureField';
import type { SignatureRequest, SourceKind } from '../types';
import type { StampItem } from './stampImage';
import { pageSizeHuFromSvg } from './svgGeometry';

/** 서명자 → 찍을 항목 목록. 서명하지 않은 사람은 빠진다. */
export function collectStampItems(request: SignatureRequest): StampItem[] {
  const items: StampItem[] = [];
  for (const signer of request.signers) {
    if (signer.status !== 'signed' || !signer.signature) continue;
    for (const placement of signer.fields) {
      items.push({ placement, signature: signer.signature });
    }
  }
  return items;
}

export function signedFileName(request: SignatureRequest): string {
  const dot = request.sourceName.lastIndexOf('.');
  const base = dot > 0 ? request.sourceName.slice(0, dot) : request.sourceName;
  const ext = extensionFor(request.sourceKind);
  return `${base}(서명본).${ext}`;
}

function extensionFor(kind: SourceKind): string {
  if (kind === 'pdf') return 'pdf';
  if (kind === 'hwpx') return 'hwpx';
  // 이미지는 항상 PNG 로 낸다 — JPEG 재인코딩은 서명 선을 뭉갠다
  return 'png';
}

export async function stampDocument(
  request: SignatureRequest,
  source: Blob,
  items: StampItem[],
): Promise<Blob> {
  if (items.length === 0) return source;

  if (request.sourceKind === 'image') {
    const { stampImage } = await import('./stampImage');
    return stampImage(source, items);
  }
  if (request.sourceKind === 'pdf') {
    const { stampPdf } = await import('./stampPdf');
    return stampPdf(source, items);
  }
  return stampHwpx(source, items);
}

/**
 * zip(OPC) 서명 확인. `.hwpx` 는 zip 이고 `.hwp` 는 아니다.
 * 로컬 헤더 `PK`, 빈 아카이브 `PK` 둘 다 통과시킨다.
 */
export function looksLikeZip(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return bytes[0] === 0x50 && bytes[1] === 0x4b
    && (bytes[2] === 0x03 || bytes[2] === 0x05) && (bytes[3] === 0x04 || bytes[3] === 0x06);
}

/* ────────────────────────────── HWPX ────────────────────────────── */

/**
 * HWPX 날인.
 *
 * 두 단계다:
 *   ① **문단 앵커 찾기** — PAPER 에 고정한 개체도 어느 문단에 속하는지가 페이지를 정한다.
 *      "3쪽에 찍으려면 3쪽에 흐르는 문단"이 필요하고, 그 번호는 rhwp 레이아웃만 안다.
 *   ② **XML 편집** — zip 을 열어 그림을 넣는다(WASM 재직렬화를 하지 않으므로 `Scripts/` 등
 *      원본 요소가 보존된다. 결재 날인에서 얻은 교훈).
 */
async function stampHwpx(source: Blob, items: StampItem[]): Promise<Blob> {
  const boxes = items.filter((i) => isPageBox(i.placement));
  /*
    결재란 칸 배치 — "'교감' 칸을 찾아 그 안에 글자처럼".
    좌표가 아니라 **칸 이름**으로 자리를 찾으므로 페이지 앵커도 용지 크기도 필요 없다.
    결재를 흡수하면서 들어온 형태라 기존 `approvalCells` 로직을 그대로 재사용한다.
  */
  const cells = items.filter((i) => i.placement.kind === 'hwpx-cell');
  if (boxes.length === 0 && cells.length === 0) return source;

  const bytes = new Uint8Array(await source.arrayBuffer());
  /*
    zip 인지 먼저 본다 — 아니면 JSZip 이
    "Can't find end of central directory : is this a zip file?" 를 던지는데,
    그 문장으로는 사용자가 무엇을 잘못했는지 알 수 없다.
    이 자리에 도달하는 비-zip 은 사실상 **`.hwp`(한글 97~2007 복합 바이너리)** 뿐이다.
    지금은 업로드에서 막지만, 그 전에 만들어진 요청이 라이브에 남아 있을 수 있어
    **서명을 다 받은 뒤 완성본을 굽는 이 자리**에서도 이유를 말해 줘야 한다.
  */
  if (!looksLikeZip(bytes)) {
    throw new Error(
      '이 문서는 한글 문서(.hwpx) 형식이 아니라 완성본을 만들 수 없습니다. ' +
      '한글 97~2007 형식(.hwp)이라면 한글에서 .hwpx 로 저장해 다시 요청해 주세요.',
    );
  }

  // ① rhwp 로 페이지 크기와 문단 앵커를 구한다 — **박스 배치가 있을 때만**.
  //    칸 배치만 있으면 WASM 을 부를 이유가 없다(로딩이 몇 초 걸린다).
  let anchors = new Map<number, PageAnchor>();
  if (boxes.length > 0) {
    const { loadCoreDocument } = await import('@/lib/rhwp/coreEngine');
    const doc = await loadCoreDocument(bytes);
    try {
      anchors = collectPageAnchors(doc, boxes.map((b) => (b.placement as PageBoxPlacement).page));
    } finally {
      doc.dispose();
    }
  }

  // ② XML 편집
  const { stampPageBoxesIntoSectionXml } = await import('./hwpxPageStamp');

  const zip = await JSZip.loadAsync(bytes);
  const sectionFile = zip.file('Contents/section0.xml');
  const manifestFile = zip.file('Contents/content.hpf');
  if (!sectionFile || !manifestFile) return source;

  const sectionXml = await sectionFile.async('string');
  let manifestXml = await manifestFile.async('string');
  let nextImage = nextImageIndex(manifestXml);

  const placements: import('./hwpxPageStamp').PageStampPlacement[] = [];
  const images: { id: string; bytes: Uint8Array }[] = [];

  for (const item of boxes) {
    const box = item.placement as PageBoxPlacement;
    const anchor = anchors.get(box.page);
    if (!anchor) continue;

    const boxHu = rectToPixels(box, { width: anchor.widthHu, height: anchor.heightHu });
    const raster = await rasterizeSignature(item.signature, { scale: 5 });
    if (!raster) continue;

    // 비율 유지 — 칸에 맞춰 늘리면 사인이 찌그러진다
    const fitted = fitContain({ width: raster.width, height: raster.height }, boxHu);

    const id = `image${nextImage}`;
    nextImage += 1;
    images.push({ id, bytes: raster.bytes });
    placements.push({
      imageId: id,
      paraIndex: anchor.paraIndex,
      xHu: fitted.x,
      yHu: fitted.y,
      widthHu: fitted.w,
      heightHu: fitted.h,
      naturalWidthPx: raster.width,
      naturalHeightPx: raster.height,
      description: '전자서명',
    });
  }

  // ── 칸 배치(결재란) — 좌표가 아니라 칸 이름으로 찾는다 ──
  const { stampSignaturesIntoSectionXml } = await import('@/lib/rhwp/approvalCells');
  const cellPlacements: { roleLabel: string; imageId: string; naturalWidthPx: number; naturalHeightPx: number; description?: string }[] = [];
  for (const item of cells) {
    const label = (item.placement as { label: string }).label;
    const raster = await rasterizeSignature(item.signature, { scale: 5 });
    if (!raster) continue;
    const id = `image${nextImage}`;
    nextImage += 1;
    images.push({ id, bytes: raster.bytes });
    cellPlacements.push({
      roleLabel: label,
      imageId: id,
      naturalWidthPx: raster.width,
      naturalHeightPx: raster.height,
      description: `${label} 서명`,
    });
  }

  // 두 방식을 **차례로** 같은 XML 에 적용한다. 각 함수가 받은 문자열을 다시 스캔하므로
  // 앞 편집이 뒤 편집의 위치를 어긋나게 하지 않는다.
  const boxResult = stampPageBoxesIntoSectionXml(sectionXml, placements);
  const cellResult = stampSignaturesIntoSectionXml(boxResult.xml, cellPlacements);

  // 한 건도 못 찍었으면 원본 그대로 — 재압축으로 얻을 것이 없다
  if (boxResult.stamped.length === 0 && cellResult.stamped.length === 0) return source;

  const placedImages = new Set(boxResult.stamped);
  for (const label of cellResult.stamped) {
    const found = cellPlacements.find((c) => c.roleLabel === label);
    if (found) placedImages.add(found.imageId);
  }
  for (const id of placedImages) {
    const image = images.find((i) => i.id === id);
    if (!image) continue;
    zip.file(`BinData/${id}.png`, image.bytes);
    manifestXml = addManifestImage(manifestXml, id);
  }

  zip.file('Contents/section0.xml', cellResult.xml);
  zip.file('Contents/content.hpf', manifestXml);

  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new Blob([out as BlobPart], { type: 'application/haansofthwpx' });
}

interface PageAnchor {
  paraIndex: number;
  widthHu: number;
  heightHu: number;
}

/**
 * 페이지별 앵커 문단과 용지 크기.
 *
 * 앵커는 **본문 문단**이어야 한다 — 표 셀 안 문단(`cellIdx` 가 있는 run)의 `paraIdx` 는
 * 셀 내부 번호라 본문 번호와 다르다. 그대로 쓰면 엉뚱한 문단에 그림이 들어간다.
 */
function collectPageAnchors(
  doc: { pageCount: number; pageLayouts: (p: number) => { runs: unknown[] }; renderPageSvg: (p: number) => string },
  pages: number[],
): Map<number, PageAnchor> {
  const out = new Map<number, PageAnchor>();
  for (const page of new Set(pages)) {
    if (page < 0 || page >= doc.pageCount) continue;

    let paraIndex: number | null = null;
    try {
      const runs = doc.pageLayouts(page).runs as Array<Record<string, unknown>>;
      const body = runs.find((r) => r.cellIdx == null && r.parentParaIdx == null && r.paraIdx != null);
      if (body) paraIndex = Number(body.paraIdx);
    } catch {
      // 레이아웃을 못 읽으면 이 페이지는 건너뛴다(다른 페이지는 계속 찍는다)
    }
    if (paraIndex == null) continue;

    const size = pageSizeHuFromSvg(safeRenderSvg(doc, page));
    out.set(page, { paraIndex, widthHu: size.width, heightHu: size.height });
  }
  return out;
}

function safeRenderSvg(doc: { renderPageSvg: (p: number) => string }, page: number): string {
  try {
    return doc.renderPageSvg(page);
  } catch {
    return '';
  }
}

/** manifest 에 이미 쓰인 `imageN` 다음 번호 — 겹치면 엉뚱한 그림이 찍힌다 */
function nextImageIndex(manifestXml: string): number {
  let max = 0;
  for (const match of manifestXml.matchAll(/id="image(\d+)"/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function addManifestImage(manifestXml: string, imageId: string): string {
  if (manifestXml.includes(`id="${imageId}"`)) return manifestXml;
  const item =
    `<opf:item id="${imageId}" href="BinData/${imageId}.png" media-type="image/png"` +
    ` isEmbeded="1"/>`;
  return manifestXml.replace('</opf:manifest>', `${item}</opf:manifest>`);
}
