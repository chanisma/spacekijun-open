/**
 * 텍스트 처리 및 정규화 유틸리티
 * PDF 텍스트의 저수준 처리 담당
 */

/**
 * 페이지 메타데이터 패턴 (반복되는 헤더/푸터 제거용)
 */
export const PAGE_METADATA_PATTERNS = [
  /반\s+\d+\s+번호\s+\d+\s+성명\s+[가-힣]+/,
  /학년도\s+학교생활기록부\([가-힣]+\)/,
  /^페이지\s+\d+$/,
  /^\d+\s*\/\s*\d+$/,
  /^={50,}$/,
  /^3\.\s*수상경력$/,
  /^4\.\s*자격증\s*및\s*인증\s*취득상황$/,
  /[가-힣]+\/\d{4}\.\d{2}\.\d{2}\d{2}:\d{2}\/\d+\.\d+\.\*+\.\d+\/[가-힣]+/,
];

export function isPageMetadata(line: string): boolean {
  const trimmed = line.trim();
  return PAGE_METADATA_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Helper: 컨텐츠 라인을 지능적으로 조인
 */
export function joinContentLines(lines: string[]): string {
  if (lines.length === 0) return '';
  if (lines.length === 1) return lines[0].trim();

  let result = lines[0];
  for (let i = 1; i < lines.length; i++) {
    const prevLine = result;
    const currentLine = lines[i];

    const endsWithKorean = /[가-힣]$/.test(prevLine);
    const startsWithKorean = /^[가-힣]/.test(currentLine);

    if (endsWithKorean && startsWithKorean) {
      result += currentLine;
    } else {
      result += ' ' + currentLine;
    }
  }

  return result.trim();
}

/**
 * 출결상황 3줄 병합
 */
export function mergeAttendanceLines(text: string): string {
  const lines = text.split(/\r?\n/);
  const merged: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line1 = lines[i];
    const line2 = i + 1 < lines.length ? lines[i + 1] : '';
    const line3 = i + 2 < lines.length ? lines[i + 2] : '';

    const isAttendanceData =
      /^\d+\s+\d+\s+[\.\s]+$/.test(line1) &&
      /^[가-힣,\s\d]+$/.test(line2) &&
      (/^\d+일$/.test(line3) || line3 === '일');

    if (isAttendanceData) {
      let mergedLine = `${line1.trim()} ${line2.trim()} ${line3.trim()}`;
      mergedLine = mergedLine.replace(/원격\s+수업일수/g, '원격수업일수');
      merged.push(mergedLine);
      i += 2;
    } else {
      merged.push(line1);
    }
  }

  return merged.join('\n');
}

/**
 * 섹션 필터링 (수상경력, 자격증 등)
 */
export function filterUnwantedSections(text: string): string {
  const lines = text.split(/\r?\n/);
  const filtered: string[] = [];
  let skipUntilNextSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^3\.\s*수상경력/.test(line) || /^4\.\s*자격증/.test(line)) {
      skipUntilNextSection = true;
      continue;
    }

    if (/^[5-9]\.\s*/.test(line) || /^1[0-9]\.\s*/.test(line)) {
      skipUntilNextSection = false;
    }

    if (!skipUntilNextSection) {
      filtered.push(line);
    }
  }

  return filtered.join('\n');
}

/**
 * (구) 출결 및 섹션 처리 통합 함수
 * @deprecated 개별 함수(mergeAttendanceLines, filterUnwantedSections) 사용 권장
 */
export function processAttendanceAndSections(text: string): string {
  const merged = mergeAttendanceLines(text);
  return filterUnwantedSections(merged);
}

/**
 * 섹션 헤더 제거 함수 (내부 함수)
 * 공백 정규화 전에 실행되어야 정확한 패턴 매칭 가능
 */
