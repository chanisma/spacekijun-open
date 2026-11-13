// HWPX 섹션 XML 구조 인덱서 + 편집 프리미티브.
// DOM 비의존(순수 문자열) — 브라우저와 node 회귀 스크립트에서 동일 동작.
// 편집은 원본 오프셋 기준 Edit 목록으로 수집 후 일괄 적용(applyEdits)한다.

export interface TPart {
  start: number; // <hp:t> 내부 시작(원시)
  end: number;
  text: string; // 이 조각의 디코딩 텍스트
}

export interface RunNode {
  start: number;
  end: number; // 런 전체(</hp:run> 뒤 또는 self-close 뒤)
  charPr: string;
  selfClosing: boolean;
  /** 런 안의 <hp:t> 조각들(하나의 런에 여러 개 존재 가능 — 필드·컨트롤 사이) */
  tParts: TPart[];
  /** 닫는 </hp:run> 시작 오프셋(self-close면 null) — t 미존재 시 삽입 지점 */
  closeTagStart: number | null;
  text: string; // 디코딩·태그제거 텍스트(전 조각 결합)
}

export interface ParaNode {
  start: number;
  end: number;
  runs: RunNode[];
  text: string;
}

export interface CellNode {
  start: number;
  end: number;
  addr: { row: number; col: number };
  span: { rows: number; cols: number };
  paragraphs: ParaNode[];
  tables: TableNode[]; // 중첩 표
  text: string; // 문단 텍스트 '\n' 결합
}

export interface RowNode {
  start: number;
  end: number;
  cells: CellNode[];
}

export interface TableNode {
  start: number;
  end: number;
  index: number; // 문서 등장 순서(중첩 포함)
  id: string;
  rowCnt: number;
  colCnt: number;
  rows: RowNode[];
  headerFingerprint: string; // 0행 셀 텍스트 결합
}

export interface FieldNode {
  start: number;
  type: string; // CLICK_HERE | MEMO | ...
  fieldId: string;
  /** 필드 구간 내 텍스트(간이: fieldEnd까지의 hp:t 결합) */
  innerText: string;
}

export interface HwpxIndex {
  xml: string;
  tables: TableNode[]; // 등장 순서(중첩 포함)
  topParagraphs: ParaNode[]; // 표 밖 문단
  allParagraphs: ParaNode[]; // 전체(셀 내부 포함, 문서 순서)
  fields: FieldNode[];
  fullText: string; // 디코딩 전체 텍스트(잔여물 검사용)
  /** 표 컨텍스트 없이 파싱된 행(행 XML 프래그먼트 재색인용) */
  orphanRows: RowNode[];
}

export interface Edit {
  start: number;
  end: number;
  text: string;
}

/**
 * 구조 태그 토크나이저.
 *
 * `(?![\w.:-])`가 **필수**다(2026-07-27 실측). 이게 없으면 대안 목록이 접두 일치를 해서
 * `<hp:pos .../>`·`<hp:parameters>`·`<hp:pageNum/>`이 전부 `hp:p`로 읽힌다. 그중 자기완결
 * 태그(`hp:pos` 등)는 아래 hp:p 분기가 push만 하고 pop하지 않아 **문단 스택이 영구히
 * 어긋난다** — form2 픽스처 section1에 `hp:pos` 19개가 있어, 표를 감싼 문단이
 * topParagraphs에서 통째로 빠지고 그 문단의 런 텍스트가 fullText에 들어오지 않았다.
 * 그 결과 verify의 잔여물 검사가 거짓 음성을 냈다(원문에 남은 예시 문구를 0건으로 통과).
 */
const TAG_RE = /<(\/?)(hp:tbl|hp:tr|hp:tc|hp:p|hp:run|hp:t|hp:cellAddr|hp:cellSpan|hp:fieldBegin|hp:fieldEnd)(?![\w.:-])((?:"[^"]*"|[^>])*?)(\/?)>/g;

export function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, '') // hp:t 내부의 lineBreak 등 태그 제거
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attr(attrs: string, name: string): string {
  const m = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : '';
}

