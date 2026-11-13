# 통합 지갑 — 아카데미 · 다마고찌 · seaton (2026-10-09)

> **2026-10-21** — 아래 문서의 모든 금액·하루 횟수는 이제 **기본값**이다. 관리자가 Admin «코인 경제»에서 바꾸며 정본은 표 `coin_economy_setting` — [coin-economy.md](coin-economy.md).

**지갑은 하나 = `public.academy_user_stats.coins`.** 별빛 아카데미와 다마고찌는 이미 이 칸을 함께 썼고(2026-10-07),
2026-10-09 에 seaton(자습실 좌석 신청 앱)의 보상도 이 지갑으로 들어오게 했다.


## ★ 2026-10-13 자습 보상 — 청구 기한 · 하루 상한

사용자 지시: «study rewards는 한 주가 지나면 이전꺼는 못 받도록» · «study-room attendance는 하루 최대 +10».

- **청구 기한(`20261013170000`)** — 아카데미 [받기](`academy_study_claim`)는 **이번 주 · 지난주**만 받는다(어느 주든 «그다음 주가 끝날 때까지»). 화면이 주(월~일) 단위로 청구하므로 «출석일로부터 7일» 대신 주로 끊었다 — 일요일 출석도 최소 7일. 읽기가 `claim_from` 을 준다. **적용 순간 닫힌 밀린 청구 2,641회차(≈13,200코인)** — 남은 청구 가능분 79회차·51명. 출석 처리 때의 자동 지급은 기한과 무관(그날 바로 들어온다).
- **하루 상한(`20261013180000`)** — 영수증(`academy_study_rewards`) **하루 2장 = +10**. 자동 지급(`wallet_private.on_attendance`) · 수동 청구 · 교직원 체험 세 길이 같은 «2 − 이미 받은 수»를 쓴다(같은 날은 예약 id 순서). 출석 취소로 영수증이 지워지면 자리가 다시 난다. 지난 기록(하루 3장 이상)은 회수하지 않았다. 새 잠금은 잡지 않는다(교사 일괄 출석과 교착 — on_attendance 주석) — 한 문장의 일괄 갱신은 행마다 앞 행의 영수증을 보므로 상한이 지켜진다(드라이런: 하루 3회 일괄 출석 → 영수증 2 · +10).
- 화면(`GameStudyLedger`) = `studyClaimable`(studyService.ts)이 서버 규칙 그대로 «받기» 수를 센다 — 기한 지난 주 «받을 수 있는 기한이 지났어요», 셋째 회차 «하루 최대 10코인». 회귀 `npx tsx --tsconfig tsconfig.app.json scripts/study-reward-rule-test/run.mts`(10).
- 학생 하루 최대(반복 보상) = 18 + 자습 10 = **28**(종전 18 + 5×회차, 상한 없음). → **2026-10-14 별까지 쌓기 +10 으로 38**(아래).

## ★ 2026-10-14 별까지 쌓기 — 별 조각 → 코인 (사용자 결정)

사용자 요청 «비공정 교환에 star-tower 재화와 아카데미 재화의 교환». 객관식 결정: **탑 재화 → 코인만**(반대 방향 없음) · **별 조각 1 = 2코인** · **하루 10코인까지** · **비공정 상인이 오는 7층부터**.
- RPC `tower_sell_stars(개수)`(`20261014170000_star_tower_star_coin.sql`) → `wallet_private.apply(…, 'tower_star_sale', 'star-tower', 새 uuid)`. 원장 CHECK 두 개(`kind`·`source_app`)에 값을 더했다
- 하루 상한 = 원장에서 오늘(한국 날짜) `star-tower`·`tower_star_sale` 합. 잠금 = 탑 행(for update) → 지갑 행(apply) — 위 «영역 먼저 → 지갑 마지막»
- **관리자는 팔 수 없다** — 별까지 쌓기의 관리자 재화(9999)는 보여 주기라 팔게 하면 코인이 무에서 생긴다
- 값의 근거: 60분 집중 ≈ 별 조각 1.4 ≈ 2.8코인 — 다마고찌 함께 집중(25분 +2)과 같은 규모. 별 조각은 후반에 남는다(기댓값 66 · 필요 24)
- 드라이런(롤백): 2개 → +4 · 4개 더 → «3개까지» 거절 · 3개 → 오늘 10 · 1개 더 → 거절 · 6층 이하·관리자 거절 · 원장 2줄 합 10

