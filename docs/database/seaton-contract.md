# seaton 공유 DB 계약 (2026-10-09)

seaton(자습실 좌석 신청, 별도 저장소 `D:\seaton`)과 spacekijun 은 **같은 Supabase 프로젝트**를 쓴다.
두 저장소가 같은 DB 의 마이그레이션 이력에 기록하므로, **공유 계약 SQL 은 spacekijun 저장소 한 곳이 소유한다**
(seaton 의 `CLAUDE.md` 가 이곳을 가리킨다). seaton 고유 표(`study_rooms`·`seat_reservations`·퍼즐·배지·숲…)의
정의 이력은 seaton `supabase/migrations/`(날짜만 쓰는 파일명)에 있다.

## 마이그레이션

| 버전 | 내용 | 상태 |
|---|---|---|
| `20261009100000_seaton_stats_contract` | 통계 계약 — `seaton_private` 규칙 함수 + `seaton_stats_*` 4개 | 적용 |
| `20261009110000_seaton_read_rpcs_and_delete_guard` | 좌석 읽기 RPC 3개(추가만) + 학생 삭제 = 오늘 이후·출석 전 | 적용 |
| `20261009120000_unified_wallet_seaton_cutover` | 통합 지갑 컷오버 — 원장·자동 출석 보상·피드백 가드·옛 포인트 동결·퍼즐 혼합 결제·숲 서버 시각 | 적용 (2026-10-09 01시 · 적용 순간 P 225,124 · 코인 5,281 그대로) |
| `20261009130000_seat_reservations_select_narrow` | `USING true` SELECT 정책 삭제 | 적용 (2026-10-09 02시 — seaton 배포 확인 뒤) |

되돌리기(비상, 이력 밖) = `supabase/rollback/20261009120000_unified_wallet_seaton_cutover_revert.sql`.

## 2026-10-09 기준선 (컷오버 전 실측)

| 항목 | 값 |
|---|---|
| `seat_reservations` | 41,532행 · 학생 325명 · 2025-12-22 ~ 2026-11-17 |
| `point_transactions` | 23,754행 · 281명 · 합 225,124P(출석 22,894건 +228,940 · 퍼즐 −4,407 · 리뷰 +570 · 집중 +21) · 잔액 중앙값 550 · 상위 10% 2,060 · 최대 3,500 |
| 지갑 `academy_user_stats` | 41행(대부분 2025 Kidon 레거시) · 합 5,281 · 최소 20 |
| `academy_study_rewards` | 0행 — 9/7 이후 보상 대상 출석 2,720건 · 144명이 미청구 |
| DB 시간대 | `Asia/Seoul` (그래도 계약 함수는 시각을 명시적으로 KST 로 바꾼다) |
| 학생이 읽는 `seat_reservations` | **41,532행**(본인 80) — `USING true` 정책 때문(`seaton_security.sql` ① 실측) |

## 표

### 코인 경제 설정 (2026-10-21, `20261021100000_coin_economy_admin.sql`)

- **`coin_economy_setting`** — key PK · app(study/academy/tamagotchi/star-tower/isekai3d) · direction(earn/spend/limit) · label · note · unit · value · default_value · min_value · max_value · sort · updated_at · updated_by. CHECK value ∈ [min, max]. RLS: authenticated SELECT 전체(값은 화면에 보인다) · 쓰기 정책 없음 → `admin_coin_economy_set(jsonb)`(관리자 · 범위·정수 · 가챠 환급 ≤ 값) 전용. 서버 읽기 = `economy_private.num(key)`(모르는 키 예외).
- **`coin_economy_setting_log`** — key · old_value · new_value · changed_by · changed_at. 관리자만 읽음.
- **`coin_admin_grant`** — id(= 원장 source_id 의 앞부분) · admin_id · amount(±, 0 제외, 절댓값 ≤ 10000) · note(1~200자) · user_count · moved_total. 관리자만 읽음. 사람별 줄은 `wallet_ledger`(kind `admin_grant`/`admin_revoke`, source_app `admin`, clamp).
- 관리자 RPC(전부 DEFINER · anon·PUBLIC 회수): `admin_coin_wallets()` · `admin_coin_economy_stats()`(2026-10-26 경제 통계) · `admin_coin_history(user, limit)` · `admin_coin_grant(users[], amount, note, notify)` · `admin_academy_shop_items()` · `admin_academy_shop_price_set(item, price)`.
- 이 마이그레이션이 범위로 푼 제약: `academy_study_rewards`·`academy_experience_study_rewards` amount 0~1000 · `academy_chapter_rewards` amount 0~100000 · `academy_workshop_orders` charged_coins·sale_price · `academy_workshop_commissions` amount·sale_price · `academy_shop_items.academy_custom_fixed_price` · `tama_credit_ledger` amount 0~1000. 상세 = `docs/features/coin-economy.md`

