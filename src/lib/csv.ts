// ========================================
// RFC 4180 CSV 리더 (공용)
//
// 원래 `dutyCsv.ts` 안에 있던 함수를 꺼낸 것이다. 일괄 업무 CSV와 NEIS 지필평가 CSV가
// **같은 함정**을 공유하기 때문이다 — 데이터 칸 안에 쉼표가 들어간다(담당자 `"홍길동,김철수"`,
// 학생 답안 `"3,5|2|4"`). 줄을 `split(',')` 하는 순간 그 뒤 열이 통째로 한 칸씩 밀린다.
// 두 곳이 각자 파서를 갖고 있으면 한쪽만 고쳐지므로 여기 하나만 둔다.
// `dutyCsv.ts`는 호환을 위해 계속 re-export 한다.
// ========================================

/**
 * RFC 4180 CSV 파싱 — 따옴표 안의 쉼표·줄바꿈은 구분자로 보지 않는다.
 * 텍스트 전체를 한 번에 훑어야 따옴표 안의 줄바꿈까지 살릴 수 있다(줄 단위로 먼저
 * 자르면 그 행이 깨진다). 값은 trim 하고, 전부 빈 행은 버린다.
 */
export function parseCsvRows(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // UTF-8 BOM 제거
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"'; // 이스케이프된 따옴표("")
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++; // CRLF
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  row.push(field);
  rows.push(row);

  return rows
    .map((cells) => cells.map((value) => value.trim()))
    .filter((cells) => cells.some((value) => value !== ''));
}

/**
 * 첫 행을 헤더로 보고 열 이름 → 인덱스 맵을 만든다.
 * 같은 이름이 두 번 나오면 **먼저 나온 열**을 쓴다(NEIS 내려받기에 중복 헤더가 없지만,
 * 뒤 열이 조용히 앞 열을 덮어쓰면 원인을 찾기 어려운 종류의 버그가 된다).
 */
export function headerIndex(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((name, index) => {
    const key = name.trim();
    if (key !== '' && !map.has(key)) map.set(key, index);
  });
  return map;
}
