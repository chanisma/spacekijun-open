/**
 * 도트 말풍선 — 방문자·층·낚시꾼이 누르면 띄운다. 캔버스는 저해상도라 글자를 쓰면 뭉개지므로 «작은 그림»만 담는다
 * (글은 HTML 한 줄이 맡는다).
 */
export type Emote = 'note' | 'heart' | 'wave' | 'spark' | 'zzz' | 'bell' | 'bubble' | 'book' | 'flame';

export const EMOTE_ART: Record<Emote, { rows: string[]; color: string }> = {
  note: { rows: ['..##.', '..#.#', '..#..', '###..', '###..'], color: '#3a4a9a' },
  heart: { rows: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], color: '#e0526a' },
  wave: { rows: ['#', '#', '#', '.', '#'], color: '#e08a2a' },
  spark: { rows: ['...#...', '..###..', '#######', '..###..', '...#...'], color: '#d4a020' },
  zzz: { rows: ['####', '..#.', '.#..', '####'], color: '#5a6ab0' },
  bell: { rows: ['..#..', '.###.', '.###.', '#####', '..#..'], color: '#c08a2a' },
  bubble: { rows: ['.##..', '#..#.', '.##.#', '...#.', '..#..'], color: '#3a8ac0' },
  book: { rows: ['##.##', '#.#.#', '#.#.#', '##.##'], color: '#8a4a2a' },
  flame: { rows: ['..#..', '.##..', '.###.', '#####', '.###.'], color: '#e0602a' },
};

export function drawBubble(g: CanvasRenderingContext2D, emote: Emote, cx: number, bottom: number, alpha: number) {
  const art = EMOTE_ART[emote];
  const w = art.rows[0].length;
  const h = art.rows.length;
  const bx = Math.round(cx - Math.ceil((w + 4) / 2));
  const by = Math.round(bottom - h - 6);
  g.globalAlpha = Math.max(0, Math.min(1, alpha));
  g.fillStyle = '#2a2040';
  g.fillRect(bx - 1, by, w + 6, h + 4);
  g.fillRect(bx, by - 1, w + 4, h + 6);
  g.fillStyle = '#fffaf0';
  g.fillRect(bx, by, w + 4, h + 4);
  g.fillRect(Math.round(cx) - 1, by + h + 4, 2, 2); // 말꼬리
  g.fillStyle = art.color;
  art.rows.forEach((row, y) => { for (let x = 0; x < w; x++) if (row[x] === '#') g.fillRect(bx + 2 + x, by + 2 + y, 1, 1); });
  g.globalAlpha = 1;
}
