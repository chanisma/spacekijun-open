// 창가의 하늘 — 별(목표·계획) 제목의 임베딩을 한 번에 돌려준다.
//
// 왜 따로 두는가: `generate-embedding` 은 글 하나에 한 번 호출이라 별 200개면 200번이다.
// OpenAI 임베딩은 입력을 배열로 받으므로 한 번에 보내고, `dimensions: 256` 으로 줄여
// 브라우저 캐시(localStorage)에 넉넉히 들어가게 한다(유사도 판정에는 256 이 충분하다 — 짧은
// 제목의 뜻을 가르는 일이지 검색 색인이 아니다). 학생 사실을 만들지 않는다 — 돌려주는 것은
// 숫자 벡터뿐이고 저장도 하지 않는다. 캐시는 호출한 브라우저가 글 해시로 갖는다.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MAX_ITEMS = 300;
const MAX_TEXT = 300;
const DIMENSIONS = 256;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    // 로그인한 사용자만 — 게이트웨이 JWT 검사와 별개로 여기서 한 번 더 확인한다(3값 논리 구멍 방지).
    const authorization = req.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => null) as { texts?: unknown } | null;
    const items = Array.isArray(body?.texts) ? body!.texts as unknown[] : null;
    if (!items || items.length === 0 || items.length > MAX_ITEMS) return json({ error: `texts must be 1..${MAX_ITEMS} items` }, 400);
    const cleaned: { key: string; text: string }[] = [];
    for (const item of items) {
      const key = typeof (item as { key?: unknown })?.key === 'string' ? (item as { key: string }).key : '';
      const text = typeof (item as { text?: unknown })?.text === 'string' ? (item as { text: string }).text.trim().slice(0, MAX_TEXT) : '';
      if (!key || !text) return json({ error: 'each item needs key and text' }, 400);
      cleaned.push({ key, text });
    }
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ error: 'OPENAI_API_KEY is not configured' }, 500);
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', dimensions: DIMENSIONS, input: cleaned.map(c => c.text) }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('OpenAI embeddings error', response.status, detail.slice(0, 300));
      return json({ error: `embedding provider error ${response.status}` }, 502);
    }
    const data = await response.json() as { data: { index: number; embedding: number[] }[] };
    const vectors: Record<string, number[]> = {};
    for (const row of data.data) {
      const item = cleaned[row.index];
      if (item) vectors[item.key] = row.embedding.map(v => Math.round(v * 1e5) / 1e5);
    }
    return json({ vectors, dimensions: DIMENSIONS });
  } catch (error) {
    console.error('academy-sky-embed failed', error);
    return json({ error: error instanceof Error ? error.message : 'unknown error' }, 500);
  }
});
