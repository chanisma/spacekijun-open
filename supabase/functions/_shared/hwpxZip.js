// HWPX(zip) 읽기·다시 묶기 (2026-10-20) — 엣지 함수 mcp-upload · mcp-docgen 공용. zip 라이브러리(JSZip)는 밖에서 넣는다
// (Deno 는 npm:jszip, Node 회귀는 node_modules 의 jszip — 같은 파일을 두 런타임이 부른다).
// 규칙은 웹 specTemplateService.loadHwpxSections · generateVolunteerHwpx.reorderAndExport 와 같다.

export const MAX_SECTION_CHARS = 8 * 1024 * 1024;   // 섹션 XML 합계(압축 풀린 글자) 상한 — zip 폭탄 막기
const SECTION_RE = /^Contents\/section\d+\.xml$/;

export class HwpxError extends Error {}

export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** HWPX → { zip, sectionNames, sections } (문서 순서). */
export async function loadHwpx(JSZip, bytes) {
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new HwpxError('HWPX 파일이 아닙니다(압축을 풀 수 없음). .hwp 는 한글에서 «다른 이름으로 저장 → HWPX» 로 바꿔 주세요.');
  }
  const sectionNames = Object.keys(zip.files)
    .filter((n) => SECTION_RE.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (sectionNames.length === 0) throw new HwpxError('한글 HWPX 양식이 아닙니다(Contents/section0.xml 이 없음).');
  let declared = 0;
  // 풀기 전에 선언된 크기로 먼저 거른다(내부 필드라 없으면 아래 실제 길이로 거른다)
  for (const n of sectionNames) declared += Number(zip.files[n]?._data?.uncompressedSize ?? 0);
  if (declared > MAX_SECTION_CHARS) throw new HwpxError('양식 본문이 너무 큽니다(8MB 넘음).');
  const sections = [];
  let chars = 0;
  for (const n of sectionNames) {
    const text = await zip.file(n).async('text');
    chars += text.length;
    if (chars > MAX_SECTION_CHARS) throw new HwpxError('양식 본문이 너무 큽니다(8MB 넘음).');
    sections.push(text);
  }
  return { zip, sectionNames, sections };
}

export async function readHwpxSections(JSZip, bytes) {
  return (await loadHwpx(JSZip, bytes)).sections;
}

/**
 * 채운 섹션을 같은 zip 에 넣고 다시 묶는다 — 'mimetype' 이 맨 앞 + 무압축(STORE)이어야 유효한 HWPX 다.
 * ⚠️ 웹은 여기에 rhwp WASM 의 줄 배치 재계산(normalizeHwpxLayout)을 더한다. 엣지에서는 하지 않는다 —
 *    한글은 열 때 다시 계산하므로 문서는 정상이고, rhwp Studio 로 열 때만 «비표준» 안내가 뜰 수 있다(웹은 실패해도 통과시키는 품질 단계).
 */
export async function packHwpx(JSZip, src, sections) {
  src.sectionNames.forEach((name, i) => src.zip.file(name, sections[i]));
  const out = new JSZip();
  const mime = src.zip.file('mimetype');
  if (mime) out.file('mimetype', await mime.async('uint8array'), { compression: 'STORE' });
  for (const name of Object.keys(src.zip.files)) {
    if (name === 'mimetype') continue;
    const entry = src.zip.files[name];
    if (entry.dir) { out.folder(name.replace(/\/$/, '')); continue; }
    out.file(name, await entry.async('uint8array'), { compression: 'DEFLATE' });
  }
  return out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
