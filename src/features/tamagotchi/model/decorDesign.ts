/**
 * 꾸미기 의뢰(2026-10-08) — «나만의 물건»의 규칙. 순수 함수만(회귀가 부른다 · three 를 쓰지 않는다).
 *
 * 만드는 법이 자리마다 둘이다:
 *   · 색·무늬 자리(기기 디자인 · 벽지 · 러그) — 관리자가 «주 색 · 보조 색 · 무늬» 셋만 고른다(서버 tama_item.design).
 *     나머지 색(밤 색 · 테 · 버튼 …)은 여기서 같은 규칙으로 유도한다 — 서버는 값의 모양만 검사(tama_private.decor_design_ok).
 *     ⚠️ 무늬 목록·색 형식은 그 SQL 과 같아야 한다(회귀가 대조).
 *   · 소품 자리(바닥 · 선반 · 벽) — 투명 배경 픽셀 PNG(8~24px, 버킷 tama-decor). 검사 = checkDecoImage(관리자가 올릴 때) ·
 *     자르기 = color/customDecor.ts(그릴 때) — 같은 문턱을 쓴다.
 */
import { ITEM_BY_ID, type CatalogItem, type ItemSlot, type RugSpec, type ShellSpec, type WallpaperSpec } from './catalog';
import { MODELS, type DeviceStyle } from '../three/dims';

export type DecorSlot = Exclude<ItemSlot, 'character'>;
// 'device'(기기 종류) = 2026-10-13 추가 — 새 3D 모델은 개발자가 코드로 만든다(아래 DEVICE_MODEL_KEYS)
export const DECOR_SLOTS: DecorSlot[] = ['shell', 'wallpaper', 'rug', 'floor', 'shelf', 'wall', 'device'];
/** 기기 의뢰 배송에 고를 수 있는 모델 — 코드에 있는 3D 기기(컬러는 «기본»이라 물건이 아니다). 새 모델을 배포하면 여기 저절로 나타난다 */
export const DEVICE_MODEL_KEYS = (Object.keys(MODELS) as DeviceStyle[]).filter((k): k is Exclude<DeviceStyle, 'color'> => k !== 'color');
export const isModelSlot = (s: string): s is 'device' => s === 'device';
export const DESIGN_SLOTS = ['shell', 'wallpaper', 'rug'] as const;
export const IMAGE_SLOTS = ['floor', 'shelf', 'wall'] as const;
export type DesignSlot = typeof DESIGN_SLOTS[number];
export const isDesignSlot = (s: string): s is DesignSlot => (DESIGN_SLOTS as readonly string[]).includes(s);
export const isImageSlot = (s: string): s is typeof IMAGE_SLOTS[number] => (IMAGE_SLOTS as readonly string[]).includes(s);

export const SHELL_PATTERNS: { value: ShellSpec['motif']; label: string }[] = [
  { value: 'star', label: '별' }, { value: 'heart', label: '하트' }, { value: 'dot', label: '물방울' },
  { value: 'flower', label: '꽃' }, { value: 'diamond', label: '다이아' },
];
export const WALL_PATTERNS: { value: WallpaperSpec['pattern']; label: string }[] = [
  { value: 'stripes', label: '줄무늬' }, { value: 'checks', label: '체크' }, { value: 'leaves', label: '잎사귀' }, { value: 'stars', label: '별' },
];

export interface DecorDesign { main: string; accent: string; pattern?: string }

const HEX = /^#[0-9a-fA-F]{6}$/;

/** 서버가 준 design 을 믿지 않고 다시 읽는다 — 모양이 틀리면 null(그 물건은 기본 모습으로 그린다) */
export function parseDesign(slot: string, raw: unknown): DecorDesign | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.main !== 'string' || !HEX.test(r.main) || typeof r.accent !== 'string' || !HEX.test(r.accent)) return null;
  const pattern = typeof r.pattern === 'string' ? r.pattern : undefined;
  if (slot === 'shell' && !SHELL_PATTERNS.some((p) => p.value === pattern)) return null;
  if (slot === 'wallpaper' && !WALL_PATTERNS.some((p) => p.value === pattern)) return null;
  if (slot !== 'shell' && slot !== 'wallpaper' && slot !== 'rug') return null;
  return { main: r.main.toLowerCase(), accent: r.accent.toLowerCase(), ...(pattern && slot !== 'rug' ? { pattern } : {}) };
}

