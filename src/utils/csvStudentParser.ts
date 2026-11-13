/**
 * CSV 학생 데이터 파싱 유틸리티
 *
 * CSV 형식:
 * 아이디,학번,성명,등급,계열,비밀번호,성별,기숙사,집전화,휴대폰,어머니,아버지,이메일,바코드,학번이력,2024학번(수정불가),진로,전공,...
 *
 * 집전화와 휴대폰 열은 개인정보 최소화 정책에 따라 읽거나 반환하지 않는다.
 */

export interface ParsedStudent {
  id: string; // 아이디 (00-00448)
  name: string; // 성명
  grade: number; // 현재 학년 (1, 2, 3)
  class: number; // 반
  number: number; // 번호
  snum1?: string; // 1학년 학번
  snum2?: string; // 2학년 학번
  snum3?: string; // 3학년 학번
  career?: string; // 진로
  major?: string; // 전공
  // 사진은 받지 않는다 (2026-10-02): CSV 20번째 열의 파일명으로 만들던 `kijun.riroschool.kr/member_pict/…` 주소가
  // 더는 열리지 않아 `resource.meta.picture` 를 전부 지웠다. 여기서 다시 만들면 다음 가져오기 때 죽은 주소 636개가 되살아난다.
}

/**
 * 학번에서 학년, 반, 번호 추출
 * 예: "10234" -> { grade: 1, class: 2, number: 34 }
 */
export function parseStudentNumber(studentNumber: string): {
  grade: number;
  class: number;
  number: number;
} {
  // 학번에서 숫자만 추출 (25-10234 -> 10234)
  const numStr = studentNumber.replace(/^.*-/, '').trim();

  // 숫자가 아니거나 길이가 5가 아니면 에러
  if (!numStr || !/^\d+$/.test(numStr) || numStr.length !== 5) {
    throw new Error(`Invalid student number format: ${studentNumber}`);
  }

  const grade = parseInt(numStr[0]);
  const classNum = parseInt(numStr.substring(1, 3));
  const number = parseInt(numStr.substring(3, 5));

  return { grade, class: classNum, number };
}

/**
 * 학번이력 파싱
 * 예: ",00-00118,24-20520," -> { snum1: "10521", snum2: "20520" }
 */
export function parseStudentHistory(history: string): {
  snum1?: string;
  snum2?: string;
  snum3?: string;
} {
  const result: { snum1?: string; snum2?: string; snum3?: string } = {};

  if (!history || history.trim() === '') {
    return result;
  }

  // 쉼표와 따옴표 제거 후 학번 추출
  const numbers = history
    .split(',')
    .map(s => s.trim().replace(/^["']|["']$/g, '')) // 따옴표 제거
    .filter(s => s.length > 0 && s.includes('-'));

  for (const num of numbers) {
    // "00-00118" -> "10521"
    const actualNum = num.replace(/^.*-/, '');

    if (actualNum.length === 5) {
      const gradeDigit = actualNum[0];

      if (gradeDigit === '1') {
        result.snum1 = actualNum;
      } else if (gradeDigit === '2') {
        result.snum2 = actualNum;
      } else if (gradeDigit === '3') {
        result.snum3 = actualNum;
      }
    }
  }

  return result;
}

/**
 * CSV 행 파싱
 */
export function parseCSVRow(row: string[]): ParsedStudent | null {
  try {
    // CSV 컬럼 인덱스:
    // 0: 아이디, 1: 학번, 2: 성명, 14: 학번이력, 16: 진로, 17: 전공, 19: 사진(수정불가)
    const id = row[0]?.trim();
    const studentNumber = row[1]?.trim();
    const name = row[2]?.trim();
    const history = row[14]?.trim() || '';
    const career = row[16]?.trim() || '';
    const major = row[17]?.trim() || '';
    // row[19] = 사진 파일명 — 의도적으로 읽지 않는다(위 ParsedStudent 주석)

    if (!id || !studentNumber || !name) {
      return null;
    }

    // 현재 학번에서 학년, 반, 번호 추출
    const { grade, class: classNum, number } = parseStudentNumber(studentNumber);

    // 학번이력 파싱
    const historyData = parseStudentHistory(history);

    // 현재 학번을 해당 학년 학번에 저장
    const currentSnum = studentNumber.replace(/^.*-/, '');
    const snumData: { snum1?: string; snum2?: string; snum3?: string } = { ...historyData };

    if (grade === 1) {
      snumData.snum1 = currentSnum;
    } else if (grade === 2) {
      snumData.snum2 = currentSnum;
    } else if (grade === 3) {
      snumData.snum3 = currentSnum;
    }

    return {
      id,
      name,
      grade,
      class: classNum,
      number,
      ...snumData,
      career: career || undefined,
      major: major || undefined,
    };
  } catch (error) {
    console.error('Error parsing CSV row:', error, row);
    return null;
  }
}

/**
 * CSV 파일 전체 파싱
 */
export async function parseCSVFile(file: File): Promise<ParsedStudent[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n');

        const students: ParsedStudent[] = [];
        let skipCount = 0;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trim() === '') continue;

          // CSV 파싱 (쉼표로 분리하되, 따옴표 안의 쉼표는 무시)
          const row = parseCSVLine(line);

          // 헤더 행 감지 (아이디, 학번, 성명 등의 문자열 포함)
          const firstCell = row[0]?.trim().toLowerCase();
          if (i === 0 && (firstCell.includes('아이디') || firstCell.includes('id') || firstCell.includes('학번'))) {
            console.log('헤더 행 감지, 스킵:', row);
            continue;
          }

          const student = parseCSVRow(row);

          if (student) {
            students.push(student);
          } else {
            skipCount++;
          }
        }

        console.log(`CSV 파싱 완료: ${students.length}명, 스킵: ${skipCount}행`);
        resolve(students);
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