## 사용자 결정 (2026-10-09)

| 질문 | 결정 |
|---|---|
| seaton 기존 포인트(281명 · 225,124P · 중앙값 550) | **코인으로 옮기지 않는다** — 퍼즐 전용 «이전 포인트»로 남기고 새로 쌓지 않는다 |
| 그 이전 포인트로 | 퍼즐 조각을 계속 산다. 모자라면 **2P = 1코인(올림)** 으로 코인에서 낸다 |
| 자습실 출석 보상 | **한 번만, 자동 +5코인** (종전: seaton +10P 와 아카데미 수동 청구 +5 가 따로) |
| 피드백 · 집중 | **서버가 검증할 때만, 작게** — 피드백 +1(출석한 예약 · 7일 안 · 하루 1번), 집중 +2(서버 시각 · 다마고찌와 하루 2번 공유) |
| 아카데미 수동 청구 백로그(9/7 이후 2,720건 · 144명 · 약 13,600코인, 아직 0건 청구) | **그대로 둔다** — 컷오버 이후 출석은 자동, 버튼은 그 전 출석분 |
| 새 지갑 시작값 | **100 유지** — 어느 앱이 지갑을 먼저 만들었느냐로 시작 잔액이 달라지면 불공정하다 |

옮기지 않은 이유(측정): 2:1 로 옮기면 약 11만 코인이 새로 풀려 **현재 코인 총량(41개 지갑 · 5,281)의 21배**가 된다.
상위 10% 학생(1,030코인)은 다마고찌 가챠 전부(약 1,315)에 바로 닿는다. **단위를 맞추는 것과 잔액을 옮기는 것은 다른 결정이다.**

2:1 비율을 고른 이유: seaton 출석 +10P 와 아카데미 자습 +5코인이 **같은 행동에 같은 값**을 매기고 있었다.

## 구조

```
seaton 출석·피드백·집중·퍼즐 ─┐
                               ├─ wallet_private.apply(사용자, 증감, 종류, 출처앱, 출처id, clamp)
                               │    · 지갑 행 잠금(for update) · 원장 한 줄(unique 사용자+앱+종류+출처) · 음수 금지
아카데미·다마고찌 RPC ─────────┘  (이번에는 손대지 않았다 — 각자의 영수증 표에 기록이 있다)
```

- 원장 = `public.wallet_ledger`(본인만 읽음, 쓰기 권한 없음). seaton 에서 들어오고 나가는 코인만 기록한다.
- `academy_user_stats` 에 `CHECK (coins >= 0)` (실측 최솟값 20 · 모든 차감이 이미 조건부라 안전).
- 잠금 순서 = **영역 advisory 잠금 먼저 → 지갑 행 잠금 마지막**. 아카데미(`academy-dorm:`)·다마고찌(`tama-credit:`) 키는 통일하지 않았다 — 잔액 무결성은 행 잠금 + CHECK 가 지키고, advisory 는 하루 상한 같은 영역 규칙만 줄 세운다. 통일하려면 함수 20여 개를 다시 써야 하고 관계없는 기능끼리 직렬화된다.

## 규칙별 구현 (`20261009120000_unified_wallet_seaton_cutover.sql`)

| 행동 | 코인 | 어디서 | 멱등·상한 |
|---|---|---|---|
| 자습실 출석 확인 | +5 | 트리거 `wallet_seaton_attendance` → **아카데미 영수증 표 `academy_study_rewards`(source='auto')** 에 먼저 넣고 성공하면 지급 | 영수증 PK(예약 id) = 수동 청구와 공유 → 이중 지급 구조적으로 불가 |
| 출석 취소(교사) | −5, 0 까지 | 같은 트리거 — 영수증을 지우고 회수(clamp) | 원장 출처 = `예약id#n`(다시 출석하면 다시 지급) |
| 피드백 | +1 | BEFORE 가드 `seaton_guard_feedback` + AFTER `wallet_seaton_review` | 하루 1번(원장 earned_on) |
| 집중의 숲 25/50/90분 | +2 | `seaton_focus_start/finish`(서버 시각, 목표 후 15분 안) | **다마고찌 원장 `tama_credit_ledger(kind='focus')` 에 같이 적어** 하루 2번을 펫 집중과 공유 |
| 퍼즐 조각 | P 먼저, 모자란 만큼 −코인 | `unlock_puzzle_piece`(이름·반환 모양 유지) · 견적 `seaton_puzzle_quote` | 부족하면 아무것도 안 바뀜 |

