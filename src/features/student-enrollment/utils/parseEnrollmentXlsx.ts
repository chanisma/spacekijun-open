import * as XLSX from 'xlsx';
import type { Database } from '@/integrations/supabase/types';

export type EnrollmentInsert = Database['public']['Tables']['student_enrollment']['Insert'];

const FILE_TERM_PAT = /(\d{4})학년도\s*(\d)학기/;
const SUBJECT_CREDITS_PAT = /^(.+?)(?:\((\d+)\))?\s*$/;
const CLASS_LABEL_PAT = /(\d+)반/;

export interface ParsedEnrollmentReport {
  academicYear: number;
  semester: number;
  rows: EnrollmentInsert[];
}

export interface ParseError {
  filename: string;
  message: string;
}

export interface ParseResult {
  reports: ParsedEnrollmentReport[];
  errors: ParseError[];
}

const toIntOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const parseSubject = (raw: string): { subject: string; credits: number | null } => {
  const m = raw.trim().match(SUBJECT_CREDITS_PAT);
  if (!m) return { subject: raw, credits: null };
  return {
    subject: m[1].trim(),
    credits: m[2] ? parseInt(m[2], 10) : null,
  };
};

const parseStudentClass = (raw: string | null | undefined): { class_label: string | null; class_no: number | null } => {
  if (!raw) return { class_label: null, class_no: null };
  const trimmed = String(raw).trim();
  const m = trimmed.match(CLASS_LABEL_PAT);
  return {
    class_label: trimmed || null,
    class_no: m ? parseInt(m[1], 10) : null,
  };
};

const parseStudentGrade = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  const m = String(raw).match(/(\d)학년/);
  return m ? parseInt(m[1], 10) : null;
};

export function parseEnrollmentFile(filename: string, buffer: ArrayBuffer): ParsedEnrollmentReport | null {
  const m = filename.match(FILE_TERM_PAT);
  if (!m) return null;
  const fileAcademicYear = parseInt(m[1], 10);
  const fileSemester = parseInt(m[2], 10);

  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return null;
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });

  const rows: EnrollmentInsert[] = [];

  for (const r of aoa) {
    if (!r || r.length < 10) continue;
    // 컬럼 (0-indexed): 학년도, 학기, 학년(과목), 편제명, 개설과목(학점), 개설강의실, 계열/학년/학과, 반, 번호, 성명
    const ay = toIntOrNull(r[0]);
    const sem = toIntOrNull(r[1]);
    if (ay == null || sem == null) continue; // 헤더 행 스킵

    const academicGrade = toIntOrNull(r[2]);
    const subjectRaw = r[4] != null ? String(r[4]).trim() : '';
    if (!subjectRaw || subjectRaw === '개설과목(학점)') continue;
    const { subject, credits } = parseSubject(subjectRaw);

    const classroom = r[5] != null ? String(r[5]).trim() : null;
    const studentGrade = parseStudentGrade(r[6] == null ? null : String(r[6]));
    const cls = parseStudentClass(r[7] == null ? null : String(r[7]));
    const studentNo = toIntOrNull(r[8]);
    const studentName = r[9] != null ? String(r[9]).trim() : '';
    if (!studentName) continue;

    const admissionYear = studentGrade != null ? ay - studentGrade + 1 : null;

    rows.push({
      academic_year: ay,
      semester: sem,
      subject_name: subject,
      credits,
      classroom,
      academic_grade: academicGrade,
      admission_year: admissionYear,
      student_grade: studentGrade,
      student_class: cls.class_label,
      student_no: studentNo,
      student_name: studentName,
      meta: { source: `xlsx_enrollment_${fileAcademicYear}_${fileSemester}` },
    });
  }

  return { academicYear: fileAcademicYear, semester: fileSemester, rows };
}

export async function parseEnrollmentFiles(files: File[]): Promise<ParseResult> {
  const reports: ParsedEnrollmentReport[] = [];
  const errors: ParseError[] = [];
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      const parsed = parseEnrollmentFile(f.name, buf);
      if (!parsed) {
        errors.push({ filename: f.name, message: '파일명에 (NNNN학년도 N학기) 패턴 없음' });
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
