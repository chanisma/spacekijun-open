/**
 * 기본 정보 파서
 * 헤더 및 인적사항 파싱 담당
 */

/**
 * Header 섹션 파싱
 */
export function parseHeader(headerText: string) {
  const lines = headerText.split('\n').map(l => l.trim()).filter(l => l);

  const result = {
    documentTitle: '',
    gradeInfo: [] as Array<{ grade: number; class: number; number: number; homeroomTeacher: string }>
  };

  if (lines.length > 0) {
    result.documentTitle = lines[0];
  }

  const gradePattern = /^(\d+)\s+(\d+)\s+(\d+)\s+([가-힣]+)$/;

  for (const line of lines) {
    const match = line.match(gradePattern);
    if (match) {
      result.gradeInfo.push({
        grade: parseInt(match[1]),
        class: parseInt(match[2]),
        number: parseInt(match[3]),
        homeroomTeacher: match[4]
      });
    }
  }

  return result;
}

/**
 * Personal Info 섹션 파싱
 */
export function parsePersonalInfo(personalInfoText: string) {
  console.log('🔍 parsePersonalInfo 입력 텍스트 (첫 500자):', personalInfoText.substring(0, 500));

  const result = {
    name: '',
    middleSchool: '',
    admissionYear: 0
  };

  const lines = personalInfoText.split('\n');
  console.log('🔍 parsePersonalInfo 라인 수:', lines.length);

  for (const line of lines) {
    const nameMatch = line.match(/성명\s*:\s*([가-힣]+)/);
    if (nameMatch) {
      console.log('✅ 성명 찾음:', nameMatch[1], '(원본 라인:', line, ')');
      result.name = nameMatch[1];
    }

    const middleSchoolMatch = line.match(/([가-힣]+중학교)\s*제3학년\s*졸업/);
    if (middleSchoolMatch) {
      console.log('✅ 출신중학교 찾음:', middleSchoolMatch[1]);
      result.middleSchool = middleSchoolMatch[1];
    }

    // Extract admission year: "2022년 03월 02일 ... 제1학년 입학"
    const admissionMatch = line.match(/(\d{4})년\s+\d{2}월\s+\d{2}일.*제1학년\s+입학/);
    if (admissionMatch) {
      console.log('✅ 입학년도 찾음:', admissionMatch[1]);
      result.admissionYear = parseInt(admissionMatch[1]);
    }
  }

  console.log('🔍 parsePersonalInfo 최종 결과:', result);
  return result;
}