export function parseHwpxSection(xml: string): HwpxIndex {
  const tables: TableNode[] = [];
  const topParagraphs: ParaNode[] = [];
  const allParagraphs: ParaNode[] = [];
  const fields: FieldNode[] = [];
  const orphanRows: RowNode[] = [];

  const tblStack: TableNode[] = [];
  const rowStack: RowNode[] = [];
  const cellStack: CellNode[] = [];
  const paraStack: ParaNode[] = [];
  const runStack: RunNode[] = [];
  let tableCounter = 0;
  let openField: { start: number; type: string; fieldId: string; texts: string[] } | null = null;

  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(xml))) {
    const [full, close, tag, attrs, self] = m;
    const at = m.index;
    const after = at + full.length;

    if (tag === 'hp:t') {
      if (close) continue; // 열림에서 짝을 찾으므로 여기선 무시
      const run = runStack[runStack.length - 1];
      if (self) {
        if (run) run.tParts.push({ start: after, end: after, text: '' });
        continue;
      }
      // 짝이 되는 </hp:t> 탐색(중첩 없음 가정 — HWPX에서 hp:t는 중첩되지 않음)
      const closeIdx = xml.indexOf('</hp:t>', after);
      if (closeIdx < 0) continue;
      const inner = xml.slice(after, closeIdx);
      const decoded = decodeEntities(inner);
      if (run) {
        run.tParts.push({ start: after, end: closeIdx, text: decoded });
        run.text += decoded;
      }
      if (openField) openField.texts.push(decoded);
      TAG_RE.lastIndex = closeIdx + '</hp:t>'.length;
      continue;
    }

    if (tag === 'hp:fieldBegin' && !close) {
      openField = { start: at, type: attr(attrs, 'type'), fieldId: attr(attrs, 'fieldid'), texts: [] };
      continue;
    }
    if (tag === 'hp:fieldEnd' && openField) {
      fields.push({
        start: openField.start,
        type: openField.type,
        fieldId: attr(attrs, 'beginIDRef') ? openField.fieldId : openField.fieldId,
        innerText: openField.texts.join(''),
      });
      openField = null;
      continue;
    }

    if (tag === 'hp:cellAddr' && cellStack.length) {
      const c = cellStack[cellStack.length - 1];
      c.addr = { row: Number(attr(attrs, 'rowAddr')), col: Number(attr(attrs, 'colAddr')) };
      continue;
    }
    if (tag === 'hp:cellSpan' && cellStack.length) {
      const c = cellStack[cellStack.length - 1];
      c.span = { rows: Number(attr(attrs, 'rowSpan')), cols: Number(attr(attrs, 'colSpan')) };
      continue;
    }

    if (tag === 'hp:tbl') {
      if (!close) {
        const t: TableNode = {
          start: at, end: -1, index: tableCounter++,
          id: attr(attrs, 'id'),
          rowCnt: Number(attr(attrs, 'rowCnt') || 0),
          colCnt: Number(attr(attrs, 'colCnt') || 0),
          rows: [], headerFingerprint: '',
        };
        tblStack.push(t);
        tables.push(t);
        if (cellStack.length) cellStack[cellStack.length - 1].tables.push(t);
      } else {
        const t = tblStack.pop();
        if (t) {
          t.end = after;
          t.headerFingerprint = t.rows[0] ? t.rows[0].cells.map((c) => c.text).join('|') : '';
        }
      }
      continue;
    }
    if (tag === 'hp:tr') {
      if (!close) rowStack.push({ start: at, end: -1, cells: [] });
      else {
        const r = rowStack.pop();
        if (r) {
          r.end = after;
          const t = tblStack[tblStack.length - 1];
          if (t) t.rows.push(r);
          else orphanRows.push(r);
        }
      }
      continue;
    }
    if (tag === 'hp:tc') {
      if (!close) {
        cellStack.push({ start: at, end: -1, addr: { row: -1, col: -1 }, span: { rows: 1, cols: 1 }, paragraphs: [], tables: [], text: '' });
      } else {
        const c = cellStack.pop();
        if (c) {
          c.end = after;
          c.text = c.paragraphs.map((p) => p.text).join('\n');
          const r = rowStack[rowStack.length - 1];
          if (r) r.cells.push(c);
        }
      }
      continue;
    }
    if (tag === 'hp:p') {
      const commit = (p: ParaNode) => {
        p.text = p.runs.map((r) => r.text).join('');
        allParagraphs.push(p);
        if (cellStack.length) cellStack[cellStack.length - 1].paragraphs.push(p);
        else if (!tblStack.length) topParagraphs.push(p);
      };
      if (!close) {
        // 자기완결 `<hp:p/>`(런 없는 빈 문단)를 push하면 짝이 없어 스택이 어긋나고
        // 이후 모든 문단 경계가 밀린다 — 즉시 완결시킨다.
        if (self) commit({ start: at, end: after, runs: [], text: '' });
        else paraStack.push({ start: at, end: -1, runs: [], text: '' });
      } else {
        const p = paraStack.pop();
        if (p) {
          p.end = after;
          commit(p);
        }
      }
      continue;
    }
    if (tag === 'hp:run') {
      if (!close) {
        const r: RunNode = { start: at, end: -1, charPr: attr(attrs, 'charPrIDRef'), selfClosing: !!self, tParts: [], closeTagStart: null, text: '' };
        if (self) {
          r.end = after;
          const p = paraStack[paraStack.length - 1];
          if (p) p.runs.push(r);
        } else runStack.push(r);
      } else {
        const r = runStack.pop();
        if (r) {
          r.closeTagStart = at;
          r.end = after;
          const p = paraStack[paraStack.length - 1];
          if (p) p.runs.push(r);
        }
      }
      continue;
    }
  }

  // 셀 내부 문단이 allParagraphs에 셀 종료 시점 순으로 들어가므로 시작 오프셋 기준 정렬
  allParagraphs.sort((a, b) => a.start - b.start);
  const fullText = allParagraphs.map((p) => p.text).join('\n');
  return { xml, tables, topParagraphs, allParagraphs, fields, fullText, orphanRows };
}

