import type {
  Student,
  SubjectAssignmentAlgorithm,
  SubjectClass,
  SubjectConfig,
  SubjectAssignment,
} from '../types/subject-assignment.types';

/**
 * 특정 학기의 과목을 수강하는 학생들을 필터링합니다.
 *
 * @param students 전체 학생 목록
 * @param subject 과목명
 * @param semester 학기 ('semester1' | 'semester2')
 * @returns 해당 과목을 수강하는 학생 배열
 */
export function getEnrolledStudents(
  students: Student[],
  subject: string,
  semester: 'semester1' | 'semester2'
): Student[] {
  return students.filter(student => student[semester].includes(subject));
}

/**
 * Fisher-Yates 알고리즘을 사용한 배열 셔플
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 무작위 분반 알고리즘
 * - 학생들을 무작위로 섞은 후 균등하게 분배
 *
 * @param students 분반할 학생 목록
 * @param classCount 분반 개수
 * @returns 분반 결과
 */
export function assignRandom(students: Student[], classCount: number): SubjectClass[] {
  const shuffled = shuffleArray(students);
  const classes: SubjectClass[] = Array.from({ length: classCount }, (_, i) => ({
    classNum: i + 1,
    students: []
  }));

  shuffled.forEach((student, index) => {
    classes[index % classCount].students.push(student);
  });

  return classes;
}

/**
 * 성적 균형 분반 알고리즘
 * - 성적순으로 정렬 후 라운드로빈 방식으로 분배하여 각 반의 평균 성적을 균등하게 유지
 *
 * @param students 분반할 학생 목록
 * @param classCount 분반 개수
 * @returns 분반 결과
 */
export function assignBalanced(students: Student[], classCount: number): SubjectClass[] {
  // 성적순 정렬 (낮은 등급 = 좋은 성적)
  const sorted = [...students].sort((a, b) => a.grade - b.grade);

  const classes: SubjectClass[] = Array.from({ length: classCount }, (_, i) => ({
    classNum: i + 1,
    students: []
  }));

  sorted.forEach((student, index) => {
    classes[index % classCount].students.push(student);
  });

  return classes;
}

/**
 * 계층별 분반 알고리즘
 * - 학생들을 성적 구간(상/중/하)으로 나눈 후 각 구간을 균등 분배
 * - 각 반이 모든 성적 구간의 학생을 고르게 포함하도록 보장
 *
 * @param students 분반할 학생 목록
 * @param classCount 분반 개수
 * @returns 분반 결과
 */
export function assignStratified(students: Student[], classCount: number): SubjectClass[] {
  const sorted = [...students].sort((a, b) => a.grade - b.grade);

  // 3개 구간으로 분할 (상/중/하)
  const tierSize = Math.ceil(sorted.length / 3);
  const topTier = sorted.slice(0, tierSize);
  const midTier = sorted.slice(tierSize, tierSize * 2);
  const bottomTier = sorted.slice(tierSize * 2);

  const classes: SubjectClass[] = Array.from({ length: classCount }, (_, i) => ({
    classNum: i + 1,
    students: []
  }));

  // 각 구간을 라운드로빈으로 분배
  [topTier, midTier, bottomTier].forEach(tier => {
    tier.forEach((student, index) => {
      classes[index % classCount].students.push(student);
    });
  });

  return classes;
}

/**
 * 지그재그(뱀 모양) 분반 알고리즘
 * - 성적순으로 정렬 후 지그재그 패턴으로 분배
 * - 홀수 행: 정방향, 짝수 행: 역방향으로 배치하여 인접한 반의 성적 차이를 최소화
 *
 * @param students 분반할 학생 목록
 * @param classCount 분반 개수
 * @returns 분반 결과
 */
