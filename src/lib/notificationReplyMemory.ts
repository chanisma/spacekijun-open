/**
 * 알림 [답장] — 고른 받는 사람 기억 (이 브라우저에만 있는 편의 기능, 2026-09-22)
 *
 * `보건실`·`최요한`처럼 교직원 명단에 없는 표시 이름은 같은 사람이 여러 번 보낸다(실측: 보건실
 * 10건). 매번 검색하지 않도록 지난번 고른 사람을 **미리 선택만** 해 둔다 — 확정이 아니다.
 * 화면이 '지난번 선택'이라고 표시하고 사용자가 바꿀 수 있다.
 *
 * 서버에 두지 않는 이유: 사람마다 같은 표시 이름을 다르게 해석할 수 있고(보건실 → 보건교사 A
 * 또는 B), 틀린 기억이 학교 전체로 퍼지면 엉뚱한 사람에게 답장이 간다.
 */
import { readStoredJson, writeStoredJson } from '@/lib/safeLocalStorage';

export const REPLY_MEMORY_KEY = 'notification-reply-recipients-v1';
export const REPLY_MEMORY_LIMIT = 50;

/** 표시 이름(정규화) → resource.id */
export type ReplyMemory = Record<string, string>;

const isReplyMemory = (v: unknown): v is ReplyMemory =>
  !!v && typeof v === 'object' && !Array.isArray(v)
  && Object.values(v as Record<string, unknown>).every((x) => typeof x === 'string');

export function readReplyMemory(): ReplyMemory {
  return readStoredJson<ReplyMemory>(REPLY_MEMORY_KEY, {}, isReplyMemory);
}

export function rememberReplyChoice(label: string, resourceId: string): void {
  const current = readReplyMemory();
  // 최근 것을 뒤로 보낸다 — 한도를 넘으면 가장 오래된 것부터 버린다
  delete current[label];
  current[label] = resourceId;
  writeStoredJson(REPLY_MEMORY_KEY, Object.fromEntries(Object.entries(current).slice(-REPLY_MEMORY_LIMIT)));
}
