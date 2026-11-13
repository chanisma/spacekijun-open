/**
 * 여행 가방형 «교실 밖 세상» 껍데기 — 학생 의뢰(2026-11-06, 기기 종류 의뢰 첫 배송).
 *
 * 의뢰 글: 갈색·베이지 · 위 손잡이 · 모서리 보호대 · 가운데 화면 · 아래 동그란 버튼 셋 ·
 *          비행기·에펠탑·바다 같은 여행지의 우표와 스티커를 «자연스럽게» 붙인 빈티지 · 뒷면 구석 체리 모양 각인.
 * 모양(손잡이·보호대·징)은 deviceScene 이 3D 로 만들고, 여기는 몸에 입히는 그림만 그린다:
 *  - 베이지 캔버스 천(가는 씨실·날실) + 가장자리 갈색 가죽 띠와 박음질
 *  - 우표(톱니 가장자리) · 동그란 스티커 · 꼬리표 — 조금씩 기울고, 흰 칼선 테두리와 옅은 그림자, 오래돼 조금 바랬다
 *  - 뒷면: 같은 천 · 작은 표 스티커 하나 · 구석의 체리 각인(돋을무늬 맵으로 파인다)
 * 글자는 우리 학교 이름과 일반 여행 문구뿐 — 실존 상표·로고를 넣지 않는다.
 */
import { SUITCASE_MODEL, eggOutline, toShellCanvas, type DeviceModel } from './dims';
import type { ShellTheme } from './shellTheme';

const FONT = '"Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif';
const M = SUITCASE_MODEL;
/** 가장자리 가죽 띠의 폭(외곽선에서 안쪽으로) */
const BAND = 0.3;

const PAL = {
  canvasTop: '#efdfc0', canvasBottom: '#d9c194', weave: 'rgba(120, 88, 48, 0.07)',
  band: '#7a4a2b', bandDark: '#5b351d', stitch: 'rgba(246, 228, 196, 0.9)',
  ink: '#5a3720', print: '#6b4026',
};

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function canvasOf(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, g: c.getContext('2d')! };
}

function outlinePath(g: CanvasRenderingContext2D, m: DeviceModel, inset: number, size: number) {
  const pts = eggOutline(m, 220, inset);
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const [px, py] = toShellCanvas(m, x, y, size);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  });
  g.closePath();
}

/** 베이지 캔버스 천 — 위가 조금 밝다, 가는 실 무늬, 오래된 얼룩 몇 개 */
function paintCanvasCloth(g: CanvasRenderingContext2D, size: number, seed: number) {
  const base = g.createLinearGradient(0, 0, size * 0.25, size);
  base.addColorStop(0, PAL.canvasTop);
  base.addColorStop(1, PAL.canvasBottom);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const step = Math.max(2, Math.round(size / 256));
  g.fillStyle = PAL.weave;
  for (let x = 0; x < size; x += step * 2) g.fillRect(x, 0, step * 0.6, size);
  for (let y = 0; y < size; y += step * 2) g.fillRect(0, y, size, step * 0.6);
  const rnd = seeded(seed);
  for (let i = 0; i < 9; i += 1) {
    const x = rnd() * size, y = rnd() * size, r = (0.06 + rnd() * 0.16) * size;
    const blot = g.createRadialGradient(x, y, 0, x, y, r);
    blot.addColorStop(0, rnd() < 0.5 ? 'rgba(150, 110, 60, 0.08)' : 'rgba(255, 250, 235, 0.12)');
    blot.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = blot;
    g.fillRect(0, 0, size, size);
  }
}

