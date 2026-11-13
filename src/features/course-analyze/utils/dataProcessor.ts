/**
 * Data Processor - 학생 데이터 처리 유틸리티
 * Converted from course_analyze/src/dataProcessor.js
 *
 * 이 모듈은 순수 함수로 구성되어 React 훅에서 사용됩니다.
 */

import type {
  Student,
  UnifiedDataFormat,
  SubjectConfiguration,
  SubjectEnrollment,
  SubjectEnrollmentData,
  ScienceHierarchyViolation,
  StudentViolation,
  MaxCapacitySubjects,
  CacheInfo,
  SubjectCount
} from '../types/course.types';
import { filterSubjectsByConfiguration, SCIENCE_HIERARCHY, getCategoryDisplayOrder } from './subjectUtils';

// ============================================================================
// Data Parsing Functions
// ============================================================================

/**
 * 통합 JSON 데이터를 파싱하여 학생 배열로 변환합니다.
 */
export function parseUnifiedData(
  unifiedData: UnifiedDataFormat
): {
  students: Student[];
  gradeRoundGroups: Record<string, Student[]>;
  subjectConfiguration: SubjectConfiguration | null;
} {
  const { studentData, subjectConfiguration } = unifiedData;

  // 첫 번째 행은 헤더
  const headers = studentData[0] as string[];
  const hasClassNumber = headers.includes('반') && headers.includes('번호');

  const allParsedStudents: Student[] = studentData.slice(1).map(row => {
    // ★ id 우선순위: realID(row[9], cohort-safe "00-00535") > row[0](학번 "10421", cohort-collision)
    // 학번은 여러 cohort에서 재사용되어 (00-00323 강도윤 + 00-00535 신하린이 같은 "10421"로
    // 평탄화) Map 키나 React key로 쓰면 충돌함. snapshot RPC가 row[9]에 realID를 채워주므로
    // 그걸 id로 채택하면 모든 다운스트림 lookup이 자동으로 cohort-safe.
    const realID = row[9] ? String(row[9]) : undefined;
    const rawId = row[0] as string | number;
    const student: Student = {
      id: realID ?? rawId,
      name: row[1] as string,
      contact: '',
      submitTime: '',
      year: parseInt(String(row[2])) || 1,
      class: parseInt(String(row[3])) || 1,
      number: parseInt(String(row[4])) || 1,
      round: parseInt(String(row[5])) || 1,
      semester1: [],
      semester2: [],
      grade: parseFloat(String(row[8])) || 0,
      // realID는 별도 필드로도 보존 (호환을 위해)
      ...(realID ? { realID } : {}),
    };

    if (hasClassNumber) {
      // 1학기 과목 파싱
      if (row[6] && typeof row[6] === 'string') {
        const rawSubjects = row[6].split(',').map(s => s.trim()).filter(s => s.length > 0);
        student.semester1 = filterSubjectsByConfiguration(rawSubjects, subjectConfiguration ?? null);
      }

      // 2학기 과목 파싱
      if (row[7] && typeof row[7] === 'string') {
        const rawSubjects = row[7].split(',').map(s => s.trim()).filter(s => s.length > 0);
        student.semester2 = filterSubjectsByConfiguration(rawSubjects, subjectConfiguration ?? null);
      }
    }

    return student;
  }).filter(s => s.id && s.name);

  // 학년-차수별로 데이터 분리
  const gradeRoundGroups: Record<string, Student[]> = {};

  allParsedStudents.forEach(student => {
    const key = `${student.year}-${student.round}`;
    if (!gradeRoundGroups[key]) {
      gradeRoundGroups[key] = [];
    }
    gradeRoundGroups[key].push(student);
  });

  return {
    students: allParsedStudents,
    gradeRoundGroups,
    subjectConfiguration: subjectConfiguration ?? null
  };
}

/**
 * 레거시 Excel 데이터를 파싱합니다.
 */
