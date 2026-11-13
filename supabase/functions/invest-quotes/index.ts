// 주식 시세 받기 — 이세계 게임 «주식 앱»의 시세 (2026-10-26 투자 게임으로 시작, 같은 날 isekai3d 로 옮김 · docs/features/invest-game.md)
//
// 방아쇠 = pg_cron(invest-quotes, 10분마다) → invest_private.wake() → net.http_post. 받을 것이 있을 때만 깨운다.
// 무엇을 받을지 = DB invest_fetch_plan()(한 곳) — 여기서 다시 판정하지 않는다.
// 인증 = 게이트웨이 JWT 가 아니라 x-invest-secret(DB 가 만든 비밀, invest_quotes_secret RPC 로 대조) — world-news-fields 와 같은 방식.
// 키 = 엣지 시크릿에만(DATA_GO_KR_KEY 는 «인코딩된» 개인 인증키 그대로 · DATA_GO_KR_STOCK_URL · KOREAEXIM_KEY · TWELVE_DATA_KEY).
//
// ⚠️ 공공데이터 V2 는 작업 이름도 _V2 다(getStockPriceInfo_V2 · getETFPriceInfo_V2) — 이름만 V2 로 바꾸면 «서비스 없음».
// 한국은 «날짜 하나 = 시장 전체» 한 번(basDt) — 종목마다 부르면 200번이 된다. 받은 줄 중 우리 종목만 남긴다.
// ⚠️ Twelve Data 무료 = 분당 8 크레딧 → 한 번에 최대 7 종목(invest_fetch_plan 이 자른다). 남은 종목은 다음 깨움(10분 뒤)에.
// 값이 이상하면(0 이하·숫자 아님) 버린다. 시가·고가·저가·거래량은 없으면 null(금 현물은 거래량이 없다).

export interface Quote { asset_id: string; day: string; open: number | null; high: number | null; low: number | null; close: number; volume: number | null }
export interface FxRow { day: string; usd_krw: number }
export interface Plan {
  kr_days: string[];
  kr_codes: { stock: Record<string, string>; etf: Record<string, string> };
  twelve: { id: string; symbol: string; since: string | null }[];
  fx_since: string | null;
  fx_due: boolean;
}
interface Log { source: string; ok: boolean; rows: number; message?: string }
export interface DayDone { source: 'krx'; day: string; rows: number }

const ETF_URL = 'https://apis.data.go.kr/1160100/GetSecuritiesProductInfoService_V2/getETFPriceInfo_V2';
const FX_URL = 'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON';

