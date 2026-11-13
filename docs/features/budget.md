# 예산 관리 (업무 관리 › 예산) — 2026-11-10

설계·결정 = `docs/plans/2026-11-10-budget-management.md` · 스키마 = `docs/database/budget.md` · 코드 = `src/features/budget/`

에듀파인이 «이미 쓴 돈»(예산현액·품의·원인행위)의 정본이고, 이 기능은 «앞으로 쓸 돈»(계획 · 추경 초안 · 품의·업무 연결)을 다룬다.
메뉴 = 업무 관리 서랍 «예산»(`/tasks/budget`, 처음엔 관리자만 — «메뉴 관리»에서 연다). 사업 상세 = `?project=<id>&tab=ops|revision|schedule|history`.

## 숫자 규칙 (단일 출처 `model/budgetMath.ts` — SQL 짝 `mcp_private.bg_*`)
- «쓴 돈» = **원인행위**. 품의 − 원인행위 = 결재 대기(따로 보인다)
- 남은 계획 = 상태가 계획·품의 중인 계획 항목의 합(마감 줄 = 0) · **미배정** = 예산 − 원인행위 − 남은 계획(음수 = 계획 초과)
- 추경 제안 = 원인행위 + 남은 계획(마감 줄 = 원인행위). 남는 돈은 사용자가 고른 줄에 — 줄을 부풀리지 않는다
- 검사: 원인행위 미만 = 확정 불가 · 품의 미만 = 경고 · 목적사업 총액 어긋남 = 경고 · **초안이 건드리지 않은 초과 집행 줄**(카드에서 원인행위 > 예산) = «올려야 함» 안내(막지 않음)
- 회계연도 = 학년도(3.1 ~ 다음 해 2월 말), 1·2월은 전년도

## 화면
- 목록: 사업 카드마다 막대(원인행위 · 남은 계획 · 미배정 · 계획 초과) + 오늘 진도 눈금, 반납 위험·진도보다 늦음·결재 대기 칩. 관리자 = «내 사업 / 전체»
- 상세 › 운영: 산출내역 표(휴대폰 = 카드), 줄을 펼치면 계획 항목(무엇·금액·예정 월·상태 + 품의 품목 잇기). 마감·직접 줄·작년 참고(P5)
- 상세 › 추경: 차수(본예산·카드 반영·추경) · 초안 = 시뮬레이션 · [제안대로 채우기] · 확정(되돌릴 수 없음) · 엑셀 내보내기
- 상세 › 일정: 3월~2월 막대(그 달 계획) + 누적 원인행위(카드 업로드 기록) + 지금+남은 계획 + 진도 기준선 · 1~2월 쏠림·늦음·회계연도 밖 경고
- 상세 › 기록: 카드 업로드 · 확정 차수
- 카드 올리기: `.xls/.xlsx` → `parseBudgetCard`(머리글 글자로 열을 찾고, A열 들여쓰기로 계층) → 사업 고르기·짝 → 차이 미리보기 → `budget_apply_card`

## 연결 (P3)
- 사업 ↔ 업무 = `ontology_link`(종류 `budget_project`, kind related) — 업무 한 장 보기에 «예산»으로 보인다
- 계획 ↔ 품의 품목 = `budget_order_link`. 상태 흐름은 DB 트리거: 이으면 «품의 중», 차수 «구매 완료» → «완료»(되돌리면 «품의 중»), 연결을 다 끊으면 «계획». 구매 신청 화면·표는 바꾸지 않았다(차수 표에 AFTER 트리거 하나)

## MCP (`budget.manage`, 교사 기본 켜짐) — `docs/features/mcp-agent.md`
`list_budgets` · `get_budget` · `apply_budget_card`(에이전트가 엑셀을 읽어 사업 하나의 줄을 보낸다) · `save_budget_plan` · `set_budget_line` · `simulate_budget_revision` · `confirm_budget_revision` · `link_budget_order` · `link_budget_work`. 쓰기는 모두 `check_only` 미리보기 → 확인.

## ⚠️ 조용히 틀리는 자리
- 숫자 규칙이 TS(`budgetMath.ts`) ↔ SQL(`mcp_private.bg_lines`·`bg_check`·`mcp_simulate_budget_revision`) 두 벌 — 한쪽만 바꾸면 웹과 에이전트가 다른 미배정을 말한다. 회귀 `scripts/budget-test/run.mts`(TS) · `scripts/mcp-agent-test/budget-dryrun.sql`(SQL, 같은 실례)
- 카드 줄 짝짓기도 두 벌(`diffCardWithLines` ↔ `mcp_apply_budget_card`: 열쇠 → (비목,이름) → 이름, `normalizeCardName` ↔ `bg_norm`)
- 사업 총액은 저장하지 않는다(줄 합) — 카드의 사업 행은 `budget_card_import.snapshot.card_total` 에 대조용으로만
- `insert … returning` 은 owner 트리거보다 먼저 SELECT 정책을 본다 — `budget_project` SELECT 에 `created_by` 조건을 지우지 말 것

## 회귀
- `npx tsx scripts/budget-test/run.mts` (실제 카드: `BUDGET_CARD=<경로>`) — 파서·짝짓기·숫자·추경·회계연도
- `node scripts/budget-test/run-screenshots.mjs` (개발 서버 8080) — 목록·운영·추경·일정·기록 × 데스크톱·휴대폰, 가로 넘침·콘솔 오류
- DB: `supabase/tests/budget_management.sql` · `budget_links.sql` · `scripts/mcp-agent-test/budget-dryrun.sql`
