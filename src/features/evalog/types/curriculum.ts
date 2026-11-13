// 학교 교육과정 과목 타입
export interface SchoolCurriculumSubject {
    category: string; // 교과(군)
    subject: string; // 과목명
    subjectType: '공통 과목' | '일반 선택' | '진로 선택' | '융합 선택'; // 과목 유형
    selectionGroup: string; // 선택 그룹 (지정, 선택1, 선택2, ...)
    isMinority?: boolean; // 소수 선택 과목 여부
    isShared?: boolean; // 공동 교육과정 여부
    isSpecial?: boolean; // 교과 특성화 여부
    credits: number; // 기준 학점
    semesters: {
        '1-1'?: number;
        '1-2'?: number;
        '2-1'?: number;
        '2-2'?: number;
        '3-1'?: number;
        '3-2'?: number;
    };
    totalCredits: number; // 운영 학점
    minCredits: number; // 최소 이수 학점
}

// 학교 교육과정 타입
export interface SchoolCurriculum {
    schoolName: string;
    academicYear: number; // 학년도
    subjects: SchoolCurriculumSubject[];
}
