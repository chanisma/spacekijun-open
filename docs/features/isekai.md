# 이세계 사회인 «내 기록» (`/isekai`, 2026-10-28)

사용자 요청: «이세계 사회인 메뉴 추가하고 학생의 플레이에 대한 정보와 통계, 기록 등 표시. 이세계 사회인에 어울리는 디자인으로 제작하고
재미 요소가 담긴 페이지로 구성. 정성이 들어가야함. 또한 업적 시스템도 추가해서 적용.» · 결정(같은 날): 구성안 그대로 · 업적마다 한 번 5~50코인.

게임 자체는 이 저장소에 없다(독 학생판 `D:\NEIS_helper` 안의 isekai3d, 데이터 흐름 = `docs/features/isekai3d-question.md`). 이 화면은 그 게임이
같은 DB 에 남긴 것을 **읽기만** 한다.

## 화면 (`src/features/isekai/`)
- 컨셉 = «주식회사 이세계» 인사팀 서류철. 게임 옷(크림 `#fdfaf1` · 남색 `#1c2850` · 금색 `#c9a14a` + 플럼밥 초록, 제목 Hahmlet · 손글씨 Jua) — 앱 테마가 아니다(coin-guide 와 같은 원칙). 스타일 = `isekai.css`(`isk-` 접두어).
- **사원증 히어로**(`components/Hero.tsx`) — 세이브 첫 사람 색으로 그린 증명사진 · 플럼밥(오늘 놀았으면 초록, 아니면 노랑) · 직급(달성 업적 수: 인턴→사원→주임→대리→과장→부장→사장) · 칭호 리본 · 소속 = 가장 많이 한 직업부. **누르면 뒤집혀 인사평가**(등급 S~C = 출근·답·드라마·업적 혼합, 재미용 · 저장 안 함 · 업무 성향). 오른쪽 = 사내 메신저 한 줄(날짜·사람마다 고정) · KPI 4 · 승진 사다리.
- 탭 다섯(`components/Sections.tsx`·`AchievementBoard.tsx`): 근무 기록부(이번 주 출근 도장 · 16주 잔디 · 최근 일지) · 인사기록(성향 저울 · 경력 · 특기 · 세이브 파일) · 사내 드라마(포스터 · 완결 도장 · 내 선택) · 면담 노트(내 답, 종류 필터) · 업적 결재판(받기 → «결재 완료» 도장, 한꺼번에 받기, 칭호 고르기).
- ⚠️ `days[].used` 는 **게임 속 분**(동전으로 산 시간)이다 — 화면은 «게임 속 근무»라고만 부른다. 실제 플레이 시간은 DB 에 없다.
- 질문·장면 글의 `{n:은/는}` = 게임이 주인공 이름으로 바꾸는 자리 → 화면은 «주인공»(`fillName`).
- 교사·관리자: 자기 기록이 비면 **예시로 보기**(`sampleRecord`·`sampleAchievements`, 지어낸 값)가 기본 — 받기는 막힌다. 관리자 실계정도 받기 불가(진행도만).
- 칭호·마지막 탭은 이 기기에만(`safeLocalStorage` `isekai.badge`·`isekai.tab`).
- 메뉴 = 학생 네비 + 교사 [학생 메뉴](`navigation.ts` `isekai`, 카탈로그 기본 공개) · 라우트 학생·교사·관리자 · 직원 닫힘(`routeAccess`). 코인 얻는 법 카드가 여기로 보낸다(전에는 `/desktop-app`, 이 화면에 «학생판 받으러 가기»가 있다).