/** 가장자리 가죽 띠 + 안쪽·바깥 박음질 */
function paintBand(g: CanvasRenderingContext2D, size: number) {
  const unit = size / M.H;
  // 띠 = 바깥 외곽선과 안쪽 외곽선 사이(짝수-홀수 채우기) — 가운데 천은 그대로 둔다
  g.save();
  g.beginPath();
  const outer = eggOutline(M, 220, -0.2);
  const inner = eggOutline(M, 220, BAND);
  [outer, inner].forEach((pts) => pts.forEach(([x, y], i) => {
    const [px, py] = toShellCanvas(M, x, y, size);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }));
  g.closePath();
  const leather = g.createLinearGradient(0, 0, 0, size);
  leather.addColorStop(0, '#87532f');
  leather.addColorStop(1, PAL.bandDark);
  g.fillStyle = leather;
  g.fill('evenodd');
  g.restore();
  g.setLineDash([0.07 * unit, 0.05 * unit]);
  g.lineWidth = 0.02 * unit;
  g.strokeStyle = PAL.stitch;
  outlinePath(g, M, BAND - 0.07, size);
  g.stroke();
  g.setLineDash([]);
  g.lineWidth = 0.025 * unit;
  g.strokeStyle = 'rgba(60, 34, 16, 0.55)';
  outlinePath(g, M, BAND, size);
  g.stroke();
}

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** 스티커 한 장 — 따로 그린 뒤 기울여 붙인다(흰 칼선 · 옅은 그림자 · 조금 바램) */
function stick(g: CanvasRenderingContext2D, size: number, x: number, y: number, w: number, h: number, rot: number, draw: Draw, round = false) {
  const unit = size / M.H;
  const pw = Math.max(8, Math.round(w * unit));
  const ph = Math.max(8, Math.round(h * unit));
  const off = document.createElement('canvas');
  off.width = pw; off.height = ph;
  const o = off.getContext('2d')!;
  draw(o, pw, ph);
  // 바램 — 위에 옅은 크림을 덮는다
  o.globalCompositeOperation = 'source-atop';
  o.fillStyle = 'rgba(245, 230, 200, 0.16)';
  o.fillRect(0, 0, pw, ph);
  const [cx, cy] = toShellCanvas(M, x, y, size);
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.shadowColor = 'rgba(70, 45, 20, 0.35)';
  g.shadowBlur = 0.04 * unit;
  g.shadowOffsetY = 0.015 * unit;
  if (round) {
    g.fillStyle = '#fbf6ea';
    g.beginPath(); g.ellipse(0, 0, pw / 2 + 0.03 * unit, ph / 2 + 0.03 * unit, 0, 0, Math.PI * 2); g.fill();
  }
  g.drawImage(off, -pw / 2, -ph / 2);
  g.restore();
}

/** 우표 — 톱니(구멍) 가장자리 흰 종이 + 안쪽 그림 */
function stamp(inner: Draw, tint: string): Draw {
  return (o, w, h) => {
    const r = Math.max(1.5, Math.min(w, h) * 0.045);
    o.fillStyle = '#fbf5e6';
    o.fillRect(0, 0, w, h);
    o.globalCompositeOperation = 'destination-out';
    const holes = (len: number, n: number, at: (t: number) => [number, number]) => {
      for (let i = 0; i <= n; i += 1) { const [hx, hy] = at((i / n) * len); o.beginPath(); o.arc(hx, hy, r, 0, Math.PI * 2); o.fill(); }
    };
    const nx = Math.max(4, Math.round(w / (r * 3.2)));
    const ny = Math.max(4, Math.round(h / (r * 3.2)));
    holes(w, nx, (t) => [t, 0]); holes(w, nx, (t) => [t, h]);
    holes(h, ny, (t) => [0, t]); holes(h, ny, (t) => [w, t]);
    o.globalCompositeOperation = 'source-over';
    const m = r * 2.2;
    o.save();
    o.beginPath(); o.rect(m, m, w - m * 2, h - m * 2); o.clip();
    o.fillStyle = tint;
    o.fillRect(m, m, w - m * 2, h - m * 2);
    o.translate(m, m);
    inner(o, w - m * 2, h - m * 2);
    o.restore();
    o.strokeStyle = 'rgba(90, 60, 30, 0.35)';
    o.lineWidth = Math.max(1, r * 0.4);
    o.strokeRect(m, m, w - m * 2, h - m * 2);
  };
}

