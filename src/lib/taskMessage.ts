// ========================================
// 할 일 작업 「메시지 보내기」(message.send) — 단일 출처
// 기본 전달 = SPACEKIJUN 알림(서버 send_task_message). 쿨메신저는 자동 발송하지 않고
// 사람이 보내도록 본문·받는 사람을 복사해 준다(2026-09-22 방향 전환).
// 서버 짝: supabase/migrations/20260924120000_task_message.sql
// ========================================

import { EMPTY_AUDIENCE_RULE, parseAudienceRule, type AudienceRule } from './audienceRule';

export const MESSAGE_BODY_MAX = 4000;

export interface TaskMessageConfig {
  title: string;
  body: string;
  audience: AudienceRule;
}

export const EMPTY_MESSAGE_CONFIG: TaskMessageConfig = { title: '', body: '', audience: EMPTY_AUDIENCE_RULE };

export function parseMessageConfig(actionConfig: unknown): TaskMessageConfig {
  const raw = (actionConfig && typeof actionConfig === 'object'
    ? (actionConfig as Record<string, unknown>).message
    : null) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') return { ...EMPTY_MESSAGE_CONFIG };
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    body: typeof raw.body === 'string' ? raw.body : '',
    audience: parseAudienceRule(raw.audience),
  };
}

export function serializeMessageConfig(config: TaskMessageConfig): Record<string, unknown> {
  return { title: config.title.trim(), body: config.body.trim(), audience: config.audience };
}

export function validateMessageConfig(config: TaskMessageConfig): string | null {
  if (!config.body.trim()) return '보낼 본문을 쓰세요.';
  if (config.body.length > MESSAGE_BODY_MAX) return `본문은 ${MESSAGE_BODY_MAX.toLocaleString()}자까지입니다.`;
  if (config.audience.include.length === 0) return '받는 사람 조건을 하나 이상 추가하세요.';
  return null;
}

/**
 * 쿨메신저로 보낼 때 붙여 넣을 본문 — 제목을 첫 줄에 둔다(쿨메신저 쪽지에는 제목 칸이 없다).
 */
export function coolMessengerText(config: Pick<TaskMessageConfig, 'title' | 'body'>): string {
  const title = config.title.trim();
  const body = config.body.trim();
  return title ? `[${title}]\n${body}` : body;
}

/** 쿨메신저 받는 사람 칸에 붙여 넣을 이름 목록 — 쉼표로(중복 제거, 가나다순) */
export function recipientNamesText(names: string[]): string {
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')).join(', ');
}

/** 발송 기록 한 건 */
export interface TaskMessageSend {
  id: string;
  sent_at: string;
  sender_name: string | null;
  title: string;
  body: string;
  recipient_names: string[];
  unlinked_names: string[];
}

// ── 메시지 초안(AI) ─────────────────────────────────────────────────────────

export const MESSAGE_DRAFT_SYSTEM_PROMPT = `너는 고등학교 교직원에게 보내는 업무 메시지를 쓰는 사람이다.
주어진 업무·할 일 맥락과 요청(request)을 바탕으로 교직원에게 보낼 짧은 메시지를 쓴다.

규칙
- 존댓말(합니다체), 인사 한 줄 → 요청 내용 → 기한·방법(있으면) → 감사 인사 순.
- 맥락에 없는 날짜·숫자·장소를 지어내지 않는다. 모르면 쓰지 않는다.
- 본문은 700자 이내. 목록이 필요하면 "- " 로 시작하는 줄을 쓴다.
- 제목은 20자 이내 명사형.
- 반드시 JSON 한 개만 출력한다: {"title": "...", "body": "..."}`;

export function buildMessageDraftPrompt(input: {
  workTitle?: string | null;
  taskTitle?: string | null;
  taskDescription?: string | null;
  dueDate?: string | null;
  request: string;
  audienceText: string;
}): string {
  return JSON.stringify({
    work: input.workTitle ?? '',
    task: input.taskTitle ?? '',
    task_description: (input.taskDescription ?? '').slice(0, 2000),
    due_date: input.dueDate ?? '',
    recipients: input.audienceText,
    request: input.request.trim(),
  });
}

/** 모델 응답 → {title, body}. JSON 이 아니면 본문 전체로 받는다(초안을 버리지 않는다) */
export function parseMessageDraft(raw: string): { title: string; body: string } {
  const text = raw.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as { title?: unknown; body?: unknown };
      if (typeof parsed.body === 'string' && parsed.body.trim()) {
        return {
          title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
          body: parsed.body.trim(),
        };
      }
    } catch {
      /* 아래 폴백 */
    }
  }
  return { title: '', body: text.replace(/^```\w*\n?|```$/g, '').trim() };
}
