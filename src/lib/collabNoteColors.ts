/**
 * 협업 보드 노트 색 — **단일 출처**.
 *
 * 종전엔 색 목록이 네 벌 복붙돼 있었다(`AddNoteCard`·`StickyNote`·학생용 2벌).
 * 하나만 고치면 같은 보드를 교사 화면에서는 새 색으로, 학생 화면에서는 옛 색으로
 * 보게 되므로 **새 색·새 규칙은 반드시 여기에만 적는다**.
 *
 * ## 값의 모양이 두 가지다
 *
 * `collab_notes.color` 는 text 다. 옛 데이터는 `'yellow'` 같은 **이름**이고
 * (2026-09-18 실측: 라이브 25행 전부 이름), 보드 팔레트가 생긴 뒤로는
 * `'#ffd54f'` 같은 **hex** 가 들어간다. 마이그레이션은 하지 않았다 — 읽기가 둘 다
 * 받으므로 옛 노트는 그대로 두면 되고, 수정된 노트부터 자연히 hex 가 된다.
 * 그래서 **`note.color` 를 직접 비교하지 말고 반드시 `normalizeNoteColor()` 를 거칠 것.**
 * `'yellow' === '#fff176'` 은 false 지만 둘은 같은 색이다.
 *
 * ## 그라데이션은 계산으로 얻는다
 *
 * 옛 클래스 `from-[#e3f2fd] to-[#90caf9]` 를 재 보면 밝은 쪽이 **base 를 흰색과
 * 75% 섞은 값**과 채널당 1/255 안쪽으로 겹친다(#90caf9 → 계산 #e3f2fe, 실제 #e3f2fd).
 * 옛 값은 Material 팔레트에서 손으로 고른 것이라 완전히 같지는 않지만, 그 차이는
 * 눈에 보이지 않는다. 그래서 자유 색도 같은 공식으로 만들면 한 벌로 보인다
 * (회귀는 "정확히 같다"가 아니라 **채널당 2 이내**로 못 박는다 — 전자는 거짓이다).
 * Tailwind 임의 클래스(`from-[#…]`)는 **빌드 시점에 스캔**되므로 런타임 hex 에는
 * 쓸 수 없다 — 인라인 style 이 유일한 길이다.
 */

export interface NotePaletteEntry {
  /** `#rrggbb` 소문자 정규화 */
  color: string;
  /** 범례에 쓰는 이름. 없으면 "이름 없는 색" — 고를 수는 있지만 범례에 안 뜬다 */
  label?: string;
}

export interface NoteColorStyle {
  /** 카드 배경 (밝은 쪽 → base 그라데이션) */
  background: string;
  /** 테두리/링 */
  border: string;
  /** 본문 글자색 — 배경 대비 4.5:1 이상을 보장한다 */
  text: string;
  /** 스와치(동그라미) 배경 */
  swatch: string;
}

/** 옛 이름 → base hex. **지우지 말 것** — 라이브 노트가 이 이름으로 저장돼 있다. */
export const LEGACY_NOTE_COLORS: Record<string, { hex: string; label: string }> = {
  yellow: { hex: '#fff176', label: '노랑' },
  pink: { hex: '#f48fb1', label: '분홍' },
  blue: { hex: '#90caf9', label: '파랑' },
  green: { hex: '#a5d6a7', label: '초록' },
  purple: { hex: '#ce93d8', label: '보라' },
  orange: { hex: '#ffcc80', label: '주황' },
  white: { hex: '#ffffff', label: '흰색' },
};

export const DEFAULT_NOTE_COLOR = '#fff176';

/**
 * 보드가 팔레트를 정하지 않았을 때 쓰는 기본 색.
 * 옛 7색과 같은 값·같은 순서라 팔레트 기능을 켜기 전과 화면이 동일하다.
 */
export const DEFAULT_NOTE_PALETTE: NotePaletteEntry[] = [
  { color: '#ffffff' },
  { color: '#fff176' },
  { color: '#f48fb1' },
  { color: '#90caf9' },
  { color: '#a5d6a7' },
  { color: '#ce93d8' },
  { color: '#ffcc80' },
];

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * 어떤 모양으로 저장돼 있든 `#rrggbb` 소문자로 만든다.
 * 알 수 없는 값은 기본 색으로 떨어진다(노트가 색을 잃고 사라지는 것보다 낫다).
 */
