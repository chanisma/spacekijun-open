import JSZip from 'jszip';
import { rasterizeSignature } from '@/lib/signatureRaster';
import { stampSignaturesIntoSectionXml, type SignaturePlacement } from './approvalCells';

/**
 * HWPX 결재란에 결재 서명을 찍는다.
 *
 * 한글 문서의 그림은 BinData에 담긴 **비트맵**이라 SVG를 넣을 수 없다 → 저장은 벡터로 두고
 * 찍는 순간에만 고해상도 PNG로 굽는다(캔버스 사용, 그래서 이 모듈은 브라우저 전용).
 *
 * **문서 조작은 zip + XML 문자열뿐이다 — WASM(@rhwp/core)을 쓰지 않는다.** 이유는
 * `approvalCells.ts` 주석 참고: core의 `insertPictureEx(cellPath)`는 그림을 용지 절대좌표에
 * 못 박힌 floating 개체로 넣어, 한글이 다시 배치하면 서명이 칸 밖으로 나갔다. 지금은 그림을
 * 셀 문단 안의 글자처럼 넣으므로 좌표가 개입하지 않는다. 덤으로 문서 전체 재직렬화가 없어져
 * 원본 요소(`Scripts/` 등)가 그대로 남고, WASM 로딩 시간도 사라졌다.
 *
 * 칸을 찾고 그림 XML을 만드는 순수 로직은 `approvalCells.ts`(회귀 테스트가 그쪽을 검사한다).
 */

export interface SignatureStamp {
  /** 결재란 칸 이름 — `approval_step.role_label` */
  roleLabel: string;
  /** 획 좌표 서명 (검증 전 raw 허용) */
  signature: unknown;
}

export interface StampOptions {
  /**
   * 서명 래스터화 함수. 기본값은 캔버스를 쓰는 `rasterizeSignature`라 브라우저 전용이다 —
   * 테스트가 고정 PNG를 주입해 문서 조작 부분만 검사할 수 있게 열어 둔다.
   */
  rasterize?: (
    signature: unknown,
  ) => Promise<{ bytes: Uint8Array; width: number; height: number } | null>;
}

export async function stampApprovalSignatures(
  source: Blob | ArrayBuffer | Uint8Array,
  stamps: SignatureStamp[],
  options: StampOptions = {},
): Promise<Blob> {
  const rasterize =
    options.rasterize ?? ((signature: unknown) => rasterizeSignature(signature, { scale: 5 }));
  const bytes = await toBytes(source);
  const usable = stamps.filter((s) => s.signature && s.roleLabel);
  if (usable.length === 0) return toBlob(bytes);

  const zip = await JSZip.loadAsync(bytes);
  const sectionFile = zip.file('Contents/section0.xml');
  const manifestFile = zip.file('Contents/content.hpf');
  if (!sectionFile || !manifestFile) return toBlob(bytes);

  const sectionXml = await sectionFile.async('string');
  let manifestXml = await manifestFile.async('string');

  // 이미 들어 있는 이미지와 id가 겹치면 엉뚱한 그림이 찍힌다.
  let nextImage = nextImageIndex(manifestXml);

  const placements: SignaturePlacement[] = [];
  const images: { id: string; bytes: Uint8Array }[] = [];

  for (const stamp of usable) {
    const raster = await rasterize(stamp.signature);
    if (!raster) continue;

    const id = `image${nextImage}`;
    nextImage += 1;
    images.push({ id, bytes: raster.bytes });
    placements.push({
      roleLabel: stamp.roleLabel,
      imageId: id,
      naturalWidthPx: raster.width,
      naturalHeightPx: raster.height,
      description: `${stamp.roleLabel} 결재 서명`,
    });
  }

  const result = stampSignaturesIntoSectionXml(sectionXml, placements);
  // 한 건도 못 찍었으면 원본 그대로 — 재압축으로 얻을 것이 없다.
  if (result.stamped.length === 0) return toBlob(bytes);

  const placed = new Set(result.stamped);
  for (const placement of placements) {
    if (!placed.has(placement.roleLabel)) continue;
    const image = images.find((i) => i.id === placement.imageId)!;
    zip.file(`BinData/${placement.imageId}.png`, image.bytes);
    manifestXml = addManifestImage(manifestXml, placement.imageId);
  }

  zip.file('Contents/section0.xml', result.xml);
  zip.file('Contents/content.hpf', manifestXml);

  return reorderAndExport(zip);
}

/** manifest에 이미 쓰인 `imageN` 다음 번호 */
function nextImageIndex(manifestXml: string): number {
  let max = 0;
  for (const match of manifestXml.matchAll(/id="image(\d+)"/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function addManifestImage(manifestXml: string, imageId: string): string {
  const item =
    `<opf:item id="${imageId}" href="BinData/${imageId}.png"` +
    ` media-type="image/png" isEmbeded="1"/>`;
  return manifestXml.replace('</opf:manifest>', `${item}</opf:manifest>`);
}

/**
 * mimetype을 **STORE·선두**로 두고 다시 압축한다(HWPX 규약 — 안 지키면 한글이 열지 못한다).
 * `generateVolunteerHwpx.reorderAndExport`와 같은 절차이나, 그쪽은 Blob 전용이라
 * 테스트에서 쓰기 위해 여기서 따로 둔다.
 */
async function reorderAndExport(zip: JSZip): Promise<Blob> {
  const mimetype = await zip.file('mimetype')!.async('uint8array');
  const ordered = new JSZip();
  ordered.file('mimetype', mimetype, { compression: 'STORE' });
  for (const name of Object.keys(zip.files)) {
    if (name === 'mimetype') continue;
    const entry = zip.files[name];
    if (entry.dir) {
      ordered.folder(name.replace(/\/$/, ''));
      continue;
    }
    ordered.file(name, await entry.async('uint8array'));
  }
  return ordered.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip' });
}

async function toBytes(source: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  return new Uint8Array(await source.arrayBuffer());
}

function toBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes], { type: 'application/octet-stream' });
}
