/**
 * 활동상황 파서
 * Section 5 (창의적 체험활동) 및 봉사활동 파싱 담당
 */

import { Section5Record, VolunteerRecord } from '../../../types/pdfTypes';

/**
 * Creative Activities 섹션 파싱
 */
export function parseCreativeActivities(activitiesText: string): Section5Record[] {
  const records: Section5Record[] = [];
  const lines = activitiesText.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(l => l);

  console.log('📄 [Section5] 총 라인 수:', lines.length);

  let currentGrade: number | null = null;
  let currentActivity: Section5Record | null = null;
  let contentLines: string[] = [];

  // 패턴 뒤에 추가 텍스트(" 임", " ." 등)를 허용하도록 $ 제거
  const activityPattern = /^(자율활동|동아리활동|봉사활동|진로활동)\s+(\d+)/;
  const gradeActivityPattern = /^([123])\s+(자율활동|동아리활동|봉사활동|진로활동)\s+(\d+)/;
  const gradePattern = /^[123]$/;
  const fieldPattern = /^희망분야\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 동아리 관련 라인 모두 로깅
    if (line.includes('동아리')) {
      console.log(`🔍 [Line ${i}] "${line}"`);
      console.log(`   currentGrade=${currentGrade}, currentActivity=${currentActivity ? 'exists' : 'null'}`);
    }

    if (line.includes('창의적 체험활동상황') || line.includes('창 의 적 체 험 활 동 상 황') ||
      line === '학년' || line === '영역' || line === '시간' || line === '특기사항' ||
      (line.includes('영역') && line.includes('시간') && line.includes('특기사항'))) {
      continue;
    }

    // [New Fix] 봉사활동 실적 헤더가 나오면 파싱 종료 (다음 섹션으로 넘어감)
    if (line.includes('봉 사 활 동 실 적') || line.includes('봉사활동실적')) {
      console.log(`🛑 봉사활동 헤더 발견: "${line}" -> 파싱 종료`);
      break;
    }

    const gradeActivityMatch = line.match(gradeActivityPattern);
    if (gradeActivityMatch) {
      console.log(`✅ gradeActivityPattern 매치! grade=${gradeActivityMatch[1]}, type=${gradeActivityMatch[2]}, hours=${gradeActivityMatch[3]}`);

      if (currentActivity && contentLines.length > 0) {
        currentActivity.content = contentLines.join(' ').trim();
        console.log(`  📝 이전 레코드 content 저장: ${currentActivity.content.substring(0, 50)}...`);
        contentLines = [];
      }

      currentGrade = parseInt(gradeActivityMatch[1]);
      currentActivity = {
        grade: currentGrade,
        type: gradeActivityMatch[2] as '자율활동' | '동아리활동' | '진로활동' | '봉사활동',
        hours: parseInt(gradeActivityMatch[3]),
        field: null,
        content: ''
      };
      records.push(currentActivity);
      console.log(`  ➕ 새 레코드 생성 및 추가 (현재 records 길이: ${records.length})`);

      // 패턴 매치 후 남은 텍스트를 content로 추가
      const remainingText = line.substring(gradeActivityMatch[0].length).trim();
      if (remainingText) {
        contentLines.push(remainingText);
        console.log(`  📎 남은 텍스트 추가: "${remainingText}"`);
      }
      continue;
    }

    if (gradePattern.test(line) && !currentActivity) {
      console.log(`📌 학년 패턴 매치 (activity 없음): "${line}"`);
      currentGrade = parseInt(line);
      continue;
    }

    if (gradePattern.test(line) && currentActivity) {
      console.log(`📌 학년 패턴 매치 (activity 있음): "${line}" → 이전 activity 종료`);
      if (contentLines.length > 0) {
        currentActivity.content = contentLines.join(' ').trim();
        console.log(`  📝 content 저장: ${currentActivity.content.substring(0, 50)}...`);
        contentLines = [];
      }
      currentGrade = parseInt(line);
      currentActivity = null;
      continue;
    }

    const activityMatch = line.match(activityPattern);
    if (activityMatch) {
      console.log(`✅ activityPattern 매치! type=${activityMatch[1]}, hours=${activityMatch[2]}, currentGrade=${currentGrade}`);

      if (currentActivity && contentLines.length > 0) {
        currentActivity.content = contentLines.join(' ').trim();
        console.log(`  📝 이전 레코드 content 저장: ${currentActivity.content.substring(0, 50)}...`);
        contentLines = [];
      }

      currentActivity = {
        grade: currentGrade!,
        type: activityMatch[1] as '자율활동' | '동아리활동' | '진로활동' | '봉사활동',
        hours: parseInt(activityMatch[2]),
        field: null,
        content: ''
      };
      records.push(currentActivity);
      console.log(`  ➕ 새 레코드 생성 및 추가 (현재 records 길이: ${records.length})`);

      // 패턴 매치 후 남은 텍스트를 content로 추가 (예: "동아리활동 20 임." → " 임.")
      const remainingText = line.substring(activityMatch[0].length).trim();
      if (remainingText) {
        contentLines.push(remainingText);
        console.log(`  📎 남은 텍스트 추가: "${remainingText}"`);
      }
      continue;
    }

    const fieldMatch = line.match(fieldPattern);
    if (fieldMatch && currentActivity) {
      currentActivity.field = fieldMatch[1];
      continue;
    }

    if (currentActivity) {
      contentLines.push(line);
    }
  }

  if (currentActivity && contentLines.length > 0) {
    currentActivity.content = contentLines.join(' ').trim();
  }

  records.forEach(record => {
    record.content = record.content.replace(/창\s*의\s*적\s*체\s*험\s*활\s*동\s*상\s*황/g, '').trim();
  });

  console.log('🔍 [Section5] 병합 전 레코드 수:', records.length);
  records.forEach((record, idx) => {
    console.log(`  [${idx}] grade=${record.grade}, type="${record.type}", hours=${record.hours}, content 길이=${record.content.length}`);
  });

  const recordMap = new Map<string, Section5Record>();

  for (const record of records) {
    const key = `${record.grade}-${record.type}-${record.hours}`;
    console.log(`🔑 생성된 키: "${key}"`);

    if (recordMap.has(key)) {
      console.log(`  ✅ 병합! 기존 레코드에 추가`);
      const existing = recordMap.get(key)!;
      existing.content = existing.content + ' ' + record.content;
      if (record.field && !existing.field) {
        existing.field = record.field;
      }
    } else {
      console.log(`  ➕ 새 레코드 추가`);
      recordMap.set(key, {
        grade: record.grade,
        type: record.type,
        hours: record.hours,
        field: record.field,
        content: record.content
      });
    }
  }

  const mergedRecords: Section5Record[] = [];
  for (const record of recordMap.values()) {
    record.content = record.content.trim();
    mergedRecords.push(record);
  }

  console.log('✅ [Section5] 병합 후 레코드 수:', mergedRecords.length);
  mergedRecords.forEach((record, idx) => {
    console.log(`  [${idx}] grade=${record.grade}, type="${record.type}", hours=${record.hours}, content 길이=${record.content.length}`);
  });

  return mergedRecords;
}

