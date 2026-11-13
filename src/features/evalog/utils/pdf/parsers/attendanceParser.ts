/**
 * 출결상황 파서
 * Section 2 (출결상황) 파싱 담당
 */

import { Section2Record } from '../../../types/pdfTypes';

/**
 * Attendance 섹션 파싱
 */
export function parseAttendance(attendanceText: string): Section2Record[] {
  const records: Section2Record[] = [];
  const lines = attendanceText.split('\n');

  for (const line of lines) {
    const cleanLine = line.replace(/\r/g, '').trim();
    const gradeMatch = cleanLine.match(/^(\d+)\s+(\d+)\s+([\.\d\s]+)(.*)$/);

    if (gradeMatch) {
      const grade = parseInt(gradeMatch[1]);
      const schoolDays = parseInt(gradeMatch[2]);
      const valuesStr = gradeMatch[3].trim();
      const notes = gradeMatch[4].trim();

      const values = valuesStr.split(/\s+/).map(v => v === '.' ? 0 : parseInt(v) || 0);

      while (values.length < 12) {
        values.push(0);
      }

      records.push({
        grade: grade,
        schoolDays: schoolDays,
        absence: {
          disease: values[0],
          unapproved: values[1],
          other: values[2]
        },
        tardiness: {
          disease: values[3],
          unapproved: values[4],
          other: values[5]
        },
        earlyLeave: {
          disease: values[6],
          unapproved: values[7],
          other: values[8]
        },
        classSkip: {
          disease: values[9],
          unapproved: values[10],
          other: values[11]
        },
        notes: notes
      });
    }
  }

  return records;
}
