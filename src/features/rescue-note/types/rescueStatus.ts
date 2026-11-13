import type { RescueStatus } from '../constants';

export interface RescueStudentStatus {
  studentCode: string;
  status: RescueStatus;
  updatedBy: string;
  updatedAt: string;
  reason?: string | null;
}

export interface RescueStatusHistoryEntry {
  id: string;
  studentCode: string;
  fromStatus: RescueStatus | null;
  toStatus: RescueStatus;
  changedBy: string;
  changedAt: string;
  reason?: string | null;
}
