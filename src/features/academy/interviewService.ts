import { supabase } from '@/integrations/supabase/client';
import { parseInterviewEvaluation, parseInterviewQuestion } from '../../../supabase/functions/_shared/academyInterview';

export interface InterviewInput {
  academyExperience?: boolean;
  studentId: string;
  kgVersionId: string;
  sourceId: string;
  activityIds: string[];
  aspiration: string;
}
async function request(input: InterviewInput, mode: 'question' | 'evaluate', question?: string, answer?: string) {
  const { data, error } = await supabase.functions.invoke('academy-interview', { body: { ...input, mode, question, answer } });
  if (error) {
    let message = '교수 면담을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    if (error.context instanceof Response) {
      try {
        const body = await error.context.clone().json();
        if (typeof body.error === 'string') message = body.error;
      } catch { /* Retain the actionable fallback when the gateway returns non-JSON. */ }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(String(data.error));
  return data?.result;
}
export async function generateInterviewQuestion(input: InterviewInput) {
  return parseInterviewQuestion(await request(input, 'question'));
}
export async function evaluateInterviewAnswer(input: InterviewInput, question: string, answer: string) {
  return parseInterviewEvaluation(await request(input, 'evaluate', question, answer));
}
