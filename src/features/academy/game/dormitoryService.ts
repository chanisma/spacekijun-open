import type { WorkshopSlot } from './workshopModel';
import { fetchPlanner } from '@/features/planner/plannerService';
export { writePlanner as writeDormitory } from '@/features/planner/plannerService';
import { signWorkshopImages } from './workshopService';
import type { PlannerTask as DormTask, PlannerGoal as DormGoal, PlannerPlan as SkyPlan } from '@/features/planner/types';
export type { PlannerTask as DormTask, PlannerGoal as DormGoal, PlannerPlan as SkyPlan } from '@/features/planner/types';
export interface SkyRegion { region: number; name: string | null; revision: number }
export interface DormItem { id: number; name: string; description: string | null; price: number; academy_slot: WorkshopSlot | null; academy_asset: string | null; is_active: boolean; image_url?: string | null; asset_url?: string; is_commissioner?: boolean }
export interface DormState { tasks: DormTask[]; goals: DormGoal[]; plans?: SkyPlan[]; sky_regions?: SkyRegion[]; items: { id: string; item_id: number; is_equipped: boolean }[]; catalog: DormItem[]; coins: number; rewarded_today: boolean }
export async function fetchDormitory(date: string, studentCode: string | null = null) {
  const data = await fetchPlanner(date, studentCode);
  const custom = data.catalog.filter(i => i.academy_asset?.startsWith('workshop:') && i.image_url);
  if (!custom.length) return data;
  const signed = await signWorkshopImages(custom.map(i => i.image_url!));
  return { ...data, catalog: data.catalog.map(i => ({ ...i, asset_url: i.image_url ? signed.get(i.image_url) : undefined })) };
}
