/**
 * 서류함 AI 검색 — 자연어 질의를 구조화 검색 조건으로 변환해 DB 검색 실행.
 *
 * 구 구현(geminiDocumentService + 브라우저 임베딩 벡터 검색)은 클라이언트
 * Gemini API 키(규약 위반)와 삭제된 document_chunks 테이블에 의존해 죽어 있었다.
 * 재구축은 공용 `aiChat()` 어댑터(기본 Solar, 키는 edge function 시크릿)로
 * "질의 해석"만 LLM에 맡기고, 실제 검색은 RLS가 지키는 일반 쿼리로 수행한다.
 */
import { aiChat, reasoningEffortFor } from '@/services/aiChat';
import type { DocumentFilters } from '../types';
import { fetchDocuments } from './documentService';
import type { FetchDocumentsResult } from './documentService';

export interface AiSearchInterpretation {
  /** DB 검색에 쓸 조건 */
  filters: DocumentFilters;
  /** 사용자에게 보여줄 해석 요약 (한국어 한 문장) */
  explanation: string;
}

/**
 * ⚠️ **학사력 지식은 프롬프트에 «적어 둔다» — 모델이 매번 유도하게 두지 않는다 (2026-09-23).**
 *
 * 추론을 끄기 전(`reasoningEffort` 미지정 → 엣지 기본 'low')에는 모델이 "작년 2학기"를
 * 2025-08-31~**2026-02-27** 로 잡았다(2학기가 이듬해 2월까지임을 스스로 유도). 끄면
 * 2025-12-30 에서 끊는다 — 3회 관측에서 일관된 차이였다.
 *
 * 되돌리는 값싼 방법은 추론을 다시 켜는 것(**116초**)이 아니라 그 지식을 규칙으로
 * 적는 것이다(**3초**). 도메인 상수는 모델이 재유도할 대상이 아니라 우리가 아는 것이다.
 */
const SYSTEM_PROMPT = `너는 학교 문서함(서류함) 검색 도우미다. 사용자의 자연어 요청을 검색 조건 JSON으로 변환하라.

반드시 아래 형식의 JSON만 출력한다(코드펜스·설명 금지):
{
  "query": "핵심 검색 키워드 (파일명/제목/키워드에 부분 일치, 없으면 빈 문자열)",
  "department": "부서명 (명시된 경우만, 없으면 빈 문자열)",
  "dateFrom": "YYYY-MM-DD 또는 빈 문자열",
  "dateTo": "YYYY-MM-DD 또는 빈 문자열",
  "explanation": "어떻게 해석했는지 한국어 한 문장"
}

규칙:
- "작년", "올해", "지난달" 같은 상대 기간은 오늘 날짜 기준으로 계산한다.
- 학사 용어는 한국 학교 기준으로 해석한다. 학년도는 3월에 시작하고, 1학기는 3월~8월 중순, 2학기는 8월 말~이듬해 2월 중순이다. 따라서 "작년 2학기"는 작년 8월 말부터 올해 2월 중순까지다.
- query에는 조사·불용어를 빼고 핵심 명사만 남긴다 (예: "작년 교무부 회의록 찾아줘" → "회의록").
- 확실하지 않은 필드는 빈 문자열로 둔다.`;

/**
 * 사용자가 검색창 앞에서 기다리는 시간의 상한. 추론을 끈 실측이 3.0초라 넉넉하다.
 * 엣지 게이트웨이(약 150초)보다 **짧아야** 504 대신 우리 메시지가 나간다.
 */
const SEARCH_TIMEOUT_MS = 30_000;

function extractJson(raw: string): Record<string, unknown> {
  // 코드펜스·전후 잡담 방어: 첫 '{'부터 마지막 '}'까지를 파싱
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('AI 응답에서 검색 조건을 해석하지 못했습니다.');
  return JSON.parse(raw.slice(start, end + 1));
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 자연어 질의 → 검색 조건 해석 (LLM 1회 호출) */
export async function interpretSearchQuery(userQuery: string): Promise<AiSearchInterpretation> {
  const today = new Date().toISOString().slice(0, 10);
  const raw = await aiChat({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `오늘 날짜: ${today}\n사용자 요청: ${userQuery}`,
    // **추출 과제다** — 자연어 한 줄을 검색 조건 JSON 으로 옮겨 적을 뿐이다.
    // 종전엔 값을 지정하지 않아 엣지 기본값 'low' 로 나갔고, solar-pro4 는 그 상태에서
    // 출력의 **93%를 추론에 쓰며 116.2초**가 걸렸다(2026-09-23 실측). 'none' 은 **3.0초**이고
    // 해석 결과는 동등했다. 검색창 앞에서 2분을 기다리게 하던 자리다.
    reasoningEffort: reasoningEffortFor('extraction'),
    // 게이트웨이(약 150초)보다 먼저 포기해 "왜 안 되는지" 우리가 말한다.
    timeoutMs: SEARCH_TIMEOUT_MS,
    errorPrefix: '문서 AI 검색 실패',
  });

  const parsed = extractJson(raw);
  return {
    filters: {
      q: typeof parsed.query === 'string' ? parsed.query.trim() : '',
      department: typeof parsed.department === 'string' ? parsed.department.trim() : '',
      dateFrom: parseDate(parsed.dateFrom),
      dateTo: parseDate(parsed.dateTo),
    },
    explanation:
      typeof parsed.explanation === 'string' && parsed.explanation.trim()
        ? parsed.explanation.trim()
        : '요청을 검색 조건으로 변환했습니다.',
  };
}

export interface AiSearchResult extends FetchDocumentsResult {
  interpretation: AiSearchInterpretation;
}

/** 자연어 질의로 문서 검색 실행 (해석 + DB 검색) */
export async function aiSearchDocuments(userQuery: string): Promise<AiSearchResult> {
  const interpretation = await interpretSearchQuery(userQuery);
  const result = await fetchDocuments(interpretation.filters);
  return { ...result, interpretation };
}
