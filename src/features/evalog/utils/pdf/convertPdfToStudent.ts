import { Student, SubjectGrade } from '../../types';
import { PdfSections, Section6Record } from '../../types/pdfTypes';

/**
 * Section6Record를 SubjectGrade로 변환
 */

/**
 * Section6Record를 SubjectGrade로 변환
 */
function convertSection6ToSubjectGrade(record: Section6Record): SubjectGrade {
  // 학기 형식 변환 (grade: 1, semester: 1 => '1-1')
  const semesterStr = `${record.grade}-${record.semester}` as '1-1' | '1-2' | '2-1' | '2-2' | '3-1' | '3-2';

  // 과목 유형 결정
  let subjectType: '공통과목' | '일반선택' | '진로선택' | '융합선택' | undefined;
  if (record.category === 'regular') {
    // 일반 과목은 과목명이나 학년으로 판단 (간단하게 처리)
    subjectType = record.grade === 1 ? '공통과목' : '일반선택';
  } else if (record.category === 'career') {
    subjectType = '진로선택';
  }

  // 등급 결정: 성취도(A/B/C)가 있으면 그것을 사용, 없으면 등수(rank) 사용
  const gradeValue: number | string = record.achievement || record.rank || 0;

  return {
    subject: record.subject,
    category: record.subject_group as any, // subject_group을 category로 매핑
    subjectType,
    semester: semesterStr,
    grade: gradeValue,
    units: record.units || 0, // null인 경우 0으로 처리
    achievement: record.achievement || undefined,
    remarks: record.content, // content를 remarks로 매핑
    rawScore: record.score || undefined,
    classAverage: record.average || undefined,
    totalStudents: record.students || undefined,
    achievementDistribution: record.distribution
      ? `A(${record.distribution.A}) B(${record.distribution.B}) C(${record.distribution.C})`
      : undefined,
  };
}

/**
 * PDF 파싱 결과를 Student 객체로 변환
 * 단계별로 구현 예정
 */
export function convertPdfToStudent(pdfData: PdfSections, studentId?: string): Student {
  // section1_personal_info_raw에서 고등학교명과 입학년도 추출
  const rawText = (pdfData as any).section1_personal_info_raw || '';
  const schoolMatch = rawText.match(/([가-힣]+고등학교)\s*제1학년\s*입학/);
  const highSchoolName = schoolMatch ? schoolMatch[1] : '샘플고등학교';

  // 입학년도 추출 (section1_personal_info.admissionYear 사용)
  const admissionYear = (pdfData.section1_personal_info as any).admissionYear || null;

  // section6_academic_development를 subjectGrades로 변환
  const subjectGrades = pdfData.section6_academic_development?.map(record =>
    convertSection6ToSubjectGrade(record)
  ) || [];

  // 학번 (studentNo) 생성: header.gradeInfo의 마지막 데이터 사용
  // format: {grade}{class}{number} (e.g., 30512)
  let studentNo = '';
  if (pdfData.header?.gradeInfo && Array.isArray(pdfData.header.gradeInfo) && pdfData.header.gradeInfo.length > 0) {
    const lastInfo = pdfData.header.gradeInfo[pdfData.header.gradeInfo.length - 1];
    if (lastInfo.grade && lastInfo.class && lastInfo.number) {
      studentNo = `${lastInfo.grade}${String(lastInfo.class).padStart(2, '0')}${String(lastInfo.number).padStart(2, '0')}`;
    }
  }

  // 기본 Student 객체 생성
  const student: Student = {
    // 기본 필수 필드
    id: studentId || `pdf-${Date.now()}`,
    studentNo: studentNo, // header.gradeInfo에서 추출한 학번
    name: pdfData.section1_personal_info.name,
    // schoolCurriculum: getSchoolCurriculum(highSchoolName, admissionYear), // Removed
    status: '미평가',
    totalScore: null,
    majorScore: null,
    attendance: '대기중',
    profileImage: null,
    // evaluationStatus removed

    // Flattened structure directly from pdfData
    header: pdfData.header,
    section1_personal_info: pdfData.section1_personal_info,
    section2_attendance: pdfData.section2_attendance,
    section5_creative_activities: pdfData.section5_creative_activities,
    volunteer_activities: pdfData.volunteer_activities,
    section6_academic_development: pdfData.section6_academic_development,
    section8_behavior_characteristics: pdfData.section8_behavior_characteristics,

    // 메타데이터
    uploadedAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  };

  return student;
}
