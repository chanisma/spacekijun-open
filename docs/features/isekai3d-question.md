# 이세계 3D 질문 시스템 (2026-10-19)

스페이스기전 학생(데스크톱, `D:/NEIS_helper`) 독의 게임 **이세계 3D**(저장소 isekai3d)가 학생 계정에 «플레이어 지식»을 두고, AI가 그 지식으로 만든 질문을 받는다. 게임 쪽 설계: isekai3d `docs/ref-game/08-knowledge.md` §6.

## 사용자 결정

| 항목 | 결정 |
|---|---|
| 질문 | `career` 근무 중 질문 카드(2지선다) · `life` 인생의 큰 사건 성찰(첫 직장·아이 탄생·부모님을 떠나보냄·은퇴) · `explore` 진로 탐색 질문. 성찰·진로는 보기 3–4개 + 직접 쓰기(300자) + 건너뛰기 |
| 양 | 한 번에 3개를 만들어 두고 다 쓰면 또 만든다. **받는 것은 세 종류 합쳐 하루(한국 시간) 1개** |
| 열람 | 학생 본인 + **그 학생의 담임**(태그 `N학년 N반`) + **그 학년 부장**(태그 `N학년 부장`) + **관리자**(2026-10-22 사용자 결정으로 추가 — 처음엔 일부러 뺐다, 아래 «관리자 열람») |
| AI에 보내지 않는 것 | 학생 이름·학번·이메일, 학생이 직접 쓴 글. 심 이름은 게임이 `{n}`으로 바꿔 보낸다 |

## 흐름

```
게임(127.0.0.1:42110) ─POST /api/isekai3d/<일>→ 스페이스기전 학생 로컬 서버(app/core/isekai3d_server.py)
   └ 학생 세션 헤더를 붙여 정해진 RPC·함수로만 전달 (Origin 확인, JSON 만, CORS 없음, 토큰은 게임에 안 줌)
        ├ RPC isekai3d_*            (security definer, auth.uid() 본인)
        └ 엣지 함수 isekai3d-question (Solar pro4, 생성 전용)
```

## DB (`20261019213117_isekai3d_questions.sql`)

| 이름 | 내용 |
|---|---|
| `isekai3d_player` | 학생 1줄: 지식 JSON(게임 `knowledge.ts`, 64KB 이하) · `version`(낙관적 잠금) · `memory_enabled`(끄면 지식 비움) |
| `isekai3d_questions` | **모든 질문을 지우지 않고 남긴다**(2026-10-19 사용자 결정, `20261019224510`). 나눔 칸 = `kind`(career 근무 카드 · life 인생 사건 · explore 진로) · `career_id` · `career_level` · `life_event`(맥락 키 `career:<직업>:<단계>`·`life:<사건>`·`explore` 에서 저절로 채우는 생성 칸, 색인 있음) · 카드 JSON · 묶음 · 만든/받은/답한 때 · 고른 번호 · 쓴 글 · `model`(만든 AI) · `prompt_context`(AI 에 보낸 맥락 그대로). 30일 지난 안 받은 질문은 지우지 않고 내주지만 않는다. 계정이 지워질 때만 함께 지워진다 |
| 본인 RPC | `isekai3d_status(context_key)`(동의·기억·오늘 받았는지·대기 수) · `isekai3d_knowledge_get` · `isekai3d_knowledge_save(version, knowledge)`(충돌이면 서버 것을 돌려줌 → 게임이 합침) · `isekai3d_memory_set` · `isekai3d_question_take(context_key)`(오늘 받은 것이 없을 때만, 사람마다 advisory lock) · `isekai3d_question_answer(id, choice, text)` |
| 교사 RPC | `isekai3d_my_students()`(볼 수 있는 학생 중 기록이 있는 학생) · `isekai3d_student_overview(student)`(지식·답 100개) — `isekai3d_can_view` = 태그 담임·학년부장 |
| 함수 전용 | `isekai3d_questions_add(user, kind, key, cards)` — service_role 만. 그 맥락에 안 받은 질문이 있으면 넣지 않음, **하루 3묶음** 상한 |
| 권한 | 표는 `revoke all` (직접 접근 없음), 학생·교사 RPC 는 authenticated 만(anon·PUBLIC 회수) |

