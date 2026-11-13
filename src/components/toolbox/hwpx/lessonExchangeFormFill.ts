/**
 * 결강시 보강 계획서 HWPX 채우기 — 순수 함수 모듈 (템플릿 ?url import 없음, Node 테스트 가능).
 *
 * 봉사활동 확인서(volunteerFormFill.ts)와 같은 "템플릿 section0.xml 문자열 치환" 방식이지만,
 * 이 양식의 데이터 칸은 비어 있어(<hp:run .../> 또는 <hp:t/>) 텍스트를 "치환"이 아니라 "주입"한다.
 * 칸 위치는 한글 표의 <hp:cellAddr colAddr rowAddr/> 좌표로 정확히 지정한다 (텍스트 매칭 불가 — 빈 칸).
 */

/** 한 행(결강·보강) 데이터 — 다이얼로그의 LessonRowData와 동일 형태. */
export interface LessonRow {
  grade: string;          // 결강 학급
  absenceDate: string;    // 결강 날짜
  absenceDay: string;     // 결강 요일
  absencePeriod: string;  // 결강 교시
  absenceSubject: string; // 결강 과목
  swapType: string;       // 구분 '교체' | '대체'
  makeupSubject: string;  // 보강 과목
  makeupTeacher: string;  // 보강 교사
  makeupDate: string;     // 보강 날짜
  makeupDay: string;      // 보강 요일
  makeupPeriod: string;   // 보강 교시
  makeupLocation: string; // 보강 장소
}

export interface LessonFillInput {
  teacherName: string;     // 교사 성명 (resource.name)
  subject: string;         // 과목 (사용자 입력)
  reasons: number[];       // 선택된 결강 사유 인덱스 0..8 (ABSENCE_REASONS 순서)
  rows: LessonRow[];       // 최대 10행 (양식 데이터 행 수와 동일)
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 한 <hp:tc> 안의 "빈 텍스트 슬롯"에 값을 주입한다. ctrl run(<hp:colPr> 등)은 절대 건드리지 않는다.
 * 빈 칸의 형태는 3가지가 존재:
 *   (a) <hp:run charPrIDRef="N"><hp:t/></hp:run>      → <hp:t/>를 <hp:t>값</hp:t>로
 *   (b) <hp:run charPrIDRef="N"><hp:t></hp:t></hp:run>→ 마찬가지
 *   (c) <hp:run charPrIDRef="N"/>  (자기닫힘 run)      → <hp:run charPrIDRef="N"><hp:t>값</hp:t></hp:run>로
 * 모두 첫 번째 슬롯에만 1회 주입한다 (replace는 함수 콜백으로 $ 특수문자 안전 처리).
 */
function setCellText(cell: string, value: string): string {
  const v = escapeXml(value);
  if (cell.includes('<hp:t/>')) {
    return cell.replace('<hp:t/>', () => `<hp:t>${v}</hp:t>`);
  }
  if (cell.includes('<hp:t></hp:t>')) {
    return cell.replace('<hp:t></hp:t>', () => `<hp:t>${v}</hp:t>`);
  }
  return cell.replace(
    /<hp:run charPrIDRef="(\d+)"\s*\/>/,
    (_m, ref) => `<hp:run charPrIDRef="${ref}"><hp:t>${v}</hp:t></hp:run>`,
  );
}

/** rowCnt/colCnt로 특정 표 영역 [start,end)를 찾는다 (이 양식의 표 3개는 중첩 없음). */
function tableRegion(xml: string, colCnt: number): [number, number] {
  const open = new RegExp(`<hp:tbl\\b[^>]*colCnt="${colCnt}"[^>]*>`);
  const m = open.exec(xml);
  if (!m) throw new Error(`표(colCnt=${colCnt})를 찾지 못함`);
  const start = m.index;
  const end = xml.indexOf('</hp:tbl>', start) + '</hp:tbl>'.length;
  return [start, end];
}

/** 표 영역 안의 각 <hp:tc>를 좌표(col,row)와 함께 콜백으로 변환한다. */
function mapCells(
  xml: string,
  colCnt: number,
  fn: (cell: string, col: number, row: number) => string,
): string {
  const [start, end] = tableRegion(xml, colCnt);
  const region = xml.slice(start, end).replace(
    /<hp:tc\b[\s\S]*?<\/hp:tc>/g,
    (cell) => {
      const a = /colAddr="(\d+)" rowAddr="(\d+)"/.exec(cell);
      if (!a) return cell;
      return fn(cell, Number(a[1]), Number(a[2]));
    },
  );
  return xml.slice(0, start) + region + xml.slice(end);
}

/** 메인 표(colCnt=14) 데이터 칸 colAddr → 행 데이터 값. null이면 건너뜀(순/(인) 칸 등). */
function valueForColumn(col: number, row: LessonRow): string | null {
  const isSub = row.swapType === '대체';
  switch (col) {
    case 1: return row.absenceDate;
    case 2: return row.absenceDay;
    case 3: return row.grade;
    case 4: return row.absencePeriod;
    case 5: return row.absenceSubject;
    case 6: return row.swapType;
    case 7: return isSub ? '' : row.makeupSubject; // 대체면 보강 과목 공백
    case 8: return row.makeupTeacher;              // 교사는 교체/대체 공통 기재
    case 9: return null;                           // (인) 칸은 비움
    case 10: return isSub ? '' : row.makeupDate;
    case 11: return isSub ? '' : row.makeupDay;
    case 12: return isSub ? '' : row.makeupPeriod;
    case 13: return isSub ? '' : row.makeupLocation;
    default: return null;                          // col 0 = 순 (템플릿에 이미 1..10)
  }
}

export function fillLessonSection0(xml: string, input: LessonFillInput): string {
  let out = xml;

  // 1. 교사 성명 — "교사           (인)" 텍스트 노드의 빈 자리에 이름 주입.
  out = out.replace(
    /<hp:t>교사[^<]*<\/hp:t>/,
    () => `<hp:t>교사    ${escapeXml(input.teacherName)}    (인)</hp:t>`,
  );

  // 2. 과목 — "과목             " 텍스트 노드에 과목명 주입.
  out = out.replace(
    /<hp:t>과목[^<]*<\/hp:t>/,
    () => `<hp:t>과목    ${escapeXml(input.subject)}</hp:t>`,
  );

  // 3. 결강 사유 ○표시 — 결강사유 표(colCnt=10)의 ○행(rowAddr=2, colAddr 1..9).
  const reasonSet = new Set(input.reasons);
  out = mapCells(out, 10, (cell, col, row) => {
    if (row !== 2) return cell;          // ○ 행만
    const idx = col - 1;                 // colAddr 1..9 → 사유 인덱스 0..8
    return reasonSet.has(idx) ? setCellText(cell, '○') : cell;
  });

  // 4. 결강·보강 명단 — 메인 표(colCnt=14)의 데이터 행(rowAddr 2..11, 즉 1..10번 행).
  out = mapCells(out, 14, (cell, col, row) => {
    if (row < 2) return cell;            // rowAddr 0,1 = 헤더
    const data = input.rows[row - 2];    // rowAddr 2 → rows[0]
    if (!data) return cell;              // 입력 없는 나머지 행은 빈칸 유지
    const value = valueForColumn(col, data);
    if (!value) return cell;             // null/빈문자열은 주입 생략 (빈칸 유지)
    return setCellText(cell, value);
  });

  return out;
}
