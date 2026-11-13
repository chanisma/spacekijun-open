# 주식 시세 — 이세계 «주식 앱»의 서버 쪽 (2026-10-26)

**투자는 isekai3d 게임 안 휴대폰 «주식 앱»에서 게임 돈(§)으로 한다.** 이 저장소는 실제 시세를 받아 두고 읽기 RPC 만 준다.
경위: 같은 날 `/invest`(통합 지갑 코인으로 투자·한 달 순위)로 만들었다가 사용자 결정 «이 기능을 여기에 두지 말고 isekai3d 로 이전 — 코인 투자·순위는 삭제»로 옮겼다(`20261026220000` — 계좌·보유·주문·스냅샷·코인 RPC·설정 `invest.*`·메뉴·관리 탭을 걷어 냄, 지울 때 기록 0건). 처음 기획 = `docs/plans/2026-10-26-invest-game.md`(코인판, 역사 기록).
게임 쪽 설계(보유·주문·수수료·차트) = isekai3d 저장소 `docs/ref-game/17-stocks.md`. 다리 = NEIS_helper `app/core/isekai3d_server.py` 의 `stocks/*`.

## 사용자 결정
현실 시장 그대로(게임 날짜와 무관, 주문은 현실의 다음 종가로 체결) · §1 = 1,000원 · 한국 200 + 미국 100 · 종목 상세·차트(캔들·거래량·이동평균·RSI·MACD + 지표 설명)·관심종목·수수료·세금·환전 · 순위 없음.

## 종목 — `invest_asset`(306: 한국 200 · 미국 100 · 금·원유·은·구리·미국 장기채 · 달러)
- 한국 = 공공데이터 2026-10-23 시장 전체를 **시가총액 순**으로 코스피 150 · 코스닥 40 · ETF 10(`20261026233000`). 우선주·스팩, 레버리지·인버스·합성 ETF 는 뺐다. 업종 칸은 «코스피/코스닥/ETF»(처음 22종목만 손으로 쓴 업종·설명).
- 다시 고르기 = 엣지에 `{"action":"kr_universe"}`(비밀 헤더)를 보내면 최근 거래일 시장 전체를 시가총액 순으로 준다(주식 400 · ETF 60) → 새 마이그레이션에 목록을 적는다. ⚠️ 종목을 더하면 `delete from invest_fetch_day` 로 180일을 다시 받게 할 것.
- 미국 = 처음 21 + 대표 기업·지수 79(손으로 쓴 업종·설명). 금 = `XAU/USD`, **원유 = `USO`**(WTI 직접 심볼 없음 — `WTI` 는 W&T Offshore 주식), 달러 = `cm:USD`(source `fx`, 환율이 있는 날마다 종가 1).

## 일봉 — `invest_quote`(종목·날짜: 시가·고가·저가·종가·거래량 + `close_at`)
`close_at` = 한국 15:30 KST · 미국/원자재 16:00 뉴욕 · 달러 11:00 KST. 시가 등은 없으면 null(금 현물은 거래량이 없다). 0 은 null 로.
용량: 306종목 × 250일 ≈ 연 7.6만 줄(지금 DB 1.5GB 의 1% 남짓).

