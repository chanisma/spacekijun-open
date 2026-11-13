/**
 * 동아리 단체 봉사활동 확인서 — section0.xml 순수 치환 모듈.
 * (템플릿 ?url import 없음 → Node 테스트 가능. volunteerFormFill.ts와 동일 철학)
 *
 * 일반 단체봉사 확인서(volunteerFormFill)와 다른 점:
 *  - 봉사 주관 영역(자율자치/동아리/진로) √ 표시
 *  - 활동 내용 = 날짜·시간·내용 N개(가변) → 행 재구성
 *  - 명단표 = 날짜별 출석(√) 열이 N개(가변) + 봉사 인정시간(전원 동일 = Σ시간)
 *  - 확인자 직위 = "동아리 담당교사"(템플릿에 이미 존재 → 성명만 기입)
 *
 * 표는 31×14 단일 표 하나. 헤더(0~7)·푸터(30)는 행 내부 문자열 치환,
 * 활동 내용(8~11)·명단(13~29)은 라이브 템플릿 셀을 복제해 가변 재구성한다.
 * HWPX 불변식: 모든 행이 [0,colCnt=14) 타일링, rowAddr 무결(gap 없음),
 * rowCnt = 실제 <hp:tr> 수 = 12 + 활동수(N) + 학생수(M).
 */

export interface ClubFillStudent {
  grade: number; classNum: number; number: number; name: string;
  /** 활동(activities)별 참가 여부. 길이 = activities.length. 없으면 전일 참가(전부 √). */
  attend?: boolean[];
}
export interface ClubFillActivity {
  dateLabel: string;   // 'M.D' (예: '3.27')
  hours: number;       // 시간
  content: string;     // 봉사 내용
}
export interface ClubFillInput {
  issueNo: string;                              // 'YYYY-NNN'
  clubName: string;
  teacherName?: string;                         // 동아리 담당교사(확인자) 성명
  scope: '정규교육과정 내' | '정규교육과정 외';
  area: '자율자치' | '동아리' | '진로';          // 봉사 주관 영역
  org: string; orgTel: string; place: string;
  periodStart: string; periodEnd: string;       // 'YYYY년 M월 D일'
  confirmDate: string;                          // 'YYYY년 M월 D일'
  activities: ClubFillActivity[];
  students: ClubFillStudent[];
}