export function parseLegacyExcelData(data: unknown[][]): Student[] {
  const categories = data[0] as string[];
  const headers = data[1] as string[];

  return data.slice(2).map(row => {
    const student: Student = {
      id: row[1] as string | number,
      name: row[2] as string,
      contact: row[3] as string,
      submitTime: row[4] as string,
      year: parseInt(String(row[5])) || 1,
      modifyTime: row[6] as string,
      round: 1,
      class: 1,
      number: 1,
      semester1: [],
      semester2: [],
      grade: 0
    };

    // 1학기/2학기 인덱스 찾기
    let semester1StartIndex = categories.findIndex(h => h && h.includes('1학기'));
    if (semester1StartIndex === -1) semester1StartIndex = 7;
    let semester2StartIndex = categories.findIndex(h => h && h.includes('2학기'));
    if (semester2StartIndex === -1) semester2StartIndex = 22;

    const semester1EndIndex = semester2StartIndex - 1;

    // 1학기 과목
    for (let i = semester1StartIndex; i <= semester1EndIndex; i++) {
      if (row[i] == 1 && headers[i]) {
        const subjectName = (headers[i] as string).replace(/\([^)]*\)/g, '').trim();
        student.semester1.push(subjectName);
      }
    }

    // 2학기 과목
    const semester2EndIndex = headers.length - 1;
    for (let i = semester2StartIndex; i <= semester2EndIndex; i++) {
      if (row[i] == 1 && headers[i]) {
        const subjectName = (headers[i] as string).replace(/\([^)]*\)/g, '').trim();
        student.semester2.push(subjectName);
      }
    }

    return student;
  }).filter(s => s.id && s.name);
}

/**
 * 데이터 형식을 감지하고 적절한 파서를 선택합니다.
 */
export function parseStudentData(data: unknown): {
  students: Student[];
  gradeRoundGroups: Record<string, Student[]>;
  subjectConfiguration: SubjectConfiguration | null;
} {
  // 통합 JSON 형식 체크
  if (
    typeof data === 'object' &&
    data !== null &&
    'studentData' in data &&
    (('fileType' in data && (data as UnifiedDataFormat).fileType === 'kijun_unified_export') ||
     ('type' in data && (data as { type: string }).type === 'unified'))
  ) {
    return parseUnifiedData(data as UnifiedDataFormat);
  }

  // 레거시 Excel 형식
  if (Array.isArray(data)) {
    const students = parseLegacyExcelData(data as unknown[][]);
    return {
      students,
      gradeRoundGroups: { '1-1': students },
      subjectConfiguration: null
    };
  }

  throw new Error('Unknown data format');
}

// ============================================================================
// Student Analysis Functions
// ============================================================================

/**
 * 특정 학년/차수의 학생들을 찾습니다.
 * round를 지정하지 않으면 마지막 차수 학생들을 반환합니다.
 */
export function getLastRoundStudentsForGrade(
  gradeRoundGroups: Record<string, Student[]>,
  grade: number,
  round?: number
): Student[] {
  const gradeKeys = Object.keys(gradeRoundGroups).filter(key => {
    const keyGrade = parseInt(key.split('-')[0]);
    return keyGrade === grade;
  });

  if (gradeKeys.length === 0) {
    return [];
  }

  const rounds = gradeKeys.map(key => parseInt(key.split('-')[1]));

  // 특정 차수가 지정되었으면 해당 차수 반환, 아니면 마지막 차수
  const targetRound = round !== undefined && rounds.includes(round)
    ? round
    : Math.max(...rounds);

  const targetKey = `${grade}-${targetRound}`;

  return gradeRoundGroups[targetKey] || [];
}

/**
 * 학생 ID에서 반 번호를 추출합니다.
 */
export function getClassNumber(studentId: string | number): number | null {
  const idString = String(studentId);
  if (idString.length >= 3) {
    return parseInt(idString.substring(idString.length - 3, idString.length - 2));
  }
  return null;
}

/**
 * 학년·반·번호로 학번(GCCNN)을 만듭니다. 예) 2학년 3반 7번 → "20307"
 *
 * 화면에 노출하는 식별자는 이 형식을 쓴다. student.id 는 cohort 충돌을 피하려고
 * realID("00-00535")를 담고 있어 사람이 읽는 학번과 다르다(내부 key 전용).
 * 학년/반/번호가 온전하지 않으면 표시할 값이 없어지므로 id 문자열로 폴백한다.
 */
