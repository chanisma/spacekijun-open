/**
 * 교과학습 파서
 * Section 6 (교과학습발달상황) 파싱 담당
 */

import { Section6Record } from '../../../types/pdfTypes';
import { joinContentLines } from './textProcessor';

/**
 * 과목 세부사항 추출 (세부능력 및 특기사항)
 */
export function extractSubjectDetails(sectionText: string, knownSubjects: Set<string> = new Set()) {
  const details: { [key: string]: string } = {};
  const lines = sectionText.split('\n');

  let currentSubject: string | null = null;
  let contentLines: string[] = [];
  let unmatchedContent: string[] = [];
  let foundEmptyLineAfterSubject = false;

  // 과목명 유효성 검사 헬퍼
  const isSubjectCandidate = (name: string): boolean => {
    const possibleSubject = name.trim();
    const hasSemesterPrefix = /^\(([12])학기\)/.test(possibleSubject);

    let subjectName = possibleSubject;
    const semesterPrefixMatch = possibleSubject.match(/^\(([12])학기\)(.+)$/);
    if (semesterPrefixMatch) {
      subjectName = semesterPrefixMatch[2].trim();
    }

    let isKnownSubject = knownSubjects.has(subjectName);

    if (!isKnownSubject && knownSubjects.size > 0) {
      const normalizedSubject = subjectName.replace(/\s+/g, '').replace(/[Ⅰ-Ⅹ]/g, '');

      for (const known of knownSubjects) {
        const normalizedKnown = known.replace(/\s+/g, '').replace(/[Ⅰ-Ⅹ]/g, '');

        if (normalizedSubject === normalizedKnown) {
          isKnownSubject = true;
          break;
        }

        if (normalizedSubject.length >= 3 && normalizedKnown.length >= 3) {
          if (normalizedKnown.startsWith(normalizedSubject) ||
            normalizedSubject.startsWith(normalizedKnown)) {
            isKnownSubject = true;
            break;
          }
        }
      }
    }

    // [Fix] Known subjects에 없더라도, 과목명 형식이 타당하면(짧고 유효한 문자) 새로운 과목으로 인정
    const isLikelySubject = !isKnownSubject &&
      subjectName.length > 0 &&
      subjectName.length < 15 &&
      /^[가-힣A-Za-z0-9\s·・/]+$/.test(subjectName) &&
      !subjectName.includes('다연'); // 학생 이름 제외

    return hasSemesterPrefix || isKnownSubject || isLikelySubject;
  };

  // [Change] Refactored to handle processing of line segments (for inline splitting)
  const processLine = (lineText: string) => {
    let line = lineText.trim();

    // Ignore headers inside content if they appear (should be handled by filters/split logic but safe to ignore)
    if (line.includes('과목 세 부 능 력') || line.includes('특 기 사 항')) {
      return;
    }

    if (!line) {
      if (currentSubject) {
        foundEmptyLineAfterSubject = true;
      }
      return;
    }

    if (foundEmptyLineAfterSubject && currentSubject) {
      if (contentLines.length > 0) {
        details[currentSubject] = joinContentLines(contentLines);
        contentLines = [];
      }
      currentSubject = null;
      foundEmptyLineAfterSubject = false;
    }

    // [Fix] Check for subject header at start of this line segment
    let subjectMatch = line.match(/^(.+?):\s*(.*)$/);
    if (subjectMatch) {
      const possibleSubject = subjectMatch[1].trim();

      if (isSubjectCandidate(possibleSubject)) {
        if (currentSubject && contentLines.length > 0) {
          details[currentSubject] = joinContentLines(contentLines);
        }

        let subjectKey = possibleSubject;
        const semesterMatch = subjectKey.match(/^\(([12])학기\)(.+)$/);
        if (semesterMatch) {
          const semester = semesterMatch[1];
          const subject = semesterMatch[2].trim();
          subjectKey = `${semester}|${subject}`;
        }

        currentSubject = subjectKey;
        contentLines = subjectMatch[2] ? [subjectMatch[2]] : [];
        foundEmptyLineAfterSubject = false;
        return;
      }
    }

    // No subject match, treat as content
    if (currentSubject) {
      contentLines.push(line);
    } else {
      unmatchedContent.push(line);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]; // Use raw line to preserve spaces for regex matching if needed

    // Filter top-level ignoring
    if (line.trim().includes('과목 세 부 능 력') || line.trim().includes('특 기 사 항')) {
      continue;
    }

    // Recursive-like iterative splitting for inline headers
    while (true) {
      const inlineRegex = /\s([가-힣A-Za-z0-9\(\)\[\]\+\・\·/]+):\s/;
      const inlineMatch = line.match(inlineRegex);
      let splitFound = false;

      if (inlineMatch) {
        const candidate = inlineMatch[1];
        if (isSubjectCandidate(candidate)) {
          // Found inline candidate
          const splitIndex = inlineMatch.index! + 1; // Skip the leading whitespace char
          const prevContent = line.substring(0, splitIndex);
          const newSubjectLine = line.substring(splitIndex);

          // Process the part BEFORE the split
          processLine(prevContent);

          // Update line to be the part AFTER the split (the new subject line) and continue loop
          line = newSubjectLine;
          splitFound = true;
        }
      }

      if (!splitFound) {
        processLine(line);
        break;
      }
    }
  }

  if (currentSubject && contentLines.length > 0) {
    details[currentSubject] = joinContentLines(contentLines);
  }

  return {
    details,
    unmatchedContent: joinContentLines(unmatchedContent)
  };
}

