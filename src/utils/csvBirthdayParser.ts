/**
 * CSV 생일 데이터 파싱 유틸리티
 *
 * CSV 형식:
 * 학년,반,번호,성명,생년월일
 * 1,2,15,홍길동,2007.03.15.
 */

export interface ParsedBirthday {
  grade: number;
  class: number;
  number: number;
  name: string;
  birthday: string; // ISO 8601 형식 (YYYY-MM-DD)
}

/**
 * 생년월일 문자열을 ISO 8601 형식으로 변환
 * 예: "2007.03.15." -> "2007-03-15"
 */
export function parseBirthdayDate(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') {
    throw new Error('Empty date string');
  }

  // 마지막 점 제거 및 공백 제거
  const cleaned = dateStr.trim().replace(/\.$/, '');

  // 점으로 분리
  const parts = cleaned.split('.');

  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }

  const year = parts[0];
  const month = parts[1].padStart(2, '0');
  const day = parts[2].padStart(2, '0');

  // 간단한 유효성 검사
  const yearNum = parseInt(year);
  const monthNum = parseInt(month);
  const dayNum = parseInt(day);

  if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dayNum)) {
    throw new Error(`Invalid date values: ${dateStr}`);
  }

  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
    throw new Error(`Invalid date range: ${dateStr}`);
  }

  return `${year}-${month}-${day}`;
}

/**
 * CSV 행 파싱
 * 형식: 학년,반,번호,성명,생년월일
 */
export function parseCSVRow(row: string[]): ParsedBirthday | null {
  try {
    if (row.length < 5) {
      return null;
    }

    const gradeStr = row[0]?.trim();
    const classStr = row[1]?.trim();
    const numberStr = row[2]?.trim();
    const name = row[3]?.trim();
    const birthdayStr = row[4]?.trim();

    if (!gradeStr || !classStr || !numberStr || !name || !birthdayStr) {
      return null;
    }

    const grade = parseInt(gradeStr);
    const classNum = parseInt(classStr);
    const number = parseInt(numberStr);

    if (isNaN(grade) || isNaN(classNum) || isNaN(number)) {
      return null;
    }

    // 생년월일 변환
    const birthday = parseBirthdayDate(birthdayStr);

    return {
      grade,
      class: classNum,
      number,
      name,
      birthday,
    };
  } catch (error) {
    console.error('Error parsing CSV row:', error, row);
    return null;
  }
}

/**
 * CSV 라인 파싱 (따옴표 처리 포함)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * CSV 파일 전체 파싱
 */
export async function parseBirthdayCSV(file: File): Promise<ParsedBirthday[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n');

        // 첫 번째 줄은 헤더일 수 있으므로 확인
        const firstLine = lines[0]?.trim();
        const isHeader = firstLine?.includes('학년') || firstLine?.includes('성명');

        // 헤더가 있으면 제외
        const dataLines = isHeader ? lines.slice(1) : lines;

        const birthdays: ParsedBirthday[] = [];

        for (const line of dataLines) {
          if (line.trim() === '') continue;

          const row = parseCSVLine(line);
          const birthday = parseCSVRow(row);

          if (birthday) {
            birthdays.push(birthday);
          }
        }

        resolve(birthdays);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('파일 읽기 실패'));
    };

    reader.readAsText(file, 'UTF-8');
  });
}
