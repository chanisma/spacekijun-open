/**
 * 코드로 그린 껍데기의 그림 조각(2026-11-11 꾸미기 의뢰 «글리치» — 사이버펑크 · 블랙 크롬 · 네온 · 뒷면 행성).
 * shellTheme(달걀형·여행 가방형)과 brickShell(디지털형)이 같이 쓴다 — 기종마다 다시 그리지 않으려고.
 *
 * ⚠️ 뒷면 가운데는 배터리 덮개(deviceScene «뒷면: 배터리 덮개», 위치 = buttons.y + 0.9 ± 0.85)가 껍데기 위를 덮는다.
 *    큰 그림은 덮개를 뺀 «보이는 뒷면»의 한가운데에 둔다(backEmblemSpot). 디지털형은 덮개가 위쪽이라 그림이 아래로 간다.
 */
import { toShellCanvas, type DeviceModel } from './dims';
import type { ShellSpec } from '../model/catalog';

/** deviceScene 의 배터리 덮개와 같은 수(덮개 가운데 = buttons.y + 0.9, 높이 1.7) */
const COVER_OFFSET = 0.9;
const COVER_HALF = 0.85;
/** deviceScene 의 리셋 구멍 높이(뒷면 (0.95, 0.9) 의 검은 점) — 고리가 그 위를 지나면 고리에 구멍이 난 것처럼 보였다(스크린샷) */
const RESET_Y = 0.9;

/** 뒷면 큰 그림의 자리 — 덮개 위·아래 중 넓은 띠의 가운데, 반지름은 띠에 맞춘다. text = 나머지 띠의 가운데(글씨 자리) */
export function backEmblemSpot(m: DeviceModel): { y: number; r: number; textY: number } {
  const coverY = m.buttons.y + COVER_OFFSET;
  const top: [number, number] = [coverY + COVER_HALF, m.H / 2];
  const bottom: [number, number] = [-m.H / 2, coverY - COVER_HALF];
  const len = (b: [number, number]) => b[1] - b[0];
  const [main, other] = len(top) >= len(bottom) ? [top, bottom] : [bottom, top];
  const r = Math.min(0.72, len(main) * 0.27);
  let y = (main[0] + main[1]) / 2;
  if (main === top) {
    // 위쪽 띠 = 리셋 구멍이 있는 띠 — 고리(세로 반폭 ≈ 0.5r)가 구멍 위로 지나가게 올리되, 꼭대기를 넘지 않게
    y = Math.min(Math.max(y, RESET_Y + r * 0.95), m.H / 2 - r * 1.1);
  } else {
    // 아래쪽 띠 — 달걀형은 끝으로 갈수록 좁아 덮개 쪽으로 조금 당긴다
    y += 0.08 * len(main);
  }
  return { y, r, textY: (other[0] + other[1]) / 2 };
}

function glow(g: CanvasRenderingContext2D, color: string, blur: number) {
  g.shadowColor = color;
  g.shadowBlur = blur;
}
function noGlow(g: CanvasRenderingContext2D) {
  g.shadowColor = 'rgba(0,0,0,0)';
  g.shadowBlur = 0;
}

