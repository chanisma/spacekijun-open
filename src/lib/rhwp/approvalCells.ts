/**
 * HWPX 결재란 칸 찾기 + 서명 그림 삽입 — 순수 로직(의존성 없음. WASM·DOM·zip 모두 안 씀).
 *
 * ## 왜 레이아웃이 아니라 XML만 보는가 (2026-08-14 전면 교체)
 *
 * 처음에는 `@rhwp/core`의 `insertPictureEx(cellPath)`로 넣었는데, 그 API는 문서에 적힌 대로
 * **"표 셀 영역에 floating picture"**를 만든다 — 결과 XML이
 * `<hp:pos treatAsChar="0" vertRelTo="PAPER" horzRelTo="PAPER" vertOffset=… horzOffset=…>`,
 * 즉 **용지 절대좌표에 못 박힌 떠 있는 그림**이다. 그 좌표는 rhwp의 레이아웃 엔진이 계산한
 * 셀 위치인데, 한글은 자기 방식으로 다시 배치하므로 두 좌표가 어긋나면 **서명이 칸 밖으로
 * 나간다**(실제 증상). rhwp로 다시 열어 검사하면 자기가 쓴 좌표를 그대로 돌려주므로 통과한다
 * — 회귀 테스트가 이 결함을 놓쳤던 이유다.
 *
 * 그래서 좌표를 아예 쓰지 않는다. 그림을 **셀 문단 안의 글자처럼**(`treatAsChar="1"`,
 * `vertRelTo="PARA"`, `horzRelTo="COLUMN"`) 넣으면 어느 렌더러가 열든 그 셀 안에 있다.
 * 크기도 셀이 XML에 스스로 적어 둔 `<hp:cellSz>`·`<hp:cellMargin>`(HWPUNIT)에서 구하므로
 * 레이아웃 엔진이 필요 없다. 결과적으로 **WASM 없이** 날인이 끝나고, 문서 전체 재직렬화가
 * 사라져 `Scripts/` 등 원본 요소도 그대로 보존된다.
 *
 * 칸은 여전히 **텍스트로** 찾는다(계·부장·교감·교장). 셀 인덱스를 하드코딩하면 양식이 한 칸만
 * 바뀌어도 조용히 엉뚱한 칸에 날인된다. 칸 이름 셀의 **바로 아래 칸**(같은 colAddr,
 * rowAddr + rowSpan)이 서명 자리다.
 *
 * 회귀: `npx tsx scripts/approval-stamp-test/run.mts`
 */

/** HWPUNIT = 1/7200인치, 화면 px는 96dpi */
const PX_TO_HU = 7200 / 96;

/** 칸을 꽉 채우지 않는다 — 테두리에 닿으면 인쇄물이 지저분해진다. */
const FILL_W = 0.9;
const FILL_H = 0.85;

export interface ApprovalCell {
  /** section XML 내 `<hp:tc>` 시작·끝 오프셋 */
  start: number;
  end: number;
  xml: string;
  text: string;
  colAddr: number;
  rowAddr: number;
  colSpan: number;
  rowSpan: number;
  /** HWPUNIT */
  widthHu: number;
  heightHu: number;
  marginLeftHu: number;
  marginRightHu: number;
  marginTopHu: number;
  marginBottomHu: number;
}

export interface SignaturePlacement {
  /** 결재란 칸 이름 — `approval_step.role_label` */
  roleLabel: string;
  /** content.hpf manifest의 item id (예: `image1`) */
  imageId: string;
  naturalWidthPx: number;
  naturalHeightPx: number;
  description?: string;
}

export interface StampXmlResult {
  xml: string;
  /** 실제로 넣은 칸 이름 */
  stamped: string[];
  /** 칸을 못 찾아 건너뛴 이름 */
  missing: string[];
}

/* ────────────────────────────── 칸 찾기 ────────────────────────────── */

/** 칸 이름 셀 바로 아래의 서명 칸. 못 찾으면 null(그 칸은 건너뛴다). */
export function findSignatureCellInXml(xml: string, roleLabel: string): ApprovalCell | null {
  const wanted = normalizeLabel(roleLabel);
  if (!wanted) return null;

  for (const table of topLevelTables(xml)) {
    const cells = topLevelCells(xml, table);
    const header = cells.find((cell) => normalizeLabel(cell.text) === wanted);
    if (!header) continue;

    const below = cells.find(
      (cell) => cell.colAddr === header.colAddr && cell.rowAddr === header.rowAddr + header.rowSpan,
    );
    if (below) return below;
  }
  return null;
}

/** 표별 셀 텍스트를 문서 순서대로. (회귀 테스트가 칸 보존 확인에 쓴다) */
export function tableCellTextsFromXml(xml: string): string[][] {
  return topLevelTables(xml).map((table) => topLevelCells(xml, table).map((cell) => cell.text));
}

/* ────────────────────────────── 그림 삽입 ────────────────────────────── */