## 서버 (`20261028120000_isekai3d_record_achievements.sql`)
- 표는 만들지 않는다. isekai3d 표는 authenticated 에 닫혀 있어 본인 것만 DEFINER RPC 로(`isekai3d_require_player` = 학생·교사·관리자).
- `isekai3d_my_record()` — 세이브 요약(state 없이) · 날짜별 play_day · 최장 연속 · 내 답 최근 200 · 받은 질문 수 · 에피소드(출연 이름·장면 수·내 선택) · 지식 tally.
- `isekai3d_achievements()` · `isekai3d_achievement_claim(id)` — 별까지 쌓기 업적과 같은 꼴. 진행도 단일 출처 `isekai3d_private.achievement_progress`. 보상 = 원장 kind `isekai3d_achievement` · source_id = 업적 id(유일 키가 «한 번»), 값 = 코인 경제 `isekai3d.achievement.<id>`(18키, 합계 330).
- ⚠️ **진행도 출처**(같은 날 다마고찌 일기 악용의 교훈): 출근·동전 = `isekai3d_play_day`(하루 한 줄 · 동전은 코인을 내야 는다) · 답·드라마 = 서버가 만든 질문·장면에 답한 것(생성이 하루 상한) · 세이브 날짜·자산·가족 = **게임이 올린 요약(클라이언트 값)이라 보상 ≤15**. 게임이 마음대로 쓰는 `isekai3d_player.knowledge` 는 진행도에 쓰지 않는다(화면 통계만).
- 목표·순서·보상 시드는 SQL ↔ `model/achievements.ts` 두 벌.

## 사회생활·역량·열망 업적 (`20261028140000`, 2026-10-28)
사용자 요청: «이세계 사회인은 사회 생활을 체험해 보는 것이 여러가지 목적 중 하나 … 관련된 업적 · 다양한 역량에 대한 업적 · 다양한 열망에 대한 업적». 26개 추가 → 44개(합계 635코인), 직급 사다리도 44개 기준(사원 3 · 주임 8 · 대리 14 · 과장 21 · 부장 29 · 사장 37). 결재판에 묶음 고르기(44개가 한 줄로 길어서).
- **출처는 세이브 `state`**(게임이 통째로 올린 상태 — `isekai3d_my_record` 는 내보내지 않고 진행도만 읽는다): 사람마다 `job.level`(0부터 = 승진 횟수)·`workDays`(직업 유형별 일터 출근 일수, 최댓값)·`skills`(0~10 소수, 내림)·`aspiration`/`aspirationLog`(`milestone` = 이룬 단계 수)·`traits`, 칸마다 `relationships[].stage`(`friend`·`goodFriend`). 클라이언트 값이라 이 업적들은 **보상 ≤ 15**(회귀가 27개 전부 검사).
- 역량 = 어른 역량만(아기·어린이 역량 제외). 이름은 게임 `constants.ts SKILL_INFO`(charisma = «의사소통», NCS 직업기초능력 쪽). 마음 근육 = 끈기·회복탄력성·절제력·호기심.
- 열망 완수 = 그 영역의 **보상 특성**이 붙었는가(게임 `aspirations.ts AREA_TRAITS.reward` — 마지막 단계에서 붙고 열망을 바꿔도 남는다). 세이브 칸마다 같은 가족이 있을 수 있어 «합»(단계 수·친구 수)은 칸마다 세고 가장 큰 칸.
- **근무 카드 방식**(함께·스스로·원칙 — 카드 `choices[].approach`)만 서버 기록이라 보상 20까지. «균형 감각» = 셋을 3번씩 — 한 방식만 미는 업적이 되지 않게(카드 설계가 «정답 하나가 아니다»).
- ⚠️ **근무 카드 `answer_choice` 는 게임이 섞어 보여 준 순서의 번호**(isekai3d `src/game/aiQuestions.ts toCareerEvent` — 카드 id 로 정해지는 섞기). `card->'choices'->answer_choice` 로 바로 읽으면 다른 선택지다. `isekai3d_private.card_choice_stored(id, n, shown)` 가 같은 섞기를 32비트 넘침까지 되풀이한다 — 게임의 섞기를 바꾸면 여기도(회귀가 게임 식으로 SQL 값 10개를 대조). 인생·탐색 카드(`options`)와 드라마 장면은 섞지 않는다.
- 면담 노트가 근무 카드에 고른 방식 칩을 단다(`approach` — 게임 화면에는 안 보이는 칸, 지난 답을 돌아보는 표시).

## 회귀
- `npx tsx scripts/isekai-test/run.mts` — SQL↔TS 업적 · 진행도 출처 · 권한 · 순수 함수(통계·연속·잔디·성향·이름 자리) · 메뉴/라우트 짝.
- 화면 확인 하네스 = 개발 서버에서 `/scripts/isekai-test/harness.html`(`?ready=1` 받기 단추 · `?empty=1` 기록 없음).
- 함께 고친 회귀: `coin-guide-test`(href) · `menu-layout-test`(학생 메뉴 전 항목 목록).