## 엣지 함수 `isekai3d-question`

`index.ts`(getUser·본문 12KB 상한·`ai_call_log` feature `isekai3d`) → `handler.ts`:
1. 요청 검사(`_shared/isekai3dQuestion.ts parseIsekai3dRequest` — 맥락 키가 내용과 맞는지, 목록·글자 상한)
2. `isekai3d_status` — 역할(학생·교사·관리자), **개인정보 동의**(데스크만 쓰는 학생은 웹의 `PrivacyConsentGate` 를 거치지 않으므로 여기서 막음, `CONSENT_REQUIRED`), 대기열이 남았으면 만들지 않음, 기억을 끈 학생은 경향 없이
3. **근무 카드는 직업의 단계에 맞춰** (2026-10-19 요청): 게임이 직함·몇 번째 단계(`rung`)·단계(`stage` junior 입문 / expert 전문 / leader 리더, isekai3d `workStages.ts`)·갈래·그 단계에서 실제로 하는 일(`stageWork`, 근무지 단계별 업무)을 보내고, 같은 단계에서 고른 답만 `recent` 로 보낸다. 프롬프트가 단계의 일과 권한에 맞추게 한다(입문이 팀을 이끌거나, 리더가 기초를 배우는 상황은 안 됨). 운영 확인: 의대 실습생 «교수님께 바로 물을지» ↔ 외과 주임교수 «증례 회의 주재·동료 의견 조율». 남는 질문은 `career_stage`·`career_branch` 칸으로도 나뉜다(`20261019230512`).
4. **근무 카드 답은 셋** (2026-10-19 요청): 문제를 다루는 서로 다른 방식 하나씩 — `approach` self(스스로 해결: 도전, 성공 15–25/실패 −10–−20) · together(함께 해결: 공통 역량 도전 7–15/−10, 또는 확실하고 작게 0·7) · safe(원칙·안전: 확실, 0·7). 정답 하나가 아니다. 선택지 글에는 유형·필요한 능력을 쓰지 않는다(«확실한 선택», «역량이 필요» 등은 거절). `approach` 는 학생에게 보이지 않고 게임이 플레이어 경향으로 쌓는다(«함께 풀어 가는 편» 등). 게임 화면은 답 글만 보이고(성공 가능성·필요 역량 표시를 뺐다 — 미리 쓴 카드도), 순서는 카드마다 섞는다 — ⚠️ 그래서 서버에 오는 `answer_choice` 는 **섞인 순서의 번호**다. 저장된 `card.choices` 로 읽을 땐 `isekai3d_private.card_choice_stored(id, n, 번호)` 로 되돌릴 것(2026-10-28 `20261028140000`, `docs/features/isekai.md`). 선택 글 40자·상황 260자·결과 150자 이내. 떨어진 까닭은 `checkCareerCard(…, why)` 로 볼 수 있다.
5. Solar pro4 (`json_object`, effort none, 60초, 잘림 거절) → `checkIsekai3dCards`(모르는 자리표시 `{2:가}`·영어 낱말 거절, `{1}`→`{n}`, 금칙어 — `술` 대신 낱말로, 성과 크기 −20/−10/0/7/15/25, 돈 일당 −0.5~1배, 역량·감정은 요청 목록 안, 둘 다 확실한 큰 이득 거절, 한글 60%, 최근 질문과 3-그램 0.55 미만) — 다 떨어지면 한 번 다시
6. `isekai3d_questions_add` → `filled` / `pending_exists` / 429 `DAILY_LIMIT`

`config.toml` 에 `[functions.isekai3d-question] verify_jwt = false` 선언(자체 인증).

## 회귀

`npx tsx scripts/isekai3d-question-test/run.mts` — 요청 검사, 카드 검사(금칙어·크기·역량·유사도), 함수 흐름(동의·대기열·기억 끔), 이름·글이 모델로 가지 않음, SQL 권한 정적 검사. 게임 쪽은 isekai3d `src/game/aiQuestions.test.ts`, 다리는 NEIS_helper `app/test_isekai3d_server.py`.