/**
 * Academic Development 섹션 파싱 (학년별)
 */
export function parseAcademicDevelopment(gradeText: string, gradeNumber: number): Section6Record[] {
  const records: Section6Record[] = [];
  const lines = gradeText.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(l => l);

  const regularEnd = lines.findIndex(l => l.includes('<진로 선택 과목>') || l.includes('진로 선택 과목'));
  const careerEnd = lines.findIndex(l => l.includes('<체육ㆍ예술>') || l.includes('체육ㆍ예술'));

  const regularSection = regularEnd > 0 ? lines.slice(0, regularEnd).join('\n') : '';
  const careerSection = regularEnd > 0 && careerEnd > regularEnd ?
    lines.slice(regularEnd, careerEnd).join('\n') : '';
  const peArtsSection = careerEnd > 0 ? lines.slice(careerEnd).join('\n') : '';

  if (regularSection) {
    const regularRecords = parseRegularSubjects(regularSection, gradeNumber);
    records.push(...regularRecords);
  }

  if (careerSection) {
    const careerRecords = parseCareerSubjects(careerSection, gradeNumber);
    records.push(...careerRecords);
  }

  if (peArtsSection) {
    const peArtsRecords = parsePEArtsSubjects(peArtsSection, gradeNumber);
    records.push(...peArtsRecords);
  }

  const knownSubjects = new Set(records.map(r => r.subject));

  const contentMarker = regularSection.indexOf('세 부 능 력');
  const regularContentSection = contentMarker >= 0 ?
    regularSection.substring(contentMarker) : regularSection;

  const regularResult = extractSubjectDetails(regularContentSection, knownSubjects);
  const careerResult = extractSubjectDetails(careerSection, knownSubjects);
  const peArtsResult = extractSubjectDetails(peArtsSection, knownSubjects);

  const allDetails = {
    ...regularResult.details,
    ...careerResult.details,
    ...peArtsResult.details
  };

  records.forEach(record => {
    const semesterKey = `${record.semester}|${record.subject}`;

    if (allDetails[semesterKey]) {
      record.content = allDetails[semesterKey];
    } else if (allDetails[record.subject]) {
      record.content = allDetails[record.subject];
    } else {
      const normalizedRecordSubject = record.subject.replace(/\s+/g, '');

      for (const [key, content] of Object.entries(allDetails)) {
        if (key.includes('|')) {
          const [semester, subject] = key.split('|');
          const normalizedKeySubject = subject.replace(/\s+/g, '');
          if (record.semester === parseInt(semester) && normalizedRecordSubject === normalizedKeySubject) {
            record.content = content;
            break;
          }
        } else {
          const normalizedKeySubject = key.replace(/\s+/g, '');
          if (normalizedRecordSubject === normalizedKeySubject) {
            record.content = content;
            break;
          }
        }
      }
    }
  });

  if (regularResult.unmatchedContent) {
    records.push({
      grade: gradeNumber,
      semester: null,
      category: 'other',
      subject_group: '',
      subject: '수업량 유연화',
      units: null,
      score: null,
      average: null,
      stdDev: null,
      achievement: null,
      students: null,
      rank: null,
      distribution: null,
      remarks: '',
      content: regularResult.unmatchedContent
    });
  }

  return records;
}

/**
 * 정규과목 파싱
 */
