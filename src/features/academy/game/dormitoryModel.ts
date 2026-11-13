import { workshopReference } from './workshopModel';
import type { DormState } from './dormitoryService';
export { seoulDay, offsetDay, validPlanTimes } from '../../planner/plannerModel';
const supported = new Set(['ria-rose', 'luon-blue', 'luon-classic', 'dorm-rose', 'dorm-stars']);
export function equipment(state?: DormState) {
  const result = { ...workshopReference };
  for (const owned of state?.items ?? []) {
    const item = state?.catalog.find(item => item.id === owned.item_id);
    if (owned.is_equipped && item?.academy_slot && itemSupported(item.academy_asset)) {
      if (item.academy_asset?.startsWith('workshop:')) { if (item.asset_url) result[item.academy_slot] = item.asset_url; }
      else result[item.academy_slot] = item.academy_asset!;
    }
  }
  return result;
}
export function itemSupported(asset: string | null) { return !!asset && (supported.has(asset) || /^workshop:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(asset)); }
