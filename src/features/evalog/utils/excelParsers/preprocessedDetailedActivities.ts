import { norm, constructStudentId } from './utils';
import { StudentActivity } from '../../types/excelTypes';

/**
 * 전처리된 세부능력및특기사항 파일을 파싱합니다.
 *
 * 파일 형식:
 * - 헤더: 반, 학년, 학기, 번호, 성명, 과목, 내용
 * - 각 행이 완전한 레코드 (학생-학기-과목 단위)
 *
 * 파일명 패턴: Grade{N}_Class{N}_세부능력및특기사항*_preprocessed.xlsx
 */
export const parsePreprocessedDetailedActivities = (
    data: any[],
    fileName: string
): StudentActivity[] => {
    const result: StudentActivity[] = [];

    if (!data || data.length < 2) return result;

    // 헤더 행 찾기 (첫 번째 행이 헤더라고 가정)
    const headerRow = data[0] as string[];
    if (!headerRow) return result;

    // 컬럼 인덱스 찾기
    const findIdx = (keywords: string[]) => {
        return headerRow.findIndex(c =>
            keywords.some(k => norm(String(c || '')).includes(k))
        );
    };

    const classIdx = findIdx(['반']);
    const gradeIdx = findIdx(['학년']);
    const semesterIdx = findIdx(['학기']);
    const numIdx = findIdx(['번호']);
    const nameIdx = findIdx(['성명', '이름']);
    const subjectIdx = findIdx(['과목']);
    const contentIdx = findIdx(['내용', '특기사항']);

    // 필수 컬럼 확인
    if (gradeIdx === -1 || numIdx === -1 || subjectIdx === -1 || contentIdx === -1) {
        console.warn(`[PreprocessedParser] Missing required columns in ${fileName}`);
        console.warn(`  Found: grade=${gradeIdx}, num=${numIdx}, subject=${subjectIdx}, content=${contentIdx}`);
        return result;
    }

    // 파일명에서 학년/반 정보 추출 (폴백용)
    let fileGrade = 1;
    let fileClass = 1;
    const filenameMatch = fileName.match(/Grade(\d+)_Class(\d+)/);
    if (filenameMatch) {
        fileGrade = parseInt(filenameMatch[1]);
        fileClass = parseInt(filenameMatch[2]);
    }

    // 현재 연도 계산 (입학년도 계산용)
    const currentYear = new Date().getFullYear();

    // 데이터 행 파싱
    for (let i = 1; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || row.length === 0) continue;

        // 값 추출
        const classNum = classIdx !== -1 ? parseInt(String(row[classIdx] || fileClass)) : fileClass;
        const grade = gradeIdx !== -1 ? parseInt(String(row[gradeIdx] || fileGrade)) : fileGrade;
        const semester = semesterIdx !== -1 ? parseInt(String(row[semesterIdx] || 1)) : undefined;
        const studentNo = String(row[numIdx] || '').trim();
        const name = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
        const subject = String(row[subjectIdx] || '').trim();
        const content = String(row[contentIdx] || '').trim();

        // 유효성 검사
        if (!studentNo || !subject || !content) continue;
        const num = parseInt(studentNo.replace(/[^0-9]/g, ''));
        if (isNaN(num) || num === 0) continue;

        // 학생 ID 구성 (입학년도-1학년반번호)
        // 입학년도 = 현재연도 - 학년 + 1
        const entryYear = (currentYear - grade + 1) % 100;
        const idBody = `1${String(classNum).padStart(2, '0')}${String(num).padStart(2, '0')}`;
        const id = `${entryYear}-${idBody}`;

        result.push({
            id,
            studentId: id,
            name,
            category: 'regular', // 기본값, 나중에 academic_development와 매칭 시 업데이트
            subject_name: subject,
            content,
            grade,
            semester,
            year: currentYear,
            source: fileName,
            classNum,
            studentNo
        });
    }

    console.log(`[PreprocessedParser] Parsed ${result.length} activities from ${fileName}`);
    return result;
};

/**
 * 파일명이 전처리된 형식인지 확인
 */
export const isPreprocessedFile = (fileName: string): boolean => {
    return fileName.includes('_preprocessed') || fileName.includes('_js_preprocessed');
};
