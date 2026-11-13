import type { InquirySelectedSource, InquiryTarget, SavedInquiryDesign } from '@/features/inquiry-design/types';

export function researchContinuation(design: SavedInquiryDesign, targets: InquiryTarget[]) {
  const matching = targets.filter(t => t.kind === design.target_kind && t.name === design.target_name);
  const target = matching.find(t => t.academic_year === design.academic_year && t.grade === design.grade && t.semester === design.semester) ?? matching[0];
  const source: InquirySelectedSource = { source_kind: 'manual', snapshot: {
    kind: 'academy_research_context', design_id: design.id, label: design.title,
    note: '연구 수첩에서 가져온 이전 탐구 설계와 학생의 성찰입니다. 설계는 실행한 경험의 증거가 아닙니다. 이 내용을 참고하여 학생과 후속 질문 및 활동을 설계하세요. 원래 기록은 별도로 보존됩니다.',
    target: { kind: design.target_kind, name: design.target_name, academic_year: design.academic_year, grade: design.grade, semester: design.semester },
    status: design.status, kg_version_id: design.kg_version_id,
    analysis: design.llm_result, rationale: design.student_rationale, reflection: design.reflection,
    observed_activity_id: design.observed_activity_id,
    // Do not recursively embed every ancestor when continuing a continuation.
    references: (design.selected_source_snapshot ?? []).filter(s => !s || typeof s !== 'object' || !('kind' in s) || s.kind !== 'academy_research_context'),
  } };
  const questions = design.llm_result?.inquiry_questions?.filter(Boolean).join('\n') ?? '';
  const requirements = [`‘${design.title}’ 탐구를 이어가고 싶어요.`, questions && `이전 탐구 질문:\n${questions}`, design.reflection && `실행하며 발견한 점과 다음 질문:\n${design.reflection}`, '이 기록에서 더 알아볼 질문과 활동을 함께 구체화하고 싶어요.'].filter(Boolean).join('\n\n').slice(0, 6000);
  return { target, source, requirements };
}
