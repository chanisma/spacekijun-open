interface SectionWithTime {
  time: string[];
}

interface TeacherResource {
  name: string;
  type: 'teacher';
  meta: {
    email: string;
    section: Record<string, SectionWithTime>;
  };
}

/**
 * Parse timetable CSV file to extract teacher resources
 * CSV format:
 * - Teacher names are in column B (index 1)
 * - Names are in odd rows: 5, 7, 9, 11... (array indices 4, 6, 8, 10...)
 * - Each teacher occupies 2 rows (name row + subjects row)
 * - Subjects are in columns C-AK (indices 2-36)
 * - Subject names are in row 5, 7, 9... (same as names)
 * - Class info is in row 6, 8, 10... (next row after names)
 */
export function parseTimetableCSV(csvContent: string): TeacherResource[] {
  const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  if (lines.length < 5) {
    throw new Error('CSV 파일에 충분한 데이터가 없습니다. 최소 5행이 필요합니다.');
  }

  const teachers: TeacherResource[] = [];

  // Process data starting from row 5 (index 4)
  for (let rowIndex = 4; rowIndex < lines.length; rowIndex += 2) {
    const nameRow = lines[rowIndex];
    const classRow = lines[rowIndex + 1]; // Next row contains class info

    if (!nameRow || !classRow) continue;

    const nameCells = parseCSVRow(nameRow);
    const classCells = parseCSVRow(classRow);

    // Teacher name is in column B (index 1)
    const teacherName = nameCells[1]?.trim();

    if (!teacherName || teacherName === '') continue;

    // Extract sections with their time information from columns C-AK (indices 2-36)
    const sectionsWithTime = extractSectionsWithTime(nameCells, classCells);

    teachers.push({
      name: teacherName,
      type: 'teacher',
      meta: {
        email: 'NAN',
        section: sectionsWithTime
      }
    });
  }

  return teachers;
}

/**
 * Parse a single CSV row, handling quotes and commas properly
 */
function parseCSVRow(row: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Extract sections with their time information from subject and class rows
 * Combines subject name (row1) with class info (row2)
 * Example: "공통국어" + "1-4" = "공통국어 1-4"
 * Maps each section to its time slots based on column position
 * Column position maps to weekday and period: C=월1교시(11), D=월2교시(12), ..., AK=토7교시(67)
 */
function extractSectionsWithTime(subjectCells: string[], classCells: string[]): Record<string, SectionWithTime> {
  const sectionsWithTime: Record<string, SectionWithTime> = {};

  // Check columns C-AK (indices 2-36)
  // CSV has 35 columns (C to AK = 35 columns), representing 5 weekdays × 7 periods each
  const maxIndex = Math.min(37, subjectCells.length, classCells.length);

  for (let i = 2; i < maxIndex; i++) {
    const subject = subjectCells[i]?.trim() || '';
    const classInfo = classCells[i]?.trim() || '';

    if (subject && subject !== '') {
      let sectionName = subject;

      // Combine with class info if available
      if (classInfo && classInfo !== '') {
        sectionName = `${subject} ${classInfo}`;
      }

      // Calculate weekday_time from column position
      // Column C (index 2) = 첫 번째 교시, D (index 3) = 두 번째 교시, etc.
      // Assuming 7 periods per day, 5 weekdays (월-금)
      const columnOffset = i - 2; // 0-based offset from column C
      const weekday = Math.floor(columnOffset / 7) + 1; // 1=월요일, 2=화요일, ..., 5=금요일
      const period = (columnOffset % 7) + 1; // 1-7교시

      // Only process valid weekdays (1-5 for 월-금)
      if (weekday >= 1 && weekday <= 5) {
        const weekdayTime = `${weekday}${period}`;

        // Initialize section if not exists
        if (!sectionsWithTime[sectionName]) {
          sectionsWithTime[sectionName] = { time: [] };
        }

        // Add time to this section (avoid duplicates)
        if (!sectionsWithTime[sectionName].time.includes(weekdayTime)) {
          sectionsWithTime[sectionName].time.push(weekdayTime);
        }
      }
    }
  }

  // Sort time arrays for each section
  Object.values(sectionsWithTime).forEach(section => {
    section.time.sort((a, b) => parseInt(a) - parseInt(b));
  });

  return sectionsWithTime;
}

/**
 * Validate CSV content before parsing
 */
export function validateTimetableCSV(csvContent: string): { valid: boolean; error?: string } {
  const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  if (lines.length < 5) {
    return {
      valid: false,
      error: 'CSV 파일에 최소 5행의 데이터가 필요합니다.'
    };
  }

  // Check if we have data in the expected format
  try {
    const testRow = parseCSVRow(lines[4]); // Row 5 (index 4)
    if (testRow.length < 3) {
      return {
        valid: false,
        error: 'CSV 파일에 충분한 열이 없습니다. 최소 C열(3번째 열)까지 필요합니다.'
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `CSV 파일 형식 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
    };
  }
}