export function formatStudentNumber(student: Pick<Student, 'id' | 'year' | 'class' | 'number'>): string {
  const { year, class: classNum, number } = student;
  const valid = [year, classNum, number].every(v => Number.isFinite(v) && (v as number) > 0);
  if (!valid) return String(student.id);
  return `${year}${String(classNum).padStart(2, '0')}${String(number).padStart(2, '0')}`;
}

/**
 * 학생들을 반별로 그룹화합니다.
 */
export function getStudentsByClass(students: Student[]): Record<number, Student[]> {
  const classes: Record<number, Student[]> = {};

  students.forEach(student => {
    const classNum = student.class || getClassNumber(student.id);
    if (classNum !== null) {
      if (!classes[classNum]) {
        classes[classNum] = [];
      }
      classes[classNum].push(student);
    }
  });

  return classes;
}

/**
 * 1학기와 2학기에 동일 과목을 선택한 학생들을 찾습니다.
 */
export function getStudentsWithSameSubjectsInBothSemesters(students: Student[]): Student[] {
  return students.filter(student => {
    const commonSubjects = student.semester1.filter(subject =>
      student.semester2.includes(subject)
    );
    return commonSubjects.length > 0;
  });
}

// ============================================================================
// Enrollment Data Functions
// ============================================================================

/**
 * 학생 데이터에서 과목별 수강 인원을 계산합니다.
 */
export function calculateEnrollmentData(students: Student[]): SubjectEnrollmentData {
  const enrollmentData: SubjectEnrollmentData = {
    semester1: new Map<string, SubjectEnrollment>(),
    semester2: new Map<string, SubjectEnrollment>()
  };

  students.forEach(student => {
    student.semester1.forEach(subjectName => {
      if (!enrollmentData.semester1.has(subjectName)) {
        enrollmentData.semester1.set(subjectName, {
          maxCapacity: 0,
          currentEnrollment: 0
        });
      }
      const data = enrollmentData.semester1.get(subjectName)!;
      data.currentEnrollment++;
    });

    student.semester2.forEach(subjectName => {
      if (!enrollmentData.semester2.has(subjectName)) {
        enrollmentData.semester2.set(subjectName, {
          maxCapacity: 0,
          currentEnrollment: 0
        });
      }
      const data = enrollmentData.semester2.get(subjectName)!;
      data.currentEnrollment++;
    });
  });

  return enrollmentData;
}

/**
 * 정원에 도달한 과목들을 찾습니다.
 */
export function getSubjectsAtMaxCapacity(
  enrollmentData: SubjectEnrollmentData
): MaxCapacitySubjects {
  const maxCapacitySubjects: MaxCapacitySubjects = {
    semester1: [],
    semester2: []
  };

  enrollmentData.semester1.forEach((data, subjectName) => {
    if (data.maxCapacity > 0 && data.currentEnrollment >= data.maxCapacity) {
      maxCapacitySubjects.semester1.push({
        name: subjectName,
        maxCapacity: data.maxCapacity,
        currentEnrollment: data.currentEnrollment
      });
    }
  });

  enrollmentData.semester2.forEach((data, subjectName) => {
    if (data.maxCapacity > 0 && data.currentEnrollment >= data.maxCapacity) {
      maxCapacitySubjects.semester2.push({
        name: subjectName,
        maxCapacity: data.maxCapacity,
        currentEnrollment: data.currentEnrollment
      });
    }
  });

  return maxCapacitySubjects;
}

// ============================================================================
// Science Hierarchy Validation
// ============================================================================

/**
 * 과학 선수과목 위반 사항을 검사합니다.
 *
 * @param students 분석 대상 학생(선택과목은 semester1/semester2에 적재)
 * @param priorSubjectsByStudent 선택사항 — student_code(=student.id) → 직전 학년도(현재 학년)
 *   수강 과목 Set. 2학년 컨텍스트에서 사용한다: 2학년은 "3학년 과목"을 선택하므로 선수과목
 *   (예: 물리학)이 열려있는 선택 데이터엔 없고 "현재 듣고 있는 2학년 과목"에만 존재한다.
 *   이 맵을 넘기면 현재 학년 과목 + 3학년 선택과목을 합친 집합으로 위계를 판정한다
 *   (사용자 결정: 2·3학년 통합 기준). 넘기지 않으면(1학년) 기존과 동일하게 선택분만 본다.
 */