const airplane: Draw = (o, w, h) => {
  // 하늘 그라데이션 · 구름 · 비스듬히 오르는 비행기 · 점선 비행운
  const sky = o.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#7fb6d8'); sky.addColorStop(1, '#cfe6ef');
  o.fillStyle = sky; o.fillRect(0, 0, w, h);
  o.fillStyle = 'rgba(255,255,255,0.9)';
  [[0.25, 0.75, 0.13], [0.4, 0.8, 0.1], [0.72, 0.3, 0.09]].forEach(([x, y, r]) => { o.beginPath(); o.arc(x * w, y * h, r * w, 0, Math.PI * 2); o.fill(); });
  o.save();
  o.translate(w * 0.55, h * 0.45);
  o.rotate(-0.55);
  const s = w * 0.36;
  o.fillStyle = '#fdfdfd';
  o.strokeStyle = '#38506a'; o.lineWidth = Math.max(1, s * 0.05);
  o.beginPath();
  o.moveTo(s, 0); o.quadraticCurveTo(s * 0.7, -s * 0.12, -s * 0.8, -s * 0.08); o.lineTo(-s * 0.95, -s * 0.38); o.lineTo(-s * 0.75, -s * 0.36);
  o.lineTo(-s * 0.55, -s * 0.07); o.lineTo(-s * 0.05, -s * 0.07); o.lineTo(-s * 0.35, -s * 0.62); o.lineTo(-s * 0.15, -s * 0.62);
  o.lineTo(s * 0.35, -s * 0.07); o.lineTo(s * 0.35, s * 0.07); o.lineTo(-s * 0.15, s * 0.62); o.lineTo(-s * 0.35, s * 0.62);
  o.lineTo(-s * 0.05, s * 0.07); o.lineTo(-s * 0.8, s * 0.08); o.quadraticCurveTo(s * 0.7, s * 0.12, s, 0);
  o.closePath(); o.fill(); o.stroke();
  o.restore();
  o.setLineDash([w * 0.04, w * 0.035]);
  o.strokeStyle = 'rgba(255,255,255,0.95)'; o.lineWidth = Math.max(1, w * 0.025);
  o.beginPath(); o.moveTo(w * 0.05, h * 0.95); o.quadraticCurveTo(w * 0.15, h * 0.65, w * 0.38, h * 0.62); o.stroke();
  o.setLineDash([]);
  o.fillStyle = '#2f4760'; o.font = `800 ${h * 0.12}px ${FONT}`; o.textAlign = 'left'; o.textBaseline = 'top';
  o.fillText('AIR MAIL', w * 0.07, h * 0.06);
};

const eiffel: Draw = (o, w, h) => {
  // 노을 · 둥근 해 · 철탑 실루엣(격자 몇 줄)
  const sky = o.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#f6c98d'); sky.addColorStop(0.65, '#f0a37b'); sky.addColorStop(1, '#d9876b');
  o.fillStyle = sky; o.fillRect(0, 0, w, h);
  o.fillStyle = 'rgba(255, 238, 190, 0.9)';
  o.beginPath(); o.arc(w * 0.72, h * 0.38, w * 0.16, 0, Math.PI * 2); o.fill();
  const cx = w * 0.42, top = h * 0.08, base = h * 0.98, half = w * 0.3;
  o.fillStyle = '#5a3420';
  o.beginPath();
  o.moveTo(cx - w * 0.015, top); o.lineTo(cx + w * 0.015, top);
  o.quadraticCurveTo(cx + w * 0.06, h * 0.6, cx + half, base); o.lineTo(cx + half * 0.55, base);
  o.quadraticCurveTo(cx, h * 0.78, cx - half * 0.55, base); o.lineTo(cx - half, base);
  o.quadraticCurveTo(cx - w * 0.06, h * 0.6, cx - w * 0.015, top);
  o.closePath(); o.fill();
  o.fillRect(cx - w * 0.14, h * 0.62, w * 0.28, h * 0.035);
  o.fillRect(cx - w * 0.08, h * 0.4, w * 0.16, h * 0.03);
  o.strokeStyle = 'rgba(240, 190, 140, 0.55)'; o.lineWidth = Math.max(1, w * 0.012);
  for (let i = 0; i < 4; i += 1) {
    const y = h * (0.68 + i * 0.07);
    o.beginPath(); o.moveTo(cx - w * (0.12 + i * 0.035), y); o.lineTo(cx + w * (0.12 + i * 0.035), y + h * 0.05); o.stroke();
  }
  o.fillStyle = '#5a3420'; o.font = `800 ${h * 0.1}px ${FONT}`; o.textAlign = 'right'; o.textBaseline = 'top';
  o.fillText('PARIS', w * 0.94, h * 0.06);
};

