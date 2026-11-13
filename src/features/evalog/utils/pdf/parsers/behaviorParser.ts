/**
 * 행동특성 파서
 * Section 8 (행동특성 및 종합의견) 파싱 담당
 */

import { Section8Record } from '../../../types/pdfTypes';

/**
 * Behavior Characteristics 섹션 파싱
 */
export function parseBehaviorCharacteristics(behaviorText: string): Section8Record[] {
  const records: Section8Record[] = [];
  const lines = behaviorText.split('\n').map(l => l.trim()).filter(l => l);

  let currentGrade: number | null = null;
  let contentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('행동특성') || line.includes('종합의견') ||
        line.includes('학년') || line === '특기사항') {
      continue;
    }

    if (/^[123]$/.test(line)) {
      if (currentGrade !== null && contentLines.length > 0) {
        records.push({
          grade: currentGrade,
          content: contentLines.join('\n').trim()
        });
        contentLines = [];
      }
      currentGrade = parseInt(line);
    } else if (currentGrade !== null) {
      contentLines.push(line);
    }
  }

  if (currentGrade !== null && contentLines.length > 0) {
    records.push({
      grade: currentGrade,
      content: contentLines.join('\n').trim()
    });
  }

  return records;
}
