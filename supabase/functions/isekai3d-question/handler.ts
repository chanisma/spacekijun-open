import type { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2';
import { MAJOR_CARD_CHANCE, TASK_CARD_CHANCE, checkIsekai3dCards, parseIsekai3dRequest, isekai3dPayload, isekai3dSystemPrompt, type Isekai3dRequest } from '../_shared/isekai3dQuestion.ts';

/**
 * 이세계 3D 질문 만들기 (2026-10-19 요청) — 그 맥락의 대기열이 비었을 때 3개를 만들어 넣는다.
 * 내주는 것은 하지 않는다: 학생은 RPC isekai3d_question_take 로 하루 1개만 받는다.
 *
 * 게임 → 스페이스기전 학생의 로컬 서버(학생 세션을 붙임) → 이 함수. 브라우저 CORS 로는 부르지 않는다.
 */

export const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
export const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });

const MODEL = 'solar-pro4';
const ENDPOINT = 'https://api.upstage.ai/v1/chat/completions';

/** interview-prep 과 같은 호출: reasoning_effort none(pro4 는 추론이 출력 예산을 먹는다), JSON, 잘림 거절 */
async function chat(aiFetch: typeof fetch, key: string, system: string, payload: unknown): Promise<unknown> {
  const response = await aiFetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: 'none',
      max_tokens: 2600,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
  });
  if (!response.ok) throw new Error('Provider unavailable');
  const body = await response.json();
  if (body.choices?.[0]?.finish_reason === 'length') throw new Error('Incomplete reply');
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Empty reply');
  return JSON.parse(text);
}

export async function handleIsekai3dQuestion(
  db: SupabaseClient,
  writer: SupabaseClient,
  user: Pick<User, 'id'>,
  raw: unknown,
  aiFetch: typeof fetch = fetch,
  random: () => number = Math.random,
): Promise<Response> {
  let req: Isekai3dRequest;
  try { req = parseIsekai3dRequest(raw); }
  catch (e) { return json({ error: (e as Error).message }, 400); }

  // 본인 상태: 학생·선생님인지(RPC 가 거절), 개인정보 동의, 그 맥락에 아직 안 받은 질문이 있는지
  const { data: status, error: statusError } = await db.rpc('isekai3d_status', { p_context_key: req.contextKey });
  if (statusError) return json({ error: statusError.code === '42501' ? statusError.message : '상태를 확인하지 못했어요.' }, statusError.code === '42501' ? 403 : 503);
  // 데스크만 쓰는 학생은 웹의 동의 화면(PrivacyConsentGate)을 거치지 않는다 — 여기서 막는다
  if (!status?.consent) return json({ error: '스페이스기전 웹에서 개인정보 처리 동의를 먼저 해 주세요.', code: 'CONSENT_REQUIRED' }, 403);
  // 관리자 시험(🛠)은 한도 없이 매번 새로 만든다 — 남은 것은 isekai3d_questions_add 가 버린다
  if (!status.dev && (status.pending ?? 0) > 0) return json({ status: 'pending_exists' });
  // 기억을 끈 학생: 경향 없이 만든다
  if (!status.memory) req.context.insights = req.context.recent = [];

  const key = Deno.env.get('SOLAR_API_KEY') ?? Deno.env.get('UPSTAGE_API_KEY');
  if (!key) return json({ error: 'AI 설정이 없어요.' }, 503);

  // 직업 질문은 가끔 과제 카드(TASK_CARD_CHANCE), 아니면 가끔 전공 지식 카드(MAJOR_CARD_CHANCE). 이어지는 질문이면 앞 답을 잇는다.
  const task = req.kind === 'career' && random() < TASK_CARD_CHANCE;
  const system = isekai3dSystemPrompt(req.kind, { task, major: req.kind === 'career' && !task && random() < MAJOR_CARD_CHANCE, follow: !!req.context.follow });
  let cards = checkIsekai3dCards(await chat(aiFetch, key, system, isekai3dPayload(req)), req, { task });
  // 한 번만 다시 (검사에서 다 떨어졌을 때)
  if (!cards.length) cards = checkIsekai3dCards(await chat(aiFetch, key, system, isekai3dPayload(req)), req, { task });
  if (!cards.length) return json({ error: '알맞은 질문을 만들지 못했어요.', code: 'NO_CARD' }, 502);

  // 만든 AI 와 AI 에 보낸 맥락도 남긴다 (질문을 나중에 살펴볼 수 있게 — 이름·학생이 쓴 글은 들어 있지 않다)
  const { data: added, error: addError } = await writer.rpc('isekai3d_questions_add', {
    p_user: user.id, p_kind: req.kind, p_context_key: req.contextKey, p_cards: cards,
    p_model: MODEL, p_context: isekai3dPayload(req),
  });
  if (addError) throw addError;
  if (added?.status === 'limit') return json({ error: '오늘은 질문을 더 만들 수 없어요.', code: 'DAILY_LIMIT' }, 429);
  return json({ status: added?.status ?? 'filled', count: added?.count ?? 0 });
}