/**
 * 원문 XML의 `<hp:t>` 조각만 훑어 만든 본문 텍스트(2026-07-27).
 *
 * `parseHwpxSection().fullText`는 문단 스택이 어긋나면 조용히 텍스트를 흘린다 —
 * 파서 버그가 곧 검증 구멍이 되므로(실측: 잔여물 검사 거짓 음성) 잔여물처럼
 * "문서에 이 문자열이 남아 있는가"를 묻는 검사는 이 함수를 쓴다.
 *
 * 문단 경계에서만 `\n`을 넣어 fullText와 같은 이음매를 유지한다(조각을 무조건 이어
 * 붙이면 멀리 떨어진 두 문단이 우연히 패턴을 만들어 거짓 양성이 된다).
 */
export function rawSectionText(xml: string): string {
  const re = /<hp:t(?:\s(?:"[^"]*"|[^>])*?)?>((?:(?!<\/hp:t>)[\s\S])*)<\/hp:t>/g;
  const out: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (out.length && xml.slice(last, m.index).includes('</hp:p>')) out.push('\n');
    out.push(decodeEntities(m[1]));
    last = re.lastIndex;
  }
  return out.join('');
}

/** 편집 목록 일괄 적용. 겹침 금지(정렬 후 역순 적용) */
export function applyEdits(xml: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].end > sorted[i - 1].start) throw new Error(`overlapping edits at ${sorted[i].start}`);
  }
  let out = xml;
  for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/**
 * 런에 기록할 텍스트의 XML 인코딩.
 *
 * `\n`은 `<hp:lineBreak/>`로 바꾼다 — 셀 값은 단일 런에 통째로 들어가므로 날 줄바꿈은
 * 렌더되지 않는다(원본 양식도 강제 줄바꿈에 이 태그를 쓴다). 우리가 **기록하는 텍스트에만**
 * 적용되므로 원문의 공백은 건드리지 않는다.
 */
function encodeRunText(text: string): string {
  return escapeXml(text).replace(/\r?\n/g, '<hp:lineBreak/>');
}

/** 런의 텍스트를 통째로 설정하는 Edit들(첫 t 조각에 기록, 나머지 조각 비움) */
export function editsSetRunText(run: RunNode, text: string): Edit[] {
  const esc = encodeRunText(text);
  if (run.tParts.length) {
    const out: Edit[] = [{ start: run.tParts[0].start, end: run.tParts[0].end, text: esc }];
    for (let i = 1; i < run.tParts.length; i++) {
      const p = run.tParts[i];
      if (p.end > p.start) out.push({ start: p.start, end: p.end, text: '' });
    }
    return out;
  }
  if (run.selfClosing) {
    // <hp:run .../> → <hp:run ...><hp:t>..</hp:t></hp:run>
    return [{ start: run.end - 2, end: run.end, text: `><hp:t>${esc}</hp:t></hp:run>` }];
  }
  // t 없는 컨테이너 런: 닫는 태그 앞에 t 삽입
  const at = run.closeTagStart ?? run.end;
  return [{ start: at, end: at, text: `<hp:t>${esc}</hp:t>` }];
}

