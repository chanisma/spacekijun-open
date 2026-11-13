// ========================================
// 공지 내용 목록/글머리 기호 처리
//
// 저장 포맷은 plain text 유지 (HTML 저장 없음 → XSS 표면 없음).
// ① 붙여넣기: 클립보드 text/html의 ul/ol/li 구조를 글머리 기호 텍스트로 변환
// ② 렌더링: 글머리·번호 기호로 시작하는 줄을 파싱해 목록 형태로 표시
// ========================================

// ----------------------------------------
// ② 렌더용 파싱
// ----------------------------------------

export interface NoticeContentLine {
  /** 들여쓰기 레벨 (0~5) */
  indent: number;
  /** 목록 마커 (• 1. 가. ① 등) — 일반 문단이면 null */
  marker: string | null;
  /** 마커를 제외한 본문 */
  text: string;
}

/** 글머리 기호 문자들 (하이픈·별표는 표시 시 •로 정규화) */
const BULLET_RE = /^([•·◦▪‣▹▸►○●□■◇◆✓✔☑*-])[ \t\u00a0]+/;

/** 번호·한글·원문자 목록 마커 */
const ORDERED_RE =
  /^(\d{1,3}[.)]|\(\d{1,3}\)|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|[㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷]|[가나다라마바사아자차카타파하][.)]|[a-zA-Z][.)])[ \t\u00a0]+/;

const BULLET_NORMALIZE: Record<string, string> = { '-': '•', '*': '•' };

/**
 * 공지 본문을 줄 단위로 파싱.
 * 들여쓰기 = 탭 1개 또는 공백 2칸당 1레벨 (최대 5).
 */
export function parseNoticeLines(content: string): NoticeContentLine[] {
  return content.split('\n').map((rawLine) => {
    const leadingMatch = rawLine.match(/^[ \t\u00a0]*/);
    const leading = leadingMatch ? leadingMatch[0] : '';
    const tabs = (leading.match(/\t/g) || []).length;
    const spaces = leading.length - tabs;
    const indent = Math.min(tabs + Math.floor(spaces / 2), 5);

    const line = rawLine.slice(leading.length);

    const bulletMatch = line.match(BULLET_RE);
    if (bulletMatch) {
      const raw = bulletMatch[1];
      return {
        indent,
        marker: BULLET_NORMALIZE[raw] ?? raw,
        text: line.slice(bulletMatch[0].length),
      };
    }

    const orderedMatch = line.match(ORDERED_RE);
    if (orderedMatch) {
      return {
        indent,
        marker: orderedMatch[1],
        text: line.slice(orderedMatch[0].length),
      };
    }

    return { indent, marker: null, text: line };
  });
}

// ----------------------------------------
// ① 붙여넣기 HTML → 글머리 기호 텍스트
// ----------------------------------------

/** ul 중첩 깊이별 글머리 기호 */
const UL_MARKERS = ['•', '◦', '▪'];

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'BLOCKQUOTE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'TABLE', 'PRE',
]);

/**
 * 클립보드 text/html을 목록 구조가 보존된 plain text로 변환.
 * - ul/li → "• " (중첩 깊이별 •/◦/▪, 2칸 들여쓰기)
 * - ol/li → "1. " (목록별 카운터, start 속성 반영)
 * - 블록 요소·<br> → 줄바꿈
 * DOMParser는 스크립트를 실행하지 않고, 결과는 텍스트로만 쓰므로 XSS 위험 없음.
 */
export function htmlClipboardToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  let currentLine = '';

  const flushLine = () => {
    // 후행 공백만 정리 (NBSP 포함) — 선행 들여쓰기는 목록 구조라 보존
    out.push(currentLine.replace(/[ \t\u00a0]+$/, ''));
    currentLine = '';
  };

  const walk = (node: Node, listDepth: number, olCounter: { n: number } | null) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // HTML 소스의 연속 공백/개행은 한 칸으로
      currentLine += (node.textContent || '').replace(/\s+/g, ' ');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName;

    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'HEAD') return;

    if (tag === 'BR') {
      flushLine();
      return;
    }

    if (tag === 'UL' || tag === 'OL') {
      if (currentLine.trim()) flushLine();
      const counter = tag === 'OL' ? { n: Number(el.getAttribute('start')) || 1 } : null;
      el.childNodes.forEach((child) => {
        if ((child as Element).tagName === 'LI') {
          walkLi(child as Element, listDepth, counter);
        } else {
          walk(child, listDepth, counter);
        }
      });
      return;
    }

    const isBlock = BLOCK_TAGS.has(tag) || tag === 'TD' || tag === 'TH';
    if (isBlock && currentLine.trim()) flushLine();

    el.childNodes.forEach((child) => walk(child, listDepth, olCounter));

    if (isBlock && currentLine.trim()) flushLine();
  };

  const walkLi = (li: Element, depth: number, counter: { n: number } | null) => {
    if (currentLine.trim()) flushLine();
    const indent = '  '.repeat(depth);
    const marker = counter
      ? `${counter.n++}. `
      : `${UL_MARKERS[Math.min(depth, UL_MARKERS.length - 1)]} `;
    currentLine = indent + marker;

    li.childNodes.forEach((child) => {
      const childTag = (child as Element).tagName;
      if (childTag === 'UL' || childTag === 'OL') {
        // 중첩 목록 — 현재 항목 줄을 닫고 한 단계 깊게
        if (currentLine.trim()) flushLine();
        const nested = childTag === 'OL'
          ? { n: Number((child as Element).getAttribute('start')) || 1 }
          : null;
        (child as Element).childNodes.forEach((grand) => {
          if ((grand as Element).tagName === 'LI') {
            walkLi(grand as Element, depth + 1, nested);
          }
        });
      } else {
        walk(child, depth, counter);
      }
    });
    if (currentLine.trim()) flushLine();
  };

  doc.body.childNodes.forEach((node) => walk(node, 0, null));
  if (currentLine.trim()) flushLine();

  // 3개 이상 연속 빈 줄은 1개로 축약 후 앞뒤 공백 제거
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}
