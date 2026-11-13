/**
 * 텍스트 분석 유틸리티
 * 학생부 비교과 기록에서 키워드 추출 및 빈도 분석
 */

import type { Garu, POS, Token } from 'garu-ko/browser';
import type { Student } from '../types';

const KEYWORD_POS = new Set<POS>(['NNG', 'NNP', 'SL']);

let analyzerPromise: Promise<Garu> | null = null;

async function getKoreanAnalyzer(): Promise<Garu> {
  if (!analyzerPromise) {
    analyzerPromise = import('garu-ko/browser')
      .then(({ Garu }) => Garu.load())
      .catch(error => {
        analyzerPromise = null;
        throw error;
      });
  }

  return analyzerPromise;
}

// 불용어 (분석에서 제외할 단어들)
const STOP_WORDS = new Set([
  // 용언 및 어미형
  '하다', '이다', '되다', '있다', '없다', '같다', '하고', '하며', '하여', '하는', '한다', '했다',
  '한', '하였다', '하였고', '하였으며', '하면서', '하지만', '하기', '함으로써', '함께',
  '하면', '한다면', '했던', '할', '합니다', '하였습니다', '했습니다', '하십시오',
  '되며', '되고', '되어', '됨', '되는', '된', '될', '되었다', '되었고', '되었으며',
  '있는', '있고', '있으며', '있어', '있었다', '없는', '없고', '없으며', '없어', '없었다', '있음',
  '하게', '하도록', '하기에', '하기를', '하기도', '하나', '하니', '한데', '한바', '보임', '학생임', '작성함', '진행함',
  '주제로', '가지고',
  // 대명사
  '그', '저', '이', '그것', '저것', '이것', '여기', '거기', '저기', '이렇게', '그렇게', '저렇게',
  // 접속사
  '그리고', '그러나', '하지만', '또한', '및', '또', '그래서', '따라서', '왜냐하면', '즉',
  // 일반 불용어
  '것', '수', '등', '때', '중', '통해', '위해', '대한', '위한', '함께',
  '것을', '것이', '것은', '수는', '수가', '등을', '등이', '등은', '때는', '때에', '중에', '중의',
  '통하여', '위하여', '대하여', '관하여', '따라', '의하여', '관한', '대해', '위해서', '통한', '내용', '다양한'
]);

// 학생부 특화 불용어
const STUDENT_RECORD_STOP_WORDS = new Set([
  '학생', '활동', '학급', '학교', '교내', '수업', '시간', '과정', '참여', '모습', '태도', '자세', '능력', '자신', '보고서', '실험'
]);

export interface WordFrequency {
  word: string;
  count: number;
  category?: string; // 어떤 카테고리에서 등장했는지
  sourceCount: number; // 몇 개의 고유 소스에서 등장했는지
}

interface KeywordCandidate {
  word: string;
  start: number;
  end: number;
  pureNounEojeol: boolean;
}

function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word) || STUDENT_RECORD_STOP_WORDS.has(word);
}

function toKeywordCandidates(tokens: Token[]): KeywordCandidate[] {
  const candidates: KeywordCandidate[] = [];
  let keywordRun: Token[] = [];

  const flushKeywordRun = () => {
    if (keywordRun.length === 0) return;

    const word = keywordRun.map(token => token.text).join('');
    if (word && !isStopWord(word)) {
      candidates.push({
        word,
        start: tokens[0].start,
        end: tokens[0].end,
        pureNounEojeol: keywordRun.length === tokens.length,
      });
    }
    keywordRun = [];
  };

  for (const token of tokens) {
    if (KEYWORD_POS.has(token.pos)) {
      keywordRun.push(token);
    } else {
      flushKeywordRun();
    }
  }
  flushKeywordRun();

  return candidates;
}

function groupTokensByEojeol(tokens: Token[]): Token[][] {
  const groups: Token[][] = [];

  for (const token of tokens) {
    const current = groups[groups.length - 1];
    const sameEojeol = current
      && current[0].start === token.start
      && current[0].end === token.end;

    if (sameEojeol) {
      current.push(token);
    } else {
      groups.push([token]);
    }
  }

  return groups;
}