/** 네온 테를 두른 행성 + 기울어진 고리 + 작은 위성 — 고리의 뒤쪽 반은 행성 뒤로 숨는다 */
export function drawPlanet(g: CanvasRenderingContext2D, x: number, y: number, r: number, spec: ShellSpec) {
  const [purple, cyan, pale] = spec.motifColors;
  const tilt = -0.32;
  // 빛무리
  const halo = g.createRadialGradient(x, y, r * 0.7, x, y, r * 2.2);
  halo.addColorStop(0, 'rgba(150,80,255,0.38)');
  halo.addColorStop(0.5, 'rgba(60,200,255,0.12)');
  halo.addColorStop(1, 'rgba(60,200,255,0)');
  g.fillStyle = halo;
  g.fillRect(x - r * 2.3, y - r * 2.3, r * 4.6, r * 4.6);

  const ring = (from: number, to: number) => {
    const grad = g.createLinearGradient(x - r * 2, y, x + r * 2, y);
    grad.addColorStop(0, purple);
    grad.addColorStop(0.5, pale);
    grad.addColorStop(1, cyan);
    g.strokeStyle = grad;
    g.lineWidth = r * 0.13;
    glow(g, cyan, r * 0.25);
    g.beginPath();
    g.ellipse(x, y, r * 1.9, r * 0.48, tilt, from, to);
    g.stroke();
    g.lineWidth = r * 0.04;
    g.strokeStyle = 'rgba(255,255,255,0.65)';
    g.beginPath();
    g.ellipse(x, y, r * 1.62, r * 0.38, tilt, from, to);
    g.stroke();
    noGlow(g);
  };
  ring(Math.PI, Math.PI * 2); // 뒤쪽 반(행성 뒤)

  // 행성 몸 — 왼쪽 위에서 빛을 받는 구
  const body = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  body.addColorStop(0, '#8fe9ff');
  body.addColorStop(0.35, '#6a5cff');
  body.addColorStop(0.75, '#3a168f');
  body.addColorStop(1, '#14062e');
  g.fillStyle = body;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  // 띠 무늬(구 안으로만)
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.clip();
  g.translate(x, y);
  g.rotate(tilt);
  [[-0.42, 0.1, 'rgba(255,120,240,0.28)'], [-0.05, 0.16, 'rgba(60,220,255,0.22)'], [0.4, 0.08, 'rgba(20,0,60,0.35)']].forEach(([dy, h, c]) => {
    g.fillStyle = c as string;
    g.fillRect(-r * 1.2, (dy as number) * r, r * 2.4, (h as number) * r);
  });
  g.restore();
  // 네온 테
  g.strokeStyle = purple;
  g.lineWidth = r * 0.06;
  glow(g, purple, r * 0.3);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  noGlow(g);

  ring(0, Math.PI); // 앞쪽 반(행성 앞)

  // 작은 위성
  g.fillStyle = pale;
  glow(g, pale, r * 0.2);
  g.beginPath();
  g.arc(x + r * 1.55, y - r * 1.05, r * 0.15, 0, Math.PI * 2);
  g.fill();
  noGlow(g);
}

/** 작은 회로 마디(무늬 하나 자리) — 고리 단자 또는 다리 달린 칩 */
export function drawChip(g: CanvasRenderingContext2D, x: number, y: number, r: number, roll: number) {
  if (roll < 0.5) {
    g.lineWidth = r * 0.35;
    g.strokeStyle = g.fillStyle;
    g.beginPath();
    g.arc(x, y, r * 0.55, 0, Math.PI * 2);
    g.stroke();
    return;
  }
  g.fillRect(x - r * 0.55, y - r * 0.55, r * 1.1, r * 1.1);
  for (let i = -1; i <= 1; i += 2) {
    for (let k = -1; k <= 1; k += 1) {
      g.fillRect(x + i * r * 0.55 + (i < 0 ? -r * 0.3 : 0), y + k * r * 0.32 - r * 0.06, r * 0.3, r * 0.12);
    }
  }
}

/**
 * 네온 회로 — 직각·45° 로 꺾이는 선과 끝 단자, 크롬 반사 띠, 마지막에 몇 줄을 옆으로 밀어 «글리치».
 * avoid(x, y) = 화면·버튼 자리(모델 좌표) — 선이 들어가면 그 선을 버린다.
 */
