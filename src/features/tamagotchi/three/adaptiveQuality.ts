/**
 * 느린 휴대폰에서 3D 를 가볍게(Phase 7 — 학생 공개 준비). three 를 import 하지 않는다(렌더러의 모양만 안다).
 *
 * 장면이 «계속 움직이는 동안»(돌리기·연출) 프레임 사이 간격을 모아, 중앙값이 문턱(28ms ≈ 36fps)을 넘으면
 * 화면 해상도(pixel ratio)를 0.75배씩 낮춘다(최대 세 번, 1 아래로는 안 내린다). 멈춰 있을 때는 재지 않는다 —
 * 이 장면들은 움직일 때만 그리므로(멈춘 동안의 간격은 «느림»이 아니다).
 * 올리지는 않는다 — 오르내리며 깜빡이는 것보다 한 번 낮춘 채가 낫다(다시 들어오면 처음부터 잰다).
 */
export interface PixelRatioTarget {
  getPixelRatio(): number;
  setPixelRatio(value: number): void;
}

export interface AdaptiveQualityOptions {
  /** 이 간격(ms)보다 느리면 낮춘다 */
  slowMs?: number;
  /** 몇 프레임을 모아 판정하나 */
  window?: number;
  /** 가장 낮은 pixel ratio */
  min?: number;
  /** 최대 몇 번 낮추나 */
  maxDrops?: number;
}

export function createAdaptiveQuality(renderer: PixelRatioTarget, onChange: () => void, opts: AdaptiveQualityOptions = {}) {
  const slowMs = opts.slowMs ?? 28;
  const size = opts.window ?? 30;
  const min = opts.min ?? 1;
  const maxDrops = opts.maxDrops ?? 3;
  const samples: number[] = [];
  let last = 0;
  let drops = 0;
  return {
    /** 그릴 때마다 — continuous 는 «다음 프레임도 이어서 그리는가» */
    frame(now: number, continuous: boolean) {
      if (!continuous) { last = 0; samples.length = 0; return; }
      if (last) samples.push(now - last);
      last = now;
      if (samples.length < size) return;
      const sorted = [...samples].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      samples.length = 0;
      const pr = renderer.getPixelRatio();
      if (median > slowMs && pr > min && drops < maxDrops) {
        renderer.setPixelRatio(Math.max(min, Math.round(pr * 0.75 * 100) / 100));
        drops += 1;
        onChange();
      }
    },
    get drops() { return drops; },
  };
}
