import type { Student } from '../../../types';

const SEMESTERS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'];
const CATEGORIES = ['전과목', '국어', '수학', '영어', '사회', '과학', '체육', '기타'];

function gradeToNumber(grade: number | string): number {
  if (typeof grade === 'number') return grade;
  if (grade === 'A') return 1;
  if (grade === 'B') return 2;
  if (grade === 'C') return 3;
  if (grade === 'D') return 4;
  if (grade === 'E') return 5;
  return 0;
}

function matchesCategory(subjectGroup: string, category: string): boolean {
  if (category === '전과목') return true;
  const isSpecialCase = subjectGroup.startsWith('기술') || subjectGroup.includes('제2외국어') ||
    subjectGroup.includes('한문') || subjectGroup === '한국사';
  if (category === '기타') {
    return isSpecialCase || !['국어', '수학', '영어', '사회', '과학', '체육'].some(cat => subjectGroup.includes(cat));
  }
  if (isSpecialCase) return false;
  return subjectGroup.includes(category);
}

export function renderAcademicTable(student: Student): string | null {
  const records = student.section6_academic_development;
  if (!records || records.length === 0) return null;

  const regularSubjects = records
    .filter(s => ['regular', 'pe_arts', 'pe_arts_experiment', 'general'].includes(s.category))
    .map(s => ({
      subject: s.subject,
      category: s.subject_group,
      originalCategory: s.category,
      grade: s.rank || s.achievement || 0,
      semester: `${s.grade}-${s.semester}`,
      units: s.units,
      rank: s.rank,
    }));

  const categoryStats = CATEGORIES.map(category => {
    const subjects = regularSubjects.filter(g => matchesCategory(g.category, category));
    if (subjects.length === 0) return null;

    const subjectsForAvg = subjects.filter(s =>
      s.rank !== null && s.rank !== undefined && s.originalCategory === 'regular'
    );

    let avgGrade = 0;
    if (subjectsForAvg.length > 0) {
      const totalWeighted = subjectsForAvg.reduce((sum, s) => sum + gradeToNumber(s.grade) * s.units, 0);
      const totalUnits = subjectsForAvg.reduce((sum, s) => sum + s.units, 0);
      avgGrade = totalUnits > 0 ? totalWeighted / totalUnits : 0;
    }

    const totalUnits = subjects.reduce((sum, s) => sum + s.units, 0);

    const semesterAvgs = SEMESTERS.map(semester => {
      const semSubjects = subjects.filter(s => s.semester === semester);
      const semForAvg = semSubjects.filter(s =>
        s.rank !== null && s.rank !== undefined && s.originalCategory === 'regular'
      );
      if (semForAvg.length === 0) return '-';
      const wScore = semForAvg.reduce((sum, s) => sum + gradeToNumber(s.grade) * s.units, 0);
      const wUnits = semForAvg.reduce((sum, s) => sum + s.units, 0);
      return wUnits > 0 ? (wScore / wUnits).toFixed(2) : '-';
    });

    return { category, avgGrade: avgGrade.toFixed(2), totalUnits, semesterAvgs };
  }).filter(Boolean) as { category: string; avgGrade: string; totalUnits: number; semesterAvgs: string[] }[];

  if (categoryStats.length === 0) return null;

  const headerCells = SEMESTERS.map(s => `<th>${s}</th>`).join('');
  const rows = categoryStats.map(stat => {
    const isAll = stat.category === '전과목';
    const cls = isAll ? ' class="category-row"' : '';
    const semCells = stat.semesterAvgs.map(a =>
      `<td>${a === '-' ? '<span style="color:#cbd5e1">-</span>' : a}</td>`
    ).join('');
    return `<tr${cls}>
      <td class="text-left" style="font-weight:600">${stat.category}</td>
      <td style="font-weight:700">${stat.avgGrade}</td>
      <td>${stat.totalUnits}</td>
      ${semCells}
    </tr>`;
  }).join('');

  return `
    <div class="print-section">
      <div class="print-section-title">
        <span class="tab-badge">교과성적</span>
        성적현황 [교과]
      </div>
      <table>
        <thead>
          <tr>
            <th style="text-align:left">교과구분</th>
            <th>전체평균</th>
            <th>이수단위</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:8px;color:#94a3b8;margin-top:6px">* 평균 성적은 참고용이며 정확하지 않을 수 있습니다. 정확한 성적은 UNIV 등 공식 시스템을 참고해 주세요.</p>
    </div>
  `;
}
