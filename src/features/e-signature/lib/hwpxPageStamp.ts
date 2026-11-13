/**
 * HWPX 페이지 위 **절대 위치** 서명 날인 — 순수 XML 로직.
 *
 * 결재 날인(`lib/rhwp/approvalCells.ts`)과 목적이 다르다:
 *   결재  = "'교감' 칸을 찾아 그 안에 **글자처럼**" (표 레이아웃을 한글이 계산)
 *   여기  = "사용자가 페이지 위에 찍은 좌표에 **모든 개체 위로**"
 *
 * 결재가 rhwp `insertPictureEx` 를 버린 이유는 *rhwp 가 계산한 셀 위치*를 용지 좌표로
 * 굳혀서 한글이 다시 배치할 때 어긋났기 때문이다. 여기서는 **사용자가 렌더된 페이지에서
 * 직접 찍은 좌표**라 추적할 셀이 없고, 용지 절대좌표가 정확히 의도한 그 자리다.
 *
 * ── 한글의 제약 하나 ─────────────────────────────────────────────────────────
 * PAPER 에 고정한 개체도 **어떤 문단에 속하는지**가 페이지를 결정한다. 그래서 "3쪽에
 * 찍으려면 3쪽에 흐르는 문단"이 필요하다 — 그 문단 번호는 rhwp 레이아웃(`getPageTextLayout`)
 * 이 알려 준다. 이 모듈은 그 번호를 **받아서** 쓴다(DOM·WASM 비의존이라 회귀 테스트가 돈다).
 *
 * 회귀 = `npx tsx scripts/hwpx-page-stamp-test/run.mts`
 */

/** 화면 픽셀(96dpi) → HWPUNIT(1/7200 inch) */
const PX_TO_HU = 7200 / 96;

export interface PageStampPlacement {
  /** BinData 안의 이미지 id (`image7` 등) */
  imageId: string;
  /** 문단 위치 — rhwp 레이아웃에서 구한 값 */
  paraIndex: number;
  /** 용지 왼쪽 위 기준 오프셋(HWPUNIT) */
  xHu: number;
  yHu: number;
  /** 그려질 크기(HWPUNIT) */
  widthHu: number;
  heightHu: number;
  /** 원본 PNG 픽셀 크기 — imgClip 계산에 필요 */
  naturalWidthPx: number;
  naturalHeightPx: number;
  description?: string;
}

export interface PageStampResult {
  xml: string;
  /** 실제로 찍힌 배치의 imageId */
  stamped: string[];
}

/**
 * `<hp:pic>` — **용지 절대 좌표 + 글 앞으로**.
 *
 * 결재본(`treatAsChar="1"`)과 다른 세 속성이 핵심이다:
 *   `treatAsChar="0"`          글자 흐름에서 떼어 낸다(안 그러면 좌표가 무시된다)
 *   `vertRelTo/horzRelTo="PAPER"` 용지 기준 절대 좌표
 *   `textWrap="IN_FRONT_OF_TEXT"` 표·그림 위에 그린다(사용자 요구 = 모든 개체 위)
 *
 * `allowOverlap="1"` 과 `flowWithText="0"` 이 빠지면 한글이 겹침을 피해 **스스로 밀어낸다**.
 * `zOrder` 를 크게 두어 나중에 추가된 다른 개체보다 위에 오게 한다.
 */
export function pageStampPicXml(p: PageStampPlacement, zOrder: number): string {
  const clipW = Math.round(p.naturalWidthPx * PX_TO_HU);
  const clipH = Math.round(p.naturalHeightPx * PX_TO_HU);
  const w = Math.round(p.widthHu);
  const h = Math.round(p.heightHu);
  const comment = escapeXml(p.description ?? '전자서명');

  return (
    `<hp:pic id="0" zOrder="${zOrder}" numberingType="PICTURE" textWrap="IN_FRONT_OF_TEXT"` +
    ` textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="0" reverse="0">` +
    `<hp:offset x="0" y="0"/>` +
    `<hp:orgSz width="${w}" height="${h}"/>` +
    `<hp:curSz width="${w}" height="${h}"/>` +
    `<hp:flip horizontal="0" vertical="0"/>` +
    `<hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="0"/>` +
    `<hp:renderingInfo>` +
    `<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>` +
    `<hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>` +
    `<hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>` +
    `</hp:renderingInfo>` +
    `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/>` +
    `<hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect>` +
    `<hp:imgClip left="0" right="${clipW}" top="0" bottom="${clipH}"/>` +
    `<hp:inMargin left="0" right="0" top="0" bottom="0"/>` +
    `<hp:imgDim dimwidth="0" dimheight="0"/>` +
    `<hc:img binaryItemIDRef="${escapeXml(p.imageId)}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>` +
    `<hp:effects></hp:effects>` +
    `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1"` +
    ` holdAnchorAndSO="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT"` +
    ` vertOffset="${Math.round(p.yHu)}" horzOffset="${Math.round(p.xHu)}"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/>` +
    `<hp:shapeComment>${comment}</hp:shapeComment>` +
    `</hp:pic>`
  );
}

/**
 * 섹션 XML 에 그림들을 넣는다.
 *
 * 편집은 **오프셋이 큰 것부터** 적용한다 — 앞쪽을 먼저 고치면 뒤쪽 오프셋이 밀려
 * 두 번째 그림부터 엉뚱한 자리에 들어간다(결재 날인에서 얻은 교훈과 같다).
 */
