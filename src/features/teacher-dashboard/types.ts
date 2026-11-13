import type { NotificationEvent } from '@/hooks/useNotifications';
import type { MyTasksResponse } from '@/types/tasks';

export interface TeacherDashboardProps {
  myTasksData: MyTasksResponse | null | undefined;
  currentResourceId: string | undefined;
  loadingTasks: boolean;
  notifications: NotificationEvent[];
  loadingNotifications: boolean;
}

export type SeatAttendanceStatus = 'attended' | 'excused' | 'supplement' | null;

export interface SeatReservationReadRow {
  room_id: string;
  is_attended: boolean;
  attendance_status: SeatAttendanceStatus;
}

export interface StudyRoomReadRow {
  id: string;
  name: string;
}

export interface SeatRoomOverview {
  roomId: string;
  roomName: string;
  reservations: number;
  completed: number;
  attended: number;
  excused: number;
  supplement: number;
  pending: number;
  completionRate: number;
}

export interface SeatReservationOverview {
  date: string;
  reservations: number;
  completed: number;
  attended: number;
  excused: number;
  supplement: number;
  pending: number;
  completionRate: number;
  rooms: SeatRoomOverview[];
}

export interface HomeroomScope {
  grade: number;
  classNum: number;
  label: string;
}

export interface HomeroomStudentReadRow {
  studentCode: string;
  profileId: string | null;
  name: string;
  grade: number;
  classNum: number;
  number: number | null;
}

export type HomeroomCareStatus = 'open' | 'monitoring';

export interface HomeroomBirthdayReadRow {
  student_code: string;
  birthday: string | null;
}

export interface HomeroomCareStatusReadRow {
  student_code: string;
  status: HomeroomCareStatus;
}

export interface HomeroomCourseRoundReadRow {
  id: string;
  title: string | null;
  target_grade: number | null;
}

export interface HomeroomCourseSubmissionReadRow {
  round_id: string;
  student_code: string;
  status: string;
}

export interface HomeroomStudentSignalReadResult {
  birthdays: HomeroomBirthdayReadRow[];
  careStatuses: HomeroomCareStatusReadRow[];
  activeCourseRounds: HomeroomCourseRoundReadRow[];
  courseSubmissions: HomeroomCourseSubmissionReadRow[];
  wishlistStudentCodes: string[];
  birthdayDataAvailable: boolean;
  careDataAvailable: boolean;
  courseSelectionDataAvailable: boolean;
  admissionDataAvailable: boolean;
}

export interface HomeroomCourseSelectionSignal {
  roundId: string;
  title: string;
  status: string | null;
  completed: boolean;
}

export interface HomeroomSeatReservationReadRow {
  student_id: string;
  reservation_date: string;
  is_attended: boolean;
  attendance_status: SeatAttendanceStatus;
}

export interface HomeroomStudentOverviewRow extends HomeroomStudentReadRow {
  reservations: number;
  attended: number;
  excused: number;
  supplement: number;
  completed: number;
  pending: number;
  upcoming: number;
  elapsed: number;
  completionRate: number;
  birthdayDaysUntil: number | null;
  careStatus: HomeroomCareStatus | null;
  courseSelections: HomeroomCourseSelectionSignal[];
  admissionWishlistApplicable: boolean;
  hasAdmissionWishlist: boolean | null;
  hasProcedure: boolean;
  procedureNeedsAttention: boolean;
  needsAttention: boolean;
}

export interface HomeroomStudentOverview {
  monthStart: string;
  today: string;
  identityDataAvailable: boolean;
  seatDataAvailable: boolean;
  birthdayDataAvailable: boolean;
  careDataAvailable: boolean;
  courseSelectionDataAvailable: boolean;
  admissionDataAvailable: boolean;
  students: HomeroomStudentOverviewRow[];
  studentCount: number;
  participatingStudents: number;
  unlinkedStudents: number;
  birthdayStudentsThisWeek: number;
  careStudents: number;
  procedureStudents: number;
  procedureCompletedStudents: number;
  attentionStudents: number;
  activeCourseRoundCount: number;
  reservations: number;
  attended: number;
  excused: number;
  supplement: number;
  completed: number;
  pending: number;
  upcoming: number;
}
