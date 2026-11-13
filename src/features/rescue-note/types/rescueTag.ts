export interface RescueTagDefinition {
  key: string;
  label: string;
  color: string;
  sortOrder: number;
  active: boolean;
  description?: string | null;
}

export interface RescueTag {
  id: string;
  studentCode: string;
  tagKey: string;
  assignedBy: string;
  assignedAt: string;
  note?: string | null;
}
