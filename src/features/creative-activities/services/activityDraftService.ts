// ========================================
// 활동 기록 AI 초안 — LLM 호출
//
// 공용 어댑터 `aiChat()`를 쓴다(CLAUDE.md 규약).
// `supabase.functions.invoke('solar-proxy')`를 직접 부르지 말 것 —
// 공급자·모델을 바꿀 때 기능마다 손대야 하는 상태로 돌아간다.
//
// 순수 로직(프롬프트 조립·파싱·결손 판정)은 `utils/activityDraft.ts`에 있고
// 여기는 호출과 오류 문구만 담당한다.
// ========================================

import { aiChat, reasoningEffortFor } from '@/services/aiChat';
import {
  buildDraftSystemPrompt,
  buildDraftUserPrompt,
  parseDraftResponse,
  type DraftResult,
} from '../utils/activityDraft';

/**
 * 게이트웨이(약 150초)보다 **낮게** 잡아 504 대신 우리 메시지가 나가게 한다.
 * 2026-09-23 실측(추론 켜짐): 이 부류는 1.3~114.5초.
 */
const DRAFT_TIMEOUT_MS = 90000;

export interface GenerateDraftParams {
  /** 대화 누적 — [최초 설명, 추가 답변1, 추가 답변2 …] */
  turns: string[];
  academicYear: number;
  /** 오늘 날짜(YYYY-MM-DD). 상대 날짜 표현 해석 기준 */
  today: string;
  signal?: AbortSignal;
}

/**
 * 자연어 설명 → 활동 초안.
 *
 * 응답 형식이 깨져도 던지지 않는다 — `parseDraftResponse`가 질문으로 되돌린다.
 * 네트워크·쿼터 오류만 예외로 올라간다(`aiChat`이 본문을 열어 사람이 읽을 말로 만든다).
 */
export async function generateActivityDraft(params: GenerateDraftParams): Promise<DraftResult> {
  const raw = await aiChat({
    systemPrompt: buildDraftSystemPrompt(params.today, params.academicYear),
    userPrompt: buildDraftUserPrompt(params.turns),
    // 기록 초안은 사실 정리에 가깝다 — 낮은 온도로 흔들림을 줄인다
    temperature: 0.2,
    // 생성 과제다. 추론 강도는 `aiChat` 의 «측정된 조합만 담는 표» 가 정한다 —
    // 지금 generation 칸은 비어 있어 **엣지 기본값 'low' 가 그대로 적용**된다(현행 동작 유지).
    // 표 한 곳만 채우면 이 호출부를 건드리지 않고 전부 함께 바뀐다.
    reasoningEffort: reasoningEffortFor('generation'),
    timeoutMs: DRAFT_TIMEOUT_MS,
    signal: params.signal,
    errorPrefix: '활동 기록 AI 초안 실패',
  });

  // 원문(turns)을 함께 넘긴다 — 날짜 증거·사람 이름 판정을 코드가 직접 한다.
  // 프롬프트만으로는 모델이 오늘 날짜를 폴백으로 채우고 이름을 서술에 넣는다(실측).
  return parseDraftResponse(raw, params.turns);
}

/** 로컬 날짜 YYYY-MM-DD (UTC로 밀리지 않게 직접 조립) */
export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
