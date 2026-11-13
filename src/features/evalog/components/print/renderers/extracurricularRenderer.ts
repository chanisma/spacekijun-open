import type { Student } from '../../../types';

// ─── 출결상황 ───
export function renderAttendance(student: Student): string | null {
  const data = student.section2_attendance;
  if (!data || data.length === 0) return null;

  const rows = (data as any[]).map(r => {
    const absence = r.absence || {};
    const tardiness = r.tardiness || {};
    const earlyLeave = r.earlyLeave || {};
    const classSkip = r.classSkip || {};

    return `<tr>
      <td style="font-weight:600">${r.grade}학년</td>
      <td>${r.schoolDays || '-'}</td>
      <td>${absence.disease ?? r.absenceDays ?? 0}</td>
      <td>${absence.unapproved ?? 0}</td>
      <td>${absence.other ?? 0}</td>
      <td>${tardiness.disease ?? r.late ?? 0}</td>
      <td>${tardiness.unapproved ?? 0}</td>
      <td>${tardiness.other ?? 0}</td>
      <td>${earlyLeave.disease ?? 0}</td>
      <td>${earlyLeave.unapproved ?? 0}</td>
      <td>${earlyLeave.other ?? 0}</td>
      <td>${classSkip.disease ?? 0}</td>
      <td>${classSkip.unapproved ?? 0}</td>
      <td>${classSkip.other ?? 0}</td>
      <td class="text-left">${r.notes || r.note || ''}</td>
    </tr>`;
  }).join('');

  return `
    <div class="print-section">
      <div class="print-section-title"><span class="tab-badge">비교과</span>출결상황</div>
      <table style="font-size:9px">
        <thead>
          <tr>
            <th rowspan="2">학년</th>
            <th rowspan="2">수업일수</th>
            <th colspan="3" style="border-left:1px solid #e2e8f0">결석</th>
            <th colspan="3" style="border-left:1px solid #e2e8f0">지각</th>
            <th colspan="3" style="border-left:1px solid #e2e8f0">조퇴</th>
            <th colspan="3" style="border-left:1px solid #e2e8f0">결과</th>
            <th rowspan="2" style="border-left:1px solid #e2e8f0">특기사항</th>
          </tr>
          <tr>
            <th style="border-left:1px solid #e2e8f0;font-weight:400;color:#94a3b8">질병</th>
            <th style="font-weight:400;color:#94a3b8">미인정</th>
            <th style="font-weight:400;color:#94a3b8">기타</th>
            <th style="border-left:1px solid #e2e8f0;font-weight:400;color:#94a3b8">질병</th>
            <th style="font-weight:400;color:#94a3b8">미인정</th>
            <th style="font-weight:400;color:#94a3b8">기타</th>
            <th style="border-left:1px solid #e2e8f0;font-weight:400;color:#94a3b8">질병</th>
            <th style="font-weight:400;color:#94a3b8">미인정</th>
            <th style="font-weight:400;color:#94a3b8">기타</th>
            <th style="border-left:1px solid #e2e8f0;font-weight:400;color:#94a3b8">질병</th>
            <th style="font-weight:400;color:#94a3b8">미인정</th>
            <th style="font-weight:400;color:#94a3b8">기타</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
