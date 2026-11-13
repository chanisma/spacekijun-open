/**
 * Database Grade Service - 데이터베이스 성적 조회 서비스
 * student_basic_info 테이블의 academic_development 데이터를 활용하여 성적 계산
 */

import { supabase } from '@/integrations/supabase/client';
import { subjectGroupToCategory } from '../utils/gradeMapping';

/**
 * academic_development 레코드 타입 (Section6Record 구조)
 */
export interface AcademicRecord {
  grade: number;           // 학년 (1/2/3)
  semester: number;        // 학기 (1/2)
  category: 'regular' | 'career' | 'pe_arts' | 'pe_arts_experiment' | 'general';
  subject_group: string;   // e.g., "국어", "수학", "영어"
  subject: string;         // e.g., "주제 탐구 독서"
  units: number;           // 이수단위
  rank: number | null;     // 등급 (regular only, 1-9)
  achievement: string;     // 성취도 (career: A/B/C)
  score: number | null;
  average: number | null;
  stdDev: number | null;
  students: number;
  distribution: unknown;
  content: string;
}

/**
 * rawRecords에 보관할 슬림 레코드 — distribution/content/average/stdDev/students/score 폐기.
 * 분석 다운스트림이 실제로 쓰는 필드만 유지 (페이로드/메모리 ~70% 절감).
 */
export type SlimAcademicRecord = Pick<
  AcademicRecord,
  'grade' | 'semester' | 'category' | 'subject_group' | 'subject' | 'units' | 'rank' | 'achievement'
>;

/**
 * 데이터베이스 성적 데이터 타입
 */
export interface DatabaseGradeData {
  studentCode: string;           // DB ID (e.g., "00-00261")
  originalStudentId?: string;    // JSON 파일의 원본 ID (e.g., "20107")
  overallGrade: number;          // 전과목 가중 평균 등급
  subjectGroupGrades: Record<string, number>;  // 과목군별 평균 등급
  rawRecords: SlimAcademicRecord[];  // 슬림 레코드 (사용하지 않는 필드 제거됨)
  totalUnits: number;            // 총 이수 단위
  subjectCount: number;          // 과목 수
}

/**
 * resource 테이블에서 학생 ID 매핑 정보 조회 (서버측 JSONB 필터)
 * JSON 파일의 학번(snum1/snum2/snum3)을 student_basic_info의 id(meta.id)로 변환.
 *
 * 학번만으로는 cohort 간 충돌 가능: 예를 들어 snum1="10224"는
 * 25학번 1학년(=장수아)에도, 24학번이 1학년이던 시절(=서지아)에도, 26학번에도
 * 모두 동일하게 들어 있어 .or() 결과가 여러 row가 된다. 따라서 (snum, name)을
 * 합성 키로 사용해 같은 이름인 row만 정답으로 채택한다.
 *
 * ID의 첫 자리(1/2/3)로 어느 snum 필드와 비교할지 결정:
 *   1xxxx → snum1, 2xxxx → snum2, 3xxxx → snum3
 * 이는 fetchRealIdMappings와 동일한 컨벤션이다.
 */
async function fetchStudentIdMappings(
  students: Array<{ id: string; name: string }>
): Promise<Map<string, string>> {
  const mappings = new Map<string, string>();
  if (students.length === 0) return mappings;

  // 중복 제거 + ID 첫 자리로 snum 필드 결정
  const uniqueStudents = new Map<string, { id: string; name: string; snumField: 'snum1' | 'snum2' | 'snum3' }>();
  for (const s of students) {
    const idStr = String(s.id);
    const firstDigit = idStr[0];
    if (!['1', '2', '3'].includes(firstDigit)) continue;
    const key = `${idStr}_${s.name}`;
    if (uniqueStudents.has(key)) continue;
    uniqueStudents.set(key, {
      id: idStr,
      name: s.name,
      snumField: `snum${firstDigit}` as 'snum1' | 'snum2' | 'snum3',
    });
  }
  if (uniqueStudents.size === 0) return mappings;

  const queries = Array.from(uniqueStudents.values());
  const ID_CHUNK = 80;
  const allRows: Array<{ name: string; meta: unknown }> = [];

  for (let i = 0; i < queries.length; i += ID_CHUNK) {
    const chunk = queries.slice(i, i + ID_CHUNK);
    // 각 학생마다 자신의 학번이 들어 있을 법한 snum 필드 하나만 비교
    const orFilter = chunk.map((q) => `meta->>${q.snumField}.eq.${q.id}`).join(',');

    const { data, error } = await supabase
      .from('resource')
      .select('name, meta')
      .eq('type', 'student')
      .or(orFilter);

    if (error) {
      console.error('Resource fetch error:', error);
      throw new Error(`리소스 조회 실패: ${error.message}`);
    }
    if (data) allRows.push(...data);
  }

  // (snum, name) → meta.id 인덱스. 이름을 키에 포함시켜 cohort 충돌 방지.
  const idx = new Map<string, string>();
  for (const row of allRows) {
    const meta = row.meta as {
      id?: string;
      snum1?: string;
      snum2?: string;
      snum3?: string;
    } | null;
    if (!meta?.id) continue;
    for (const field of ['snum1', 'snum2', 'snum3'] as const) {
      const snum = meta[field];
      if (snum) idx.set(`${snum}|${row.name}`, meta.id);
    }
  }

  for (const q of queries) {
    const dbId = idx.get(`${q.id}|${q.name}`);
    if (dbId) mappings.set(q.id, dbId);
  }

  return mappings;
}

