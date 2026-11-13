import type { Student } from '../../../types';
import { KEYWORDS } from '../../../data/keywords';
import { extractStudentTexts } from '../../../utils/textAnalysis';
import { extractRealContent } from '../../../utils/textUtils';

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '자기관리':     { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0' },
  '지식정보처리': { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
  '창의적사고':   { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  '심미적감성':   { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
  '협력적소통':   { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
  '공동체':       { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
};

interface MatchedKeyword {
  keyword: string;
  count: number;
}

export function renderKeywordAnalysis(student: Student): string | null {
  // Extract all text content
  const texts = extractStudentTexts(student);
  if (texts.length === 0) return null;

  const allContent = texts.map(t => extractRealContent(t.text)).join(' ');

  // Match keywords per category
  const categoryResults: Record<string, { matched: MatchedKeyword[]; unmatched: string[] }> = {};
  let totalMatched = 0;

  Object.entries(KEYWORDS).forEach(([category, keywords]) => {
    const matched: MatchedKeyword[] = [];
    const unmatched: string[] = [];

    keywords.forEach(kw => {
      // Count occurrences (simple string matching, same as KeywordAnalysis.tsx)
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = allContent.match(regex);
      if (matches && matches.length > 0) {
        matched.push({ keyword: kw, count: matches.length });
      } else {
        unmatched.push(kw);
      }
    });

    matched.sort((a, b) => b.count - a.count);
    totalMatched += matched.length;
    categoryResults[category] = { matched, unmatched };
  });

  if (totalMatched === 0) return null;

  // Render each category card (compact for single-page fit)
  const cards = Object.entries(categoryResults).map(([category, { matched, unmatched }]) => {
    const colors = CATEGORY_COLORS[category] || { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };

    const matchedTags = matched.map(m =>
      `<span style="
        display:inline-block;
        background:${colors.bg};
        color:${colors.text};
        border:1px solid ${colors.border};
        padding:1px 5px;
        border-radius:10px;
        font-size:9px;
        font-weight:600;
        margin:1px;
        white-space:nowrap;
      ">${m.keyword}<span style="
        background:${colors.text};
        color:white;
        padding:0 3px;
        border-radius:6px;
        font-size:8px;
        margin-left:3px;
      ">${m.count}</span></span>`
    ).join('');

    const unmatchedText = unmatched.join(', ');

    return `
      <div style="
        border:1px solid ${colors.border};
        border-radius:6px;
        padding:6px 8px;
        page-break-inside:avoid;
      ">
        <div style="
          display:flex;
          align-items:center;
          gap:6px;
          margin-bottom:4px;
        ">
          <span style="
            font-weight:700;
            font-size:10px;
            color:${colors.text};
          ">${category}</span>
          <span style="
            font-size:9px;
            color:${matched.length > 0 ? colors.text : '#94a3b8'};
            font-weight:600;
          ">${matched.length}/${matched.length + unmatched.length}</span>
        </div>
        ${matched.length > 0 ? `
          <div style="line-height:1.7">
            ${matchedTags}
          </div>
        ` : ''}
        ${unmatched.length > 0 ? `
          <div style="
            ${matched.length > 0 ? 'margin-top:3px;border-top:1px dashed #e2e8f0;padding-top:3px;' : ''}
            font-size:8px;
            color:#94a3b8;
            line-height:1.5;
          "><span style="font-weight:600">사용 가능:</span> ${unmatchedText}</div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Summary bar (compact)
  const summaryItems = Object.entries(categoryResults).map(([category, { matched, unmatched }]) => {
    const colors = CATEGORY_COLORS[category] || { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
    const total = matched.length + unmatched.length;
    const pct = total > 0 ? Math.round((matched.length / total) * 100) : 0;
    return `<div style="flex:1;text-align:center;min-width:60px">
      <div style="font-size:8px;color:#64748b">${category}</div>
      <div style="font-size:12px;font-weight:700;color:${colors.text}">${matched.length}</div>
      <div style="
        height:3px;
        background:#e2e8f0;
        border-radius:2px;
        margin-top:2px;
        overflow:hidden;
      "><div style="
        height:100%;
        width:${pct}%;
        background:${colors.text};
        border-radius:2px;
      "></div></div>
    </div>`;
  }).join('');

  return `
    <div class="print-section">
      <div class="print-section-title"><span class="tab-badge">역량분석</span>핵심역량 키워드 분석</div>
      <div style="
        display:flex;
        gap:6px;
        padding:6px 10px;
        background:#f8fafc;
        border-radius:6px;
        margin-bottom:8px;
      ">${summaryItems}</div>
      <div style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:6px;
      ">${cards}</div>
    </div>
  `;
}