export function assignSerpentine(students: Student[], classCount: number): SubjectClass[] {
  const sorted = [...students].sort((a, b) => a.grade - b.grade);

  const classes: SubjectClass[] = Array.from({ length: classCount }, (_, i) => ({
    classNum: i + 1,
    students: []
  }));

  let currentClass = 0;
  let direction = 1; // 1: forward, -1: backward

  sorted.forEach(student => {
    classes[currentClass].students.push(student);

    currentClass += direction;

    // 방향 전환
    if (currentClass >= classCount) {
      currentClass = classCount - 1;
      direction = -1;
    } else if (currentClass < 0) {
      currentClass = 0;
      direction = 1;
    }
  });

  return classes;
}

/**
 * 특정 과목에 대한 학생 분반을 수행합니다.
 *
 * @param options 분반 옵션
 * @param options.students 전체 학생 목록
 * @param options.subject 과목명
 * @param options.semester 학기
 * @param options.classCount 분반 개수
 * @param options.algorithm 사용할 알고리즘
 * @returns 분반 결과
 */
export function assignStudentsToSubject(options: {
  students: Student[];
  subject: string;
  semester: 'semester1' | 'semester2';
  classCount: number;
  algorithm: SubjectAssignmentAlgorithm;
}): SubjectAssignment {
  const { students, subject, semester, classCount, algorithm } = options;

  // 해당 과목 수강생 필터링
  const enrolled = getEnrolledStudents(students, subject, semester);

  // 알고리즘에 따라 분반 수행
  let classes: SubjectClass[];

  switch (algorithm) {
    case 'random':
      classes = assignRandom(enrolled, classCount);
      break;
    case 'balanced':
      classes = assignBalanced(enrolled, classCount);
      break;
    case 'stratified':
      classes = assignStratified(enrolled, classCount);
      break;
    case 'serpentine':
      classes = assignSerpentine(enrolled, classCount);
      break;
    default:
      classes = assignRandom(enrolled, classCount);
  }

  return {
    subjectName: subject,
    semester,
    classCount,
    classes,
    algorithm
  };
}

/**
 * 여러 과목에 대한 분반을 일괄 수행합니다.
 *
 * @param students 전체 학생 목록
 * @param configs 과목별 분반 설정 목록
 * @param globalAlgorithm 기본 알고리즘 (개별 설정이 없을 경우 사용)
 * @returns 모든 과목의 분반 결과 배열
 */
export function assignAllSubjects(
  students: Student[],
  configs: SubjectConfig[],
  globalAlgorithm: SubjectAssignmentAlgorithm
): SubjectAssignment[] {
  return configs.map(config =>
    assignStudentsToSubject({
      students,
      subject: config.subject,
      semester: config.semester,
      classCount: config.classCount,
      algorithm: config.algorithm || globalAlgorithm
    })
  );
}

/**
 * 과목별 수강 인원을 집계합니다.
 *
 * @param students 전체 학생 목록
 * @returns 과목별, 학기별 수강 인원 요약 (인원순 내림차순 정렬)
 */
export function getSubjectEnrollmentSummary(students: Student[]): {
  subject: string;
  semester: 'semester1' | 'semester2';
  count: number;
}[] {
  const enrollmentMap = new Map<string, number>();

  students.forEach(student => {
    // 1학기 과목
    student.semester1.forEach(subject => {
      const key = `${subject}|semester1`;
      enrollmentMap.set(key, (enrollmentMap.get(key) || 0) + 1);
    });

    // 2학기 과목
    student.semester2.forEach(subject => {
      const key = `${subject}|semester2`;
      enrollmentMap.set(key, (enrollmentMap.get(key) || 0) + 1);
    });
  });

  // Map을 배열로 변환하고 인원순으로 정렬
  const summary = Array.from(enrollmentMap.entries()).map(([key, count]) => {
    const [subject, semester] = key.split('|');
    return {
      subject,
      semester: semester as 'semester1' | 'semester2',
      count
    };
  });

  return summary.sort((a, b) => b.count - a.count);
}