/**
 * 형태소 분석 결과에서 키워드가 될 수 있는 일반명사, 고유명사,
 * 외국어만 추출한다. 같은 어절의 연속 명사는 복합 명사로 복원한다.
 */
function extractKeywordCandidates(analyzer: Garu, text: string): KeywordCandidate[] {
  const { tokens } = analyzer.analyze(text);

  return groupTokensByEojeol(tokens)
    .flatMap(toKeywordCandidates);
}

/**
 * 공백으로만 구분된 연속 명사 어절을 복합 키워드로 결합한다.
 * 조사나 접사, 어미가 붙은 어절은 결합 대상에서 제외한다.
 */
function extractCompoundNouns(text: string, candidates: KeywordCandidate[]): string[] {
  const compounds: string[] = [];

  for (let i = 0; i < candidates.length - 1; i++) {
    const current = candidates[i];
    const next = candidates[i + 1];
    const separator = text.slice(current.end, next.start);

    if (!current.pureNounEojeol || !next.pureNounEojeol || !/^\s+$/.test(separator)) {
      continue;
    }

    const compound = current.word + next.word;
    if (compound.length >= 4 && compound.length <= 10) {
      compounds.push(compound);
    }
  }

  return compounds;
}

/**
 * 단어 빈도수 계산
 * source: 과목명, 학년 등 고유 출처 (다양성 측정에 사용)
 */
