/**
 * 3D 다마고찌 기기 — three.js. 기기 모양(`DeviceModel`) 두 벌을 같은 코드로 만든다.
 *
 * 실물을 보고 옮긴 부분:
 *  - 달걀 껍데기: 위가 조금 좁고 바닥이 납작한 외곽선을 둥근 모서리(베벨)로 두께를 주고, 앞·뒤를 살짝 부풀렸다.
 *  - 화면 창: 몸보다 튀어나온 테 안으로 화면이 들어앉고, 그 위를 투명 덮개가 덮는다.
 *    클래식 = 무광 남색 테 + 반사형 LCD / 컬러 = 얇은 검은 광택 테 + 백라이트 TFT
 *  - 버튼 셋: 가운데가 조금 낮은 호로 놓인 둥근 버튼, 움푹한 홈에 앉아 있고 누르면 실제로 들어간다.
 *  - 볼 체인(클래식은 위, 컬러는 왼쪽 어깨 고리) · 컬러는 위쪽에 톱니 다이얼(Paradise) — A 를 누르면 한 칸 돈다.
 *  - 뒤쪽 배터리 덮개와 나사, 리셋 구멍.
 *
 * ⚠️ 조용히 틀리는 자리(docs/features/tamagotchi.md §3D) — 화면은 부푼 앞면 «위», 선반 윤곽은 아래 → 위,
 *    평면 UV 는 앞·뒤 재질로 가른다, 화면은 톤 매핑을 끈다.
 *
 * 성능 규칙: 필요할 때만 그린다(용수철·화면이 바뀔 때만) · 떠날 때 GPU 자원을 직접 dispose · 픽셀 비율 상한 2.
 */
import * as THREE from 'three';
import { createAdaptiveQuality } from './adaptiveQuality';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cornerCapOutline, cornerRivet, eggOutline, eggPoint, handlePath, wheelAxleY, type DeviceModel } from './dims';
import type { ShellTheme } from './shellTheme';

const PRESS_DEPTH = 0.075;

/** 앞면 곡면의 높이 — 버튼·테를 몸 위에 정확히 앉히는 데 쓴다 */
const domeFalloff = (m: DeviceModel, x: number, y: number) => Math.max(0, 1 - (x / (m.W / 2)) ** 2 - (y / (m.H / 2)) ** 2);
const frontOf = (m: DeviceModel) => m.depth / 2 + m.bevelT;
export const frontZ = (m: DeviceModel, x: number, y: number) => frontOf(m) + m.domeFront * domeFalloff(m, x, y);

function roundedRect<T extends THREE.Path>(p: T, w: number, h: number, r: number, cx = 0, cy = 0): T {
  const x = cx - w / 2;
  const y = cy - h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

/** 몸통 — 둥근 모서리 달걀 + 앞뒤 부풀림 + 하나로 이어진 매끈한 법선 + 앞·뒤 재질 그룹 */
function bodyGeometry(m: DeviceModel): THREE.BufferGeometry {
  const shape = new THREE.Shape(eggOutline(m, 180, m.bevelS).map(([x, y]) => new THREE.Vector2(x, y)));
  let geo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: m.depth, bevelEnabled: true, bevelThickness: m.bevelT, bevelSize: m.bevelS, bevelSegments: 16, curveSegments: 180, steps: 1,
  });
  geo.translate(0, 0, -m.depth / 2);
  const front = frontOf(m);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const weight = Math.min(1, Math.abs(z) / front) ** 2;
    pos.setZ(i, z + Math.sign(z) * (z > 0 ? m.domeFront : m.domeBack) * domeFalloff(m, x, y) * weight);
  }
  // ExtrudeGeometry 는 인덱스가 없다 — 법선·UV 를 지우고 평면 UV 를 다시 단 뒤 이어 붙여야 매끈하게 칠해진다
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    uv[i * 2] = pos.getX(i) / m.W + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / m.H + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  // 디지털형은 옆면이 매끈한 플라스틱(벽돌은 앞면에만) — 평면 UV 로 옆에 벽돌을 찍으면 줄무늬로 늘어진다
  return splitFrontBack(geo, m.shape === 'brick' ? m.depth / 2 + m.bevelT * 0.5 : 0);
}