/**
 * 학생 코드로 성적 데이터 조회 — Phase2: get_student_grade_summary RPC 사용.
 * academic_development 전체 JSONB를 받아오던 기존 방식 대비 ~95% 페이로드 절감.
 * rawRecords는 빈 배열로 반환되며, 모달 등에서 필요할 때 fetchRawAcademicRecords()로 lazy 조회.
 *
 * @param students {id, name}[] — 이름은 cohort 충돌(같은 snum이 여러 학번에 존재)을
 *   disambiguate 하는 데 사용됨. 학번만으로 매핑하면 다른 학생의 성적을 가져올 수 있음.
 * @param preknownMappings realID에서 가져온 사전 매핑 (jsonId → dbId), resource 테이블 조회 생략 가능
 */
export async function fetchGradesByStudentCodes(
  students: Array<{ id: string; name: string }>,
  preknownMappings?: Map<string, string>
): Promise<DatabaseGradeData[]> {
  if (students.length === 0) return [];

  // 1. 사전 매핑(realID)이 있으면 우선 사용
  const idMappings = new Map<string, string>(preknownMappings || []);

  // 2. 매핑되지 않은 학생만 resource 테이블에서 (snum, name) 키로 조회
  const unmapped = students.filter(s => !idMappings.has(String(s.id)));
  if (unmapped.length > 0) {
    const resourceMappings = await fetchStudentIdMappings(unmapped);
    resourceMappings.forEach((dbId, jsonId) => {
      idMappings.set(jsonId, dbId);
    });
  }

  if (idMappings.size === 0) {
    console.warn('No student ID mappings found');
    return [];
  }

  // 3. dbId → originalStudentId 역인덱스 (한 번만 빌드)
  const dbIdToOriginal = new Map<string, string>();
  idMappings.forEach((dbId, jsonId) => dbIdToOriginal.set(dbId, jsonId));

  const dbIds = Array.from(idMappings.values());
  const results: DatabaseGradeData[] = [];

  // 청크 단위로 RPC 호출 (PostgREST URL 제한 회피)
  const CHUNK = 200;
  for (let i = 0; i < dbIds.length; i += CHUNK) {
    const chunk = dbIds.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc('get_student_grade_summary', {
      p_student_ids: chunk,
    });
    if (error) {
      console.error('Database grade fetch error:', error);
      throw new Error(`성적 데이터 조회 실패: ${error.message}`);
    }
    if (!data) continue;

    type RpcRow = {
      student_code: string;
      overall_grade: number | string;
      subject_group_grades: Record<string, number> | null;
      total_units: number | string;
      subject_count: number;
    };
    for (const row of data as RpcRow[]) {
      results.push({
        studentCode: row.student_code,
        originalStudentId: dbIdToOriginal.get(row.student_code),
        overallGrade: Number(row.overall_grade) || 0,
        subjectGroupGrades: row.subject_group_grades ?? {},
        rawRecords: [], // lazy: fetchRawAcademicRecords()로 모달 열 때 가져옴
        totalUnits: Number(row.total_units) || 0,
        subjectCount: row.subject_count ?? 0,
      });
    }
  }

  return results;
}

/**
 * 모달 등 raw records가 필요한 화면에서 lazy 조회.
 * 학생 1명 단위로 호출하는 것이 일반적 (모달 1개 = 학생 1명).
 */
