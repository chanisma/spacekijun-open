import { supabase } from '@/integrations/supabase/client';
import { newsSourceLabel } from '../utils/newsSources';
import {
  aiChatDetailed,
  OPENAI_CHAT_MODEL,
  type AiChatProvider,
} from '@/services/aiChat';
import {
  AnalysisParseError,
  parseAnalysisJson,
  type AnalysisParseFailure,
} from '../utils/analysisJson';
import type {
  AnalysisAudience,
  AnalysisFailureInfo,
  CompoundAnalysisRecord,
  CompoundAnalysisResult,
  SelectableNews,
  SelectableVideo,
} from '../types/aiAnalysis';

/**
 * 공급자·모델 — **OpenAI `gpt-6-luna`** (2026-09-11 사용자 결정).
 *
 * **왜 앱 기본값(Solar)을 쓰지 않는가.** `aiChat`은 `maxCompletionTokens`를
 * `provider === 'openai'`일 때만 실어 보내고, `solar-proxy`는 `max_tokens`를 아예
 * 보내지 않는다. 즉 이 호출은 Solar 경로에서 **출력 예산을 정한 적이 없고**, 추론 토큰과
 * 최종 출력이 같은 예산을 나눠 쓰는 모델에서 답이 중간에 끊겨
 * `JSON을 찾을 수 없습니다`가 됐다.
 *
 * **증거가 이 경로를 가리킨다**: 성공적으로 저장된 분석 2건(2026-04)이 모두
 * `gpt-5-mini`/`gpt-5.4-mini` 산 — 즉 예산이 실제로 전달되던 OpenAI 경로다. 기본 공급자가
 * Solar로 바뀐 뒤 이 호출부만 예산을 잃었다. 같은 이유로 스펙 채움(문서 생성)도
 * **luna 단독**으로 옮겼다(CLAUDE.md `document-generation`).
 *
 * **모델을 명시한다.** 생략하면 엣지 함수 기본값에 기대게 되고, 그 탓에 구 모델 폐기 때
 * 한 경로만 홀로 죽은 이력이 있다(`specFillService`의 같은 교훈).
 */
export const ANALYSIS_PROVIDER: AiChatProvider = 'openai';
export const ANALYSIS_MODEL = OPENAI_CHAT_MODEL;

/**
 * 출력 토큰 예산. **openai 경로이므로 이 값이 실제로 `max_completion_tokens`로 전달된다.**
 *
 * **왜 16000인가 — 넉넉해야 원인에서 배제된다.** 성공한 분석의 실측 출력은
 * JSON 2,173~2,625자 ≈ 1,300토큰이고, 이 저장소가 측정한 최악의 추론 비중
 * (출력의 79~85%가 추론)을 적용해도 총 9,000토큰 안쪽이다. `openai-proxy`의 기본값
 * 10,000으로는 빠듯하므로 그보다 위로 잡는다 — 추론 모델에서 예산이 빠듯하면
 * `content`가 빈 채 `finish_reason='length'`로 끝난다.
 *
 * **상한은 "그만큼 쓰라"가 아니라 "그 전에는 끊지 말라"이므로 크게 잡아도 느려지지 않는다.**
 */
export const ANALYSIS_MAX_TOKENS = 16000;

/**
 * 온도. 구조화된 JSON을 받는 호출이라 낮다.
 *
 * 종전 값은 1.0이었다 — 창작용 값이고, 형식 이탈(코드펜스·머리말·스키마 밖 필드)의
 * 확률을 키운다. 이 호출에서 원하는 것은 표현의 다양성이 아니라 **같은 스키마의 반복**이다.
 *
 * ⚠️ **반영되지 않을 수 있다**: reasoning 계열 모델은 custom temperature를 거부하고,
 * `openai-proxy`가 400을 받으면 **temperature만 떼고 재시도**한다(그때는 모델 기본 1.0).
 * 그래도 값을 남기는 이유는 ①의도 선언이고 ②모델이 바뀌면 그때부터 효력이 생기기 때문이다.
 * **형식 준수를 온도에만 의존하지 말 것** — 그래서 파싱 복구와 재시도가 함께 있다.
 */