/** 평면 UV 는 몸을 관통한다 — 무게중심 z 로 삼각형을 앞(0)·뒤(1) 재질로 가른다(뒷면에 앞 글씨가 거울로 찍히지 않게) */
function splitFrontBack(geo: THREE.BufferGeometry, sideBand = 0): THREE.BufferGeometry {
  const index = geo.getIndex()!;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const front: number[] = [];
  const back: number[] = [];
  const side: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    const zc = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    (sideBand && Math.abs(zc) < sideBand ? side : zc >= 0 ? front : back).push(a, b, c);
  }
  geo.setIndex([...front, ...back, ...side]);
  geo.clearGroups();
  geo.addGroup(0, front.length, 0);
  geo.addGroup(front.length, back.length, 1);
  if (side.length) geo.addGroup(front.length + back.length, side.length, 2);
  return geo;
}

function buttonGeometry(r: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const top = r * 0.57;
  for (let i = 0; i <= 14; i += 1) {
    const a = (i / 14) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * r * 0.96, top - (1 - Math.cos(a)) * r * 0.33));
  }
  pts.push(new THREE.Vector2(r, r * 0.18), new THREE.Vector2(r, -0.08));
  // 선반은 아래 → 위 순서여야 면이 바깥을 본다(거꾸로면 안쪽 면만 보여 버튼이 검게 나온다)
  pts.reverse();
  const geo = new THREE.LatheGeometry(pts, 64);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/** 볼 체인 — 고리(anchor)에서 dir 방향으로 올라가 물방울 모양으로 돌아오는 고리 */
function chainCurve(anchor: THREE.Vector2, dir: THREE.Vector2): THREE.CatmullRomCurve3 {
  const side = new THREE.Vector2(dir.y, -dir.x);
  const local: [number, number, number][] = [
    [0, 0.12, 0], [0.38, 0.7, 0.05], [0.62, 1.6, 0.1], [0.3, 2.35, 0.08], [-0.25, 2.35, 0.02], [-0.6, 1.6, -0.05], [-0.36, 0.7, -0.05], [0, 0.12, 0],
  ];
  return new THREE.CatmullRomCurve3(local.map(([sx, up, z]) => new THREE.Vector3(
    anchor.x + side.x * sx + dir.x * up, anchor.y + side.y * sx + dir.y * up, z,
  )), true, 'centripetal');
}

export interface ButtonAnchor { x: number; y: number; radius: number; visible: boolean }

export interface DeviceScene {
  /** 화면 캔버스가 바뀌었다 — 텍스처를 다시 올린다 */
  refreshScreen(): void;
  press(index: number, down: boolean): void;
  /** 다이얼 한 칸(컬러) */
  turnDial(step: number): void;
  resize(width: number, height: number): void;
  onAnchors(cb: (anchors: ButtonAnchor[]) => void): void;
  dispose(): void;
}

export interface DeviceSceneOptions {
  theme: ShellTheme;
  /** 화면에 붙일 캔버스(클래식 LCD 또는 컬러 TFT) */
  screen: HTMLCanvasElement;
  reducedMotion?: boolean;
  onContextLost?: () => void;
}

/** 모양마다 카메라가 담을 범위 — 체인·다이얼까지 들어오게 */
const FRAMING: Record<DeviceModel['style'], { centerY: number; fitH: number; fitW: number }> = {
  classic: { centerY: 1.0, fitH: 8.7, fitW: 6.1 },
  color: { centerY: 0.65, fitH: 7.9, fitW: 6.8 },
  digimon: { centerY: -0.35, fitH: 6.6, fitW: 9.2 },
  // 여행 가방형 — 위 손잡이(몸 위 0.62)까지
  suitcase: { centerY: 0.15, fitH: 8.1, fitW: 6.3 },
};

