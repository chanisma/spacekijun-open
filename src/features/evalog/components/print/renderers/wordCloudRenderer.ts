import type { Student } from '../../../types';
import { extractStudentTexts, analyzeWordFrequency } from '../../../utils/textAnalysis';

const CATEGORY_COLORS: Record<string, string> = {
  '교과 세특': '#3b82f6',
  '자율활동': '#22c55e',
  '동아리활동': '#f59e0b',
  '진로활동': '#8b5cf6',
  '행동특성': '#ec4899',
};
const FALLBACK_COLOR = '#64748b';

export async function renderWordCloud(student: Student): Promise<string | null> {
  const texts = extractStudentTexts(student);
  if (texts.length === 0) return null;

  const frequencies = await analyzeWordFrequency(texts, { topN: 100 });
  // count >= 2, top 50
  const words = frequencies.filter(f => f.count >= 2).slice(0, 50);
  if (words.length === 0) return null;

  const maxCount = Math.max(...words.map(w => w.count));
  const minCount = Math.min(...words.map(w => w.count));

  const wordSpans = words.map(w => {
    // Scale font-size: 11px ~ 36px based on frequency
    const ratio = maxCount === minCount ? 0.5 : (w.count - minCount) / (maxCount - minCount);
    const fontSize = Math.round(11 + ratio * 25);
    const weight = ratio > 0.6 ? 700 : ratio > 0.3 ? 600 : 400;
    const primaryCategory = w.category?.split(', ')[0] || '';
    const color = CATEGORY_COLORS[primaryCategory] || FALLBACK_COLOR;
    const opacity = 0.7 + ratio * 0.3;

    return `<span style="
      display:inline-block;
      font-size:${fontSize}px;
      font-weight:${weight};
      color:${color};
      opacity:${opacity};
      padding:2px 6px;
      line-height:1.3;
    " title="${w.word} (${w.count}회, ${w.sourceCount}개 출처)">${w.word}</span>`;
  }).join(' ');

  // Category legend
  const usedCategories = new Set<string>();
  words.forEach(w => {
    w.category?.split(', ').forEach(c => usedCategories.add(c));
  });
  const legendItems = Array.from(usedCategories)
    .filter(c => CATEGORY_COLORS[c])
    .map(c => `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:10px">
      <span style="width:8px;height:8px;border-radius:50%;background:${CATEGORY_COLORS[c]};display:inline-block"></span>
      ${c}
    </span>`).join('');

  return `
    <div class="print-section">
      <div class="print-section-title"><span class="tab-badge">단어분석</span>워드클라우드</div>
      <div style="
        text-align:center;
        padding:16px 12px;
        border:1px solid #e2e8f0;
        border-radius:8px;
        background:#fafbfc;
        line-height:2.2;
        word-break:keep-all;
      ">${wordSpans}</div>
      <div style="text-align:center;margin-top:6px;font-size:9px;color:#94a3b8">
        ${legendItems}
      </div>
    </div>
  `;
}
