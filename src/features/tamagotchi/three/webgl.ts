/** WebGL 을 쓸 수 있는가 — 못 쓰면 2D 기기로 내려간다. three.js 없이 판정한다(가벼운 파일에 둔다). */
export function canUseWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
