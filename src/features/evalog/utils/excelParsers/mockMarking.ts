/**
 * 모의고사 마킹 CSV 파서
 *
 * 두 종류의 CSV를 처리:
 * - "1" 파일: 학생 선택 답 (1~5 또는 주관식 숫자)
 * - "s" 파일: 정오 (O/X)
 *
 * CSV 구조: 계열, 학년, 반, 번호, 이름, 과목, 1번~60번
 * - 학생 한 명당 과목 수만큼 행이 존재
 * - 빈 문자열("")은 해당 문항 없음
 */

export interface ParsedMarkingSubject {
    answers: (number | null)[];    // "1" 파일에서 파싱
    correct: (boolean | null)[];   // "s" 파일에서 파싱
    item_count: number;
}

export interface ParsedMarkingStudent {
    grade: number;
    classNum: number;
    number: number;
    name: string;
    subjects: Record<string, ParsedMarkingSubject>;
}

type MarkingFileType = 'answers' | 'correct';

/**
 * 파일 타입 감지: 값이 O/X면 정오파일, 숫자면 답안파일
 */
export const detectMarkingFileType = (data: unknown[][]): MarkingFileType => {
    // 첫 데이터 행(index 1)의 7번째 컬럼(1번 문항)부터 확인
    if (data.length < 2) return 'answers';
    const row = data[1] as unknown[];
    if (!row || row.length < 7) return 'answers';

    const sample = String(row[6] || '').trim().toUpperCase();
    if (sample === 'O' || sample === 'X') return 'correct';
    return 'answers';
};

/**
 * 답안 값 파싱 (숫자로 변환, 주관식 028 → 28)
 */
const parseAnswer = (value: unknown): number | null => {
    if (value === undefined || value === null || value === '') return null;
    const str = String(value).trim();
    if (str === '') return null;
    const num = parseInt(str, 10);
    return isNaN(num) ? null : num;
};

/**
 * 정오 값 파싱 (O → true, X → false)
 */
const parseCorrect = (value: unknown): boolean | null => {
    if (value === undefined || value === null || value === '') return null;
    const str = String(value).trim().toUpperCase();
    if (str === 'O') return true;
    if (str === 'X') return false;
    return null;
};

/**
 * 과목명 정규화 (mockExam.ts의 normalizeSubjectName과 동일한 로직)
 */
const normalizeSubjectName = (name: string): string => {
    let s = name.trim();
    s = s.replace(/([\uAC00-\uD7AF])\s*III\s*$/u, '$1Ⅲ');
    s = s.replace(/([\uAC00-\uD7AF])\s*II\s*$/u, '$1Ⅱ');
    s = s.replace(/([\uAC00-\uD7AF])\s*I\s*$/u, '$1Ⅰ');
    s = s.replace(/([\uAC00-\uD7AF])\s+([\u2160-\u2162])\s*$/u, '$1$2');
    s = s.replace(/([\uAC00-\uD7AF])\s+([\uAC00-\uD7AF])/gu, '$1$2');
    return s;
};

/**
 * 마킹 CSV 파싱 (답안 또는 정오 파일)
 *
 * @param data - XLSX.utils.sheet_to_json로 파싱된 2D 배열
 * @param fileType - 'answers' (선택답) 또는 'correct' (정오)
 * @returns 학생별 과목별 마킹 데이터
 */
