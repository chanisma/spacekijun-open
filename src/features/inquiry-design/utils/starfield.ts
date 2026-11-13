// Generate `count` random "Xpx Ypx #FFF" box-shadow stops inside a square of
// `range`px on each side. Mirrors the SCSS multiple-box-shadow($n) trick from
// the original parallax-pixel-stars CodePen.
//
// Used by both InquiryDesignPage and InquiryGraphCanvas to render shared
// parallax-star backgrounds. Each call returns a fresh random pattern, so
// callers should memoize per-mount to avoid recomputing on every render.
export function buildStarShadows(count: number, range: number): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    parts.push(
      `${Math.floor(Math.random() * range)}px ${Math.floor(Math.random() * range)}px #FFF`
    );
  }
  return parts.join(', ');
}