/**
 * 편집한 문단의 줄 레이아웃 캐시(`<hp:linesegarray>`) 제거 edit.
 *
 * linesegarray는 한글이 저장 시 계산해 둔 줄 나눔·세그먼트 폭(horzsize) 캐시다.
 * 텍스트를 바꾸면 stale이 되어 렌더러가 **옛 폭에 새 텍스트를 밀어넣는다**
 * (실측 2026-07-27: 21자 문단을 132자로 교체 시 한 줄이 986px로 늘어나 페이지를
 * 넘고, 캐시를 제거하면 718px에서 정상 줄바꿈). 짧아지는 경우엔 반대로 글자 사이가
 * 벌어져 보인다. 뷰어·한글 모두 열 때 레이아웃을 재계산하므로 제거가 안전하다.
 *
 * 문단의 **자기 linesegarray는 항상 마지막 자식**이므로(중첩 표의 셀 문단 것들은 앞에
 * 온다) 닫는 `</hp:p>` 직전의 것을 고른다.
 */
export function editsClearLineSeg(xml: string, para: { start: number; end: number }): Edit[] {
  const seg = xml.slice(para.start, para.end);
  const closeIdx = seg.lastIndexOf('</hp:p>');
  const scope = closeIdx >= 0 ? seg.slice(0, closeIdx) : seg;
  const openIdx = scope.lastIndexOf('<hp:linesegarray>');
  if (openIdx < 0) return [];
  const closeTag = scope.indexOf('</hp:linesegarray>', openIdx);
  if (closeTag < 0) return [];
  const end = closeTag + '</hp:linesegarray>'.length;
  return [{ start: para.start + openIdx, end: para.start + end, text: '' }];
}

/** 셀 텍스트를 단일 값으로 설정: 첫 런에 기록, 나머지 런 텍스트 비움 */
export function editsSetCellText(cell: CellNode, text: string): Edit[] {
  const edits: Edit[] = [];
  let placed = false;
  for (const p of cell.paragraphs) {
    for (const r of p.runs) {
      if (!placed) {
        edits.push(...editsSetRunText(r, text));
        placed = true;
      } else {
        for (const tp of r.tParts) {
          if (tp.end > tp.start) edits.push({ start: tp.start, end: tp.end, text: '' });
        }
      }
    }
  }
  if (!placed && cell.paragraphs.length) {
    // 런이 전혀 없는 문단: 문단 닫힘 직전 삽입은 linesegarray 앞이어야 하므로 미지원 → 호출측 stale 처리
    throw new Error('cell has no run to write into');
  }
  return edits;
}

/**
 * 셀을 단일 값으로 교체하되 **여분 문단을 제거**한다(2026-07-27).
 *
 * `editsSetCellText`는 첫 런에만 쓰고 나머지 문단의 텍스트를 비운다 — 빈 문단은 그대로
 * 남으므로, 문단이 여럿인 셀을 **복제 원본**으로 쓰면 값 아래로 빈 줄이 줄줄이 남는다
 * (실측: 양식의 반복 행 원본은 한 셀이 7~9문단, 수행평가 표의 유의사항 셀은 4문단).
 * 값을 기록한 문단 하나만 남기고 나머지 문단을 통째로 지운다.
 *
 * 중첩 표를 담은 셀은 문단을 지우면 표까지 사라지므로 기존 동작을 유지한다.
 */
export function editsSetCellSingleValue(xml: string, cell: CellNode, text: string): Edit[] {
  const target = cell.paragraphs.find((p) => p.runs.length > 0);
  if (!target) throw new Error('cell has no run to write into');
  if (cell.tables.length > 0) return editsSetCellText(cell, text);
  const edits: Edit[] = [...editsSetRunText(target.runs[0], text)];
  for (let r = 1; r < target.runs.length; r++) {
    for (const tp of target.runs[r].tParts) {
      if (tp.end > tp.start) edits.push({ start: tp.start, end: tp.end, text: '' });
    }
  }
  for (const p of cell.paragraphs) {
    if (p !== target) edits.push({ start: p.start, end: p.end, text: '' });
  }
  edits.push(...editsClearLineSeg(xml, target));
  return edits;
}

/**
 * 셀(또는 문단 집합) 텍스트에서 부분 문자열의 원시 오프셋 탐색.
 * 런 경계를 넘는 매치는 다중 세그먼트로 반환한다(세그먼트별 치환 가능).
 */