export function createDeviceScene(canvas: HTMLCanvasElement, options: DeviceSceneOptions): DeviceScene {
  const { theme } = options;
  const m = theme.model;
  const reduced = !!options.reducedMotion;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  canvas.dataset.tama = '3d';
  canvas.dataset.tamaStyle = m.style;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  // 느린 휴대폰이면 돌리는 동안 해상도를 낮춘다(Phase 7) — setPixelRatio 가 캔버스 크기를 다시 맞추므로 다시 그리기만 하면 된다
  const quality = createAdaptiveQuality(renderer, () => invalidate());
  if (import.meta.env.DEV) (window as unknown as { __tamaQuality?: () => { pr: number; drops: number } }).__tamaQuality = () => ({ pr: renderer.getPixelRatio(), drops: quality.drops });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 컬러 기종은 «중립» 톤 매핑 — ACES 는 밝은 파스텔을 흰색 쪽으로 빼서 진주빛 분홍이 하얗게 보였다(2D 그림과 대조해 확인)
  // ACES 는 채도 높은 색(컬러 기종 파스텔 · 디지털형 주황 버튼)을 하얗게 바랜다 — 클래식만 ACES
  renderer.toneMapping = m.style === 'classic' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = m.style === 'classic' ? 0.98 : 0.95;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTexture = pmrem.fromScene(room, 0.035).texture;
  scene.environment = envTexture;
  room.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
  });

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(-4, 7, 9);
  scene.add(key);
  const rim = new THREE.DirectionalLight(m.style === 'color' ? 0xffd6f0 : m.style === 'suitcase' ? 0xffe0b8 : 0xbfd2ff, 0.55);
  rim.position.set(6, 2, -6);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const device = new THREE.Group();
  scene.add(device);

  // ── 몸통 ──
  const shellTexture = (c: HTMLCanvasElement) => {
    const t = track(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  // 광택 플라스틱: 바탕은 조금 거칠게, 투명 코트는 매끈하게 — 하이라이트가 또렷하고 색은 바래지 않는다.
  // 컬러 기종은 진주빛(무지갯빛 간섭)을 더한다.
  // 컬러 기종의 파스텔은 밝은 스튜디오 반사에 쉽게 하얗게 바랜다 — 반사를 줄여 색을 지킨다(2026-10-07 스크린샷)
  // 디지털형의 «벽돌» 돋을무늬 = 범프 맵(테마가 주면) — 빛을 받아 줄눈이 파이고 벽돌이 솟아 보인다. 바탕은 무광에 가깝게
  const bump = theme.bump ? shellTexture(theme.bump(1024)) : null;
  if (bump) bump.colorSpace = THREE.NoColorSpace;
  // 뒷면 돋을무늬(여행 가방형의 체리 각인) — 뒷면 그림과 같이 좌우를 뒤집어 그린 캔버스
  const bumpBack = theme.bumpBack ? shellTexture(theme.bumpBack(1024)) : null;
  if (bumpBack) bumpBack.colorSpace = THREE.NoColorSpace;
  const plastic = (map: THREE.Texture, withBump: false | 'front' | 'back' = false) => track(new THREE.MeshPhysicalMaterial({
    map, bumpMap: withBump === 'front' ? bump : withBump === 'back' ? bumpBack : null, bumpScale: theme.bumpScale ?? 1,
    roughness: theme.roughness ?? (m.style === 'color' ? 0.4 : 0.42), metalness: 0,
    clearcoat: theme.clearcoat ?? (m.style === 'color' ? 0.8 : 1), clearcoatRoughness: 0.08,
    envMapIntensity: m.style === 'color' ? 0.38 : 0.7,
    sheen: m.style === 'color' ? 0 : 0.12, sheenColor: new THREE.Color(theme.sheen), sheenRoughness: 0.6,
    iridescence: theme.iridescence, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420],
  }));
  const bodyMaterial = plastic(shellTexture(theme.paint(1024)), 'front');
  const backMaterial = plastic(shellTexture(theme.paintBack(1024)), 'back');
  const trimMaterial = track(new THREE.MeshPhysicalMaterial({
    color: theme.trim, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.7, iridescence: theme.iridescence * 0.6,
  }));
  const sideMaterial = track(new THREE.MeshPhysicalMaterial({ color: theme.side ?? theme.trim, roughness: 0.62, clearcoat: 0.2, clearcoatRoughness: 0.3 }));
  device.add(new THREE.Mesh(track(bodyGeometry(m)), [bodyMaterial, backMaterial, sideMaterial]));

  // ── 화면 테 + 화면 + 덮개 ──
  const s = m.screen;
  const bezelW = s.w + s.pad * 2;
  const bezelH = s.h + s.pad * 2;
  const sx = s.x ?? 0; // 디지털형은 화면이 왼쪽으로 비켜 선다(버튼이 오른쪽 세로 줄)
  const bezelShape = roundedRect(new THREE.Shape(), bezelW, bezelH, s.bezelRadius, sx, s.y);
  bezelShape.holes.push(roundedRect(new THREE.Path(), s.w, s.h, s.radius, sx, s.y));
  const bezelBack = Math.min(
    frontZ(m, Math.abs(sx) + bezelW / 2, s.y + bezelH / 2), frontZ(m, Math.abs(sx) + bezelW / 2, s.y - bezelH / 2),
  ) - 0.04;
  // 화면은 부푼 앞면의 가장 높은 곳(화면 가운데)보다 위에 놓여야 보인다 — 테의 뒤쪽에 두면 껍데기 곡면에 덮인다
  const screenZ = frontZ(m, sx, s.y) + 0.012;
  const bezelFront = screenZ + (m.style === 'color' ? 0.06 : 0.085);
  const bezelGeo = track(new THREE.ExtrudeGeometry(bezelShape, {
    depth: bezelFront - bezelBack - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 4, curveSegments: 24,
  }));
  bezelGeo.translate(0, 0, bezelBack);
  const bezelMaterial = track(new THREE.MeshPhysicalMaterial(m.style === 'color'
    ? { color: theme.bezel, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1 }
    : { color: theme.bezel, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 }));
  device.add(new THREE.Mesh(bezelGeo, bezelMaterial));

  const screenTexture = track(new THREE.CanvasTexture(options.screen));
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // 화면은 칠한 색 그대로 — 톤 매핑을 타면 하얗게 바래 점이 흐려진다. 반사는 덮개 유리가 맡는다.
  const screenMaterial = track(new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false }));
  const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(s.w, s.h)), screenMaterial);
  screen.position.set(sx, s.y, screenZ);
  device.add(screen);
  const glass = new THREE.Mesh(
    track(new THREE.PlaneGeometry(s.w + 0.02, s.h + 0.02)),
    track(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true,
      opacity: m.style === 'color' ? 0.1 : 0.14, envMapIntensity: 2.2, depthWrite: false,
    })),
  );
  glass.position.set(sx, s.y, bezelFront - 0.03);
  device.add(glass);

  // ── 창틀(디지털형) — 화면을 두른 다른 색 막대 + 오른쪽 열쇠 구멍 탭 + 위쪽 작은 돌기(실물 사진) ──
  if (m.frame) {
    const f = m.frame;
    const frameMat = track(new THREE.MeshPhysicalMaterial({ color: theme.frame ?? theme.trim, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
    const frontAt = frontZ(m, f.x, f.y);
    const ring = roundedRect(new THREE.Shape(), f.w, f.h, 0.06, f.x, f.y);
    ring.holes.push(roundedRect(new THREE.Path(), f.w - f.bar * 2, f.h - f.bar * 2, 0.03, f.x, f.y));
    const ringGeo = track(new THREE.ExtrudeGeometry(ring, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 8 }));
    ringGeo.translate(0, 0, frontAt - 0.02);
    device.add(new THREE.Mesh(ringGeo, frameMat));
    // 오른쪽 막대에 붙은 탭 — 열쇠 구멍 무늬가 파여 있다
    const tabX = f.x + f.w / 2 - f.bar / 2;
    const tabShape = roundedRect(new THREE.Shape(), f.tab.w, f.tab.h, 0.07, tabX, f.y);
    const key = new THREE.Path();
    key.absarc(tabX, f.y + 0.08, 0.075, 0, Math.PI * 2, true);
    tabShape.holes.push(key);
    const slot = roundedRect(new THREE.Path(), 0.07, 0.2, 0.02, tabX, f.y - 0.08);
    tabShape.holes.push(slot);
    const tabGeo = track(new THREE.ExtrudeGeometry(tabShape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 16 }));
    tabGeo.translate(0, 0, frontAt - 0.02);
    device.add(new THREE.Mesh(tabGeo, frameMat));
    // 위 막대의 작은 돌기 둘
    const nubGeo = track(new THREE.BoxGeometry(0.14, 0.1, 0.1));
    [-0.55, 0.45].forEach((dx) => {
      const nub = new THREE.Mesh(nubGeo, frameMat);
      nub.position.set(f.x + dx * f.w * 0.5, f.y + f.h / 2 + 0.03, frontAt + 0.08);
      device.add(nub);
    });
  }

  // ── 버튼 셋 ──
  const b = m.buttons;
  const buttonGeo = track(buttonGeometry(b.r));
  const buttonMaterial = track(new THREE.MeshPhysicalMaterial({
    // 하얀 광택 막(sheen)은 진한 색 버튼(디지털형 주황)을 파스텔로 바래게 한다 — 돋을무늬 테마에서는 끈다
    color: theme.button, roughness: 0.28, clearcoat: theme.bump ? 0.35 : 1, clearcoatRoughness: 0.12, sheen: theme.bump ? 0 : 0.4, envMapIntensity: theme.bump ? 0.45 : 1, sheenColor: new THREE.Color(0xffffff),
    iridescence: theme.iridescence * 0.8,
  }));
  const socketGeo = track(new THREE.CylinderGeometry(b.r + 0.06, b.r + 0.06, 0.06, 64));
  socketGeo.rotateX(Math.PI / 2);
  const socketRingGeo = track(new THREE.TorusGeometry(b.r + 0.06, 0.035, 16, 64));
  const socketMaterial = track(new THREE.MeshStandardMaterial({ color: theme.socket, roughness: 0.6 }));
  const buttons: THREE.Mesh[] = [];
  const buttonRest: number[] = [];
  b.xs.forEach((x, i) => {
    const y = b.y + b.arc[i];
    const z = frontZ(m, x, y);
    const socket = new THREE.Mesh(socketGeo, socketMaterial);
    socket.position.set(x, y, z - 0.005);
    const ring = new THREE.Mesh(socketRingGeo, socketMaterial);
    ring.position.set(x, y, z + 0.005);
    const button = new THREE.Mesh(buttonGeo, buttonMaterial);
    button.position.set(x, y, z - 0.01);
    device.add(socket, ring, button);
    buttons.push(button);
    buttonRest.push(z - 0.01);
  });

  const metal = track(new THREE.MeshStandardMaterial({ color: 0xdedfe6, metalness: 1, roughness: 0.22 }));

  // ── 여행 가방형: 네 모서리 가죽 보호대 + 놋쇠 징 · 위 손잡이 ──
  if (m.corners) {
    const leather = track(new THREE.MeshPhysicalMaterial({ color: theme.trim, roughness: 0.58, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: new THREE.Color(0xffe6c8) }));
    const brass = track(new THREE.MeshStandardMaterial({ color: 0xd4a94e, metalness: 1, roughness: 0.32 }));
    const bevel = 0.07;
    // 몸 앞뒤 면(돔 포함)보다 0.04 씩 바깥 — 겹친 면이 깜박이지 않게
    const half = frontOf(m) + 0.04 - bevel;
    const rivetGeo = track(new THREE.SphereGeometry(0.075, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2));
    rivetGeo.rotateX(Math.PI / 2);
    for (const sx of [1, -1] as const) {
      for (const sy of [1, -1] as const) {
        const pts = cornerCapOutline(m, sx, sy, 0);
        if (pts.length < 3) continue;
        const capGeo = track(new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), {
          depth: half * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.05, bevelSegments: 4, curveSegments: 12,
        }));
        capGeo.translate(0, 0, -half);
        device.add(new THREE.Mesh(capGeo, leather));
        const [rx, ry] = cornerRivet(m, sx, sy);
        const front = new THREE.Mesh(rivetGeo, brass);
        front.position.set(rx, ry, half + bevel - 0.005);
        const back = new THREE.Mesh(rivetGeo, brass);
        back.position.set(rx, ry, -(half + bevel - 0.005));
        back.rotation.y = Math.PI;
        device.add(front, back);
      }
    }
  }
  if (m.handle) {
    const h = m.handle;
    const strap = new THREE.CatmullRomCurve3(handlePath(m).map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
    const handleGeo = track(new THREE.TubeGeometry(strap, 96, h.thick, 18, false));
    // 끈은 납작하고 넓다 — 깊이 방향으로 넓힌다
    handleGeo.scale(1, 1, 1.9);
    const handleMat = track(new THREE.MeshPhysicalMaterial({ color: theme.trim, roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: new THREE.Color(0xffe6c8) }));
    device.add(new THREE.Mesh(handleGeo, handleMat));
    // 다리를 몸에 붙이는 놋쇠 받침 둘
    const mountGeo = track(new THREE.CylinderGeometry(0.17, 0.2, 0.14, 24));
    const mountMat = track(new THREE.MeshStandardMaterial({ color: 0xd4a94e, metalness: 1, roughness: 0.3 }));
    [-1, 1].forEach((side) => {
      const mount = new THREE.Mesh(mountGeo, mountMat);
      mount.position.set(side * h.w / 2, m.H / 2 + 0.02, 0);
      mount.scale.set(1, 1, 1.6);
      device.add(mount);
    });
  }

  // ── 바닥 바퀴 넷(여행 가방형) — 몸 바닥에 붙은 받침 + 고무 바퀴 + 놋쇠 축 ──
  if (m.wheels) {
    const wh = m.wheels;
    const axleY = wheelAxleY(m);
    const tyreGeo = track(new THREE.CylinderGeometry(wh.r, wh.r, wh.w, 32));
    tyreGeo.rotateZ(Math.PI / 2); // 축 = x(앞으로 굴러간다)
    const hubGeo = track(new THREE.CylinderGeometry(wh.r * 0.42, wh.r * 0.42, wh.w + 0.03, 20));
    hubGeo.rotateZ(Math.PI / 2);
    const forkGeo = track(new THREE.BoxGeometry(wh.w + 0.12, 0.16 + wh.r * 0.9, wh.r * 1.5));
    const rubber = track(new THREE.MeshStandardMaterial({ color: 0x2b211c, roughness: 0.85 }));
    const forkMat = track(new THREE.MeshPhysicalMaterial({ color: theme.trim, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3 }));
    const hubMat = track(new THREE.MeshStandardMaterial({ color: 0xd4a94e, metalness: 1, roughness: 0.3 }));
    const zEdge = m.depth / 2 + m.bevelT - 0.28;
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const fork = new THREE.Mesh(forkGeo, forkMat);
        fork.position.set(sx * wh.x, -m.H / 2 + 0.02 - (0.16 + wh.r * 0.9) / 2 + 0.05, sz * zEdge);
        const tyre = new THREE.Mesh(tyreGeo, rubber);
        tyre.position.set(sx * wh.x, axleY, sz * zEdge);
        const hub = new THREE.Mesh(hubGeo, hubMat);
        hub.position.copy(tyre.position);
        device.add(fork, tyre, hub);
      }
    }
  }

  // ── 고리와 볼 체인(여행 가방형은 손잡이가 대신한다) ──
  const chainGroup = new THREE.Group();
  if (m.chain !== false) device.add(chainGroup);
  const [ax, ay] = eggPoint(m, m.lugAngle);
  const dirRaw = m.lugDir
    ? new THREE.Vector2(m.lugDir[0], m.lugDir[1]).normalize()
    : new THREE.Vector2(ax, ay).normalize().lerp(new THREE.Vector2(0, 1), 0.55).normalize();
  const anchor = new THREE.Vector2(ax, ay).sub(dirRaw.clone().multiplyScalar(0.08));
  const lugGroup = new THREE.Group();
  lugGroup.position.set(anchor.x, anchor.y, 0);
  lugGroup.rotation.z = Math.atan2(dirRaw.y, dirRaw.x) - Math.PI / 2;
  const lug = new THREE.Mesh(track(new THREE.TorusGeometry(0.22, 0.075, 20, 40, Math.PI)), trimMaterial);
  lug.rotation.y = Math.PI / 2;
  lugGroup.add(lug);
  chainGroup.add(lugGroup);
  const curve = chainCurve(new THREE.Vector2(anchor.x, anchor.y).add(dirRaw.clone().multiplyScalar(0.05)), dirRaw);
  const ballCount = 46;
  const balls = new THREE.InstancedMesh(track(new THREE.SphereGeometry(0.052, 16, 12)), metal, ballCount);
  const rods = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.014, 0.014, 1, 6)), metal, ballCount);
  const mx = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < ballCount; i += 1) {
    const a = curve.getPointAt(i / ballCount);
    const c = curve.getPointAt(((i + 1) % ballCount) / ballCount);
    mx.makeTranslation(a.x, a.y, a.z);
    balls.setMatrixAt(i, mx);
    const dir = c.clone().sub(a);
    const len = dir.length();
    mx.compose(a.clone().add(c).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()), new THREE.Vector3(1, len, 1));
    rods.setMatrixAt(i, mx);
  }
  chainGroup.add(balls, rods);
  const clasp = new THREE.Mesh(track(new THREE.CylinderGeometry(0.075, 0.075, 0.26, 20)), metal);
  clasp.position.copy(curve.getPointAt(0.5));
  clasp.rotation.z = Math.atan2(dirRaw.y, dirRaw.x);
  chainGroup.add(clasp);

  // ── 위쪽 다이얼(컬러) — 톱니가 둘레에 촘촘한 원통, 윗면에 눈금 하나 ──
  const dial = new THREE.Group();
  if (m.dial) {
    const dialMat = track(new THREE.MeshPhysicalMaterial({
      color: theme.button, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, iridescence: theme.iridescence,
    }));
    const core = new THREE.Mesh(track(new THREE.CylinderGeometry(0.46, 0.5, 0.3, 48)), dialMat);
    dial.add(core);
    const tooth = track(new THREE.BoxGeometry(0.05, 0.26, 0.06));
    for (let i = 0; i < 36; i += 1) {
      const a = (i / 36) * Math.PI * 2;
      const t = new THREE.Mesh(tooth, dialMat);
      t.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
      t.rotation.y = -a;
      dial.add(t);
    }
    const mark = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.02, 0.26)), track(new THREE.MeshStandardMaterial({ color: '#ff7fb0', roughness: 0.4 })));
    mark.position.set(0, 0.16, 0.18);
    dial.add(mark);
    dial.position.set(0, m.H / 2 - 0.02, 0);
    device.add(dial);
  }

  // ── 뒷면: 배터리 덮개 · 나사 · 리셋 구멍 ──
  const coverY = m.buttons.y + 0.9;
  const backZ = -(frontOf(m) + m.domeBack * domeFalloff(m, 0, coverY));
  const coverGeo = track(new THREE.ExtrudeGeometry(roundedRect(new THREE.Shape(), m.W * 0.53, 1.7, 0.3, 0, coverY), {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 3, curveSegments: 16,
  }));
  const cover = new THREE.Mesh(coverGeo, trimMaterial);
  cover.position.z = backZ - 0.02;
  cover.rotation.y = Math.PI;
  device.add(cover);
  const screw = new THREE.Mesh(track(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 24)), metal);
  screw.rotation.x = Math.PI / 2;
  screw.position.set(0, coverY - 0.55, backZ - 0.07);
  device.add(screw);
  const slot = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.025, 0.02)), track(new THREE.MeshStandardMaterial({ color: 0x55565c, roughness: 0.6 })));
  slot.position.set(0, coverY - 0.55, backZ - 0.1);
  slot.rotation.z = 0.5;
  device.add(slot);
  const reset = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16)), track(new THREE.MeshBasicMaterial({ color: 0x0b0c18 })));
  reset.rotation.x = Math.PI / 2;
  reset.position.set(0.95, 0.9, -(frontOf(m) + m.domeBack * domeFalloff(m, 0.95, 0.9)) - 0.005);
  device.add(reset);

  // ── 바닥 그림자 (돌지 않는다) ──
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 256;
  const sg = shadowCanvas.getContext('2d')!;
  const grad = sg.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(20,18,50,0.42)');
  grad.addColorStop(0.45, 'rgba(20,18,50,0.18)');
  grad.addColorStop(1, 'rgba(20,18,50,0)');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(
    track(new THREE.PlaneGeometry(m.W * 1.2, 2.2)),
    track(new THREE.MeshBasicMaterial({ map: track(new THREE.CanvasTexture(shadowCanvas)), transparent: true, depthWrite: false })),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, (m.wheels ? wheelAxleY(m) - m.wheels.r : -m.H / 2) - 0.55, 0);
  scene.add(shadow);

  // ── 움직임 (용수철) ──
  const rot = { yaw: 0, pitch: -0.06, vyaw: 0, vpitch: 0 };
  const target = { yaw: 0, pitch: -0.06 };
  const hover = { x: 0, y: 0 };
  const pressState = buttons.map(() => ({ value: 0, velocity: 0, down: false }));
  const dialState = { angle: 0, target: 0, v: 0 };
  let wiggle = 0, wiggleV = 0;
  let dragging = false;
  let lastDragAt = 0;
  let raf = 0;
  let disposed = false;
  let anchorsCb: ((a: ButtonAnchor[]) => void) | null = null;
  let size = { w: 1, h: 1 };
  const spring = (value: number, velocity: number, to: number, k: number, d: number, dt: number) => {
    const a = (to - value) * k - velocity * d;
    const v = velocity + a * dt;
    return [value + v * dt, v] as const;
  };

  const emitAnchors = () => {
    if (!anchorsCb) return;
    const world = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const toCamera = new THREE.Vector3();
    const edge = new THREE.Vector3();
    anchorsCb(buttons.map((button) => {
      button.getWorldPosition(world);
      normal.set(0, 0, 1).applyQuaternion(device.quaternion);
      toCamera.copy(camera.position).sub(world).normalize();
      edge.copy(world).add(new THREE.Vector3(b.r, 0, 0).applyQuaternion(device.quaternion));
      const p = world.clone().project(camera);
      const e = edge.project(camera);
      const x = (p.x * 0.5 + 0.5) * size.w;
      const y = (-p.y * 0.5 + 0.5) * size.h;
      return { x, y, radius: Math.hypot((e.x * 0.5 + 0.5) * size.w - x, (-e.y * 0.5 + 0.5) * size.h - y), visible: normal.dot(toCamera) > 0.45 };
    }));
  };

  let lastT = performance.now();
  const frame = (now: number) => {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    let moving = false;
    if (!dragging && !reduced && now - lastDragAt > 2600) {
      target.yaw = Math.round(target.yaw / (Math.PI * 2)) * Math.PI * 2;
      target.pitch = -0.06;
    }
    const tiltYaw = reduced ? 0 : hover.x * 0.16;
    const tiltPitch = reduced ? 0 : hover.y * 0.1;
    if (dragging || reduced) {
      rot.yaw = target.yaw; rot.pitch = target.pitch; rot.vyaw = 0; rot.vpitch = 0;
    } else {
      [rot.yaw, rot.vyaw] = spring(rot.yaw, rot.vyaw, target.yaw + tiltYaw, 38, 9.5, dt);
      [rot.pitch, rot.vpitch] = spring(rot.pitch, rot.vpitch, target.pitch + tiltPitch, 38, 9.5, dt);
      if (Math.abs(rot.vyaw) > 1e-3 || Math.abs(rot.vpitch) > 1e-3 || Math.abs(rot.yaw - target.yaw - tiltYaw) > 1e-3) moving = true;
    }
    [wiggle, wiggleV] = spring(wiggle, wiggleV, 0, 420, 16, dt);
    if (Math.abs(wiggle) > 1e-4 || Math.abs(wiggleV) > 1e-3) moving = true;
    device.rotation.set(rot.pitch + wiggle * 0.5, rot.yaw, wiggle * 0.25);
    device.position.y = Math.sin(rot.pitch) * 0.2;
    pressState.forEach((p, i) => {
      const to = p.down ? 1 : 0;
      [p.value, p.velocity] = spring(p.value, p.velocity, to, 900, 30, dt);
      if (Math.abs(p.value - to) > 1e-3 || Math.abs(p.velocity) > 1e-2) moving = true;
      buttons[i].position.z = buttonRest[i] - PRESS_DEPTH * Math.max(0, Math.min(1.15, p.value));
    });
    if (m.dial) {
      [dialState.angle, dialState.v] = spring(dialState.angle, dialState.v, dialState.target, 260, 22, dt);
      if (Math.abs(dialState.angle - dialState.target) > 1e-3) moving = true;
      dial.rotation.y = dialState.angle;
    }
    renderer.render(scene, camera);
    emitAnchors();
    quality.frame(performance.now(), moving || dragging);
    if (moving || dragging) raf = requestAnimationFrame(frame);
  };
  const invalidate = () => {
    if (!raf && !disposed) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
  };

  // ── 끌어서 돌리기 ──
  let pointerId: number | null = null;
  let last = { x: 0, y: 0 };
  const onPointerDown = (e: PointerEvent) => {
    pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    invalidate();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (dragging && e.pointerId === pointerId) {
      target.yaw += (e.clientX - last.x) * 0.012;
      target.pitch = Math.max(-0.55, Math.min(0.55, target.pitch + (e.clientY - last.y) * 0.008));
      last = { x: e.clientX, y: e.clientY };
      invalidate();
      return;
    }
    if (e.pointerType === 'mouse') {
      const rect = canvas.getBoundingClientRect();
      hover.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      hover.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      invalidate();
    }
  };
  const endDrag = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    lastDragAt = performance.now();
    invalidate();
    window.setTimeout(invalidate, 2700);
  };
  const onPointerLeave = () => { hover.x = 0; hover.y = 0; invalidate(); };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', onPointerLeave);
  const onLost = (e: Event) => { e.preventDefault(); options.onContextLost?.(); };
  canvas.addEventListener('webglcontextlost', onLost);
  const onVisibility = () => { if (document.visibilityState === 'visible') invalidate(); };
  document.addEventListener('visibilitychange', onVisibility);

  const framing = FRAMING[m.style];
  return {
    refreshScreen() {
      screenTexture.needsUpdate = true;
      invalidate();
    },
    press(index, down) {
      const p = pressState[index];
      if (!p) return;
      p.down = down;
      if (down && !reduced) wiggleV += (index - 1) * 0.6 - 0.25;
      invalidate();
    },
    turnDial(step) {
      dialState.target += step * (Math.PI / 9);
      invalidate();
    },
    resize(width, height) {
      size = { w: Math.max(1, width), h: Math.max(1, height) };
      renderer.setSize(size.w, size.h, false);
      camera.aspect = size.w / size.h;
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      camera.position.z = Math.max(framing.fitH / 2 / Math.tan(vFov / 2), framing.fitW / 2 / (Math.tan(vFov / 2) * camera.aspect));
      camera.position.y = framing.centerY;
      camera.lookAt(0, framing.centerY, 0);
      camera.updateProjectionMatrix();
      invalidate();
    },
    onAnchors(cb) { anchorsCb = cb; invalidate(); },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('webglcontextlost', onLost);
      document.removeEventListener('visibilitychange', onVisibility);
      balls.dispose();
      rods.dispose();
      disposables.forEach((d) => d.dispose());
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      delete canvas.dataset.tama;
      delete canvas.dataset.tamaStyle;
    },
  };
}
