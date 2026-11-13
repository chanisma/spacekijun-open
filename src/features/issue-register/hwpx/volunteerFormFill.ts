export interface FillInput {
  school: string;
  issueNo: string;                            // 발급번호 'YYYY-NNN'
  grade: number; classNumber: number;
  repName: string; totalCount: number;
  periodStart: string; periodEnd: string;   // 'YYYY.M.D'
  org: string; orgTel: string;
  area: '이웃돕기활동' | '환경보호활동' | '캠페인활동';
  place: string; content: string;
  confirmDate: string;                        // 'YYYY년 M월 D일'
  confirmerName?: string;                     // 확인자(담임교사) 성명 — 없으면 미표기
  participants: { grade: number; classNum: number; number: number; name: string; hours: number }[];
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 한 명단 <hp:tr>(템플릿 데이터 행)을 참여자 값으로 치환해 새 행 문자열 생성.
 * 템플릿 행의 셀 서식(<hp:tc> 테두리·문단·문자 속성)을 그대로 승계하고,
 * <hp:t> 텍스트 노드를 colAddr 순서대로 등장하는 순서에 맞춰 교체한다.
 *
 * 셀 텍스트 등장 순서 (검증된 템플릿 구조):
 *   [학년, 반, 번호, 성명, 인정시간] (좌측 학생) + [학년, 반, 번호, 성명, 인정시간] (우측 학생)
 */
function buildRosterRow(
  templateRow: string,
  rowAddr: number,
  left: { grade: number; classNum: number; number: number; name: string; hours: number },
  right: { grade: number; classNum: number; number: number; name: string; hours: number } | null,
): string {
  const leftVals = [String(left.grade), String(left.classNum), String(left.number), left.name, String(left.hours)];
  const rightVals = right
    ? [String(right.grade), String(right.classNum), String(right.number), right.name, String(right.hours)]
    : ['', '', '', '', ''];
  const vals = [...leftVals, ...rightVals];

  let i = 0;
  let row = templateRow.replace(/(<hp:t>)([^<]*)(<\/hp:t>)/g, (_m, open, _txt, close) => {
    const v = vals[i] !== undefined ? escapeXml(vals[i]) : '';
    i++;
    return `${open}${v}${close}`;
  });
  // 모든 셀의 rowAddr를 이 행의 실제 인덱스로 재계산 (한글 테이블 정합성)
  row = row.replace(/rowAddr="\d+"/g, `rowAddr="${rowAddr}"`);
  return row;
}

export function fillVolunteerSection0(xml: string, input: FillInput): string {
  let out = xml;

  // 0. 발급번호 (상단): "(발급번호:    )" → "(발급번호: 2026-002)"
  out = out.replace(
    /\(발급번호:[^)]*\)/,
    `(발급번호: ${escapeXml(input.issueNo)})`
  );

  // 1. 인적사항 (tr#2): "...학교   3학년   5반  성명 : 강현수 외 19명(총 20명)"
  //    텍스트가 run-split 되어 있어 안정적 fragment(학교 이후)로 매칭.
  out = out.replace(
    /학교\s+\d+학년\s+\d+반\s+성명\s*:\s*[^<]*?외\s*\d+명\(총\s*\d+명\)/,
    `학교   ${input.grade}학년   ${input.classNumber}반  성명 : ${escapeXml(input.repName)} 외 ${input.totalCount - 1}명(총 ${input.totalCount}명)`
  );

  // 2. 봉사활동 기간 (tr#3): "2023 년  3월  15일부터 2023 년  3월 15일까지"
  out = out.replace(
    /\d{4}\s*년[^<]*?일부터[^<]*?일까지/,
    `${escapeXml(input.periodStart)}부터 ${escapeXml(input.periodEnd)}까지`
  );

  // 3. 봉사 영역 (tr#5): 선택 영역에 √, 나머지 공백
  const chk = (a: string) => input.area === a ? '  √  ' : '     ';
  out = out.replace(
    /이웃돕기활동\([^)]*\)\s*환경보호활동\([^)]*\)\s*캠페인활동\([^)]*\)/,
    `이웃돕기활동(${chk('이웃돕기활동')})    환경보호활동(${chk('환경보호활동')})    캠페인활동(${chk('캠페인활동')}) `
  );

  // 4. 활동 내용 (tr#7): "자연환경 보호활동" 값 run 교체
  out = out.replace(
    /(<hp:t>)자연환경 보호활동(<\/hp:t>)/,
    `$1${escapeXml(input.content)}$2`
  );

  // 5. 명단표 (tr#10~26): 템플릿 데이터 행 추출 → 참여자로 재구성
  const trRe = /<hp:tr\b[\s\S]*?<\/hp:tr>/g;
  const allRows = out.match(trRe);
  if (!allRows) return out;

  // 데이터 행 = rowAddr 10인 행 (헤더 rowAddr=9 다음)
  const templateRowIdx = allRows.findIndex(r => /rowAddr="10"/.test(r));
  const confirmRowIdx = allRows.findIndex(r => /rowAddr="27"/.test(r));
  if (templateRowIdx === -1 || confirmRowIdx === -1) return out;

  const templateRow = allRows[templateRowIdx];

  // 참여자를 2명/행으로 묶어 새 행 생성, rowAddr는 10부터
  const newRows: string[] = [];
  for (let p = 0; p < input.participants.length; p += 2) {
    const rowAddr = 10 + Math.floor(p / 2);
    newRows.push(buildRosterRow(templateRow, rowAddr,
      input.participants[p], input.participants[p + 1] ?? null));
  }

  // 확인 날짜 행(원래 rowAddr=27)을 명단 바로 다음 rowAddr로 재배치 — rowAddr 연속성 보장.
  // (행을 추가/삭제했으므로 27 고정 시 gap 발생 → 한글이 "손상"으로 거부)
  const confirmRowAddr = 10 + newRows.length;
  const confirmRow = allRows[confirmRowIdx].replace(/rowAddr="\d+"/g, `rowAddr="${confirmRowAddr}"`);

  // 기존 데이터 행(templateRowIdx ~ confirmRowIdx 직전)을 newRows로 교체.
  const before = allRows.slice(0, templateRowIdx).join('');
  const after = [confirmRow, ...allRows.slice(confirmRowIdx + 1)].join('');
  const rebuilt = before + newRows.join('') + after;

  // 원본 테이블 영역(allRows 전체 범위)을 rebuilt로 교체.
  const firstTrPos = out.indexOf(allRows[0]);
  const lastTr = allRows[allRows.length - 1];
  const lastTrEnd = out.indexOf(lastTr, firstTrPos) + lastTr.length;
  out = out.slice(0, firstTrPos) + rebuilt + out.slice(lastTrEnd);

  // 테이블 rowCnt를 실제 행 수로 갱신 — 헤더/정보 10행 + 명단행 + 확인행 1.
  // (선언 rowCnt ≠ 실제 <hp:tr> 수이면 한글이 "파일 손상"으로 거부)
  const totalRows = 10 + newRows.length + 1;
  out = out.replace(/(<hp:tbl\b[^>]*\browCnt=")\d+(")/, `$1${totalRows}$2`);

  // 6. 확인 날짜 (tr#27): "2023년   3월  15일"
  out = out.replace(/\d{4}년\s+\d+월\s+\d+일/, escapeXml(input.confirmDate));

  // 7. 확인자 성명 (하단): 템플릿에 이미 있는 확인자 줄
  //    "확  인  자 : 직위<fwSpace> 교사  성명<fwSpace><fwSpace> 권민결  (인, 서명)"의
  //    "권민결"(하드코딩된 예시명)을 담임교사명으로 치환한다. 확인기관명(학교장) 줄은 보존.
  //    "성명...권민결"으로 앵커링해 본문 다른 곳의 동명이인 학생명과 충돌 방지.
  //    담임 미지정이면 예시명을 공백으로(잘못된 이름이 남지 않도록).
  out = out.replace(
    /(성명(?:<hp:fwSpace\/>)*\s*)권민결/,
    `$1${escapeXml(input.confirmerName ?? '')}`,
  );

  return out;
}
