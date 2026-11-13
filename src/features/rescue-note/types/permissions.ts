import type { RescueRole } from '../constants';

export interface RescueAccess {
  canSeeMenu: boolean;
  isHomeroom: boolean;
  homeroomClass: { grade: number; classNumber: number } | null;
  rescueRole: RescueRole | null;
  isAdmin: boolean;
  visibleClasses: Array<{ grade: number; classNumber: number }>;
  canAccessDashboard: boolean;
  canManageTagDefinitions: boolean;
}