/** YYYYMMDD → YYYY-MM-DD */
export const isoDay = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '');
/** 한국 날짜(오늘) */
export const kstToday = (now = new Date()) => new Date(now.getTime() + 9 * 3600_000);

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replaceAll(',', ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const positive = (v: unknown): number | null => { const n = num(v); return n && n > 0 ? n : null; };

/** 공공데이터 응답의 줄들(items.item 이 배열 · 한 줄이면 객체 · 없으면 빈 문자열) */
export function krxItems(json: unknown): Record<string, unknown>[] {
  const items = (json as { response?: { body?: { items?: { item?: unknown } | '' } } })?.response?.body?.items;
  const raw = items && typeof items === 'object' ? (items as { item?: unknown }).item : undefined;
  return (Array.isArray(raw) ? raw : raw ? [raw] : []) as Record<string, unknown>[];
}

/** 공공데이터(주식·ETF) 하루치 시장 전체 → 우리 종목(단축코드 → 종목 id)만 */
export function parseKrxDay(json: unknown, codes: Record<string, string>): Quote[] {
  const out: Quote[] = [];
  for (const it of krxItems(json)) {
    const id = codes[String(it.srtnCd ?? '')];
    if (!id) continue;
    const close = positive(it.clpr);
    const day = String(it.basDt ?? '');
    if (!/^\d{8}$/.test(day) || !close) continue;
    out.push({ asset_id: id, day: isoDay(day), open: positive(it.mkp), high: positive(it.hipr), low: positive(it.lopr), close, volume: num(it.trqu) });
  }
  return out;
}

/** 수출입은행 환율 응답 → 그날 USD 매매기준율(«1,324.6» 쉼표 문자열). 빈 배열(주말·오전 11시 전) = null */
export function parseFx(json: unknown): number | null {
  if (!Array.isArray(json)) return null;
  const usd = json.find((r) => (r as { cur_unit?: string })?.cur_unit === 'USD') as { deal_bas_r?: string; result?: number } | undefined;
  if (!usd || (usd.result !== undefined && usd.result !== 1)) return null;
  const v = Number(String(usd.deal_bas_r ?? '').replaceAll(',', ''));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Twelve Data time_series → 일봉들 */
export function parseTwelve(json: unknown, assetId: string): Quote[] {
  const j = json as { status?: string; values?: { datetime?: string; open?: string; high?: string; low?: string; close?: string; volume?: string }[] };
  if (j?.status !== 'ok' || !Array.isArray(j.values)) return [];
  return j.values.flatMap((v) => {
    const day = String(v.datetime ?? '').slice(0, 10);
    const close = positive(v.close);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && close
      ? [{ asset_id: assetId, day, open: positive(v.open), high: positive(v.high), low: positive(v.low), close, volume: num(v.volume) }] : [];
  });
}

async function getJson(url: string, request: typeof fetch = fetch): Promise<unknown> {
  const res = await request(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 160)}`);
  return JSON.parse(text);
}

const krxUrl = (base: string, key: string, day: string, rows: number) =>
  // 키는 이미 인코딩된 값이라 그대로 붙인다(URLSearchParams 로 넣으면 % 가 두 번 인코딩된다)
  `${base}?serviceKey=${key}&resultType=json&numOfRows=${rows}&pageNo=1&basDt=${day.replaceAll('-', '')}`;

export async function collect(plan: Plan, env: (k: string) => string | undefined, request: typeof fetch = fetch, now = new Date()) {
  const quotes: Quote[] = [];
  const fx: FxRow[] = [];
  const logs: Log[] = [];
  const touched: string[] = [];
  const days: DayDone[] = [];
  const today = kstToday(now);

  // ① 한국 주식·ETF — 날짜마다 시장 전체 한 번씩(주식 · ETF). 그날 줄이 0개면 휴장(또는 아직 안 올라옴)
  const krKey = env('DATA_GO_KR_KEY');
  const stockUrl = env('DATA_GO_KR_STOCK_URL');
  if (plan.kr_days.length && krKey && stockUrl) {
    let rows = 0; const errors: string[] = [];
    const hasEtf = Object.keys(plan.kr_codes.etf).length > 0;
    for (const day of plan.kr_days) {
      try {
        const stock = await getJson(krxUrl(`${stockUrl.replace(/\/$/, '')}/getStockPriceInfo_V2`, krKey, day, 4000), request);
        const etf = hasEtf ? await getJson(krxUrl(ETF_URL, krKey, day, 2000), request) : null;
        const got = [...parseKrxDay(stock, plan.kr_codes.stock), ...(etf ? parseKrxDay(etf, plan.kr_codes.etf) : [])];
        quotes.push(...got); rows += got.length;
        days.push({ source: 'krx', day, rows: krxItems(stock).length });
      } catch (e) { errors.push(`${day}: ${(e as Error).message}`); }
    }
    logs.push({ source: 'krx', ok: errors.length === 0, rows, message: errors.slice(0, 3).join(' | ') || undefined });
  }

  // ② 환율 — 받은 날 다음부터 오늘까지 평일만(처음이면 180일, 한 번에 최대 25일)
  const fxKey = env('KOREAEXIM_KEY');
  if (plan.fx_due && fxKey) {
    let rows = 0; const errors: string[] = [];
    const start = plan.fx_since ? new Date(Date.parse(plan.fx_since) + 86400_000) : new Date(today.getTime() - 180 * 86400_000);
    const list: Date[] = [];
    for (let d = start; d <= today && list.length < 25; d = new Date(d.getTime() + 86400_000)) {
      const w = d.getUTCDay();
      if (w !== 0 && w !== 6) list.push(d);
    }
    // 오늘 값이 아직 없을 수 있어 오늘은 늘 다시 본다
    if (!list.some((d) => ymd(d) === ymd(today)) && today.getUTCDay() % 6 !== 0) list.push(today);
    for (const d of list) {
      try {
        const v = parseFx(await getJson(`${FX_URL}?authkey=${fxKey}&searchdate=${ymd(d)}&data=AP01`, request));
        if (v) { fx.push({ day: isoDay(ymd(d)), usd_krw: v }); rows++; }
      } catch (e) { errors.push(`${ymd(d)}: ${(e as Error).message}`); }
    }
    logs.push({ source: 'fx', ok: errors.length === 0, rows, message: errors.slice(0, 3).join(' | ') || undefined });
  }

  // ③ Twelve Data — 계획이 이미 7개로 잘라 준다. 처음 받는 종목은 130일(이동평균·MACD 를 그릴 만큼)
  const tdKey = env('TWELVE_DATA_KEY');
  if (plan.twelve.length && tdKey) {
    let rows = 0; const errors: string[] = [];
    for (const a of plan.twelve) {
      const size = a.since ? 15 : 130;
      try {
        const got = parseTwelve(await getJson(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(a.symbol)}&interval=1day&outputsize=${size}&apikey=${tdKey}`, request), a.id);
        quotes.push(...got); rows += got.length; touched.push(a.id);
        if (!got.length) errors.push(`${a.id}: 값 없음`);
      } catch (e) { errors.push(`${a.id}: ${(e as Error).message}`); }
    }
    logs.push({ source: 'twelve', ok: errors.length === 0, rows, message: errors.slice(0, 3).join(' | ') || undefined });
  }
  return { quotes, fx, logs, touched, days };
}

