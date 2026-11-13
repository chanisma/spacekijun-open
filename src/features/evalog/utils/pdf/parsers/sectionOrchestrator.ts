/**
 * 섹션 오케스트레이터
 * PDF 섹션 감지 및 각 파서 조율 담당
 */

import { PdfSections } from '../../../types/pdfTypes';
import { parseHeader, parsePersonalInfo } from './basicInfoParser';
import { parseAttendance } from './attendanceParser';
import { parseCreativeActivities, parseVolunteerActivities } from './activitiesParser';
import { parseAcademicDevelopment } from './academicParser';
import { parseBehaviorCharacteristics } from './behaviorParser';

/**
 * PDF 섹션 파싱
 */
export function parsePdfSections(text: string): PdfSections {
  const lines = text.split('\n');

  const sectionPatterns = {
    header: /^학교생활세부사항기록부\(학교생활기록부II\)/,
    section1: /^1\.\s*인적·학적사항/,
    attendanceTable: /^학년\s+수업일수/,
    section2: /^2\.\s*출결상황/,
    section5: /^5\.\s*창의적\s*체험\s*활동\s*상황/,
    volunteer: /^봉\s*사\s*활\s*동\s*실\s*적/,
    section6: /^6\.\s*교과학습발달상황/,
    grade1: /^\[1학년\]/,
    grade2: /^\[2학년\]/,
    grade3: /^\[3학년\]/,
    section8: /^8\.\s*행동특성\s*및\s*종합의견/
  };

  const sectionIndices: { [key: string]: number } = {};

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (sectionPatterns.header.test(trimmed)) {
      sectionIndices.header = index;
    } else if (sectionPatterns.section1.test(trimmed)) {
      sectionIndices.section1 = index;
    } else if (sectionPatterns.attendanceTable.test(trimmed)) {
      sectionIndices.attendanceTable = index;
    } else if (sectionPatterns.section2.test(trimmed)) {
      sectionIndices.section2 = index;
    } else if (sectionPatterns.section5.test(trimmed)) {
      sectionIndices.section5 = index;
    } else if (sectionPatterns.volunteer.test(trimmed)) {
      sectionIndices.volunteer = index;
    } else if (sectionPatterns.section6.test(trimmed)) {
      sectionIndices.section6 = index;
    } else if (sectionPatterns.grade1.test(trimmed)) {
      sectionIndices.grade1 = index;
    } else if (sectionPatterns.grade2.test(trimmed)) {
      sectionIndices.grade2 = index;
    } else if (sectionPatterns.grade3.test(trimmed)) {
      sectionIndices.grade3 = index;
    } else if (sectionPatterns.section8.test(trimmed)) {
      sectionIndices.section8 = index;
    }
  });

  const extractSection = (startIdx?: number, endIdx?: number) => {
    if (startIdx === undefined) return '';
    const end = endIdx !== undefined ? endIdx : lines.length;
    return lines.slice(startIdx, end).join('\n').trim();
  };

  const headerRaw = extractSection(sectionIndices.header, sectionIndices.section1);
  const personalInfoRaw = extractSection(sectionIndices.section1, sectionIndices.attendanceTable);
  const attendanceRaw = extractSection(sectionIndices.attendanceTable, sectionIndices.section5);
  const creativeActivitiesRaw = extractSection(sectionIndices.section5, sectionIndices.volunteer);
  const volunteerRaw = extractSection(sectionIndices.volunteer, sectionIndices.section6);

  const grade1Raw = extractSection(sectionIndices.grade1, sectionIndices.grade2);
  const grade2Raw = extractSection(sectionIndices.grade2, sectionIndices.grade3);
  const grade3Raw = extractSection(sectionIndices.grade3, sectionIndices.section8);

  const grade1Academic = grade1Raw ? parseAcademicDevelopment(grade1Raw, 1) : [];
  const grade2Academic = grade2Raw ? parseAcademicDevelopment(grade2Raw, 2) : [];
  const grade3Academic = grade3Raw ? parseAcademicDevelopment(grade3Raw, 3) : [];

  return {
    header: parseHeader(headerRaw),
    section1_personal_info: parsePersonalInfo(personalInfoRaw),
    section2_attendance: parseAttendance(attendanceRaw),
    section5_creative_activities: parseCreativeActivities(creativeActivitiesRaw),
    volunteer_activities: parseVolunteerActivities(volunteerRaw),
    section6_academic_development: [
      ...grade1Academic,
      ...grade2Academic,
      ...grade3Academic
    ],
    section8_behavior_characteristics: parseBehaviorCharacteristics(extractSection(sectionIndices.section8))
  };
}
