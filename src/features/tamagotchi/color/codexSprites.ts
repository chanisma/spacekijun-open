/**
 * codex 가 그린 캐릭터 그림(2026-10-07 시험) — `public/images/tamagotchi/codex/<단계>-<자세>.png`.
 *
 * 만드는 법: `scripts/tamagotchi-codex/generate.sh`(codex CLI 이미지 생성, 참조 = 절차적 도트 한 장 보기) →
 * `process.py`(마젠타 배경 지우기 · 격자 맞추기 · 칸 가운데 찍기 = 진짜 저해상도 스프라이트).
 *
 * 화면은 이 그림이 다 받아지면 쓰고, 못 받았거나 빠진 자세는 절차적 도트(`characters.ts`)로 그린다 — 깨진 그림을 보이지 않는다.
 * 아픈 모습은 따로 그리지 않고 몸빛(보라·파랑 색조)만 초록으로 돌린다(분홍 볼·금빛 별은 그대로).
 */
import { PixelBuf } from './pixel';
import type { Stage } from '../model/petModel';
import type { Pose } from './characters';
import type { Branch, BranchOrBasic } from '../model/branch';
import { bumpCustomVersion } from '../model/catalog';
import type { Species, SpeciesForm } from '../model/species';

const BASE = '/images/tamagotchi/codex';
const POSES = ['idle', 'happy', 'eat', 'sleep', 'no'] as const;
const FILES: Record<Stage, readonly string[]> = {
  egg: ['egg-whole', 'egg-crack'],
  baby: POSES.map((p) => `baby-${p}`),
  child: POSES.map((p) => `child-${p}`),
  teen: POSES.map((p) => `teen-${p}`),
  adult: POSES.map((p) => `adult-${p}`),
};

/** 진화 가지(Phase 3) — 가지마다 따로 받는다. 한 가지가 빠지면 그 가지만 기본 어른 그림으로 */
const BRANCHES: Branch[] = ['planner', 'thinker', 'focus', 'heart'];
const branchReady = new Set<Branch>();

const sprites = new Map<string, PixelBuf>();
const sickCache = new Map<string, PixelBuf>();
let loading: Promise<boolean> | null = null;
let ready = false;

function decode(url: string): Promise<PixelBuf> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const buf = new PixelBuf(c.width, c.height);
      buf.data.set(g.getImageData(0, 0, c.width, c.height).data);
      resolve(buf);
    };
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });
}

/** 한 번만 받는다. 하나라도 빠지면 false — 그때는 절차적 도트만 쓴다(단계마다 그림체가 섞이지 않게). */
export function loadCodexSprites(): Promise<boolean> {
  if (loading) return loading;
  if (typeof document === 'undefined') return Promise.resolve(false);
  const names = Object.values(FILES).flat();
  loading = Promise.all(names.map(async (name) => [name, await decode(`${BASE}/${name}.png`)] as const))
    .then((pairs) => {
      pairs.forEach(([name, buf]) => sprites.set(name, buf));
      ready = true;
      // 가지 그림은 따로 — 기본 그림이 다 있어야 의미가 있다
      BRANCHES.forEach((branch) => {
        Promise.all(POSES.map(async (p) => [`adult-${branch}-${p}`, await decode(`${BASE}/adult-${branch}-${p}.png`)] as const))
          .then((ps) => { ps.forEach(([n, b]) => sprites.set(n, b)); branchReady.add(branch); })
          .catch(() => undefined);
      });
      return true;
    })
    .catch(() => false);
  return loading;
}

export const codexSpritesReady = () => ready;

function fileFor(stage: Stage, pose: Pose): string {
  if (stage === 'egg') return pose === 'no' ? 'egg-crack' : 'egg-whole';
  const p = pose === 'idle0' || pose === 'idle1' ? 'idle' : pose;
  return `${stage}-${p}`;
}

function toSick(src: PixelBuf): PixelBuf {
  const out = new PixelBuf(src.w, src.h);
  out.data.set(src.data);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const delta = max - min;
    if (delta < 0.08) continue;
    const s = delta / (1 - Math.abs(2 * l - 1));
    let h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
    // 보라·파랑 몸빛만(분홍 볼 · 금빛 별 · 어두운 테두리는 그대로)
    if (h < 200 || h > 285 || l < 0.25) continue;
    const nh = 105, ns = s * 0.55;
    const c = (1 - Math.abs(2 * l - 1)) * ns;
    const x = c * (1 - Math.abs(((nh / 60) % 2) - 1));
    const m = l - c / 2;
    const [rr, gg, bb] = nh < 120 ? [x, c, 0] : [0, c, x];
    d[i] = Math.round((rr + m) * 255);
    d[i + 1] = Math.round((gg + m) * 255);
    d[i + 2] = Math.round((bb + m) * 255);
  }
  return out;
}

