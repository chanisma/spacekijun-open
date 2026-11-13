import { aiChat, reasoningEffortFor } from '@/services/aiChat';
import {
  FACULTY_RULE_DRAFT_SYSTEM_PROMPT,
  buildFacultyRuleDraftUserPrompt,
  parseFacultyRuleDraft,
} from '@/lib/facultyRuleDraft';
import { STUDENT_RULE_DRAFT_MAX_INPUT, type DraftStudent } from '@/lib/studentRuleDraft';
import { mentionPromptSection, type MentionItem } from '@/lib/audienceMentions';
import type { FacultyAudienceVocab } from '@/hooks/useStudentAudience';

/**
 * 문장 → 교직원 대상 규칙 (2026-10-01). 학생 쪽 `studentRuleDraftService` 와 같은 설정 —
 * 측정 = scripts/student-rule-draft-test/live.mts (FACULTY=1). 결과는 패널에 채울 뿐, 추가는 사람이.
 */
const FACULTY_RULE_DRAFT_TIMEOUT_MS = 45000;

export async function generateFacultyRuleDraft(
  sentence: string,
  vocab: FacultyAudienceVocab,
  faculty: DraftStudent[],
  signal?: AbortSignal,
  /** 문장 속 `@` 로 고른 이름 — 프롬프트에 「확정된 이름」으로 싣고, 사람은 고른 id 로 정한다 */
  mentions: MentionItem[] = [],
) {
  const text = sentence.trim();
  if (!text || text.length > STUDENT_RULE_DRAFT_MAX_INPUT) {
    throw new Error(`찾을 교직원을 1~${STUDENT_RULE_DRAFT_MAX_INPUT}자로 적어 주세요.`);
  }
  const raw = await aiChat({
    systemPrompt: FACULTY_RULE_DRAFT_SYSTEM_PROMPT,
    // 교직원 명단은 싣지 않는다 — 어휘집(교과·과목·부서·자리·태그·동아리)만. 이름 대조는 parse 가 한다.
    userPrompt: buildFacultyRuleDraftUserPrompt(text, vocab) + mentionPromptSection(mentions),
    temperature: 0.1,
    maxCompletionTokens: 1500,
    reasoningEffort: reasoningEffortFor('extraction'),
    timeoutMs: FACULTY_RULE_DRAFT_TIMEOUT_MS,
    signal,
    errorPrefix: '조건 만들기 실패',
  });
  return parseFacultyRuleDraft(raw, vocab, faculty, text,
    new Map(mentions.filter((m) => m.kind === 'faculty' && m.id).map((m) => [m.label, m.id!])));
}