export async function fetchRawAcademicRecords(
  studentCode: string
): Promise<SlimAcademicRecord[]> {
  const { data, error } = await supabase
    .from('student_basic_info')
    .select('academic_development')
    .eq('id', studentCode)
    .maybeSingle();
  if (error) {
    console.warn('Failed to fetch raw academic records:', error.message);
    return [];
  }
  const records = (data?.academic_development as AcademicRecord[] | null) ?? [];
  // regular + rank 만 슬림하게 반환 (모달 소비자가 다시 같은 필터 적용)
  return records
    .filter(r => r.category === 'regular' && r.rank !== null && r.rank !== undefined)
    .map(r => ({
      grade: r.grade,
      semester: r.semester,
      category: r.category,
      subject_group: r.subject_group,
      subject: r.subject,
      units: r.units,
      rank: r.rank,
      achievement: r.achievement,
    }));
}

/**
 * @deprecated Phase2 이후 RPC가 동일 계산을 서버에서 수행. 호환을 위해 export 유지.
 * 학생 성적 데이터 처리 및 평균 계산 (클라이언트 fallback용).
 */
function processStudentGrades(studentCode: string, records: AcademicRecord[]): DatabaseGradeData {
  // regular 카테고리에서 rank가 있는 과목만 필터링
  const regularSubjects = records.filter(r =>
    r.category === 'regular' &&
    r.rank !== null &&
    r.rank !== undefined
  );

  // 전과목 가중 평균 계산
  const overallGrade = calculateWeightedAverage(regularSubjects);

  // 과목군별 평균 계산
  const subjectGroupGrades = calculateSubjectGroupGrades(regularSubjects);

  // 총 이수 단위
  const totalUnits = regularSubjects.reduce((sum, r) => sum + r.units, 0);

  // 슬림 레코드: 다운스트림(EstimatedGradeTab/StudentEstimatedGradeTab)이
  // regular + rank!==null만 사용하므로 그 부분만 보관. 페이로드 추가 절감.
  const slimRecords: SlimAcademicRecord[] = regularSubjects.map(r => ({
    grade: r.grade,
    semester: r.semester,
    category: r.category,
    subject_group: r.subject_group,
    subject: r.subject,
    units: r.units,
    rank: r.rank,
    achievement: r.achievement,
  }));

  return {
    studentCode,
    overallGrade,
    subjectGroupGrades,
    rawRecords: slimRecords,
    totalUnits,
    subjectCount: regularSubjects.length
  };
}

/**
 * 가중 평균 등급 계산
 * 공식: Sum(rank × units) / Sum(units)
 */
export function calculateWeightedAverage(records: AcademicRecord[]): number {
  // regular 카테고리, rank가 있는 과목만 필터링
  const validRecords = records.filter(r =>
    r.category === 'regular' &&
    r.rank !== null &&
    r.rank !== undefined
  );

  if (validRecords.length === 0) return 0;

  const totalWeightedScore = validRecords.reduce((sum, r) => sum + (r.rank! * r.units), 0);
  const totalUnits = validRecords.reduce((sum, r) => sum + r.units, 0);

  return totalUnits > 0 ? totalWeightedScore / totalUnits : 0;
}

/**
 * 과목군별 가중 평균 계산
 */
export function calculateSubjectGroupGrades(records: AcademicRecord[]): Record<string, number> {
  const groupGrades: Record<string, number> = {};

  // regular 카테고리, rank가 있는 과목만 필터링
  const validRecords = records.filter(r =>
    r.category === 'regular' &&
    r.rank !== null &&
    r.rank !== undefined
  );

  // subject_group을 course-analyze 카테고리로 그룹화
  const groups = validRecords.reduce((acc, record) => {
    const category = subjectGroupToCategory(record.subject_group);
    if (!acc[category]) acc[category] = [];
    acc[category].push(record);
    return acc;
  }, {} as Record<string, AcademicRecord[]>);

  // 각 그룹별 가중 평균 계산
  Object.entries(groups).forEach(([category, categoryRecords]) => {
    const totalWeightedScore = categoryRecords.reduce((sum, r) => sum + (r.rank! * r.units), 0);
    const totalUnits = categoryRecords.reduce((sum, r) => sum + r.units, 0);
    groupGrades[category] = totalUnits > 0 ? totalWeightedScore / totalUnits : 0;
  });

  return groupGrades;
}

/**
 * resource 테이블에서 학생의 realID(meta.id) 매핑 조회 (서버측 JSONB 필터)
 * JSON 파일의 학생ID와 이름으로 검색하여 resource.meta.id를 반환.
 * 학생ID 첫 자리로 snum 필드 결정: 1→snum1, 2→snum2, 3→snum3.
 * 전체 resource 스캔 대신 .or()로 후보 행만 가져와 이름 매칭.
 */