export function parseRegularSubjects(sectionText: string, gradeNumber: number): Section6Record[] {
  const records: Section6Record[] = [];
  const lines = sectionText.split('\n').map(l => l.trim()).filter(l => l);

  let currentSemester: number | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.includes('학기') || line.includes('교과') || line.includes('단위수') ||
      line.includes('원점수') || line.includes('성취도') || line.includes('석차등급') ||
      line === '[1학년]' || line === '[2학년]' || line === '[3학년]') {
      i++;
      continue;
    }

    if (/^[12]$/.test(line)) {
      currentSemester = parseInt(line);
      i++;
      continue;
    }

    if (line.includes('이수단위 합계') || line.includes('세 부 능 력')) {
      break;
    }

    let recordLine = line;
    let j = i + 1;
    const scorePattern = /\d+\/\d+\.?\d*\(\d+\.?\d*\)\s+[A-EP]\(\d+\)/;

    while (j < lines.length && !scorePattern.test(recordLine)) {
      if (/^[12]$/.test(lines[j]) || lines[j].includes('이수단위') ||
        lines[j].includes('세 부 능 력')) {
        break;
      }

      const nextLine = lines[j];
      const isShortKoreanFragment = nextLine.length <= 2 && /^[가-힣]+$/.test(nextLine);

      if (isShortKoreanFragment) {
        recordLine += nextLine;
      } else {
        recordLine += ' ' + nextLine;
      }
      j++;
    }

    const scoreMatch = recordLine.match(/(\d+)\/(\d+\.?\d*)\((\d+\.?\d*)\)\s+([A-EP])\((\d+)\)\s*(\d*)(.*)$/);
    const pfMatch = !scoreMatch && recordLine.match(/\s+P\s+P\s*$/);

    if (scoreMatch) {
      const beforeScore = recordLine.substring(0, recordLine.indexOf(scoreMatch[0])).trim();
      const parts = beforeScore.split(/\s+/);

      if (parts.length >= 2) {
        let subjectGroup, subject, units;

        const hasUnmatchedBrackets = (str: string) => {
          const pairs: { [key: string]: string } = { '(': ')', '[': ']', '{': '}', '「': '」', '『': '』' };
          const counts: { [key: string]: number } = {};
          for (let open of Object.keys(pairs)) counts[open] = 0;

          for (let char of str) {
            if (char in pairs) counts[char]++;
            for (let [open, close] of Object.entries(pairs)) {
              if (char === close) counts[open]--;
            }
          }
          return Object.values(counts).some(count => count !== 0);
        };

        const hasMultiWordIndicator = parts.length > 1 && (
          parts[1].includes('/') ||
          parts[1].includes('・') ||
          parts[1].includes('·') ||
          hasUnmatchedBrackets(parts[0])
        );

        if (hasMultiWordIndicator) {
          let subjectStartIndex = -1;
          let subjectLastPart = null;

          for (let k = parts.length - 1; k >= 0; k--) {
            const match = parts[k].match(/^(.+?)(\d+)$/);
            if (match) {
              subjectStartIndex = k;
              subjectLastPart = match[1];
              units = parseInt(match[2]);
              break;
            }
            if (/^\d+$/.test(parts[k]) && k > 0) {
              subjectStartIndex = k - 1;
              units = parseInt(parts[k]);
              break;
            }
          }

          if (subjectStartIndex === -1 || units === undefined) {
            i++;
            continue;
          }

          subjectGroup = parts.slice(0, subjectStartIndex).join('');

          if (subjectLastPart) {
            subject = parts.slice(subjectStartIndex, parts.length - 1).concat([subjectLastPart]).join(' ');
          } else {
            subject = parts.slice(subjectStartIndex, parts.length - 1).join(' ');
          }

        } else {
          subjectGroup = parts[0];

          const lastPart = parts[parts.length - 1];
          const match = lastPart.match(/^(.+?)(\d+)$/);

          if (match) {
            subject = parts.slice(1, -1).concat([match[1]]).join(' ');
            units = parseInt(match[2]);
          } else if (/^\d+$/.test(lastPart)) {
            subject = parts.slice(1, -1).join(' ');
            units = parseInt(lastPart);
          } else {
            subject = parts.slice(1).join(' ');
            units = null;
          }
        }

        if (!subjectGroup || !subject || units === null || units === undefined) {
          i++;
          continue;
        }

        let finalSubjectGroup = subjectGroup;
        let finalSubject = subject;

        if (subjectGroup.startsWith('예술') && subjectGroup.length > 2) {
          const afterArt = subjectGroup.substring(2);
          if (afterArt && !/^\s/.test(afterArt)) {
            finalSubjectGroup = '예술';
            finalSubject = afterArt + (subject ? ' ' + subject : '');
          }
        }

        const record: Section6Record = {
          grade: gradeNumber,
          semester: currentSemester,
          category: 'regular',
          subject_group: finalSubjectGroup,
          subject: finalSubject,
          units: units,
          score: parseInt(scoreMatch[1]),
          average: parseFloat(scoreMatch[2]),
          stdDev: parseFloat(scoreMatch[3]),
          achievement: scoreMatch[4],
          students: parseInt(scoreMatch[5]),
          rank: scoreMatch[6] ? parseInt(scoreMatch[6]) : null,
          distribution: null,
          remarks: scoreMatch[7] ? scoreMatch[7].trim() : '',
          content: ''
        };
        records.push(record);
        i = j;
      } else {
        i++;
      }
    } else if (pfMatch) {
      const beforePF = recordLine.substring(0, recordLine.indexOf(' P P')).trim();
      const parts = beforePF.split(/\s+/);

      if (parts.length >= 1) {
        const lastPart = parts[parts.length - 1];
        const unitsMatch = lastPart.match(/^(.+?)(\d+)$/);

        if (unitsMatch) {
          let subject = unitsMatch[1];
          const units = parseInt(unitsMatch[2]);
          let subjectGroup = parts.slice(0, parts.length - 1).join('');

          if (subjectGroup.startsWith('예술') && subjectGroup.length > 2) {
            const afterArt = subjectGroup.substring(2);
            if (afterArt && !/^\s/.test(afterArt)) {
              const subjectParts = [afterArt];
              if (subject) {
                subjectParts.push(subject);
              }
              subject = subjectParts.join(' ');
              subjectGroup = '예술';
            }
          }

          const record: Section6Record = {
            grade: gradeNumber,
            semester: currentSemester,
            category: 'regular',
            subject_group: subjectGroup || subject,
            subject: subject,
            units: units,
            score: null,
            average: null,
            stdDev: null,
            achievement: 'P',
            students: null,
            rank: null,
            distribution: null,
            remarks: '',
            content: ''
          };
          records.push(record);
          i = j;
        } else {
          i++;
        }
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  return records;
}


/**
 * 헤더 라인 감지 (진로선택 과목용)
 */
function isCareerHeaderLine(line: string): boolean {
  const headerKeywords = [
    "학기", "교과", "과목", "학점", "단위수", "단위", "수",
    "원점수", "과목평균", "성취도", "수강자수",
    "성취도별", "분포비율", "비고"
  ];

  if (headerKeywords.includes(line)) return true;

  const hasHeaderKeyword = headerKeywords.some(kw => line.includes(kw));
  const hasNoDigit = !/\d/.test(line);
  if (hasHeaderKeyword && hasNoDigit) return true;

  if (line.match(/^\([^)]+\)$/) && !line.match(/[A-E]\(\d+\)/)) return true;

  if (line.includes("학기 교과 과목")) return true;

  if (line === "학점수" || line === "원점수/과목평균") return true;

  return false;
}