function cleanSectionHeadersInternal(text: string): string {
  const lines = text.split(/\r?\n/);
  const cleanedLines: string[] = [];
  let skipNext = 0;

  for (let i = 0; i < lines.length; i++) {
    if (skipNext > 0) {
      skipNext--;
      continue;
    }

    const line = lines[i].trim();
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
    const nextNextLine = i + 2 < lines.length ? lines[i + 2].trim() : '';

    // "학년" + "창 의 적 체 험 활 동 상 황" + "영역 시간 특기사항" 패턴 감지
    if (line === '학년' &&
      /창\s*의\s*적\s*체\s*험\s*활\s*동\s*상\s*황/.test(nextLine) &&
      nextNextLine.includes('영역') && nextNextLine.includes('시간') && nextNextLine.includes('특기사항')) {
      skipNext = 2; // 다음 2줄 스킵
      continue;
    }

    // 단독 "창 의 적 체 험 활 동 상 황" 제거
    if (/^창\s*의\s*적\s*체\s*험\s*활\s*동\s*상\s*황$/.test(line)) {
      continue;
    }

    cleanedLines.push(line); // trim된 버전 사용 (일관성)
  }

  return cleanedLines.join('\n');
}

/**
 * PDF 텍스트 정규화
 * 
 * 처리 순서 (User Request):
 * 1. 기본 줄바꿈 정규화
 * 2. 섹션 헤더 제거
 * 3. 공백 정규화
 * 4. 출결 및 섹션 필터링
 * 5. 페이지 메타데이터 제거
 */
export interface NormalizationOptions {
  removePageMetadata?: boolean;
  initialSectionFiltering?: boolean; // Maps to Main Filtering
  removeSectionHeaders?: boolean;
  normalizeLineBreaks?: boolean;
  normalizeWhitespace?: boolean;
  finalSectionFiltering?: boolean; // Maps to Main Filtering (Legacy)

  // Backwards compatibility keys
  filterSections?: boolean;
}

export function normalizePDFSpacing(text: string, options: NormalizationOptions = {}): string {
  const {
    removePageMetadata = true,
    initialSectionFiltering = true,
    removeSectionHeaders = true,
    normalizeLineBreaks = true,
    normalizeWhitespace = true,
    finalSectionFiltering = true,
    filterSections = true
  } = options;

  let normalized = text;

  // 1. 기본 줄바꿈 정규화
  if (normalizeLineBreaks) {
    normalized = normalized
      .replace(/[\r\n]+/g, '\n')
      .trim();
  }

  // 2. 섹션 헤더 제거
  if (removeSectionHeaders) {
    normalized = cleanSectionHeadersInternal(normalized);
  }

  // 3. 공백 정규화 (Aggressive)
  if (normalizeWhitespace) {
    normalized = normalized.replace(/\n/g, '###NEWLINE###');
    normalized = normalized.replace(/[ \t]{3,}/g, '###SPACE###');
    normalized = normalized.replace(/[ \t]+/g, '');
    normalized = normalized.replace(/###SPACE###/g, ' ');
    normalized = normalized.replace(/###NEWLINE###/g, '\n');

    normalized = normalized
      .replace(/[\r\n]+/g, '\n')
      .replace(/\n /g, '\n')
      .replace(/ \n/g, '\n')
      .trim();
  }

  // 4. 출결 및 섹션 필터링 (통합)
  // initial, final, filterSections 중 하나라도 켜져 있으면 실행
  if ((initialSectionFiltering || finalSectionFiltering) && filterSections) {
    normalized = processAttendanceAndSections(normalized);
  }

  // 5. 페이지 메타데이터 제거 (가장 마지막에 수행)
  if (removePageMetadata) {
    const lines = normalized.split(/\r?\n/);
    const filteredLines = lines.filter(line => !isPageMetadata(line));
    normalized = filteredLines.join('\n');
  }

  return normalized;
}

/**
 * 섹션 헤더 제거 함수 (외부 API - 호환성 유지)
 * @deprecated 이제 normalizePDFSpacing 내부에서 자동으로 처리됨
 */
export function cleanSectionHeaders(text: string): string {
  console.warn('⚠️  cleanSectionHeaders는 이제 normalizePDFSpacing 내부에서 자동 처리됩니다.');
  return text; // 이미 처리되었으므로 그대로 반환
}
