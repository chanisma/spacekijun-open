interface SectionWithTime {
  time: string[];
}

interface TeacherResource {
  name: string;
  type: 'teacher';
  meta: {
    section: Record<string, SectionWithTime>;
  };
}

/**
 * Parse resource CSV file to extract teacher section data
 * CSV format (수업데이터.csv):
 * - Header: 순번,교사성명,요일교시,학년과목(반),요일,교시,학년,반,과목
 * - Each row contains one class entry
 * - Teacher name in column 2 (교사성명)
 * - Subject name in column 9 (과목)
 * - Grade in column 7 (학년)
 * - Class number in column 8 (반)
 * - Weekday in column 5 (요일)
 * - Period in column 6 (교시)
 */
export function parseResourceCSV(csvContent: string): TeacherResource[] {
  const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  if (lines.length < 2) {
    throw new Error('CSV 파일에 충분한 데이터가 없습니다. 최소 헤더와 1개의 데이터 행이 필요합니다.');
  }

  // Skip header row (line 0)
  const dataLines = lines.slice(1);

  // Group by teacher name
  const teacherMap = new Map<string, Map<string, string[]>>();

  for (const line of dataLines) {
    if (!line) continue;

    const cells = parseCSVRow(line);

    if (cells.length < 9) continue;

    const teacherName = cells[1]?.trim(); // 교사성명
    const grade = cells[6]?.trim(); // 학년
    const classNum = cells[7]?.trim(); // 반
    const subject = cells[8]?.trim(); // 과목
    const weekday = cells[4]?.trim(); // 요일
    const period = cells[5]?.trim(); // 교시

    if (!teacherName || !subject) continue;

    // Create section name: "과목 학년-반" (e.g., "통합수학Ⅰ 3-5")
    const sectionName = `${subject} ${grade}-${classNum}`;

    // Convert weekday to number (월=1, 화=2, 수=3, 목=4, 금=5)
    const weekdayMap: Record<string, number> = {
      '월': 1,
      '화': 2,
      '수': 3,
      '목': 4,
      '금': 5,
      '토': 6,
      '일': 7
    };

    const weekdayNum = weekdayMap[weekday];
    if (!weekdayNum) continue;

    // Create time string: "weekday + period" (e.g., "11" for 월1교시)
    const timeStr = `${weekdayNum}${period}`;

    // Initialize teacher if not exists
    if (!teacherMap.has(teacherName)) {
      teacherMap.set(teacherName, new Map());
    }

    const sections = teacherMap.get(teacherName)!;

    // Initialize section if not exists
    if (!sections.has(sectionName)) {
      sections.set(sectionName, []);
    }

    // Add time to section (avoid duplicates)
    const times = sections.get(sectionName)!;
    if (!times.includes(timeStr)) {
      times.push(timeStr);
    }
  }

  // Convert map to array of TeacherResource
  const teachers: TeacherResource[] = [];

  for (const [teacherName, sections] of teacherMap) {
    const sectionObj: Record<string, SectionWithTime> = {};

    for (const [sectionName, times] of sections) {
      // Sort times
      times.sort((a, b) => parseInt(a) - parseInt(b));
      sectionObj[sectionName] = { time: times };
    }

    teachers.push({
      name: teacherName,
      type: 'teacher',
      meta: {
        section: sectionObj
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
 * Validate CSV content before parsing
 */
export function validateResourceCSV(csvContent: string): { valid: boolean; error?: string } {
  const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  if (lines.length < 2) {
    return {
      valid: false,
      error: 'CSV 파일에 최소 헤더와 1개의 데이터 행이 필요합니다.'
    };
  }

  // Check header format
  const headerCells = parseCSVRow(lines[0]);
  const expectedHeaders = ['순번', '교사성명', '요일교시', '학년과목(반)', '요일', '교시', '학년', '반', '과목'];

  if (headerCells.length < expectedHeaders.length) {
    return {
      valid: false,
      error: `CSV 파일에 충분한 열이 없습니다. 최소 ${expectedHeaders.length}개의 열이 필요합니다.`
    };
  }

  // Check if first data row has expected columns
  try {
    const testRow = parseCSVRow(lines[1]);
    if (testRow.length < 9) {
      return {
        valid: false,
        error: 'CSV 파일의 데이터 행에 충분한 열이 없습니다. 최소 9개의 열이 필요합니다.'
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
