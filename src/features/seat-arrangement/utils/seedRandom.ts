// Seedable PRNG — mulberry32
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const seededShuffle = <T>(items: readonly T[], rand: () => number): T[] => {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const pickOne = <T>(items: readonly T[], rand: () => number): T | undefined => {
  if (items.length === 0) return undefined;
  return items[Math.floor(rand() * items.length)];
};

export const newSeed = (): number =>
  (Date.now() ^ Math.floor(Math.random() * 1_000_000)) >>> 0;
