import * as XLSX from 'xlsx';
import type { CurriculumInsert } from '../hooks/useCurriculum';

const FILENAME_PAT = /\((\d)학기\s*(\d)학년\)/;

const inferSubjectType = (grading: string | null | undefined): string | null => {
  if (!grading) return null;
  const g = grading.replace(/\s/g, '');
  if (g.includes('이수/미이수')) return '교양';
  if (g.includes('석차등급(5등급)')) return '공통/일반(2022)';
  if (g.includes('석차등급(9등급)')) return '일반선택(2015)';
  if (g.includes('성취도(3단계)')) return '진로/융합선택';
  return null;
};

const normalizeArea = (s: string | null): string | null => {
  if (!s) return null;
  return s.replace(/∙/g, '·').replace(/・/g, '·').trim();
};

const normalizeCategory = (s: string | null): string | null => {
  if (!s) return null;
  let v = s.trim();
  v = v.replace(/\([^)]*\)/g, '').trim();
  v = v.replace(/∙/g, '·').replace(/・/g, '·');
  return v;
};

export interface ParsedReport {
  academicYear: number;
  grade: number;
  semester: number;
  rows: CurriculumInsert[];
}

export interface ParseError {
  filename: string;
  message: string;
}

export interface ParseResult {
  reports: ParsedReport[];
  errors: ParseError[];
}

const toIntOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

export function parseReportFile(filename: string, buffer: ArrayBuffer, academicYear: number): ParsedReport | null {
  const m = FILENAME_PAT.exec(filename);
  if (!m) return null;
  const semester = parseInt(m[1], 10);
  const grade = parseInt(m[2], 10);
  const admissionYear = academicYear - grade + 1;

  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return null;
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });

  const rows: CurriculumInsert[] = [];
  let currentArea: string | null = null;
  let currentCategory: string | null = null;
  let inCreative = false;
  let inNormal = false;

  for (const r of aoa) {
    if (!r || r.length < 8) continue;
    const colB = r[1] != null ? String(r[1]).trim() : '';
    const colE = r[4] != null ? String(r[4]).trim() : '';
    const colF = r[5];
    const colG = r[6];
    const colH = r[7] != null ? String(r[7]).trim() : null;

    const dots = colB.length - colB.replace(/^\.+/, '').length;
    const label = colB.replace(/^\.+/, '').trim();

    if (dots === 2) {
      if (label.includes('창의적체험활동')) {
        inCreative = true; inNormal = false;
      } else if (label.includes('보통교과')) {
        inCreative = false; inNormal = true;
      } else {
        inCreative = false; inNormal = false;
      }
      continue;
    }

    if (!inNormal || inCreative) continue;

    if (dots === 3) {
      if (colE) {
        currentCategory = normalizeCategory(label);
      } else {
        currentArea = normalizeArea(label);
        currentCategory = null;
      }
    } else if (dots === 4) {
      currentCategory = normalizeCategory(label);
    }

    if (!colE) continue;
    const credits = toIntOrNull(colG);
    if (credits === null) continue;
    const hours = toIntOrNull(colF);

    rows.push({
      academic_year: academicYear,
      grade,
      semester,
      area: currentArea,
      category: currentCategory ?? '',
      subject: colE,
      hours,
      credits,
      grading_type: colH,
      subject_type: inferSubjectType(colH),
      curriculum_revision: admissionYear >= 2025 ? '2022' : '2015',
      meta: { source: `xlsx_admin_${academicYear}` },
    });
  }

  return { academicYear, grade, semester, rows };
}

export async function parseReportFiles(files: File[], academicYear: number): Promise<ParseResult> {
  const reports: ParsedReport[] = [];
  const errors: ParseError[] = [];

  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      const parsed = parseReportFile(f.name, buf, academicYear);
      if (!parsed) {
        errors.push({ filename: f.name, message: '파일명에서 (N학기 N학년) 패턴을 찾지 못함' });
        continue;
      }
      if (parsed.rows.length === 0) {
        errors.push({ filename: f.name, message: '추출된 과목이 0건. 보통교과 섹션이 없거나 양식이 다름' });
        continue;
      }
      reports.push(parsed);
    } catch (e) {
      errors.push({ filename: f.name, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return { reports, errors };
}
