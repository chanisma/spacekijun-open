/**
 * 주식 시세 받기(엣지 invest-quotes) 오프라인 회귀 — 가짜 응답으로 파서·수집과 SQL 규칙을 확인한다.
 * 실행: npx tsx scripts/invest-test/quotes.mts
 * 시세를 쓰는 곳 = isekai3d 게임의 «주식 앱»(RPC isekai3d_stock_*, docs/features/invest-game.md)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collect, isoDay, krxItems, parseFx, parseKrxDay, parseTwelve } from '../../supabase/functions/invest-quotes/index.ts';

let pass = 0, fail = 0;
const check = (name: string, ok: unknown, detail?: unknown) => { if (ok) pass++; else { fail++; console.log('✗', name, detail ?? ''); } };

// ① 공공데이터 하루치 시장 전체 — 실제 응답 모양(items.item 배열, 값은 문자열)
const krx = { response: { body: { items: { item: [
  { basDt: '20261023', srtnCd: '005930', itmsNm: '삼성전자', mkp: '210000', hipr: '216000', lopr: '209000', clpr: '215500', trqu: '12345678' },
  { basDt: '20261023', srtnCd: '000660', itmsNm: 'SK하이닉스', mkp: '0', hipr: '', lopr: '640000', clpr: '650000', trqu: '0' },
  { basDt: '20261023', srtnCd: '123456', itmsNm: '우리 종목 아님', clpr: '1000' },
  { basDt: '2026102', srtnCd: '005930', clpr: '1' },
] } } } };
const codes = { '005930': 'kr:005930', '000660': 'kr:000660' };
const k = parseKrxDay(krx, codes);
check('공공데이터: 우리 종목만 · 날짜 변환', k.length === 2 && k[0].day === '2026-10-23' && k[0].asset_id === 'kr:005930', k);
check('공공데이터: 시가·고가·저가·거래량', k[0].open === 210000 && k[0].high === 216000 && k[0].low === 209000 && k[0].close === 215500 && k[0].volume === 12345678, k[0]);
check('공공데이터: 0·빈 값은 null(거래량 0 은 0)', k[1].open === null && k[1].high === null && k[1].low === 640000 && k[1].volume === 0, k[1]);
check('공공데이터: 한 줄이면 객체로 온다', parseKrxDay({ response: { body: { items: { item: { basDt: '20261023', srtnCd: '069500', clpr: '87075' } } } } }, { '069500': 'etf:069500' }).length === 1);
check('공공데이터: 빈 결과(items 가 빈 문자열) = 휴장', krxItems({ response: { body: { items: '' } } }).length === 0);

// ② 환율 — 쉼표 문자열 · 빈 배열 · result≠1
check('환율: «1,324.6» → 1324.6', parseFx([{ result: 1, cur_unit: 'JPY(100)', deal_bas_r: '900' }, { result: 1, cur_unit: 'USD', deal_bas_r: '1,324.6' }]) === 1324.6);
check('환율: 빈 배열 = null', parseFx([]) === null && parseFx(null) === null);
check('환율: result 4(데이터 코드 오류) = null', parseFx([{ result: 4, cur_unit: 'USD', deal_bas_r: '1,300' }]) === null);

// ③ Twelve Data — 일봉
const tw = parseTwelve({ status: 'ok', values: [{ datetime: '2026-10-23', open: '340', high: '350', low: '339.5', close: '347.73001', volume: '51234567' }] }, 'us:AAPL')[0];
check('Twelve: 일봉', tw?.close === 347.73001 && tw.open === 340 && tw.high === 350 && tw.low === 339.5 && tw.volume === 51234567, tw);
check('Twelve: 거래량 없는 자산(금 현물) = null', parseTwelve({ status: 'ok', values: [{ datetime: '2026-10-23', open: '4000', high: '4020', low: '3990', close: '4015' }] }, 'cm:XAU/USD')[0]?.volume === null);
check('Twelve: 오류 응답(크레딧 초과) = 없음', parseTwelve({ status: 'error', message: 'You have run out of API credits' }, 'us:AAPL').length === 0);
check('isoDay', isoDay('20261023') === '2026-10-23');

// ④ 수집 — 한국은 날짜마다 시장 전체 한 번(주식·ETF) · 키는 URL 에 인코딩된 그대로 · 실패는 기록으로
const urls: string[] = [];
const fake = (async (u: string) => {
  const url = String(u);
  urls.push(url);
  const body = url.includes('getStockPriceInfo_V2') ? (url.includes('basDt=20261024') ? { response: { body: { items: '' } } } : krx)
    : url.includes('getETFPriceInfo_V2') ? { response: { body: { items: { item: [{ basDt: '20261023', srtnCd: '069500', clpr: '87075' }] } } } }
    : url.includes('koreaexim') ? [{ result: 1, cur_unit: 'USD', deal_bas_r: '1,324.6' }]
    : url.includes('symbol=FAIL') ? { status: 'error', message: 'run out of API credits' }
    : { status: 'ok', values: [{ datetime: '2026-10-23', close: '100' }] };
  return new Response(JSON.stringify(body), { status: 200 });
}) as typeof fetch;
const env = (key: string) => ({ DATA_GO_KR_KEY: 'ab%2Bcd%3D%3D', DATA_GO_KR_STOCK_URL: 'https://apis.data.go.kr/1160100/GetStockSecuritiesInfoService_V2', KOREAEXIM_KEY: 'fx', TWELVE_DATA_KEY: 'td' } as Record<string, string>)[key];
const got = await collect({
  kr_days: ['2026-10-23', '2026-10-24'],
  kr_codes: { stock: codes, etf: { '069500': 'etf:069500' } },
  twelve: [{ id: 'us:AAPL', symbol: 'AAPL', since: null }, { id: 'cm:XAU/USD', symbol: 'XAU/USD', since: '2026-10-20' }, { id: 'us:FAIL', symbol: 'FAIL', since: null }],
  fx_since: '2026-10-21', fx_due: true,
}, env, fake, new Date('2026-10-26T08:00:00Z'));
check('수집: 키 그대로(% 두 번 인코딩 없음)', urls.some((u) => u.includes('serviceKey=ab%2Bcd%3D%3D')) && !urls.some((u) => u.includes('%252B')));
check('수집: 날짜마다 주식 V2 한 번 · ETF 한 번', urls.filter((u) => u.includes('/getStockPriceInfo_V2?')).length === 2 && urls.filter((u) => u.includes('getETFPriceInfo_V2?')).length === 2);
check('수집: 시장 전체(basDt · 줄 수 넉넉히)', urls.some((u) => u.includes('numOfRows=4000') && u.includes('basDt=20261023')));
check('수집: 우리 종목만 받는다(주식 2 + ETF 1)', got.quotes.filter((q) => q.day === '2026-10-23' && q.asset_id.startsWith('kr:') || q.asset_id.startsWith('etf:')).length >= 3);
check('수집: 받은 날짜와 그날 시장 줄 수(휴장 = 0)', JSON.stringify(got.days) === JSON.stringify([{ source: 'krx', day: '2026-10-23', rows: 4 }, { source: 'krx', day: '2026-10-24', rows: 0 }]), got.days);
check('수집: 처음 받는 Twelve 종목은 130일', urls.some((u) => u.includes('symbol=AAPL') && u.includes('outputsize=130')) && urls.some((u) => u.includes('symbol=XAU%2FUSD') && u.includes('outputsize=15')));
check('수집: 환율은 평일만 · 오늘까지(10-22·23·26)', urls.filter((u) => u.includes('koreaexim')).map((u) => /searchdate=(\d+)/.exec(u)![1]).join() === '20261022,20261023,20261026');
check('수집: 실패 종목은 기록에 남고 나머지는 받는다', got.logs.find((l) => l.source === 'twelve')?.ok === false && got.quotes.some((q) => q.asset_id === 'us:AAPL'));
check('수집: 키가 없으면 그 출처는 건너뛴다', (await collect({ kr_days: ['2026-10-23'], kr_codes: { stock: codes, etf: {} }, twelve: [], fx_since: null, fx_due: false }, () => undefined, fake)).logs.length === 0);

// ⑤ SQL 규칙(정적) — 운영에서 겪은 것들
const mig = (f: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase/migrations', f), 'utf8');
const STOCK = mig('20261026230000_stock_quotes_for_isekai3d.sql');
check('넣기: 한 묶음 안 같은 (종목, 날)은 첫 줄만(금 현물 중복 — 20261026200000)', STOCK.includes("select distinct on (x->>'asset_id', (x->>'day')::date)") && STOCK.includes("order by x->>'asset_id', (x->>'day')::date, n"));
check('체결 값: 주문 뒤 처음 마감한 종가 · 마감 시각이 지난 것만', STOCK.includes('where asset_id = k.asset_id and close_at > k.after and close_at <= now() order by day limit 1'));
check('체결 값: 달러 자산은 그날 환율이 없으면 미룬다', STOCK.includes("(a.currency = 'USD' and invest_private.fx_on(q.day) is null) then null"));
check('게임 RPC 는 읽기만 · 로그인 필수 · anon 회수', STOCK.includes('perform invest_private.reader();') && STOCK.includes("execute format('revoke all on function %s from public, anon', f);"));
check('한국: 최근 7일의 빈 날은 다시, 그 전은 휴장', STOCK.includes("f.rows > 0 or f.attempted_at > now() - interval '1 hour' or g::date < today.d - 7"));
const UNI = mig('20261026233000_stock_universe_kr200_us100.sql');
check('종목: 한국 200(코스피 150 · 코스닥 40 · ETF 10) + 미국 79 추가', (UNI.match(/\('kr:/g) ?? []).length === 190 && (UNI.match(/\('etf:/g) ?? []).length === 10 && (UNI.match(/\('us:/g) ?? []).length === 79);
check('종목: 레버리지·인버스 ETF 없음', !/레버리지|인버스/.test(UNI.split('\n').filter((l) => l.startsWith('  (')).join('\n')));
const GONE = mig('20261026220000_invest_coin_game_removed.sql');
check('코인 투자 걷어 냄: 기록이 있으면 멈춘다', GONE.includes("raise exception '투자 기록이 있다 — 코인을 돌려준 뒤 지울 것'"));

console.log(`\n주식 시세 받기: ${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);
