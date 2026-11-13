import { GradeHistory, AcademicRecord, ReadingRecord } from './pdfTypes';

export interface StudentBasicInfo {
    id: string;
    studentId?: string;
    name: string;
    student_no: string;
    grade: number;
    classNum: number;
    section1_personal_info?: any;
    gradeInfo?: GradeHistory[];
    attendance?: any;
    volunteer?: any;
    reading?: ReadingRecord[];
    academic_development?: AcademicRecord[];
    source: string;
}

export interface StudentActivity {
    id: string;
    studentId?: string;
    name: string;
    category: string;
    subject_name?: string;
    content: string;
    grade: number;
    semester?: number;
    source: string;
    year?: number;
    classNum?: number;
    studentNo?: string;
    data?: any;
}

export interface ParserMeta {
    fileName: string;
    parserType: string;
    recordCount: number;
    studentCount: number;
}

export interface ParsedData {
    basicInfo: StudentBasicInfo[];
    detailedActivities: StudentActivity[];
    parserMeta: ParserMeta[];
}
