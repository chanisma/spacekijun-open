// ========================================
// Student Timetable Excel Parser
// Parses Excel files with student timetable data
// and matches students to resource records
// ========================================

import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { withoutPersonalPhone } from '@/utils/resourceMetaPrivacy';

// ── Types ──

export interface TimetableRow {
  grade: number;
  classNum: number;
  number: number;
  name: string;
  dayOfWeek: number;  // 1=월 ~ 5=금
  period: number;
  subject: string;
  teacher: string;
}

export interface StudentTimetableData {
  day_of_week: number;
  period: number;
  subject: string;
  teacher_name: string;
}

export interface MatchResult {
  grade: number;
  classNum: number;
  number: number;
  name: string;
  resourceId: string | null;
  resourceName: string | null;
  nameMatch: boolean;
  entries: StudentTimetableData[];
  status: 'matched' | 'not_found' | 'name_mismatch';
}

export interface ParseResult {
  totalRows: number;
  students: MatchResult[];
  matched: number;
  notFound: number;
  nameMismatch: number;
  errors: string[];
}

// ── Day conversion ──

const DAY_MAP: Record<string, number> = {
  '월': 1, '화': 2, '수': 3, '목': 4, '금': 5,
  '월요일': 1, '화요일': 2, '수요일': 3, '목요일': 4, '금요일': 5,
  'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
};

function parseDayOfWeek(value: any): number | null {
  if (typeof value === 'number') {
    return value >= 1 && value <= 5 ? value : null;
  }
  const str = String(value).trim();
  return DAY_MAP[str] ?? null;
}

// ── Column header detection ──

const HEADER_PATTERNS: Record<string, RegExp> = {
  grade: /^(학년|grade)$/i,
  classNum: /^(반|학급|class)$/i,
  number: /^(번호|번|number|no)$/i,
  name: /^(성명|이름|name|학생명)$/i,
  day: /^(요일|day|dayofweek)$/i,
  period: /^(교시|시간|period)$/i,
  subject: /^(과목|과목명|subject)$/i,
  teacher: /^(교사|담당교사|teacher|교사명)$/i,
};

function detectColumns(headers: string[]): Record<string, number> | null {
  const mapping: Record<string, number> = {};

  for (let i = 0; i < headers.length; i++) {
    const header = String(headers[i]).trim();
    for (const [key, pattern] of Object.entries(HEADER_PATTERNS)) {
      if (pattern.test(header) && !(key in mapping)) {
        mapping[key] = i;
      }
    }
  }

  const required = ['grade', 'classNum', 'number', 'name', 'day', 'period', 'subject', 'teacher'];
  const missing = required.filter(k => !(k in mapping));

  if (missing.length > 0) return null;
  return mapping;
}

// ── Excel Parsing ──

export async function parseStudentTimetableExcel(file: File): Promise<TimetableRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  if (rawData.length < 2) {
    throw new Error('데이터가 부족합니다. 헤더와 최소 1개의 데이터 행이 필요합니다.');
  }

  // Detect column mapping from header row
  const headers = rawData[0] as string[];
  const colMap = detectColumns(headers);

  if (!colMap) {
    throw new Error(
      '필수 열을 찾을 수 없습니다. 엑셀 파일에 학년, 반, 번호, 성명, 요일, 교시, 과목, 교사 열이 필요합니다.'
    );
  }

  const rows: TimetableRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i] as any[];
    if (!row || row.length === 0) continue;

    const grade = Number(row[colMap.grade]);
    const classNum = Number(row[colMap.classNum]);
    const number = Number(row[colMap.number]);
    const name = String(row[colMap.name] || '').trim();
    const dayOfWeek = parseDayOfWeek(row[colMap.day]);
    const period = Number(row[colMap.period]);
    const subject = String(row[colMap.subject] || '').trim();
    const teacher = String(row[colMap.teacher] || '').trim();

    if (!grade || !classNum || !number || !name) continue; // skip empty rows
    if (!dayOfWeek) {
      errors.push(`${i + 1}행: 요일 "${row[colMap.day]}" 인식 불가`);
      continue;
    }
    if (!period || period < 1 || period > 10) {
      errors.push(`${i + 1}행: 교시 "${row[colMap.period]}" 범위 오류`);
      continue;
    }

    rows.push({ grade, classNum, number, name, dayOfWeek, period, subject, teacher });
  }

  return rows;
}

// ── Student Matching ──