export function normalizeNoteColor(value: string | null | undefined): string {
  if (!value) return DEFAULT_NOTE_COLOR;
  const raw = value.trim().toLowerCase();

  const legacy = LEGACY_NOTE_COLORS[raw];
  if (legacy) return legacy.hex;

  const m = HEX_RE.exec(raw);
  if (!m) return DEFAULT_NOTE_COLOR;

  const body = m[1];
  if (body.length === 3) {
    return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`;
  }
  return `#${body}`;
}

/** 저장 전 검증용 — 정규화 가능한 값인지. */
export function isValidNoteColor(value: string | null | undefined): boolean {
  if (!value) return false;
  const raw = value.trim().toLowerCase();
  return Boolean(LEGACY_NOTE_COLORS[raw]) || HEX_RE.test(raw);
}

function toRgb(hex: string): [number, number, number] {
  const h = normalizeNoteColor(hex).slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** hex 를 흰색(또는 검정)과 섞는다. `amount` 는 섞는 쪽의 비율. */
function mix(hex: string, target: [number, number, number], amount: number): string {
  const [r, g, b] = toRgb(hex);
  return toHex([
    r + (target[0] - r) * amount,
    g + (target[1] - g) * amount,
    b + (target[2] - b) * amount,
  ]);
}

/** WCAG 상대 휘도. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const INK_DARK = '#0f172a'; // slate-900
const INK_LIGHT = '#ffffff';

/**
 * 배경 위에서 읽히는 글자색. **자유 색을 허용하는 순간 필수가 된다** —
 * 진한 남색 노트에 slate-900 글씨를 그리면 글이 통째로 안 보이는데
 * 오류는 나지 않는다(dataviz 규약: 글자 4.5:1 이상).
 *
 * 판정은 그라데이션의 **어두운 끝(base)** 으로 한다 — 밝은 끝에서만 맞으면
 * 카드 아래쪽 글자가 읽히지 않는다.
 */
export function readableInk(baseHex: string): string {
  return contrastRatio(baseHex, INK_DARK) >= contrastRatio(baseHex, INK_LIGHT)
    ? INK_DARK
    : INK_LIGHT;
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

/**
 * 노트 카드에 그대로 넣는 인라인 style 값.
 * 이름이든 hex 든 같은 결과를 내므로 호출부는 값의 모양을 몰라도 된다.
 */
export function resolveNoteColorStyle(value: string | null | undefined): NoteColorStyle {
  const base = normalizeNoteColor(value);
  const tint = mix(base, WHITE, 0.75);
  const border = mix(base, BLACK, 0.14);

  return {
    background: `linear-gradient(to bottom right, ${tint}, ${base})`,
    border,
    text: readableInk(base),
    swatch: `linear-gradient(to bottom right, ${tint}, ${base})`,
  };
}

/** 사람이 읽을 색 이름. 팔레트 라벨 > 옛 이름 > hex. */
export function noteColorName(
  value: string | null | undefined,
  palette?: NotePaletteEntry[],
): string {
  const hex = normalizeNoteColor(value);
  const entry = palette?.find((p) => normalizeNoteColor(p.color) === hex);
  if (entry?.label) return entry.label;

  const legacy = Object.values(LEGACY_NOTE_COLORS).find((c) => c.hex === hex);
  return legacy?.label ?? hex;
}

// ── 보드 팔레트 (collab_boards.meta.note_palette) ─────────────────────

export const BOARD_PALETTE_META_KEY = 'note_palette';

/** 팔레트 항목 수 상한. 범례가 헤더 한 줄을 넘기지 않는 선. */
export const MAX_PALETTE_SIZE = 12;
export const MAX_PALETTE_LABEL_LENGTH = 20;

/**
 * 보드 meta 에서 팔레트를 읽는다. 없거나 망가졌으면 **기본 7색**으로 떨어진다 —
 * 팔레트가 비면 노트를 만들 때 고를 색이 하나도 없어 화면이 죽는다.
 */
export function parseBoardPalette(meta: unknown): NotePaletteEntry[] {
  const raw = (meta as Record<string, unknown> | null | undefined)?.[BOARD_PALETTE_META_KEY];
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_NOTE_PALETTE;

  const seen = new Set<string>();
  const out: NotePaletteEntry[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const colorRaw = (item as { color?: unknown }).color;
    if (typeof colorRaw !== 'string' || !isValidNoteColor(colorRaw)) continue;

    const color = normalizeNoteColor(colorRaw);
    if (seen.has(color)) continue; // 같은 색은 겹칠 수 없다
    seen.add(color);

    const labelRaw = (item as { label?: unknown }).label;
    const label =
      typeof labelRaw === 'string' && labelRaw.trim()
        ? labelRaw.trim().slice(0, MAX_PALETTE_LABEL_LENGTH)
        : undefined;

    out.push(label ? { color, label } : { color });
    if (out.length >= MAX_PALETTE_SIZE) break;
  }

  return out.length > 0 ? out : DEFAULT_NOTE_PALETTE;
}

/** 보드가 팔레트를 **직접 정했는지**. 기본값 폴백과 구분해야 편집 UI 가 정직해진다. */
export function hasCustomPalette(meta: unknown): boolean {
  const raw = (meta as Record<string, unknown> | null | undefined)?.[BOARD_PALETTE_META_KEY];
  return Array.isArray(raw) && raw.length > 0;
}

/** 범례에 뜨는 것은 **이름이 붙은 색**뿐이다. 이름 없는 색은 고르기만 한다. */
export function labeledPaletteEntries(palette: NotePaletteEntry[]): NotePaletteEntry[] {
  return palette.filter((entry): entry is Required<NotePaletteEntry> => Boolean(entry.label));
}

export interface PaletteValidationError {
  index: number;
  message: string;
}

/**
 * 저장 전 검증. **색 중복이 핵심** — 같은 색에 이름이 둘이면 범례가
 * 무엇을 뜻하는지 말할 수 없게 된다(요구사항: "같은 색이 겹칠 수는 없음").
 */
export function validatePalette(entries: NotePaletteEntry[]): PaletteValidationError[] {
  const errors: PaletteValidationError[] = [];
  const seen = new Map<string, number>();

  entries.forEach((entry, index) => {
    if (!isValidNoteColor(entry.color)) {
      errors.push({ index, message: '색 값이 올바르지 않습니다 (#RRGGBB)' });
      return;
    }
    const hex = normalizeNoteColor(entry.color);
    const first = seen.get(hex);
    if (first !== undefined) {
      errors.push({ index, message: `${first + 1}번째 색과 같습니다` });
      return;
    }
    seen.set(hex, index);

    if ((entry.label?.length ?? 0) > MAX_PALETTE_LABEL_LENGTH) {
      errors.push({ index, message: `이름은 ${MAX_PALETTE_LABEL_LENGTH}자까지입니다` });
    }
  });

  if (entries.length === 0) {
    errors.push({ index: -1, message: '색을 최소 하나는 남겨야 합니다' });
  }
  if (entries.length > MAX_PALETTE_SIZE) {
    errors.push({ index: -1, message: `색은 ${MAX_PALETTE_SIZE}개까지입니다` });
  }

  return errors;
}

/** DB 에 넣을 모양으로. 빈 라벨은 키 자체를 빼 "이름 없는 색"과 같게 만든다. */
export function serializePalette(entries: NotePaletteEntry[]): NotePaletteEntry[] {
  return entries.map((entry) => {
    const color = normalizeNoteColor(entry.color);
    const label = entry.label?.trim();
    return label ? { color, label: label.slice(0, MAX_PALETTE_LABEL_LENGTH) } : { color };
  });
}

/**
 * 색 필터 판정. 노트 색과 선택한 색을 **양쪽 다 정규화**해 비교한다 —
 * 한쪽만 하면 옛 이름 노트가 hex 범례에 영원히 안 걸린다(조용한 0건).
 */
export function noteMatchesColors(
  noteColor: string | null | undefined,
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  const hex = normalizeNoteColor(noteColor);
  return selected.some((c) => normalizeNoteColor(c) === hex);
}
