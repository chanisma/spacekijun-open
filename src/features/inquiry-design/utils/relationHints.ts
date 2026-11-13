import type { InquiryEntityType } from '../types';

// Canonical relation verbs from the LLM schema. Keep this list in sync with
// `relation_type.enum` in supabase/functions/openai-proxy/index.ts — both must
// agree or the LLM will reject schema-strict outputs.
export type RelationVerb =
  | 'DEEPENED_FROM'
  | 'APPLIED_IN'
  | 'PART_OF'
  | 'SUPPORTS'
  | 'MOTIVATED_BY'
  | 'INSPIRED_BY'
  | 'EVIDENCED_BY'
  | 'RELATED_TO'
  | 'PERFORMED'
  | 'READ';

export interface RelationHintOption {
  verb: RelationVerb;
  label: string;       // Short Korean label visible on the chip
  description: string; // Tooltip shown when reading from the (existing → new Activity) perspective
}

// "자동" = no hint; let the LLM pick. Sentinel value stored in state.
export const AUTO_RELATION_HINT = 'AUTO' as const;
export type RelationHintValue = RelationVerb | typeof AUTO_RELATION_HINT;

export const AUTO_LABEL = '자동';

// All readings are phrased from the perspective of "the *new* Activity being designed
// connects to this existing entity via …". The LLM still owns direction; we only
// supply the verb. If the verb's natural direction is `Existing → NewActivity`
// (e.g., `APPLIED_IN`: concept applied in activity), the LLM emits that direction.
export const RELATION_OPTIONS_BY_TYPE: Record<InquiryEntityType, RelationHintOption[]> = {
  Interest: [
    { verb: 'MOTIVATED_BY', label: '동기', description: '이 관심사가 새 활동의 동기' },
    { verb: 'INSPIRED_BY', label: '영감', description: '이 관심사에서 영감을 얻음' },
    { verb: 'RELATED_TO', label: '관련', description: '단순 관련' },
  ],
  Concept: [
    { verb: 'APPLIED_IN', label: '적용', description: '이 개념이 새 활동에 적용됨' },
    { verb: 'RELATED_TO', label: '관련', description: '개념적으로 연관됨' },
  ],
  // Thread는 의도적으로 PART_OF(소속)만 허용. 탐구 흐름은 활동들이 속하는 상위
  // 컨테이너 개념이므로 새 활동과의 관계는 항상 "이 흐름에 소속"으로 모델링한다.
  // DEEPENED_FROM/RELATED_TO 등은 별도 verb로 의미가 모호해져 의도적으로 제외.
  Thread: [
    { verb: 'PART_OF', label: '소속', description: '새 활동이 이 탐구 흐름에 소속' },
  ],
  Activity: [
    { verb: 'DEEPENED_FROM', label: '심화', description: '새 활동이 이 과거 활동을 심화' },
    { verb: 'RELATED_TO', label: '관련', description: '관련 활동' },
  ],
  Book: [
    { verb: 'READ', label: '독서', description: '이 책을 읽음' },
    { verb: 'INSPIRED_BY', label: '영감', description: '책에서 영감을 얻음' },
    { verb: 'MOTIVATED_BY', label: '동기', description: '책에서 동기를 얻음' },
    { verb: 'EVIDENCED_BY', label: '근거', description: '책이 새 활동의 근거 자료' },
  ],
  Competency: [
    { verb: 'SUPPORTS', label: '뒷받침', description: '새 활동이 이 역량을 뒷받침' },
    { verb: 'EVIDENCED_BY', label: '근거', description: '새 활동이 역량을 증거함' },
  ],
  Attitude: [
    { verb: 'SUPPORTS', label: '뒷받침', description: '새 활동이 이 태도를 뒷받침' },
    { verb: 'RELATED_TO', label: '관련', description: '관련 태도' },
  ],
  Achievement: [
    { verb: 'EVIDENCED_BY', label: '근거', description: '새 활동이 이 성취의 근거' },
    { verb: 'RELATED_TO', label: '관련', description: '관련 성취' },
  ],
  Person: [
    { verb: 'INSPIRED_BY', label: '영감', description: '이 인물에게서 영감' },
    { verb: 'RELATED_TO', label: '관련', description: '관련 인물' },
  ],
  Role: [
    { verb: 'PERFORMED', label: '수행', description: '학생이 이 역할을 수행' },
    { verb: 'RELATED_TO', label: '관련', description: '관련 역할' },
  ],
  Student: [
    { verb: 'RELATED_TO', label: '관련', description: '학생과의 관계' },
  ],
};

// Look up the short Korean label for a chosen verb, falling back to the verb
// itself if the user picked one we don't have a translation for.
export function relationLabel(verb: RelationHintValue, entityType: string | null): string {
  if (verb === AUTO_RELATION_HINT) return AUTO_LABEL;
  const options = RELATION_OPTIONS_BY_TYPE[(entityType as InquiryEntityType) ?? 'Student'] ?? [];
  const match = options.find((option) => option.verb === verb);
  return match?.label ?? verb;
}

export function optionsForType(entityType: string | null): RelationHintOption[] {
  if (!entityType) return RELATION_OPTIONS_BY_TYPE.Student;
  return (
    RELATION_OPTIONS_BY_TYPE[entityType as InquiryEntityType] ??
    RELATION_OPTIONS_BY_TYPE.Student
  );
}
