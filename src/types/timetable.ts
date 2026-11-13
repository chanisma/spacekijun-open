/**
 * Type definitions for timetable-related entities
 */

export interface TeacherMeta {
  class?: string | string[];
  email?: string;
  grade?: number;
  class_number?: number;
}

export interface SectionMeta {
  weekday_time?: string | string[];
  room_name?: string;
  notes?: string;
}

export interface MeetingMeta {
  title?: string;
  teacher?: string;
  room_name?: string;
  notes?: string;
  location?: string;
}

export interface Resource {
  id: string;
  name: string;
  type: 'teacher' | 'room' | 'equipment';
  meta?: TeacherMeta | Record<string, unknown>;
}

export interface Section {
  id: string;
  name: string;
  subject: string;
  grade: number;
  is_combined: boolean;
  meta?: SectionMeta;
}

export interface SectionMember {
  resource_id: string;
  role: 'teacher' | 'student';
  resource?: Resource;
}

export interface Meeting {
  id: string;
  kind: string;
  starts_at: string;
  ends_at?: string;
  status: string;
  meta?: MeetingMeta;
  section_id?: string;
  section?: Section;
}

export interface MeetingAllocation {
  resource_id: string;
  role: string;
}

/**
 * Availability status for schedule conflicts
 */
export type AvailabilityStatus = 'available' | 'conflict' | 'combined';

/**
 * Change request types
 */
export type ChangeType = 'exchange' | 'substitute';

/**
 * Extended timetable entry with improved typing
 */
export interface TimetableEntry {
  id: string;
  period: number;
  weekday: number;
  subject?: string;
  section_name?: string;
  room_name?: string;
  teacher_name?: string;
  grade?: number;
  class_number?: string;
  week_span?: number[];
  type: 'pattern' | 'meeting';
  starts_at?: string;
  ends_at?: string;
  meeting_kind?: string;
  status?: string;
  is_combined?: boolean;
  resource_id?: string;
  section_id?: string;
  weekday_time?: string;
}

/**
 * Change candidate with proper typing
 */
export interface ChangeCandidate {
  id: string;
  period: number;
  weekday: number;
  teacher_name?: string;
  teacher_id?: string;
  section_name?: string;
  subject?: string;
  grade?: number;
  class_number?: string;
  conflicts: number;
  reason: string;
  availability?: AvailabilityStatus;
}

/**
 * Change request data structure
 */
export interface ChangeRequestData {
  type: ChangeType;
  title: string;
  description: string;
  requested_by: string;
  request_data: {
    original_entry: TimetableEntry;
    proposed_change: ChangeCandidate;
    change_type: ChangeType;
    target_teacher_id?: string;
    target_teacher_name?: string;
  };
  status: 'pending' | 'approved' | 'rejected';
}

/**
 * Timetable view configuration
 */
export interface TimetableViewConfig {
  viewType: 'teacher';
  resourceId?: string;
  currentWeek: Date;
}

/**
 * Type guards for runtime type checking
 */
export const isTeacherMeta = (meta: unknown): meta is TeacherMeta => {
  return typeof meta === 'object' && meta !== null;
};

export const isSectionMeta = (meta: unknown): meta is SectionMeta => {
  return typeof meta === 'object' && meta !== null;
};

export const isMeetingMeta = (meta: unknown): meta is MeetingMeta => {
  return typeof meta === 'object' && meta !== null;
};

export const isValidTimetableEntry = (entry: unknown): entry is TimetableEntry => {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof (entry as TimetableEntry).id === 'string' &&
    typeof (entry as TimetableEntry).period === 'number' &&
    typeof (entry as TimetableEntry).weekday === 'number' &&
    ['pattern', 'meeting'].includes((entry as TimetableEntry).type)
  );
};
