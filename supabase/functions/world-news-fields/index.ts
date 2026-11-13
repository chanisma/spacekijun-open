// 요즘 세상 — 기사 분야 태그 (2026-10-11, docs/features/world-today.md «관심 분야 맞춤»)
//
// 방아쇠 = pg_cron(world-news-tag, 매시 30분) → world_news_private.wake_tagger() → net.http_post.
//   분류 안 된(fields is null) 선별 기사가 있을 때만 깨운다. 소급(backfill)도 같은 함수를 되풀이해 부른다.
// 인증 = 게이트웨이 JWT 가 아니라 x-world-secret(DB 가 만든 비밀, world_news_tagger_secret RPC 로 대조) — push-send 와 같은 방식.
// 모델 = Solar(추출 과제라 reasoning_effort 'none' — CLAUDE.md «추출·재작성 과제에 추론을 켜 두지 말 것»).
//
// ⚠️ 분야 목록 FIELDS 는 세 벌이다: 여기 · SQL world_news_private.field_list() · src/features/world-today/utils/fields.ts.
//    회귀 fields.test.ts 가 셋을 대조한다. 모델이 목록 밖 이름을 내면 버린다(CHECK 가 저장을 통째로 거부하므로).
import { aiLogContext, aiLogFetch } from '../_shared/aiCallLog.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

export const FIELDS = [
  '의학·보건', '생명과학', '화학·소재', '물리·우주', '지구·환경', '에너지', '수학', 'AI·컴퓨터',
  '공학·로봇', '경제·경영', '사회·윤리·법', '교육·심리', '인문·언어', '예술·미디어',
] as const;
const FIELD_SET = new Set<string>(FIELDS);
const MODEL = 'solar-pro4';
const BATCH = 10;

interface Row { id: number; title: string; summary: string | null; keywords: string[] | null; why_it_matters: string | null }

const SYSTEM = `너는 고등학생에게 과학·사회 기사를 관심 분야별로 안내하는 분류기다.
기사마다 아래 목록에서 그 기사를 «관심 있어 할 학생의 분야»를 1~3개 고른다. 첫째가 가장 중심이 되는 분야다.
목록: ${FIELDS.join(', ')}

규칙
- 목록에 있는 이름을 글자 그대로 쓴다. 목록 밖 이름을 만들지 않는다.
- «AI·컴퓨터»는 기사의 주제가 AI·컴퓨팅 기술 그 자체일 때 고른다. AI 를 도구로 쓴 신약·진단 연구라면 «의학·보건»이 첫째이고, AI·컴퓨터는 둘째 이하로 둔다. AI 로 소재를 찾았다면 «화학·소재»가 첫째다.
- 질병·진단·치료·병원·간호·신약·건강은 «의학·보건». 유전자·세포·단백질·생태는 «생명과학». 두 쪽 모두면 둘 다 고른다.
- 로봇·자율주행·반도체 소자·기계·건축은 «공학·로봇». 우주·천문·입자·양자물리는 «물리·우주». 기후·환경·해양·지질은 «지구·환경».
- 정책·규제·법·윤리·노동·인권은 «사회·윤리·법». 산업·투자·기업·시장은 «경제·경영». 학습·교실·심리·뇌인지 행동은 «교육·심리».
- 억지로 3개를 채우지 않는다. 딱 맞는 분야가 하나면 하나만 쓴다.
출력은 JSON 하나: {"items":[{"id":숫자,"fields":["분야",...]}]}`;

function userPrompt(rows: Row[]) {
  return JSON.stringify(rows.map((r) => ({
    id: r.id,
    title: r.title,
    keywords: (r.keywords ?? []).slice(0, 8),
    summary: (r.summary ?? r.why_it_matters ?? '').slice(0, 600),
  })));
}

/** 모델 출력 → id 별 분야. 목록 밖·중복은 버리고 3개로 자른다. 응답에 없는 id 는 결과에 없다(다음 번에 다시 시도). */
export function parseFields(content: string, ids: number[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) return out;
  let parsed: unknown;
  try { parsed = JSON.parse(content.slice(start, end + 1)); } catch { return out; }
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return out;
  const wanted = new Set(ids);
  for (const item of items) {
    const id = Number((item as { id?: unknown })?.id);
    const raw = (item as { fields?: unknown })?.fields;
    if (!wanted.has(id) || !Array.isArray(raw)) continue;
    const fields = [...new Set(raw.filter((f): f is string => typeof f === 'string').map((f) => f.trim()).filter((f) => FIELD_SET.has(f)))].slice(0, 3);
    out.set(id, fields);
  }
  return out;
}

async function classify(rows: Row[], key: string, request: typeof fetch = fetch) {
  const res = await request('https://api.upstage.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      reasoning_effort: 'none',
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt(rows) }],
    }),
  });
  if (!res.ok) throw new Error(`solar ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return parseFields(String(json?.choices?.[0]?.message?.content ?? ''), rows.map((r) => r.id));
}

Deno.serve(async (req) => {
  const supplied = req.headers.get('x-world-secret');
  if (!supplied) return new Response('Unauthorized', { status: 401 });
  const { data: secret, error: secretError } = await db.rpc('world_news_tagger_secret');
  if (secretError || supplied !== secret) return new Response('Unauthorized', { status: 401 });

  const key = Deno.env.get('SOLAR_API_KEY') ?? Deno.env.get('UPSTAGE_API_KEY');
  if (!key) return Response.json({ error: 'SOLAR_API_KEY missing' }, { status: 500 });

  let limit = 40;
  try { limit = Math.min(60, Math.max(1, Number((await req.json())?.limit) || 40)); } catch { /* 기본값 */ }

  const { data, error } = await db.from('ai_news')
    .select('id,title,summary,keywords,why_it_matters')
    .eq('keep', true).is('fields', null)
    .order('published_at', { ascending: false, nullsFirst: false }).limit(limit);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Row[];

  // 매시 크론이 부르는 분류 — 사람 없이 돌므로 기록이 유일한 확인 수단이다
  const aiFetch = aiLogFetch(aiLogContext('world-news-fields', 'world-today', null, { action: 'fields' }));
  let tagged = 0;
  const failures: string[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    try {
      const result = await classify(batch, key, aiFetch);
      // 응답이 깨지거나 일부 id 를 빠뜨린 묶음은 한 편씩 다시 묻는다(2026-10-11 소급 중 실제로 10편 묶음이 통째로
      // 빈 결과였다 — 다시 묶어 부르면 같은 자리에서 또 빠져 영원히 미분류로 남는다).
      for (const row of batch.filter((r) => !result.has(r.id))) {
        try {
          const single = await classify([row], key, aiFetch);
          if (single.has(row.id)) result.set(row.id, single.get(row.id)!);
          else failures.push(`${row.id}: unparsed`);
        } catch (e) {
          failures.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      for (const [id, fields] of result) {
        // 맞는 분야가 없으면 '{}' — null 로 두면 매시간 같은 기사를 다시 부른다.
        const { error: updateError } = await db.from('ai_news').update({ fields }).eq('id', id).is('fields', null);
        if (updateError) failures.push(`${id}: ${updateError.message}`);
        else tagged += 1;
      }
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (failures.length) console.error('world_news_fields_failures', failures.slice(0, 5));
  return Response.json({ candidates: rows.length, tagged, failures: failures.length });
});