const seaSticker: Draw = (o, w, h) => {
  // 동그란 바다 스티커 — 하늘 · 해 · 돛단배 · 물결 세 겹
  o.save();
  o.beginPath(); o.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); o.clip();
  o.fillStyle = '#bfe3ee'; o.fillRect(0, 0, w, h);
  o.fillStyle = '#ffd36e'; o.beginPath(); o.arc(w * 0.7, h * 0.3, w * 0.12, 0, Math.PI * 2); o.fill();
  // 돛단배
  o.fillStyle = '#fffaf0'; o.beginPath(); o.moveTo(w * 0.36, h * 0.2); o.lineTo(w * 0.36, h * 0.52); o.lineTo(w * 0.18, h * 0.52); o.closePath(); o.fill();
  o.fillStyle = '#f08b6b'; o.beginPath(); o.moveTo(w * 0.4, h * 0.27); o.lineTo(w * 0.4, h * 0.52); o.lineTo(w * 0.52, h * 0.52); o.closePath(); o.fill();
  o.fillStyle = '#8a5432'; o.fillRect(w * 0.17, h * 0.53, w * 0.37, h * 0.05);
  ['#4d9fc4', '#2f7fae', '#1f5f8c'].forEach((col, i) => {
    const y0 = h * (0.58 + i * 0.13);
    o.fillStyle = col;
    o.beginPath(); o.moveTo(0, h);
    o.lineTo(0, y0);
    for (let x = 0; x <= w; x += w / 8) o.quadraticCurveTo(x + w / 16, y0 - h * 0.06, x + w / 8, y0);
    o.lineTo(w, h); o.closePath(); o.fill();
  });
  o.restore();
  o.strokeStyle = 'rgba(40, 90, 120, 0.6)'; o.lineWidth = Math.max(1, w * 0.03);
  o.beginPath(); o.ellipse(w / 2, h / 2, w / 2 - o.lineWidth / 2, h / 2 - o.lineWidth / 2, 0, 0, Math.PI * 2); o.stroke();
};

const balloon: Draw = (o, w, h) => {
  // 열기구 스티커 — 줄무늬 풍선 · 바구니
  o.fillStyle = '#fbf5e6';
  o.beginPath(); o.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); o.fill();
  const cx = w / 2, cy = h * 0.42, r = w * 0.3;
  o.save();
  o.beginPath(); o.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 2.15); o.lineTo(cx + r * 0.3, cy + r * 1.05); o.lineTo(cx - r * 0.3, cy + r * 1.05); o.closePath(); o.clip();
  ['#e5735f', '#f5c56b', '#6fb3a8', '#f5c56b', '#e5735f'].forEach((col, i) => { o.fillStyle = col; o.fillRect(cx - r + (i * 2 * r) / 5, cy - r, (2 * r) / 5 + 1, r * 2.2); });
  o.restore();
  o.strokeStyle = '#6b4026'; o.lineWidth = Math.max(1, w * 0.02);
  o.beginPath(); o.moveTo(cx - r * 0.3, cy + r * 1.05); o.lineTo(cx - r * 0.22, cy + r * 1.45); o.moveTo(cx + r * 0.3, cy + r * 1.05); o.lineTo(cx + r * 0.22, cy + r * 1.45); o.stroke();
  o.fillStyle = '#8a5432'; o.fillRect(cx - r * 0.28, cy + r * 1.42, r * 0.56, r * 0.32);
};

const postmark: Draw = (o, w, h) => {
  // 소인 — 잉크 동그라미 두 겹 + 물결선(종이 없이 찍힌 잉크)
  o.strokeStyle = 'rgba(70, 60, 110, 0.55)'; o.lineWidth = Math.max(1, w * 0.03);
  const r = Math.min(w, h) * 0.3;
  o.beginPath(); o.arc(w * 0.32, h / 2, r, 0, Math.PI * 2); o.stroke();
  o.beginPath(); o.arc(w * 0.32, h / 2, r * 0.74, 0, Math.PI * 2); o.stroke();
  o.fillStyle = 'rgba(70, 60, 110, 0.55)'; o.font = `800 ${r * 0.42}px ${FONT}`; o.textAlign = 'center'; o.textBaseline = 'middle';
  o.fillText('2026', w * 0.32, h / 2);
  for (let i = 0; i < 4; i += 1) {
    const y = h * (0.3 + i * 0.13);
    o.beginPath(); o.moveTo(w * 0.6, y);
    for (let x = w * 0.6; x < w * 0.98; x += w * 0.08) {
      o.quadraticCurveTo(x + w * 0.02, y - h * 0.04, x + w * 0.04, y);
      o.quadraticCurveTo(x + w * 0.06, y + h * 0.04, x + w * 0.08, y);
    }
    o.stroke();
  }
};

