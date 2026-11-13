/**
 * 3D 가챠 기계 — three.js (Phase 3, 2026-10-07). 요즘 흔한 캡슐 토이 기계(가샤폰) 모양을 따른다:
 *   머리 간판 · 캡슐이 가득 찬 앞 유리창 · 동전 투입구 · 큰 손잡이(돌리면 «딸깍»마다 걸린다) · 아래 배출구와 투명 덮개.
 *
 * 손맛:
 *  - 창 안 캡슐은 간단한 물리(구–구 · 구–벽 충돌 + 중력)로 쌓여 있고, 손잡이를 돌리면 아래쪽 캡슐이 들썩인다.
 *  - 손잡이는 끌어서 돌린다(시계 방향만 — 래칫). 45°마다 «딸깍»(소리·진동·살짝 걸렸다 넘어가는 스프링). 한 바퀴면 캡슐이 나온다.
 *  - 동전은 화면 앞에서 날아와 세로로 서서 투입구로 미끄러져 들어간다(코인이 모자라면 튕겨 나온다).
 *  - 캡슐은 배출구로 «툭» 떨어져 덮개를 밀고 굴러 나온다 → 누르면 화면 앞으로 떠올라 돌려 열리고, 빛이 터진다.
 *  - 기기처럼 끌어서 돌려 본다(2026-10-07 사용자 요청) — 손잡이·캡슐이 아닌 곳을 끌면 기계가 돈다. 한동안 놓아두면 앞으로 돌아오고,
 *    동전·캡슐 연출이 시작되면 먼저 앞을 본다(그 연출은 기계가 정면일 때의 좌표로 날아간다).
 *
 * 뽑기 결과는 서버가 정한다(`tama_gacha_draw`) — 이 장면은 받은 등급 색으로 연출만 한다.
 * 성능 규칙(기기 장면과 같다): 움직일 때만 그린다 · 떠날 때 dispose · 픽셀 비율 상한 2.
 */
import * as THREE from 'three';
import { createAdaptiveQuality } from './adaptiveQuality';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { brushedRoughness, glassDust, orangePeelNormal, studioEnvironment } from './studioEnv';
import { GACHA_MACHINES, type MachineTheme } from '../model/gachaMachines';

export type GachaEvent =
  | { type: 'notch'; step: number }
  | { type: 'turned' }
  | { type: 'coinIn' }
  | { type: 'drop' }
  | { type: 'landed' }
  | { type: 'pop' };

export interface GachaScene {
  resize(w: number, h: number): void;
  insertCoin(): Promise<void>;
  rejectCoin(): Promise<void>;
  /** 동전이 들어가 손잡이를 돌릴 수 있는가 */
  setArmed(on: boolean): void;
  /** [돌리기] 버튼 — 손잡이를 한 바퀴 자동으로 */
  autoTurn(): Promise<void>;
  dispense(color: string, glow: boolean): Promise<void>;
  open(rarityColor: string, big: boolean): Promise<void>;
  /** 배출구·열린 캡슐을 치운다(다시 뽑기) */
  clear(): void;
  onEvent(cb: (e: GachaEvent) => void): void;
  /** 배출구의 캡슐을 눌렀을 때 */
  onCapsuleClick(cb: () => void): void;
  /** 손잡이 가운데·반지름(화면 좌표, CSS px) — 회귀 하네스가 끌어 돌리는 데 쓴다 */
  handleScreen(): { x: number; y: number; r: number };
  dispose(): void;
}

// ── 치수(단위: 대략 m) ──────────────────────────────────────────────────
const W = 2.0;
const D = 1.6;
const FRONT = D / 2;
const CTRL = { y0: 0.12, y1: 1.52 };
const WIN = { y0: 1.52, y1: 2.82 };
const HEAD = { y0: 2.82, y1: 3.62 };
const HANDLE = { x: 0, y: 0.92, r: 0.27 };
const SLOT = { x: 0, y: 1.34 };
const OUT = { y0: 0.14, y1: 0.5, w: 0.74, depth: 0.42 };
const CAP_R = 0.15;
const BOX = { x: W / 2 - 0.17 - CAP_R, y0: WIN.y0 + CAP_R + 0.01, y1: WIN.y1 - CAP_R, z0: -FRONT + 0.08 + CAP_R, z1: FRONT - 0.06 - CAP_R };

const ease = {
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  outBounce: (t: number) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const FONT = '"Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif';

function starPath(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function headerArt(g: CanvasRenderingContext2D, w: number, h: number, t: MachineTheme, price: number) {
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, t.header[0]);
  bg.addColorStop(0.55, t.header[1]);
  bg.addColorStop(1, t.header[2]);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i += 1) {
    g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.5})`;
    starPath(g, r() * w, r() * h, 4 + r() * 9);
    g.fill();
  }
  // 캡슐 그림
  const cc = t.capsules;
  const caps = [[cc[2 % cc.length], 0.1, 0.72], [cc[1 % cc.length], 0.88, 0.7], [cc[3 % cc.length], 0.18, 0.28], [cc[0], 0.82, 0.26]] as const;
  caps.forEach(([c, fx, fy]) => {
    const x = fx * w, y = fy * h, rr = h * 0.13;
    g.fillStyle = c;
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath(); g.arc(x, y, rr, Math.PI, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(80,50,140,0.7)'; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.stroke();
  });
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${h * 0.3}px ${FONT}`;
  g.lineJoin = 'round';
  g.lineWidth = h * 0.06;
  g.strokeStyle = t.headerStroke;
  g.strokeText(t.title, w / 2, h * 0.42);
  g.fillStyle = '#ffffff';
  g.fillText(t.title, w / 2, h * 0.42);
  g.font = `800 ${h * 0.1}px ${FONT}`;
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.fillText(t.subtitle, w / 2, h * 0.66);
  // 값 표
  const tw = w * 0.3, th = h * 0.15, tx = w / 2 - tw / 2, ty = h * 0.76;
  g.fillStyle = '#fff6c8';
  g.beginPath(); g.roundRect(tx, ty, tw, th, th / 2); g.fill();
  g.fillStyle = '#7a4a05';
  g.font = `800 ${h * 0.09}px ${FONT}`;
  g.fillText(`1회 · ${price}코인`, w / 2, ty + th / 2 + 1);
}

function backWallArt(g: CanvasRenderingContext2D, w: number, h: number, t: MachineTheme) {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, t.back[0]);
  bg.addColorStop(1, t.back[1]);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  let s = 5;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 60; i += 1) {
    g.fillStyle = `rgba(${t.backStar},${0.15 + r() * 0.25})`;
    starPath(g, r() * w, r() * h, 3 + r() * 6);
    g.fill();
  }
}