/** 가지 그림의 아픈 모습 — 몸빛 색조가 가지마다 달라(초록·분홍) 색조 돌리기 대신 연두빛을 덮는다(테두리·금빛은 그대로) */
function toSickWash(src: PixelBuf): PixelBuf {
  const out = new PixelBuf(src.w, src.h);
  out.data.set(src.data);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const l = (Math.max(d[i], d[i + 1], d[i + 2]) + Math.min(d[i], d[i + 1], d[i + 2])) / 510;
    const gold = d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 120;
    if (l < 0.25 || gold) continue;
    d[i] = Math.round(d[i] * 0.6 + 185 * 0.4);
    d[i + 1] = Math.round(d[i + 1] * 0.6 + 214 * 0.4);
    d[i + 2] = Math.round(d[i + 2] * 0.6 + 164 * 0.4);
  }
  return out;
}

/** 받아 둔 그림이 있으면 그것을, 없으면 null(호출하는 쪽이 절차적 도트로 그린다) */
export function codexSprite(stage: Stage, pose: Pose, sick: boolean, branch?: BranchOrBasic): PixelBuf | null {
  if (!ready) return null;
  const branched = stage === 'adult' && branch && branch !== 'basic' && branchReady.has(branch);
  const key = branched ? fileFor(stage, pose).replace('adult-', `adult-${branch}-`) : fileFor(stage, pose);
  const base = sprites.get(key);
  if (!base) return null;
  if (!sick || stage === 'egg') return base;
  let s = sickCache.get(key);
  if (!s) { s = branched ? toSickWash(base) : toSick(base); sickCache.set(key, s); }
  return s;
}

// ── 새 종(2026-10-26) — `<BASE>/<종>/<단계>-<자세>.png`, 특수 어른은 `adult-<모습>-<자세>.png` ─────────────
// 종마다 처음 그 종이 필요할 때 받는다(학생 대부분은 별 가족만 본다). 다 받으면 판 번호를 올려 한 번 그리고 마는 그림(펫 집·순위)이 다시 그린다.
// 못 받았거나 아직이면 null — 그리는 쪽이 별 가족 그림으로 대신한다(깨진 그림을 보이지 않는다).
const SPECIES_FORMS: Partial<Record<Exclude<Species, 'star'>, SpeciesForm[]>> = { signal: ['courier'] };
const speciesState = new Map<string, 'loading' | 'ready' | 'failed'>();

export function speciesFiles(species: Exclude<Species, 'star'>): string[] {
  const base = Object.values(FILES).flat();
  const forms = (SPECIES_FORMS[species] ?? []).flatMap((f) => POSES.map((p) => `adult-${f}-${p}`));
  return [...base, ...forms];
}

export function loadSpeciesSprites(species: Exclude<Species, 'star'>): void {
  if (speciesState.has(species) || typeof document === 'undefined') return;
  speciesState.set(species, 'loading');
  Promise.all(speciesFiles(species).map(async (name) => [name, await decode(`${BASE}/${species}/${name}.png`)] as const))
    .then((pairs) => {
      pairs.forEach(([name, buf]) => sprites.set(`${species}/${name}`, buf));
      speciesState.set(species, 'ready');
      bumpCustomVersion();
    })
    .catch(() => speciesState.set(species, 'failed'));
}

/** 새 종의 그림 — 아직 없으면 받기를 시작하고 null */
export function speciesSprite(species: Exclude<Species, 'star'>, form: SpeciesForm, stage: Stage, pose: Pose, sick: boolean): PixelBuf | null {
  if (speciesState.get(species) !== 'ready') { loadSpeciesSprites(species); return null; }
  const file = fileFor(stage, pose);
  const key = `${species}/${stage === 'adult' && form !== 'basic' ? file.replace('adult-', `adult-${form}-`) : file}`;
  const base = sprites.get(key);
  if (!base) return null;
  if (!sick || stage === 'egg') return base;
  let s = sickCache.get(key);
  if (!s) { s = toSickWash(base); sickCache.set(key, s); }
  return s;
}
