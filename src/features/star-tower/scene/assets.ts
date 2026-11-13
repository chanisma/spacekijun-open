/**
 * 스프라이트 불러오기 — `public/images/star-tower/*.png`(scripts/star-tower-art/ 가 만든 진짜 저해상도 도트).
 *
 * 그림을 받으면서 두 가지를 미리 잰다.
 *  · deck  — 다음 층이 앉는 줄. 위에서부터 처음으로 폭의 60% 이상 채워진 줄(굴뚝·풍향계·깃발 같은 장식은 건너뛴다).
 *            스프라이트 높이로 쌓으면 굴뚝 끝에 다음 층이 얹혀 층 사이가 뜬다(2026-10-10 시제품에서 실제로 떴다).
 *  · lights — 밤에 켜질 창문 불빛 자리(따뜻한 노란 화소). 낮 그림에 이미 그려진 불빛을 밤에 «켜는» 것이다.
 * 그림 하나가 빠져도 게임은 돈다 — 층은 나무 상자로, 낚시꾼은 찌만, 구름은 절차적 덩어리로 대신 그린다.
 */
import { FLOORS, BASE_FLOOR, ROOF_FLOOR, CATCHES } from '../model/catalog';
import { VISITORS } from '../model/visitors';

const BASE_URL = '/images/star-tower';

export interface Sprite {
  img: CanvasImageSource;
  w: number;
  h: number;
  /** 다음 층이 앉는 줄(층만 의미 있다) */
  deck: number;
  /** 밤에 켜질 불빛 자리 */
  lights: [number, number][];
  /** 낚싯대 끝(낚시꾼만 — 위쪽에서 가장 오른쪽 화소) */
  tip: [number, number] | null;
  /** 층이 살아 움직일 자리(model/floorLife.ts) — 그림에서 찾는다(좌표를 손으로 적지 않는다) */
  anchors?: FloorAnchors;
}

export interface FloorAnchors {
  /** 가장 위 화소 — 굴뚝·환기구 끝(연기가 나는 곳) */
  top: [number, number];
  /** 파란 물 덩어리(수조) — [x, y, w, h] */
  blue: [number, number, number, number] | null;
  /** 빨간 불빛(무전기) */
  red: [number, number] | null;
  /** 창 불빛들의 범위 — 밤에 사람 그림자가 지나가는 곳 */
  window: [number, number, number, number] | null;
}

export const FISHER_POSES = ['wait', 'bite', 'reel', 'caught', 'doze', 'lookup'] as const;
export type FisherPose = (typeof FISHER_POSES)[number];
export const ITEM_ICONS = [
  'fish-sardine', 'fish-mackerel', 'fish-flounder', 'fish-star', 'wood', 'scrap', 'bottle', 'star',
  // 희귀 물고기(물고기 도감)
  'fish-moon', 'fish-koi', 'fish-dawn', 'fish-eel', 'fish-blossom', 'fish-flying', 'fish-maple', 'fish-ice',
  // 깊은 바다 물고기(2026-10-23 — 탑을 완성할수록)
  'fish-seahorse', 'fish-angler', 'fish-manta', 'fish-marlin',
] as const;
export const CLOUD_COUNT = 6;

export interface TowerAssets {
  floors: Record<string, Sprite>;
  fisher: Partial<Record<FisherPose, Sprite>>;
  items: Record<string, Sprite>;
  clouds: Sprite[];
  /** 하늘의 방문자 + 비공정 상인(merchant) — 그림 이름(visitor-<이름>.png)으로 */
  visitors: Record<string, Sprite>;
}

export const VISITOR_SPRITES = [...new Set([...VISITORS.flatMap((v) => v.sprites), 'merchant'])];

function measure(img: HTMLImageElement, kind: 'floor' | 'fisher' | 'other'): Sprite {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => d[(y * w + x) * 4 + 3] > 0;
  let deck = 0;
  if (kind === 'floor') {
    for (let y = 0; y < h; y++) {
      let n = 0;
      for (let x = 0; x < w; x++) if (on(x, y)) n++;
      if (n >= w * 0.6) { deck = y; break; }
    }
  }
  // 불빛 = «따뜻한 화소가 뭉친 곳»(창문·등불). 하나씩 보면 금빛 장식·나무 결의 밝은 점까지 걸려 밤에 탑 전체가
  // 꼬마전구처럼 반짝였다(2026-10-10 휴대폰 확인) — 둘레 8칸 중 5칸 이상이 따뜻할 때만 불빛으로 본다.
  const lights: [number, number][] = [];
  if (kind === 'floor') {
    const warm = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      const i = (y * w + x) * 4;
      // 노란빛이 뚜렷해야(빨강−파랑 > 100) — 크림색 양피지 지도(235,215,160)가 밤에 등불처럼 켜졌다(2026-10-10 확인)
      return d[i + 3] > 0 && d[i] > 210 && d[i + 1] > 160 && d[i + 2] < 140 && d[i] - d[i + 2] > 100;
    };
    let k = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!warm(x, y)) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && warm(x + dx, y + dy)) n++;
      if (n >= 5 && k++ % 2 === 0) lights.push([x, y]);
    }
  }
  let anchors: FloorAnchors | undefined;
  if (kind === 'floor') {
    let top: [number, number] = [Math.floor(w / 2), 0];
    outer: for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) { top = [x, y]; break outer; }
    const box = (pred: (r: number, g2: number, b: number) => boolean, min: number): [number, number, number, number] | null => {
      let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] && pred(d[i], d[i + 1], d[i + 2])) { n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      }
      return n >= min ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1] : null;
    };
    const blue = box((r, g2, b) => b > 150 && r < 120 && b > r + 60 && g2 > 100, 24);
    const redBox = box((r, g2, b) => r > 190 && g2 < 90 && b < 90, 1);
    let window: FloorAnchors['window'] = null;
    if (lights.length >= 6) {
      const xs = lights.map((l) => l[0]); const ys = lights.map((l) => l[1]);
      window = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs) + 1, Math.max(...ys) - Math.min(...ys) + 1];
    }
    anchors = { top, blue, red: redBox ? [redBox[0] + Math.floor(redBox[2] / 2), redBox[1] + Math.floor(redBox[3] / 2)] : null, window };
  }
  let tip: [number, number] | null = null;
  // 낚싯대 끝 · 망원경 끝(관측 돔 — 완성 뒤 밤에 빛줄기가 나간다): 위쪽 70% 안에서 가장 오른쪽 화소
  if (kind === 'fisher' || kind === 'floor') {
    for (let x = w - 1; x >= 0 && !tip; x--) for (let y = 0; y < h * 0.7; y++) if (on(x, y)) { tip = [x, y]; break; }
  }
  return { img, w, h, deck, lights, tip, anchors };
}

