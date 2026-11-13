/**
 * Text similarity utilities for comparing student records
 */

interface SimilarityMatch {
  text: string;
  startOffset: number;
  endOffset: number;
  similarity: number;
  matchedStudentId: string;
  matchedStudentName: string;
}

/**
 * Calculate Jaccard similarity between two sets of words
 * Fixed to properly handle Korean text
 */
function jaccardSimilarity(text1: string, text2: string): number {
  // Remove punctuation but keep Korean, English, and numbers
  const clean1 = text1.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '');
  const clean2 = text2.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '');

  const words1 = new Set(clean1.split(/\s+/).filter(w => w.length > 1));
  const words2 = new Set(clean2.split(/\s+/).filter(w => w.length > 1));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Find longest common substring between two texts
 */
function longestCommonSubstring(text1: string, text2: string): { text: string; start1: number; start2: number; length: number } {
  const m = text1.length;
  const n = text2.length;
  let maxLen = 0;
  let endPos1 = 0;

  // Create a 2D array for dynamic programming
  const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (text1[i - 1] === text2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > maxLen) {
          maxLen = dp[i][j];
          endPos1 = i - 1;
        }
      }
    }
  }

  const start1 = endPos1 - maxLen + 1;
  const commonText = text1.substring(start1, start1 + maxLen);
  const start2 = text2.indexOf(commonText);

  return {
    text: commonText,
    start1,
    start2,
    length: maxLen
  };
}

/**
 * Find all similar segments between two texts
 * Returns segments that are at least minLength characters and have similarity above threshold
 */
export function findSimilarSegments(
  text1: string,
  text2: string,
  minLength: number = 30,
  similarityThreshold: number = 0.5
): SimilarityMatch[] {
  const matches: SimilarityMatch[] = [];
  let remainingText1 = text1;
  let remainingText2 = text2;
  let offset1 = 0;

  while (remainingText1.length > minLength && remainingText2.length > minLength) {
    const lcs = longestCommonSubstring(remainingText1, remainingText2);

    if (lcs.length < minLength) break;

    // Calculate similarity for this segment
    const segment1 = remainingText1.substring(lcs.start1, lcs.start1 + lcs.length);
    const segment2 = remainingText2.substring(lcs.start2, lcs.start2 + lcs.length);
    const similarity = jaccardSimilarity(segment1, segment2);

    if (similarity >= similarityThreshold) {
      matches.push({
        text: lcs.text,
        startOffset: offset1 + lcs.start1,
        endOffset: offset1 + lcs.start1 + lcs.length,
        similarity,
        matchedStudentId: '',
        matchedStudentName: ''
      });
    }

    // Move past this match
    const skipTo = lcs.start1 + lcs.length;
    offset1 += skipTo;
    remainingText1 = remainingText1.substring(skipTo);
    remainingText2 = remainingText2.substring(lcs.start2 + lcs.length);
  }

  return matches;
}

/**
 * Calculate overall similarity percentage between two texts
 */
export function calculateTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;

  // Combine multiple similarity metrics
  const jaccardScore = jaccardSimilarity(text1, text2);

  // Normalize by length difference
  const lengthRatio = Math.min(text1.length, text2.length) / Math.max(text1.length, text2.length);

  // Find common substring ratio
  const lcs = longestCommonSubstring(text1, text2);
  const lcsRatio = lcs.length / Math.max(text1.length, text2.length);

  // Weighted average
  const similarity = (jaccardScore * 0.4) + (lengthRatio * 0.2) + (lcsRatio * 0.4);

  return Math.round(similarity * 100);
}

/**
 * Find similar texts from a pool of candidates
 */
export function findSimilarTexts(
  targetText: string,
  candidateTexts: Array<{ id: string; name: string; text: string }>,
  minSimilarity: number = 30
): Array<{ id: string; name: string; similarity: number; matches: SimilarityMatch[] }> {
  return candidateTexts
    .map(candidate => {
      const similarity = calculateTextSimilarity(targetText, candidate.text);
      const matches = similarity >= minSimilarity
        ? findSimilarSegments(targetText, candidate.text).map(m => ({
          ...m,
          matchedStudentId: candidate.id,
          matchedStudentName: candidate.name
        }))
        : [];

      return {
        id: candidate.id,
        name: candidate.name,
        similarity,
        matches
      };
    })
    .filter(result => result.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity);
}

export type { SimilarityMatch };

// --- New Sentence-Level Similarity Logic (for Evaluation Writer) ---

// Utility to calculate similarity between two strings (Dice Coefficient for sentences)
export function getSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  // Remove whitespace and normalize
  const s1 = str1.replace(/\s+/g, '').toLowerCase();
  const s2 = str2.replace(/\s+/g, '').toLowerCase();

  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  // Generate bigrams
  const getBigrams = (str: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  };

  const bg1 = getBigrams(s1);
  const bg2 = getBigrams(s2);

  // Intersection
  let intersection = 0;
  bg1.forEach(bg => {
    if (bg2.has(bg)) intersection++;
  });

  return (2 * intersection) / (bg1.size + bg2.size);
}

