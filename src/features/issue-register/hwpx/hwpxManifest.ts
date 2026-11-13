/**
 * HWPX 섹션 조립 — 순수 함수 모듈 (템플릿 ?url import 없음, Node 테스트 가능).
 */

/**
 * 여러 반의 완전한 section0 XML을 단일 섹션으로 합친다.
 * - 1번째: 그대로 골격(secPr=구역속성 보유)으로 사용.
 * - 2번째~: 본문(<hs:sec>...</hs:sec> 내부)만 떼고, 단 하나여야 하는 secPr 블록을
 *   제거한 뒤 첫 문단을 pageBreak="1"로 만들어 새 페이지에서 시작하게 한다.
 * HWPX는 sectionN.xml을 자동 연결 렌더하지 않으므로 한 섹션 안에서 합쳐야
 * 한글이 모든 반을 (페이지 분리해) 보여준다.
 */
export function mergeSectionsOnePage(sections: string[]): string {
  if (sections.length === 0) throw new Error('빈 섹션');
  if (sections.length === 1) return sections[0];

  const base = sections[0];
  const closeIdx = base.lastIndexOf('</hs:sec>');
  const head = base.slice(0, closeIdx);   // <hs:sec ...> ... (닫기 직전까지)
  const tail = base.slice(closeIdx);      // </hs:sec>

  const secPrRe = /<hp:secPr\b[\s\S]*?<\/hp:secPr>/;        // 구역속성(첫 문단에만 허용)
  const innerOf = (xml: string): string => {
    const open = xml.indexOf('>', xml.indexOf('<hs:sec')) + 1;
    const close = xml.lastIndexOf('</hs:sec>');
    let inner = xml.slice(open, close);
    inner = inner.replace(secPrRe, '');                     // 중복 secPr 제거
    // 첫 문단에 pageBreak="1" 부여 (앞 반과 페이지 분리)
    inner = inner.replace(/(<hp:p\b[^>]*?)pageBreak="\d+"/, '$1pageBreak="1"');
    return inner;
  };

  const extra = sections.slice(1).map(innerOf).join('');
  return head + extra + tail;
}
