
export interface GradeHistory {
  grade: string | number;
  class: string | number;
  number: string | number;
  teacher: string;
}

export interface HeaderInfo {
  documentTitle?: string;
  schoolName?: string;
  studentName?: string;
  studentClass?: string;
  studentNumber?: string;
  gradeInfo?: GradeHistory[];
}

export interface Section1PersonalInfo {
  name: string;
  residentNo?: string;
  address?: string;
  admissionYear?: string;
  [key: string]: any;
}

export interface Section2Record {
  grade?: string | number;
  type?: string;
  days?: number;
  schoolDays?: number | null;
  date?: string;
  note?: string;
  [key: string]: any;
}

export interface Section5Record {
  grade?: string | number;
  area?: string;
  hours?: string | number;
  content?: string;
  special?: string;
  [key: string]: any;
}

export interface VolunteerRecord {
  grade?: string | number;
  date?: string;
  place?: string;
  content?: string;
  hours?: string | number;
  totalHours?: string | number;
  [key: string]: any;
}

export interface Section6Record {
  grade: number;
  semester: number;
  category: 'regular' | 'career' | 'pe_arts' | 'pe_arts_experiment' | 'general';
  subject_group: string;
  subject: string;
  units: number;
  score: number | null;
  average: number | null;
  stdDev: number | null;
  achievement: string;
  students: number;
  rank: number | null;
  distribution: any;
  content: string;
  remarks?: string;
}

export type AcademicRecord = Section6Record;

export interface ReadingRecord {
  grade: number;
  semester: number;
  related: string; // 과목 또는 영역
  content: string; // 독서활동 상황
}

export interface Section8Record {
  grade?: string | number;
  content?: string;
  [key: string]: any;
}

export interface PdfSections {
  header: HeaderInfo;
  section1_personal_info: Section1PersonalInfo;
  section2_attendance?: Section2Record[];
  section5_creative_activities?: Section5Record[];
  volunteer_activities?: VolunteerRecord[];
  section6_academic_development?: Section6Record[];
  reading_activities?: ReadingRecord[]; // Added
  section8_behavior_characteristics?: Section8Record[];
  [key: string]: any;
}

export type WeirdSection2 = Section2Record;
