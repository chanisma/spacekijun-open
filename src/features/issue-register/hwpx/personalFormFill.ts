import type { VolunteerArea } from '../types';

/**
 * 개인 봉사활동 계획 및 확인서 — section0.xml 순수 치환 모듈.
 * (템플릿 ?url import 없음 → Node 테스트 가능. volunteerFormFill.ts와 동일 철학)
 *
 * 단체봉사 템플릿과 다른 점:
 *  - 로스터(명단) 표가 없음 — 학생 1명 = 정적 텍스트 치환만(행 복제 불필요)
 *  - 계획서·확인서 두 블록이 완전히 동일한 정보를 담아 필드가 2회 등장
 *    (인적사항·대상기관·유의사항·의견·발급번호는 1회만 등장 — 공용 또는 확인서 전용)
 *  - 각 {value} 자리표시자는 하나의 <hp:t> 런 안에 온전히 들어있고
 *    안정적인 라벨 접두어(학교명:/활동일시:/대상기관: 등)를 가져 run-split 문제 없음
 *  - 템플릿의 중괄호({})는 한글 문서 작성 단계에서 채울 자리를 표시해 둔 편집 가이드일
 *    뿐 최종 문서에 남아서는 안 되는 기호다 — 모든 치환은 중괄호를 제거하고 값만 남긴다.
 *  - "성명: {...} (인, 서명)" 형태 줄이 문서에 2곳(인적사항, 제출 서명란) 있는데 둘 다
 *    학생 성명으로 채운다. 확인자 성명 줄만 "성명:" 라벨이 없어 별도로 구분된다.
 */
export interface PersonalFillInput {
  issueNo: string;                     // 발급번호 'YYYY-NNN'
  grade: number; classNumber: number; number: number; studentName: string;
  periodStart: string; periodEnd: string;   // 'YYYY.M.D'
  totalHours: number;
  org: string; place: string;
  area: VolunteerArea;
  content: string;
  note?: string;
  opinion?: string;
  confirmDate: string;                 // 'YYYY년 M월 D일'
  confirmerTitle: string;              // 확인자 직급 (기본 "교사")
  confirmerName?: string;              // 확인자 성명
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function fillPersonalSection0(xml: string, input: PersonalFillInput): string {
  let out = xml;

  // 1. 인적사항 (공용, 1회): "{3}학년 {4}반 {8}번  성명: {박지민} (인, 서명)" → "3학년 4반 8번 성명: 홍길동 (인, 서명)"
  out = out.replace(
    /\{\d+\}학년\s*\{\d+\}반\s*\{\d+\}번(\s*성명\s*:\s*)\{[^}]*\}(\s*\(인, 서명\))/,
    `${input.grade}학년 ${input.classNumber}반 ${input.number}번$1${escapeXml(input.studentName)}$2`
  );

  // 2. 활동일시 (계획서·확인서 2회): "활동일시:  {2025}년  {3}월  {10}일" + "~ {2025}년 {7}월 {21}일" + "(총 {13} 시간)"
  const [sy, sm, sd] = input.periodStart.split('.');
  const [ey, em, ed] = input.periodEnd.split('.');
  out = out.replace(
    /(활동일시:\s+)\{\d+\}년\s+\{\d+\}월\s+\{\d+\}일/g,
    `$1${sy}년  ${sm}월  ${sd}일`
  );
  out = out.replace(
    /(~\s*)\{\d+\}년\s+\{\d+\}월\s+\{\d+\}일/g,
    `$1${ey}년  ${em}월  ${ed}일`
  );
  out = out.replace(
    /(\(총\s*)\{\d+\}(\s*시간\))/g,
    `$1${input.totalHours}$2`
  );

  // 3. 대상기관 (계획서 전용, 1회): "대상기관:   {샘플고등학교}"
  out = out.replace(
    /(대상기관:\s+)\{[^}]*\}/,
    `$1${escapeXml(input.org)}`
  );

  // 4. 활동장소 (2회): "활동장소:   {교실 및 교내 공용실 등}"
  out = out.replace(
    /(활동장소:\s+)\{[^}]*\}/g,
    `$1${escapeXml(input.place)}`
  );

  // 5. 활동영역 (2회): "활동영역: {캠페인}"
  out = out.replace(
    /(활동영역:\s*)\{[^}]*\}/g,
    `$1${escapeXml(input.area)}`
  );

  // 6. 활동내용 (2회): "활동내용: {전자 통신 기기 관리 도우미}"
  out = out.replace(
    /(활동내용:\s*)\{[^}]*\}/g,
    `$1${escapeXml(input.content)}`
  );

  // 7. 유의사항 (확인서 전용, 1회): "유의사항: { }" → 미입력 시 공백(원본과 동일하게 빈칸 유지)
  out = out.replace(
    /(유의사항:\s*)\{[^}]*\}/,
    `$1${escapeXml(input.note ?? '')}`
  );

  // 8. 의견 (확인서 전용, 1회): "의견: {역할에 성실히 임함}"
  out = out.replace(
    /(의견:\s*)\{[^}]*\}/,
    `$1${escapeXml(input.opinion ?? '')}`
  );

  // 9. 확인 날짜 (1회, 전각 공백(U+3000)으로 시작 — 제출/확인 서명란 상단 날짜)
  {
    const [cy, cmo, cd] = input.confirmDate
      .match(/(\d+)년\s*(\d+)월\s*(\d+)일/)!.slice(1);
    out = out.replace(
      /(\u3000\s*)\{\d+\}년\s+\{\d+\}월\s+\{\d+\}일/,
      `$1${cy}년  ${cmo}월  ${cd}일`
    );
  }

  // 10. 제출 서명란 (1회): "\u3000             성명:  {이름}  (인, 서명)" — "위와 같이 봉사활동을
  //     하고자 계획서를 제출합니다."/"...확인합니다." 바로 아래 줄. 학생이 실물로 서명하는
  //     칸이 아니라 학생 성명을 텍스트로 채우는 칸이라 학생 이름으로 치환한다.
  //     "학년...반...번...성명:"(인적사항, 이미 1번에서 처리)과 구분하기 위해 앞에 전각
  //     공백(\u3000)만 있고 "학년/반/번"이 없는 이 줄만 앵커링한다.
  out = out.replace(
    /(\u3000\s*성명\s*:\s*)\{[^}]*\}(\s*\(인, 서명\))/,
    `$1${escapeXml(input.studentName)}$2`
  );

  // 11. 확인자 직급 (1회): "         확인자 직급    {교사}"
  out = out.replace(
    /(확인자 직급\s+)\{[^}]*\}/,
    `$1${escapeXml(input.confirmerTitle)}`
  );

  // 12. 확인자 성명 (1회): "                 {오하린} (인, 서명)" — "성명:" 라벨 없이
  //     공백만으로 들여쓰기된 유일한 서명 줄이라 앞의 두 서명란(학생명·제출서명)과 구분된다.
  out = out.replace(
    /(<hp:t>\s+)\{[^}]*\}(\s*\(인, 서명\)<\/hp:t>)/,
    `$1${escapeXml(input.confirmerName ?? '')}$2`
  );

  // 13. 확인서 발급번호 (최하단, 1회): "확인서 발급번호" 다음 문단의 "{ }"
  out = out.replace(
    /(확인서 발급번호<\/hp:t><\/hp:run><hp:linesegarray>[\s\S]*?<hp:t>)\{[^}]*\}/,
    `$1${escapeXml(input.issueNo)}`
  );

  return out;
}
