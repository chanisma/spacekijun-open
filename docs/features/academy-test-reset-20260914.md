# 테스트 기록 초기화 (2026-09-14)

사용자 요청으로 학생 코드 `00-00449`(한서윤, `daa07943-…`) 계정의 **별빛 탐구 아카데미
기록 전체**를 초기화했다. 2026-09-13 초기화([`academy-test-reset-20260913.md`](academy-test-reset-20260913.md))
이후 다시 진행한 테스트분이다. 원래 이 계정에는 아카데미 데이터가 없었다.

## 삭제 결과 — 16건 / 9개 표

| 표 | 건수 | 내용 |
|---|---|---|
| `academy_chapter_rewards` | 4 | 장(章) 보상 |
| `academy_chapters` | 4 | first_star · library_questions · dorm_first_plan · post_first_letter |
| `academy_tasks` | 2 | `TEST` · `test` |
| `academy_game_progress` | 1 | quest_step=`read` |
| `academy_journeys` | 1 | 연속 의뢰(design 미연결) |
| `academy_planning_rewards` | 1 | |
| `academy_prologues` | 1 | |
| `academy_user_goals` | 1 | `test` |
| `academy_user_stats` | 1 | coins=305 · level=1 |

24개 아카데미 표 전부에 대해 삭제를 시도했고(나머지 15개는 원래 0건), **삭제 후 24개 표에서
이 계정 행 0건**을 확인했다. 하나의 트랜잭션에서 자식 → 부모 순서로 지웠다
(chapters → tasks/goals, task_feedback → tasks, commissions → orders → shop_items).

## 2차 — 탐구 설계 · 요즘 세상 (같은 날 추가 요청)

아카데미 삭제 후 남은 것을 보고하자 사용자가 **탐구 설계·요즘 세상도 테스트분**이라고
확인해 이어서 지웠다. **13건 / 6개 표**.

| 표 | 건수 | 비고 |
|---|---|---|
| `student_inquiry_designs` | 3 | 9/13 14:56 · 9/13 20:55 · 9/14 01:07 |
| `student_inquiry_design_entities` | 2 | ON DELETE CASCADE |
| `student_inquiry_design_relations` | 3 | ON DELETE CASCADE |
| `student_inquiry_design_sources` | 2 | ON DELETE CASCADE |
| `inquiry_design_llm_cache` | 3 | 설계 3건의 생성 시각과 정확히 일치 |
| `world_news_inquiries` | 2 | 9/12 08:54 · 9/14 00:56 |

삭제 전 **설계를 참조하는 행 0건**을 확인했다(아카데미 chapters·journeys 의 `design_id` 는
`ON DELETE NO ACTION` 이라 1차 삭제가 먼저 끝나 있어야 했다 — 순서가 반대였다면 FK 위반).

### ⚠️ 함께 지우지 않은 것

| 표 | 건수 | 왜 남겼나 |
|---|---|---|
| `student_inquiry_recommendations` | 1 | **2026-05-15** 생성 · `prepared_by` = 관리자 계정 · 모델 `gpt-4o`. 테스트 기간(9/13~14)보다 **4개월 앞선 실제 실행분**이라 테스트 데이터로 보기 어렵다. 지우려면 별도 확인이 필요하다 |
| `inquiry_activity` | 42 | 이름이 `inquiry_` 로 시작하지만 **탐구 설계 데이터가 아니다** — 창체 GraphRAG 파이프라인이 생기부에서 뽑은 분절이고, evalog 역량분석·활동 타임라인이 이걸 읽는다 |
| `student_kg_entities` | 798 | 학생 지식그래프(KG 추출 파이프라인 산출물) |
| `student_detailed_activities` | 31 | 생기부 원본 |
| 학생 계정 (`resource`/`profiles`) | 1 / 1 | |

**`inquiry_` 접두는 소유 기능을 뜻하지 않는다** — `inquiry_activity`·`inquiry_concept`·
`inquiry_theme` 계열은 창체 GraphRAG 산출물이고, 탐구 설계 기능이 쓰는 것은
`student_inquiry_*` 와 `inquiry_design_llm_cache` 다. 이름만 보고 지우면 파이프라인
산출물이 날아간다.

## 1차에서 지우지 않은 것 — 아카데미가 **소유하지 않는** 데이터

(아래는 1차 시점의 판단이다. `student_inquiry_designs`·`world_news_inquiries` 는 위 2차에서
사용자 확인 후 삭제했다.)

| 표 | 건수 | 판단 근거 |
|---|---|---|
| `student_inquiry_designs` | 3 | 탐구 설계 기능의 데이터. **아카데미는 만들지 않는다** |
| `world_news_inquiries` | 2 | 요즘 세상(world-today) 기능 소유. 아카데미는 읽기만 한다 |
| `student_detailed_activities` | 31 | 생기부 원본 |
| 학생 계정 (`resource`/`profiles`) | 1 / 1 | |

**`academy_journey_transition` 의 소스를 직접 확인했다** — 이 RPC 가 유일하게
`student_inquiry_designs` 를 건드리는 아카데미 함수인데, `insert` 가 **없다**.
`select … for update` 로 읽고, `complete` 단계에서만 `reflection` 한 칸을 채운다.
즉 아카데미는 학생이 탐구 설계 화면에서 만든 설계에 **연결**할 뿐 생성하지 않는다.
이 계정의 설계 3건 중 `reflection` 이 채워진 것은 **0건**이고 `academy_journeys.design_id`
도 null 이었으므로, 아카데미가 남긴 흔적은 설계 쪽에 전혀 없다.
(2026-09-13 초기화도 같은 이유로 탐구 설계를 보존했다.)

⚠️ 설계 3건과 뉴스 탐구 2건은 **같은 테스트 기간(9/13~9/14)에 만들어졌다**. 아카데미 범위가
아니라 남겼을 뿐이므로, 지우려면 별도 요청이 필요하다.

## 영향 범위 확인

- 다른 학생 데이터 영향 없음 — 삭제 전 교차 참조 조회에서 **타인의 chapters/tasks/feedback 이
  이 학생의 goal·task 를 참조하는 경우 0건**. 삭제 후 `academy_user_stats` 36행 ·
  `academy_chapters` 1행(타 계정)이 그대로 남아 있다.
- 학생 계정·역할·상태(`active`) 변경 없음.
- 재접속하면 프롤로그/튜토리얼부터 다시 진행한다.

단발성 데이터 정리이며 마이그레이션에 포함하지 않는다(스키마 변경 없음).