/**
 * 서명 그림들을 결재란 칸 문단 안에 **글자처럼** 넣는다.
 *
 * 편집은 오프셋이 큰 것부터 적용한다 — 앞쪽을 먼저 고치면 뒤쪽 오프셋이 밀린다.
 */
export function stampSignaturesIntoSectionXml(
  xml: string,
  placements: SignaturePlacement[],
): StampXmlResult {
  const stamped: string[] = [];
  const missing: string[] = [];

  const edits: { start: number; end: number; xml: string; roleLabel: string }[] = [];
  for (const placement of placements) {
    const cell = findSignatureCellInXml(xml, placement.roleLabel);
    if (!cell) {
      missing.push(placement.roleLabel);
      continue;
    }
    const replaced = cellXmlWithPicture(cell, placement);
    if (!replaced) {
      missing.push(placement.roleLabel);
      continue;
    }
    edits.push({ start: cell.start, end: cell.end, xml: replaced, roleLabel: placement.roleLabel });
  }

  let out = xml;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.xml + out.slice(edit.end);
    stamped.push(edit.roleLabel);
  }
  return { xml: out, stamped: stamped.reverse(), missing };
}

/** 셀 XML에 그림 run을 넣은 새 셀 XML. 문단을 못 찾으면 null. */
function cellXmlWithPicture(cell: ApprovalCell, placement: SignaturePlacement): string | null {
  const para = firstParagraph(cell.xml);
  if (!para) return null;

  const availW = Math.max(1, cell.widthHu - cell.marginLeftHu - cell.marginRightHu);
  const availH = Math.max(1, cell.heightHu - cell.marginTopHu - cell.marginBottomHu);
  const ratio = Math.min(
    (availW * FILL_W) / Math.max(1, placement.naturalWidthPx),
    (availH * FILL_H) / Math.max(1, placement.naturalHeightPx),
  );
  const drawW = Math.max(1, Math.round(placement.naturalWidthPx * ratio));
  const drawH = Math.max(1, Math.round(placement.naturalHeightPx * ratio));

  const paraXml = cell.xml.slice(para.start, para.end);
  const charPrIDRef = paraXml.match(/<hp:run\s+charPrIDRef="(\d+)"/)?.[1] ?? '0';
  const run = `<hp:run charPrIDRef="${charPrIDRef}">${picXml(placement, drawW, drawH)}</hp:run>`;

  // 줄 나눔 캐시는 그림이 들어가면 무효다 — 남겨두면 한글이 옛 줄 높이로 그린다.
  const withoutLineSeg = paraXml.replace(
    /<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>|<hp:linesegarray\s*\/>/,
    '',
  );
  const newPara = withoutLineSeg.replace('</hp:p>', `${run}</hp:p>`);

  return cell.xml.slice(0, para.start) + newPara + cell.xml.slice(para.end);
}

/**
 * `<hp:pic>` — rhwp가 만드는 구조를 그대로 따르되 `<hp:pos>`만 **글자처럼**으로 바꾼다.
 * 표 자신이 쓰는 배치값(`treatAsChar="1" vertRelTo="PARA" horzRelTo="COLUMN"`)과 같다.
 */
function picXml(placement: SignaturePlacement, drawW: number, drawH: number): string {
  const clipW = Math.round(placement.naturalWidthPx * PX_TO_HU);
  const clipH = Math.round(placement.naturalHeightPx * PX_TO_HU);
  const comment = escapeXml(placement.description ?? `${placement.roleLabel} 결재 서명`);

  return (
    `<hp:pic id="0" zOrder="0" numberingType="PICTURE" textWrap="SQUARE" textFlow="BOTH_SIDES"` +
    ` lock="0" dropcapstyle="None" href="" groupLevel="0" instid="0" reverse="0">` +
    `<hp:offset x="0" y="0"/>` +
    `<hp:orgSz width="${drawW}" height="${drawH}"/>` +
    `<hp:curSz width="${drawW}" height="${drawH}"/>` +
    `<hp:flip horizontal="0" vertical="0"/>` +
    `<hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="0"/>` +
    `<hp:renderingInfo>` +
    `<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>` +
    `<hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>` +
    `<hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>` +
    `</hp:renderingInfo>` +
    `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${drawW}" y="0"/>` +
    `<hc:pt2 x="${drawW}" y="${drawH}"/><hc:pt3 x="0" y="${drawH}"/></hp:imgRect>` +
    `<hp:imgClip left="0" right="${clipW}" top="0" bottom="${clipH}"/>` +
    `<hp:inMargin left="0" right="0" top="0" bottom="0"/>` +
    `<hp:imgDim dimwidth="0" dimheight="0"/>` +
    `<hc:img binaryItemIDRef="${escapeXml(placement.imageId)}" bright="0" contrast="0"` +
    ` effect="REAL_PIC" alpha="0"/>` +
    `<hp:effects></hp:effects>` +
    `<hp:sz width="${drawW}" widthRelTo="ABSOLUTE" height="${drawH}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0"` +
    ` holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT"` +
    ` vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/>` +
    `<hp:shapeComment>${comment}</hp:shapeComment>` +
    `</hp:pic>`
  );
}

