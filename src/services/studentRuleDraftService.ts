import { aiChat, reasoningEffortFor } from '@/services/aiChat';
import type { StudentAudienceVocab } from '@/lib/studentAudienceRule';
import { mentionPromptSection, type MentionItem } from '@/lib/audienceMentions';
import {
  STUDENT_RULE_DRAFT_MAX_INPUT,
  STUDENT_RULE_DRAFT_SYSTEM_PROMPT,
  buildStudentRuleDraftUserPrompt,
  parseStudentRuleDraft,
  type DraftStudent,
} from '@/lib/studentRuleDraft';

/**
 * 문장 → 학생 대상 규칙 (조건으로 고르기 2단계, 2026-10-01).
 * 실측(solar-pro4 · 추론 none): 응답 p50 0.8초·p90 2초, 문장 70개 96~97%(홀드아웃 18/20) —
 * scripts/student-rule-draft-test/live.mts. 사람이 버튼을 누를 때만 부르고, 결과는 패널에
 * 채워 **보여 줄 뿐**이다(추가는 사람이 [N명 추가]로).
 */
const STUDENT_RULE_DRAFT_TIMEOUT_MS = 45000;

export async function generateStudentRuleDraft(
  sentence: string,
  vocab: StudentAudienceVocab,
  students: DraftStudent[],
  signal?: AbortSignal,
  /** 문장 속 `@` 로 고른 이름 — 프롬프트에 「확정된 이름」으로 싣고, 사람은 고른 id 로 정한다 */
  mentions: MentionItem[] = [],
) {
  const text = sentence.trim();
  if (!text || text.length > STUDENT_RULE_DRAFT_MAX_INPUT) {
    throw new Error(`찾을 학생을 1~${STUDENT_RULE_DRAFT_MAX_INPUT}자로 적어 주세요.`);
  }
  const raw = await aiChat({
    systemPrompt: STUDENT_RULE_DRAFT_SYSTEM_PROMPT,
    // 학생 명단은 싣지 않는다 — 어휘집(학급·과목·동아리)만. 이름 대조는 parse 가 한다.
    // (@ 로 고른 학생 이름은 문장에 이미 있는 것이라 「확정된 이름」 절에 다시 적힐 뿐 명단이 나가지는 않는다)
    userPrompt: buildStudentRuleDraftUserPrompt(text, vocab) + mentionPromptSection(mentions),
    temperature: 0.1,
    maxCompletionTokens: 1500,
    // 문장에서 조건을 뽑는 추출 과제다. 추론 강도는 aiChat 의 측정표가 정한다.
    reasoningEffort: reasoningEffortFor('extraction'),
    timeoutMs: STUDENT_RULE_DRAFT_TIMEOUT_MS,
    signal,
    errorPrefix: '조건 만들기 실패',
  });
  return parseStudentRuleDraft(raw, vocab, students, text, {
    students: new Map(mentions.filter((m) => m.kind === 'student' && m.id).map((m) => [m.label, m.id!])),
    teachers: new Map(mentions.filter((m) => m.kind === 'teacher' && m.id).map((m) => [m.label.replace(/\s*선생님$/, ''), m.id!])),
  });
}
