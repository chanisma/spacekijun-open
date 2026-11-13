// 인쇄 시 자리 배치 좌석표 + 메모만 보이게.
// A4 세로 규격, 좌석 셀은 mm 단위로 강제하여 zoom/dpi와 무관하게 실측 크기 보장.
import { useEffect } from 'react';

const PRINT_CSS = `
@media print {
  @page {
    size: A4 portrait;
    margin: 12mm;
  }
  html, body {
    background: white !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  /* 모든 요소 숨김 */
  body * {
    visibility: hidden !important;
  }
  /* 좌석표 컨테이너만 보이게 */
  .seat-print-page,
  .seat-print-page * {
    visibility: visible !important;
  }
  /* 컨테이너 좌상단 고정 */
  .seat-print-page {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  /* 인쇄 제외 영역 */
  .seat-print-hide,
  .seat-print-hide * {
    visibility: hidden !important;
    display: none !important;
  }
  /* 카드 그림자/테두리 정리 */
  .seat-print-page .shadow-sm,
  .seat-print-page [class*="shadow"] {
    box-shadow: none !important;
  }
  .seat-print-page .border {
    border-color: #94a3b8 !important;
  }
  /* 인쇄용 타이틀 */
  .seat-print-page .seat-print-title {
    display: block !important;
    font-size: 16pt !important;
    font-weight: 700 !important;
    text-align: center !important;
    margin: 0 0 6mm 0 !important;
  }
  /* 좌석 그리드: A4 세로 가용폭(186mm)의 약 90%(168mm)를 채우도록 셀을 동적으로 계산.
     셀 크기 = (target - (cols-1) * gap) / cols.
     예) 5열 → 32mm, 6열 → 26mm, 7열 → 22mm — 컬럼이 늘면 셀이 비례 축소.
     inline의 grid-template-columns를 !important로 역전. */
  .seat-print-page .seat-grid {
    --gap: 2mm;
    --target-width: 168mm;
    --cell-size: calc((var(--target-width) - (var(--cols, 6) - 1) * var(--gap)) / var(--cols, 6));
    grid-template-columns: repeat(var(--cols, 6), var(--cell-size)) !important;
    grid-auto-rows: var(--cell-size) !important;
    gap: var(--gap) !important;
    width: var(--target-width) !important;
    margin: 0 auto !important;
  }
  .seat-print-page .seat-grid > * {
    width: var(--cell-size) !important;
    height: var(--cell-size) !important;
  }
  /* 좌석 셀 글자 크기 */
  .seat-print-page .seat-cell-label {
    font-size: 7pt !important;
    top: 1mm !important;
    left: 1.5mm !important;
  }
  .seat-print-page .seat-cell-name {
    font-size: 11pt !important;
    margin-top: 3mm !important;
    line-height: 1.1 !important;
    color: #0f172a !important;
  }
  .seat-print-page .seat-cell-number {
    font-size: 8pt !important;
    color: #475569 !important;
    margin-top: 0.5mm !important;
  }
  /* 메모 textarea */
  .seat-print-page .seat-notes-textarea {
    border: none !important;
    background: transparent !important;
    padding: 0 !important;
    margin-top: 4mm !important;
    font-size: 11pt !important;
    line-height: 1.5 !important;
    color: #0f172a !important;
    width: 100% !important;
    min-height: auto !important;
    height: auto !important;
    resize: none !important;
    outline: none !important;
    box-shadow: none !important;
    overflow: visible !important;
    white-space: pre-wrap !important;
    text-align: center !important;
  }
  /* 메모 영역 카드 정리 */
  .seat-print-page .seat-notes-card {
    border-top: 1px solid #cbd5e1 !important;
    padding-top: 4mm !important;
    margin-top: 6mm !important;
    page-break-inside: avoid !important;
  }
  /* sidebar/header 안전망 */
  body > div > div.hidden,
  body > div > div > div.hidden,
  header,
  nav {
    display: none !important;
  }
}
`;

export function PrintStyles() {
  useEffect(() => {
    const id = 'seat-arrangement-print-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
    return () => {
      const found = document.getElementById(id);
      if (found) found.remove();
    };
  }, []);
  return null;
}