### `wallet_ledger` (M3)
| 열 | 형 | 뜻 |
|---|---|---|
| id | bigint identity | |
| user_id | uuid → auth.users | 지갑 주인 |
| delta | int | 실제로 움직인 양(clamp 반영) |
| kind | text CHECK | `seaton_attendance` · `seaton_attendance_reversal` · `seaton_review` · `seaton_focus` · `puzzle_unlock` · `tower_star_sale` · `tama_achievement` · `isekai3d_coin` · `admin_grant` · `admin_revoke` (2026-10-21 기준) |
| source_app | text CHECK | `seaton` · `academy` · `tamagotchi` · `star-tower` · `isekai3d` · `admin` |
| source_id | text | 출처(예약 id`#n` · 세션 id · `이벤트id:조각`) |
| earned_on | date | KST 날짜(하루 상한 셈) |
| balance_after | int | 기록 직후 잔액 |
| note | text | 사람이 읽는 설명 |

`unique(user_id, source_app, kind, source_id)` · RLS 본인 SELECT · 쓰기 권한 없음(`wallet_private.apply` 만).

### `seaton_focus_runs` (M3)
`id · owner · planned_seconds ∈ {1500,3000,5400} · started_at(서버) · ended_at · outcome ∈ {completed, expired, gave_up, replaced} · credit`.
한 사람에 열린 세션 하나(부분 unique). RLS 본인 SELECT, 쓰기는 RPC.

### 바뀐 것
- `academy_user_stats` + `CHECK (coins >= 0)`
- `academy_study_rewards.source` ∈ {`claim`, `auto`} (기본 claim)
- `seat_reservations` 트리거 + `wallet_seaton_attendance`(AFTER I/U OF attendance_status, is_attended) · `seaton_guard_feedback`(BEFORE I/U) · `wallet_seaton_review`(AFTER U OF feedback_rating) / − `trigger_grant_attendance_points` · `trigger_grant_review_points`
- `point_transactions` + `seaton_freeze_legacy_points`(BEFORE INSERT — puzzle_unlock 차감만)
- 정책 `Students can delete own reservations` = 본인 ∧ 날짜 ≥ KST 오늘 ∧ 출석 처리 전 (M2)

## RPC

| 함수 | 누가 | 반환 |
|---|---|---|
| `seaton_stats_summary(start, end, grade?, room?, include_future?)` | 교사·관리자 | 카드·상태·학년·월6·주12·열람실 |
| `seaton_stats_students(…)` | 교사·관리자 | rooms `[id,name,is_morning]` · 학생 행(+wr·att) |
| `seaton_stats_weekday(…)` | 교사·관리자 | 열람실×요일 교차표 · 요일별 신청자 |
| `seaton_stats_temperature(month?, grade?)` | 교사·관리자 | rule · 누적 · 월별 |
| `seaton_seat_occupancy(room, start, end, seat?)` | 로그인 | `seat_number, reservation_date, period_id, is_mine` — 남의 id·이름 없음 |
| `seaton_room_seat_counts(start, end)` | 로그인 | `room_id, unique_seats` |
| `seaton_day_attendance_rows(date)` | 교직원 | `room_id, is_attended, attendance_status` (spacekijun 교사 홈 카드) |
| `seaton_wallet_read()` | 로그인 | coins · legacy_points · review_left · focus_left · recent |
| `academy_study_read(week?, code?)` | 학생·교사·관리자 | (아카데미 소유 — **seaton 학생 대시보드 «이번 주 출석 코인»도 읽는다**, 2026-10-15) week · today · entries[id·day·room·period·start/end·attendance·eligible·claimed] · claimed_coins — 모양을 바꾸면 seaton `utils/studyRewards.ts` 도 |
| `seaton_puzzle_quote(event)` | 로그인 | cost_points · points · coins · pay_points · pay_coins · affordable · free |
| `unlock_puzzle_piece(event, piece)` | 로그인 | (모양 유지) piece_index · remaining_points(=남은 이전 P) · is_puzzle_completed |
| `seaton_focus_start(minutes)` / `seaton_focus_finish(id, give_up?)` | 학생 | run / outcome·credit·coins |
| `award_focus_points(session)` | 로그인 | 항상 0 (옛 클라이언트 호환) |

모든 공개 함수: `security definer` · `set search_path = ''` · `revoke … from public, anon` · 로그인 가드가 첫 줄.
private 스키마(`seaton_private`·`wallet_private`)는 public·anon·authenticated 모두에게 닫혀 있다.

## 상태 (2026-10-09)

- M1·M2 적용 · 이력 기록(`migration repair`).
- M3 = 적용 · 이력 기록. 적용 뒤 운영에서 `seaton_wallet.sql` · `academy_study.sql` · `academy_staff_experience.sql` 재통과. seaton 클라이언트(좌석 RPC·지갑 화면·숲 서버 시각)는 같은 날 준비됐고(type-check·build·vitest 72) **배포 대기** — 배포 전까지 옛 화면은 «포인트»가 멈춘 것으로 보인다(코인은 쌓인다).
- seaton 클라이언트 배포 확인(2026-10-09 02:13 `origin/main` 푸시 · 운영 `kijunseaton.netlify.app` 이 `seaton_wallet_read` 를 호출 · 배포 번들에 `seaton_seat_occupancy` 포함) 뒤 M4 적용. 남은 SELECT 정책 = 학생 본인 · 교사·관리자 전체. 운영에서 `seaton_security.sql`(학생 본인 행만 · 교사 전체 · 직원 표 0행·카드 RPC 동작 · 익명 0행)·`seaton_wallet.sql` 통과.