/** 종목 고르기용 — 가장 최근 거래일의 시장 전체를 시가총액 순으로(관리자가 SQL 로 목록을 정할 때 한 번) */
export async function krUniverse(env: (k: string) => string | undefined, request: typeof fetch = fetch, now = new Date()) {
  const krKey = env('DATA_GO_KR_KEY');
  const stockUrl = env('DATA_GO_KR_STOCK_URL');
  if (!krKey || !stockUrl) throw new Error('한국 시세 키가 없어요');
  const pick = (json: unknown, limit: number) => krxItems(json)
    .map((it) => ({ code: String(it.srtnCd ?? ''), name: String(it.itmsNm ?? ''), market: String(it.mrktCtg ?? ''), cap: num(it.mrktTotAmt) ?? 0 }))
    .sort((a, b) => b.cap - a.cap).slice(0, limit);
  for (let back = 1; back <= 10; back++) {
    const day = new Date(kstToday(now).getTime() - back * 86400_000).toISOString().slice(0, 10);
    const stock = await getJson(krxUrl(`${stockUrl.replace(/\/$/, '')}/getStockPriceInfo_V2`, krKey, day, 4000), request);
    if (!krxItems(stock).length) continue;
    const etf = await getJson(krxUrl(ETF_URL, krKey, day, 2000), request);
    return { day, stocks: pick(stock, 400), etfs: pick(etf, 60) };
  }
  throw new Error('최근 열흘 안에 거래일이 없어요');
}

if (import.meta.main) {
  // 원격 모듈은 서버에서만 — 오프라인 회귀(Node)가 파서·수집만 불러올 수 있게
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  Deno.serve(async (req) => {
    const supplied = req.headers.get('x-invest-secret');
    const { data: secret, error: secretError } = await db.rpc('invest_quotes_secret');
    if (secretError || !supplied || supplied !== secret) return new Response('Unauthorized', { status: 401 });
    const body = await req.json().catch(() => ({})) as { action?: string };
    if (body.action === 'kr_universe') {
      try { return new Response(JSON.stringify(await krUniverse((k) => Deno.env.get(k))), { headers: { 'Content-Type': 'application/json' } }); }
      catch (e) { return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 }); }
    }
    const { data: plan, error: planError } = await db.rpc('invest_fetch_plan');
    if (planError || !plan) return new Response(JSON.stringify({ error: planError?.message ?? 'no plan' }), { status: 500 });
    const got = await collect(plan as Plan, (k) => Deno.env.get(k));
    const { data, error } = await db.rpc('invest_ingest', { p_quotes: got.quotes, p_fx: got.fx, p_touched: got.touched, p_logs: got.logs, p_days: got.days });
    if (error) return new Response(JSON.stringify({ error: error.message, logs: got.logs }), { status: 500 });
    return new Response(JSON.stringify({ ...data, logs: got.logs }), { headers: { 'Content-Type': 'application/json' } });
  });
}