// Split text into sentences
export function splitSentences(text: string): string[] {
  if (!text) return [];
  // Split by typical Korean sentence endings (., ?, !) followed by space or newline
  return text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
}

export interface SentenceSimilarityResult {
  sentence: string;
  maxSimilarity: number;
  similarStudentIds: string[];
}

// Check current text against multiple other texts
export function checkSentenceSimilarity(
  currentText: string,
  otherDocs: { studentId: string; text: string }[]
): SentenceSimilarityResult[] {
  const sentences = splitSentences(currentText);

  return sentences.map(sentence => {
    let maxSim = 0;
    const similarStudentIds: string[] = [];

    otherDocs.forEach(doc => {
      // Split other doc into sentences to compare sentence-by-sentence
      const otherSentences = splitSentences(doc.text);
      let docMaxSim = 0;

      otherSentences.forEach(otherSent => {
        const sim = getSimilarity(sentence, otherSent);
        if (sim > docMaxSim) docMaxSim = sim;
      });

      if (docMaxSim > maxSim) maxSim = docMaxSim;
      if (docMaxSim >= 0.2) {
        similarStudentIds.push(doc.studentId);
      }
    });

    return {
      sentence,
      maxSimilarity: maxSim,
      similarStudentIds
    };
  });
}

/**
 * Find exact sentence matches across multiple documents
 * Used for "Exact Match" similarity analysis
 */
export interface ExactMatchResult {
  matches: {
    sentence: string;
    startOffset: number;
    endOffset: number;
    frequency: number; // How many other students have this exact sentence
    matchedStudentIds: string[];
  }[];
  score: number; // 0-100 percentage of text that is matched
}

export function findExactSentenceMatches(
  targetText: string,
  candidates: { id: string; text: string }[]
): ExactMatchResult {
  if (!targetText || candidates.length === 0) {
    return { matches: [], score: 0 };
  }

  // 1. Split target text into sentences, preserving offsets
  // We need regex that captures the delimiters to reconstruct offsets
  // Or simpler: iterate and find sentences.
  // Let's use a robust splitting approach that tracks indices.

  const sentences: { text: string; start: number; end: number }[] = [];

  // Simple sentence splitter: split by .!? followed by whitespace or EOL
  // Adjust regex as needed for Korean context.
  // Using a simpler approach: Match non-delimiter sequences followed by delimiters
  // Note: This logic needs to be fairly consistent with how users perceive "sentences".
  // A naive split might be enough for now:

  const regex = /[^.!?\n]+[.!?\n]+/g;
  let match;
  while ((match = regex.exec(targetText)) !== null) {
    sentences.push({
      text: match[0].trim(), // Trim for comparison
      start: match.index,
      end: match.index + match[0].length
    });
  }

  // Also handle the case where text doesn't end with punctuation
  // or catch remaining text? 
  // If the regex loop finishes, check if there's trailing text.
  // Actually, finding *any* substring match is expensive.
  // But the requirement is "sentence based".

  const matches = [];
  let totalMatchedLength = 0;

  /*
   * 후보 텍스트의 공백 정규화는 **문장마다 다시 하지 않는다.**
   *
   * 종전엔 루프 안에서 `cand.text.replace(/\s+/g,' ')` 를 호출했다 — 즉 (문장 수 ×
   * 후보 수) 번 같은 문자열을 다시 만들었다. 후보가 같은 반 몇 명이던 때는 티가 나지
   * 않았지만, 대조 범위를 **같은 학년 전체**(3학년은 세특 7,021행)로 바로잡은 뒤에는
   * 한 화면에서 수백만 번이 된다. 결과는 같고 비용만 드는 일이라 한 번만 만들어 둔다.
   */
  const prepared = candidates.map(cand => {
    const raw = cand.text ?? '';
    const normalized = raw.replace(/\s+/g, ' ');
    return { id: cand.id, raw, normalized };
  });

  for (const sent of sentences) {
    if (sent.text.length < 5) continue; // Skip very short fragments

    // Check frequency in candidates
    const matchedIds = new Set<string>();

    // Normalize target sentence for comparison (remove excessive whitespace)
    const normTarget = sent.text.replace(/\s+/g, ' ').trim();

    prepared.forEach(cand => {
      // 원문 그대로 또는 공백을 접은 형태 중 하나에 문장이 통째로 들어 있으면 일치.
      if (cand.raw.includes(normTarget) || cand.normalized.includes(normTarget)) {
        matchedIds.add(cand.id);
      }
    });

    if (matchedIds.size > 0) {
      matches.push({
        sentence: sent.text,
        startOffset: sent.start,
        endOffset: sent.end,
        frequency: matchedIds.size,
        matchedStudentIds: Array.from(matchedIds)
      });
      totalMatchedLength += (sent.end - sent.start);
      // Note: using original length for score
    }
  }

  const score = targetText.length > 0
    ? Math.round((totalMatchedLength / targetText.length) * 100)
    : 0;

  return { matches, score };
}