## 적용 (2026-10-19)

- 마이그레이션 드라이런 → 적용 → `migration repair`, 함수 배포 완료. 운영 확인(관리자 계정): 상태 → 3개 만들기 7.7초 → 받기 → 두 번째 받기 `daily_done` → `isekai3d_dev_reset` 으로 정리.
- 품질 점검(solar-proxy 로 실제 Solar): 성찰·진로 9/9, 근무 카드는 성과 크기를 가장 가까운 값으로 맞추고·범위 밖 돈은 빼고·`{n}` 조사 꼴을 고쳐 통과율을 올림.
- 관리자 시험: 게임 위쪽 🛠(서버의 `isekai3d_status.dev` 가 관리자일 때만) — 지금 받기, 만든 질문 모두 보기. (처음 있던 `isekai3d_dev_reset` 은 질문을 남기기로 하며 없앴다)
- **관리자는 한도 없음** (`20261019221509`, `20261019223511`, 사용자 결정 «질문의 내용을 시험하니 한도를 두지 않음», «생성된 모든 질문을 보여줌»): 하루 1개·하루 3묶음·대기열 확인을 관리자에게는 두지 않는다(`isekai3d_is_admin`). 🛠 에서 누를 때마다 3개를 새로 만들고 **가장 최근 묶음의 첫 질문**을 받는다. 만든 질문은 지우지 않고 `isekai3d_dev_questions` 로 모두 본다(게임 🛠 «📜 만든 질문 모두 보기» — 묶음별, 선택지의 역량·레벨·성과·돈, 보기, 내 답). 넣는 시각은 `clock_timestamp()` 로 적어 묶음 안 순서를 지킨다. 학생 동작은 그대로(`supabase/tests/isekai3d_questions.sql` 7번).

## 남은 일

- 담임·학년부장 화면(교사 RPC `isekai3d_my_students`·`isekai3d_student_overview` 는 있음, 웹 화면은 아직 — 관리자 탭의 `Isekai3dAnswers` 를 그대로 재사용할 수 있다)
- 게임 안 안내 문구가 «선생님이 볼 수 있어요»라면 «관리자»도 함께 말하도록 고칠 것(게임 = isekai3d 저장소, 이 저장소 밖)
- `docs/database` · `DATABASE_TABLES.md` 반영

## 오락기 동전 = 하루 플레이 분량 (2026-10-20)

게임(이세계 사회인)은 켜면 오락기가 먼저 나오고, 동전을 넣어야 들어간다. 동전 하나 = 게임 속 하루(1440분, 실제로 많아도 10분쯤).

- 하루(한국 시간) 최대 3번 · 첫 동전 무료 · 그다음 **5코인**(통합 지갑 `academy_user_stats.coins`, 다마고찌·아카데미와 같은 코인). 원장 `wallet_ledger` 에 `source_app 'isekai3d'`, `kind 'isekai3d_coin'`, `source_id '<날짜>:<몇 번째>'`.
- 표 `isekai3d_play_day(user_id, day, coins, used, paid)` — RPC 로만. `isekai3d_play_status()` · `isekai3d_play_insert()` · `isekai3d_play_use(p_used)`(그날 쓴 게임 분 전체, 늘기만·넣은 만큼까지). 규칙은 `isekai3d_play_rule()` 한 곳 ↔ 게임 `src/cloud/playPass.ts` `PLAY_RULES`.
- 관리자는 한도 없이 무료(분량은 줄어 «다 썼어요» 화면도 시험 가능).
- 게임 → 학생판 다리(NEIS_helper `app/core/isekai3d_server.py`의 `play/status`·`play/insert`·`play/use`) → RPC. 로그인 안 했으면 오락기가 «로그인하면 동전을 넣을 수 있어요»로 멈춘다.
- 마이그레이션 `20261020100000_isekai3d_arcade_coin.sql`, 시험 `supabase/tests/isekai3d_arcade_coin.sql`.

## 서버 저장 (2026-10-20)

게임의 저장 칸 3개를 학생 계정에도 둔다 — 다른 PC에서도, 다시 깔아도 이어서 할 수 있다.

