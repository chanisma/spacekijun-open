// 자습실 통계 — seaton_stats_* RPC 응답 모양.
// 판정 규칙(출석·결석·대기·출석률·온도)은 전부 서버(seaton_private)에 있다.
// 이 파일과 화면은 받은 값을 그리기만 한다 — 여기서 다시 계산하지 말 것.

export interface StatsFilters {
  start: string; // YYYY-MM-DD
  end: string;
  grade: number | null;
  room: string | null;
  includeFuture: boolean;
}

export interface StatsRange {
  start: string;
  end: string;
  today: string;
  past_closing?: boolean;
}

export interface Counts {
  total: number;
  attended: number;
  absent: number;
  rate: number | null;
}

export type AttendanceStatus = 'attended' | 'excused' | 'supplement' | 'absent' | 'pending';

export interface SummaryResult {
  range: StatsRange;
  cards: Counts & { pending: number; students: number; rooms: number };
  status: Record<AttendanceStatus, number>;
  by_grade: Array<Counts & { grade: number | null; students: number }>;
  monthly: Array<Counts & { month: string; grades: Record<string, Counts> }>;
  weekly: Array<Counts & { week_start: string; grades: Record<string, Counts> }>;
  rooms: Array<Counts & {
    room_id: string;
    name: string;
    room_grade: number | null;
    room_grades: number[] | null;
    pending: number;
    students: number;
  }>;
}

/** [room_id, name, is_morning] */
export type StatsRoom = [string, string | null, boolean];
/** [period_id, status, checker_name, room_idx] */
export type DayEntry = [number, AttendanceStatus, string | null, number];

export interface StudentRow extends Counts {
  id: string;
  name: string | null;
  grade: number | null;
  class: number | null;
  number: number | null;
  sid: string | null;
  pending: number;
  temp: number;
  /** "1".."5" (월~금) → room idx 목록 */
  wr: Record<string, number[]>;
  att: Record<string, DayEntry[]>;
}

export interface StudentsResult {
  range: StatsRange;
  rooms: StatsRoom[];
  students: StudentRow[];
}

export interface WeekdayPerson {
  id: string;
  name: string | null;
  grade: number | null;
  class: number | null;
  number: number | null;
}

export interface WeekdayResult {
  range: StatsRange;
  crosstab: Array<{
    room_id: string;
    name: string;
    /** isodow "1"(월) … "7"(일) */
    by_day: Record<string, number>;
    total: number;
    weekday_total: number;
    unique_students: number;
  }>;
  /** "1".."5" → 열람실별 신청 학생 */
  applicants: Record<string, Array<{ room_id: string; name: string; students: WeekdayPerson[] }>>;
}

export interface TemperatureRule {
  base: number;
  attend: number;
  absent: number;
  feedback: number;
}

export interface TemperatureResult {
  rule: TemperatureRule;
  today: string;
  month: string;
  cumulative: Array<WeekdayPerson & { rank: number; temperature: number; month_change: number }>;
  monthly: Array<WeekdayPerson & { rank: number; change: number; attended_days: number }>;
}

export interface StudyRoomOption {
  id: string;
  name: string;
}