export async function analyzeWordFrequency(
  texts: Array<{ text: string; category?: string; source?: string }>,
  options: {
    minLength?: number;
    includeCompounds?: boolean;
    topN?: number;
  } = {}
): Promise<WordFrequency[]> {
  const {
    minLength = 2,
    includeCompounds = true,
    topN = 100
  } = options;

  const analyzer = await getKoreanAnalyzer();
  const wordCountMap = new Map<string, { count: number; categories: Set<string>; sources: Set<string> }>();

  // 각 텍스트에서 단어 추출 및 빈도 계산
  // 같은 source(과목) 내에서 같은 단어가 여러 번 나와도 한 번만 카운트
  texts.forEach(({ text, category, source }) => {
    const candidates = extractKeywordCandidates(analyzer, text);
    const nouns = candidates.map(candidate => candidate.word);

    // 복합 명사 추출
    const compounds = includeCompounds ? extractCompoundNouns(text, candidates) : [];

    // 이 텍스트(source)에서 이미 카운트한 단어 추적
    const countedWordsInThisSource = new Set<string>();

    // 모든 단어 처리
    [...nouns, ...compounds].forEach(word => {
      if (word.length >= minLength) {
        const existing = wordCountMap.get(word);
        const shouldCount = !countedWordsInThisSource.has(word);

        if (existing) {
          if (shouldCount) {
            existing.count++;
            countedWordsInThisSource.add(word);
          }
          if (category) existing.categories.add(category);
          if (source) existing.sources.add(source);
        } else {
          const categories = new Set<string>();
          const sources = new Set<string>();
          if (category) categories.add(category);
          if (source) sources.add(source);
          wordCountMap.set(word, { count: 1, categories, sources });
          countedWordsInThisSource.add(word);
        }
      }
    });
  });

  // 빈도순 정렬
  const sorted = Array.from(wordCountMap.entries())
    .map(([word, { count, categories, sources }]) => ({
      word,
      count,
      category: categories.size > 0 ? Array.from(categories).join(', ') : undefined,
      sourceCount: sources.size
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

  return sorted;
}

/**
 * 특정 단어가 포함된 문장 찾기
 */
export function findSentencesWithWord(
  texts: Array<{ text: string; source: string }>,
  targetWord: string
): Array<{ sentence: string; source: string }> {
  const results: Array<{ sentence: string; source: string }> = [];

  texts.forEach(({ text, source }) => {
    // 문장 분리 (마침표, 느낌표, 물음표 기준)
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

    sentences.forEach(sentence => {
      if (sentence.includes(targetWord)) {
        results.push({
          sentence: sentence.trim(),
          source
        });
      }
    });
  });

  return results;
}

/**
 * 카테고리별 키워드 추출
 */
export async function extractCategoryKeywords(
  categoryTexts: Record<string, string[]>,
  topN: number = 10
): Promise<Record<string, WordFrequency[]>> {
  const entries = await Promise.all(Object.entries(categoryTexts).map(async ([category, texts]) => {
    const textObjs = texts.map(text => ({ text, category }));
    const frequencies = await analyzeWordFrequency(textObjs, { topN });
    return [category, frequencies] as const;
  }));

  return Object.fromEntries(entries);
}

/**
 * 워드클라우드용 데이터 생성
 */
export interface WordCloudData {
  text: string;
  value: number;
  category?: string;
}

export function generateWordCloudData(
  frequencies: WordFrequency[],
  options: {
    minCount?: number;
    maxWords?: number;
  } = {}
): WordCloudData[] {
  const { minCount = 2, maxWords = 100 } = options;

  return frequencies
    .filter(f => f.count >= minCount)
    .slice(0, maxWords)
    .map(f => ({
      text: f.word,
      value: f.count,
      category: f.category
    }));
}

/**
 * 학생 교과 및 비교과 기록 전체 텍스트 추출
 */
export function extractStudentTexts(student: Student): Array<{ text: string; category: string; source: string }> {
  const texts: Array<{ text: string; category: string; source: string }> = [];

  // 교과 세부능력 및 특기사항 (세특)
  const academicData = student.section6_academic_development;
  academicData?.forEach(grade => {
    const content = grade.content || grade.remarks;
    if (content && content.trim().length > 0) {
      texts.push({
        text: content,
        category: '교과 세특',
        source: `${grade.subject} (${grade.grade || grade.semester}학년)`
      });
    }
  });

  // 창의적 체험활동
  const creativeActivities = student.section5_creative_activities;

  // 자율활동
  creativeActivities
    ?.filter(activity => (
      activity.type === '자율활동'
      || activity.category === '자율활동'
      || activity.area === '자율활동'
    ))
    .forEach(activity => {
      if (activity.content && activity.content.trim().length > 0) {
        texts.push({
          text: activity.content,
          category: '자율활동',
          source: `${activity.grade}학년`
        });
      }
    });

  // 동아리활동
  creativeActivities
    ?.filter(activity => (
      activity.type === '동아리활동'
      || activity.category === '동아리활동'
      || activity.area === '동아리활동'
    ))
    .forEach(activity => {
      if (activity.content && activity.content.trim().length > 0) {
        texts.push({
          text: activity.content,
          category: '동아리활동',
          source: `${activity.grade}학년`
        });
      }
    });

  // 진로활동
  creativeActivities
    ?.filter(activity => (
      activity.type === '진로활동'
      || activity.category === '진로활동'
      || activity.area === '진로활동'
    ))
    .forEach(activity => {
      if (activity.content && activity.content.trim().length > 0) {
        texts.push({
          text: activity.content,
          category: '진로활동',
          source: `${activity.grade}학년`
        });
      }
    });

  // 봉사활동은 단어 분석에서 제외
  // const volunteerData = student.volunteer_activities;
  // volunteerData?.forEach((activity: any) => {
  //   const content = activity.activity || activity.content;
  //   if (content && content.trim().length > 0) {
  //     texts.push({
  //       text: content,
  //       category: '봉사활동',
  //       source: activity.dateOrPeriod || activity.date || `${activity.grade}학년`
  //     });
  //   }
  // });

  // 행동특성 및 종합의견
  const behaviorData = student.section8_behavior_characteristics;
  behaviorData?.forEach(record => {
    if (record.content && record.content.trim().length > 0) {
      texts.push({
        text: record.content,
        category: '행동특성',
        source: `${record.grade}학년`
      });
    }
  });

  return texts;
}