// ── 표 레이아웃 상수 (템플릿 r15/r14 실측) ──────────────────────────────
const DATE_GRID_START = 4;     // 날짜 열 시작 grid 컬럼
const DATE_GRID_COLS = 9;      // 날짜 열이 차지하는 grid 컬럼 수 (c4..c12)
const DATE_TOTAL_WIDTH = 21258; // 날짜 열 전체 폭(=5248+5184+5184+5642)
const INJEONG_COL = 13;        // 봉사 인정시간 grid 컬럼
export const MAX_CLUB_ACTIVITIES = DATE_GRID_COLS; // 날짜 열 최대 9개

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** total을 n칸에 최대한 고르게 분배 (앞쪽 칸이 +1). 합 = total 보장. */
function distribute(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** N개 날짜 열의 {colAddr, colSpan, width} 배열 — 헤더·본문 동일 사용(열 경계 정렬). */
function dateColumns(n: number): { colAddr: number; colSpan: number; width: number }[] {
  const spans = distribute(DATE_GRID_COLS, n);
  const widths = distribute(DATE_TOTAL_WIDTH, n);
  const out: { colAddr: number; colSpan: number; width: number }[] = [];
  let col = DATE_GRID_START;
  for (let i = 0; i < n; i++) {
    out.push({ colAddr: col, colSpan: spans[i], width: widths[i] });
    col += spans[i];
  }
  return out;
}

// ── 셀 단위 헬퍼 ───────────────────────────────────────────────────────
const ROW_RE = /<hp:tr\b[\s\S]*?<\/hp:tr>/g;
const CELL_RE = /<hp:tc\b[\s\S]*?<\/hp:tc>/g;

function rowByAddr(rows: string[], addr: number): string {
  // rowAddr는 (rowSpan 시작 셀 기준) 정확히 한 행에만 등장한다.
  const r = rows.find(x => x.includes(`rowAddr="${addr}"`));
  if (!r) throw new Error(`row rowAddr=${addr} 없음`);
  return r;
}

function cellByCol(rowXml: string, colAddr: number): string {
  const cells = rowXml.match(CELL_RE) ?? [];
  const c = cells.find(x => x.includes(`colAddr="${colAddr}"`));
  if (!c) throw new Error(`cell colAddr=${colAddr} 없음`);
  return c;
}

/** 셀의 첫 <hp:t>에 값을 넣고 나머지 <hp:t>는 비운다 (run 분할 셀 안전). */
function setCellText(cellXml: string, value: string): string {
  let done = false;
  return cellXml
    .replace(/<hp:t\/>/g, '<hp:t></hp:t>')        // self-closing → 빈 쌍으로 정규화
    .replace(/<hp:t>[\s\S]*?<\/hp:t>/g, () => {
      if (done) return '<hp:t></hp:t>';
      done = true;
      return `<hp:t>${escapeXml(value)}</hp:t>`;
    });
}

/** 2개 문단(날짜/(N시간)) 셀: 첫 <hp:t>=line1, 둘째=line2, 나머지 비움. */
function setCellTwoLines(cellXml: string, line1: string, line2: string): string {
  let i = 0;
  return cellXml
    .replace(/<hp:t\/>/g, '<hp:t></hp:t>')
    .replace(/<hp:t>[\s\S]*?<\/hp:t>/g, () => {
      const v = i === 0 ? line1 : i === 1 ? line2 : '';
      i++;
      return `<hp:t>${escapeXml(v)}</hp:t>`;
    });
}

function setColAddr(cellXml: string, colAddr: number, rowAddr: number): string {
  return cellXml.replace(
    /<hp:cellAddr colAddr="\d+" rowAddr="\d+"\/>/,
    `<hp:cellAddr colAddr="${colAddr}" rowAddr="${rowAddr}"/>`,
  );
}
function setSpan(cellXml: string, colSpan: number, rowSpan: number): string {
  return cellXml.replace(
    /<hp:cellSpan colSpan="\d+" rowSpan="\d+"\/>/,
    `<hp:cellSpan colSpan="${colSpan}" rowSpan="${rowSpan}"/>`,
  );
}
function setWidth(cellXml: string, width: number): string {
  return cellXml.replace(/<hp:cellSz width="\d+"/, `<hp:cellSz width="${width}"`);
}
/** 셀 전체의 rowAddr만 갱신(다중 셀이 한 행을 이룰 때 행 단위 갱신). */
function setRowAddrAll(rowXml: string, rowAddr: number): string {
  return rowXml.replace(/(<hp:cellAddr colAddr="\d+" rowAddr=")\d+("\/>)/g, `$1${rowAddr}$2`);
}
function wrapRow(cells: string[]): string {
  return `<hp:tr>${cells.join('')}</hp:tr>`;
}

// ── 메인 ───────────────────────────────────────────────────────────────
export function fillClubSection0(xml: string, input: ClubFillInput): string {
  const N = input.activities.length;
  const M = input.students.length;
  if (N < 1) throw new Error('활동 내용이 1개 이상이어야 합니다');
  if (N > MAX_CLUB_ACTIVITIES) throw new Error(`활동 내용은 최대 ${MAX_CLUB_ACTIVITIES}개`);
  if (M < 1) throw new Error('학생 명단이 1명 이상이어야 합니다');
  const totalHours = input.activities.reduce((s, a) => s + (a.hours || 0), 0);

  // 0. 노란/베이지 형광(편집 가이드)·MEMO 주석 전역 제거 → 깨끗한 출력 + 복제용 셀 정리
  let out = xml
    .replace(/<hp:markpenBegin\b[^>]*\/>/g, '')
    .replace(/<hp:markpenEnd\/>/g, '')
    .replace(/<hp:ctrl><hp:fieldBegin\b[\s\S]*?<\/hp:fieldBegin><\/hp:ctrl>/g, '')
    .replace(/<hp:ctrl><hp:fieldEnd\b[^>]*\/><\/hp:ctrl>/g, '');

  // 1. 발급번호 (표 밖 제목 문단): "(발급번호: 012 )" → "(발급번호: 2026-003 )"
  out = out.replace(/\(발급번호:[^)]*\)/, `(발급번호: ${escapeXml(input.issueNo)} )`);

  // 1b. 명단표 제목의 "각 동아리명" 자리표시자 → 실제 동아리명
  out = out.replace(/각 동아리명\s*/g, `${escapeXml(input.clubName)} `);

  // 표 추출
  const tblStart = out.indexOf('<hp:tbl');
  const tblEnd = out.indexOf('</hp:tbl>', tblStart) + '</hp:tbl>'.length;
  const tbl = out.slice(tblStart, tblEnd);
  const rows = tbl.match(ROW_RE) ?? [];

  // ── 헤더 행(0~7) 행 단위 치환 ──
  // r1: 단체봉사 구분 — 템플릿에 이미 (√)/(     ) 박스가 있으므로 박스 안 마크만 교체(중복 추가 금지)
  let r1 = rowByAddr(rows, 1);
  const innerIn = input.scope === '정규교육과정 내' ? '√' : ' ';
  const innerOut = input.scope === '정규교육과정 외' ? '√' : ' ';
  r1 = r1
    .replace('(√)', `(${innerIn})`)         // '내' 박스 (템플릿 기본 √)
    .replace(/\( {2,}\)/, `(${innerOut})`); // '외' 박스 (템플릿 기본 공백)

  // r2: 인적 사항 (c2) — "동아리명  대표 외 N-1명(총 N명)"
  let r2 = rowByAddr(rows, 2);
  {
    const rep = input.students[0]?.name ?? '';
    const personLine = `${input.clubName}  ${rep} 외 ${M - 1}명(총 ${M}명)`;
    const c2 = cellByCol(r2, 2);
    r2 = r2.replace(c2, setCellText(c2, personLine));
  }

  // r3: 봉사활동 기간
  let r3 = rowByAddr(rows, 3);
  r3 = r3.replace(
    /\d{4}년\s+\d+월\s+\d+일부터[\s\S]*?일까지/,
    `${escapeXml(input.periodStart)}부터 ${escapeXml(input.periodEnd)}까지`,
  );

  // r4: 봉사활동 기관(c2) + 기관 연락처(c12)
  let r4 = rowByAddr(rows, 4);
  {
    const cOrg = cellByCol(r4, 2);
    r4 = r4.replace(cOrg, setCellText(cOrg, ` ${input.org} `));
    const cTel = cellByCol(r4, 12);
    r4 = r4.replace(cTel, setCellText(cTel, input.orgTel));
  }

  // r6: 봉사 주관 영역 √ — 자율자치(c2)/동아리(c5)/진로(c9)
  let r6 = rowByAddr(rows, 6);
  {
    const areaCol: Record<ClubFillInput['area'], number> = { 자율자치: 2, 동아리: 5, 진로: 9 };
    for (const [, col] of Object.entries(areaCol)) {
      const cell = cellByCol(r6, col);
      r6 = r6.replace(cell, setCellText(cell, col === areaCol[input.area] ? '√' : ''));
    }
  }

  // r7: 활동 장소(c2)
  let r7 = rowByAddr(rows, 7);
  {
    const cPlace = cellByCol(r7, 2);
    r7 = r7.replace(cPlace, setCellText(cPlace, ` ${input.place} `));
  }

  // ── 활동 내용(8~11) 재구성: N행 ──
  const tplAct = rowByAddr(rows, 8);       // [라벨 + 날짜 + 내용]
  const tplActLabel = cellByCol(tplAct, 0);
  const tplActDate = cellByCol(tplAct, 2);
  const tplActContent = cellByCol(tplAct, 6);
  const actRows: string[] = [];
  for (let i = 0; i < N; i++) {
    const ra = 8 + i;
    const a = input.activities[i];
    const dateCell = setColAddr(
      setCellText(tplActDate, `${a.dateLabel} (${a.hours}시간)`), 2, ra);
    const contentCell = setColAddr(setCellText(tplActContent, a.content), 6, ra);
    if (i === 0) {
      // 첫 행에만 "활동 내용" 라벨 셀(rowSpan=N)
      const labelCell = setColAddr(setSpan(tplActLabel, 2, N), 0, ra);
      actRows.push(wrapRow([labelCell, dateCell, contentCell]));
    } else {
      actRows.push(wrapRow([dateCell, contentCell]));
    }
  }

  // ── 명단 헤더(13~14) 재구성 ──
  const cols = dateColumns(N);
  const tplHdr = rowByAddr(rows, 13);
  const tplHdrSun = cellByCol(tplHdr, 0);       // 순 (rowSpan2)
  const tplHdrHak = cellByCol(tplHdr, 1);       // 학번 (rowSpan2)
  const tplHdrName = cellByCol(tplHdr, 3);      // 이름 (rowSpan2)
  const tplHdrGroup = cellByCol(tplHdr, 4);     // 날짜 묶음 헤더 (colSpan9, rowSpan1)
  const tplHdrInjeong = cellByCol(tplHdr, INJEONG_COL); // 봉사 인정시간 (rowSpan2)
  const tplDateHdr = cellByCol(rowByAddr(rows, 14), 4); // 날짜 1칸 (2문단: 날짜/(N시간))

  const hdrRow1Addr = 8 + N + 1; // 활동 N행 + 구분행(r12) 다음
  const sun = setColAddr(setCellText(tplHdrSun, ' 순'), 0, hdrRow1Addr);
  const hak = setColAddr(setCellText(tplHdrHak, '학번'), 1, hdrRow1Addr);
  const name = setColAddr(setCellText(tplHdrName, '이름'), 3, hdrRow1Addr);
  const group = setColAddr(setCellText(tplHdrGroup, '동아리 봉사 일정 및 봉사 시간'), 4, hdrRow1Addr);
  // 2문단 셀("봉사 인정시간" / "(N시간)") — 두 줄로 채워 빈 문단(공백 줄) 방지
  const injeong = setColAddr(setCellTwoLines(tplHdrInjeong, '봉사 인정시간', `(${totalHours}시간)`), INJEONG_COL, hdrRow1Addr);
  const hdrRow1 = wrapRow([sun, hak, name, group, injeong]);

  const hdrRow2Addr = hdrRow1Addr + 1;
  const dateHdrCells = cols.map((c, i) => {
    const a = input.activities[i];
    let cell = setCellTwoLines(tplDateHdr, a.dateLabel, `(${a.hours}시간)`);
    cell = setColAddr(setSpan(setWidth(cell, c.width), c.colSpan, 1), c.colAddr, hdrRow2Addr);
    return cell;
  });
  const hdrRow2 = wrapRow(dateHdrCells);

  // ── 명단 본문(15~) 재구성: M행, 전원 √ ──
  const tplBody = rowByAddr(rows, 15);
  const tplBodySun = cellByCol(tplBody, 0);
  const tplBodyHak = cellByCol(tplBody, 1);
  const tplBodyName = cellByCol(tplBody, 3);
  const tplBodyDate = cellByCol(tplBody, 4);             // √ 셀
  const tplBodyInjeong = cellByCol(tplBody, INJEONG_COL);
  const bodyRows: string[] = [];
  for (let m = 0; m < M; m++) {
    const ra = hdrRow2Addr + 1 + m;
    const s = input.students[m];
    const attended = (i: number) => (s.attend ? !!s.attend[i] : true);
    // 학생별 인정시간 = 참가한 날짜의 시간 합 (부분 참가 반영). attend 없으면 전체 합.
    const stuHours = s.attend
      ? input.activities.reduce((sum, a, i) => sum + (attended(i) ? (a.hours || 0) : 0), 0)
      : totalHours;
    const hakno = `${s.grade}${String(s.classNum).padStart(2, '0')}${String(s.number).padStart(2, '0')}`;
    const cellsRow = [
      setColAddr(setCellText(tplBodySun, String(m + 1)), 0, ra),
      setColAddr(setCellText(tplBodyHak, hakno), 1, ra),
      setColAddr(setCellText(tplBodyName, s.name), 3, ra),
      ...cols.map((c, i) =>
        setColAddr(setSpan(setWidth(setCellText(tplBodyDate, attended(i) ? '√' : ''), c.width), c.colSpan, 1), c.colAddr, ra)),
      setColAddr(setCellText(tplBodyInjeong, String(stuHours)), INJEONG_COL, ra),
    ];
    bodyRows.push(wrapRow(cellsRow));
  }

  // ── 푸터(30) ──
  let r30 = rowByAddr(rows, 30);
  // 확인 날짜
  r30 = r30.replace(/\d{4}년\s+\d+월\s+\d+일/, escapeXml(input.confirmDate));
  // 확인자 성명: "성명+사인" 자리표시자 → 담당교사명 (없으면 공백)
  r30 = r30.replace('성명+사인', escapeXml(input.teacherName ?? ''));
  const footerAddr = hdrRow2Addr + 1 + M;
  r30 = setRowAddrAll(r30, footerAddr);

  // ── 구분행(r12) rowAddr 갱신 ──
  let r12 = rowByAddr(rows, 12);
  r12 = setRowAddrAll(r12, 8 + N);

  // ── 행 재조립: 0..7(고정) + 활동N + 구분 + 헤더2 + 본문M + 푸터 ──
  const r0 = rowByAddr(rows, 0);
  const r5 = rowByAddr(rows, 5);
  const headRows = [r0, r1, r2, r3, r4, r5, r6, r7];
  const rebuilt =
    headRows.join('') +
    actRows.join('') +
    r12 +
    hdrRow1 + hdrRow2 +
    bodyRows.join('') +
    r30;

  // 표 영역을 재조립 행으로 교체 + rowCnt 갱신
  const firstTrPos = tbl.indexOf(rows[0]);
  const lastTr = rows[rows.length - 1];
  const lastTrEnd = tbl.indexOf(lastTr) + lastTr.length;
  let newTbl = tbl.slice(0, firstTrPos) + rebuilt + tbl.slice(lastTrEnd);
  const totalRows = 12 + N + M;
  newTbl = newTbl.replace(/(<hp:tbl\b[^>]*\browCnt=")\d+(")/, `$1${totalRows}$2`);

  out = out.slice(0, tblStart) + newTbl + out.slice(tblEnd);
  return out;
}