export interface TextHit {
  segments: { start: number; end: number }[]; // 원시 xml 상의 치환 대상 구간들
  runIdxs: number[];
}

export function findInParagraphs(xml: string, paras: ParaNode[], needle: string, occurrence = 1): TextHit | null {
  // 디코딩 텍스트 연결 + 문자→원시구간 매핑 테이블 구축(t 조각 단위)
  type Seg = { runT: { start: number; end: number }; text: string };
  const segs: Seg[] = [];
  for (const p of paras) {
    for (const r of p.runs) {
      for (const tp of r.tParts) {
        if (tp.text) segs.push({ runT: { start: tp.start, end: tp.end }, text: tp.text });
      }
    }
  }
  const joined = segs.map((s) => s.text).join('');
  let from = 0;
  let idx = -1;
  for (let n = 0; n < occurrence; n++) {
    idx = joined.indexOf(needle, from);
    if (idx < 0) return null;
    from = idx + 1;
  }
  // idx..idx+len 을 세그먼트로 분해
  const hits: TextHit = { segments: [], runIdxs: [] };
  let cursor = 0;
  let remainStart = idx;
  let remainLen = needle.length;
  for (let si = 0; si < segs.length && remainLen > 0; si++) {
    const s = segs[si];
    const segLen = s.text.length;
    if (cursor + segLen <= remainStart) {
      cursor += segLen;
      continue;
    }
    const localStart = Math.max(0, remainStart - cursor);
    const take = Math.min(segLen - localStart, remainLen);
    // 주의: 디코딩 텍스트 오프셋 ≠ 원시 오프셋(엔티티·내부 태그). 원시 inner에서
    // 재탐색하되, 같은 문자열이 런에 여러 번 있을 수 있으므로 디코딩 접두에서의
    // 등장 횟수만큼 건너뛴 n번째 일치를 잡는다.
    const rawInner = xml.slice(s.runT.start, s.runT.end);
    const decTarget = s.text.slice(localStart, localStart + take);
    const rawTarget = escapeXml(decTarget);
    let priorCount = 0;
    for (let k = s.text.indexOf(decTarget); k >= 0 && k < localStart; k = s.text.indexOf(decTarget, k + 1)) priorCount++;
    let rawIdx = -1;
    for (let k = 0, from = 0; k <= priorCount; k++) {
      rawIdx = rawInner.indexOf(rawTarget, from);
      if (rawIdx < 0) break;
      from = rawIdx + 1;
    }
    if (rawIdx < 0) return null; // 내부 태그가 낀 경우 — 이 매치는 사용 불가
    hits.segments.push({ start: s.runT.start + rawIdx, end: s.runT.start + rawIdx + rawTarget.length });
    hits.runIdxs.push(si);
    remainStart += take;
    remainLen -= take;
    cursor += segLen;
  }
  return remainLen === 0 ? hits : null;
}

/** 행 XML 조각에서 rowAddr 재부여 */
export function renumberRowXml(rowXml: string, newRow: number): string {
  const cells = parseHwpxSection(rowXml).orphanRows[0]?.cells ?? [];
  return applyEdits(rowXml, cells.map((cell) => editCellAttribute(rowXml, cell, 'cellAddr', 'rowAddr', newRow)));
}

/** Edit only a cell's own metadata; nested tables have independent coordinates. */
export function editCellAttribute(
  xml: string, cell: CellNode, tag: string, attribute: string, value: number,
): Edit {
  const re = new RegExp(`<hp:${tag}\\b[^>]*\\b${attribute}="(\\d+)"`, 'g');
  re.lastIndex = cell.start;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) && match.index < cell.end) {
    if (cell.tables.some((table) => table.start <= match!.index && match!.index < table.end)) continue;
    const start = match.index + match[0].lastIndexOf('"') - match[1].length;
    return { start, end: start + match[1].length, text: String(value) };
  }
  throw new Error(`셀 속성 누락: ${tag}.${attribute}`);
}

/** 표의 rowCnt 속성 갱신 Edit */
export function editSetRowCnt(xml: string, table: TableNode, rowCnt: number): Edit | null {
  const openEnd = xml.indexOf('>', table.start);
  const openTag = xml.slice(table.start, openEnd);
  const m = /rowCnt="(\d+)"/.exec(openTag);
  if (!m) return null;
  const at = table.start + (m.index as number);
  return { start: at, end: at + m[0].length, text: `rowCnt="${rowCnt}"` };
}