export async function matchStudentsAndBuild(rows: TimetableRow[]): Promise<ParseResult> {
  const errors: string[] = [];

  // Group rows by student (grade + class + number)
  const studentMap = new Map<string, { info: { grade: number; classNum: number; number: number; name: string }; entries: StudentTimetableData[] }>();

  for (const row of rows) {
    const key = `${row.grade}-${row.classNum}-${row.number}`;
    if (!studentMap.has(key)) {
      studentMap.set(key, {
        info: { grade: row.grade, classNum: row.classNum, number: row.number, name: row.name },
        entries: [],
      });
    }
    studentMap.get(key)!.entries.push({
      day_of_week: row.dayOfWeek,
      period: row.period,
      subject: row.subject,
      teacher_name: row.teacher,
    });
  }

  // Fetch all student resources
  const { data: resources, error } = await supabase
    .from('resource')
    .select('id, name, meta')
    .eq('type', 'student');

  if (error) throw new Error(`리소스 조회 실패: ${error.message}`);

  // Build lookup: "grade-class-number" → resource
  const resourceLookup = new Map<string, { id: string; name: string }>();
  for (const res of (resources || [])) {
    const meta = res.meta as any;
    if (meta?.grade && meta?.class && meta?.number) {
      const key = `${meta.grade}-${meta.class}-${meta.number}`;
      resourceLookup.set(key, { id: res.id, name: res.name });
    }
  }

  // Match
  const results: MatchResult[] = [];
  let matched = 0, notFound = 0, nameMismatch = 0;

  for (const [key, data] of studentMap) {
    const resource = resourceLookup.get(key);

    if (!resource) {
      results.push({
        ...data.info,
        resourceId: null,
        resourceName: null,
        nameMatch: false,
        entries: data.entries,
        status: 'not_found',
      });
      notFound++;
    } else {
      const nameMatch = resource.name === data.info.name;
      results.push({
        ...data.info,
        resourceId: resource.id,
        resourceName: resource.name,
        nameMatch,
        entries: data.entries,
        status: nameMatch ? 'matched' : 'name_mismatch',
      });
      if (nameMatch) matched++;
      else nameMismatch++;
    }
  }

  // Sort by grade, class, number
  results.sort((a, b) => {
    if (a.grade !== b.grade) return a.grade - b.grade;
    if (a.classNum !== b.classNum) return a.classNum - b.classNum;
    return a.number - b.number;
  });

  return {
    totalRows: rows.length,
    students: results,
    matched,
    notFound,
    nameMismatch,
    errors,
  };
}

// ── Save to Database ──

export interface SaveOptions {
  academicYear?: number;
  semester?: number;
  /**
   * `resource.meta.timetable` 을 함께 갱신할지 (legacy 소비자용 dual-write).
   *
   * meta 는 학기 필드가 없는 단일 스냅샷이라 "현행 학기"만 담을 수 있다. 과거/미래
   * 학기를 업로드할 때 갱신하면 현행 학기 스냅샷이 파괴되므로, 업로드 학기가 학사력과
   * 같을 때만 true 로 넘긴다(호출자가 판단). 기본값 true = 구 동작.
   */
  syncResourceMeta?: boolean;
}