- 표 `isekai3d_saves(user_id, slot 1~3, state, summary, saved_at, version)` — RPC 로만, 본인만(교사 열람 없음).
- `isekai3d_save_list()`(칸마다 saved_at·version·size·summary, state 없이) · `isekai3d_save_get(p_slot)` · `isekai3d_save_put(p_slot, p_state, p_summary, p_saved_at, p_base_version)` · `isekai3d_save_delete(p_slot)`.
- 게임은 이 PC(localStorage)에 먼저 저장하고, 수동 저장·칸 저장 때와 자동 저장 3분마다 뒤에서 올린다(`src/cloud/saveCloud.ts`). 이어하기는 이 PC와 서버 중 `saved_at` 이 늦은 쪽 — 서버 것이 늦으면 먼저 받아 이 PC에 넣는다. 칸을 지우면 둘 다 지운다.
- 판 충돌(다른 PC에서 그사이 올림): 서버 것이 더 늦게 저장된 것이면 올리지 않고 그대로 두고(다음 이어하기에서 서버 것을 받음), 이 PC 것이 늦으면 판 없이 덮어쓴다.
- 학생판 다리: `save/list`·`save/get`·`save/put`·`save/delete`(NEIS_helper `app/core/isekai3d_server.py`). 웹·오프라인은 이 PC 저장만.
- 마이그레이션 `20261020110000_isekai3d_saves.sql`, 시험 `supabase/tests/isekai3d_saves.sql`.

## 관리자 통계 (2026-10-21)

Admin «이세계 사회인» 탭 — RPC `isekai3d_admin_stats()`(관리자 전용 DEFINER, 읽기만) 하나를 그린다(`src/components/admin/Isekai3dAdmin.tsx`, 이름·파생 `isekai3dAdminStats.ts`).

- 플레이: 게임을 연 사람 · 7일/오늘 플레이 · 넣은 동전(무료/코인) · 쓴 코인 · 게임 시간 · 최근 21일 · 하루 동전 수 · 넣은 분량을 쓴 비율
- 질문: 종류별 만든/받은/답한 수 · 근무 카드 직업×단계 · 큰 사건별 · 서버 저장의 «가장 멀리 간 날» · 참여자 표(이름·날·동전·시간·질문 수)
- ⚠️ 통계 RPC 는 **숫자만** — 학생의 답(보기·글)·플레이어 지식·저장 내용은 싣지 않는다. 답은 아래 «학생별 질문과 답»이 따로 읽는다.

### 관리자 열람 (2026-10-22 정책 변경)

같은 탭 «학생별 질문과 답»(`src/components/admin/Isekai3dAnswers.tsx`) — 기록이 있는 재학생 목록(학년 거르기·이름 찾기, 최근에 답한 순) → [답 보기] 창: 게임이 읽은 경향(insights) · 받은 질문 100개(카드 글 · 보기 전부 + 고른 것 · 근무 카드는 방식 · 직접 쓴 글 · 건너뜀/미답).

- 서버: 마이그레이션 `20261022120000_isekai3d_admin_view_answers.sql` — `isekai3d_can_view` 에 관리자 분기 하나(`profiles.role = 'admin'` — 화면 미리보기와 무관), 답 목록에 `contextKey`. `isekai3d_my_students`·`isekai3d_student_overview` 는 그대로 쓴다(판정 한 곳).
- 볼 수 있는 대상은 여전히 **재학생**뿐 — 교사 플레이어의 답은 관리자도 못 본다.
- 카드 글의 심 이름 자리 `{n:은/는}` 는 «심은»으로 바꿔 보인다(`cardText`). 맥락 키 이름 = `contextLabel`(직업 이름은 통계의 직업 목록에서).
- 회귀: `run.mts` ⑦ + `supabase/tests/isekai3d_questions.sql`(관리자가 담임 태그 없이 보는 경우).
- ⚠️ 관리자 계정은 뺀다(한도 없는 시험 계정 — 근무 카드 대부분이 관리자 시험분이었다). 뺀 수는 화면이 말한다.
- 마이그레이션 `20261021130000_isekai3d_admin_stats.sql`.