/* ────────────────────────────── XML 파싱 ────────────────────────────── */

interface Span {
  start: number;
  end: number;
}

/** 중첩 표를 건너뛰고 최상위 `<hp:tbl>` 범위만 문서 순서로. */
function topLevelTables(xml: string): Span[] {
  return balancedSpans(xml, /<hp:tbl[\s>/]|<\/hp:tbl>/g, 0);
}

/** 표에 직접 속한 셀만(중첩 표의 셀 제외). 오프셋은 section XML 기준 절대값. */
function topLevelCells(xml: string, table: Span): ApprovalCell[] {
  const inner = xml.slice(table.start, table.end);
  // 바깥 <hp:tbl ...> 여는 태그를 지나야 깊이 계산이 셀 기준이 된다.
  const offset = inner.indexOf('>') + 1;
  const body = inner.slice(offset);
  const base = table.start + offset;

  const cells: ApprovalCell[] = [];
  const tag = /<hp:tbl[\s>/]|<\/hp:tbl>|<hp:tc[\s>/]|<\/hp:tc>/g;
  let tableDepth = 0;
  let cellDepth = 0;
  let start = -1;
  let match: RegExpExecArray | null;

  while ((match = tag.exec(body)) !== null) {
    const token = match[0];
    if (token.startsWith('</hp:tbl')) tableDepth -= 1;
    else if (token.startsWith('<hp:tbl')) tableDepth += 1;
    else if (token.startsWith('</hp:tc')) {
      cellDepth -= 1;
      if (cellDepth === 0 && start >= 0 && tableDepth === 0) {
        const end = match.index + token.length;
        cells.push(parseCell(body.slice(start, end), base + start, base + end));
        start = -1;
      }
    } else {
      if (cellDepth === 0 && tableDepth === 0) start = match.index;
      cellDepth += 1;
    }
  }
  return cells;
}

function parseCell(cellXml: string, start: number, end: number): ApprovalCell {
  const addr = cellXml.match(/<hp:cellAddr\s+colAddr="(\d+)"\s+rowAddr="(\d+)"/);
  const span = cellXml.match(/<hp:cellSpan\s+colSpan="(\d+)"\s+rowSpan="(\d+)"/);
  const size = cellXml.match(/<hp:cellSz\s+width="(\d+)"\s+height="(\d+)"/);
  const margin = cellXml.match(
    /<hp:cellMargin\s+left="(\d+)"\s+right="(\d+)"\s+top="(\d+)"\s+bottom="(\d+)"/,
  );

  return {
    start,
    end,
    xml: cellXml,
    text: cellText(cellXml),
    colAddr: Number(addr?.[1] ?? -1),
    rowAddr: Number(addr?.[2] ?? -1),
    colSpan: Number(span?.[1] ?? 1),
    rowSpan: Number(span?.[2] ?? 1),
    widthHu: Number(size?.[1] ?? 0),
    heightHu: Number(size?.[2] ?? 0),
    marginLeftHu: Number(margin?.[1] ?? 0),
    marginRightHu: Number(margin?.[2] ?? 0),
    marginTopHu: Number(margin?.[3] ?? 0),
    marginBottomHu: Number(margin?.[4] ?? 0),
  };
}

/** 셀 안 첫 `<hp:p>` 범위(셀 XML 기준 상대 오프셋). 중첩 문단을 균형 있게 건너뛴다. */
function firstParagraph(cellXml: string): Span | null {
  return balancedSpans(cellXml, /<hp:p[\s>/]|<\/hp:p>/g, 0)[0] ?? null;
}

/** 여는/닫는 태그 균형을 맞춰 최상위 조각 범위만 잘라낸다. */
function balancedSpans(xml: string, tag: RegExp, from: number): Span[] {
  const out: Span[] = [];
  let depth = 0;
  let start = -1;
  let match: RegExpExecArray | null;
  tag.lastIndex = from;

  while ((match = tag.exec(xml)) !== null) {
    // `<hp:p/>` 같은 자기완결 태그는 열자마자 닫힌다.
    const selfClosing = match[0].endsWith('/') && !match[0].startsWith('</');
    if (selfClosing) {
      if (depth === 0) out.push({ start: match.index, end: match.index + match[0].length });
      continue;
    }
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        out.push({ start, end: match.index + match[0].length });
        start = -1;
      }
    } else {
      if (depth === 0) start = match.index;
      depth += 1;
    }
  }
  return out;
}

function cellText(cell: string): string {
  return [...cell.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)]
    .map((m) => decodeXml(m[1]))
    .join('')
    .trim();
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 양식은 '결 재'처럼 자간을 공백으로 넣는다 — 공백을 지우고 비교한다. */
function normalizeLabel(text: string): string {
  return text.replace(/\s+/g, '');
}