옛 포인트 동결: P 트리거 2개 삭제 · `award_focus_points` 는 0 · `point_transactions` 에는 `puzzle_unlock` 차감만 들어간다(트리거).
`get_student_points` 는 그대로(이전 P 만 센다).

### 함께 막은 구멍 (조사에서 발견)

- **피드백 무한 적립** — `feedback_rating` 은 학생이 쓸 수 있고 출석 조건은 화면만 검사했다. 예약 만들기 → 별점 → 삭제를 반복하면 +3P·+0.1° 가 무한히 쌓였다. 지금은 가드가 «출석한 예약 · 7일 안 · 삽입 시 금지 · 지우기 금지»를 서버에서 막고, 학생은 지난/출석한 예약을 지울 수 없다(M2).
- **집중 시간 위조** — `focus_forest_sessions.duration_seconds` 를 학생이 넣었다. 코인은 이제 서버가 잰 세션만.
- **잔액 음수** — 출석 취소가 +10P 를 지워 이미 쓴 포인트가 음수가 될 수 있었다. 회수는 clamp, CHECK 가 막는다.

## 컷오버 안전성

| 경로 | 옛 seaton 클라이언트(배포 전) | 이중/미지급 |
|---|---|---|
| 출석 | M3 커밋 전 체크 = +10P(이후 청구 가능) / 후 = +5코인 | 없음 — 트랜잭션 경계 하나 |
| 아카데미 청구 | 자동 지급분은 claimed 로 보이고 빠진다 | 없음 — 영수증 PK |
| 퍼즐 | P 충분 = 정상, 부족 = 옛 화면이 버튼을 막는다 | 덜 열어 주는 쪽으로만 실패 |
| 숲 | `award_focus_points` = 0, 옛 화면은 결과를 무시 | 의도된 미지급 |

되돌리기 = `supabase/rollback/20261009120000_unified_wallet_seaton_cutover_revert.sql`(적용 이력에 넣지 않는다, 드라이런 확인). 지급된 코인은 회수하지 않는다 — `wallet_ledger` 로 추적.

## 조용히 틀리는 자리

1. **출석 판정식이 아카데미와 어긋나면 같은 출석이 한쪽에서만 보상된다** — `wallet_private.is_study_reward` 와 `academy_private.study_rows` 의 식을 정적 회귀가 문자열로 대조한다. 인정(excused)·보완(supplement)은 **보상 대상이 아니다**(아카데미가 처음부터 그랬다 — 통계의 «출석»과 다르다).
2. **출석 트리거에 advisory 잠금을 넣지 말 것** — 아카데미 청구는 «예약 행 잠금 → advisory» 순서라, 트리거가 잠금을 잡으면 교사의 일괄 출석 체크와 교착할 수 있다.
3. **출석 트리거는 실패해도 출석 체크를 막지 않는다**(경고만). 빠진 보상은 아카데미 [인장 찍기] 버튼이 메운다 — 감시 쿼리 «보상 대상인데 영수증이 없는 출석»으로 확인.
4. **미래 날짜에 출석 처리하면 자동 지급하지 않는다**(그날이 와도 트리거가 다시 돌지 않는다) — 청구 버튼이 받는다.
5. **집중 상한을 따로 세지 말 것** — 숲과 펫이 같은 `tama_credit_ledger(kind='focus')` 를 같은 잠금으로 센다. 부작용: 펫의 «평생 집중» 셈에 숲 세션이 들어간다(의도).
6. **seaton 테스트는 claims 에 `email` 을 넣을 것** — `seat_reservations` 정책 일부가 `auth.jwt()->>'email'` 로 본인을 판정해, 빠지면 본인 행이 0건이라 **잘못 통과**한다.

## 운영 감시 쿼리 (0 이어야 정상)