export const parseMockMarkingCSV = (
    data: unknown[][],
    fileType: MarkingFileType
): ParsedMarkingStudent[] => {
    if (data.length < 2) return [];

    // 헤더 확인: 계열, 학년, 반, 번호, 이름, 과목, 1번~60번
    // 첫 행은 헤더이므로 스킵
    const studentMap = new Map<string, ParsedMarkingStudent>();

    for (let i = 1; i < data.length; i++) {
        const row = data[i] as unknown[];
        if (!row || row.length < 7) continue;

        const grade = parseInt(String(row[1] || ''));
        const classNum = parseInt(String(row[2] || ''));
        const number = parseInt(String(row[3] || ''));
        const name = String(row[4] || '').trim();
        const subject = normalizeSubjectName(String(row[5] || '').trim());

        if (!name || isNaN(grade) || isNaN(classNum) || isNaN(number) || !subject) continue;

        // 학생 키: 반-번호-이름
        const studentKey = `${classNum}-${number}-${name}`;

        if (!studentMap.has(studentKey)) {
            studentMap.set(studentKey, {
                grade,
                classNum,
                number,
                name,
                subjects: {},
            });
        }

        const student = studentMap.get(studentKey)!;

        // 6번 인덱스부터 1번~60번 문항
        const items: (number | boolean | null)[] = [];
        let itemCount = 0;

        for (let j = 6; j < Math.min(row.length, 66); j++) { // 최대 60문항
            if (fileType === 'answers') {
                const val = parseAnswer(row[j]);
                items.push(val);
                if (val !== null) itemCount++;
            } else {
                const val = parseCorrect(row[j]);
                items.push(val);
                if (val !== null) itemCount++;
            }
        }

        // 뒤쪽 null 트리밍
        while (items.length > 0 && items[items.length - 1] === null) {
            items.pop();
        }

        if (itemCount === 0) continue;

        if (!student.subjects[subject]) {
            student.subjects[subject] = {
                answers: [],
                correct: [],
                item_count: 0,
            };
        }

        if (fileType === 'answers') {
            student.subjects[subject].answers = items as (number | null)[];
            student.subjects[subject].item_count = itemCount;
        } else {
            student.subjects[subject].correct = items as unknown as (boolean | null)[];
            student.subjects[subject].item_count = itemCount;
        }
    }

    return [...studentMap.values()];
};

/**
 * 두 파일(답안 + 정오)의 파싱 결과를 병합
 */
export const mergeMarkingData = (
    answersData: ParsedMarkingStudent[],
    correctData: ParsedMarkingStudent[]
): ParsedMarkingStudent[] => {
    // answersData를 기준으로 correctData를 병합
    const correctMap = new Map<string, ParsedMarkingStudent>();
    for (const student of correctData) {
        const key = `${student.classNum}-${student.number}-${student.name}`;
        correctMap.set(key, student);
    }

    for (const student of answersData) {
        const key = `${student.classNum}-${student.number}-${student.name}`;
        const correctStudent = correctMap.get(key);
        if (!correctStudent) continue;

        for (const [subjectName, subjectData] of Object.entries(correctStudent.subjects)) {
            if (!student.subjects[subjectName]) {
                student.subjects[subjectName] = {
                    answers: [],
                    correct: subjectData.correct,
                    item_count: subjectData.item_count,
                };
            } else {
                student.subjects[subjectName].correct = subjectData.correct;
            }
        }
    }

    // correctData에만 있는 학생 추가
    for (const [key, correctStudent] of correctMap.entries()) {
        const exists = answersData.some(s =>
            `${s.classNum}-${s.number}-${s.name}` === key
        );
        if (!exists) {
            answersData.push(correctStudent);
        }
    }

    return answersData;
};

/**
 * 파싱 결과에서 고유 과목 목록 추출
 */
export const extractMarkingSubjectList = (data: ParsedMarkingStudent[]): string[] => {
    const subjectSet = new Set<string>();
    for (const student of data) {
        for (const subjectName of Object.keys(student.subjects)) {
            subjectSet.add(subjectName);
        }
    }
    return [...subjectSet].sort();
};

/**
 * 파일명에서 학년, 월 추출
 * 예: "09 회 - 9월2일 인천시교육청_전체_1학년_전체과목마킹현황 1.csv"
 * → { examGrade: 1, examMonth: 9 }
 */
export const extractMarkingMetaFromFileName = (
    fileName: string
): { examGrade: number; examMonth: number } | null => {
    const gradeMatch = fileName.match(/(\d)학년/);
    const monthMatch = fileName.match(/(\d{1,2})월/) || fileName.match(/^(\d{2})\s*회/);

    if (gradeMatch && monthMatch) {
        return {
            examGrade: parseInt(gradeMatch[1]),
            examMonth: parseInt(monthMatch[1]),
        };
    }
    return null;
};
