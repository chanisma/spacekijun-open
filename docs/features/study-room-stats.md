# 자습실 통계 (`/study-room-stats`, 2026-10-09)

seaton(자습실 좌석 신청 앱, 별도 저장소 `D:\seaton`)의 **통계 페이지에 보이는 내용**을 spacekijun 에서 본다.
두 앱은 같은 Supabase DB 를 쓰므로 데이터는 원래 공유돼 있었다 — 이번 작업의 핵심은 **판정 규칙을 한 곳에 모은 것**이다.

- 메뉴 = [학사 운영 허브] › 자습실 통계 · 라우트 `TEACHER_ROLES` · 직원 차단(`STAFF_BLOCKED_PREFIXES`) — 학생 정보다.
- 화면 = `src/features/study-room-stats/` — 탭 넷(요약 · 학생별 · 요일별 · 온도 랭킹). **그리기만 한다.**
- 서버 = `supabase/migrations/20261009100000_seaton_stats_contract.sql` — 공개 RPC 4개, 판정은 `seaton_private` 세 함수.

## 왜 seaton 함수를 그대로 부르지 않았나

seaton 안에서도 같은 지표가 화면마다 다르게 계산되고 있었다(2026-10-09 조사).

| 어긋남 | 실제 상태 |
|---|---|
| 결석 판정 4종 | 클라이언트 시계 23시 · DB 시간대 `current_date`/`now()` · KST 23시 + 클라이언트 today · 23시 규칙 없음(MV) |
| `is_attended` NULL | 결석으로 셈(TS·번들) ↔ 빼고 셈(overall·MV) |
| 출석률 분모 2종 | 출석+결석(카드) ↔ 전체 신청(학년·월·주·열람실 차트) — 한 화면의 카드와 막대가 다른 숫자 |
| 온도 상수 5벌 | TS `temperature.ts` · MV · `calculate_student_temperature` · 월별 랭킹 RPC · 번들 인자 |
| 기간 온도 변화 | 피드백 +0.1 빠짐 ↔ 현재 온도(MV)에는 들어감 |

그래서 spacekijun 은 **새 계약**을 만들고 규칙을 하나로 정했다(seaton 옛 RPC 는 건드리지 않았다).

## 규칙 (정본 = `seaton_private`)

| 항목 | 정의 | 함수 |
|---|---|---|
| 시계 | 서버 시각 KST. 오늘 예약은 23시가 지나야 결석 | `clock(now)` |
| 출석 | `coalesce(is_attended,false)` — 인정·보완 포함 | `facts` |
| 결석 | 출석 아님 ∧ (지난 날 ∨ 오늘 23시 이후). NULL 도 결석 | `facts` |
| 대기 | 그 밖(오늘 23시 전 · 미래). 출석률 분모에 넣지 않는다 | `facts` |
| 출석률 | 출석 ÷ (출석 + 결석) — **모든 차트가 같은 분모** | `rate()` |
| 온도 | 28 + Σ날짜 (출석×0.5 − 결석×1.0) ÷ 그날 예약 수 + 피드백×0.1 | `temperature_rule()` |
| 그날 예약 수 | 열람실 필터와 **무관하게** 그 학생의 그날 전체 예약 수 | `facts.day_n` |
| 학년 | `resource.meta.grade`(현재 학년). resource 가 없으면 «학년 미상»으로 따로 센다 | `facts` |

화면은 숫자를 다시 적지 않는다 — 온도 탭의 규칙 문구도 응답의 `rule` 을 그린다.
정적 회귀가 `0.5`·`28.0`·`1.0` 리터럴과 `>= 23` 을 이 폴더에서 찾으면 실패한다.

## 운영 실측 (2026-10-09)

