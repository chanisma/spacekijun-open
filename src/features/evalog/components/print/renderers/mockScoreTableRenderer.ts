import type { Student } from '../../../types';

function getGradeClass(grade: number | null): string {
  if (grade === null) return '';
  if (grade <= 2) return 'grade-1';
  if (grade <= 4) return 'grade-3';
  if (grade <= 6) return 'grade-5';
  if (grade <= 8) return 'grade-7';
  return 'grade-9';
}

export function renderMockScoreTable(student: Student): string | null {
  const exams = student.mock_result;
  if (!exams || exams.length === 0) return null;

  const sorted = [...exams].sort((a, b) => {
    if (a.academic_year !== b.academic_year) return a.academic_year - b.academic_year;
    if (a.exam_grade !== b.exam_grade) return a.exam_grade - b.exam_grade;
    return a.exam_month - b.exam_month;
  });

  // Collect all subjects
  const allSubjects: string[] = [];
  const subjectSet = new Set<string>();
  sorted.forEach(exam => {
    Object.keys(exam.subjects).forEach(s => {
      if (!subjectSet.has(s)) {
        subjectSet.add(s);
        allSubjects.push(s);
      }
    });
  });

  const headerCells = allSubjects.map(s => `<th style="white-space:nowrap">${s}</th>`).join('');

  const rows = sorted.map(exam => {
    const label = `${exam.academic_year}년 ${exam.exam_grade}학년 ${exam.exam_month}월`;

    // Grade row
    const gradeCells = allSubjects.map(s => {
      const score = exam.subjects[s];
      if (!score || score.grade === null || score.grade === undefined) {
        return '<td><span style="color:#cbd5e1">-</span></td>';
      }
      return `<td><span class="grade-badge ${getGradeClass(score.grade)}">${score.grade}</span></td>`;
    }).join('');

    return `
      <tr>
        <td class="text-left" style="font-weight:600;white-space:nowrap">${label}</td>
        ${gradeCells}
      </tr>
    `;
  }).join('');

  return `
    <div class="print-section">
      <div class="print-section-title">
        <span class="tab-badge">모의고사</span>
        성적 데이터 테이블
      </div>
      <table>
        <thead>
          <tr>
            <th style="text-align:left">시험</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