// ── 색 계산 ─────────────────────────────────────────────────────────
type RGB = [number, number, number];
const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
/** a → b 로 t 만큼(0 = a, 1 = b) */
export const mix = (a: string, b: string, t: number) => {
  const x = toRgb(a), y = toRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
};
const rgba = (hex: string, a: number) => { const [r, g, b] = toRgb(hex); return `rgba(${r},${g},${b},${a})`; };
/** 상대 휘도(0~1) — 어두운 주 색이면 글씨·테를 밝게 */
export function luminance(hex: string): number {
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = toRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const W = '#ffffff', K = '#000000';
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** 이 바탕 위에서 읽히는 같은 계열의 글씨 색 — 어둡게 · 밝게 둘 중 대비가 큰 쪽(중간 밝기 보라·분홍에서 한쪽만 고르면 2.5:1 에 그쳤다) */
export function readableOn(bg: string): string {
  const dark = mix(bg, K, 0.75), light = mix(bg, W, 0.9);
  return contrast(dark, bg) >= contrast(light, bg) ? dark : light;
}

export function shellSpecFromDesign(d: DecorDesign): ShellSpec {
  const dark = luminance(d.main) < 0.18;
  return {
    base: [mix(d.main, W, 0.35), d.main, mix(d.main, K, 0.12)],
    blobs: [rgba(W, 0.45), rgba(mix(d.main, W, 0.6), 0.35), rgba(d.accent, 0.3)],
    motif: (d.pattern as ShellSpec['motif']) ?? 'star',
    motifColors: ['rgba(255,255,255,0.95)', rgba(d.accent, 0.65), rgba(mix(d.accent, W, 0.4), 0.75)],
    ring: dark ? rgba(mix(d.accent, W, 0.3), 0.85) : 'rgba(255,255,255,0.9)',
    print: rgba(readableOn(d.main), 0.92),
    bezel: mix(d.main, K, dark ? 0.7 : 0.85),
    button: mix(d.main, W, 0.9),
    socket: d.accent,
    sheen: mix(d.main, W, 0.85),
    trim: mix(d.main, d.accent, 0.5),
    iridescence: 0.2,
    label: readableOn(d.main),
  };
}

export function wallpaperSpecFromDesign(d: DecorDesign): WallpaperSpec {
  return {
    day: [mix(d.main, W, 0.72), mix(d.main, W, 0.55)],
    evening: [mix(d.main, '#4a3a82', 0.6), mix(d.main, '#352a68', 0.65)],
    night: [mix(d.main, '#141033', 0.72), mix(d.main, '#0e0b26', 0.78)],
    pattern: (d.pattern as WallpaperSpec['pattern']) ?? 'stripes',
    ink: { day: mix(d.accent, W, 0.3), night: mix(d.accent, '#141033', 0.45) },
  };
}

export function rugSpecFromDesign(d: DecorDesign): RugSpec {
  return {
    outer: { day: d.main, night: mix(d.main, K, 0.5) },
    inner: { day: mix(d.accent, W, 0.3), night: mix(d.accent, K, 0.45) },
  };
}

/** 서버의 나만의 물건 한 줄 → 화면 목록의 물건. 디자인이 틀리면 null(목록에 넣지 않는다) */
export interface CustomItemRow { id: string; slot: string; name: string; design?: unknown; image_path?: string | null }
export function customItemFromRow(row: CustomItemRow): CatalogItem | null {
  if (!/^c_[a-z0-9]{1,30}$/.test(row.id) || !DECOR_SLOTS.includes(row.slot as DecorSlot)) return null;
  const base = { id: row.id, slot: row.slot as DecorSlot, rarity: 'legendary' as const, name: row.name, note: '나만의 꾸미기', custom: true as const };
  if (isImageSlot(row.slot)) return row.image_path ? { ...base, imagePath: row.image_path } : null;
  // 나만의 기기(2026-10-13) — design = {model}. 코드에 없는 모델(아직 배포 전)이면 보이지 않는다(장착되어 있어도 컬러 기기로)
  if (isModelSlot(row.slot)) {
    const model = (row.design as { model?: unknown } | null)?.model;
    return typeof model === 'string' && (DEVICE_MODEL_KEYS as string[]).includes(model) ? { ...base, device: model as Exclude<DeviceStyle, 'color'> } : null;
  }
  // 코드로 그린 껍데기(2026-11-11 «글리치») — design = {theme: 가챠 껍데기 id}, 그림은 그 물건의 사양(서버는 모양만 검사).
  // 코드에 없는 테마(아직 배포 전)면 보이지 않는다 — 나만의 기기({model})와 같은 규칙
  if (row.slot === 'shell') {
    const theme = (row.design as { theme?: unknown } | null)?.theme;
    if (theme !== undefined) {
      const item = typeof theme === 'string' ? ITEM_BY_ID.get(theme) : undefined;
      return item?.slot === 'shell' && item.shell && !item.custom ? { ...base, shell: item.shell } : null;
    }
  }
  const d = parseDesign(row.slot, row.design);
  if (!d) return null;
  if (row.slot === 'shell') return { ...base, shell: shellSpecFromDesign(d) };
  if (row.slot === 'wallpaper') return { ...base, wallpaper: wallpaperSpecFromDesign(d) };
  return { ...base, rug: rugSpecFromDesign(d) };
}

// ── 소품 그림 검사 ──────────────────────────────────────────────────
export const DECO_IMAGE = { min: 8, max: 24, minOpaque: 12 };

export function checkDecoImage(width: number, height: number, rgba: Uint8ClampedArray | null): { ok: boolean; reason: string | null } {
  if (width < DECO_IMAGE.min || height < DECO_IMAGE.min || width > DECO_IMAGE.max || height > DECO_IMAGE.max) {
    return { ok: false, reason: `그림이 ${width}×${height}px 예요. ${DECO_IMAGE.min}~${DECO_IMAGE.max}px 사이여야 방에 맞아요(방 전체가 128칸).` };
  }
  if (rgba) {
    const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
    if (corners.every(([x, y]) => rgba[(y * width + x) * 4 + 3] > 8)) {
      return { ok: false, reason: '네 귀퉁이가 모두 칠해져 있어요 — 배경을 지워 주세요(방 위에 네모가 떠요).' };
    }
    let opaque = 0;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 128) opaque += 1;
    if (opaque < DECO_IMAGE.minOpaque) return { ok: false, reason: '그림이 거의 비어 있어요.' };
  }
  return { ok: true, reason: null };
}

