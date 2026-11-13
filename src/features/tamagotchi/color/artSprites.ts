/**
 * 가챠 물건의 공용 그림(`CatalogItem.art`, 2026-10-13) — 의뢰로 만든 캐릭터·소품을 가챠에도 넣으며 생겼다.
 *
 * 나만의 꾸미기(customDecor.ts)는 비공개 버킷에서 서명 URL 로 받지만, 가챠 물건은 누구나 가질 수 있어 public 아래 파일을 쓴다.
 * 처음 부를 때 받고(그 전엔 undefined → 그 자리는 기본 모습), 도착하면 판 번호를 올려 방·미리보기가 다시 그려지게 한다.
 * three 를 쓰지 않는다(2D·홈 경로에서도 불러도 된다).
 */
import { PixelBuf } from './pixel';
import type { CustomPose } from './characters';
import { bumpCustomVersion, ITEM_BY_ID } from '../model/catalog';
import { checkCharacterSheet, readImageRgba, sliceCharacterSheet } from './customCharacter';
import { decoImageToBuf } from './customDecor';

const decos = new Map<string, PixelBuf>();
const sheets = new Map<string, Record<CustomPose, PixelBuf>>();
const pending = new Map<string, Promise<void>>();

function load(id: string): Promise<void> {
  const item = ITEM_BY_ID.get(id);
  if (!item?.art || typeof Image === 'undefined') return Promise.resolve();
  const running = pending.get(id);
  if (running) return running;
  const job = readImageRgba(item.art)
    .then(({ width, height, rgba }) => {
      if (item.slot === 'character') {
        if (!checkCharacterSheet(width, height, rgba).ok) return;
        sheets.set(id, sliceCharacterSheet(width, height, rgba));
      } else {
        decos.set(id, decoImageToBuf(width, height, rgba));
      }
      bumpCustomVersion();
    })
    .catch(() => undefined); // 못 받으면 기본 모습 그대로(깨진 그림을 보이지 않는다)
  pending.set(id, job);
  return job;
}

/** 소품 그림 — 받아 둔 것이 없으면 받기 시작하고 undefined */
export function artDecoOf(id: string): PixelBuf | undefined {
  const buf = decos.get(id);
  if (!buf) void load(id);
  return buf;
}

/** 캐릭터 시트 — 받아 둔 것이 없으면 받기 시작하고 undefined */
export function artSheetOf(id: string): Record<CustomPose, PixelBuf> | undefined {
  const sheet = sheets.get(id);
  if (!sheet) void load(id);
  return sheet;
}

/** 캐릭터 시트를 기다려 받는다(입히는 훅이 쓴다) */
export async function loadArtSheet(id: string): Promise<Record<CustomPose, PixelBuf> | null> {
  await load(id);
  return sheets.get(id) ?? null;
}
