export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: T[]): T[];
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b1;
  function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    int(maxExclusive: number): number {
      return Math.floor(next() * maxExclusive);
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },
    shuffle<T>(arr: T[]): T[] {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
