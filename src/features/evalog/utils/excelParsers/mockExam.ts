import { norm } from './utils';

interface SubjectScore {
  raw_score: number | null;
  standard_score: number | null;
  percentile: number | null;
  grade: number | null;
}

export interface ParsedMockExamRow {
  grade: number;
  classNum: number;
  number: number;
  name: string;
  subjects: Record<string, SubjectScore>;
}

interface SubjectMapping {
  headerName: string;
  startCol: number;
  hasSubjectCol: boolean;
  colCount: number;
  subCols: {
    subject?: number;
    raw_score: number;   // -1 if not present
    standard_score: number; // -1 if not present
    percentile: number;  // -1 if not present
    grade: number;       // -1 if not present
  };
}

type MockExamFormat = 'A' | 'B' | 'C';

const parseScore = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const num = parseFloat(String(value));
  return isNaN(num) ? null : num;
};

/**
 * 과목명 정규화: 로마숫자 변형 통일 및 불필요한 공백 제거
 * - 화학I → 화학Ⅰ (Latin I → Unicode Roman Ⅰ)
 * - 화학 I → 화학Ⅰ
 * - 화학 Ⅰ → 화학Ⅰ (숫자 앞 공백 제거)
 * - 생명 과학Ⅰ → 생명과학Ⅰ (과목명 내 공백 제거)
 */
const normalizeSubjectName = (name: string): string => {
  let s = name.trim();
  // Latin III/II/I → Unicode Ⅲ/Ⅱ/Ⅰ (한글 뒤에서만 매칭)
  s = s.replace(/([\uAC00-\uD7AF])\s*III\s*$/u, '$1Ⅲ');
  s = s.replace(/([\uAC00-\uD7AF])\s*II\s*$/u, '$1Ⅱ');
  s = s.replace(/([\uAC00-\uD7AF])\s*I\s*$/u, '$1Ⅰ');
  // 기존 Unicode 로마숫자 앞 공백 제거: "화학 Ⅰ" → "화학Ⅰ"
  s = s.replace(/([\uAC00-\uD7AF])\s+([\u2160-\u2162])\s*$/u, '$1$2');
  // 과목명 내부 공백 제거: "생명 과학" → "생명과학", "지구 과학" → "지구과학"
  s = s.replace(/([\uAC00-\uD7AF])\s+([\uAC00-\uD7AF])/gu, '$1$2');
  return s;
};

const SUBJECT_NAME_KEYWORDS = ['과목', '영역', '과목명'];

/**
 * 과목명을 스스로 말하지 못하는 **자리표시 헤더**. `선택1`·`탐구2` 처럼 번호만 붙은 칸은
 * 그 행의 '과목' 셀이 비면 무슨 과목인지 알 길이 없으므로 버려야 한다.
 *
 * 반대로 `국어`·`수학` 처럼 헤더가 이미 과목명이면 '과목' 셀이 비어도 버리면 안 된다 —
 * 1학년 모의고사는 국어·수학에 선택과목이 없어 그 칸이 **원래 비어 있다**(2026-09-05 실제 사고).
 */
const isPlaceholderHeader = (name: string): boolean => /^(선택|탐구)\s*\d*$/.test(name.trim());

/**
 * Format A: 계열번호 컬럼 존재 (1학년) - 모든 과목 4개 서브컬럼
 * Format B: 계열번호 없음 (2학년+) - 일부 과목에 '과목' 서브컬럼 존재 (5개)
 * Format C: 학년도 컬럼 존재 - 영역/과목명 서브컬럼, 과목별 가변 컬럼 수
 */
export const detectMockExamFormat = (row1: unknown[]): MockExamFormat => {
  const firstCell = norm(row1[0]);
  if (firstCell.includes('계열번호')) return 'A';
  if (firstCell.includes('학년도')) return 'C';
  return 'B';
};

/**
 * 듀얼 헤더에서 과목별 컬럼 매핑 생성
 * row2를 스캔하여 실제 서브컬럼 위치를 동적으로 결정
 */
const buildSubjectMappings = (
  row1: unknown[],
  row2: unknown[],
  idColCount: number
): SubjectMapping[] => {
  const mappings: SubjectMapping[] = [];

  // row1에서 빈칸이 아닌 셀 위치 수집 (idColCount 이후) → 과목 시작 인덱스 목록
  const subjectStarts: { name: string; col: number }[] = [];
  for (let i = idColCount; i < row1.length; i++) {
    const cellVal = norm(row1[i]);
    if (cellVal) {
      subjectStarts.push({ name: cellVal, col: i });
    }
  }

  const maxCol = Math.max(row1.length, row2.length);

  for (let si = 0; si < subjectStarts.length; si++) {
    const { name: headerName, col: startCol } = subjectStarts[si];
    const nextStart = si + 1 < subjectStarts.length
      ? subjectStarts[si + 1].col
      : maxCol;
    const colSpan = nextStart - startCol;

    // row2에서 해당 범위의 서브컬럼 이름을 스캔하여 위치 매핑
    let subjectIdx = -1;
    let rawScoreIdx = -1;
    let standardScoreIdx = -1;
    let percentileIdx = -1;
    let gradeIdx = -1;

    for (let j = 0; j < colSpan; j++) {
      const subName = norm(row2[startCol + j]);
      if (SUBJECT_NAME_KEYWORDS.includes(subName)) {
        subjectIdx = j;
      } else if (subName === '원점수') {
        rawScoreIdx = j;
      } else if (subName === '표준점수') {
        standardScoreIdx = j;
      } else if (subName === '백분위') {
        percentileIdx = j;
      } else if (subName === '등급') {
        gradeIdx = j;
      }
    }

    const hasSubjectCol = subjectIdx >= 0;

    mappings.push({
      headerName,
      startCol,
      hasSubjectCol,
      colCount: colSpan,
      subCols: {
        subject: hasSubjectCol ? subjectIdx : undefined,
        raw_score: rawScoreIdx,
        standard_score: standardScoreIdx,
        percentile: percentileIdx,
        grade: gradeIdx,
      },
    });
  }

  return mappings;
};

