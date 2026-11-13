import * as XLSX from 'xlsx';
import type { Database } from '@/integrations/supabase/types';

export type CourseOfferingInsert = Database['public']['Tables']['course_offering']['Insert'];

const FILE_TERM_PAT = /(\d{4})학년도\s*(\d)학기/;
const SUBJECT_CREDITS_PAT = /^(.+?)(?:\((\d+)\))?\s*$/;
const GRADE_PAT = /(\d)학년/;
const CLASSROOM_PAT = /^([^(]+?)\s*\(\s*(\d학년)?\s*(\d+반)\s*\)\s*$/;
const TEACHER_PAT = /^(.+?)\s*\(([^)]+)\)\s*$/;

export interface ParsedOfferingReport {
  academicYear: number;
  semester: number;
  rows: CourseOfferingInsert[];
}

export interface ParseError {
  filename: string;
  message: string;
}

export interface ParseResult {
  reports: ParsedOfferingReport[];
  errors: ParseError[];
}

const parseSubject = (raw: string): { subject: string; credits: number | null } => {
  const m = raw.trim().match(SUBJECT_CREDITS_PAT);
  if (!m) return { subject: raw, credits: null };
  return {
    subject: m[1].trim(),
    credits: m[2] ? parseInt(m[2], 10) : null,
  };
};

const parseGrade = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  const m = raw.match(GRADE_PAT);
  return m ? parseInt(m[1], 10) : null;
};

const parseClassroom = (raw: string | null | undefined): { room_no: string | null; class_label: string | null; classroom: string | null } => {
  if (!raw) return { room_no: null, class_label: null, classroom: null };
  const trimmed = String(raw).trim();
  const m = trimmed.match(CLASSROOM_PAT);
  if (!m) {
    return { room_no: null, class_label: null, classroom: trimmed };
  }
  return {
    room_no: m[1].trim(),
    class_label: m[3].trim(),
    classroom: trimmed,
  };
};

const parseTeacher = (raw: string | null | undefined): { teacher_name: string; teacher_username: string | null; original: string } => {
  const trimmed = String(raw ?? '').trim();
  const m = trimmed.match(TEACHER_PAT);
  if (!m) return { teacher_name: trimmed, teacher_username: null, original: trimmed };
  return {
    teacher_name: m[1].trim(),
    teacher_username: m[2].trim(),
    original: trimmed,
  };
};

export function parseOfferingFile(filename: string, buffer: ArrayBuffer): ParsedOfferingReport | null {
  const m = filename.match(FILE_TERM_PAT);
  if (!m) return null;
  const academicYear = parseInt(m[1], 10);
  const semester = parseInt(m[2], 10);

  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return null;
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });

  const rows: CourseOfferingInsert[] = [];
  let isHeader = true;

  for (const r of aoa) {
    if (!r || r.length < 4) continue;
    const subjectRaw = r[0];
    const gradeRaw = r[1];
    const classroomRaw = r[2];
    const teacherRaw = r[3];

    if (subjectRaw == null) continue;
    const subjectStr = String(subjectRaw).trim();
    if (!subjectStr) continue;

    if (isHeader && subjectStr.includes('개설과목명')) {
      isHeader = false;
      continue;
    }
    isHeader = false;

    const { subject, credits } = parseSubject(subjectStr);
    const grade = parseGrade(gradeRaw == null ? null : String(gradeRaw));
    const cls = parseClassroom(classroomRaw == null ? null : String(classroomRaw));
    const t = parseTeacher(teacherRaw == null ? null : String(teacherRaw));

    const admissionYear = grade != null ? academicYear - grade + 1 : null;

    rows.push({
      academic_year: academicYear,
      semester,
      admission_year: admissionYear,
      subject_name: subject,
      credits,
      grade,
      class_label: cls.class_label,
      room_no: cls.room_no,
      classroom: cls.classroom,
      teacher_name: t.teacher_name,
      meta: {
        teacher_username: t.teacher_username,
        teacher_original: t.original,
        source: `xlsx_offering_${academicYear}`,
      },
    });
  }

  return { academicYear, semester, rows };
}

export async function parseOfferingFiles(files: File[]): Promise<ParseResult> {
  const reports: ParsedOfferingReport[] = [];
  const errors: ParseError[] = [];
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      const parsed = parseOfferingFile(f.name, buf);
      if (!parsed) {
        errors.push({ filename: f.name, message: '파일명에 (NNNN학년도 N학기) 패턴이 없음' });
        continue;
      }
      if (parsed.rows.length === 0) {
        errors.push({ filename: f.name, message: '추출된 행이 0건' });
        continue;
      }
      reports.push(parsed);
    } catch (e) {
      errors.push({ filename: f.name, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { reports, errors };
}
