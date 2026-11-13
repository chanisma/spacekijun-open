import type { Student } from '../../../types';

export function renderCareerTable(student: Student): string | null {
  const records = student.section6_academic_development;
  if (!records) return null;

  const careerSubjects = records
    .filter(s => s.category === 'career')
    .map(s => ({
      subject: s.subject,
      category: s.subject_group,
      semester: `${s.grade}-${s.semester}`,
      grade: s.grade,
      semesterNum: s.semester,
      units: s.units,
      rawScore: s.score,
      classAverage: s.average,
      achievement: s.achievement,
      totalStudents: s.students,
      distribution: s.distribution
        ? `A(${s.distribution.A || 0}) B(${s.distribution.B || 0}) C(${s.distribution.C || 0})`
        : '-',
    }));

  if (careerSubjects.length === 0) return null;

  // Sort by grade, then category, then semester
  careerSubjects.sort((a, b) => {
    if (a.grade !== b.grade) return a.grade - b.grade;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.semesterNum - b.semesterNum;
  });

  const rows = careerSubjects.map(s => {
    const achClass = s.achievement === 'A' ? 'achievement-A' :
      s.achievement === 'B' ? 'achievement-B' :
      s.achievement === 'C' ? 'achievement-C' : '';

    return `<tr>
      <td>${s.grade}</td>
      <td>${s.semesterNum}</td>
      <td>${s.category}</td>
      <td class="text-left" style="font-weight:600">${s.subject}</td>
      <td>${s.units}</td>
      <td>${s.rawScore && s.classAverage ? `${s.rawScore}/${s.classAverage}` : '-'}</td>
      <td>${s.achievement ? `<span class="grade-badge ${achClass}">${s.achievement}</span> (${s.totalStudents})` : '-'}</td>
      <td style="font-size:9px">${s.distribution}</td>
    </tr>`;
  }).join('');

  return `
    <div class="print-section">
      <div class="print-section-title">
        <span class="tab-badge">교과성적</span>
        진로선택 과목
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:40px">학년</th>
            <th style="width:40px">학기</th>
            <th>교과</th>
            <th style="text-align:left">과목</th>
            <th style="width:40px">단위</th>
            <th>원점수/평균</th>
            <th>성취도(수강자)</th>
            <th>분포 비율</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export function renderCareerAchievement(student: Student): string | null {
  const records = student.section6_academic_development;
  if (!records) return null;

  const careerSubjects = records
    .filter(s => s.category === 'career')
    .map(s => ({
      category: s.subject_group,
      achievement: s.achievement,
      subject: s.subject,
      units: s.units,
      semester: `${s.grade}-${s.semester}`,
    }));

  if (careerSubjects.length === 0) return null;

  // Group by category
  const categoryGroups: Record<string, typeof careerSubjects> = {};
  careerSubjects.forEach(s => {
    if (!categoryGroups[s.category]) categoryGroups[s.category] = [];
    categoryGroups[s.category].push(s);
  });

  const gradeStats: Record<string, { A: typeof careerSubjects; B: typeof careerSubjects; C: typeof careerSubjects; total: number }> = {};
  Object.entries(categoryGroups).forEach(([cat, subjects]) => {
    gradeStats[cat] = { A: [], B: [], C: [], total: 0 };
    subjects.forEach(s => {
      if (s.achievement === 'A') gradeStats[cat].A.push(s);
      else if (s.achievement === 'B') gradeStats[cat].B.push(s);
      else if (s.achievement === 'C') gradeStats[cat].C.push(s);
      gradeStats[cat].total += s.units;
    });
  });

  let totalA = 0, totalB = 0, totalC = 0, totalUnits = 0;
  let countA = 0, countB = 0, countC = 0;
  Object.values(gradeStats).forEach(stat => {
    countA += stat.A.length; countB += stat.B.length; countC += stat.C.length;
    totalA += stat.A.reduce((s, x) => s + x.units, 0);
    totalB += stat.B.reduce((s, x) => s + x.units, 0);
    totalC += stat.C.reduce((s, x) => s + x.units, 0);
    totalUnits += stat.total;
  });

  const formatList = (items: typeof careerSubjects) =>
    items.map(s => `${s.semester} ${s.subject}(${s.units})`).join(', ') || '-';

  const rows = Object.entries(gradeStats).map(([cat, stat]) =>
    `<tr>
      <td class="text-left" style="font-weight:600">${cat}</td>
      <td class="text-left" style="color:#065f46">${formatList(stat.A)}</td>
      <td class="text-left" style="color:#1e40af">${formatList(stat.B)}</td>
      <td class="text-left" style="color:#92400e">${formatList(stat.C)}</td>
      <td style="font-weight:700">${stat.total}</td>
    </tr>`
  ).join('');

  return `
    <div class="print-section">
      <div class="print-section-title">
        <span class="tab-badge">교과성적</span>
        진로선택 과목 성취도별 통계
      </div>
      <table>
        <thead>
          <tr>
            <th style="text-align:left">교과(군)</th>
            <th style="text-align:left">A등급</th>
            <th style="text-align:left">B등급</th>
            <th style="text-align:left">C등급</th>
            <th>총 이수단위</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td class="text-left">합계</td>
            <td style="color:#065f46">${countA}과목 (${totalA})</td>
            <td style="color:#1e40af">${countB}과목 (${totalB})</td>
            <td style="color:#92400e">${countC}과목 (${totalC})</td>
            <td style="font-weight:900">총 ${countA + countB + countC}과목 (${totalUnits})</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}