/** 받은 그림 수 — 로딩 화면이 읽는다(실패한 그림도 «받음»으로 센다: 대체 그림으로 게임은 돈다) */
export interface AssetProgress { loaded: number; total: number; done: boolean }
let progress: AssetProgress = { loaded: 0, total: 0, done: false };
const listeners = new Set<() => void>();
function setProgress(p: AssetProgress) { progress = p; listeners.forEach((fn) => fn()); }
export function getAssetProgress(): AssetProgress { return progress; }
export function subscribeAssetProgress(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

function load(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const settle = (v: HTMLImageElement | null) => {
      setProgress({ ...progress, loaded: progress.loaded + 1 });
      resolve(v);
    };
    img.onload = () => settle(img);
    img.onerror = () => settle(null);
    img.src = url;
  });
}

let cache: Promise<TowerAssets> | null = null;

export function loadTowerAssets(): Promise<TowerAssets> {
  if (cache) return cache;
  cache = (async () => {
    const floorKeys = [BASE_FLOOR, ROOF_FLOOR, ...FLOORS.map((f) => f.key)];
    setProgress({ loaded: 0, total: floorKeys.length + FISHER_POSES.length + ITEM_ICONS.length + CLOUD_COUNT + VISITOR_SPRITES.length, done: false });
    const [floorImgs, fisherImgs, itemImgs, cloudImgs, visitorImgs] = await Promise.all([
      Promise.all(floorKeys.map((k) => load(`${BASE_URL}/floor-${k}.png`))),
      Promise.all(FISHER_POSES.map((p) => load(`${BASE_URL}/fisher-${p}.png`))),
      Promise.all(ITEM_ICONS.map((k) => load(`${BASE_URL}/item-${k}.png`))),
      Promise.all(Array.from({ length: CLOUD_COUNT }, (_, i) => load(`${BASE_URL}/cloud-${i + 1}.png`))),
      Promise.all(VISITOR_SPRITES.map((n) => load(`${BASE_URL}/visitor-${n}.png`))),
    ]);
    const floors: Record<string, Sprite> = {};
    floorKeys.forEach((k, i) => {
      const img = floorImgs[i];
      floors[k] = img ? measure(img, 'floor') : placeholderFloor(k);
    });
    const fisher: TowerAssets['fisher'] = {};
    // 자세가 하나라도 빠지면 낚시꾼을 통째로 안 그린다(자세마다 그림체가 섞이지 않게)
    if (fisherImgs.every(Boolean)) FISHER_POSES.forEach((p, i) => { fisher[p] = measure(fisherImgs[i]!, 'fisher'); });
    const items: Record<string, Sprite> = {};
    ITEM_ICONS.forEach((k, i) => { const img = itemImgs[i]; if (img) items[k] = measure(img, 'other'); });
    const clouds = cloudImgs.filter((x): x is HTMLImageElement => !!x).map((img) => measure(img, 'other'));
    // 상인은 밤에 등불이 켜지도록 층처럼 잰다(불빛 자리)
    const visitors: Record<string, Sprite> = {};
    VISITOR_SPRITES.forEach((n, i) => { const img = visitorImgs[i]; if (img) visitors[n] = measure(img, n === 'merchant' ? 'floor' : 'other'); });
    setProgress({ ...progress, done: true });
    return { floors, fisher, items, clouds, visitors };
  })();
  return cache;
}

/** 그림이 없는 층 — 같은 폭의 나무 상자(게임이 멈추지 않게). 실제로 보이면 그림 파이프라인을 다시 돌릴 것. */
function placeholderFloor(key: string): Sprite {
  const w = 56;
  const h = 44;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a4a24'; g.fillRect(0, 4, w, h - 4);
  g.fillStyle = '#a8703a'; for (let x = 2; x < w - 2; x += 6) g.fillRect(x, 8, 4, h - 12);
  g.fillStyle = '#2f6b5a'; g.fillRect(0, 0, w, 5);
  g.fillStyle = '#ffd36a'; g.fillRect(22, 16, 12, 10);
  g.fillStyle = '#3a2410'; g.fillRect(0, h - 3, w, 3); g.fillRect(0, 4, 3, h - 4); g.fillRect(w - 3, 4, 3, h - 4);
  void key;
  return { img: c, w, h, deck: 0, lights: [[26, 20], [30, 22]], tip: null };
}

/** 낚인 것 key → 아이콘 이름 */
export function iconOfCatch(key: string): string {
  return CATCHES.find((c) => c.key === key)?.icon ?? 'fish-sardine';
}
