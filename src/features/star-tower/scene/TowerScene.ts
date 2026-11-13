/**
 * 별까지 쌓기 — 장면 엔진(캔버스 2D, 저해상도 + 정수 배율). React 를 모른다.
 *
 * 그리는 순서: 하늘(캐시) → 별 · 별자리 · 오로라 → 해 · 달 · 무지개 → 잠긴 도시 · 지난 탑 실루엣 → 구름 → 방문자(뒤) → 별똥별
 *            → 탑 · 비공정 상인 · 낚시꾼(밤엔 어둡게 + 창 불빛) → 완성 빛줄기 · 나의 별(등성) → 방문자(앞)
 *            → 물(위를 뒤집어 비추고 줄마다 흔든다)
 *            → 떠다니는 통 · 비 · 먼지
 * 하늘의 방문자·오로라·무지개는 scene/skyLife.ts(«높이마다 다른 하늘»).
 *
 * 좌표: 세계 높이 a(수면 = 0, 위로 +). 화면 y = H − (a − cam). cam = 화면 맨 아래의 높이(음수면 물이 보인다).
 * 별자리는 세계 높이에 놓여 있어서 탑이 높아져 카메라가 올라가면 «말 그대로» 새 별자리가 보인다.
 *
 * ⚠️ 낚시 연출은 정직해야 한다: 5분 칸이 찰 때마다 «낚았다» 자세를 하지만 «무엇을» 낚았는지는 그리지 않는다.
 *    무엇이 걸렸는지는 끝날 때 서버가 정한다(tower_private.roll) — 화면이 아무 물고기나 보여 주면 거짓말이 된다.
 */
import { palette, nightness, spaceBlend, mix, BAYER, SKY_SPAN, SPACE, type Rgb, type Weather } from '../model/sky';
import { CONSTELLATIONS, RANK_CONSTELLATIONS } from '../model/constellations';
import { BASE_FLOOR, ROOF_FLOOR, ROLL_SECONDS } from '../model/catalog';
import { MERCHANT_AT } from '../model/visitors';
import type { Sprite, TowerAssets, FisherPose } from './assets';
import { SkyLife, type SkyContext } from './skyLife';
import { FloorFx, type ScreenFloor } from './floorFx';
import type { Season } from '../model/sky';
import { starGlyph, starTint } from '../model/rank';

/** 지난 탑 실루엣의 축소 비율 — 먼 수평선에 서 있다 */
const PAST_SCALE = 6;
/** 지난 탑이 서는 자리: 가운데에서 이만큼 떨어진 곳부터 좌우로 번갈아 */
const PAST_FIRST = 50;
const PAST_STEP = 20;
/** 수평선 위로 솟는 먼 풍경의 최대 높이(화면 화소) — 층 그림 높이 합 882 ÷ 6 + 돔 ≈ 156. 수평선이 이보다 더 내려가면 안 그린다 */
const PAST_MAX_HEIGHT = 170;

export interface SceneView {
  /** 쌓은 층(아래 → 위). 맨 아래 갑판과 맨 위 돔은 엔진이 붙인다. */
  floors: string[];
  hour: number;
  weather: Weather;
  /** 집중 중이면 시작 시각(서버 시각 기준 ms)과 길이 */
  focus: { startedAt: number; plannedSeconds: number } | null;
  /** 서버 시각 기준 지금(ms) */
  now: number;
  /** 화면 아래를 가리는 UI 높이(CSS 화소) — 낚시터가 그 위에 오도록 카메라를 내린다 */
  bottomInset?: number;
  /**
   * 서버 상태를 받았는가. ⚠️ 받기 전엔 floors 가 [] 라서, 받는 순간 0 → N 이 «N층을 방금 지었다»로 읽혀
   * 첫 화면부터 짓기 연출과 꼭대기 보기가 돌았다(2026-10-10 실측). 받은 뒤의 변화만 «지었다»로 본다.
   */
  ready: boolean;
  /** 비가 그친 낮(지난 3시간이 비, 지금 맑음) — 무지개 */
  rainbow?: boolean;
  /** 유성우가 내리는 밤(높은 하늘 12층부터) */
  meteorShower?: boolean;
  /** 계절(한국 달력) — 봄 꽃잎 · 여름 반딧불 · 가을 낙엽 · 겨울 눈(겨울의 비는 눈이 된다) */
  season?: Season;
  /** 완성한 탑의 수(등성 랭크 — model/rank.ts). 1 이상이면 돔 위에 «나의 별»이 뜬다 */
  towers?: number;
  /** 물러난 지난 탑들의 층(아래 → 위) — 수평선에 1/6 크기 실루엣으로 선다 */
  pastTowers?: string[][];
}

interface Flake { x: number; y: number; vx: number; vy: number; p: number; c: string; size: number }

interface Placed { key: string; s: Sprite; x: number; a: number }
interface Star { x: number; a: number; b: number; p: number; big: boolean }
interface Cloud { i: number; x: number; a: number; v: number }
interface Particle { x: number; y: number; vx: number; vy: number; t: number; life: number; c: string }

