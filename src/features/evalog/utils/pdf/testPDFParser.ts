/**
 * PDF 파싱 테스트 유틸리티
 * 실제 student.pdf 구조를 분석합니다
 */

import { pdfjsLib } from './pdfConfig';

export async function analyzePDFStructure(file: File): Promise<void> {
  console.log('📄 PDF 분석 시작...');

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  console.log(`✅ PDF 로드 완료: ${pdf.numPages} 페이지`);

  let fullText = '';

  // 각 페이지에서 텍스트 추출
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📄 페이지 ${i}`);
    console.log('='.repeat(80));

    // 텍스트 아이템 추출 및 위치 정보 포함
    const items = textContent.items.map((item: any) => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5]
    }));

    // Y 좌표 기준으로 정렬 (위에서 아래로)
    items.sort((a, b) => b.y - a.y);

    // 페이지 텍스트
    const pageText = items.map(item => item.text).join(' ');
    fullText += pageText + '\n\n';

    // 첫 500자 출력
    console.log(pageText.substring(0, 500));
    console.log('...\n');

    // 상세 아이템 정보 (처음 20개)
    console.log('📍 텍스트 아이템 (처음 20개):');
    items.slice(0, 20).forEach((item, idx) => {
      console.log(`  ${idx + 1}. "${item.text}" (x: ${item.x.toFixed(1)}, y: ${item.y.toFixed(1)})`);
    });
  }

  // 섹션 키워드 감지
  console.log('\n' + '='.repeat(80));
  console.log('📋 섹션 키워드 감지');
  console.log('='.repeat(80));

  const keywords = [
    '인적사항', '수험번호', '성명', '학교명',
    '교과학습발달상황', '교과', '성적', '세부능력', '특기사항',
    '창의적체험활동상황', '창의적', '체험활동', '자율활동', '동아리활동', '진로활동',
    '봉사활동실적', '봉사활동',
    '행동특성및종합의견', '행동특성', '종합의견',
    '출결상황', '출결', '결석', '지각', '조퇴'
  ];

  const foundKeywords: { keyword: string; count: number; index: number }[] = [];

  keywords.forEach(keyword => {
    const regex = new RegExp(keyword, 'g');
    const matches = fullText.match(regex);
    if (matches) {
      const firstIndex = fullText.indexOf(keyword);
      foundKeywords.push({
        keyword,
        count: matches.length,
        index: firstIndex
      });
    }
  });

  // 발견된 키워드를 위치 순서대로 정렬
  foundKeywords.sort((a, b) => a.index - b.index);

  foundKeywords.forEach(({ keyword, count, index }) => {
    const preview = fullText.substring(index, index + 50).replace(/\n/g, ' ');
    console.log(`✓ "${keyword}" - ${count}회, 위치: ${index}`);
    console.log(`  미리보기: "${preview}..."`);
  });

  // 전체 텍스트를 콘솔에 저장 (복사 가능)
  console.log('\n' + '='.repeat(80));
  console.log('📝 전체 텍스트 (복사하여 분석 가능)');
  console.log('='.repeat(80));
  console.log(fullText);

  // 텍스트 다운로드
  downloadText(fullText, 'pdf-analysis.txt');
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`✅ 텍스트를 ${filename}으로 다운로드했습니다`);
}