function coinFace(g: CanvasRenderingContext2D, w: number, h: number) {
  const rg = g.createRadialGradient(w * 0.4, h * 0.35, 0, w / 2, h / 2, w / 2);
  rg.addColorStop(0, '#fff3b0');
  rg.addColorStop(0.6, '#f2c14e');
  rg.addColorStop(1, '#c48a1c');
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(130,80,10,0.8)';
  g.lineWidth = w * 0.05;
  g.beginPath(); g.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(150,95,15,0.9)';
  starPath(g, w / 2, h / 2, w * 0.25);
  g.fill();
}

function sparkTexture() {
  return canvasTexture(64, 64, (g) => {
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
  });
}

function raysTexture() {
  return canvasTexture(256, 256, (g) => {
    g.translate(128, 128);
    for (let i = 0; i < 16; i += 1) {
      g.rotate((Math.PI * 2) / 16);
      const lg = g.createLinearGradient(0, 0, 128, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0.9)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(128, -10); g.lineTo(128, 10); g.closePath(); g.fill();
    }
  });
}

interface Ball { mesh: THREE.Group; p: THREE.Vector3; v: THREE.Vector3 }

export function createGachaScene(canvas: HTMLCanvasElement, opts: {
  reducedMotion?: boolean; onContextLost?: () => void;
  /** 기계 모양(2026-10-13 — 기계마다 색·간판·꼭대기 장식이 다르다). 없으면 별빛 가챠 */
  theme?: MachineTheme; price?: number;
} = {}): GachaScene {
  const reduced = !!opts.reducedMotion;
  const T = opts.theme ?? GACHA_MACHINES[0].theme;
  const PRICE = opts.price ?? GACHA_MACHINES[0].price;
  const CAPSULE_COLORS = T.capsules;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  // 느린 휴대폰이면 연출 동안 해상도를 낮춘다(Phase 7) — 유리 투과·캡슐 64개가 가장 무거운 장면이다
  const quality = createAdaptiveQuality(renderer, () => kick());
  if (import.meta.env.DEV) (window as unknown as { __gachaQuality?: () => { pr: number; drops: number } }).__gachaQuality = () => ({ pr: renderer.getPixelRatio(), drops: quality.drops });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  // 반사 환경 = 스튜디오(소프트박스·띠 조명·창살 창) — 유리·크롬·래커에 또렷한 빛이 맺혀야 고급스럽다(2026-10-07 사용자 요청)
  const envTex = studioEnvironment(renderer);
  scene.environment = envTex;
  scene.environmentIntensity = 1.0;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
  const LOOK = new THREE.Vector3(0, 1.8, 0);
  camera.position.set(0, 2.15, 9.6);
  camera.lookAt(LOOK);

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // 빛
  // 직접 빛은 줄이고 반사 환경이 형태를 그리게 한다(평평하게 밝으면 플라스틱 장난감처럼 보인다)
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1.6, 7, 6.5);
  key.castShadow = false;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 4; key.shadow.camera.bottom = -1;
  key.shadow.radius = 6;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd9c8ff, 1.0);
  rim.position.set(-4, 3, -3);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c8ff, 0.25));

  // 바닥 그림자
  const contactTex = track(canvasTexture(256, 256, (g) => {
    const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, 'rgba(60,40,110,0.42)'); rg.addColorStop(0.55, 'rgba(60,40,110,0.18)'); rg.addColorStop(1, 'rgba(60,40,110,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  }));
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(3.6, 2.6)), track(new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.002;
  scene.add(ground);

  const rig = new THREE.Group();
  rig.position.y = 1.8;
  scene.add(rig);
  const machine = new THREE.Group();
  machine.position.y = -1.8;
  rig.add(machine);
  const orbit = { yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, tyaw: 0, tpitch: 0 };
  let orbitDrag = false;
  let orbitLocked = false;
  let lastOrbitAt = 0;
  let orbitLast = { x: 0, y: 0 };

  // 재질 — 고급스러움은 색이 아니라 «겉»에서 온다(2026-10-07 사용자 요청, 참고 = 유리 구 + 래커 몸통 + 황동 부품의 제품 사진)
  //   래커 도장: 무광 바탕(거칠기 0.4대) 위 거의 거울 같은 겉칠(clearcoat) + 겉칠에만 귤껍질 결 → 넓은 빛이 부드럽게, 모서리는 또렷하게
  //   황동: 진짜 금속(metalness 1) + 헤어라인 거칠기 + 결 방향 번짐(anisotropy) — 0.75 금속은 «금색 칠»로 읽힌다
  //   크롬 띠: 이음매마다 — 사진 속 은빛 띠가 몸통을 «조립된 제품»으로 보이게 한다
  //   유리: 투과 + 얕은 감쇠색 + 겉칠 + 위에 아주 옅은 먼지 층
  const peel = track(orangePeelNormal());
  const brushed = track(brushedRoughness());
  const lacquer = (color: string, roughness = 0.42) => track(new THREE.MeshPhysicalMaterial({
    color, roughness, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.035,
    clearcoatNormalMap: peel, clearcoatNormalScale: new THREE.Vector2(0.14, 0.14),
  }));
  const plastic = (color: string, clearcoat = 0.7) => track(new THREE.MeshPhysicalMaterial({ color, roughness: 0.26, clearcoat, clearcoatRoughness: 0.05 }));
  const body = lacquer(T.body, 0.48);
  const accent = lacquer(T.accent, 0.36);
  const dark = track(new THREE.MeshStandardMaterial({ color: '#221a3d', roughness: 0.55 }));
  const inner = track(new THREE.MeshStandardMaterial({ color: T.inner, roughness: 0.85 }));
  const gold = track(new THREE.MeshPhysicalMaterial({
    color: '#e8b04e', metalness: 1, roughness: 0.62, roughnessMap: brushed, anisotropy: 0.55,
    clearcoat: 0.3, clearcoatRoughness: 0.08,
  }));
  const chrome = track(new THREE.MeshPhysicalMaterial({ color: '#f4f4f8', metalness: 1, roughness: 0.055 }));
  const glass = track(new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 0, roughness: 0.015, transmission: 1, thickness: 0.08, ior: 1.5, transparent: true,
    opacity: 1, specularIntensity: 1, envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.02,
    attenuationColor: new THREE.Color('#f1ecff'), attenuationDistance: 2.5,
    // ⚠️ three 는 투과(transmission) 재질을 반투명(transparent) 물체보다 «먼저» 그린다. 유리가 깊이를 쓰면 그 뒤의
    // 반투명 캡슐 윗뚜껑이 깊이 검사에서 통째로 떨어져 캡슐이 반쪽 그릇으로 보인다(2026-10-07 근접 스크린샷).
    depthWrite: false,
  }));

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = machine, shadow = true) => {
    const m = new THREE.Mesh(track(geo), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // 받침
  add(new RoundedBoxGeometry(W + 0.12, 0.12, D + 0.12, 5, 0.05), accent, 0, 0.06, 0);
  // 조작부 몸통 — 둥근 모서리 면을 촘촘하게(띠 조명이 모서리에서 끊기지 않고 선으로 흐른다)
  add(new RoundedBoxGeometry(W, CTRL.y1 - CTRL.y0, D, 7, 0.09), body, 0, (CTRL.y0 + CTRL.y1) / 2, 0);
  // 크롬 띠 — 받침 위 · 조작부와 창 사이 · 창과 간판 사이(이음매마다 은빛 선)
  const band = (y: number, w: number, d: number) => add(new RoundedBoxGeometry(w, 0.06, d, 4, 0.026), chrome, 0, y, 0, machine, false);
  band(0.15, W + 0.05, D + 0.05);
  band(CTRL.y1, W + 0.05, D + 0.05);
  band(HEAD.y0, W + 0.05, D + 0.05);
  // 창 기둥 · 테
  const winH = WIN.y1 - WIN.y0;
  [-1, 1].forEach((sx) => add(new RoundedBoxGeometry(0.17, winH + 0.04, D, 3, 0.06), body, sx * (W / 2 - 0.085), (WIN.y0 + WIN.y1) / 2, 0));
  add(new THREE.BoxGeometry(W - 0.2, winH, 0.06), track(new THREE.MeshStandardMaterial({ map: track(canvasTexture(512, 384, (g) => backWallArt(g, 512, 384, T))), roughness: 0.9 })), 0, (WIN.y0 + WIN.y1) / 2, -FRONT + 0.05);
  // 안쪽 옆벽(라일락) — 기둥 안쪽 면이 회색 그늘로 보이지 않게
  const innerWall = track(new THREE.MeshStandardMaterial({ color: T.innerWall, roughness: 0.9 }));
  [-1, 1].forEach((sx) => {
    const wall = add(new THREE.PlaneGeometry(D - 0.12, winH), innerWall, sx * (W / 2 - 0.172), (WIN.y0 + WIN.y1) / 2, 0, machine, false);
    wall.rotation.y = -sx * Math.PI / 2;
  });
  // 유리 반사 — 비스듬한 빛 줄 두 개(투과 유리는 밝은 배경에서 거의 안 보인다)
  const streakTex = track(canvasTexture(256, 64, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 64);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.85)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillRect(0, 0, 256, 64);
  }));
  // 이제 반사 환경이 진짜 하이라이트를 맺으므로 그려 넣은 빛 줄은 아주 옅게만(겹치면 플라스틱 판처럼 보인다)
  const streakMat = track(new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, opacity: 0.18, depthWrite: false }));
  [[-0.25, 0.35, 0.16], [0.12, 0.05, 0.07]].forEach(([dx, dy, th]) => {
    const st = add(new THREE.PlaneGeometry(2.0, th), streakMat, dx, (WIN.y0 + WIN.y1) / 2 + dy, FRONT - 0.02, machine, false);
    st.rotation.z = 0.75;
    st.renderOrder = 4;
  });
  // 유리는 두께가 있는 판 — 모서리에서 굴절·반사가 한 번 더 맺혀 «유리»로 읽힌다(얇은 면은 비닐처럼 보인다)
  const glassPane = add(new RoundedBoxGeometry(W - 0.3, winH - 0.04, 0.03, 3, 0.012), glass, 0, (WIN.y0 + WIN.y1) / 2, FRONT - 0.03, machine, false);
  glassPane.renderOrder = 2;
  // 먼지·물자국 — 아주 옅게(사진 속 유리 구의 반짝이는 점)
  const dust = add(new THREE.PlaneGeometry(W - 0.32, winH - 0.06), track(new THREE.MeshBasicMaterial({
    map: track(glassDust()), transparent: true, opacity: 0.5, depthWrite: false,
  })), 0, (WIN.y0 + WIN.y1) / 2, FRONT - 0.012, machine, false);
  dust.renderOrder = 5;
  // 창 테두리(앞)
  add(new RoundedBoxGeometry(W - 0.12, 0.08, 0.08, 2, 0.03), accent, 0, WIN.y0 + 0.03, FRONT - 0.03);
  // 머리 간판
  add(new RoundedBoxGeometry(W, HEAD.y1 - HEAD.y0, D, 7, 0.12), accent, 0, (HEAD.y0 + HEAD.y1) / 2, 0);
  const headTex = track(canvasTexture(1024, 400, (g) => headerArt(g, 1024, 400, T, PRICE)));
  add(new THREE.PlaneGeometry(W - 0.22, HEAD.y1 - HEAD.y0 - 0.14), track(new THREE.MeshPhysicalMaterial({ map: headTex, roughness: 0.25, clearcoat: 1 })), 0, (HEAD.y0 + HEAD.y1) / 2, FRONT + 0.004, machine, false);
  add(new RoundedBoxGeometry(W - 0.5, 0.1, D - 0.4, 3, 0.04), body, 0, HEAD.y1 + 0.04, 0);
  // 꼭대기 장식 — 기계마다 나오는 것을 말한다(별 = 전부 · 곰 귀 = 캐릭터 · 안테나 = 기기 · 리본 = 디자인 · 지붕 = 소품)
  {
    const topY = HEAD.y1 + 0.09;
    const deco = lacquer(T.topperColor, 0.3);
    if (T.topper === 'star') {
      const shape = new THREE.Shape();
      for (let i = 0; i < 10; i += 1) {
        const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 0.1 : 0.24;
        if (i) shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      const star = add(new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3 }), gold, 0, topY + 0.28, -0.04);
      void star;
      add(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 16), chrome, 0, topY + 0.04, 0);
    } else if (T.topper === 'ears') {
      [-1, 1].forEach((sx) => {
        add(new THREE.SphereGeometry(0.22, 32, 16), deco, sx * 0.62, topY + 0.1, 0);
        add(new THREE.SphereGeometry(0.12, 24, 12), lacquer(T.body, 0.4), sx * 0.62, topY + 0.12, 0.12, machine, false);
      });
    } else if (T.topper === 'antenna') {
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 12), chrome, 0.45, topY + 0.25, 0);
      add(new THREE.SphereGeometry(0.08, 24, 12), track(new THREE.MeshPhysicalMaterial({ color: T.topperColor, emissive: new THREE.Color(T.topperColor), emissiveIntensity: 0.6, roughness: 0.2, clearcoat: 1 })), 0.45, topY + 0.52, 0);
      add(new RoundedBoxGeometry(0.5, 0.2, 0.3, 3, 0.06), accent, -0.35, topY + 0.1, 0);
    } else if (T.topper === 'bow') {
      [-1, 1].forEach((sx) => {
        const loop = add(new THREE.TorusGeometry(0.16, 0.06, 16, 40), deco, sx * 0.19, topY + 0.2, 0);
        loop.rotation.z = sx * 0.5;
        loop.scale.set(1.25, 0.8, 1);
      });
      add(new THREE.SphereGeometry(0.08, 24, 12), deco, 0, topY + 0.2, 0.02);
    } else {
      const roof = add(new THREE.ConeGeometry(0.95, 0.42, 4, 1), deco, 0, topY + 0.21, 0);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1, 1, D / W);
      add(new RoundedBoxGeometry(0.16, 0.26, 0.16, 2, 0.03), lacquer(T.body, 0.4), 0.42, topY + 0.32, -0.1);
    }
  }

  // 옆면 인쇄 — 돌려 볼 때 옆이 하얀 판으로만 보이지 않게(캡슐 그림 · 세로 글씨)
  const sideTex = track(canvasTexture(512, 512, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, 512);
    bg.addColorStop(0, T.side[0]); bg.addColorStop(1, T.side[1]);
    g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
    let sd = 3;
    const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i += 1) {
      const x = rr() * 512, y = rr() * 512, rad = 22 + rr() * 30;
      const c = CAPSULE_COLORS[i % CAPSULE_COLORS.length];
      g.fillStyle = c; g.beginPath(); g.arc(x, y, rad, 0, Math.PI); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x, y, rad, Math.PI, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(120,90,200,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 196, 512, 120);
    g.fillStyle = T.label; g.font = '900 64px "Pretendard", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(T.subtitle.split(/\s+/)[0], 256, 236); g.font = '800 40px "Pretendard", system-ui, sans-serif'; g.fillText(`CAPSULE · ${T.title}`, 256, 288);
  }));
  const sideMat = track(new THREE.MeshPhysicalMaterial({ map: sideTex, roughness: 0.35, clearcoat: 0.8 }));
  [-1, 1].forEach((sx) => {
    const lower = add(new THREE.PlaneGeometry(D - 0.22, CTRL.y1 - CTRL.y0 - 0.22), sideMat, sx * (W / 2 + 0.002), (CTRL.y0 + CTRL.y1) / 2, 0, machine, false);
    lower.rotation.y = sx * Math.PI / 2;
    const upper = add(new THREE.PlaneGeometry(D - 0.22, WIN.y1 - WIN.y0 - 0.2), sideMat, sx * (W / 2 + 0.002), (WIN.y0 + WIN.y1) / 2, 0, machine, false);
    upper.rotation.y = sx * Math.PI / 2;
  });

  // 동전 투입구 — 금빛 판 + 세로 틈
  const slotPlate = add(new RoundedBoxGeometry(0.5, 0.34, 0.05, 5, 0.04), gold, SLOT.x, SLOT.y, FRONT + 0.02);
  // 판 테두리를 한 단 돋우고(빛이 테에 걸린다) 네 귀에 크롬 나사
  const plateRim = add(new RoundedBoxGeometry(0.42, 0.26, 0.02, 4, 0.03), gold, SLOT.x, SLOT.y, FRONT + 0.05, machine, false);
  // 판을 살짝 위로 젖힌다 — 정면만 보면 한 가지 빛만 비춰 «노란 칠»로 읽힌다(기울면 위 조명·창이 결을 따라 흐른다)
  slotPlate.rotation.x = -0.12;
  plateRim.rotation.x = -0.12;
  const screw = track(new THREE.SphereGeometry(0.017, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
    const s = new THREE.Mesh(screw, chrome);
    s.position.set(SLOT.x + sx * 0.205, SLOT.y + sy * 0.13, FRONT + 0.045);
    machine.add(s);
  });
  add(new RoundedBoxGeometry(0.06, 0.22, 0.04, 2, 0.02), dark, SLOT.x, SLOT.y, FRONT + 0.065, machine, false);
  const slotGlow = add(new THREE.PlaneGeometry(0.08, 0.24), track(new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0, depthWrite: false })), SLOT.x, SLOT.y, FRONT + 0.09, machine, false);
  void slotPlate;

  // 손잡이 — 크롬 고리 · 하얀 원판 · 보라 손잡이 막대(함께 돈다)
  // 크롬 고리는 둥근 고리(torus) — 평평한 원기둥 앞면은 한 방향만 비춰 회색 판처럼 보인다
  add(new THREE.CylinderGeometry(HANDLE.r + 0.05, HANDLE.r + 0.05, 0.03, 48).rotateX(Math.PI / 2), dark, HANDLE.x, HANDLE.y, FRONT + 0.012);
  add(new THREE.TorusGeometry(HANDLE.r + 0.045, 0.03, 24, 96), chrome, HANDLE.x, HANDLE.y, FRONT + 0.035);
  const handle = new THREE.Group();
  handle.position.set(HANDLE.x, HANDLE.y, FRONT + 0.05);
  machine.add(handle);
  const knobFace = track(canvasTexture(256, 256, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#c9b6ff'; g.lineWidth = 10;
    g.beginPath(); g.arc(128, 128, 104, -Math.PI * 0.85, Math.PI * 0.55); g.stroke();
    g.fillStyle = '#c9b6ff';
    const a = Math.PI * 0.55, x = 128 + Math.cos(a) * 104, y = 128 + Math.sin(a) * 104;
    g.beginPath(); g.moveTo(x - 20, y - 8); g.lineTo(x + 14, y - 22); g.lineTo(x + 6, y + 18); g.closePath(); g.fill();
    g.fillStyle = '#9b7bff'; g.font = '800 34px "Pretendard", system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText('돌려요', 128, 214);
  }));
  const knobWhite = plastic('#ffffff', 1);
  add(new THREE.CylinderGeometry(HANDLE.r, HANDLE.r, 0.08, 48).rotateX(Math.PI / 2), knobWhite, 0, 0, 0.02, handle);
  // 얼굴 인쇄는 평평한 원판에 — 원기둥 뚜껑의 UV 는 돌고 뒤집혀 있어 글씨가 바로 서지 않는다
  add(new THREE.CircleGeometry(HANDLE.r * 0.97, 48), track(new THREE.MeshPhysicalMaterial({ map: knobFace, roughness: 0.3, clearcoat: 1 })), 0, 0, 0.0615, handle, false);
  const grip = add(new RoundedBoxGeometry(HANDLE.r * 1.9, 0.12, 0.16, 3, 0.05), accent, 0, 0, 0.1, handle);
  add(new THREE.ConeGeometry(0.045, 0.09, 3).rotateZ(-Math.PI / 2), gold, HANDLE.r * 0.72, 0, 0.19, handle, false);
  void grip;

  // 배출구 — 앞으로 튀어나온 상자(바닥·옆·위) + 어두운 안 + 투명 덮개
  const outCx = 0, outCy = (OUT.y0 + OUT.y1) / 2, outZ = FRONT + OUT.depth / 2;
  add(new RoundedBoxGeometry(OUT.w + 0.12, 0.06, OUT.depth + 0.06, 2, 0.025), accent, outCx, OUT.y0, outZ);
  add(new RoundedBoxGeometry(OUT.w + 0.12, 0.06, OUT.depth, 2, 0.025), accent, outCx, OUT.y1, outZ - 0.03);
  [-1, 1].forEach((sx) => add(new RoundedBoxGeometry(0.06, OUT.y1 - OUT.y0, OUT.depth, 2, 0.025), accent, sx * (OUT.w / 2 + 0.03), outCy, outZ - 0.03));
  add(new THREE.PlaneGeometry(OUT.w, OUT.y1 - OUT.y0), inner, outCx, outCy, FRONT + 0.002, machine, false);
  add(new THREE.CircleGeometry(0.17, 32), track(new THREE.MeshBasicMaterial({ color: '#120d26' })), outCx, OUT.y1 - 0.2, FRONT + 0.004, machine, false);
  add(new THREE.BoxGeometry(OUT.w, 0.02, OUT.depth - 0.02), inner, outCx, OUT.y0 + 0.035, outZ);
  const flapPivot = new THREE.Group();
  flapPivot.position.set(outCx, OUT.y1 - 0.03, FRONT + OUT.depth - 0.02);
  machine.add(flapPivot);
  const flap = add(new THREE.PlaneGeometry(OUT.w - 0.02, OUT.y1 - OUT.y0 - 0.06), track(new THREE.MeshPhysicalMaterial({
    color: '#e8dcff', roughness: 0.08, transmission: 0.85, thickness: 0.01, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
  })), 0, -(OUT.y1 - OUT.y0 - 0.06) / 2, 0, flapPivot, false);
  flap.renderOrder = 3;

  // ── 캡슐 ──────────────────────────────────────────────────────────
  const capTop = track(new THREE.SphereGeometry(CAP_R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2));
  const capBottom = track(new THREE.SphereGeometry(CAP_R, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2));
  const capBand = track(new THREE.TorusGeometry(CAP_R * 1.0, 0.007, 6, 40).rotateX(Math.PI / 2));
  const capToy = track(new THREE.IcosahedronGeometry(CAP_R * 0.38, 1));
  const topMats = new Map<string, THREE.Material>();
  const topMat = (c: string) => {
    let m = topMats.get(c);
    if (!m) {
      // 반투명한 윗뚜껑(2026-10-07 사용자 지적 «너무 투명») — 색이 비치는 젖빛 플라스틱. 안의 장난감은 흐릿하게만 보인다
      const tint = new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.38);
      // 고급 질감(2026-10-07): 겉칠을 거울처럼(0.03) — 반사 환경의 창이 캡슐마다 작게 맺힌다
      m = track(new THREE.MeshPhysicalMaterial({
        color: tint, roughness: 0.24, transparent: true, opacity: 0.8, clearcoat: 1, clearcoatRoughness: 0.03,
        sheen: 0.3, sheenColor: new THREE.Color('#ffffff'), side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.3,
      }));
      topMats.set(c, m);
    }
    return m;
  };
  const bandMat = plastic('#ffffff', 1);
  const colorMats = new Map<string, THREE.Material>();
  const colorMat = (c: string) => {
    let m = colorMats.get(c);
    if (!m) { m = plastic(c, 1); colorMats.set(c, m); }
    return m;
  };

  function makeCapsule(color: string, toy = CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)]) {
    const g = new THREE.Group();
    const bottom = new THREE.Mesh(capBottom, colorMat(color));
    const top = new THREE.Mesh(capTop, topMat(color));
    const band = new THREE.Mesh(capBand, bandMat);
    const inside = new THREE.Mesh(capToy, colorMat(toy));
    inside.position.y = CAP_R * 0.25;
    [bottom, band, inside].forEach((m) => { m.castShadow = true; });
    top.renderOrder = 1;
    const topPivot = new THREE.Group();
    topPivot.add(top);
    g.add(bottom, band, inside, topPivot);
    g.userData = { top: topPivot, bottom, inside };
    return g;
  }

  // 창 안의 캡슐 — 미리 굴려 둔다(처음 화면에서 이미 쌓여 있게)
  const balls: Ball[] = [];
  const N = 64;
  for (let i = 0; i < N; i += 1) {
    const mesh = makeCapsule(CAPSULE_COLORS[i % CAPSULE_COLORS.length]);
    mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    const p = new THREE.Vector3(
      BOX.x * (Math.random() * 2 - 1),
      BOX.y0 + 0.2 + (i / N) * (BOX.y1 - BOX.y0 + 1.2),
      BOX.z0 + Math.random() * (BOX.z1 - BOX.z0),
    );
    machine.add(mesh);
    balls.push({ mesh, p, v: new THREE.Vector3() });
  }
  const tmp = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const qStep = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  let awake = 0;

  function physics(dt: number) {
    const g = 9.8;
    for (const b of balls) {
      b.v.y -= g * dt;
      b.p.addScaledVector(b.v, dt);
      const wall = (k: 'x' | 'z', lo: number, hi: number) => {
        if (b.p[k] < lo) { b.p[k] = lo; b.v[k] = Math.abs(b.v[k]) * 0.3; }
        if (b.p[k] > hi) { b.p[k] = hi; b.v[k] = -Math.abs(b.v[k]) * 0.3; }
      };
      wall('x', -BOX.x, BOX.x);
      wall('z', BOX.z0, BOX.z1);
      if (b.p.y < BOX.y0) { b.p.y = BOX.y0; b.v.y = Math.abs(b.v.y) * 0.25; b.v.x *= 0.9; b.v.z *= 0.9; }
      if (b.p.y > BOX.y1 + 1.5) { b.p.y = BOX.y1 + 1.5; b.v.y = 0; }
    }
    for (let i = 0; i < balls.length; i += 1) {
      for (let j = i + 1; j < balls.length; j += 1) {
        const a = balls[i], c = balls[j];
        tmp.subVectors(c.p, a.p);
        const dist = tmp.length();
        const min = CAP_R * 2;
        if (dist >= min || dist < 1e-6) continue;
        tmp.divideScalar(dist);
        const push = (min - dist) / 2;
        a.p.addScaledVector(tmp, -push);
        c.p.addScaledVector(tmp, push);
        const rel = (c.v.x - a.v.x) * tmp.x + (c.v.y - a.v.y) * tmp.y + (c.v.z - a.v.z) * tmp.z;
        if (rel < 0) {
          const imp = -rel * 0.6;
          a.v.addScaledVector(tmp, -imp);
          c.v.addScaledVector(tmp, imp);
        }
      }
    }
    let moving = 0;
    for (const b of balls) {
      b.v.multiplyScalar(0.995);
      const speed = Math.hypot(b.v.x, b.v.z);
      if (speed > 1e-3) {
        axis.set(b.v.z, 0, -b.v.x).normalize();
        qStep.setFromAxisAngle(axis, (speed * dt) / CAP_R);
        b.mesh.quaternion.premultiply(qStep);
      }
      if (b.v.lengthSq() > 0.002) moving += 1;
      b.mesh.position.copy(b.p);
    }
    return moving;
  }
  // 미리 쌓기(보이지 않게 4초)
  for (let i = 0; i < 480; i += 1) physics(1 / 120);
  balls.forEach((b) => { b.v.set(0, 0, 0); b.mesh.position.copy(b.p); });
  void UP;

  function stir(amount: number) {
    for (const b of balls) {
      const low = 1 - Math.min(1, (b.p.y - BOX.y0) / (BOX.y1 - BOX.y0));
      b.v.x += (Math.random() - 0.5) * 1.4 * amount * low;
      b.v.y += Math.random() * 2.2 * amount * low;
      b.v.z += (Math.random() - 0.5) * 1.0 * amount * low;
    }
    awake = 2.5;
    kick();
  }

  // ── 동전 ─────────────────────────────────────────────────────────
  const coinFaceTex = track(canvasTexture(128, 128, (g) => coinFace(g, 128, 128)));
  const coinSide = gold;
  const coinFaceMat = track(new THREE.MeshPhysicalMaterial({ map: coinFaceTex, metalness: 0.9, roughness: 0.25 }));
  const coin = new THREE.Mesh(track(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 40)), [coinSide, coinFaceMat, coinFaceMat]);
  coin.castShadow = true;
  coin.visible = false;
  scene.add(coin);

  // ── 연출 조각 ─────────────────────────────────────────────────────
  const spark = track(sparkTexture());
  const burstN = 90;
  const burstGeo = track(new THREE.BufferGeometry());
  const burstPos = new Float32Array(burstN * 3);
  const burstVel = new Float32Array(burstN * 3);
  burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
  const burstMat = track(new THREE.PointsMaterial({ map: spark, size: 0.16, transparent: true, depthWrite: false, color: '#ffffff' }));
  const burst = new THREE.Points(burstGeo, burstMat);
  burst.visible = false;
  scene.add(burst);
  const rays = new THREE.Mesh(track(new THREE.PlaneGeometry(3.2, 3.2)), track(new THREE.MeshBasicMaterial({ map: track(raysTexture()), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })));
  rays.visible = false;
  scene.add(rays);
  const glowLight = new THREE.PointLight('#ffffff', 0, 4);
  scene.add(glowLight);

  // ── 상태 ─────────────────────────────────────────────────────────
  let armed = false;
  let angle = 0;          // 손잡이 누적(라디안, 시계 방향 +)
  let shown = 0;          // 화면에 그리는 손잡이 각(스프링)
  let shownV = 0;
  let notch = 0;
  let turning = false;
  let dragging = false;
  let lastPointerA = 0;
  let outCapsule: THREE.Group | null = null;
  let opened = false;
  let capsuleClick: (() => void) | null = null;
  const listeners: ((e: GachaEvent) => void)[] = [];
  const emit = (e: GachaEvent) => listeners.forEach((cb) => cb(e));
  const tweens: { t0: number; dur: number; step: (k: number) => void; done: () => void }[] = [];
  let shake = 0;

  function tween(dur: number, step: (k: number) => void): Promise<void> {
    const d = reduced ? Math.min(dur, 0.25) : dur;
    return new Promise((resolve) => {
      tweens.push({ t0: performance.now() / 1000, dur: d, step, done: resolve });
      kick();
    });
  }

  function onNotchesUpTo(a: number) {
    const k = Math.floor(a / (Math.PI / 4));
    while (notch < k && notch < 8) {
      notch += 1;
      shownV += 6; // 걸렸다 넘어가는 손맛
      emit({ type: 'notch', step: notch });
      stir(0.45);
      shake = Math.max(shake, 0.6);
    }
    if (notch >= 8 && turning) {
      turning = false;
      armed = false;
      emit({ type: 'turned' });
    }
  }

  // ── 포인터: 손잡이 끌어 돌리기 · 캡슐 누르기 ─────────────────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const handleScreen = new THREE.Vector3();
  const pick = (ev: PointerEvent, objs: THREE.Object3D[]) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(objs, true).length > 0;
  };
  const pointerAngle = (ev: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    handleScreen.set(HANDLE.x, HANDLE.y, FRONT).applyMatrix4(machine.matrixWorld).project(camera);
    const cx = rect.left + ((handleScreen.x + 1) / 2) * rect.width;
    const cy = rect.top + ((1 - handleScreen.y) / 2) * rect.height;
    return Math.atan2(ev.clientY - cy, ev.clientX - cx);
  };
  const onDown = (ev: PointerEvent) => {
    if (outCapsule && !opened && pick(ev, [outCapsule])) { capsuleClick?.(); return; }
    if (armed && !turning && pick(ev, [handle])) {
      dragging = true;
      turning = true;
      lastPointerA = pointerAngle(ev);
      canvas.setPointerCapture(ev.pointerId);
      return;
    }
    // 그 밖은 기계를 돌려 본다
    if (orbitLocked) return;
    orbitDrag = true;
    orbitLast = { x: ev.clientX, y: ev.clientY };
    canvas.setPointerCapture(ev.pointerId);
    kick();
  };
  const onMove = (ev: PointerEvent) => {
    if (orbitDrag) {
      orbit.tyaw += (ev.clientX - orbitLast.x) * 0.01;
      orbit.tpitch = Math.max(-0.35, Math.min(0.3, orbit.tpitch + (ev.clientY - orbitLast.y) * 0.006));
      orbitLast = { x: ev.clientX, y: ev.clientY };
      lastOrbitAt = performance.now();
      kick();
      return;
    }
    if (!dragging) {
      const over = (outCapsule && !opened && pick(ev, [outCapsule])) || (armed && pick(ev, [handle]));
      canvas.style.cursor = over ? 'pointer' : 'default';
      return;
    }
    const a = pointerAngle(ev);
    let d = a - lastPointerA;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    lastPointerA = a;
    if (d > 0) { angle = Math.min(Math.PI * 2, angle + d); onNotchesUpTo(angle); kick(); } // 화면에서 시계 방향(래칫 — 거꾸로는 안 돈다)
  };
  const onUp = () => {
    dragging = false;
    if (orbitDrag) { orbitDrag = false; lastOrbitAt = performance.now(); kick(); window.setTimeout(kick, 2700); }
  };
  /** 연출 전에 정면으로 — 동전·캡슐은 정면 좌표로 날아간다 */
  async function faceFront() {
    orbitLocked = true;
    orbitDrag = false;
    orbit.tyaw = Math.round(orbit.tyaw / (Math.PI * 2)) * Math.PI * 2;
    orbit.tpitch = 0;
    const y0 = orbit.yaw, p0 = orbit.pitch;
    if (Math.abs(y0 - orbit.tyaw) < 1e-3 && Math.abs(p0) < 1e-3) return;
    await tween(0.45, (k) => {
      const e = ease.inOutCubic(k);
      orbit.yaw = y0 + (orbit.tyaw - y0) * e;
      orbit.pitch = p0 * (1 - e);
      orbit.vyaw = 0; orbit.vpitch = 0;
    });
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  // ── 그리기 ────────────────────────────────────────────────────────
  let raf = 0;
  let disposed = false;
  let lastT = 0;
  let w = 1, h = 1;
  const onLost = (e: Event) => { e.preventDefault(); opts.onContextLost?.(); };
  canvas.addEventListener('webglcontextlost', onLost);

  function frame(t: number) {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    let busy = false;
    // 트윈
    const now = t / 1000;
    for (let i = tweens.length - 1; i >= 0; i -= 1) {
      const tw = tweens[i];
      const k = Math.min(1, (now - tw.t0) / tw.dur);
      tw.step(k);
      if (k >= 1) { tweens.splice(i, 1); tw.done(); }
    }
    busy ||= tweens.length > 0;
    // 손잡이 스프링(누적 각을 따라가되 걸림에서 살짝 튄다)
    const target = angle;
    shownV += (target - shown) * 90 * dt;
    shownV *= Math.exp(-14 * dt);
    shown += shownV * dt;
    handle.rotation.z = -shown;
    busy ||= Math.abs(target - shown) > 1e-3 || Math.abs(shownV) > 1e-3 || dragging;
    // 돌려 보기 — 놓은 지 2.6초가 지나면 앞으로
    if (!orbitDrag && !orbitLocked && performance.now() - lastOrbitAt > 2600) {
      orbit.tyaw = Math.round(orbit.tyaw / (Math.PI * 2)) * Math.PI * 2;
      orbit.tpitch = 0;
    }
    if (!orbitLocked) {
      if (orbitDrag || reduced) { orbit.yaw = orbit.tyaw; orbit.pitch = orbit.tpitch; orbit.vyaw = 0; orbit.vpitch = 0; }
      else {
        const ay = (orbit.tyaw - orbit.yaw) * 38 - orbit.vyaw * 9.5;
        const ap = (orbit.tpitch - orbit.pitch) * 38 - orbit.vpitch * 9.5;
        orbit.vyaw += ay * dt; orbit.vpitch += ap * dt;
        orbit.yaw += orbit.vyaw * dt; orbit.pitch += orbit.vpitch * dt;
      }
    }
    rig.rotation.set(orbit.pitch, orbit.yaw, 0);
    busy ||= orbitDrag || Math.abs(orbit.yaw - orbit.tyaw) > 1e-3 || Math.abs(orbit.pitch - orbit.tpitch) > 1e-3 || Math.abs(orbit.vyaw) > 1e-3;
    // 물리
    if (awake > 0) {
      const steps = 2;
      let moving = 0;
      for (let s = 0; s < steps; s += 1) moving = physics(dt / steps);
      awake = moving > 0 ? Math.max(awake - dt, 0.3) : awake - dt;
      busy = true;
    }
    // 흔들림
    if (shake > 0 && !reduced) {
      shake = Math.max(0, shake - dt * 3);
      machine.position.x = Math.sin(t / 22) * 0.012 * shake;
      machine.rotation.z = Math.sin(t / 31) * 0.004 * shake;
      busy = true;
    } else { machine.position.x = 0; machine.rotation.z = 0; }
    // 슬롯 빛
    const glowMat = slotGlow.material as THREE.MeshBasicMaterial;
    const glowTarget = armed ? 0.55 + Math.sin(t / 240) * 0.25 : 0;
    glowMat.opacity += (glowTarget - glowMat.opacity) * Math.min(1, dt * 8);
    busy ||= armed || Math.abs(glowMat.opacity - glowTarget) > 0.01;
    // 배출구 캡슐 숨쉬기(누르라는 신호)
    if (outCapsule && !opened && !tweens.length) {
      const s = 1 + Math.sin(t / 260) * 0.035;
      outCapsule.scale.setScalar(s);
      busy = true;
    }
    if (burst.visible) busy = true;
    if (rays.visible) { rays.rotation.z += dt * 0.6; busy = true; }
    renderer.render(scene, camera);
    quality.frame(performance.now(), busy);
    if (busy) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!raf && !disposed) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function resize(nw: number, nh: number) {
    w = Math.max(1, nw); h = Math.max(1, nh);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 기계(높이 약 3.6 · 폭 2.2)가 화면에 들어오게 — 좁은 화면은 거리를 늘린다
    const fitH = 4.5, fitW = 2.9;
    const vFov = (camera.fov * Math.PI) / 180;
    const distH = fitH / 2 / Math.tan(vFov / 2);
    const distW = fitW / 2 / (Math.tan(vFov / 2) * camera.aspect);
    const dist = Math.max(distH, distW);
    camera.position.set(0, 2.15, dist);
    camera.lookAt(LOOK);
    camera.updateProjectionMatrix();
    kick();
  }

  // ── 동작 ─────────────────────────────────────────────────────────
  const slotPos = new THREE.Vector3(SLOT.x, SLOT.y, FRONT + 0.09);

  async function coinFlight(bounce: boolean) {
    await faceFront();
    coin.visible = true;
    const from = new THREE.Vector3(0.95, 0.5, FRONT + 1.6);
    const ctrl = new THREE.Vector3(0.6, SLOT.y + 0.9, FRONT + 1.0);
    await tween(0.65, (k) => {
      const e = ease.inOutCubic(k);
      const a = from.clone().lerp(ctrl, e);
      const b = ctrl.clone().lerp(slotPos, e);
      coin.position.copy(a.lerp(b, e));
      // 눕혀 오다가(동전 면이 보이게) 세로로 서서(면이 옆을 보게) 틈에 맞춘다
      coin.rotation.set((1 - e) * Math.PI / 2.2, (1 - e) * 3 * Math.PI, e * Math.PI / 2);
    });
    if (bounce) {
      shake = 0.4;
      await tween(0.6, (k) => {
        coin.position.set(slotPos.x + k * 0.5, slotPos.y + Math.sin(k * Math.PI) * 0.25 - k * 0.6, slotPos.z + k * 0.8);
        coin.rotation.z += 0.3;
      });
      coin.visible = false;
      return;
    }
    await tween(0.28, (k) => { coin.position.z = slotPos.z - ease.outCubic(k) * 0.16; });
    coin.visible = false;
    emit({ type: 'coinIn' });
    shake = 0.35;
  }

  async function dispense(color: string, glowing: boolean) {
    clearOut();
    await faceFront();
    const cap = makeCapsule(color);
    if (glowing) {
      const halo = new THREE.Mesh(track(new THREE.SphereGeometry(CAP_R * 1.35, 24, 16)), track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false })));
      cap.add(halo);
    }
    machine.add(cap);
    outCapsule = cap;
    opened = false;
    const rest = new THREE.Vector3(0, OUT.y0 + 0.05 + CAP_R, FRONT + OUT.depth - 0.16);
    const start = new THREE.Vector3(0, OUT.y1 - 0.2, FRONT + 0.02);
    emit({ type: 'drop' });
    stir(0.8);
    // 1) 안에서 툭 떨어진다
    await tween(0.42, (k) => {
      const e = ease.outBounce(k);
      cap.position.set(start.x, start.y + (rest.y - start.y) * e, start.z);
      cap.rotation.x = k * 1.4;
    });
    emit({ type: 'landed' });
    shake = 0.5;
    // 2) 덮개를 밀고 앞으로 굴러 나온다
    await tween(0.7, (k) => {
      const e = ease.outCubic(k);
      cap.position.z = start.z + (rest.z - start.z) * e;
      cap.rotation.x = 1.4 + e * ((rest.z - start.z) / CAP_R);
      const touch = Math.max(0, Math.min(1, (cap.position.z + CAP_R - (FRONT + OUT.depth - 0.02 - 0.12)) / 0.12));
      flapPivot.rotation.x = -touch * 0.75;
    });
    // 3) 덮개가 흔들리며 닫힌다
    await tween(0.9, (k) => { flapPivot.rotation.x = -0.75 * Math.exp(-5 * k) * Math.cos(k * 14); });
    flapPivot.rotation.x = 0;
  }

  async function open(rarityColor: string, big: boolean) {
    if (!outCapsule || opened) return;
    opened = true;
    await faceFront();
    const cap = outCapsule;
    const from = cap.position.clone();
    const to = new THREE.Vector3(0, 2.0, FRONT + 2.2);
    const q0 = cap.quaternion.clone();
    const q1 = new THREE.Quaternion();
    cap.scale.setScalar(1);
    // 1) 떠올라 화면 앞으로 — 회전하며
    await tween(0.85, (k) => {
      const e = ease.inOutCubic(k);
      cap.position.lerpVectors(from, to, e);
      cap.position.y += Math.sin(e * Math.PI) * 0.6;
      cap.quaternion.slerpQuaternions(q0, q1, e);
      cap.rotateY(e * Math.PI * 4);
      cap.scale.setScalar(1 + e * 1.15);
    });
    // 2) 부르르 떨다가
    await tween(big ? 0.9 : 0.5, (k) => {
      cap.rotation.z = Math.sin(k * 60) * 0.12 * (1 - k * 0.3);
      glowLight.position.copy(cap.position);
      glowLight.color.set(rarityColor);
      glowLight.intensity = k * (big ? 6 : 3);
    });
    // 3) 뚜껑을 돌려 연다 — 빛과 반짝이가 터진다
    const top = cap.userData.top as THREE.Group;
    const bottom = cap.userData.bottom as THREE.Mesh;
    emit({ type: 'pop' });
    startBurst(cap.position, rarityColor, big);
    rays.position.copy(cap.position).add(new THREE.Vector3(0, 0, -0.4));
    (rays.material as THREE.MeshBasicMaterial).color.set(rarityColor);
    rays.visible = big;
    await tween(0.75, (k) => {
      const e = ease.outCubic(k);
      top.rotation.y = e * Math.PI * 1.5;
      top.position.y = e * 0.9;
      top.position.x = e * 0.25;
      bottom.position.y = -e * 0.25;
      (cap.userData.inside as THREE.Mesh).scale.setScalar(1 + e * 1.5);
      if (big) (rays.material as THREE.MeshBasicMaterial).opacity = Math.min(0.9, e);
    });
    await tween(0.5, (k) => {
      cap.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && 'opacity' in m && o !== cap) { (o as THREE.Mesh).visible = k < 0.95; }
      });
      glowLight.intensity *= 0.9;
    });
  }

  function startBurst(at: THREE.Vector3, color: string, big: boolean) {
    burstMat.color.set(color);
    for (let i = 0; i < burstN; i += 1) {
      burstPos[i * 3] = at.x; burstPos[i * 3 + 1] = at.y; burstPos[i * 3 + 2] = at.z;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar((big ? 3.2 : 2.2) * (0.4 + Math.random()));
      burstVel[i * 3] = dir.x; burstVel[i * 3 + 1] = dir.y; burstVel[i * 3 + 2] = dir.z;
    }
    burstGeo.attributes.position.needsUpdate = true;
    burst.visible = true;
    burstMat.opacity = 1;
    void tween(1.4, (k) => {
      const dt = 1 / 60;
      for (let i = 0; i < burstN; i += 1) {
        burstVel[i * 3 + 1] -= 3.2 * dt;
        burstPos[i * 3] += burstVel[i * 3] * dt;
        burstPos[i * 3 + 1] += burstVel[i * 3 + 1] * dt;
        burstPos[i * 3 + 2] += burstVel[i * 3 + 2] * dt;
      }
      burstGeo.attributes.position.needsUpdate = true;
      burstMat.opacity = 1 - k;
      burstMat.size = 0.16 + Math.sin(k * 40) * 0.04;
    }).then(() => { burst.visible = false; });
  }

  function clearOut() {
    orbitLocked = false;
    if (outCapsule) {
      machine.remove(outCapsule);
      outCapsule.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry && !([capTop, capBottom, capBand, capToy] as THREE.BufferGeometry[]).includes(m.geometry)) m.geometry.dispose(); });
      outCapsule = null;
    }
    opened = false;
    rays.visible = false;
    (rays.material as THREE.MeshBasicMaterial).opacity = 0;
    glowLight.intensity = 0;
    kick();
  }

  resize(canvas.clientWidth || 600, canvas.clientHeight || 800);

  return {
    resize,
    insertCoin: () => coinFlight(false).finally(() => { orbitLocked = false; }),
    rejectCoin: () => coinFlight(true).finally(() => { orbitLocked = false; }),
    setArmed(on) {
      armed = on;
      if (on) { angle = 0; shown = 0; notch = 0; turning = false; handle.rotation.z = 0; void tween(0.4, (k) => { handle.rotation.z = Math.sin(k * Math.PI * 3) * 0.08 * (1 - k); }); }
      kick();
    },
    async autoTurn() {
      if (!armed || turning) return;
      turning = true;
      const start = angle;
      await tween(1.7, (k) => {
        angle = start + (Math.PI * 2 - start) * ease.inOutCubic(k);
        onNotchesUpTo(angle);
      });
    },
    dispense: (c, g) => dispense(c, g).finally(() => { orbitLocked = false; }),
    open: (c, b) => open(c, b),
    clear: clearOut,
    onEvent(cb) { listeners.push(cb); },
    onCapsuleClick(cb) { capsuleClick = cb; },
    handleScreen() {
      const rect = canvas.getBoundingClientRect();
      const c = new THREE.Vector3(HANDLE.x, HANDLE.y, FRONT).applyMatrix4(machine.matrixWorld).project(camera);
      const e = new THREE.Vector3(HANDLE.x + HANDLE.r * 0.8, HANDLE.y, FRONT).applyMatrix4(machine.matrixWorld).project(camera);
      const sx = (v: THREE.Vector3) => rect.left + ((v.x + 1) / 2) * rect.width;
      const sy = (v: THREE.Vector3) => rect.top + ((1 - v.y) / 2) * rect.height;
      return { x: sx(c), y: sy(c), r: Math.abs(sx(e) - sx(c)) };
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('webglcontextlost', onLost);
      colorMats.forEach((m) => m.dispose());
      disposables.forEach((d) => d.dispose());
      envTex.dispose();
      renderer.dispose();
    },
  };
}
