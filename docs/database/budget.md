# 예산 관리 (budget_*) — 2026-11-10

설계 = `docs/plans/2026-11-10-budget-management.md` · 기능 = `docs/features/budget.md` · 마이그레이션 `20261110100000_budget_management.sql` · 시험 `supabase/tests/budget_management.sql`

에듀파인이 정본인 숫자(예산현액·품의·원인행위·지출결의·지급)는 **사업관리카드를 올려 읽어 온다**. 이 표들이 정본인 것은 «앞으로의 일» — 계획 항목 · 추경 초안 · 품의 연결.

## 권한 (RLS)
- 보기 = 그 사업의 담당자(`budget_member` owner·editor) + **관리자(읽기만)** · 고치기 = 담당자 · 담당자 더하기/빼기 = owner · 사업 지우기 = owner
- 판정 함수(DEFINER, 정책 안에서 `budget_member` 를 직접 조인하지 않기 위해): `budget_can_view(uuid)` · `budget_can_edit(uuid)` · `budget_is_owner(uuid)` — 사람 = `resource`(교직원 명단), 로그인 ↔ resource = `user_resource`
- ⚠️ `budget_project` SELECT 정책에 `created_by = auth.uid()` 가 있다 — `insert … returning` 은 owner 트리거보다 **먼저** SELECT 정책을 본다(없으면 만들기가 RLS 위반)
- 자식 표는 모두 `project_id` 를 들고 `(id, project_id)` 복합 FK 로 부모에 묶인다 — 다른 사업의 줄에 계획·차수 줄을 붙일 수 없다(FK 거절)

## 표
| 표 | 내용 |
|---|---|
| `budget_project` | 사업(카드 1장 안의 «세부항목»). `fiscal_year`(학년도 = 3.1~2월 말) · `kind` purpose(목적)/total(총액배분)/basic · `group_name`(세부사업) · `card_key`(다시 올릴 때 짝) · `rolled_over_from`(작년 사업) · `archived`. **사업 총액은 저장하지 않는다**(줄 합) |
| `budget_member` | (project_id, resource_id) · role owner/editor. 만든 사람 = owner(트리거 `budget_add_owner`, 명단 미연결이면 만들기 거절) · 마지막 owner 는 못 뺀다(트리거 `budget_guard_member`) |
| `budget_line` | 산출내역. `budget_amount`(지금 예산현액 — 카드 반영·추경 확정이 바꾼다) · `pumui/wonin/jichul/jigeup`(카드 값) · `manual_override`(손으로 고침 — 다음 카드에 덮임) · `origin` card/manual · `missing_from_card` · `closed`(마감) |
| `budget_plan_item` | 계획 항목: `title` · `amount` · `planned_month`(그 달 1일) · `status` planned/in_order/done/cancelled · `task_id`(선택) |
| `budget_revision` | 추경 차수. `seq`(0 = 본예산) · `status` draft/confirmed · `source` manual/card. **초안은 사업마다 하나**(부분 유일 인덱스). 확정 차수는 되돌릴 수 없고 지울 수 없다(트리거 `budget_guard_revision` — 사업 연쇄 삭제는 예외) |
| `budget_revision_line` | 차수별 줄 금액 · `prev_amount`(확정 순간의 직전 금액). **확정 차수의 줄은 잠김**(트리거 `budget_lock_confirmed_line`) — 예외: 카드 반영 RPC 가 같은 트랜잭션에서 만든 확정 차수(`confirmed_at = transaction_timestamp()`) |
| `budget_card_import` | 카드 업로드 이력: `file_name` · `card_date` · `snapshot`(줄별 금액) · `summary` — 일정 탭의 «누적 원인행위» 선 재료 |
| `budget_order_link` | 품의 품목(`purchase_order_lines`) ↔ 예산 줄(+계획 항목). 기존 구매 표는 건드리지 않는다 |

## RPC
- `budget_apply_card(p_project uuid, p_file_name text, p_card jsonb) → jsonb` (INVOKER·VOLATILE) — 짝(line_id)은 화면이 정해 보낸다. 새 줄 추가·기존 줄 갱신(손 고침 해제)·카드에 없는 줄 표시 · 예산현액이 바뀐 줄이 있으면 **확정 차수**(첫 반영 = «본예산 (카드)», 이후 «카드 반영 MM-DD») · 초안이 있으면 초안을 한 칸 뒤로 밀고 그 앞에 넣는다 · 업로드 이력 1건
- `budget_confirm_revision(p_revision uuid) → jsonb` (INVOKER·VOLATILE) — 초안 줄을 예산현액으로(직전 금액 기록) · **원인행위 미만이면 거절** · 총액 일치는 화면 검사(교육청 증액 추경이 있어서 서버는 막지 않는다)

## 되돌리기
마이그레이션 파일 머리 주석.