export async function fetchRealIdMappings(
  students: { id: string | number; name: string }[]
): Promise<Map<string, string>> {
  const mappings = new Map<string, string>();
  if (students.length === 0) return mappings;

  // 중복 제거 (같은 ID+이름은 한 번만 처리)
  const uniqueStudents = new Map<string, { id: string; name: string; snumField: 'snum1' | 'snum2' | 'snum3' }>();
  for (const s of students) {
    const idStr = String(s.id);
    const firstDigit = idStr[0];
    if (!['1', '2', '3'].includes(firstDigit)) continue;
    const key = `${idStr}_${s.name}`;
    if (uniqueStudents.has(key)) continue;
    uniqueStudents.set(key, {
      id: idStr,
      name: s.name,
      snumField: `snum${firstDigit}` as 'snum1' | 'snum2' | 'snum3',
    });
  }
  if (uniqueStudents.size === 0) return mappings;

  const queries = Array.from(uniqueStudents.values());
  const ID_CHUNK = 80; // 학번당 .or() 절 1개라서 fetchStudentIdMappings보다 더 큰 chunk 가능
  const allRows: Array<{ name: string; meta: unknown }> = [];

  for (let i = 0; i < queries.length; i += ID_CHUNK) {
    const chunk = queries.slice(i, i + ID_CHUNK);
    const orFilter = chunk.map((q) => `meta->>${q.snumField}.eq.${q.id}`).join(',');
    const { data, error } = await supabase
      .from('resource')
      .select('name, meta')
      .eq('type', 'student')
      .or(orFilter);
    if (error) {
      console.error('Failed to fetch resource data for realID mapping:', error);
      return mappings;
    }
    if (data) allRows.push(...data);
  }

  // (snum, name) → meta.id 인덱스
  const idx = new Map<string, string>();
  for (const row of allRows) {
    const meta = row.meta as {
      id?: string;
      snum1?: string;
      snum2?: string;
      snum3?: string;
    } | null;
    if (!meta?.id) continue;
    for (const field of ['snum1', 'snum2', 'snum3'] as const) {
      const snum = meta[field];
      if (snum) idx.set(`${snum}|${row.name}`, meta.id);
    }
  }

  for (const q of queries) {
    const dbId = idx.get(`${q.id}|${q.name}`);
    if (dbId) mappings.set(q.id, dbId);
  }

  return mappings;
}

/**
 * 학생 코드 형식 변환 (data.json ID → student_basic_info ID)
 * data.json의 학생 ID (예: 10101, 10102)를 DB 형식 (예: 00-00448)으로 변환
 */
export function convertToStudentCode(studentId: string | number, yearPrefix: string = '25'): string {
  const idStr = String(studentId);

  // 이미 형식이 맞는 경우 (XX-XXXXX)
  if (idStr.includes('-') && idStr.length >= 7) {
    return idStr;
  }

  // 5자리 숫자인 경우 (10101 형식)
  if (/^\d{5}$/.test(idStr)) {
    return `${yearPrefix}-${idStr}`;
  }

  // 그 외의 경우 원본 반환
  return idStr;
}

/**
 * 학생 코드에서 학년 추출
 */
export function extractGradeFromStudentCode(studentCode: string): number | null {
  // 형식: 00-00448 (25년 입학, 1학년 01반 01번)
  // 또는: 10101 (1학년 01반 01번)

  let digits = studentCode;

  if (studentCode.includes('-')) {
    digits = studentCode.split('-')[1];
  }

  if (digits && digits.length >= 5) {
    const gradeDigit = parseInt(digits[0], 10);
    if (gradeDigit >= 1 && gradeDigit <= 3) {
      return gradeDigit;
    }
  }

  return null;
}

/**
 * 과목군별 통계 계산
 */
export function calculateGroupStatistics(grades: DatabaseGradeData[]): Record<string, {
  avgGrade: number;
  count: number;
  minGrade: number;
  maxGrade: number;
}> {
  const groupStats: Record<string, { grades: number[]; count: number }> = {};

  grades.forEach(student => {
    Object.entries(student.subjectGroupGrades).forEach(([category, grade]) => {
      if (!groupStats[category]) {
        groupStats[category] = { grades: [], count: 0 };
      }
      if (grade > 0) {
        groupStats[category].grades.push(grade);
        groupStats[category].count++;
      }
    });
  });

  const result: Record<string, {
    avgGrade: number;
    count: number;
    minGrade: number;
    maxGrade: number;
  }> = {};

  Object.entries(groupStats).forEach(([category, stats]) => {
    if (stats.grades.length > 0) {
      result[category] = {
        avgGrade: stats.grades.reduce((a, b) => a + b, 0) / stats.grades.length,
        count: stats.count,
        minGrade: Math.min(...stats.grades),
        maxGrade: Math.max(...stats.grades)
      };
    }
  });

  return result;
}