export function stampPageBoxesIntoSectionXml(
  xml: string,
  placements: PageStampPlacement[],
): PageStampResult {
  if (placements.length === 0) return { xml, stamped: [] };

  const paragraphs = topLevelParagraphs(xml);
  if (paragraphs.length === 0) return { xml, stamped: [] };

  interface Edit { at: number; text: string; imageId: string }
  const edits: Edit[] = [];
  const touched = new Set<number>();
  let zOrder = 1000; // 문서에 이미 있는 개체보다 위로

  for (const p of placements) {
    const para = paragraphs[p.paraIndex];
    if (!para) continue; // 문서가 바뀌어 문단이 사라진 경우 — 조용히 건너뛴다

    const run = firstRunEnd(xml, para);
    if (run == null) continue;

    edits.push({ at: run, text: pageStampPicXml(p, zOrder), imageId: p.imageId });
    touched.add(p.paraIndex);
    zOrder += 1;
  }

  if (edits.length === 0) return { xml, stamped: [] };

  /*
    그림을 넣은 문단의 **자기** 줄 캐시만 지운다 — 남아 있으면 한글이 옛 줄 높이로 그린다
    (task-workflow·결재 날인에서 같은 증상을 겪었다).
    ⚠️ 2026-10-25 이전에는 정규식 /g 로 **문서 전체**의 줄 캐시를 지웠다. 한글은 열 때 다시 계산하지만
    rhwp(웹 미리보기·완성본 보기)는 캐시가 없으면 표 칸의 여러 줄을 한 줄로 겹쳐 그렸다(무선인터넷 신청서 실측).
    표를 품은 문단이면 그 안 칸 문단(깊이 2 이상)의 캐시는 그대로 둔다.
  */
  const cuts: Span[] = [];
  for (const i of touched) cuts.push(...ownLinesegSpans(xml, paragraphs[i]));

  const ops = [
    ...edits.map((e) => ({ at: e.at, del: 0, text: e.text })),
    ...cuts.map((c) => ({ at: c.start, del: c.end - c.start, text: '' })),
  ].sort((a, b) => b.at - a.at);
  let out = xml;
  for (const op of ops) {
    out = out.slice(0, op.at) + op.text + out.slice(op.at + op.del);
  }

  return { xml: out, stamped: edits.map((e) => e.imageId) };
}

/** 본문 문단 자신의 `<hp:linesegarray>` 범위(안에 든 표 칸 문단의 것은 제외) */
export function ownLinesegSpans(xml: string, para: Span): Span[] {
  const spans: Span[] = [];
  const re = /<hp:p[\s>/]|<\/hp:p>|<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>|<hp:linesegarray\s*\/>/g;
  re.lastIndex = para.start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && m.index < para.end) {
    if (m[0] === '</hp:p>') { depth -= 1; continue; }
    if (m[0].startsWith('<hp:p')) { if (!isSelfClosing(xml, m.index)) depth += 1; continue; }
    if (depth === 1) spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

/* ────────────────────────────── XML 스캔 ────────────────────────────── */

export interface Span {
  start: number;
  end: number;
}

/**
 * 본문 최상위 `<hp:p>` 범위를 문서 순서로.
 *
 * 표 셀 안의 문단도 `<hp:p>` 라서 깊이를 세지 않으면 번호가 어긋난다 — rhwp 가 주는
 * `paraIdx` 는 **본문 문단 번호**이므로 여기서도 같은 기준이어야 한다.
 */
export function topLevelParagraphs(xml: string): Span[] {
  const spans: Span[] = [];
  const re = /<hp:p[\s>/]|<\/hp:p>/g;
  let depth = 0;
  let start = -1;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml)) !== null) {
    if (m[0] === '</hp:p>') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        spans.push({ start, end: m.index + m[0].length });
        start = -1;
      }
      continue;
    }

    const selfClosing = isSelfClosing(xml, m.index);
    if (depth === 0) {
      if (selfClosing) {
        /*
          빈 문단(`<hp:p ... />`)도 **반드시 센다**.
          여기에 그림을 넣을 수는 없지만(run 이 없다), rhwp 가 주는 `paraIdx` 는 빈 문단까지
          포함한 본문 번호다. 건너뛰면 그 뒤 문단 번호가 통째로 한 칸씩 밀려 **서명이 다른
          쪽에 찍힌다** — 오류 없이 조용히 틀리는 종류다.
        */
        const close = xml.indexOf('>', m.index);
        spans.push({ start: m.index, end: close < 0 ? m.index + m[0].length : close + 1 });
        continue;
      }
      start = m.index;
    }
    if (!selfClosing) depth += 1;
  }
  return spans;
}

/** 태그가 `/>` 로 닫히는가 */
function isSelfClosing(xml: string, tagStart: number): boolean {
  const end = xml.indexOf('>', tagStart);
  return end > 0 && xml[end - 1] === '/';
}

/**
 * 문단 안 **첫 `<hp:run>` 의 여는 태그 직후** 위치.
 *
 * 그림은 run 안에 들어가야 한다. 문단 바로 아래에 넣으면 한글이 스키마 위반으로 거부한다.
 */
export function firstRunEnd(xml: string, para: Span): number | null {
  const re = /<hp:run[\s>]/g;
  re.lastIndex = para.start;
  const m = re.exec(xml);
  if (!m || m.index >= para.end) return null;
  const close = xml.indexOf('>', m.index);
  if (close < 0 || close >= para.end) return null;
  // 자기 닫힘 run 은 안에 넣을 수 없다
  if (xml[close - 1] === '/') return null;
  return close + 1;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