export const ANALYSIS_TEMPERATURE = 0.3;
/** 재시도는 더 낮춘다 — 1차가 형식을 어겼으므로 결정성을 우선한다. */
export const ANALYSIS_RETRY_TEMPERATURE = 0.1;

const VIDEO_TRANSCRIPT_MAX_CHARS = 2400;

/**
 * Educational news 행에서 LLM 입력으로 줄 컨텍스트를 추출.
 * `content`/`data_points`/`cautions`은 DB 컬럼이 아니라 meta JSONB 안에 저장되는 케이스가 있어
 * 두 위치를 모두 확인한다.
 */
type NewsRowForLLM = {
  id: string;
  title: string;
  source: string;
  category: string | null;
  articleDate: string | null;
  headlineSummary: string | null;
  content: string | null;
  corePoints: string[];
  strategyImplications: string[];
  dataPoints: string[];
  cautions: string[];
};

/** Educational video 행에서 LLM 입력으로 줄 컨텍스트. */
type VideoRowForLLM = {
  id: string;
  title: string;
  channel: string | null;
  category: string | null;
  articleDate: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  headlineSummary: string | null;
  corePoints: string[];
  strategyImplications: string[];
  cautions: string[];
  keyConcepts: string[];
  highlights: { timeSec: number; note: string }[];
  transcript: string | null;
};

function formatHHMMSS(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

export function rowToLLMInput(row: any): NewsRowForLLM {
  const meta = (row?.meta ?? {}) as Record<string, unknown>;
  const contentFromMeta =
    typeof meta.content === 'string'
      ? (meta.content as string)
      : typeof meta.body === 'string'
      ? (meta.body as string)
      : typeof meta.full_text === 'string'
      ? (meta.full_text as string)
      : null;

  return {
    id: row.id,
    title: row.title,
    source: row.source,
    category: row.category ?? null,
    articleDate: row.article_date ?? row.collected_at ?? null,
    headlineSummary: row.headline_summary ?? null,
    content: row.content ?? contentFromMeta ?? null,
    corePoints: asStringArray(row.core_points),
    strategyImplications: asStringArray(row.strategy_implications),
    dataPoints: asStringArray(row.data_points ?? meta.data_points),
    cautions: asStringArray(row.cautions ?? meta.cautions),
  };
}

export function videoRowToLLMInput(row: any): VideoRowForLLM {
  const meta = (row?.meta ?? {}) as Record<string, unknown>;
  const highlightsRaw = Array.isArray(meta.timestamped_highlights)
    ? (meta.timestamped_highlights as unknown[])
    : [];
  const highlights = highlightsRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const rec = entry as Record<string, unknown>;
      const t = typeof rec.time_sec === 'number' ? rec.time_sec : Number(rec.time_sec);
      const note = typeof rec.note === 'string' ? rec.note : '';
      if (!Number.isFinite(t) || !note) return null;
      return { timeSec: Math.max(0, Math.floor(t)), note };
    })
    .filter((v): v is { timeSec: number; note: string } => v !== null);

  const transcriptRaw =
    typeof row.transcript === 'string'
      ? row.transcript
      : typeof meta.transcript === 'string'
      ? (meta.transcript as string)
      : null;

  return {
    id: row.id,
    title: row.title,
    channel: row.channel_label ?? null,
    category: row.category ?? null,
    articleDate: row.article_date ?? row.collected_at ?? null,
    durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : null,
    viewCount: typeof meta.view_count === 'number' ? (meta.view_count as number) : null,
    headlineSummary: row.headline_summary ?? null,
    corePoints: asStringArray(meta.core_points),
    strategyImplications: asStringArray(meta.strategy_implications),
    cautions: asStringArray(meta.cautions),
    keyConcepts: asStringArray(meta.key_concepts),
    highlights,
    transcript: transcriptRaw,
  };
}