const luggageTag: Draw = (o, w, h) => {
  // 꼬리표 — 크림 종이 · 갈색 테 · 문구(학교 이름)
  const r = h * 0.3;
  o.fillStyle = '#f7ead0';
  o.beginPath(); o.roundRect(0, 0, w, h, r); o.fill();
  o.strokeStyle = '#8a5432'; o.lineWidth = Math.max(1, h * 0.06);
  o.beginPath(); o.roundRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16, r * 0.8); o.stroke();
  o.fillStyle = '#a43e33'; o.beginPath(); o.arc(h * 0.38, h / 2, h * 0.11, 0, Math.PI * 2); o.fill();
  o.fillStyle = '#5a3420'; o.font = `800 ${h * 0.34}px ${FONT}`; o.textAlign = 'center'; o.textBaseline = 'middle';
  o.fillText('BON VOYAGE', w * 0.56, h * 0.53);
};

const starBadge: Draw = (o, w, h) => {
  o.fillStyle = '#2f5d7c';
  o.beginPath(); o.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); o.fill();
  o.fillStyle = '#ffd36e';
  o.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = (i % 2 ? 0.2 : 0.42) * w;
    o.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr);
  }
  o.closePath(); o.fill();
};

/** 작은 체리 각인 모양 — 둥근 열매 둘 · 줄기 · 잎. stroke 로만 그린다(파인 선) */
function cherryPath(g: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  g.beginPath();
  g.arc(cx - s * 0.32, cy + s * 0.28, s * 0.27, 0, Math.PI * 2);
  g.moveTo(cx + s * 0.5, cy + s * 0.38);
  g.arc(cx + s * 0.25, cy + s * 0.38, s * 0.25, 0, Math.PI * 2);
  g.moveTo(cx - s * 0.3, cy + s * 0.01);
  g.quadraticCurveTo(cx - s * 0.15, cy - s * 0.4, cx + s * 0.12, cy - s * 0.62);
  g.moveTo(cx + s * 0.25, cy + s * 0.13);
  g.quadraticCurveTo(cx + s * 0.2, cy - s * 0.3, cx + s * 0.12, cy - s * 0.62);
  g.moveTo(cx + s * 0.12, cy - s * 0.62);
  g.quadraticCurveTo(cx + s * 0.5, cy - s * 0.85, cx + s * 0.62, cy - s * 0.5);
  g.quadraticCurveTo(cx + s * 0.35, cy - s * 0.42, cx + s * 0.12, cy - s * 0.62);
}

/** 체리 각인 자리(장치 좌표) — 뒤에서 볼 때 오른쪽 아래 구석, 배터리 덮개·모서리 보호대와 겹치지 않는 곳 */
export const CHERRY_AT = { x: -1.25, y: -2.12, s: 0.32 };

function travelFront(size: number): HTMLCanvasElement {
  const { c, g } = canvasOf(size);
  const unit = size / M.H;
  paintCanvasCloth(g, size, 1106);
  paintBand(g, size);
  // 우표·스티커 — 화면 테(±1.46, 0.25±1.46)와 버튼(아래 한 줄)을 비켜 «자연스럽게» 흩는다(띠에 걸쳐도 된다)
  stick(g, size, -1.86, 1.12, 0.66, 0.84, -0.16, stamp(airplane, '#cfe6ef'));
  stick(g, size, 1.88, 0.72, 0.62, 0.84, 0.13, stamp(eiffel, '#f6c98d'));
  stick(g, size, -1.9, -0.55, 0.66, 0.66, 0.1, seaSticker, true);
  stick(g, size, 1.86, -0.62, 0.6, 0.6, -0.2, balloon);
  stick(g, size, -1.05, 2.12, 1.08, 0.34, -0.07, luggageTag);
  stick(g, size, 1.62, -1.62, 0.62, 0.42, 0.25, postmark);
  stick(g, size, -1.72, -1.58, 0.3, 0.3, 0, starBadge, true);
  // 학교 이름 · 작은 비행기 점선
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const [lx, ly] = toShellCanvas(M, 0.62, 2.06, size);
  g.fillStyle = PAL.print;
  g.font = `800 ${0.13 * unit}px ${FONT}`;
  g.fillText('S P A C E K I J U N', lx, ly);
  g.font = `700 ${0.085 * unit}px ${FONT}`;
  g.fillStyle = 'rgba(107, 64, 38, 0.8)';
  g.fillText('교실 밖 세상 · TRAVEL EDITION', lx, ly + 0.17 * unit);
  // 버튼 글씨
  g.font = `800 ${0.13 * unit}px ${FONT}`;
  g.fillStyle = PAL.print;
  ['A', 'S', 'D'].forEach((letter, i) => {
    const [bx, by] = toShellCanvas(M, M.buttons.xs[i], M.buttons.y + M.buttons.arc[i] - 0.4, size);
    g.fillText(letter, bx, by);
  });
  return c;
}