## 받기 — 엣지 `invest-quotes`
pg_cron `invest-quotes`(10분) → `invest_private.wake()` → «받을 것이 있을 때만» pg_net(인증 `x-invest-secret`, DB 비밀 대조, `verify_jwt = false`).
무엇을 받을지 = `invest_fetch_plan()` 한 곳:
- **한국 = 날짜 하나에 시장 전체 한 번**(주식 `basDt` · `numOfRows=4000` ≈ 2,870줄 + ETF) → 우리 종목만 남긴다. 받은 날 = `invest_fetch_day`(rows = 그날 시장 줄 수). 최근 180일 중 못 받은 평일을 최신부터 **한 번에 6일** — 최근 7일의 빈 날(아직 안 올라옴)은 한 시간마다 다시, 그 전의 빈 날은 휴장으로 본다. ⚠️ **공공데이터는 하루 늦게** 올라온다(10/26 종가 = 10/27 오후).
- Twelve = 12시간 지난 종목 **7개까지**(무료 분당 8 크레딧 · 하루 800 — 105종목 × 하루 2번 ≈ 210). 처음 받는 종목은 130일.
- 환율 = 3시간 안에 성공 기록이 없으면(수출입은행 `deal_bas_r` 쉼표 문자열, 주말·오전 11시 전 빈 배열).
받은 값 → `invest_ingest(p_quotes, p_fx, p_touched, p_logs, p_days)`(service_role). ⚠️ 한 묶음 안의 같은 (종목, 날)은 받은 순서의 첫 줄만(`20261026200000` — 금 `XAU/USD` 가 같은 날 봉을 두 번 줘 `ON CONFLICT` 가 묶음 전체를 거부, 10분마다 같은 실패를 되풀이해 실물 5종이 0건이던 원인). 걸러 낸 줄 수는 `invest_fetch_log.message` 에.

| 출처 | 주소 · 주의 |
|---|---|
| 한국 주식 | `…/1160100/GetStockSecuritiesInfoService_V2/getStockPriceInfo_V2` — ⚠️ **작업 이름도 `_V2`**(`getStockPriceInfo` = «서비스 없음», 옛 `/service/…` = «등록되지 않은 키»). 키는 **인코딩된 값 그대로**(두 번 인코딩 금지). 종목은 **단축코드**(이름은 바뀐다 — 엔씨소프트 → «NC») |
| 한국 ETF | `…/1160100/GetSecuritiesProductInfoService_V2/getETFPriceInfo_V2`(같은 개인 키, 별도 활용신청 — 주식 API 에는 ETF 가 없다) |
| 환율 | `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?data=AP01` |
| 미국·원자재 | Twelve Data `time_series`(open·high·low·close·volume) |
시크릿: `DATA_GO_KR_KEY` · `DATA_GO_KR_STOCK_URL` · `KOREAEXIM_KEY` · `TWELVE_DATA_KEY`(엣지 시크릿에만).

## 게임용 읽기 RPC (authenticated — 로그인한 사람이면 누구나, 쓰기 없음 · 학생 데스크 다리가 학생 세션으로 부른다)
| RPC | 다리 | 내용 |
|---|---|---|
| `isekai3d_stock_market()` | `stocks/market` | `as_of`(서버 시각) · 최근 환율 · 종목마다 가장 최근 일봉 + 그 전날 종가 |
| `isekai3d_stock_history(p_asset, p_days)` | `stocks/history` | 일봉(오래된 것부터, 5~400일) · 달러 자산은 그날 환율 |
| `isekai3d_stock_closes(p_asks)` | `stocks/closes` | 주문 `[{key, asset_id, after}]`(최대 100)마다 **주문 뒤 처음 마감한 종가** — `close_at > after and close_at <= now()`(24시간 시장의 진행 중인 봉 제외, `20261026210000` 과 같은 규칙) · 달러 자산은 그날 환율이 없으면 `fill: null`(옛 값으로 체결하지 않는다) |
체결 판정을 서버 한 곳에 둔 까닭: 게임 저장은 학생 PC 에 있어 체결 규칙이 게임마다 갈라지면 안 된다(돈은 게임 돈이라 속임 걱정은 없다).

## 회귀
`npx tsx scripts/invest-test/quotes.mts`(29 — 파서·수집(가짜 응답) · SQL 규칙 정적 검사: 중복 걸러 내기 · 마감 뒤 체결 · 환율 없으면 미룸 · 종목 수 · 레버리지 없음).
운영 확인(2026-10-26): 한 번 깨움에 한국 5일 × 200 = 1,000줄(날마다 시장 2,866~2,870줄 중) + Twelve 7종목 × 130일.
