import { supabase } from '@/integrations/supabase/client';
import * as inquiry from '@/features/inquiry-design/services/inquiryDesignService';
import * as comprehensive from '@/features/inquiry-design/services/comprehensiveAnalysisService';
import type { SavedInquiryDesign, InquiryWorkspace } from '@/features/inquiry-design/types';
export const EXPERIENCE_STUDENT = '00-00001';
export const isExperience = (id: string | null | undefined) => !!id?.startsWith('experience:');
export const sourceStudent = (id: string | null) => isExperience(id) ? EXPERIENCE_STUDENT : id;
const db = supabase as unknown as import('@supabase/supabase-js').SupabaseClient;
const trialId = (id: string) => id.replace(/^trial:/, '');
export async function experienceWrite(kind: string, data: Record<string, unknown>, id?: string) {
  const result = await db.rpc('academy_experience_write', { p_kind: kind, p_data: data, p_id: id ? trialId(id) : null });
  if (result.error) throw result.error;
  return result.data;
}
async function experienceRows(kind: string) {
  const { data, error } = await db.rpc('academy_experience_read', { p_kind: kind });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({ ...r, id: `trial:${r.id}` }));
}
async function remove(id: string) {
  const { error } = await db.rpc('academy_experience_delete', { p_id: trialId(id) });
  if (error) throw error;
  return true;
}
export async function fetchInquiryWorkspace(studentId: string, version?: string | null): Promise<InquiryWorkspace> {
  const workspace = await inquiry.fetchInquiryWorkspace(sourceStudent(studentId)!, version, !isExperience(studentId));
  if (!isExperience(studentId)) return workspace;
  const [designs, recommendations] = await Promise.all([experienceRows('design'), experienceRows('recommendation')]);
  return { ...workspace, student: workspace.student ? { ...workspace.student, id: studentId, name: '체험자' } : null, savedDesigns: designs as SavedInquiryDesign[], comprehensiveRecommendations: recommendations } as InquiryWorkspace;
}
export const buildSourceFromEntity = inquiry.buildSourceFromEntity;
export const requestInquiryConversation = (input: Parameters<typeof inquiry.requestInquiryConversation>[0]) => inquiry.requestInquiryConversation({ ...input, studentId: sourceStudent(input.studentId)!, academyExperience: isExperience(input.studentId) });
export const requestInquiryAnalysis = (input: Parameters<typeof inquiry.requestInquiryAnalysis>[0]) => inquiry.requestInquiryAnalysis({ ...input, reasoningEffort: 'low', studentId: sourceStudent(input.studentId)!, academyExperience: isExperience(input.studentId) });
function designData(input: Parameters<typeof inquiry.createDraftInquiryDesign>[0], status: string, rationale = '') {
  return { title: input.analysis.title || input.target.name, kg_version_id: input.kgVersionId, target_kind: input.target.kind, target_name: input.target.name, target_ref: input.target.ref, academic_year: input.target.academic_year, grade: input.target.grade, semester: input.target.semester, status, selected_source_snapshot: input.selectedSources.map(s => s.snapshot), sources: input.selectedSources, llm_result: input.analysis, student_rationale: rationale, llm_token_usage: input.tokenUsage ?? {}, entities: input.analysis.entities, relations: input.analysis.relations };
}
export async function createDraftInquiryDesign(input: Parameters<typeof inquiry.createDraftInquiryDesign>[0]) {
  if (!isExperience(input.studentId)) return inquiry.createDraftInquiryDesign(input);
  const row = await experienceWrite('design', designData(input, 'draft'));
  return `trial:${row.id}`;
}
export async function saveInquiryDesign(input: Parameters<typeof inquiry.saveInquiryDesign>[0]) {
  if (!isExperience(input.studentId)) return inquiry.saveInquiryDesign(input);
  const row = await experienceWrite('design', designData(input, 'saved', input.rationale), input.draftDesignId ?? undefined);
  return `trial:${row.id}`;
}
export const deleteInquiryDesign = (id: string) => id.startsWith('trial:') ? remove(id) : inquiry.deleteInquiryDesign(id);
export const updateInquiryReflection = (id: string, reflection: string) => id.startsWith('trial:') ? experienceWrite('design', { reflection }, id) : inquiry.updateInquiryReflection(id, reflection);
export const acceptInquiryProposal = (id: string, rationale: string) => id.startsWith('trial:') ? experienceWrite('design', { student_rationale: rationale, status: 'saved' }, id) : inquiry.acceptInquiryProposal(id, rationale);
export const setInquiryObservation = (id: string, activity: string | null) => id.startsWith('trial:') ? experienceWrite('design', { observed_activity_id: activity, status: activity ? 'observed' : 'saved' }, id) : inquiry.setInquiryObservation(id, activity);
export const prepareComprehensiveAnalysis = async (input: Parameters<typeof comprehensive.prepareComprehensiveAnalysis>[0]) => {
  const result = await comprehensive.prepareComprehensiveAnalysis({ ...input, studentId: sourceStudent(input.studentId)!, academyExperience: isExperience(input.studentId) });
  return isExperience(input.studentId) ? { ...result, recommendationId: `trial:${result.recommendationId}` } : result;
};
export const generateComprehensiveAnalysis = (input: Parameters<typeof comprehensive.generateComprehensiveAnalysis>[0]) => comprehensive.generateComprehensiveAnalysis({ ...input, recommendationId: trialId(input.recommendationId), academyExperience: input.recommendationId.startsWith('trial:') });
export const deleteComprehensiveAnalysis = (id: string) => id.startsWith('trial:') ? remove(id) : comprehensive.deleteComprehensiveAnalysis(id);

export type { InquiryConversationMessage } from '@/features/inquiry-design/services/inquiryDesignService';