function formatNewsForPrompt(items: NewsRowForLLM[]): string {
  return items
    .map((n, idx) => {
      const lines: string[] = [];
      lines.push(`### [기사 ${idx + 1}] ${n.title}`);
      lines.push(`- 출처: ${newsSourceLabel(n.source)}`);
      if (n.articleDate) lines.push(`- 일자: ${n.articleDate}`);
      if (n.category) lines.push(`- 분류: ${n.category}`);
      if (n.headlineSummary) lines.push(`- 한줄 요약: ${n.headlineSummary}`);
      if (n.corePoints.length > 0)
        lines.push(`- 핵심 포인트:\n${n.corePoints.map(p => `  • ${p}`).join('\n')}`);
      if (n.strategyImplications.length > 0)
        lines.push(`- 전략 시사점:\n${n.strategyImplications.map(p => `  • ${p}`).join('\n')}`);
      if (n.dataPoints.length > 0)
        lines.push(`- 데이터 포인트:\n${n.dataPoints.map(p => `  • ${p}`).join('\n')}`);
      if (n.cautions.length > 0)
        lines.push(`- 유의사항:\n${n.cautions.map(p => `  • ${p}`).join('\n')}`);
      if (n.content) {
        // 너무 긴 본문은 토큰 절약을 위해 잘라낸다
        const truncated = n.content.length > 1500 ? n.content.slice(0, 1500) + '…' : n.content;
        lines.push(`- 본문 발췌:\n${truncated}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

function formatVideosForPrompt(items: VideoRowForLLM[], offset: number): string {
  return items
    .map((v, idx) => {
      const num = offset + idx + 1;
      const lines: string[] = [];
      lines.push(`### [영상 ${num}] ${v.title}`);
      if (v.channel) lines.push(`- 채널: ${v.channel}`);
      if (v.articleDate) lines.push(`- 일자: ${v.articleDate}`);
      if (v.category) lines.push(`- 분류: ${v.category}`);
      if (v.durationSeconds) lines.push(`- 길이: ${formatHHMMSS(v.durationSeconds)}`);
      if (typeof v.viewCount === 'number') lines.push(`- 조회수: ${v.viewCount.toLocaleString()}`);
      if (v.headlineSummary) lines.push(`- 한줄 요약: ${v.headlineSummary}`);
      if (v.keyConcepts.length > 0)
        lines.push(`- 핵심 개념: ${v.keyConcepts.join(', ')}`);
      if (v.corePoints.length > 0)
        lines.push(`- 핵심 포인트:\n${v.corePoints.map(p => `  • ${p}`).join('\n')}`);
      if (v.strategyImplications.length > 0)
        lines.push(`- 전략 시사점:\n${v.strategyImplications.map(p => `  • ${p}`).join('\n')}`);
      if (v.cautions.length > 0)
        lines.push(`- 유의사항:\n${v.cautions.map(p => `  • ${p}`).join('\n')}`);
      if (v.highlights.length > 0) {
        const lined = v.highlights
          .map(h => `  • [${formatHHMMSS(h.timeSec)}] ${h.note}`)
          .join('\n');
        lines.push(`- 타임스탬프 하이라이트:\n${lined}`);
      }
      if (v.transcript) {
        const truncated =
          v.transcript.length > VIDEO_TRANSCRIPT_MAX_CHARS
            ? v.transcript.slice(0, VIDEO_TRANSCRIPT_MAX_CHARS) + '…'
            : v.transcript;
        lines.push(`- 자막 발췌:\n${truncated}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * 학교 고유 맥락. 교사·학생 어느 쪽이 돌리든 같은 학교의 자료이므로 공통이다.
 *
 * 학습 모드: 필요하면 계열 비중·진학 분포 등을 채워 분석 구체성을 높일 수 있다.
 */
const SCHOOL_CONTEXT_BLOCK = `
## 학교 맥락
- 본교는 일반고 여학교(여고)이다.
- 위 맥락에서 자료의 시사점이 본교 학생에게 직접 적용 가능한지 가늠하여 해석한다.
`;

/** 자료 종류별 활용 지침. 대상과 무관하게 같다. */
const SOURCE_GUIDE_BLOCK = `## 자료 종류별 활용 지침
- **뉴스 기사**는 정책 발표·통계 변화·언론사 해설 등 **공식·외부 정보** 출처로 본다.
- **영상**은 채널 운영자(컨설턴트/입학사정관/현직교사)의 **현장 해석·실전 사례·면접 노하우** 출처로 본다. 자막 발췌는 화자의 발언이며 언론 보도와 동등한 사실로 취급하지 않는다.
- 같은 주제에 뉴스와 영상이 모두 있으면 **둘을 교차 검증**해서 일치/불일치/보완 관계를 분석에 반영한다.
- 영상의 타임스탬프 하이라이트는 화자가 강조한 구간을 의미하므로 핵심 포인트 추출에 가중치를 둔다.`;

/**
 * 대상별로 갈리는 부분 — 화자·수신자·`strategy` 항목의 뜻.
 *
 * **`strategy`가 핵심 차이다.** 교사에게는 "학교 현장에서 활용 가능한 전략"(수업·상담·
 * 학년 운영)이지만, 학생에게 같은 것을 시키면 자기가 할 수 없는 일을 조언으로 받는다.
 * 학생에게는 "본인이 이번 학기에 직접 할 수 있는 행동"이어야 한다.
 */
const AUDIENCE_BLOCKS: Record<
  AnalysisAudience,
  { intro: string; strategyHint: string; extraGuide: string }
> = {
  teacher: {
    intro: `당신은 한국 고등학교 진학지도 전문가다.
교사가 큐레이션한 입시 관련 콘텐츠(뉴스 기사 + 입시 영상)를 받아, 단일 항목 요약을 넘어 **여러 자료를 가로지르는 패턴·트렌드·시사점**을 도출한다.`,
    strategyHint: '3~6개. 학교 현장에서 활용 가능한 구체 행동/전략.',
    extraGuide: '',
  },
  student: {
    intro: `당신은 한국 고등학생의 입시 준비를 돕는 진학 코치다.
학생 본인이 고른 입시 관련 콘텐츠(뉴스 기사 + 입시 영상)를 받아, 단일 항목 요약을 넘어 **여러 자료를 가로지르는 패턴·트렌드·시사점**을 도출하고, 학생이 스스로 판단하고 실행할 수 있는 형태로 정리한다.`,
    strategyHint: '3~6개. 학생 본인이 이번 학기에 직접 실행할 수 있는 행동.',
    extraGuide: `
## 학생에게 답할 때의 추가 규칙
- 읽는 사람이 **학생 본인**이다. 3인칭 지도 조언("이 학생에게는 …을 권한다")이 아니라 본인에게 하는 말로 쓴다.
- **합격 가능성·유리함을 단정하지 않는다.** 자료에 없는 커트라인·경쟁률을 만들어 내지 않는다.
- 특정 대학·전형을 "노려라"처럼 권하지 않는다. 판단 재료를 주고 선택은 본인과 담임·진학 담당 교사의 상담에 맡긴다.
- 개인 성적·생활기록부 내용은 이 자료에 없다. 개인화된 합불 판정을 시도하지 말고, 그런 판단이 필요하면 cautions에 "담임·진학 담당 교사와 확인하라"고 적는다.`,
  },
};

/**
 * 시스템 프롬프트.
 *
 * `audience`로 화자와 `strategy`의 뜻이 갈린다. JSON 스키마는 **두 대상이 완전히 같다** —
 * 갈라 두면 저장·표시·이력 조회가 대상마다 달라져야 하고, 그러면 학생이 만든 이력을
 * 교사가 열었을 때 필드가 비어 보인다.
 */
export function buildAnalysisSystemPrompt(
  perspective: string,
  audience: AnalysisAudience = 'teacher'
): string {
  const block = AUDIENCE_BLOCKS[audience];

  return `${block.intro}

## 분석 관점
${perspective}
${SCHOOL_CONTEXT_BLOCK}
${SOURCE_GUIDE_BLOCK}

## 출력 규칙 (반드시 준수)
- 응답은 **순수 JSON 객체** 하나만 출력. 마크다운 코드펜스, 머리말, 꼬리말 금지.
- 스키마:
{
  "summary": string,           // 3~5문장 종합 총평. 자료 묶음을 관통하는 핵심 메시지.
  "keyFindings": string[],     // 4~7개. 여러 자료를 비교/종합해서 도출된 발견. 단일 항목 요약 X.
  "trends": string[],          // 3~5개. 시간/정책/수치 변화 추세.
  "strategy": string[],        // ${block.strategyHint}
  "cautions": string[]         // 2~5개. 해석 시 유의점, 데이터 한계, 리스크.
}

## 작성 가이드
- 각 항목은 한국어 한 문장(최대 두 문장). **길게 쓰지 마라 — 출력이 길어지면 응답이 중간에 끊긴다.**
- 추측은 자제하되, 근거가 되는 자료 번호를 [기사 1, 영상 2]처럼 항목 끝에 표기.
- 영상 화자의 주장은 "영상 N에 따르면" 형태로 출처를 명시하고, 일반화하지 않는다.
- 동일 출처/채널 편향이 의심되면 cautions에 명시.
- 숫자가 등장하면 단위/연도/주체를 함께 표기.${block.extraGuide}`;
}

/**
 * 1차 시도가 형식을 어겼을 때 2차 시도의 시스템 프롬프트 끝에 붙이는 보강 지시.
 *
 * **짧아야 한다** — 추론 토큰과 최종 출력이 같은 예산을 나눠 쓰므로, 보강 지시가 길면
 * 그만큼 답에 쓸 예산이 줄어 "형식을 고치려다 더 심하게 잘리는" 상태가 된다.
 */
export const JSON_ONLY_REINFORCEMENT = `## 재시도 — 형식 위반이 있었다
직전 응답이 JSON으로 해석되지 않았다. 이번에는:
- 첫 글자가 { 이고 마지막 글자가 } 여야 한다. 그 앞뒤에 어떤 글자도 쓰지 마라.
- 코드펜스(\`\`\`)와 설명 문장을 쓰지 마라.
- 각 항목을 **한 문장으로 짧게** 쓰고 배열 길이는 최소 개수만 채워라. 길게 쓰면 또 끊긴다.`;

function buildUserPrompt(
  perspective: string,
  newsItems: NewsRowForLLM[],
  videoItems: VideoRowForLLM[],
  customNote?: string
): string {
  const total = newsItems.length + videoItems.length;
  const counts: string[] = [];
  if (newsItems.length > 0) counts.push(`기사 ${newsItems.length}건`);
  if (videoItems.length > 0) counts.push(`영상 ${videoItems.length}건`);
  const head = `다음 ${counts.join(' + ')} (총 ${total}건) 의 입시 관련 자료를 "${perspective}" 관점으로 복합 분석하라.`;

  const segments: string[] = [];
  if (newsItems.length > 0) segments.push(formatNewsForPrompt(newsItems));
  if (videoItems.length > 0) segments.push(formatVideosForPrompt(videoItems, newsItems.length));
  const body = segments.join('\n\n');

  const tail = customNote ? `\n\n## 추가 지시\n${customNote.trim()}` : '';
  return `${head}\n\n${body}${tail}`;
}

/**
 * 모델이 준 객체 → 화면·DB가 쓰는 형태.
 *
 * snake_case 별칭(`key_findings`·`strategies`)을 함께 받는다 — 스키마를 명시해도
 * 모델이 이 표기로 답하는 경우가 있고, 그때 필드를 못 찾으면 결과가 **조용히 비어** 나온다.
 */
export function normalizeResult(parsed: any): CompoundAnalysisResult {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
  return {
    summary: typeof parsed?.summary === 'string' ? parsed.summary.trim() : '',
    keyFindings: arr(parsed?.keyFindings ?? parsed?.key_findings),
    trends: arr(parsed?.trends),
    strategy: arr(parsed?.strategy ?? parsed?.strategies),
    cautions: arr(parsed?.cautions),
  };
}

/**
 * 보여 줄 만한 결과인가.
 *
 * 형식은 맞췄지만 전부 빈 응답(또는 복구했더니 아무것도 남지 않은 조각)을
 * 결과 화면에 올리면 사용자는 "분석이 끝났는데 내용이 없다"를 보게 된다.
 * 그건 성공이 아니라 실패이므로 재시도 대상으로 판정한다.
 */
export function hasUsableAnalysis(result: CompoundAnalysisResult): boolean {
  return (
    result.summary.trim().length > 0 ||
    result.keyFindings.length > 0 ||
    result.trends.length > 0 ||
    result.strategy.length > 0 ||
    result.cautions.length > 0
  );
}

/** 분석이 최종적으로 실패한 이유. */
export type AnalysisRunFailureReason = AnalysisParseFailure | 'empty-result';

const RUN_FAILURE_MESSAGES: Record<AnalysisRunFailureReason, string> = {
  truncated:
    'AI 응답이 길이 제한에 걸려 중간에 끊겼습니다. 선택한 자료 수를 줄이면 성공률이 올라갑니다.',
  'no-json': 'AI가 정해진 형식(JSON)으로 답하지 않았습니다.',
  invalid: 'AI 응답의 형식이 깨져 해석할 수 없었습니다.',
  'empty-result': 'AI가 형식은 맞췄지만 내용을 채우지 않았습니다.',
};

/**
 * 분석 실패. **원문과 원인을 들고 나온다** — 종전에는 `Error('JSON을 찾을 수 없습니다')`만
 * 남아 화면이 사용자에게 원인도, 모델이 뭐라고 했는지도 보여 줄 수 없었다.
 */
export class AnalysisRunError extends Error {
  readonly reason: AnalysisRunFailureReason;
  readonly raw: string;
  readonly attempts: number;
  /** 공급자가 알려준 종료 사유. `length`면 예산 소진이 확정된다. */
  readonly finishReason: string | null;

  constructor(
    reason: AnalysisRunFailureReason,
    raw: string,
    attempts: number,
    finishReason: string | null
  ) {
    super(RUN_FAILURE_MESSAGES[reason]);
    this.name = 'AnalysisRunError';
    this.reason = reason;
    this.raw = raw;
    this.attempts = attempts;
    this.finishReason = finishReason;
  }
}

/**
 * 무엇이 던져졌든 화면이 쓸 수 있는 실패 정보로 바꾼다.
 *
 * **단일 출처여야 한다** — 화면이 `err.message`를 직접 읽으면 파싱 실패와
 * 네트워크·쿼터 오류가 같은 토스트로 뭉개지고, 원문·종료 사유가 버려진다.
 */
export function toAnalysisFailure(err: unknown): AnalysisFailureInfo {
  if (err instanceof AnalysisRunError) {
    return {
      reason: err.reason,
      message: err.message,
      raw: err.raw,
      attempts: err.attempts,
      finishReason: err.finishReason,
    };
  }
  if (err instanceof AnalysisParseError) {
    return { reason: err.reason, message: err.message, raw: err.raw, attempts: 1, finishReason: null };
  }
  return {
    reason: 'request',
    message: err instanceof Error ? err.message : '분석 요청 중 오류가 발생했습니다.',
    raw: '',
    attempts: 1,
    finishReason: null,
  };
}

export type RunAnalysisInput = {
  perspective: string;
  rows: any[];           // educational_news 원본 행
  videoRows?: any[];     // educational_videos 원본 행 (선택)
  customNote?: string;   // 사용자가 추가로 보내는 짧은 지시사항
  /** 누가 돌리는가. 프롬프트의 화자·조언 대상이 갈린다. 기본 교사. */
  audience?: AnalysisAudience;
  /** 재시도 진입을 화면에 알린다(1차가 형식을 어겼을 때). */
  onAttempt?: (info: { attempt: number; total: number; previousReason?: AnalysisRunFailureReason }) => void;
};

export type RunAnalysisOutput = {
  result: CompoundAnalysisResult;
  raw: string;
  model: string;
  /** 잘린 응답을 복구해 얻은 결과인가. true면 일부 항목이 빠져 있다. */
  repaired: boolean;
  /** 몇 번째 시도에서 성공했는가. */
  attempts: number;
  finishReason: string | null;
};

/** 시도 횟수. 한 번에 30~120초가 걸리므로 2회가 상한이다(그 이상은 사용자가 기다리지 않는다). */
export const ANALYSIS_MAX_ATTEMPTS = 2;

export async function runCompoundAnalysis(
  input: RunAnalysisInput
): Promise<RunAnalysisOutput> {
  const newsItems = input.rows.map(rowToLLMInput);
  const videoItems = (input.videoRows ?? []).map(videoRowToLLMInput);
  if (newsItems.length === 0 && videoItems.length === 0) {
    throw new Error('분석할 자료가 없습니다.');
  }

  const audience = input.audience ?? 'teacher';
  const userPrompt = buildUserPrompt(
    input.perspective,
    newsItems,
    videoItems,
    input.customNote
  );

  let lastRaw = '';
  let lastReason: AnalysisRunFailureReason = 'no-json';
  let lastFinish: string | null = null;

  for (let attempt = 1; attempt <= ANALYSIS_MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;
    input.onAttempt?.({
      attempt,
      total: ANALYSIS_MAX_ATTEMPTS,
      previousReason: isRetry ? lastReason : undefined,
    });

    const base = buildAnalysisSystemPrompt(input.perspective, audience);
    const response = await aiChatDetailed({
      systemPrompt: isRetry ? `${base}\n\n${JSON_ONLY_REINFORCEMENT}` : base,
      userPrompt,
      // 공급자·모델을 **명시한다** — 앱 기본값(Solar)에 맡기면 출력 예산이 전달되지 않는다.
      provider: ANALYSIS_PROVIDER,
      model: ANALYSIS_MODEL,
      // 구조화된 JSON을 받는 호출이다. 종전 1.0은 창작용 값이라 형식 이탈을 키웠다.
      temperature: isRetry ? ANALYSIS_RETRY_TEMPERATURE : ANALYSIS_TEMPERATURE,
      maxCompletionTokens: ANALYSIS_MAX_TOKENS,
      errorPrefix: '뉴스 AI 분석 실패',
    });

    lastRaw = response.text;
    lastFinish = response.finishReason ?? null;

    try {
      const parsed = parseAnalysisJson(response.text);
      const result = normalizeResult(parsed.value);
      if (hasUsableAnalysis(result)) {
        return {
          result,
          raw: response.text,
          model: response.model,
          repaired: parsed.repaired,
          attempts: attempt,
          finishReason: lastFinish,
        };
      }
      lastReason = 'empty-result';
    } catch (err) {
      // 파싱 실패만 재시도 대상이다. 네트워크·인증·쿼터 오류는 다시 보내도 같으므로
      // 그대로 올려보내 사용자가 원인을 그대로 본다.
      if (!(err instanceof AnalysisParseError)) throw err;
      lastReason = err.reason;
    }

    // 재시도는 화면에서 한 번의 실행으로 보인다 — 무엇이 있었는지 로그에 남긴다
    console.warn(
      `[ipsi AI 분석] ${attempt}/${ANALYSIS_MAX_ATTEMPTS}차 시도 실패: ${lastReason}`,
      `(finish_reason=${lastFinish ?? '?'}, 응답 ${lastRaw.length}자)`
    );
  }

  throw new AnalysisRunError(lastReason, lastRaw, ANALYSIS_MAX_ATTEMPTS, lastFinish);
}

// ───────────────────────────────────────────────────────────────────
// DB 저장/조회/삭제
// ───────────────────────────────────────────────────────────────────

function rowToRecord(row: any): CompoundAnalysisRecord {
  return {
    id: row.id,
    title: row.title,
    perspective: row.perspective ?? null,
    sourceNewsIds: Array.isArray(row.source_news_ids) ? row.source_news_ids : [],
    sourceVideoIds: Array.isArray(row.source_video_ids) ? row.source_video_ids : [],
    summary: row.summary ?? null,
    keyFindings: asStringArray(row.key_findings),
    trends: asStringArray(row.trends),
    strategy: asStringArray(row.strategy),
    cautions: asStringArray(row.cautions),
    rawResponse: row.raw_response ?? null,
    model: row.model ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type SaveAnalysisInput = {
  title: string;
  perspective: string;
  sourceNewsIds: string[];
  sourceVideoIds: string[];
  result: CompoundAnalysisResult;
  rawResponse: unknown;
  model: string;
  createdBy: string;
};

export async function saveCompoundAnalysis(
  input: SaveAnalysisInput
): Promise<CompoundAnalysisRecord> {
  const { data, error } = await (supabase as any)
    .from('educational_news_compound_analysis' as any)
    .insert({
      title: input.title,
      perspective: input.perspective,
      source_news_ids: input.sourceNewsIds,
      source_video_ids: input.sourceVideoIds,
      summary: input.result.summary,
      key_findings: input.result.keyFindings,
      trends: input.result.trends,
      strategy: input.result.strategy,
      cautions: input.result.cautions,
      raw_response: input.rawResponse,
      model: input.model,
      created_by: input.createdBy,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return rowToRecord(data);
}

export async function listCompoundAnalyses(): Promise<CompoundAnalysisRecord[]> {
  const { data, error } = await (supabase as any)
    .from('educational_news_compound_analysis' as any)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(rowToRecord);
}

export async function deleteCompoundAnalysis(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('educational_news_compound_analysis' as any)
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchNewsRowsByIds(ids: string[]): Promise<any[]> {
  if (ids.length === 0) return [];
  const { data, error } = await (supabase as any)
    .from('educational_news' as any)
    .select('*')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}

export async function fetchVideoRowsByIds(ids: string[]): Promise<any[]> {
  if (ids.length === 0) return [];
  const { data, error } = await (supabase as any)
    .from('educational_videos' as any)
    .select('*')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}

export function newsRowToSelectable(row: any): SelectableNews {
  return {
    kind: 'news',
    id: row.id,
    title: row.title,
    source: row.source,
    category: row.category ?? null,
    articleDate: row.article_date ?? row.collected_at ?? null,
    headlineSummary: row.headline_summary ?? null,
    url: row.url,
  };
}

export function videoRowToSelectable(row: any): SelectableVideo {
  return {
    kind: 'video',
    id: row.id,
    title: row.title,
    channelLabel: row.channel_label ?? null,
    category: row.category ?? null,
    articleDate: row.article_date ?? row.collected_at ?? null,
    headlineSummary: row.headline_summary ?? null,
    durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : null,
    url: row.url,
  };
}