/**
 * 진로선택 과목 파싱
 */
export function parseCareerSubjects(sectionText: string, gradeNumber: number): Section6Record[] {
  const records: Section6Record[] = [];
  const lines = sectionText.split('\n').map(l => l.trim()).filter(l => l);

  let currentSemester: number | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 헤더 라인 스킵 (강화된 로직)
    if (isCareerHeaderLine(line)) {
      i++;
      continue;
    }

    if (/^[12]$/.test(line)) {
      currentSemester = parseInt(line);
      i++;
      continue;
    }

    if (line.includes('<') || line.includes('>')) {
      i++;
      continue;
    }

    let recordLine = line;
    let j = i + 1;
    const distributionPattern = /[ABC]\(\d+\.?\d*\)\s+[ABC]\(\d+\.?\d*\)\s+[ABC]\(\d+\.?\d*\)/;

    while (j < lines.length && !distributionPattern.test(recordLine)) {
      if (/^[12]$/.test(lines[j]) || lines[j].includes('이수단위') || lines[j].includes('<')) break;

      // 헤더 라인을 만나면 concatenation 중단
      if (isCareerHeaderLine(lines[j])) break;

      const nextLine = lines[j];
      const isShortKoreanFragment = nextLine.length <= 2 && /^[가-힣]+$/.test(nextLine);

      if (isShortKoreanFragment) {
        recordLine += nextLine;
      } else {
        recordLine += ' ' + nextLine;
      }
      j++;
    }

    const distributionMatch = recordLine.match(/A\((\d+\.?\d*)\)\s+B\((\d+\.?\d*)\)\s+C\((\d+\.?\d*)\)(.*)$/);
    if (!distributionMatch) {
      i++;
      continue;
    }

    const beforeDistribution = recordLine.substring(0, recordLine.indexOf(distributionMatch[0])).trim();
    const achievementMatch = beforeDistribution.match(/([A-E])\((\d+)\)$/);
    if (!achievementMatch) {
      i++;
      continue;
    }

    const beforeAchievement = beforeDistribution.substring(0, beforeDistribution.indexOf(achievementMatch[0])).trim();

    let scoreMatch = beforeAchievement.match(/(\d+)\/(\d+\.?\d*)$/);
    if (!scoreMatch) {
      i++;
      continue;
    }

    let units, score, average, beforeUnits;
    const beforeScore = beforeAchievement.substring(0, beforeAchievement.indexOf(scoreMatch[0])).trim();
    const unitsMatch = beforeScore.match(/(\d+)$/);

    if (unitsMatch) {
      units = parseInt(unitsMatch[1]);
      score = parseInt(scoreMatch[1]);
      average = parseFloat(scoreMatch[2]);
      beforeUnits = beforeScore.substring(0, beforeScore.indexOf(unitsMatch[0])).trim();
    } else {
      const scoreStr = scoreMatch[1];
      if (scoreStr.length >= 2) {
        units = parseInt(scoreStr[0]);
        score = parseInt(scoreStr.substring(1));
        average = parseFloat(scoreMatch[2]);
        beforeUnits = beforeScore;
      } else {
        i++;
        continue;
      }
    }

    let categoryAndSubject = beforeUnits;
    if (!currentSemester) {
      const semesterMatch = categoryAndSubject.match(/^([12])\s+(.+)$/);
      if (semesterMatch) {
        currentSemester = parseInt(semesterMatch[1]);
        categoryAndSubject = semesterMatch[2];
      }
    }

    const parts = categoryAndSubject.trim().split(/\s+/);
    if (parts.length < 2) {
      i++;
      continue;
    }

    let subjectGroup = parts[0];
    let subject = parts.slice(1).join(' ');

    if (subjectGroup.startsWith('예술') && subjectGroup.length > 2) {
      const afterArt = subjectGroup.substring(2);
      if (afterArt && !/^\s/.test(afterArt)) {
        subject = afterArt + (subject ? ' ' + subject : '');
        subjectGroup = '예술';
      }
    }

    const record: Section6Record = {
      grade: gradeNumber,
      semester: currentSemester,
      category: 'career',
      subject_group: subjectGroup,
      subject: subject,
      units: units,
      score: score,
      average: average,
      stdDev: null,
      achievement: achievementMatch[1],
      students: parseInt(achievementMatch[2]),
      rank: null,
      distribution: {
        A: parseFloat(distributionMatch[1]),
        B: parseFloat(distributionMatch[2]),
        C: parseFloat(distributionMatch[3])
      },
      remarks: distributionMatch[4] ? distributionMatch[4].trim() : '',
      content: ''
    };
    records.push(record);
    i = j;
  }

  return records;
}