## 동전 하나로 하는 시간 = 관리자 설정 (2026-10-23 — 사용자 요청 «admin 이세계 탭에서 코인 하나로 플레이할 수 있는 시간 설정»)

- 종전엔 `isekai3d_play_rule()` 의 `per_coin` 만 1440(게임 하루)으로 함수 본문에 박혀 있었다. 이제 코인 경제 설정 키 **`isekai3d.per_coin`**(게임 분, 기본 1440 · 범위 60~10080 = 게임 1시간~7일). 마이그레이션 `20261023130000_isekai3d_per_coin_setting.sql`.
- 관리 = Admin «이세계 사회인» 탭 맨 위 **오락기 동전** 카드(`Isekai3dPlaySettings`) — 동전 하나의 시간(게임 시간, 6·12시간·하루·이틀 빠른 선택 + 실제 시간 환산 «보통 0.5초 · 빠르게 1/6초») · 하루 동전 횟수 · 둘째 동전부터 값. 저장은 «코인 경제» 탭과 같은 `admin_coin_economy_set`(범위·기록을 서버가 본다) — 두 탭이 같은 값을 보인다.
- 게임은 서버가 주는 `perCoin`·`budget` 을 그대로 쓴다(isekai3d `src/cloud/playPass.ts` `fromServer`) — 서버 값만 바꾸면 분량이 바뀐다. **하루 중간에 바꾸면 그날 넣은 동전의 분량도 새 값으로 다시 계산**되고, 줄였을 때 이미 그만큼 썼으면 그날 남은 시간은 0(쓴 시간을 되돌리지 않는다).
- 게임 안 문구: 오락기의 «동전 하나 = 게임 속 하루»는 isekai3d `src/ui/Arcade.tsx` 가 `perCoinLabel(s.perCoin)` 로 그리도록 고쳤다(isekai3d 저장소 — 학생판 다음 배포부터 보인다). 그 전에는 설정을 바꿔도 문구만 «하루»로 남는다.
- 회귀: `run.mts` ⑦(1440 상수가 되살아나지 않는가 · 시드 · 실제 시간 환산 · 카드 배선).

---

## 근무 질문 하나씩 · 과제 카드 · 이어지는 질문 (2026-10-25 — 사용자 요청)

- **하나씩**: `ISEKAI3D_BATCH = 1` (3개씩 만드는 관례 취소). 하루 생성 3번·받기 1개 한도는 그대로.
- **과제 카드** (`TASK_CARD_CHANCE` 0.4, 전공 지식 카드와 겹치지 않음): 그날 하는 일(stageWork)의 구체적인 상황(예: RTS 게임의 전투 기능) +
  질문 + 힌트 2–3개 + 예시 답. `{"type":"task","text","ask","hints","example"}`, 선택지 없음. 학생은 직접 쓰거나 «모르겠어요»(답 글 = «모르겠어요»).
  보통 카드를 청했는데 과제 카드가 오면(또는 그 반대) 떨어뜨린다(`checkIsekai3dCards(..., { task })`).
- **이어지는 질문**: 게임이 새 카드를 받을 때 이어질 횟수를 0–2 중 무작위로 정하고, 그동안만 `context.follow = {text, answer}`(앞 상황과 고른 답·쓴 답, 심 이름은 `{n}`)를 보낸다.
  이어지지 않는 근무 카드에는 최근 답(recent)을 보내지 않는다(경향 통찰 insights 는 그대로). 직접 쓴 과제 답은 이어지는 질문을 만들 때 AI 에 간다(게임 화면이 알린다).
- 회귀 `scripts/isekai3d-question-test/run.mts` ⑧, 실제 모델 확인 `scripts/isekai3d-question-test/live-task.mts`(비용 — 따로).

## 직장 에피소드 (2026-10-25 — 사용자 요청·인터뷰)

일하는 캐릭터마다 그 직장의 «미니 시즌»(장면 3–5개)을 AI 가 드라마 작가처럼 쓴다. 게임 = isekai3d `src/game/episodes.ts`.