const BASE_SINK = 6; // 갑판 기둥이 물에 잠기는 깊이

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export class TowerScene {
  W = 160;
  H = 360;
  cam = -60;
  private camTarget = -60;
  /** 사람이 화면을 끌어 옮겼으면 자동 따라가기를 잠시 멈춘다 */
  private manualUntil = 0;
  /** 층을 막 지었으면 잠시 꼭대기를 보여 준다(새 층이 내려앉는 것 · 새 별자리) */
  private showTopUntil = 0;
  private px = 2;
  private stars: Star[] = [];
  private clouds: Cloud[] = [];
  private spires: [number, number, number][] = [];
  private particles: Particle[] = [];
  private drops: { x: number; y: number; v: number }[] = [];
  private shooting: { x: number; a: number; t: number }[] = [];
  private skyCache: { key: string; data: ImageData } | null = null;
  private cloudTint = new Map<string, HTMLCanvasElement>();
  private towerLayer: HTMLCanvasElement | null = null;
  private lastCount = -1;
  private dropAnim: { key: string; t: number } | null = null;
  private lastRolls = -1;
  private caughtAt = -1e9;
  private biteAt = -1e9;
  private nextBite = 8;
  private time = 0;
  readonly sky: SkyLife;
  private lastCtx: SkyContext | null = null;
  private merchantBox: [number, number, number, number] | null = null;
  private fx = new FloorFx();
  private screenFloors: ScreenFloor[] = [];
  private flakes: Flake[] = [];
  /** 등성이 오른 순간(완성) — 나의 별이 퍼지는 고리. 첫 로딩의 0 → N 은 «올랐다»가 아니다(lastCount 와 같은 규칙) */
  private lastTowers = -1;
  private rankPulse = -1;
  private starBox: [number, number, number, number] | null = null;

  constructor(private assets: TowerAssets) {
    this.sky = new SkyLife(assets.visitors);
  }

  resize(W: number, H: number, px = this.px) {
    this.px = px;
    if (W === this.W && H === this.H && this.stars.length) return;
    this.W = W;
    this.H = H;
    this.skyCache = null;
    const r = rng(W * 31 + 7);
    // 별 — 높이 올라갈수록 촘촘해진다(우주에 가까워진다)
    this.stars = [];
    for (let a = 0; a < 1700; a += 4) {
      const density = (W / 160) * (0.55 + Math.min(1.6, a / 600));
      let n = Math.floor(density + r());
      while (n-- > 0) this.stars.push({ x: Math.floor(r() * W), a: a + r() * 4, b: r(), p: r() * 6.28, big: r() < 0.06 });
    }
    const cloudN = Math.ceil(W / 55) + 3;
    this.clouds = Array.from({ length: cloudN }, (_, k) => ({
      i: k % Math.max(1, this.assets.clouds.length || 6), x: r() * (W + 80) - 40, a: 30 + r() * 380, v: 1 + r() * 2.5,
    }));
    this.spires = [];
    for (let x = 2; x < W - 4; x += 6 + Math.floor(r() * 16)) {
      if (Math.abs(x - W / 2) < 42) continue;
      if (r() < 0.5) this.spires.push([x, 6 + Math.floor(r() * 22), 2 + Math.floor(r() * 4)]);
    }
  }

  /**
   * 나의 별(등성 랭크) — 돔 바로 위에 떠서 탑이 하나 완성될 때마다 커지고 빛깔이 바뀐다(model/rank.ts).
   * 낮에도 흐리게 보인다(게임의 표지 — 실제 별은 낮에 안 보이지만, 낮에만 오는 학생이 자기 별을 못 보면 안 된다).
   * 완성한 순간엔 고리가 퍼진다. ⚠️ 첫 로딩의 0 → N 은 «올랐다»가 아니다(ready 전에는 비교하지 않는다).
   */
  private drawRankStar(g: CanvasRenderingContext2D, view: SceneView, roof: ScreenFloor | null, dt: number, N: number, wet: boolean) {
    const towers = view.towers ?? 0;
    if (!view.ready) this.lastTowers = -1;
    else {
      if (this.lastTowers >= 0 && towers > this.lastTowers) this.rankPulse = 0;
      this.lastTowers = towers;
    }
    this.starBox = null;
    if (towers <= 0 || !roof || this.dropAnim) return;
    const { arm, glow } = starGlyph(towers);
    const [r, gg, b] = starTint(towers).rgb;
    const cx = Math.round(roof.x + roof.s.w / 2);
    const cy = Math.round(roof.y - 6 - glow + Math.sin(this.time * 1.3) * 1.2);
    if (cy + glow < 0 || cy - glow > this.H) return;
    // 낮에도 거의 또렷하게 — 엷은 빛깔이 밝은 하늘에 묻혀 0.5 로는 안 보였다(2026-10-15 스크린샷)
    const vis = (0.85 + 0.15 * N) * (wet ? 0.55 : 1);
    const tw = 0.85 + 0.15 * Math.sin(this.time * 2.4);
    g.globalCompositeOperation = 'lighter';
    // 번짐 — 둥근 빛을 몇 겹(저해상도라 둥근 그라데이션 대신 칸)
    for (let d = glow; d >= 1; d--) {
      const a = 0.05 * vis * (1 - d / (glow + 1)) * tw;
      g.fillStyle = `rgba(${r},${gg},${b},${a})`;
      g.fillRect(cx - d, cy - d + 1, d * 2 + 1, d * 2 - 1);
      g.fillRect(cx - d + 1, cy - d, d * 2 - 1, d * 2 + 1);
    }
    // 십자 팔 + (네 번째 탑부터) 대각선 반짝임 — 덧칠(lighter)이면 밝은 낮 하늘에서 사라지므로 그냥 칠한다
    g.globalCompositeOperation = 'source-over';
    for (let k = 1; k <= arm; k++) {
      const a = vis * tw * (1 - k / (arm + 1));
      g.fillStyle = `rgba(${r},${gg},${b},${a})`;
      g.fillRect(cx - k, cy, 1, 1); g.fillRect(cx + k, cy, 1, 1);
      g.fillRect(cx, cy - k, 1, 1); g.fillRect(cx, cy + k, 1, 1);
      if (towers >= 4 && k <= Math.ceil(arm / 2)) {
        const ad = a * 0.6;
        g.fillStyle = `rgba(${r},${gg},${b},${ad})`;
        g.fillRect(cx - k, cy - k, 1, 1); g.fillRect(cx + k, cy - k, 1, 1);
        g.fillRect(cx - k, cy + k, 1, 1); g.fillRect(cx + k, cy + k, 1, 1);
      }
    }
    g.fillStyle = `rgba(255,255,255,${vis})`;
    g.fillRect(cx, cy, 1, 1);
    g.globalCompositeOperation = 'lighter';
    // 완성한 순간 — 퍼지는 고리 2.5초
    if (this.rankPulse >= 0) {
      this.rankPulse += dt;
      const p = this.rankPulse / 2.5;
      if (p >= 1) this.rankPulse = -1;
      else {
        const rad = Math.round(4 + p * 40);
        const a = (1 - p) * 0.7;
        g.fillStyle = `rgba(${r},${gg},${b},${a})`;
        for (let i = 0; i < 48; i++) {
          const ang = (i / 48) * Math.PI * 2;
          g.fillRect(Math.round(cx + Math.cos(ang) * rad), Math.round(cy + Math.sin(ang) * rad * 0.8), 1, 1);
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
    const hit = Math.max(6, arm + 2);
    this.starBox = [cx - hit, cy - hit, hit * 2 + 1, hit * 2 + 1];
  }

  /**
   * 물러난 지난 탑들 — 수평선의 1/6 크기 실루엣. 그 탑의 «실제 층 순서»로 쌓아 탑마다 모양이 다르다.
   * 최근 탑일수록 가운데 가까이, 좌우로 번갈아 선다. 화면 폭에 안 들어가는 오래된 탑은 그리지 않는다(랭크 판이 개수를 말한다).
   * 꼭대기엔 그 탑이 남긴 별(그 탑을 완성했을 때의 빛깔). 물 반사는 아래 «물»이 위를 뒤집어 비추므로 저절로 생긴다.
   */
  private drawPastTowers(g: CanvasRenderingContext2D, past: string[][], seaY: number, far: Rgb, N: number, wet: boolean) {
    if (!past.length) return;
    const { W } = this;
    // 먼 첨탑과 같은 «먼 색»(아주 어두운 단색이면 탑이 아니라 기둥으로 읽혔다) + 층마다 한 줄 이음새
    const body = `rgb(${far.join(',')})`;
    const seam = `rgb(${far.map((v) => Math.round(v * 0.8)).join(',')})`;
    for (let k = 0; k < past.length; k++) {
      const dist = PAST_FIRST + PAST_STEP * Math.floor(k / 2);
      if (dist + 6 > W / 2) break;
      const idx = past.length - 1 - k;              // k=0 = 가장 최근 탑
      const cx = Math.round(W / 2 + (k % 2 === 0 ? 1 : -1) * dist);
      let y = seaY;
      g.fillStyle = body;
      const levels = [BASE_FLOOR, ...past[idx]];
      levels.forEach((key, li) => {
        const s = this.assets.floors[key];
        const w = Math.max(3, Math.round((s?.w ?? 56) / PAST_SCALE));
        const h = Math.max(2, Math.round(((s ? s.h - s.deck - 2 : 30)) / PAST_SCALE));
        y -= h;
        const x0 = cx - Math.floor(w / 2);
        g.fillStyle = body;
        g.fillRect(x0, y, w, h);
        g.fillStyle = seam;
        g.fillRect(x0 - (li > 0 ? 1 : 0), y + h - 1, w + (li > 0 ? 2 : 0), 1);   // 층 바닥 — 한 칸 내민 난간
        if (N > 0.3 && li > 0) {
          g.fillStyle = `rgba(255,200,110,${0.75 * N})`;
          g.fillRect(x0 + 1 + (li % 3), y + 1, 1, 1);
          if (w >= 8) g.fillRect(x0 + w - 3, y + 1, 1, 1);
        }
      });
      // 돔 + 그 탑의 별
      g.fillStyle = body;
      g.fillRect(cx - 3, y - 2, 7, 2);
      g.fillRect(cx - 2, y - 3, 5, 1);
      g.fillRect(cx - 1, y - 4, 3, 1);
      const [r, gg, b] = starTint(idx + 1).rgb;
      const a = (0.45 + 0.55 * N) * (wet ? 0.5 : 1);
      g.fillStyle = `rgba(${r},${gg},${b},${a})`;
      g.fillRect(cx, y - 8, 1, 1);
      g.fillStyle = `rgba(${r},${gg},${b},${a * 0.45})`;
      g.fillRect(cx - 1, y - 8, 1, 1); g.fillRect(cx + 1, y - 8, 1, 1);
      g.fillRect(cx, y - 9, 1, 1); g.fillRect(cx, y - 7, 1, 1);
    }
  }

  /** 탑 배치 — 아래 갑판 → 쌓은 층 → 돔. 각 층 바닥 높이 a 와 x */
  layout(floors: string[]): { placed: Placed[]; top: number } {
    const keys = [BASE_FLOOR, ...floors, ROOF_FLOOR];
    const placed: Placed[] = [];
    let a = -BASE_SINK;
    for (const key of keys) {
      const s = this.assets.floors[key];
      if (!s) continue;
      placed.push({ key, s, x: Math.round(this.W / 2 - s.w / 2), a });
      a = a + s.h - s.deck - 2;
    }
    const last = placed[placed.length - 1];
    return { placed, top: last ? last.a + last.s.h : 0 };
  }

  /** 사람이 끌어서 옮긴다(화면 화소). 아래로 끌면 위가 보인다. */
  pan(dy: number, now: number) {
    this.camTarget += dy;
    this.cam += dy;
    this.manualUntil = now + 12_000;
  }

  /** 꼭대기로 돌아가기 */
  follow() { this.manualUntil = 0; }

  /** 누른 자리(내부 화소) — 'merchant' · 방문자 key · null */
  tap(x: number, y: number): string | null {
    const b = this.merchantBox;
    if (b && x >= b[0] && x <= b[0] + b[2] && y >= b[1] && y <= b[1] + b[3]) return 'merchant';
    const s = this.starBox;
    if (s && x >= s[0] && x <= s[0] + s[2] && y >= s[1] && y <= s[1] + s[3]) return 'rank-star';
    const v = this.lastCtx ? this.sky.tap(x, y, this.lastCtx) : null;
    if (v) return v;
    // 층(위에서부터) — 맨 아래 갑판은 낚시꾼까지 포함한다
    for (let i = this.screenFloors.length - 1; i >= 0; i--) {
      const f = this.screenFloors[i];
      const pad = f.key === BASE_FLOOR ? 14 : 0;
      if (x >= f.x - 2 && x <= f.x + f.s.w + pad && y >= f.y + f.s.deck && y <= f.y + f.s.h) {
        this.fx.tap(f.key, f, this.time);
        return `floor:${f.key}`;
      }
    }
    return null;
  }

  /** 계절 — 봄 꽃잎 · 여름 밤 반딧불 · 가을 낙엽 · 겨울 눈(겨울 비 = 큰 눈) */
  private drawSeason(g: CanvasRenderingContext2D, view: SceneView, dt: number, N: number, snow: boolean, waterY: number) {
    const { W, H } = this;
    const s = view.season;
    const want = !s ? 0 : s === 'winter' ? (snow ? Math.ceil(W * 0.7) : Math.ceil(W * 0.12))
      : s === 'summer' ? (N > 0.5 ? Math.ceil(W * 0.08) : 0) : s === 'spring' ? Math.ceil(W * 0.1) : Math.ceil(W * 0.06);
    while (this.flakes.length < want) {
      const kind = s!;
      // 채울 때는 화면 전체에 흩뿌린다(처음부터 위에서만 떨어지면 몇 초 동안 위쪽에만 몰린다)
      this.flakes.push({
        x: Math.random() * W, y: kind === 'summer' ? waterY - Math.random() * H * 0.5 : Math.random() * H,
        vx: kind === 'winter' ? -3 + Math.random() * 2 : 6 + Math.random() * 6,
        vy: kind === 'winter' ? 10 + Math.random() * 14 : kind === 'summer' ? 0 : 7 + Math.random() * 6,
        p: Math.random() * 6.28,
        c: kind === 'spring' ? (Math.random() < 0.5 ? '255,140,180' : '255,175,200') : kind === 'autumn' ? (['230,110,40', '200,70,40', '240,170,60'][Math.floor(Math.random() * 3)]) : kind === 'summer' ? '210,255,120' : '255,255,255',
        size: kind === 'winter' ? (Math.random() < 0.25 ? 2 : 1) : kind === 'summer' ? 1 : 2,
      });
    }
    if (this.flakes.length > want) this.flakes.length = want;
    const T = this.time;
    for (const f of this.flakes) {
      if (s === 'summer') {
        f.x += Math.sin(T * 0.7 + f.p) * 6 * dt; f.y += Math.cos(T * 0.5 + f.p) * 4 * dt;
        const glow = 0.5 + 0.5 * Math.sin(T * 3 + f.p * 3);
        g.fillStyle = `rgba(${f.c},${0.9 * glow * N})`; g.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
        g.fillStyle = `rgba(${f.c},${0.15 * glow * N})`; g.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 3, 3);
        continue;
      }
      f.x += (f.vx + Math.sin(T * 1.5 + f.p) * 6) * dt;
      f.y += f.vy * dt;
      if (f.y > H || f.x > W + 4 || f.x < -6) { f.y = -4; f.x = Math.random() * (W + 20) - 10; }
      if (f.y > waterY + 2) { f.y = -4; f.x = Math.random() * W; continue; }
      g.fillStyle = `rgba(${f.c},0.9)`;
      // 꽃잎은 2×2(옅은 낮 하늘에서 1줄짜리는 안 보였다 — 2026-10-10 휴대폰 확인), 낙엽은 2×1, 눈은 크기대로
      g.fillRect(Math.round(f.x), Math.round(f.y), f.size, s === 'winter' ? f.size : s === 'spring' ? 2 : 1);
    }
  }

  /** 시험·연출용 — 방문자를 지금 화면에 */
  summon(key: string) { if (this.lastCtx) this.sky.summon(key, this.lastCtx); }

  private screenY(a: number) { return this.H - (a - this.cam); }

  render(g: CanvasRenderingContext2D, view: SceneView, dt: number) {
    const { W, H } = this;
    this.time += dt;
    const T = this.time;
    const N = nightness(view.hour);
    const wet = view.weather === 'rain';
    const snow = wet && view.season === 'winter';   // 겨울의 비는 눈
    const rain = wet && !snow;
    const P = palette(view.hour);
    const grey = rain ? 0.55 : snow ? 0.35 : 0;
    const top = mix(P.top, [60, 64, 84], grey);
    const mid = mix(P.mid, [92, 96, 112], grey);
    const hor = mix(P.hor, [120, 124, 136], grey);

    // ── 카메라 ──
    // 탑이 다 들어가면 다 보여 준다(아래 정렬). 안 들어가면 — 집중하는 동안은 «낚시터»(주인공은 낚시꾼),
    // 쉬는 동안은 «꼭대기»(그 높이의 하늘·방문자·별자리 — 2026-10-10 «높이마다 다른 하늘»).
    // 층을 막 지었으면 7초 동안 꼭대기. 사람이 끌면 12초 동안 따라가지 않는다.
    const { placed, top: towerTop } = this.layout(view.floors);
    const inset = Math.round((view.bottomInset ?? 0) / this.px);
    const minCam = -(Math.min(70, Math.floor(H * 0.16)) + inset);
    // 나의 별(등성)이 떠 있으면 그 높이만큼 더 비운다 — 안 그러면 휴대폰에서 별이 위 자원 줄 뒤로 숨는다(2026-10-15 실측)
    const topPad = 24 + ((view.towers ?? 0) > 0 ? 14 + 2 * starGlyph(view.towers ?? 0).glow : 0);
    const fits = towerTop + topPad - minCam <= H;
    const nowMs = performance.now();
    const showTop = !view.focus || nowMs < this.showTopUntil;
    const want = fits || !showTop ? minCam : towerTop + topPad - H;
    const maxCam = Math.max(minCam, towerTop + 220 - H);
    if (nowMs > this.manualUntil) this.camTarget = want;
    this.camTarget = Math.max(minCam - 30, Math.min(maxCam, this.camTarget));
    this.cam += (this.camTarget - this.cam) * Math.min(1, dt * 3);
    this.cam = Math.round(this.cam * 4) / 4;
    const cam = Math.round(this.cam);
    const waterY = Math.min(H, H + cam); // 수면의 화면 y(물이 안 보이면 H) — 물·반사를 «그리는 범위»용
    // 수평선(고도 0)의 «실제» 화면 y — 카메라가 물 위로 올라가면 H 보다 커진다(화면 아래로 내려간다).
    // ⚠️ 수평선에 «서 있는» 것(잠긴 도시·지난 탑 실루엣·물에서 솟는 방문자)은 이 줄에 붙일 것. waterY 는 H 에서
    //    멈추므로 거기 붙이면 탑이 높아져 시점이 올라갈 때 화면 아래에 매달려 함께 올라온다(2026-10-22 제보).
    const seaY = H + cam;

    // ── 1) 하늘 — 시각·카메라·날씨가 바뀔 때만 다시 계산 ──
    const skyKey = `${Math.round(view.hour * 20)}|${cam}|${grey}|${W}x${H}`;
    if (!this.skyCache || this.skyCache.key !== skyKey) {
      const img = g.createImageData(W, H);
      const D = img.data;
      for (let y = 0; y < waterY; y++) {
        const a = cam + (H - y);
        const t = Math.max(0, Math.min(1, a / SKY_SPAN));
        const c0 = t < 0.45 ? hor : mid;
        const c1 = t < 0.45 ? mid : top;
        const tt = t < 0.45 ? t / 0.45 : (t - 0.45) / 0.55;
        const sp = spaceBlend(a, N);
        for (let x = 0; x < W; x++) {
          const q = Math.round(tt * 6 + BAYER[(y & 3) * 4 + (x & 3)]) / 6;
          let c = mix(c0, c1, Math.max(0, Math.min(1, q)));
          if (sp > 0) c = mix(c, SPACE, Math.round(sp * 8 + BAYER[(x & 3) * 4 + (y & 3)]) / 8);
          const i = (y * W + x) * 4;
          D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = 255;
        }
      }
      this.skyCache = { key: skyKey, data: img };
    }
    g.putImageData(this.skyCache.data, 0, 0);

    const px = (x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
    const dim = Math.max(N * 0.55, grey * 0.32);
    const ctx: SkyContext = { W, H, cam, T, N, rain, floors: view.floors.length, towers: view.towers ?? 0, waterY, screenY: (a) => this.screenY(a), dim };
    this.lastCtx = ctx;
    this.sky.update(ctx, dt);

    // ── 2) 별 · 별자리 (비·눈이 오면 흐려서 안 보인다) ──
    if (!wet) {
      for (const s of this.stars) {
        const y = Math.round(this.screenY(s.a));
        if (y < 0 || y >= waterY) continue;
        const vis = Math.max(N, spaceBlend(s.a, N) * 1.3) * Math.min(1, s.a / 50);
        if (vis < 0.03) continue;
        const a = vis * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(T * 1.8 * s.b + s.p)));
        px(s.x, y, `rgba(255,250,230,${a})`);
        if (s.big) {
          const h = `rgba(200,210,255,${a * 0.45})`;
          px(s.x - 1, y, h); px(s.x + 1, y, h); px(s.x, y - 1, h); px(s.x, y + 1, h);
        }
      }
      const off = Math.round((W - 160) / 2);
      // 층 별자리(지금 탑의 층) + 등성 별자리(완성한 탑 수 — 2026-10-23, 가운데 줄 x 56~96)
      const lit = [
        ...CONSTELLATIONS.filter((c) => view.floors.length >= c.unlockAt),
        ...RANK_CONSTELLATIONS.filter((c) => (view.towers ?? 0) >= c.towersAt),
      ];
      for (const c of lit) {
        const vis = Math.max(N, spaceBlend(c.altitude, N) * 1.4);
        if (vis < 0.05) continue;
        const pt = (k: number) => [off + c.x + c.stars[k][0], Math.round(this.screenY(c.altitude + 30 - c.stars[k][1]))] as const;
        g.strokeStyle = `rgba(170,190,255,${0.32 * vis})`;
        g.lineWidth = 1;
        g.beginPath();
        for (const [i, j] of c.lines) {
          const [x1, y1] = pt(i); const [x2, y2] = pt(j);
          g.moveTo(x1 + 0.5, y1 + 0.5); g.lineTo(x2 + 0.5, y2 + 0.5);
        }
        g.stroke();
        c.stars.forEach((st, k) => {
          const [x, y] = pt(k);
          const tw = 0.75 + 0.25 * Math.sin(T * 2 + k * 1.7);
          px(x, y, `rgba(255,248,220,${vis * tw})`);
          if (st[2] >= 2) {
            const h = `rgba(190,205,255,${vis * 0.5 * tw})`;
            px(x - 1, y, h); px(x + 1, y, h); px(x, y - 1, h); px(x, y + 1, h);
          }
          if (st[2] >= 3) { const h = `rgba(190,205,255,${vis * 0.22})`; px(x - 2, y, h); px(x + 2, y, h); px(x, y - 2, h); px(x, y + 2, h); }
        });
      }
    }

    this.sky.aurora(g, ctx);

    // ── 3) 해 · 달 ──
    if (!wet) {
      const orb = (t: number, r: number, col: string, glow: string) => {
        if (t < -0.05 || t > 1.05) return;
        const ox = Math.round(14 + t * (W - 28));
        const oy = Math.round(this.screenY(10 + Math.sin(Math.PI * Math.max(0, Math.min(1, t))) * 210));
        for (let y = -r - 6; y <= r + 6; y++) for (let x = -r - 6; x <= r + 6; x++) {
          if (oy + y >= waterY) continue;
          const d = Math.hypot(x, y);
          if (d <= r) px(ox + x, oy + y, col);
          else if (d <= r + 3) px(ox + x, oy + y, glow.replace('A', '0.32'));
          else if (d <= r + 6) px(ox + x, oy + y, glow.replace('A', '0.13'));
        }
      };
      orb((view.hour - 6) / 12, 7, '#fff4cf', 'rgba(255,190,120,A)');
      if (N > 0.7) orb(((view.hour + 12) % 24 - 6) / 12, 5, '#f0f4ff', 'rgba(140,160,220,A)');
    }

    if (view.rainbow && !rain && N < 0.35) this.sky.rainbow(g, ctx);

    // ── 4) 물에 잠긴 도시(먼 첨탑) ──
    if (seaY < H + PAST_MAX_HEIGHT) {
      const far = mix(hor, top, 0.45).map((v) => v * 0.78) as Rgb;
      g.fillStyle = `rgb(${far.join(',')})`;
      for (const [sx, sh, sw] of this.spires) {
        const y = seaY - sh;
        g.fillRect(sx, y + 2, sw, sh - 2);
        g.fillRect(sx + Math.floor(sw / 2), y, 1, 2);
      }
      this.drawPastTowers(g, view.pastTowers ?? [], seaY, far, N, wet);
    }

    // ── 5) 구름 ──
    const lit = mix(mix([255, 236, 230], hor, 0.45), [255, 255, 255], 0.25 * (1 - N));
    const tint = mix(mix(lit, mid, 0.25 + 0.35 * N), [96, 100, 120], grey);
    const tintKey = tint.map((v) => Math.round(v / 6)).join(',');
    for (const c of this.clouds) {
      c.x += c.v * dt * (rain ? 2 : 1);
      if (c.x > W + 20) c.x = -90;
      const s = this.cloudSprite(c.i);
      const y = Math.round(this.screenY(c.a)) - s.h;
      if (y > waterY || y + s.h < 0) continue;
      g.globalAlpha = rain ? 0.95 : 0.9;
      g.drawImage(this.tintedCloud(c.i, s, tint, tintKey), Math.round(c.x), y);
      g.globalAlpha = 1;
    }

    this.sky.draw(g, ctx, 'behind');

    // ── 6) 별똥별(유성우 밤에는 열 배) ──
    const meteorRate = view.meteorShower && view.floors.length >= 12 ? 1.4 : 0.12;
    if (N > 0.6 && !rain && Math.random() < dt * meteorRate) {
      this.shooting.push({ x: 20 + Math.random() * (W - 20), a: this.cam + H * (0.55 + Math.random() * 0.4), t: 0 });
    }
    for (const s of this.shooting) {
      s.t += dt;
      for (let k = 0; k < 14; k++) {
        const y = Math.round(this.screenY(s.a) + s.t * 40 - k * 0.7);
        if (y >= waterY) continue;
        px(Math.round(s.x - s.t * 90 + k * 1.6), y, `rgba(255,255,255,${(1 - k / 14) * (1 - s.t / 0.9)})`);
      }
    }
    this.shooting = this.shooting.filter((s) => s.t < 0.9);

    // ── 7) 탑 ──
    if (!view.ready) this.lastCount = -1;
    else if (this.lastCount >= 0 && view.floors.length > this.lastCount) {
      this.dropAnim = { key: view.floors[view.floors.length - 1], t: 0 };
      this.showTopUntil = performance.now() + 7000;
      this.manualUntil = 0;
    }
    if (view.ready) this.lastCount = view.floors.length;
    if (!this.towerLayer || this.towerLayer.width !== W || this.towerLayer.height !== H) {
      this.towerLayer = document.createElement('canvas');
      this.towerLayer.width = W;
      this.towerLayer.height = H;
    }
    const tl = this.towerLayer.getContext('2d')!;
    tl.clearRect(0, 0, W, H);
    tl.globalCompositeOperation = 'source-over';
    let dropOffset = 0;
    if (this.dropAnim) {
      this.dropAnim.t += dt;
      const t = Math.min(1, this.dropAnim.t / 0.75);
      dropOffset = Math.round((1 - (1 - Math.pow(1 - t, 3))) * 90);
      if (t >= 1) {
        const f = placed.find((p) => p.key === this.dropAnim!.key);
        if (f) {
          const y = this.screenY(f.a) - 2;
          for (let k = 0; k < 22; k++) {
            const left = k % 2 === 0;
            this.particles.push({ x: left ? f.x + 2 : f.x + f.s.w - 2, y, vx: (left ? -1 : 1) * (8 + Math.random() * 26), vy: -Math.random() * 18, t: 0, life: 0.9, c: '230,210,180' });
          }
        }
        this.dropAnim = null;
      }
    }
    this.screenFloors = [];
    for (const f of placed) {
      // 새 층과 그 위(돔)는 함께 내려앉는다
      const moving = this.dropAnim && placed.indexOf(f) >= placed.findIndex((p) => p.key === this.dropAnim!.key);
      const y = Math.round(this.screenY(f.a) - f.s.h - (moving ? dropOffset : 0));
      if (y > H || y + f.s.h < 0) continue;
      tl.drawImage(f.s.img, f.x, y);
      this.screenFloors.push({ key: f.key, s: f.s, x: f.x, y });
    }
    // 낚시꾼도 탑 층에 그려 밤의 어둠을 함께 받는다(따로 그리면 한밤에 혼자 환하다)
    const base = placed[0];
    const pose = this.fisherPose(view, N);
    const fs = this.assets.fisher[pose];
    let fisherAt: [number, number] | null = null;
    if (base && fs) {
      const baseTopY = this.screenY(base.a) - base.s.h;
      fisherAt = [base.x + base.s.w - Math.round(fs.w * 0.55), Math.round(baseTopY + base.s.deck + 3 - fs.h)];
      tl.drawImage(fs.img, fisherAt[0], fisherAt[1]);
    }
    // 비공정 상인 — 구름층(7층)에 닿으면 돔 아래층 옆에 정박한다(누르면 상인의 교환)
    const ms = this.assets.visitors.merchant;
    this.merchantBox = null;
    let merchantAt: [number, number] | null = null;
    if (ms && view.floors.length >= MERCHANT_AT && placed.length >= 2 && !this.dropAnim) {
      const dock = placed[placed.length - 2];
      const right = dock.x + dock.s.w - 2;
      const mx = right + ms.w <= W ? right : dock.x + 2 - ms.w;
      const my = Math.round(this.screenY(dock.a) - dock.s.h * 0.9 - ms.h * 0.45 + Math.sin(T * 0.9) * 1.5);
      merchantAt = [mx, my];
      if (mx < dock.x) { tl.save(); tl.translate(mx + ms.w, my); tl.scale(-1, 1); tl.drawImage(ms.img, 0, 0); tl.restore(); }
      else tl.drawImage(ms.img, mx, my);
      this.merchantBox = [mx, my, ms.w, ms.h];
    }
    if (dim > 0) {
      tl.globalCompositeOperation = 'source-atop';
      tl.fillStyle = `rgba(20,22,60,${dim})`;
      tl.fillRect(0, 0, W, H);
      tl.globalCompositeOperation = 'source-over';
    }
    g.drawImage(this.towerLayer, 0, 0);
    const lightOn = Math.max(N, rain ? 0.5 : 0);
    if (lightOn > 0.05) {
      g.globalCompositeOperation = 'lighter';
      for (const f of placed) {
        const moving = this.dropAnim && placed.indexOf(f) >= placed.findIndex((p) => p.key === this.dropAnim!.key);
        const y0 = Math.round(this.screenY(f.a) - f.s.h - (moving ? dropOffset : 0));
        for (const [lx, ly] of f.s.lights) {
          const fl = 0.85 + 0.15 * Math.sin(T * 3 + lx * 7 + ly);
          g.fillStyle = `rgba(255,200,110,${0.85 * lightOn * fl})`;
          g.fillRect(f.x + lx, y0 + ly, 1, 1);
          g.fillStyle = `rgba(255,170,80,${0.06 * lightOn * fl})`;
          g.fillRect(f.x + lx - 3, y0 + ly - 3, 7, 7);
        }
      }
      if (ms && merchantAt) {
        for (const [lx, ly] of ms.lights) {
          g.fillStyle = `rgba(255,200,110,${0.85 * lightOn})`;
          g.fillRect(merchantAt[0] + lx, merchantAt[1] + ly, 1, 1);
        }
      }
      g.globalCompositeOperation = 'source-over';
    }

    // 층이 살아 움직이기(연기·김·물방울·불빛·창 그림자·누른 층의 말풍선)
    this.fx.update(dt, this.screenFloors, T, N);
    this.fx.draw(g, this.screenFloors, T, N, dim);

    // 완성(16층) — 맑은 밤이면 관측 돔의 망원경에서 별을 향해 빛줄기
    // 빛줄기 색 = 나의 별 빛깔(등성 랭크 — 완성할 때마다 붉은 별 → 푸른 별)
    const beam = starTint(Math.max(1, view.towers ?? 0)).rgb;
    const roof = this.screenFloors.find((f) => f.key === ROOF_FLOOR);
    if (roof?.s.tip && view.floors.length >= 16 && N > 0.5 && !rain) {
      const [tx, ty] = [roof.x + roof.s.tip[0], roof.y + roof.s.tip[1]];
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 140; k++) {
        const a = (1 - k / 140) * 0.16 * N * (0.8 + 0.2 * Math.sin(T * 2 + k * 0.1));
        g.fillStyle = `rgba(${beam[0]},${beam[1]},${beam[2]},${a})`;
        g.fillRect(Math.round(tx + k * 0.55), Math.round(ty - k), 1 + (k > 60 ? 1 : 0), 1);
      }
      g.globalCompositeOperation = 'source-over';
    }
    this.drawRankStar(g, view, roof ?? null, dt, N, wet);

    this.sky.draw(g, ctx, 'front');

    // ── 8) 낚시꾼 · 찌 ──
    let bobber: [number, number] | null = null;
    if (base) {
      const fishing = !!view.focus;
      if (fs && fisherAt) {
        const [fx, fy] = fisherAt;
        if (fishing && fs.tip && pose !== 'caught') {
          const tx = fx + fs.tip[0] + 0.5;
          const ty = fy + fs.tip[1] + 0.5;
          const bx = Math.round(tx + (pose === 'reel' ? 1 : 3));
          const by = waterY + (pose === 'bite' ? 1 : 0) + Math.round(Math.sin(T * 2) * 0.6);
          g.strokeStyle = 'rgba(235,235,245,0.55)';
          g.beginPath(); g.moveTo(tx, ty); g.lineTo(bx + 0.5, by); g.stroke();
          bobber = [bx, by];
        }
        if (pose === 'caught') {
          const k = (T - this.caughtAt) * 3;
          for (let i = 0; i < 4; i++) {
            const ang = i * 1.57 + k;
            px(Math.round(fx + fs.w * 0.7 + Math.cos(ang) * (4 + k * 2)), Math.round(fy + 4 + Math.sin(ang) * (3 + k)), `rgba(255,240,170,${Math.max(0, 1 - k / 4)})`);
          }
        }
      } else if (fishing) {
        bobber = [base.x + base.s.w + 8, waterY];
      }
      if (bobber && bobber[1] < H) {
        px(bobber[0], bobber[1] - 1, '#ff4a4a');
        px(bobber[0], bobber[1], '#ffffff');
      }
    }

    // ── 9) 물 ──
    if (waterY < H) {
      const src = g.getImageData(0, 0, W, Math.max(1, waterY)).data;
      const wd = g.getImageData(0, waterY, W, H - waterY);
      const WD = wd.data;
      const sea = mix(P.sea, [70, 78, 96], grey);
      const rows = H - waterY;
      for (let y = 0; y < rows; y++) {
        const depth = y / Math.max(1, rows);
        const sy = waterY - 1 - Math.floor(y * 1.15);
        const amp = 0.6 + depth * 2.6;
        const off = Math.round(Math.sin(T * 1.6 + y * 0.9) * amp + Math.sin(T * 0.7 + y * 0.23) * amp * 0.5);
        const k = 0.32 + depth * 0.35;
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const sx = Math.max(0, Math.min(W - 1, x + off));
          let r = sea[0], gg = sea[1], b = sea[2];
          if (sy >= 0) {
            const j = (sy * W + sx) * 4;
            r = src[j] * (1 - k) + sea[0] * k; gg = src[j + 1] * (1 - k) + sea[1] * k; b = src[j + 2] * (1 - k) + sea[2] * k;
          }
          if (((y + Math.floor(T * 4)) % 7 === 0) && ((x * 13 + y * 7 + Math.floor(T * 2)) % 23 < 6)) { r += 26; gg += 26; b += 28; }
          if (y === 0) { r = r * 0.8 + sea[0] * 0.2 + 18; gg = gg * 0.8 + sea[1] * 0.2 + 18; b = b * 0.8 + sea[2] * 0.2 + 22; }
          WD[i] = r; WD[i + 1] = gg; WD[i + 2] = b; WD[i + 3] = 255;
        }
      }
      g.putImageData(wd, 0, waterY);
      // 찌 물결
      if (bobber) {
        const rp = (T * 0.6) % 1;
        const rw = Math.round(2 + rp * 6);
        g.fillStyle = `rgba(255,255,255,${0.35 * (1 - rp)})`;
        g.fillRect(bobber[0] - rw, waterY + 2, rw * 2 + 1, 1);
      }
      // 떠다니는 통·나무
      const floaters: [number, number, number][] = [[0.1, 0.9, 10], [0.82, 1.3, 18], [0.66, 0.7, 30], [0.28, 1.1, 24]];
      for (const [fx0, sp, dy] of floaters) {
        const x = Math.round(fx0 * W + Math.sin(T * 0.3 * sp) * 6);
        const y = waterY + dy + Math.round(Math.sin(T * sp));
        if (y + 3 >= H || Math.abs(x - W / 2) < 34) continue;
        g.fillStyle = '#5a3a22'; g.fillRect(x, y, 6, 3);
        g.fillStyle = '#8a5a32'; g.fillRect(x, y, 6, 1);
        g.fillStyle = '#3a3a44'; g.fillRect(x + 2, y, 1, 3);
      }
    }

    // ── 10) 비 · 먼지 ──
    if (rain) {
      while (this.drops.length < Math.ceil(W * 0.55)) this.drops.push({ x: Math.random() * W * 1.2, y: -Math.random() * H, v: 220 + Math.random() * 80 });
      for (const d of this.drops) {
        d.y += d.v * dt; d.x -= d.v * dt * 0.15;
        g.fillStyle = 'rgba(200,210,235,0.45)';
        g.fillRect(Math.round(d.x), Math.round(d.y), 1, 3);
        if (d.y > waterY + Math.random() * 60 || d.y > H) {
          if (d.y > waterY) { g.fillStyle = 'rgba(220,230,255,0.5)'; g.fillRect(Math.round(d.x) - 1, Math.round(Math.min(d.y, H - 1)), 3, 1); }
          d.y = -10; d.x = Math.random() * W * 1.2;
        }
      }
    } else this.drops.length = 0;
    this.drawSeason(g, view, dt, N, snow, waterY);
    for (const p of this.particles) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 30 * dt;
      g.fillStyle = `rgba(${p.c},${Math.max(0, 1 - p.t / p.life)})`;
      g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
  }

  /** 지금 낚시꾼 자세 — 집중 중: 기다림(가끔 입질), 5분 칸이 찰 때마다 «낚았다». 쉬는 중: 낮엔 졸고 밤엔 별을 본다. */
  private fisherPose(view: SceneView, N: number): FisherPose {
    const T = this.time;
    if (!view.focus) { this.lastRolls = -1; return N > 0.5 ? 'lookup' : 'doze'; }
    const elapsed = Math.max(0, (view.now - view.focus.startedAt) / 1000);
    const rolls = Math.floor(Math.min(elapsed, view.focus.plannedSeconds) / ROLL_SECONDS);
    if (this.lastRolls >= 0 && rolls > this.lastRolls) { this.caughtAt = T; }
    this.lastRolls = rolls;
    const since = T - this.caughtAt;
    if (since < 0.9) return 'reel';
    if (since < 3.2) return 'caught';
    if (T > this.nextBite) { this.biteAt = T; this.nextBite = T + 14 + Math.random() * 20; }
    return T - this.biteAt < 0.7 ? 'bite' : 'wait';
  }

  private cloudSprite(i: number): Sprite {
    const list = this.assets.clouds;
    if (list.length) return list[i % list.length];
    const key = `proc-${i}`;
    let c = this.cloudTint.get(key);
    if (!c) { c = proceduralCloud(i); this.cloudTint.set(key, c); }
    return { img: c, w: c.width, h: c.height, deck: 0, lights: [], tip: null };
  }

  /** 흰 구름 그림에 지금 하늘색을 곱한다(곱하기 → 원래 알파로 다시 자르기). 하늘색이 조금 바뀔 때마다만 다시 만든다. */
  private tintedCloud(i: number, s: Sprite, tint: Rgb, tintKey: string): HTMLCanvasElement {
    const key = `${i}|${tintKey}`;
    const hit = this.cloudTint.get(key);
    if (hit) return hit;
    if (this.cloudTint.size > 200) this.cloudTint.forEach((_, k) => { if (!k.startsWith('proc-')) this.cloudTint.delete(k); });
    const c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    const x = c.getContext('2d')!;
    x.drawImage(s.img, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = `rgb(${tint.map(Math.round).join(',')})`;
    x.fillRect(0, 0, s.w, s.h);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(s.img, 0, 0);
    this.cloudTint.set(key, c);
    return c;
  }
}

/** 구름 그림이 없을 때 — 원 몇 개를 겹친 세 단 음영 덩어리 */
function proceduralCloud(seed: number): HTMLCanvasElement {
  const r = rng(seed * 97 + 13);
  const w = 40 + Math.floor(r() * 40);
  const h = Math.floor(w * 0.38);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const blobs = Array.from({ length: 7 }, () => [w * (0.15 + 0.7 * r()), h * (0.35 + 0.4 * r()), h * (0.28 + 0.3 * r())]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = 0;
    for (const [cx, cy, rr] of blobs) {
      if (Math.hypot(x - cx, (y - cy) * 1.3) < rr) best = Math.max(best, 1 + ((y - (cy - rr * 0.5)) / rr > 0.7 ? 0 : 1) + (y - cy < -rr * 0.35 ? 1 : 0));
    }
    if (y > h * 0.78) best = Math.min(best, 1);
    if (best) { g.fillStyle = ['', '#c9c3dc', '#e6e2f0', '#ffffff'][best]; g.fillRect(x, y, 1, 1); }
  }
  return c;
}