/**
 * Volunteer Activities 섹션 파싱
 */
export function parseVolunteerActivities(volunteerText: string): VolunteerRecord[] {
  const records: VolunteerRecord[] = [];
  const lines = volunteerText.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(l => l);

  let currentGrade: number | null = null;
  let currentRecord: VolunteerRecord | null = null;
  let contentLines: string[] = [];

  const gradePattern = /^[123]$/;
  const datePattern = /^(\d{4}\.\d{2}\.\d{2}\.)\s+(.+)$/;
  const periodPattern = /^(\d{4}\.\d{2}\.\d{2}\.\s*-\s*\d{4}\.\d{2}\.\d{2}\.)\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('봉 사 활 동 실 적') || line.includes('일자 또는 기간') ||
      line.includes('장소 또는 주관기관명') || line.includes('활동내용')) {
      continue;
    }

    if (gradePattern.test(line)) {
      if (currentRecord && contentLines.length > 0) {
        currentRecord.activity = contentLines.join(' ').trim();
        contentLines = [];
      }
      currentGrade = parseInt(line);
      currentRecord = null;
      continue;
    }

    const periodMatch = line.match(periodPattern);
    const dateMatch = line.match(datePattern);

    if (periodMatch || dateMatch) {
      if (currentRecord && contentLines.length > 0) {
        currentRecord.activity = contentLines.join(' ').trim();
        contentLines = [];
      }

      const dateOrPeriod = periodMatch ? periodMatch[1] : dateMatch![1];
      const rest = periodMatch ? periodMatch[2] : dateMatch![2];

      const parts = rest.split(/\s+/);
      let institution = '';
      let activity = '';
      let hours: number | null = null;
      let cumulativeHours: number | null = null;

      let idx = 0;
      if (parts[idx] && parts[idx].includes('(학교)')) {
        institution = parts[idx];
        idx++;
      }

      if (parts.length >= idx + 2) {
        const lastPart = parts[parts.length - 1];
        const secondLastPart = parts[parts.length - 2];

        if (/^\d+$/.test(lastPart) && /^\d+$/.test(secondLastPart)) {
          cumulativeHours = parseInt(lastPart);
          hours = parseInt(secondLastPart);
          activity = parts.slice(idx, parts.length - 2).join(' ');
        } else {
          activity = parts.slice(idx).join(' ');
        }
      } else {
        activity = parts.slice(idx).join(' ');
      }

      currentRecord = {
        grade: currentGrade!,
        dateOrPeriod: dateOrPeriod,
        institution: institution,
        activity: activity,
        hours: hours,
        cumulativeHours: cumulativeHours
      };
      records.push(currentRecord);

      if (!hours) {
        contentLines = activity ? [activity] : [];
      }
    } else if (currentRecord) {
      const parts = line.split(/\s+/);

      if (parts.length === 1 && /^\d+$/.test(parts[0])) {
        currentRecord.cumulativeHours = parseInt(parts[0]);
        currentRecord.activity = contentLines.join(' ').trim();
        contentLines = [];
      }
      else if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1]) && /^\d+$/.test(parts[parts.length - 2])) {
        currentRecord.cumulativeHours = parseInt(parts[parts.length - 1]);
        currentRecord.hours = parseInt(parts[parts.length - 2]);
        contentLines.push(parts.slice(0, parts.length - 2).join(' '));
        currentRecord.activity = contentLines.join(' ').trim();
        contentLines = [];
      } else {
        contentLines.push(line);
      }
    }
  }

  if (currentRecord && contentLines.length > 0) {
    currentRecord.activity = contentLines.join(' ').trim();
  }

  return records;
}