```sql
-- 컷오버 뒤 생긴 퍼즐 외 P
select count(*) from point_transactions where type <> 'puzzle_unlock' and created_at > '2026-10-09';
-- 보상 대상인데 영수증이 없는 출석(트리거 실패) — 컷오버 이후 체크분
select count(*) from seat_reservations r join profiles p on p.id=r.student_id and p.role='student'
 where (r.attendance_status='attended' or (r.attendance_status is null and r.is_attended))
   and r.reservation_date between '2026-10-09' and (now() at time zone 'Asia/Seoul')::date
   and not exists (select 1 from academy_study_rewards a where a.reservation_id=r.id);
-- 음수 지갑 / 하루 리뷰 2건 이상
select count(*) from academy_user_stats where coins < 0;
select count(*) from (select user_id, earned_on from wallet_ledger where kind='seaton_review' group by 1,2 having count(*)>1) x;
```

## 경제 영향 (실측 + 시뮬레이션, 2026-10-09)

2026-09 자습실 이용 학생 140명의 보상 대상 출석 = 하위 25% 12회 · **중앙 20회(+100코인/월)** · 상위 10% 39회(+195) · 최대 53회. 피드백은 상위 10% 도 0건.
`scripts/tamagotchi-test/economy-sim.mts` 에 더해 보면 꾸준한 학생 + 자습실 상위 10% 도 가챠 전부까지 **73일**(10-08 «상한까지 다 하는 학생» 66일보다 느리다) —
출석 보상이 경제를 범람시키지 않는다. 자습실만 하는 학생(중앙)은 아카데미 상점까지 29일. 옮기지 않은 이전 포인트는 퍼즐에서만 쓰여 이 표에 영향이 없다.

## 회귀

- `supabase/tests/seaton_wallet.sql` — 실제 역할로: 출석 자동 +5 · 반복 0 · 회수 clamp · 재출석 · 청구 버튼과 영수증 공유 · 피드백 가드 3종·하루 1번 · 지난 예약 삭제 금지 · 숲·펫 상한 공유 · 퍼즐 P/혼합/코인/부족 · 동결 · 원장·점유 비공개 · 역할.
- `supabase/tests/academy_study.sql` — 고정 자료를 «자동 지급 이전 출석»으로 넣도록 고쳤고, 교직원 체험(2026-09-14) 이후 낡은 단언 «관리자 청구 거부»를 «학생 지갑·영수증 불변»으로 바꿨다(그 단언은 이번 작업 전에도 실패하고 있었다).
- `npx tsx scripts/seaton-wallet-test/run.mts`(55) — 공개 함수 권한 · 판정식 일치 · 보상 숫자 한 곳 · kind 일치 · 옛 클라이언트 호환 · 좌석 RPC 가 신원을 안 돌려줌.

상세 스키마 = `docs/database/seaton-contract.md`.

## ★ 2026-10-19 다마고찌 업적 보상 — 업적마다 한 번

사용자 요청 «업적을 달성하면 코인을 1회에 한하여 받을 수 있도록».
- RPC `tama_achievement_claim(업적 id)`(`20261019202521_tamagotchi_achievement_rewards.sql`) → 서버가 진행도를 **다시 세고**(`tama_private.achievement_progress` — 앨범 전체 + 내 펫 행) 달성이면 `wallet_private.apply(…, 'tama_achievement', 'tamagotchi', 업적 id)`. 원장 `kind` CHECK 에 `tama_achievement` 를 더했다.
- **한 번만 = 원장 유일 키**(user_id, source_app, kind, source_id) — 두 번째 받기는 오류가 아니라 `granted: false · amount 0`(드라이런: 첫 받기 +5 · 둘째 0).
- 보상 합계 = 업적 14개 **495코인**(작은 것 5~10 · 중간 15~20 · 큰 것 40~50 · 사망 도감 전부 150). 반복 보상이 아니라 «하루 최대» 계산에 들어가지 않는다. 목표·보상 = SQL `achievement_rule` ↔ TS `ACHIEVEMENTS` 두 벌(다마고찌 회귀 ㉖ 가 대조).
- 업적 창은 처음엔 관리자에게만 보였다(«기능만 만들고 해금은 하지 않음») → **2026-10-21 학생·교사에게 열었다**(사용자 요청 «다마고치 업적 기능도 열고»). 보상 값은 이제 Admin «코인 경제»의 `tama.achievement.*` 설정이다.