/**
 * 모의고사 CSV/XLSX 파싱
 * - Format A (계열번호 있음): 1학년 모의고사 - 과목 4개 서브컬럼
 * - Format B (계열번호 없음): 2학년+ 모의고사 - 일부 과목에 '과목' 서브컬럼
 * - Format C (학년도 있음): 영역/과목명 서브컬럼, 과목별 가변 컬럼 수
 */
export const parseMockExamCSV = (data: unknown[][]): ParsedMockExamRow[] => {
  if (data.length < 3) return [];

  const row1 = data[0] as unknown[];
  const row2 = data[1] as unknown[];
  const format = detectMockExamFormat(row1);

  // Format A: 계열번호(0), 학년(1), 반(2), 번호(3), 이름(4)
  // Format B: 학년(0), 반(1), 번호(2), 이름(3)
  // Format C: 학년도(0), 학년(1), 반(2), 번호(3), 이름(4)
  const has5IdCols = format === 'A' || format === 'C';
  const idColCount = has5IdCols ? 5 : 4;
  const gradeIdx = has5IdCols ? 1 : 0;
  const classIdx = has5IdCols ? 2 : 1;
  const numIdx = has5IdCols ? 3 : 2;
  const nameIdx = has5IdCols ? 4 : 3;

  const subjectMappings = buildSubjectMappings(row1, row2, idColCount);

  const results: ParsedMockExamRow[] = [];

  for (let i = 2; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length === 0) continue;

    const gradeVal = parseInt(String(row[gradeIdx] || ''));
    const classVal = parseInt(String(row[classIdx] || ''));
    const numVal = parseInt(String(row[numIdx] || ''));
    const nameVal = String(row[nameIdx] || '').trim();

    if (!nameVal || isNaN(gradeVal)) continue;

    const subjects: Record<string, SubjectScore> = {};

    for (const mapping of subjectMappings) {
      const { headerName, startCol, hasSubjectCol, subCols } = mapping;

      // 실제 과목명 결정 + 정규화
      let subjectName = headerName;
      if (hasSubjectCol && subCols.subject !== undefined) {
        const actualName = String(row[startCol + subCols.subject] || '').trim();
        if (actualName) {
          subjectName = actualName;
        } else if (isPlaceholderHeader(headerName)) {
          continue; // 선택N·탐구N — 과목명을 알 수 없으니 버린다
        }
        /*
          ## '과목' 셀이 비어도 헤더가 과목명이면 살린다 (2026-09-05 실제 사고)

          종전엔 무조건 `continue` 했다. 그런데 **1학년 모의고사는 국어·수학에 선택과목이
          없어 그 블록의 '과목' 칸이 원래 비어 있다** — 점수는 멀쩡히 있는데 과목이
          통째로 버려졌다(라이브: 23학번 2023-09 회차에서 국어·수학 226·225명이
          원점수·표준점수·백분위·등급을 다 갖고도 DB 에 한 건도 안 들어갔다).
          오류가 아니라 조용한 누락이라 2년 가까이 드러나지 않았다.

          점수가 전부 비어 있으면 아래 "모든 점수가 null이면 스킵"이 어차피 거른다.
        */
      }
      subjectName = normalizeSubjectName(subjectName);

      const rawScore = subCols.raw_score >= 0 ? parseScore(row[startCol + subCols.raw_score]) : null;
      const standardScore = subCols.standard_score >= 0 ? parseScore(row[startCol + subCols.standard_score]) : null;
      const percentile = subCols.percentile >= 0 ? parseScore(row[startCol + subCols.percentile]) : null;
      const gradeScore = subCols.grade >= 0 ? parseScore(row[startCol + subCols.grade]) : null;

      // 모든 점수가 null이면 스킵
      if (rawScore === null && standardScore === null && percentile === null && gradeScore === null) {
        continue;
      }

      subjects[subjectName] = {
        raw_score: rawScore,
        standard_score: standardScore,
        percentile: percentile,
        grade: gradeScore,
      };
    }

    if (Object.keys(subjects).length === 0) continue;

    results.push({
      grade: gradeVal,
      classNum: classVal,
      number: numVal,
      name: nameVal,
      subjects,
    });
  }

  return results;
};

/**
 * 파싱 결과에서 고유 과목 목록 추출
 */
export const extractSubjectList = (data: ParsedMockExamRow[]): string[] => {
  const subjectSet = new Set<string>();
  for (const row of data) {
    for (const subjectName of Object.keys(row.subjects)) {
      subjectSet.add(subjectName);
    }
  }
  return [...subjectSet].sort();
};