export async function saveStudentTimetables(
  students: MatchResult[],
  includeNameMismatch: boolean,
  onProgress?: (current: number, total: number) => void,
  options?: SaveOptions
): Promise<{
  saved: number;
  skipped: number;
  tableRows: number;
  errors: string[];
  /** 기존 시간표 삭제까지는 됐지만 재적재에 실패해 **현재 비어 있는** 학생 이름 */
  wiped: string[];
}> {
  const errors: string[] = [];
  const wiped: string[] = [];
  let saved = 0;
  let skipped = 0;
  let tableRows = 0;

  const academicYear = options?.academicYear ?? new Date().getFullYear();
  const semester = options?.semester ?? 1;
  const syncResourceMeta = options?.syncResourceMeta ?? true;

  const toSave = students.filter(s =>
    s.status === 'matched' || (includeNameMismatch && s.status === 'name_mismatch')
  );

  // 자동 매칭용 lookup 한 번만 가져오기
  const [curriculumRes, teacherRes] = await Promise.all([
    supabase
      .from('school_curriculum')
      .select('id, grade, subject')
      .eq('academic_year', academicYear)
      .eq('semester', semester),
    supabase
      .from('resource')
      .select('id, name')
      .eq('type', 'teacher'),
  ]);
  const curriculumMap = new Map<string, string>();
  for (const c of curriculumRes.data ?? []) {
    curriculumMap.set(`${c.grade}|${c.subject}`, c.id);
  }
  const teacherMap = new Map<string, string>();
  for (const t of teacherRes.data ?? []) {
    if (t.name) teacherMap.set(t.name.trim(), t.id);
  }

  for (let i = 0; i < toSave.length; i++) {
    const student = toSave[i];
    onProgress?.(i + 1, toSave.length);

    if (!student.resourceId) {
      skipped++;
      continue;
    }

    try {
      // 1. resource.meta 갱신 (legacy 소비자용 dual-write)
      //    학생 시간표 화면·수업 명단은 2026-07-28 부터 student_timetable 을 읽는다.
      //    meta 는 학기 개념이 없어 현행 학기 업로드일 때만 갱신한다.
      if (syncResourceMeta) {
        const { data: existing, error: fetchError } = await supabase
          .from('resource')
          .select('meta')
          .eq('id', student.resourceId)
          .single();

        if (fetchError) {
          errors.push(`${student.name}: 조회 실패 - ${fetchError.message}`);
          skipped++;
          continue;
        }

        const currentMeta = withoutPersonalPhone(
          existing?.meta as Record<string, unknown> | null
        );
        const updatedMeta = { ...currentMeta, timetable: student.entries };

        const { error: updateError } = await supabase
          .from('resource')
          .update({ meta: updatedMeta })
          .eq('id', student.resourceId);

        if (updateError) {
          errors.push(`${student.name}: meta 저장 실패 - ${updateError.message}`);
          skipped++;
          continue;
        }
      }

      // 2. student_timetable 테이블 — 기존 (학년도, 학기, 학생) 행 삭제 후 재INSERT
      //
      // ⚠ 이 구간은 "지우고 다시 넣기"라 중간에 실패하면 학생 시간표가 **빈 채로 남는다**.
      // 그래서 ①삭제 오류를 반드시 확인하고(실패 시 기존 데이터가 그대로이므로 안전하게 중단)
      // ②삽입이 성공했을 때만 saved++ 한다. 종전엔 삭제 결과를 검사하지 않고 saved++ 가
      // if/else 밖에 있어, 시간표가 비어버린 학생이 "저장 완료"로 집계됐다.
      const { error: deleteError } = await supabase
        .from('student_timetable')
        .delete()
        .eq('academic_year', academicYear)
        .eq('semester', semester)
        .eq('resource_id', student.resourceId);

      if (deleteError) {
        errors.push(`${student.name}: 기존 시간표 삭제 실패 - ${deleteError.message}`);
        skipped++;
        continue;
      }

      const ttRows = student.entries.map((e) => ({
        academic_year: academicYear,
        semester,
        resource_id: student.resourceId!,
        student_grade: student.grade,
        student_class: student.classNum,
        student_no: student.number,
        student_name: student.name,
        day_of_week: e.day_of_week,
        period: e.period,
        subject: e.subject,
        teacher_name: e.teacher_name || null,
        curriculum_id: curriculumMap.get(`${student.grade}|${e.subject}`) ?? null,
        teacher_resource_id: e.teacher_name ? teacherMap.get(e.teacher_name.trim()) ?? null : null,
        meta: { source: `xlsx_admin_${academicYear}_${semester}` },
      }));

      if (ttRows.length > 0) {
        const { error: ttError } = await supabase.from('student_timetable').insert(ttRows);
        if (ttError) {
          // 삭제는 이미 끝났다 → 이 학생의 시간표는 지금 **비어 있다**.
          // '스킵'(아무 일도 없었음)과 뜻이 다르므로 따로 세어 화면이 정확히 말하게 한다.
          errors.push(`${student.name}: 시간표 테이블 저장 실패 - ${ttError.message}`);
          wiped.push(student.name);
          continue;
        }
        tableRows += ttRows.length;
      }

      saved++;
    } catch (err: any) {
      errors.push(`${student.name}: ${err.message}`);
      skipped++;
    }
  }

  // student_timetable_flat MV 갱신 (수업 학생 명단이 이 MV 를 읽는다)
  if (saved > 0) {
    try {
      await supabase.rpc('refresh_student_timetable_flat' as any);
    } catch (err) {
      console.warn('student_timetable_flat MV 갱신 실패:', err);
    }
  }

  return { saved, skipped, tableRows, errors, wiped };
}