export function paintCircuit(
  g: CanvasRenderingContext2D, m: DeviceModel, size: number, spec: ShellSpec, rnd: () => number,
  avoid: (x: number, y: number) => boolean, opts: { traces?: number; glitch?: boolean } = {},
) {
  const unit = size / m.H;
  const [purple, cyan] = spec.motifColors;
  // 크롬 반사 — 비스듬한 흰 띠 둘
  [[-0.9, 0.16], [0.55, 0.07]].forEach(([at, a]) => {
    const [cx] = toShellCanvas(m, at, 0, size);
    const band = g.createLinearGradient(cx - unit * 0.6, 0, cx + unit * 0.6, size);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, `rgba(255,255,255,${a})`);
    band.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = band;
    g.fillRect(0, 0, size, size);
  });

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const traces = opts.traces ?? 34;
  for (let i = 0; i < traces; i += 1) {
    let x = (rnd() - 0.5) * m.W;
    let y = (rnd() - 0.5) * m.H;
    if (avoid(x, y)) continue;
    let [dx, dy] = dirs[Math.floor(rnd() * 4)];
    const pts: [number, number][] = [[x, y]];
    const segs = 2 + Math.floor(rnd() * 3);
    let ok = true;
    for (let s = 0; s < segs && ok; s += 1) {
      const len = 0.18 + rnd() * 0.45;
      const steps = 6;
      for (let k = 1; k <= steps; k += 1) if (avoid(x + dx * len * k / steps, y + dy * len * k / steps)) ok = false;
      if (!ok) break;
      x += dx * len;
      y += dy * len;
      pts.push([x, y]);
      // 다음 꺾임 — 45° 또는 직각
      if (rnd() < 0.4) { const nx = dx - dy, ny = dy + dx; const n = Math.hypot(nx, ny); [dx, dy] = [nx / n, ny / n]; }
      else [dx, dy] = rnd() < 0.5 ? [-dy, dx] : [dy, -dx];
    }
    if (pts.length < 2) continue;
    const color = i % 3 === 0 ? cyan : purple;
    g.strokeStyle = color;
    g.lineWidth = (0.018 + rnd() * 0.014) * unit;
    g.lineJoin = 'round';
    glow(g, color, 0.07 * unit);
    g.beginPath();
    pts.forEach(([px, py], k) => {
      const [cx, cy] = toShellCanvas(m, px, py, size);
      if (k === 0) g.moveTo(cx, cy); else g.lineTo(cx, cy);
    });
    g.stroke();
    // 끝 단자(속이 빈 고리) · 시작점 작은 점
    const [ex, ey] = toShellCanvas(m, pts[pts.length - 1][0], pts[pts.length - 1][1], size);
    g.lineWidth = 0.016 * unit;
    g.beginPath();
    g.arc(ex, ey, 0.04 * unit, 0, Math.PI * 2);
    g.stroke();
    const [sx, sy] = toShellCanvas(m, pts[0][0], pts[0][1], size);
    g.fillStyle = color;
    g.beginPath();
    g.arc(sx, sy, 0.022 * unit, 0, Math.PI * 2);
    g.fill();
    noGlow(g);
  }

  if (opts.glitch === false) return;
  // 글리치 — 얇은 가로 띠(청록 + 자홍을 조금 어긋나게) · 몇 줄을 옆으로 민다
  for (let i = 0; i < 6; i += 1) {
    const y = rnd() * size;
    const x = rnd() * size * 0.7;
    const w = (0.5 + rnd() * 1.4) * unit;
    const h = (0.02 + rnd() * 0.05) * unit;
    g.fillStyle = 'rgba(60,220,255,0.45)';
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,60,220,0.35)';
    g.fillRect(x + 0.05 * unit, y + h * 0.6, w * 0.8, h);
  }
  shiftSlices(g, size, unit, rnd, 4);
}

/** 가로 몇 줄을 잘라 옆으로 민다 — 화면이 튀는 듯한 «글리치» */
export function shiftSlices(g: CanvasRenderingContext2D, size: number, unit: number, rnd: () => number, count: number, band?: [number, number]) {
  for (let i = 0; i < count; i += 1) {
    const [lo, hi] = band ?? [0, size];
    const h = Math.max(2, Math.round((0.04 + rnd() * 0.08) * unit));
    const y = Math.round(lo + rnd() * Math.max(1, hi - lo - h));
    const shift = Math.round((rnd() < 0.5 ? -1 : 1) * (0.06 + rnd() * 0.14) * unit);
    const strip = g.getImageData(0, y, size, h);
    g.putImageData(strip, shift, y);
  }
}
