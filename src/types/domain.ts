// Core domain types for SIS (School Information Sharing) system
// Based on the ontology: Resource → Section → Meeting architecture

export type ResourceType = 'teacher' | 'student' | 'room' | 'device' | 'group' | 'staff' | 'inactive';
export type MeetingKind = 'class' | 'schedule' | 'duty' | 'training' | 'event' | 'document_submission' | 'personal';
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type AllocationRole = 'owner' | 'host' | 'attendee' | 'room' | 'device';
export type SectionMemberRole = 'teacher' | 'student' | 'assistant';

// Core Resource entity - teachers, students, rooms, equipment, groups
export interface Resource {
  id: string;
  type: ResourceType;
  name: string;
  meta: {
    section?: string[];
    grade?: string;
    class?: string;
    email?: string;
    homeroom?: string;
  } | null;
  created_at: string;
  updated_at: string;
}

// Section - persistent course units during semester/period
export interface Section {
  id: string;
  name: string;
  subject: string | null;
  grade: number | null;
  is_combined: boolean | null;
  meta: {
    grade?: string;
    class?: string;
    weekday_time?: string;
  } | null;
  created_at: string;
  updated_at: string;
}

// Section membership - connects resources to sections with roles
export interface SectionMember {
  section_id: string;
  resource_id: string;
  role: SectionMemberRole;
  created_at: string;
}

// Timetable pattern - recurring schedule template
export interface TimetablePattern {
  id: string;
  section_id: string | null;
  weekday: number; // 0-6 (Monday-Sunday)
  period: number; // 1-9 typical class periods
  room_id: string | null;
  week_span: number[] | null; // which weeks this pattern applies
  created_at: string;
  updated_at: string;
}

// Meeting - individual events at specific times/places
export interface Meeting {
  id: string;
  kind: MeetingKind;
  section_id: string | null;
  starts_at: string;
  ends_at: string;
  status: MeetingStatus | null;
  meta: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

// Meeting allocation - assigns resources to meetings with roles
export interface MeetingAllocation {
  meeting_id: string;
  resource_id: string;
  role: AllocationRole;
  required: boolean | null;
  created_at: string;
}

// User profile with school-specific fields
export interface Profile {
  id: string;
  email: string;
  nickname: string | null;
  name: string | null;
  role: string | null;
  signature: string | null;
  stamp: string | null;
  is_first_login: boolean;
  last_login: string | null;
  visit_count: number; // Logged in count
  created_at: string;
  updated_at: string;
  resource_id: string | null; // Primary resource ID from user_resource table
}

// Document with metadata
export interface Document {
  id: string;
  title: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  upload_status: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// Document sharing permissions
export interface DocumentShare {
  id: string;
  document_id: string;
  shared_with_user_id: string | null;
  shared_with_section_id: string | null;
  permission_level: string;
  created_by: string;
  expires_at: string | null;
  created_at: string;
}

// Message thread for communication
export interface MessageThread {
  id: string;
  title: string;
  is_group_chat: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Message thread participant
export interface MessageParticipant {
  id: string;
  thread_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  role: string | null;
  profile?: Profile;
}

// Individual message
export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  attachment_url: string | null;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
}

// Notification system
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  related_problem_id: string | null;
  related_solution_id: string | null;
  related_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// System settings for admin
export interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: Record<string, any>;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Conflict detection result
export interface ConflictResult {
  hasConflict: boolean;
  conflicts: {
    resource_id: string;
    resource_name: string;
    conflicting_meeting_id: string;
    conflict_type: 'time_overlap' | 'double_booking' | 'capacity_exceeded';
    severity: 'warning' | 'error';
  }[];
}


// Weekly schedule view data
export interface WeeklySchedule {
  week_start: string;
  week_end: string;
  periods: {
    period: number;
    start_time: string;
    end_time: string;
  }[];
  days: {
    date: string;
    weekday: number;
    slots: {
      period: number;
      meeting: Meeting | null;
      section: Section | null;
      room: Resource | null;
      conflicts: ConflictResult[];
    }[];
  }[];
}

// Document submission types
export type DocumentSubmissionStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'late';

export interface DocumentSubmission {
  id: string;
  meeting_id: string;
  resource_id: string;
  submission_status: DocumentSubmissionStatus;
  submitted_at: string | null;
  file_attachments: {
    filename: string;
    path: string;
    size: number;
    type: string;
    uploaded_at: string;
  }[] | null;
  submission_notes: string | null;
  feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentSubmissionMeetingMeta {
  title: string;
  description?: string;
  scope?: string;
  required_files?: {
    type: string;
    name: string;
    required: boolean;
  }[];
  related_links?: string[];
  submission_deadline?: string;
}

export interface DocumentSubmissionStats {
  total_participants: number;
  submitted_count: number;
  pending_count: number;
  late_count: number;
  submission_rate: number;
}


// Dashboard summary data
export interface DashboardSummary {
  current_meeting: {
    meeting: Meeting;
    section: Section | null;
    room: Resource | null;
  } | null;
  next_meeting: {
    meeting: Meeting;
    section: Section | null;
    room: Resource | null;
  } | null;
  today_duties: Meeting[];
  pending_signatures: Document[];
  unread_messages_count: number;
  this_week_schedule: {
    date: string;
    events: {
      time: string;
      title: string;
      type: MeetingKind;
    }[];
  }[];
}
