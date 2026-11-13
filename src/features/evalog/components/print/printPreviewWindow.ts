import type { Student } from '../../types';
import { PRINT_REGISTRY } from './printRegistry';
import { getPrintStyles } from './printStyles';

export async function openPrintWindow(student: Student, selectedIds: string[]): Promise<boolean> {
  const registry = PRINT_REGISTRY;
  const selectedItems = registry.filter(item => selectedIds.includes(item.id));

  if (selectedItems.length === 0) return false;

  // 사용자 클릭과 같은 이벤트 루프에서 창을 먼저 열어 팝업 차단을 피한다.
  const printWindow = window.open('', '', 'width=900,height=700');
  if (!printWindow) {
    alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
    return false;
  }

  printWindow.document.write('<!DOCTYPE html><html lang="ko"><body>인쇄 자료를 준비하고 있습니다.</body></html>');
  printWindow.document.close();

  let renderedSections: Array<string | null>;
  try {
    renderedSections = await Promise.all(
      selectedItems.map(item => Promise.resolve(item.renderHtml(student)))
    );
  } catch (error) {
    console.error('인쇄 자료 생성 실패:', error);
    printWindow.close();
    alert('인쇄 자료를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.');
    return false;
  }
  const sections = renderedSections.filter((html): html is string => html !== null);

  if (sections.length === 0) {
    printWindow.close();
    return false;
  }

  const studentName = student.name || '학생';
  const studentNo = student.studentNo || '';

  const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${studentName} - Evalog 인쇄</title>
  <style>${getPrintStyles()}</style>
</head>
<body>
  <div class="print-header">
    <h1>EVALOG 생활기록부 분석</h1>
    <div class="student-info">${studentName} (${studentNo})</div>
    <div class="print-url">spacekijun.lovable.app</div>
  </div>
  ${sections.join('\n')}
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(fullHtml);
  printWindow.document.close();

  setTimeout(() => {
    printWindow.print();
  }, 300);

  return true;
}