function travelBack(size: number): HTMLCanvasElement {
  const { c, g } = canvasOf(size);
  const unit = size / M.H;
  g.translate(size, 0);
  g.scale(-1, 1);
  paintCanvasCloth(g, size, 2611);
  paintBand(g, size);
  // 뒤에서 보아 왼쪽 위의 작은 표 스티커 — 뒤집힌 문맥이라 장치 x 의 부호가 반대로 찍힌다
  stick(g, size, -1.55, 1.85, 0.62, 0.62, 0.18, seaSticker, true);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // 리셋 구멍(0.95, 0.9)보다 위 — 겹치면 글씨 위에 검은 점이 찍힌다
  const [tx, ty] = toShellCanvas(M, 0, 1.62, size);
  g.fillStyle = PAL.print;
  g.font = `800 ${0.15 * unit}px ${FONT}`;
  g.fillText('교실 밖 세상', tx, ty);
  g.font = `600 ${0.095 * unit}px ${FONT}`;
  g.fillStyle = 'rgba(107, 64, 38, 0.85)';
  g.fillText('STARLIGHT PET · 별빛 아카데미 공방', tx, ty + 0.24 * unit);
  // 체리 각인 — 파인 선(어두운 선 + 아래쪽 밝은 반사)
  const [cx, cy] = toShellCanvas(M, -CHERRY_AT.x, CHERRY_AT.y, size);
  const s = CHERRY_AT.s * unit;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 0.034 * unit;
  g.strokeStyle = 'rgba(255, 246, 225, 0.75)';
  cherryPath(g, cx + 0.008 * unit, cy + 0.012 * unit, s);
  g.stroke();
  g.strokeStyle = 'rgba(112, 74, 38, 0.82)';
  cherryPath(g, cx, cy, s);
  g.stroke();
  return c;
}

/** 앞면 돋을무늬 — 천결(아주 옅게) · 가죽 띠는 조금 솟고 박음질은 파인다 · 스티커는 종이 두께만큼 */
function travelBumpFront(size: number): HTMLCanvasElement {
  const { c, g } = canvasOf(size);
  bumpBase(g, size);
  return c;
}

function bumpBase(g: CanvasRenderingContext2D, size: number) {
  const unit = size / M.H;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  const step = Math.max(2, Math.round(size / 256));
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = 0; x < size; x += step * 2) g.fillRect(x, 0, step * 0.6, size);
  for (let y = 0; y < size; y += step * 2) g.fillRect(0, y, size, step * 0.6);
  g.save();
  g.beginPath();
  [eggOutline(M, 220, -0.2), eggOutline(M, 220, BAND)].forEach((pts) => pts.forEach(([x, y], i) => {
    const [px, py] = toShellCanvas(M, x, y, size);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }));
  g.fillStyle = '#9a9a9a';
  g.fill('evenodd');
  g.restore();
  g.setLineDash([0.07 * unit, 0.05 * unit]);
  g.lineWidth = 0.02 * unit;
  g.strokeStyle = '#5a5a5a';
  outlinePath(g, M, BAND - 0.07, size);
  g.stroke();
  g.setLineDash([]);
}

/** 뒷면 돋을무늬 — 같은 바탕에 체리 각인이 파인다(paintBack 처럼 좌우를 뒤집는다) */
function travelBumpBack(size: number): HTMLCanvasElement {
  const { c, g } = canvasOf(size);
  const unit = size / M.H;
  g.translate(size, 0);
  g.scale(-1, 1);
  bumpBase(g, size);
  const [cx, cy] = toShellCanvas(M, -CHERRY_AT.x, CHERRY_AT.y, size);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 0.04 * unit;
  g.strokeStyle = '#2a2a2a';
  cherryPath(g, cx, cy, CHERRY_AT.s * unit);
  g.stroke();
  return c;
}

export const TRAVEL_SHELL: ShellTheme = {
  id: 'travel', name: '교실 밖 세상', model: M,
  bezel: '#3a2416', button: '#f4e7cd', socket: '#5a3a24', sheen: '#fff1dc', trim: '#6e4126', iridescence: 0, label: PAL.print,
  paint: travelFront, paintBack: travelBack, bump: travelBumpFront, bumpBack: travelBumpBack,
  bumpScale: 0.9, roughness: 0.62, clearcoat: 0.25, side: '#7a4a2b',
};
