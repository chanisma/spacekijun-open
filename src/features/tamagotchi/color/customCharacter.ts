/**
 * 의뢰로 받은 캐릭터 시트(Phase 5) — PNG 한 장에 자세 다섯이 가로로: 가만히 · 기쁨 · 먹기 · 잠 · 싫어.
 *
 * 규칙(관리자가 올릴 때 검사 = `checkCharacterSheet`, 그릴 때 자르기 = `sliceCharacterSheet` — 둘이 같은 규칙):
 *   · 가로 = 칸 너비 × 5, 세로 = 칸 높이. 칸은 24~64 px(컬러 화면 128 칸 안의 펫 크기 — 기본 캐릭터가 45×40 쯤)
 *   · 배경은 투명(네 귀가 비어 있어야 한다 — 하얀 배경이 남으면 방 위에 네모가 뜬다)
 * 만드는 법은 기본 캐릭터와 같다: codex 이미지 생성 → `scripts/tamagotchi-codex/process.py`(격자 맞추기) → `make-sheet.py`.
 * three 를 쓰지 않는다(2D·홈 경로에서도 불러도 된다).
 */
import { PixelBuf } from './pixel';
import type { CustomPose } from './characters';

export const CUSTOM_POSES: readonly CustomPose[] = ['idle', 'happy', 'eat', 'sleep', 'no'];
export const CUSTOM_POSE_LABEL: Record<CustomPose, string> = { idle: '가만히', happy: '기쁨', eat: '먹기', sleep: '잠', no: '싫어' };
export const SHEET_CELL = { min: 24, max: 64 };

export interface SheetCheck { ok: boolean; reason: string | null; cell?: { w: number; h: number } }

/** 크기·투명 귀 검사(순수 함수 — 회귀가 부른다). rgba = 시트 전체의 RGBA 바이트 */
export function checkCharacterSheet(width: number, height: number, rgba: Uint8ClampedArray | null): SheetCheck {
  if (width % 5 !== 0) return { ok: false, reason: `가로(${width}px)가 5로 나누어지지 않아요 — 자세 다섯을 같은 너비로 붙여 주세요.` };
  const w = width / 5;
  const h = height;
  if (w < SHEET_CELL.min || w > SHEET_CELL.max || h < SHEET_CELL.min || h > SHEET_CELL.max) {
    return { ok: false, reason: `한 칸이 ${w}×${h}px 예요. ${SHEET_CELL.min}~${SHEET_CELL.max}px 사이여야 기기 화면에 맞아요.` };
  }
  if (rgba) {
    for (let i = 0; i < 5; i += 1) {
      const corners = [[i * w, 0], [i * w + w - 1, 0], [i * w, h - 1], [i * w + w - 1, h - 1]];
      if (corners.some(([x, y]) => rgba[(y * width + x) * 4 + 3] > 8)) {
        return { ok: false, reason: `${i + 1}번째 칸의 귀퉁이가 투명하지 않아요 — 배경을 지워 주세요.` };
      }
      let opaque = 0;
      for (let y = 0; y < h; y += 1) for (let x = i * w; x < i * w + w; x += 1) if (rgba[(y * width + x) * 4 + 3] > 128) opaque += 1;
      if (opaque < 40) return { ok: false, reason: `${i + 1}번째 칸이 거의 비어 있어요.` };
    }
  }
  return { ok: true, reason: null, cell: { w, h } };
}

/** 시트 RGBA → 자세별 픽셀 버퍼(반투명 가장자리는 잘라 도트로) */
export function sliceCharacterSheet(width: number, height: number, rgba: Uint8ClampedArray): Record<CustomPose, PixelBuf> {
  const w = width / 5;
  const out = {} as Record<CustomPose, PixelBuf>;
  CUSTOM_POSES.forEach((pose, i) => {
    const buf = new PixelBuf(w, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const s = (y * width + i * w + x) * 4;
        const d = (y * w + x) * 4;
        if (rgba[s + 3] < 128) continue;
        buf.data[d] = rgba[s]; buf.data[d + 1] = rgba[s + 1]; buf.data[d + 2] = rgba[s + 2]; buf.data[d + 3] = 255;
      }
    }
    out[pose] = buf;
  });
  return out;
}

/** 브라우저 — 주소(서명 URL·파일 URL)에서 RGBA 를 읽는다 */
export function readImageRgba(url: string): Promise<{ width: number; height: number; rgba: Uint8ClampedArray }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      resolve({ width: c.width, height: c.height, rgba: g.getImageData(0, 0, c.width, c.height).data });
    };
    img.onerror = () => reject(new Error('그림을 읽지 못했어요.'));
    img.src = url;
  });
}

export async function loadCharacterSheet(url: string): Promise<Record<CustomPose, PixelBuf>> {
  const { width, height, rgba } = await readImageRgba(url);
  const check = checkCharacterSheet(width, height, rgba);
  if (!check.ok) throw new Error(check.reason ?? '캐릭터 그림이 올바르지 않아요.');
  return sliceCharacterSheet(width, height, rgba);
}

/** 펫 의뢰서 → 그림 만드는 사람(관리자)에게 넘길 제작 지시문. 학생 글은 따옴표 안에 «원하는 모습»으로만 넣는다. */
export function characterProductionPrompt(title: string, request: string): string {
  return [
    '다마고찌 컬러 화면(128×128)의 펫 캐릭터 한 마리를 픽셀 아트로 그려 주세요.',
    `캐릭터 이름: «${title}»`,
    `학생이 원하는 모습: «${request}»`,
    '',
    '규칙',
    '- 한 장에 자세 다섯을 가로로: 가만히 · 기쁨(뛰거나 웃음) · 먹기(입 벌림) · 잠(눈 감음, Z) · 싫어(고개 돌림).',
    '- 칸마다 같은 캐릭터 · 같은 크기 · 같은 바닥선. 한 칸 48×48px 안팎, 배경은 완전히 투명.',
    '- 굵은 외곽선, 색 6~10가지, 부드러운 그라데이션 없이 도트로. 귀엽고 둥근 학교 펫 분위기.',
    '- 글자·로고·실존 인물·캐릭터 저작물(만화·게임 캐릭터)을 그리지 않는다. 폭력·공포 표현 없이.',
    '',
    '만든 뒤: scripts/tamagotchi-codex/process.py 로 격자 맞추기 → make-sheet.py 로 다섯 칸을 한 장(PNG)으로.',
  ].join('\n');
}