/**
 * 체육/예술 과목 파싱
 */
export function parsePEArtsSubjects(sectionText: string, gradeNumber: number): Section6Record[] {
  const records: Section6Record[] = [];
  const lines = sectionText.split('\n').map(l => l.trim()).filter(l => l);

  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line === '학기' || line === '교과' || line === '과목' || line === '단위수' ||
      line === '성취도' || line === '비고' || line.includes('이수단위') ||
      line.includes('<') || line.includes('>')) {
      i++;
      continue;
    }

    let recordLine = line;
    let j = i + 1;
    const achievementPattern = /\s+[A-E](\s|$)/;

    while (j < lines.length && !achievementPattern.test(recordLine)) {
      if (lines[j].includes('이수단위') || lines[j].includes('<') || lines[j].includes('과목')) break;
      recordLine += ' ' + lines[j];
      j++;
    }

    const match = recordLine.match(/^([12])\s+(.+?)\s+(.+?)\s+(\d+)\s+([A-E])(.*)$/);

    if (match) {
      const record: Section6Record = {
        grade: gradeNumber,
        semester: parseInt(match[1]),
        category: 'pe_arts',
        subject_group: match[2].trim(),
        subject: match[3].trim(),
        units: parseInt(match[4]),
        score: null,
        average: null,
        stdDev: null,
        achievement: match[5],
        students: null,
        rank: null,
        distribution: null,
        remarks: match[6] ? match[6].trim() : '',
        content: ''
      };
      records.push(record);
      i = j;
    } else {
      i++;
    }
  }

  return records;
}
