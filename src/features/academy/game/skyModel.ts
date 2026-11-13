import type { DormGoal, SkyPlan } from './dormitoryService';
export const SKY_WIDTH = 1600, SKY_HEIGHT = 900, SKY_LINK_LIMIT = 12;
export const starBrightness = (count: number) => count > 0 ? 1 + Math.log2(count) : 0;
export const constellationRadius = (plans: number) => Math.min(210, 100 + Math.sqrt(plans) * 18);
export const clampUnit = (n: number) => Math.max(0, Math.min(1, n));
export function insideCircle(x: number, y: number) { return Number.isFinite(x) && Number.isFinite(y) && (x - .5) ** 2 + (y - .5) ** 2 <= .25; }
export function constellationCenter(goal: DormGoal, index: number) {
  return { x: (goal.sky_x ?? (.16 + (index % 4) * .22)) * SKY_WIDTH, y: (goal.sky_y ?? (.25 + (Math.floor(index / 4) % 2) * .5)) * SKY_HEIGHT };
}
export function starPosition(plan: SkyPlan, index: number, count: number, radius: number) {
  const angle = index / Math.max(count, 1) * Math.PI * 2;
  return { x: (plan.sky_x ?? (.5 + Math.cos(angle) * .3)) * radius * 2, y: (plan.sky_y ?? (.5 + Math.sin(angle) * .3)) * radius * 2 };
}
export function addSkyLine(lines: [string, string][], a: string, b: string): [string, string][] {
  if (a === b || lines.some(([x,y]) => (x === a && y === b) || (x === b && y === a))) return lines;
  if (new Set([...lines.flat(), a, b]).size > SKY_LINK_LIMIT) throw Error('한 별자리에서 잇는 별은 열두 개까지예요.');
  return [...lines, [a, b]];
}
