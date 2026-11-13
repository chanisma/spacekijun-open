# 코인 얻는 법 (`/coins`, 2026-10-27)

통합 지갑(`academy_user_stats.coins`)에 코인이 들어오고 나가는 길을 세계(게임)별 카드로 한 화면에 모은 안내.
학생 네비 [오늘] 별까지 쌓기 아래 · 교사 [학생 메뉴] — 라우트 = 학생·교사·관리자(직원 닫힘, `routeAccess`).

## 구조
- 껍데기 `src/features/coin-guide/CoinGuidePage.tsx` — 지갑(본인 행 RLS) · 코인 경제 설정(`useCoinEconomy`) · 메뉴(`useNavSections`)를 읽는다.
- 본문 `CoinGuideView.tsx` — 세션 없이 그려진다(하네스 `scripts/coin-guide-test/index.html`).
- 판정·문구 `model/coinGuide.ts` — **숫자는 전부 `coin_economy_setting`** 에서. 키가 없으면 그 줄을 감춘다.
- 옷 `coin-guide.css` — 카드마다 그 게임의 실제 팔레트(아카데미 양피지 아치 · 다마고찌 LCD + 갈무리 · 별까지 쌓기 놋쇠 테 밤바다 · 요즘 세상 신문 · 이세계 사회인 하늘 + 플럼밥). 카드는 «게임 창»이라 앱 테마를 따르지 않는다.

## 조용히 틀리는 자리
- ⚠️ **코인을 주는 설정 키가 새로 생기면 `COVERED_EARN_KEYS`(또는 접두어)에 넣고 세계 카드에 줄을 더할 것** — 회귀가 마이그레이션의 earn 키 전부를 대조한다(빠뜨리면 학생이 모르는 보상).
- 집중의 숲은 다마고찌 «함께 집중»과 하루 횟수를 함께 쓴다 — 하루 합계에는 다마고찌 쪽에서만 센다.
- 메뉴가 꺼진 세계는 카드를 뺀다. 자습실(별도 앱 seaton)·이세계 사회인(학생판 데스크톱)은 메뉴와 무관하게 남긴다.
- 지갑 «오늘 받은 코인»은 그리지 않는다 — 다마고찌 하루 보상 등은 `wallet_ledger` 를 거치지 않아 합계가 조용히 모자란다.

## 회귀
- `npx tsx scripts/coin-guide-test/run.mts` (정적·모델 15)
- `node scripts/coin-guide-test/run-browser.mjs` (개발 서버 필요 — 데스크톱·휴대폰·다크·메뉴 닫힘 스크린샷, 가로 넘침·44px)
