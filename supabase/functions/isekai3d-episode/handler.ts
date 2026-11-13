import type { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkOutline, checkScene, episodePayload, episodeSystemPrompt, parseEpisodeRequest, type EpisodeOutline, type EpisodeRequest, type EpisodeScene, type PastScene } from '../_shared/isekai3dEpisode.ts';

/**
 * 이세계 사회인 직장 에피소드 만들기 (2026-10-25 요청) — 그 캐릭터·직장의 다음 장면 하나를 쓴다.
 * 시즌이 없거나 끝났으면 새 시즌(줄거리 + 첫 장면), 있으면 앞 장면과 결정을 이어 다음 장면.
 * 만든 장면은 곧바로 DB 에 남는다(isekai3d_episode_add) — 게임이 그동안 꺼져도 다음에 isekai3d_episode_take 로 받는다.
 * 내주는 것은 하지 않는다. 만들 것이 없으면(아직 받지 않은 장면이 있거나, 받고 답하지 않은 장면이 있으면) 만들지 않는다.
 *
 * 게임 → 스페이스기전 학생의 로컬 서버(학생 세션을 붙임) → 이 함수.
 */

export const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
export const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });

/**
 * 2026-10-26 Solar(solar-pro4) → OpenAI gpt-6-luna (요청). 면접 평가의 luna 경로와 같은 설정:
 * 추론 토큰과 답이 `max_completion_tokens` 를 나눠 쓰므로 하한 12,000, 추론 강도 'low'.
 * 어느 모델이 쓴 장면인지는 isekai3d_episode_add 의 p_model 에 남는다.
 */
export const MODEL = 'gpt-6-luna';
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MAX_COMPLETION_TOKENS = 12_000;
const REASONING_EFFORT = 'low';
/** 하루(한국 시간)에 만드는 장면 — DB 의 isekai3d_episode_add 도 같은 한도를 지킨다 */
export const DAILY_SCENES_MADE = 3;

async function chat(aiFetch: typeof fetch, key: string, system: string, payload: unknown): Promise<unknown> {
  const response = await aiFetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: REASONING_EFFORT,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
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

interface StatusScene { id: string; idx: number; scene: EpisodeScene; delivered: boolean; answered: boolean; choice: number | null; text: string | null }
interface Status {
  consent: boolean;
  dev: boolean;
  generatedToday: number;
  season: { id: string; outline: EpisodeOutline; scenes: StatusScene[] } | null;
  pastTitles: string[];
}

export async function handleIsekai3dEpisode(db: SupabaseClient, writer: SupabaseClient, user: Pick<User, 'id'>, raw: unknown, aiFetch: typeof fetch = fetch): Promise<Response> {
  let req: EpisodeRequest;
  try { req = parseEpisodeRequest(raw); }
  catch (e) { return json({ error: (e as Error).message }, 400); }

  const { data, error: statusError } = await db.rpc('isekai3d_episode_status', { p_game_key: req.gameKey, p_career: req.career.id });
  if (statusError) return json({ error: statusError.code === '42501' ? statusError.message : '상태를 확인하지 못했어요.' }, statusError.code === '42501' ? 403 : 503);
  const status = data as Status;
  if (!status?.consent) return json({ error: '스페이스기전 웹에서 개인정보 처리 동의를 먼저 해 주세요.', code: 'CONSENT_REQUIRED' }, 403);
  const season = status.season;
  // 받을 장면이 이미 있거나, 받은 장면의 결정을 아직 기다리면 만들지 않는다
  if (season?.scenes.some((s) => !s.delivered)) return json({ status: 'ready' });
  if (season?.scenes.some((s) => !s.answered)) return json({ status: 'waiting' });
  if (!status.dev && status.generatedToday >= DAILY_SCENES_MADE) return json({ error: '오늘은 이야기를 더 만들 수 없어요.', code: 'DAILY_LIMIT' }, 429);

  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return json({ error: 'AI 설정이 없어요.' }, 503);

  let outline: EpisodeOutline | null = null;
  let scene: EpisodeScene | null = null;
  const why: string[] = [];
  let payload: unknown;
  if (!season) {
    // 새 시즌: 줄거리와 첫 장면 (검사에서 떨어지면 두 번까지 다시)
    payload = episodePayload(req, { pastTitles: status.pastTitles ?? [] });
    for (let i = 0; i < 3 && !scene; i++) {
      const reply = (await chat(aiFetch, key, episodeSystemPrompt('season'), payload)) as Record<string, unknown>;
      outline = checkOutline(reply?.outline, req, why);
      scene = outline ? checkScene(reply?.scene, outline, req, false, why) : null;
    }
  } else {
    // 다음 장면: 지난 장면과 결정을 이어서. 줄기 수만큼 쓰면 마지막(5장면을 넘지 않는다)
    outline = season.outline;
    const past: PastScene[] = season.scenes.map((s) => ({ idx: s.idx, scene: s.scene, choice: s.choice, text: s.text }));
    const final = past.length + 1 >= Math.min(5, Math.max(3, outline.beats.length));
    payload = episodePayload(req, { outline, past, sceneIndex: past.length + 1 });
    for (let i = 0; i < 3 && !scene; i++) {
      const reply = (await chat(aiFetch, key, episodeSystemPrompt('next'), payload)) as Record<string, unknown>;
      scene = checkScene(reply?.scene, outline, req, final, why);
    }
  }
  if (!outline || !scene) return json({ error: '이야기를 쓰지 못했어요.', code: 'NO_SCENE', why: why.slice(-3) }, 502);

  const { data: added, error: addError } = await writer.rpc('isekai3d_episode_add', {
    p_user: user.id, p_game_key: req.gameKey, p_career: req.career.id, p_outline: season ? null : outline, p_scene: scene, p_model: MODEL,
  });
  if (addError) throw addError;
  if (added?.status === 'limit') return json({ error: '오늘은 이야기를 더 만들 수 없어요.', code: 'DAILY_LIMIT' }, 429);
  if (added?.status !== 'added') return json({ error: '이야기를 남기지 못했어요.', code: String(added?.status ?? 'ADD') }, 409);
  return json({ status: 'filled', idx: added.idx });
}
