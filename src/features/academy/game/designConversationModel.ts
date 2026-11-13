import type { InquiryConversationMessage } from '@/features/inquiry-design/services/inquiryDesignService';
import type { InquirySelectedSource } from '@/features/inquiry-design/types';
import { buildConversationContext } from '@/features/inquiry-design/utils/conversationSummary';

export function designConversationInput(sources: InquirySelectedSource[], requirements: string, messages: InquiryConversationMessage[]) {
  if (!messages.length) return { sources, context: requirements };
  return {
    sources: [...sources, { source_kind: 'manual' as const, snapshot: {
      kind: 'academy_design_conversation', label: '카시안과 나눈 탐구 설계 대화',
      note: '탐구 방향을 정하는 대화이며, 이미 실행한 활동의 증거가 아닙니다.',
      requirements, messages,
    } }],
    // The existing API caps guidance at 2,000 characters. Full text is retained
    // in the manual source for both generation and the saved research notebook.
    context: buildConversationContext(messages, requirements.slice(0, 600), 2000).text,
  };
}

export function savedDesignConversation(snapshots: unknown[] = []): InquiryConversationMessage[] {
  const record = snapshots.find(s => s && typeof s === 'object' && 'kind' in s && s.kind === 'academy_design_conversation');
  if (!record || typeof record !== 'object' || !('messages' in record) || !Array.isArray(record.messages)) return [];
  return record.messages.filter((m): m is InquiryConversationMessage => !!m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
}
