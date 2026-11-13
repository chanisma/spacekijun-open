import * as XLSX from 'xlsx';

const FILE_TERM_PAT = /(\d{4})학년도|\((\d)학기\)|(\d)학기/;
const TEACHER_CELL_PAT = /^(.+?)\((.+?)\)\s*$/;
const SLOT_GRADE_SUBJECT_PAT = /^(\d)학년\s+(.+?)\((.+?)\)\s*$/;

export interface ParsedSlot {
  teacher_username: string;
  teacher_name: string;
  day_of_week: number; // 1-5 (월~금)
  period: number;      // 1-7
  grade: number;       // 1-3
  subject_name: string;
  class_label: string; // e.g. "3" or "3학년 1반"
  activity_type: string; // 'subject' | 'autonomy' | 'club' | 'volunteer' | 'career' | 'self_study' | 'other'
  raw: string;
}

export interface ParseTeacherTimetableResult {
  academicYear: number | null;
  semester: number | null;
  slots: ParsedSlot[];
  uniqueTeachers: { username: string; name: string }[];
  errors: string[];
}

const ACTIVITY_KEYWORDS: Array<[RegExp, string]> = [
  [/자율\s*[·•]?\s*자치|자율활동/, 'autonomy'],
  [/동아리/, 'club'],
  [/봉사/, 'volunteer'],
  [/진로/, 'career'],
  [/자습|자기주도/, 'self_study'],
  [/창의적\s*체험/, 'autonomy'],
];

function detectActivityType(subject: string): string {
  for (const [re, t] of ACTIVITY_KEYWORDS) {
    if (re.test(subject)) return t;
  }
  return 'subject';
}

function termFromFilename(filename: string): { academicYear: number | null; semester: number | null } {
  let academicYear: number | null = null;
  let semester: number | null = null;
  const ay = filename.match(/(\d{4})학년도/);
  if (ay) academicYear = parseInt(ay[1], 10);
  const sem = filename.match(/\((\d)학기\)|(\d)학기/);
  if (sem) semester = parseInt(sem[1] || sem[2], 10);
  return { academicYear, semester };
}

export async function parseTeacherTimetableXlsx(
  file: File
): Promise<ParseTeacherTimetableResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    return { academicYear: null, semester: null, slots: [], uniqueTeachers: [], errors: ['시트 없음'] };
  }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });

  const errors: string[] = [];
  const { academicYear, semester } = termFromFilename(file.name);

  // Header analysis: row index 2 (R3) carries 요일 in cols, row 3 (R4) carries 교시
  const dayHeader = aoa[2] ?? [];
  const periodHeader = aoa[3] ?? [];
  const DAY_MAP: Record<string, number> = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 7 };

  // For each column index, resolve (day, period). Day labels span 7 cols each.
  const colMeta = new Map<number, { day: number; period: number }>();
  let currentDay: number | null = null;
  for (let c = 0; c < Math.max(dayHeader.length, periodHeader.length); c++) {
    const dayCell = dayHeader[c];
    if (typeof dayCell === 'string' && DAY_MAP[dayCell.trim()]) {
      currentDay = DAY_MAP[dayCell.trim()];
    }
    const periodCell = periodHeader[c];
    if (currentDay != null && periodCell != null) {
      const p = typeof periodCell === 'number' ? periodCell : parseInt(String(periodCell), 10);
      if (!Number.isNaN(p) && p >= 1 && p <= 9) {
        colMeta.set(c, { day: currentDay, period: p });
      }
    }
  }

  const slots: ParsedSlot[] = [];
  const teacherMap = new Map<string, string>(); // username -> name

  // Data starts at R5 (index 4)
  for (let r = 4; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const teacherCell = row[1];
    if (typeof teacherCell !== 'string' || !teacherCell.trim()) continue;
    const tm = teacherCell.match(TEACHER_CELL_PAT);
    if (!tm) {
      errors.push(`R${r + 1}: 교사 셀 파싱 실패 — ${teacherCell}`);
      continue;
    }
    const teacherUsername = tm[1].trim();
    const teacherName = tm[2].trim();
    teacherMap.set(teacherUsername, teacherName);

    for (const [c, meta] of colMeta) {
      // Only weekdays
      if (meta.day < 1 || meta.day > 5) continue;
      const cell = row[c];
      if (cell == null) continue;
      const text = String(cell).trim();
      if (!text) continue;

      const m = text.match(SLOT_GRADE_SUBJECT_PAT);
      if (!m) {
        errors.push(`R${r + 1}C${c + 1}: 슬롯 파싱 실패 — ${text}`);
        continue;
      }
      const grade = parseInt(m[1], 10);
      const subject = m[2].trim();
      const classLabel = m[3].trim();

      slots.push({
        teacher_username: teacherUsername,
        teacher_name: teacherName,
        day_of_week: meta.day,
        period: meta.period,
        grade,
        subject_name: subject,
        class_label: classLabel,
        activity_type: detectActivityType(subject),
        raw: text,
      });
    }
  }

  return {
    academicYear,
    semester,
    slots,
    uniqueTeachers: Array.from(teacherMap, ([username, name]) => ({ username, name })),
    errors,
  };
}

// Convert (day, period) into resource.meta.section legacy time code format e.g. "26"
export function toTimeCode(day: number, period: number): string {
  return `${day}${period}`;
}

// Convert slots → resource.meta.section JSONB shape
// Key: "<subject> <grade>-<class_label>", value: { time: ["DP", ...] }
export function slotsToSectionMeta(slots: ParsedSlot[]): Record<string, { time: string[] }> {
  const out: Record<string, { time: string[] }> = {};
  for (const s of slots) {
    const key = `${s.subject_name} ${s.grade}-${s.class_label}`;
    if (!out[key]) out[key] = { time: [] };
    const code = toTimeCode(s.day_of_week, s.period);
    if (!out[key].time.includes(code)) out[key].time.push(code);
  }
  return out;
}