- **seaton 옛 RPC 와 일치**: 2026-09 총 3,681 · 출석 3,346 · 결석 335 · 학생 140 · 열람실 11 — `get_overall_statistics` 와 완전 일치(그 달은 NULL 출석 0건이라 규칙 차이가 드러나지 않는다). 학년별 신청·출석도 일치(출석률만 분모가 바뀌어 다르다 — 의도). 누적 온도 상위 3명 이름·값 일치.
- 응답 시간(교사, 콜드 포함): 요약 1개월 0.84초 · 학기 0.91초 · 학생별 학기 1.14초(1.2MB) · 요일별 0.11초 · 온도 0.92초. `authenticated` 8초 제한의 15% 미만.
- 탭을 열 때만 그 탭의 RPC 를 부른다(첫 화면 = 요약 하나).

## 조용히 틀리는 자리

1. **추이 차트는 기간 필터를 따르지 않는다** — 끝 날에서 거꾸로 6개월·12주(seaton 화면과 같은 뜻). 그래서 패널이 «기간 필터와 별개로 … 기준»이라고 말한다.
2. **학년 미상 행을 숨기지 말 것** — resource 가 없는 학생의 예약이 학년 막대에서 빠지면 합계가 조용히 준다. 요약이 «학년 미상 N건 제외»를 적는다.
3. **온도 랭킹은 MV 를 읽지 않는다** — seaton `temperature_rankings_mv` 는 교사가 새로 고침을 눌러야 갱신된다(cron 없음). 이 화면은 매번 계산한다(0.9초).
4. **`facts` 를 LANGUAGE sql 로 바꾸지 말 것** — 쓰지 않는 필터가 일반 계획에 남아 학기 범위가 7초 이상 걸린 seaton 의 실측이 있다. 동적 SQL(`RETURN QUERY EXECUTE … USING`)이 매 호출을 실제 값으로 계획한다.

## 회귀

- `npx tsx scripts/study-room-stats-test/run.mts`(43) — 표시 함수 · 메뉴/라우트/직원 차단 짝 · 화면에 규칙 상수 없음 · 계약 RPC 만 호출 · 마이그레이션 권한(public·anon 회수, DEFINER, `search_path=''`, 첫 줄 교사 가드).
- `PLAYWRIGHT_MODULE=<playwright/index.mjs> STATS_CHANNEL=chrome node scripts/study-room-stats-test/run-screenshots.mjs` — 실제 페이지를 1280·390 으로 네 탭 스크린샷 + 가로 넘침·RPC 호출 단언(지어낸 자료, 개발 서버 8080 필요). 390 에서 날짜 칸 1px 넘침이 여기서만 드러났다.
- SQL 은 마이그레이션 드라이런에서 역할별(교사 통과 · 직원·학생·anon 42501)로 쟀다.

## 나중에 (M5, 선택)

seaton 의 옛 통계 RPC·MV·`calculate_student_temperature` 를 `seaton_private.facts`·`temperature_rule` 위로 옮기고 seaton 화면도 `seaton_stats_*` 를 쓰게 하면 두 앱이 같은 숫자를 보인다. 지금은 seaton 화면이 옛 규칙으로 계산한다(분모·NULL·23시 차이만큼 다를 수 있다).

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

| `study-room-stats` | **자습실 통계** (`/study-room-stats`, 2026-10-09 — 교사·관리자, 직원 차단). seaton 통계 페이지 내용(요약 · 학생별 · 요일별 · 온도 랭킹)을 계약 RPC `seaton_stats_*` 로 그린다 — **판정은 서버 `seaton_private` 한 곳**이고 화면은 그리기만(정적 회귀가 `0.5`·`28.0`·`>= 23` 을 찾는다). 9월 숫자·온도 상위가 seaton 옛 RPC 와 일치(출석률만 분모 통일로 다름 — 의도). 회귀 `npx tsx scripts/study-room-stats-test/run.mts`(43) + `run-screenshots.mjs`(1280·390) | `StudyRoomStatsPage.tsx`, `services/studyRoomStatsService.ts` · `docs/features/study-room-stats.md`, `docs/database/seaton-contract.md` |
