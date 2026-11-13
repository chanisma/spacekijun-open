import { SchoolCurriculum } from './curriculum';
import {
    HeaderInfo,
    Section1PersonalInfo,
    Section2Record,
    Section5Record,
    VolunteerRecord,
    Section6Record,
    Section8Record,
    ReadingRecord
} from './pdfTypes';

// 교과 성적 타입
export interface SubjectGrade {
    subject: string; // 과목명
    category: '국어' | '수학' | '영어' | '사회' | '과학' | '체육' | '예술' | '기술·가정' | '제2외국어' | '한문' | '교양';
    subjectType?: '공통과목' | '일반선택' | '진로선택' | '융합선택'; // 과목 유형
    semester: '1-1' | '1-2' | '2-1' | '2-2' | '3-1' | '3-2'; // 이수 학기
    grade: number | string; // 등급 (진로선택은 A/B/C)
    units: number; // 이수단위
    achievement?: string; // 성취도 (진로선택 과목의 경우)
    remarks: string; // 세부능력 및 특기사항
    // 진로선택 과목 추가 정보
    rawScore?: number; // 원점수
    classAverage?: number; // 과목평균
    totalStudents?: number; // 수강자수
    achievementDistribution?: string; // 성취도별 분포 (예: "A(90.5) B(9.1) C(0.4)")
}

// 비교과 활동 타입
export interface ExtracurricularActivity {
    grade: 1 | 2 | 3; // 학년
    semester: 1 | 2; // 학기
    category: '자율활동' | '동아리활동' | '진로활동';
    content: string; // 활동 내용
}

// 봉사활동 타입
export interface VolunteerActivity {
    grade: 1 | 2 | 3; // 학년
    dateOrPeriod: string; // 일자 또는 기간 (예: 20230315 또는 20230313-20230630)
    content: string; // 활동 내용
    hours: number; // 시간
}

// 행동특성 및 종합의견
export interface BehaviorRecord {
    grade: 1 | 2 | 3;
    semester?: 1 | 2; // 선택적 필드로 변경
    content: string;
}

// 모의고사 과목별 점수
export interface MockExamSubjectScore {
    raw_score: number | null;
    standard_score: number | null;
    percentile: number | null;
    grade: number | null; // 등급 (1~9)
}

// 모의고사 결과
export interface MockExamResult {
    academic_year: number;   // 2024, 2025
    exam_grade: number;      // 시험 당시 학년 (1, 2, 3)
    exam_month: number;      // 3, 6, 9, 11
    subjects: {
        [subjectName: string]: MockExamSubjectScore;
    };
}

// 모의고사 마킹 과목별 데이터
export interface MockMarkingSubject {
    answers: (number | null)[];    // 학생 선택 답 [4, 4, 2, 5, ...] (주관식도 정수)
    correct: (boolean | null)[];   // 정오 [true, false, true, ...]
    item_count: number;            // 실제 문항 수 (빈칸 제외)
}

// 모의고사 마킹 엔트리
export interface MockMarkingEntry {
    academic_year: number;   // 2025
    exam_grade: number;      // 시험 당시 학년 (1, 2, 3)
    exam_month: number;      // 3, 6, 9, 11
    subjects: {
        [subjectName: string]: MockMarkingSubject;
    };
}

// 학적사항 타입
export interface AcademicStatusHistory {
    date: string; // 학적변동일
    description: string; // 학적사항
}

// 출결상황 타입
export interface AttendanceRecord {
    grade: 1 | 2 | 3; // 학년
    schoolDays: number; // 수업일수
    absenceDays?: number; // 결석일수
    late?: number; // 지각
    earlyLeave?: number; // 조퇴
    absence?: number; // 결과
    note?: string; // 특기사항
}

// 학생 정보 타입
export interface Student {
    id: string;
    studentId?: string; // Resource table meta.id mapping
    studentNo: string; // 현재 학번
    name: string;
    grade?: number; // 학년
    classNum?: number; // 반
    number?: number; // 번호 (반 내 순번)
    // department, ipsiType, ipsiUnit, schoolName removed
    // department, ipsiType, ipsiUnit, schoolName, schoolCurriculum removed
    status: '평가중' | '평가완료' | '미평가';
    totalScore: number | null;
    majorScore: number | null;
    attendance: '출석' | '대기중' | '퇴실' | '공실';
    profileImage: string | null;
    // evaluationStatus removed
    // 학생부 상세 정보
    // 학생부 상세 정보
    // Flattened PDF Data
    header?: HeaderInfo;
    section1_personal_info?: Section1PersonalInfo;
    section2_attendance?: Section2Record[];
    section5_creative_activities?: Section5Record[];
    volunteer_activities?: VolunteerRecord[];
    section6_academic_development?: Section6Record[];
    section8_behavior_characteristics?: Section8Record[];

    mock_result?: MockExamResult[]; // 모의고사 성적 데이터
    reading?: ReadingRecord[]; // 독서활동 데이터

    rawText?: string; // PDF에서 추출한 원본 텍스트
    originalText?: string; // 정규화 전 원본 텍스트 데이터 (디버깅용)
    // 메타데이터 (PDF 업로드 관련)
    uploadedAt?: string; // 최초 업로드 시간
    lastModified?: string; // 마지막 수정 시간
    pdfFile?: File | null; // 원본 PDF 파일
}