export function getScienceHierarchyViolations(
  students: Student[],
  priorSubjectsByStudent?: Map<string, Set<string>>
): StudentViolation[] {
  const violations: StudentViolation[] = [];

  students.forEach(student => {
    // 직전 학년도(=현재 학년) 수강 과목을 합쳐 위계를 판정 (2학년 컨텍스트).
    // 1학년 등 prior 데이터가 없으면 선택분(semester1+2)만 사용 → 기존 동작 유지.
    const priorSubjects = priorSubjectsByStudent?.get(String(student.id));
    const allSubjects = priorSubjects
      ? [...student.semester1, ...student.semester2, ...priorSubjects]
      : [...student.semester1, ...student.semester2];
    const studentViolations: ScienceHierarchyViolation[] = [];

    Object.entries(SCIENCE_HIERARCHY).forEach(([category, subjects]) => {
      const prerequisite = subjects[0];
      const advancedSubjects = subjects.slice(1);

      const hasPrerequisite = allSubjects.includes(prerequisite);
      const takenAdvanced = advancedSubjects.filter(subject => allSubjects.includes(subject));

      // 선수과목 없이 심화과목 수강
      if (!hasPrerequisite && takenAdvanced.length > 0) {
        studentViolations.push({
          category,
          violation: 'missing_prerequisite',
          prerequisite,
          takenAdvanced,
          description: `${prerequisite} 없이 ${takenAdvanced.join(', ')} 선택`
        });
      }

      // 같은 학기에 기초/심화 동시 수강
      if (
        student.semester2.includes(prerequisite) &&
        advancedSubjects.some(subject => student.semester2.includes(subject))
      ) {
        const sameSemesterAdvanced = advancedSubjects.filter(subject =>
          student.semester2.includes(subject)
        );
        studentViolations.push({
          category,
          violation: 'same_semester',
          prerequisite,
          takenAdvanced: sameSemesterAdvanced,
          description: `${prerequisite}과 ${sameSemesterAdvanced.join(', ')}을 모두 2학기에 선택`
        });
      }
    });

    if (studentViolations.length > 0) {
      violations.push({
        student,
        violations: studentViolations
      });
    }
  });

  return violations;
}

// ============================================================================
// Round Comparison Functions
// ============================================================================

/**
 * 특정 학년의 사용 가능한 차수 목록을 반환합니다.
 */
export function getAvailableRoundsForGrade(
  gradeRoundGroups: Record<string, Student[]>,
  grade: number
): number[] {
  const rounds = new Set<number>();

  Object.keys(gradeRoundGroups).forEach(key => {
    const match = key.match(/^(\d+)-(\d+)$/);
    if (match && parseInt(match[1]) === grade) {
      rounds.add(parseInt(match[2]));
    }
  });

  return [...rounds].sort((a, b) => a - b);
}

/**
 * 차수 ID를 실제 차수 번호로 변환합니다.
 */
export function mapRoundIdToNumber(
  roundId: 'round1' | 'round2' | 'final',
  availableRounds: number[]
): number | null {
  const sortedRounds = [...availableRounds].sort((a, b) => a - b);

  switch (roundId) {
    case 'round1':
      return sortedRounds.includes(1) ? 1 : null;
    case 'round2':
      return sortedRounds.includes(2) ? 2 : null;
    case 'final':
      const finalRounds = sortedRounds.filter(round => round >= 3);
      return finalRounds.length > 0 ? finalRounds[finalRounds.length - 1] : null;
    default:
      return null;
  }
}

// ============================================================================
// Filtering Functions
// ============================================================================

/**
 * 학생 목록을 필터링합니다.
 */