상세 설계·결정 = `docs/features/unified-wallet.md` · `docs/features/study-room-stats.md`.

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

### seaton 공유 DB 계약 (2026-10-09)

seaton(`D:\seaton`, 자습실 좌석 신청)은 **같은 Supabase DB 를 쓰는 별도 앱**이다. 공유 계약 SQL(통계 · 지갑 · 좌석 RPC)은 **이 저장소가 소유**한다 — 두 저장소가 같은 마이그레이션 이력에 쓰므로 소유자를 하나로 정했다(seaton `CLAUDE.md` 가 이곳을 가리킨다).
- **지갑은 하나 = `academy_user_stats.coins`**(아카데미·다마고찌·seaton · 별까지 쌓기는 별 조각 판매 한 길만 — 2026-10-14). seaton 옛 포인트(`point_transactions`)는 **옮기지 않고 퍼즐 전용으로 동결**, 퍼즐은 P 먼저·모자라면 2P=1코인. 자습실 출석 = **자동 +5 한 번**(아카데미 영수증 표 `academy_study_rewards` 를 같이 써서 수동 청구와 이중 지급 불가) · 피드백 +1(서버 가드 · 하루 1번) · 집중의 숲 +2(서버 시각 · 다마고찌 집중과 하루 2번 공유). seaton 경로의 코인은 전부 `wallet_private.apply` → `wallet_ledger`. 상세 = `docs/features/unified-wallet.md`
- **얻기·쓰기 값은 관리자 설정 (2026-10-21)** = 표 `coin_economy_setting`(키 69개 — 2026-10-21 플래너·요즘 세상·면접 준비·다마고찌 반복 업적 추가) — 서버는 `economy_private.num(키)`(모르는 키 = 예외), 화면은 게임 루트의 `useCoinEconomy()` + 기능별 `economySync.ts` 가 상수를 그 자리에서 갱신. ⚠️ **새 보상·가격을 만들면 숫자를 함수 본문에 적지 말고 시드에 키를 더할 것**(회귀 `scripts/coin-economy-test/run.mts` 가 시드 ↔ 코드 기본값·숫자 되살아남을 검사) · 지급액은 행(영수증)에 적고 회수는 그 값으로 · 가챠 환급 ≤ 값은 서버가 거부. 관리 = Admin «코인 경제»(보유 현황·부여/회수·설정·상점 값·기록). 상세 = `docs/features/coin-economy.md`
- **통계 규칙은 SQL 한 곳**(`seaton_private`) — 출석률 = 출석/(출석+결석), KST 23시 마감, NULL 출석 = 결석. 화면(`src/features/study-room-stats/`)은 상수를 다시 적지 않는다. 상세 = `docs/features/study-room-stats.md`
- **`seat_reservations` SELECT = 학생 본인 · 교사·관리자 전체뿐**(2026-10-09 `USING true` 정책 삭제 — 학생이 전교생 41,532행을 읽고 있었다). 학생 화면이 남의 점유를 봐야 하면 좌석 RPC(`seaton_seat_occupancy`·`seaton_room_seat_counts`)를, 직원 화면은 `seaton_day_attendance_rows` 를 쓴다 — 표를 직접 읽으면 오류 없이 0행이다. 상태·기준선·RPC 표 = `docs/database/seaton-contract.md`

## MCP 에이전트 (2026-11-05)

교사 에이전트가 `studyroom.manage`(`mcp_*` INVOKER RPC, `20261105120000`)로 `study_rooms` 설정과 `seat_reservations` 출석 칸을 웹과 같은 모양으로 쓴다 — 상세 `docs/features/mcp-agent.md` «자습실». ⚠️ seaton 웹이 `study_rooms`·출석 칸의 저장 모양(`booking_windows`·`operating_periods`·`attendance_status` 값)을 바꾸면 이 RPC 도 같이.

### `study_room_reservation_trash` (2026-11-05, `20261105150000`)

MCP `delete_study_room_reservations` 가 지우기 전에 `seat_reservations` 행 전체(`reservation` jsonb)와 학생·열람실·자리·날짜·교시·까닭·지운 사람을 남긴다. RLS = 교사·관리자 SELECT·INSERT(본인 이름으로)·UPDATE(되살림 표시), **DELETE 정책 없음**(보관함은 지우지 않는다). 되살리기 = `mcp_restore_study_room_reservations`(같은 id 로 다시 넣는다 — 자리·학생 칸이 비어 있을 때만). 출석 처리된 행은 지우기 대상이 아니다(코인 트리거가 지우기를 보지 않는다 — 먼저 출석 취소).
