import type { RescueVisibility } from '../constants';

export interface RescueNote {
  id: string;
  studentCode: string;
  noteNo: string | null;
  title: string;
  occurredAt: string;
  endAt: string | null;
  content: string;
  remarks: string | null;
  visibility: RescueVisibility;
  coStudentCodes: string[];
  linkedNoteId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  meta: Record<string, unknown>;
}

export interface RescueNoteInput {
  studentCode: string;
  coStudentCodes: string[];
  occurredAt: string;
  endAt?: string | null;
  title: string;
  remarks?: string | null;
  content: string;
  visibility: RescueVisibility;
  meta?: Record<string, unknown>;
}

export interface RescueNoteWithAuthor extends RescueNote {
  authorName?: string;
  authorRescueRole?: string | null;
}