const SLOT_WORD: Record<DecorSlot, string> = {
  shell: '기기 디자인', wallpaper: '벽지', rug: '러그', floor: '바닥에 놓는 소품', shelf: '선반 위 소품', wall: '벽에 거는 장식', device: '기기 종류',
};

/** 기기 의뢰 → 개발 요청서(관리자가 복사해 개발자에게). 새 3D 기기는 코드로만 만들 수 있다(2026-10-13) */
export function deviceDevRequest(title: string, request: string): string {
  return [
    `다마고찌 새 기기 종류 만들기 — «${title}»`,
    `학생이 원한 것: ${request}`,
    '',
    '할 일(src/features/tamagotchi)',
    '· three/dims.ts — 새 DeviceStyle 키(영문 소문자, 예: watch) + DeviceModel(외곽선·화면 위치·크기·버튼) → MODELS 에 추가',
    '· 화면 방식 — 흑백이면 uiStyleOf 를 classic 으로, 아니면 컬러 화면 그대로',
    '· 3D 재질·기본 껍데기(three/shellTheme.ts SHELL_FOR) · 2D 대체(TamagotchiDevice2D)',
    '· 회귀 run.mts · 브라우저 하네스로 정면·비스듬히·휴대폰 확인',
    '배포 뒤: 관리자 «다마고찌 → 꾸미기 의뢰»에서 그 모델 키를 골라 배송(학생에게 «나만의 기기»).',
    '· 글자·로고·실존 제품을 그대로 베끼지 않는다',
  ].join('\n');
}

/** 관리자가 바깥(codex)에서 소품을 그릴 때 붙일 지시문 */
export function decorProductionPrompt(slot: DecorSlot, title: string, request: string): string {
  return [
    `다마고찌 방(128×128 픽셀 도트)에 놓을 «${SLOT_WORD[slot]}» 하나를 그려 주세요. 이름: «${title}»`,
    `학생이 원한 것: ${request}`,
    '',
    `· 투명 배경 PNG, 가로·세로 ${DECO_IMAGE.min}~${DECO_IMAGE.max}px(16~20px 권장) — 확대하지 않은 실제 크기`,
    '· 도트 그림체(외곽선 1px 어두운 색, 안티에일리어싱 없음) — 기존 소품(통통 공·곰 인형·작은 지구본)과 같은 크기감',
    '· 글자·로고·실존 캐릭터 금지',
  ].join('\n');
}
