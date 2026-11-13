/**
 * 작은 도트 그리기 — 컬러 화면(128×128)용.
 *
 * 캔버스의 arc·fill 은 가장자리를 부드럽게(안티앨리어싱) 칠해 도트 그림이 흐려진다. 여기서는 점마다 «도형 안인가»를
 * 판정해 칠하므로 가장자리가 딱 떨어지고, `outline` 이 바깥 한 칸에 테두리를 둘러 실물 컬러 기종의 캐릭터처럼 보인다.
 * 색은 '#rrggbb' 문자열을 미리 바이트로 바꿔 둔다(그리는 중에 문자열을 해석하지 않는다).
 */

export type Rgb = readonly [number, number, number];

const cache = new Map<string, Rgb>();
export function rgb(hex: string): Rgb {
  let v = cache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    cache.set(hex, v);
  }
  return v;
}

export class PixelBuf {
  readonly data: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  clear() { this.data.fill(0); }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  alphaAt(x: number, y: number) { return this.inside(x, y) ? this.data[(y * this.w + x) * 4 + 3] : 0; }
  /** 칠하기 — a 가 255 보다 작으면 위에 섞는다 */
  px(x: number, y: number, c: Rgb, a = 255) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    if (a >= 255) {
      this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255;
      return;
    }
    const t = a / 255;
    const d = this.data;
    const da = d[i + 3] / 255;
    const outA = t + da * (1 - t);
    if (outA <= 0) return;
    d[i] = (c[0] * t + d[i] * da * (1 - t)) / outA;
    d[i + 1] = (c[1] * t + d[i + 1] * da * (1 - t)) / outA;
    d[i + 2] = (c[2] * t + d[i + 2] * da * (1 - t)) / outA;
    d[i + 3] = outA * 255;
  }
  rect(x: number, y: number, w: number, h: number, c: Rgb, a = 255) {
    for (let yy = Math.max(0, y | 0); yy < Math.min(this.h, (y + h) | 0); yy += 1) {
      for (let xx = Math.max(0, x | 0); xx < Math.min(this.w, (x + w) | 0); xx += 1) this.px(xx, yy, c, a);
    }
  }
  /** 점의 가운데가 타원 안이면 칠한다 */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Rgb, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c, a);
      }
    }
  }
  /** 이미 칠해진 점 가운데 타원 «안»만 다시 칠한다 — 몸 위의 밝은 면·볼 */
  ellipseOnBody(cx: number, cy: number, rx: number, ry: number, c: Rgb, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && this.alphaAt(x, y) > 0) this.px(x, y, c, a);
      }
    }
  }
  /**
   * 테 그림자 — 바깥 타원(몸) «안»이면서 안쪽 타원 «밖»인 점만 칠한다.
   * 바깥 타원으로 가두지 않으면 먼저 그린 별·망토·발까지 그림자 색으로 덮인다(실제로 별 새싹이 파랗게 나왔다).
   */
  rim(outer: [number, number, number, number], inner: [number, number, number, number], c: Rgb) {
    const [ox, oy, orx, ory] = outer;
    const [ix, iy, irx, iry] = inner;
    for (let y = Math.floor(oy - ory); y <= Math.ceil(oy + ory); y += 1) {
      for (let x = Math.floor(ox - orx); x <= Math.ceil(ox + orx); x += 1) {
        const ax = (x + 0.5 - ox) / orx, ay = (y + 0.5 - oy) / ory;
        if (ax * ax + ay * ay > 1) continue;
        const bx = (x + 0.5 - ix) / irx, by = (y + 0.5 - iy) / iry;
        if (bx * bx + by * by > 1) this.px(x, y, c);
      }
    }
  }
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: Rgb) {
    const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
        const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 >= 0 && w1 >= 0 && w2 >= 0) this.px(x, y, c);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Rgb, a = 255) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** 바깥 한 칸 테두리 — 칠해진 점에 붙은 빈 점(상하좌우)을 테두리 색으로 */
  outline(c: Rgb) {
    const marks: number[] = [];
    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        if (this.alphaAt(x, y) > 0) continue;
        if (this.alphaAt(x - 1, y) || this.alphaAt(x + 1, y) || this.alphaAt(x, y - 1) || this.alphaAt(x, y + 1)) marks.push(x, y);
      }
    }
    for (let i = 0; i < marks.length; i += 2) this.px(marks[i], marks[i + 1], c);
  }
  /** 다른 버퍼를 찍는다(투명은 건너뜀) */
  blit(src: PixelBuf, x: number, y: number, opts: { flip?: boolean; alpha?: number } = {}) {
    x |= 0; y |= 0;
    for (let sy = 0; sy < src.h; sy += 1) {
      for (let sx = 0; sx < src.w; sx += 1) {
        const i = (sy * src.w + (opts.flip ? src.w - 1 - sx : sx)) * 4;
        const a = src.data[i + 3];
        if (!a) continue;
        this.px(x + sx, y + sy, [src.data[i], src.data[i + 1], src.data[i + 2]], (a * (opts.alpha ?? 1)) | 0);
      }
    }
  }
  /** 문자열 도트 그림('#' = c) */
  sprite(rows: readonly string[], x: number, y: number, c: Rgb, opts: { flip?: boolean; scale?: number } = {}) {
    const s = opts.scale ?? 1;
    const w = rows[0]?.length ?? 0;
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < w; rx += 1) {
        if (row[opts.flip ? w - 1 - rx : rx] !== '#') continue;
        this.rect(x + rx * s, y + ry * s, s, s, c);
      }
    });
  }
  /** 색 문자표 도트 그림 — 글자마다 색(공백·'.' = 투명) */
  paletteSprite(rows: readonly string[], palette: Record<string, Rgb>, x: number, y: number, opts: { flip?: boolean } = {}) {
    const w = rows[0]?.length ?? 0;
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < w; rx += 1) {
        const ch = row[opts.flip ? w - 1 - rx : rx];
        const c = palette[ch];
        if (c) this.px(x + rx, y + ry, c);
      }
    });
  }
  /** 전체를 어둡게(밤·불 끔·화면 꺼짐) */
  darken(amount: number, tint: Rgb = [8, 10, 30]) {
    const d = this.data;
    const t = Math.max(0, Math.min(1, amount));
    for (let i = 0; i < d.length; i += 4) {
      d[i] = d[i] * (1 - t) + tint[0] * t;
      d[i + 1] = d[i + 1] * (1 - t) + tint[1] * t;
      d[i + 2] = d[i + 2] * (1 - t) + tint[2] * t;
    }
  }
  /** 빠른 지문 — 그림이 바뀌었을 때만 텍스처를 다시 올린다 */
  hash(): number {
    let h = 2166136261;
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      h ^= d[i] ^ (d[i + 1] << 8) ^ (d[i + 2] << 16);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
}
