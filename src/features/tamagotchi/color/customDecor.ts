/**
 * 나만의 꾸미기 — 소품 그림(꾸미기 의뢰, 2026-10-08). 서버 버킷 tama-decor 의 투명 PNG 를 픽셀 버퍼로 받아 둔다.
 *
 * 방을 그리는 쪽은 `decoOf(id)` 하나만 부른다 — 고정 소품이면 그림 이름(DecoSprite), 나만의 소품이면 받아 둔 픽셀(PixelBuf),
 * 아직 안 왔으면 undefined(그 자리는 기본 모습). 그림이 도착하면 판 번호를 올려 방 캐시가 다시 그려지게 한다.
 * three 를 쓰지 않는다(2D·홈 경로에서도 불러도 된다).
 */
import { PixelBuf } from './pixel';
import { bumpCustomVersion, ITEM_BY_ID, type CatalogItem, type DecoSprite } from '../model/catalog';
import { readImageRgba } from './customCharacter';
import { artDecoOf } from './artSprites';

const sprites = new Map<string, PixelBuf>();
const loading = new Set<string>();

/** RGBA → 픽셀(반투명 가장자리는 잘라 도트로) — 관리자 미리보기와 학생 화면이 같은 자르기를 쓴다 */
export function decoImageToBuf(width: number, height: number, rgba: Uint8ClampedArray): PixelBuf {
  const buf = new PixelBuf(width, height);
  for (let i = 0; i < width * height; i += 1) {
    if (rgba[i * 4 + 3] < 128) continue;
    buf.data[i * 4] = rgba[i * 4]; buf.data[i * 4 + 1] = rgba[i * 4 + 1]; buf.data[i * 4 + 2] = rgba[i * 4 + 2]; buf.data[i * 4 + 3] = 255;
  }
  return buf;
}

/** 방에 놓을 소품 — 고정(그림 이름) · 나만의 것(픽셀) · 아직 없음 */
export function decoOf(id?: string | null): DecoSprite | PixelBuf | undefined {
  if (!id) return undefined;
  const item = ITEM_BY_ID.get(id);
  if (!item) return undefined;
  if (item.deco) return item.deco;
  if (item.art) return artDecoOf(id); // 가챠 물건의 공용 그림(2026-10-13)
  return item.imagePath ? sprites.get(id) : undefined;
}

/** 관리자 미리보기 — 올리기 전 그림을 잠깐 끼워 본다(null = 빼기) */
export function setCustomDecoSprite(id: string, buf: PixelBuf | null) {
  if (buf) sprites.set(id, buf); else sprites.delete(id);
  bumpCustomVersion();
}

/** 나만의 소품 그림을 받아 둔다 — 이미 있거나 받는 중이면 건너뛴다. 실패는 조용히(그 자리는 기본 모습) */
export function loadCustomDecoSprites(items: CatalogItem[], signedUrl: (path: string) => Promise<string>) {
  for (const it of items) {
    if (!it.custom || !it.imagePath) continue;
    const key = `${it.id}|${it.imagePath}`;
    if (sprites.has(it.id) || loading.has(key)) continue;
    loading.add(key);
    signedUrl(it.imagePath)
      .then(readImageRgba)
      .then(({ width, height, rgba }) => setCustomDecoSprite(it.id, decoImageToBuf(width, height, rgba)))
      .catch(() => undefined)
      .finally(() => loading.delete(key));
  }
}