export function filterStudents(
  students: Student[],
  options: {
    searchQuery?: string;
    searchTerm?: string;
    classNumber?: number;
    hasSubject?: string;
    subject?: string;
    semester?: 'semester1' | 'semester2' | 'both';
    grade?: number;
  }
): Student[] {
  let filtered = [...students];

  // 이름/학번 검색
  // id(=realID "00-00500")는 입학 시 학번이라 화면에 보이는 현재 학번("20307")과 다르다.
  // 둘 다 매칭해야 사용자가 보이는 숫자를 그대로 쳐서 찾을 수 있다.
  const query = options.searchQuery || options.searchTerm;
  if (query) {
    const lowerQuery = query.toLowerCase();
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(lowerQuery) ||
      String(s.id).includes(lowerQuery) ||
      formatStudentNumber(s).includes(lowerQuery)
    );
  }

  // 반 필터
  if (options.classNumber) {
    filtered = filtered.filter(s =>
      (s.class || getClassNumber(s.id)) === options.classNumber
    );
  }

  // 과목 필터
  const subjectFilter = options.hasSubject || options.subject;
  if (subjectFilter) {
    const semester = options.semester || 'both';

    filtered = filtered.filter(s => {
      if (semester === 'semester1') return s.semester1.includes(subjectFilter);
      if (semester === 'semester2') return s.semester2.includes(subjectFilter);
      return s.semester1.includes(subjectFilter) || s.semester2.includes(subjectFilter);
    });
  }

  return filtered;
}

// ============================================================================
// Subject Statistics Functions
// ============================================================================

/**
 * 과목별 선택 학생 수를 계산합니다. (SubjectCount[] 배열 반환)
 */
export function calculateSubjectCounts(
  students: Student[],
  categories: Record<string, string[]>
): SubjectCount[] {
  const semester1Counts: Record<string, number> = {};
  const semester2Counts: Record<string, number> = {};

  // 학기별 과목 카운트 집계
  students.forEach(student => {
    student.semester1.forEach(subject => {
      semester1Counts[subject] = (semester1Counts[subject] || 0) + 1;
    });
    student.semester2.forEach(subject => {
      semester2Counts[subject] = (semester2Counts[subject] || 0) + 1;
    });
  });

  // 과목명 → 카테고리 맵 생성
  const subjectCategoryMap: Record<string, string> = {};
  Object.entries(categories).forEach(([category, subjects]) => {
    subjects.forEach(subject => {
      subjectCategoryMap[subject] = category;
    });
  });

  // 모든 과목 집합 생성
  const allSubjects = new Set([...Object.keys(semester1Counts), ...Object.keys(semester2Counts)]);

  // SubjectCount[] 배열 생성
  const result: SubjectCount[] = [];
  allSubjects.forEach(subjectName => {
    const s1Count = semester1Counts[subjectName] || 0;
    const s2Count = semester2Counts[subjectName] || 0;
    result.push({
      subjectName,
      semester1Count: s1Count,
      semester2Count: s2Count,
      totalCount: s1Count + s2Count,
      category: subjectCategoryMap[subjectName] || '기타'
    });
  });

  // 과목군 → 과목명 순서로 정렬. categoryOrder는 subjectUtils의 단일 소스
  // (국어 → 영어 → 수학 → 역사 → 사회 → 물리 → 화학 → 생명 → 지구과학 → 기타).
  const categoryOrder = getCategoryDisplayOrder();
  result.sort((a, b) => {
    const catAIdx = categoryOrder.indexOf(a.category as never);
    const catBIdx = categoryOrder.indexOf(b.category as never);
    if (catAIdx !== catBIdx) {
      return (catAIdx === -1 ? 999 : catAIdx) - (catBIdx === -1 ? 999 : catBIdx);
    }
    return a.subjectName.localeCompare(b.subjectName, 'ko');
  });

  return result;
}

/**
 * 특정 과목 조합을 선택한 학생들을 찾습니다.
 */
export function findStudentsBySubjectCombination(
  students: Student[],
  subjects: string[],
  semester: 'semester1' | 'semester2' | 'both',
  matchType: 'all' | 'any' = 'all'
): Student[] {
  return students.filter(student => {
    const checkSemester = (sem: 'semester1' | 'semester2') => {
      const studentSubjects = student[sem];
      if (matchType === 'all') {
        return subjects.every(s => studentSubjects.includes(s));
      }
      return subjects.some(s => studentSubjects.includes(s));
    };

    if (semester === 'semester1') return checkSemester('semester1');
    if (semester === 'semester2') return checkSemester('semester2');
    return checkSemester('semester1') || checkSemester('semester2');
  });
}