- 사용자 결정: 게임 속 며칠(2–3일)에 한 번, 그날은 근무 카드 대신 · 캐릭터마다 따로 · 줄거리 먼저, 장면은 앞 결정을 보고 하나씩(만든 것은 곧바로 DB 에 — 게임이 꺼져도 다음에 받음) ·
  등장인물 = 직장 동료·상사(게임이 저장마다 지은 이름) + 새 인물 0–2명(게임이 근무지 NPC 로 들임) · 대화창, 선택지 2개 + 직접 쓰기(200자, AI 에 감 — 화면이 알림) ·
  결정 → 다음 장면, 그 사람과의 우정, 성과·돈, 기분 · 하루 장면 2개 · 연결 없으면 쉬었다가 이어서 · 장르는 AI 자유(학생 내용 규칙, 연애 금지).
- DB `20261025230000_isekai3d_episodes.sql`: 표 `isekai3d_episodes`(시즌·줄거리, 학생×game_key×직장 진행 중 하나) · `isekai3d_episode_scenes`(장면·결정) — 클라이언트 직접 접근 없음.
  RPC `isekai3d_episode_status`·`_take`(받고 답 못 한 장면은 다시, 아니면 하루 2개)·`_answer`(마지막 장면이면 시즌 끝) · 함수 전용 `isekai3d_episode_add`(하루 3번 만들기, 새 시즌이면 진행 중이던 것 dropped).
- 엣지 함수 `isekai3d-episode` (`_shared/isekai3dEpisode.ts`): 받을 장면이 있거나 결정을 기다리면 쓰지 않음 · 새 시즌은 줄거리+첫 장면, 다음은 앞 장면·결정을 이어 · 검사(등장인물 key, 결과 범위, 금칙어) 실패 시 한 번 더.
  «스타»(게임의 고정 인물, persona)는 주인공급으로 넣으라고 한다.
- 회귀 `scripts/isekai3d-episode-test/run.mts`(LIVE=1 이면 Solar 한 번). 학생판 다리: `episode/take`·`episode/answer`·`episode/fill`(D:/NEIS_helper app/core/isekai3d_server.py).

## 학생 «내 기록» 화면 · 업적 (2026-10-28)
웹 `/isekai` 가 본인 기록을 RPC `isekai3d_my_record()` 로 읽고 업적 `isekai3d_achievements()`·`isekai3d_achievement_claim(id)`(코인)을 준다. 상세 = `docs/features/isekai.md`.

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

| `isekai3d-question` | **이세계 3D 질문** (2026-10-19 — 스페이스기전 학생 독의 게임, 저장소 isekai3d). 게임의 «플레이어 지식»(학생이 고른 답)을 학생 계정에 두고, AI 가 그것으로 근무 카드·인생 사건 성찰·진로 질문을 **3개씩** 만든다. **받기는 세 종류 합쳐 하루(한국 시간) 1개**(`isekai3d_question_take`). 열람 = 본인 + **태그 담임·학년부장** + **관리자**(`isekai3d_can_view` 한 곳 — 관리자는 2026-10-22 사용자 결정으로 추가, 재학생만). 학생이 쓴 글·이름은 AI 로 안 간다. 데스크만 쓰는 학생은 웹 동의 화면을 안 거치므로 함수가 **개인정보 동의를 확인**. **관리자 통계 = Admin «이세계 사회인» 탭**(맨 위 «오락기 동전» 카드 = 동전 하나로 하는 시간·하루 횟수·값 — 코인 경제 키 `isekai3d.per_coin` 등, 2026-10-23 · 2026-10-21 — RPC `isekai3d_admin_stats`, 숫자만, 관리자 계정 제외 · 같은 탭 «학생별 질문과 답» = `Isekai3dAnswers` 가 `isekai3d_my_students`·`isekai3d_student_overview` 로 답 내용을 연다). 게임은 학생판 로컬 서버(NEIS_helper `app/core/isekai3d_server.py`)를 거쳐 학생 세션으로 부른다. 관리자만 게임의 🛠 시험 메뉴·`isekai3d_dev_reset` | `_shared/isekai3dQuestion.ts`, edge fn `isekai3d-question`, `20261019213117_isekai3d_questions.sql` · `docs/features/isekai3d-question.md` · 회귀 `scripts/isekai3d-question-test/run.mts` + `supabase/tests/isekai3d_questions.sql` |
