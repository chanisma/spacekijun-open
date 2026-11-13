# AI 교실 브리핑 기사 아카이브 (ai_news)

교사용 AI 뉴스 브리핑을 만들기 위해 수집·분류한 기사 보관함.

> 📍 전체 스키마 인덱스: [DATABASE_TABLES.md](../../DATABASE_TABLES.md)

---

## 개요

외부 스킬 `ai-news-notice`가 기사를 수집(collect) → LLM 분류(classify) → 적재(`upload-supabase.js`)한다.
2026-09-11 ‘요즘 세상’ 기능부터 프런트엔드에서 선별된 기사를 조회한다. 기존 적재 파이프라인은 그대로다.
공용 생성 타입은 유지하고 `src/features/world-today/types.ts`에서 검증한 기능 한정 스키마 타입을 보강한다.

생성: 2026-09-11, 마이그레이션 `create_ai_news`.

### 열람 권한 — 선별 기사만 학생·교사·관리자에게 공개

`20260911233935_world_today_news_and_inquiries.sql` 반영 후 `ai_news_school_read` SELECT 정책이 추가됐다.
로그인 프로필이 student/teacher/admin이고 `keep=true`인 기사만 읽는다. 클라이언트의 INSERT/UPDATE/DELETE/TRUNCATE 권한은 회수했고 적재용 service_role 권한은 유지했다. anon에게 SELECT를 부여하지 않는다.
개인 일지는 `world_news_inquiries`에 저장하며 소유자만 접근한다. 상세: [요즘 세상](../features/world-today.md).
관심 분야는 `world_news_interests`(2026-10-11, 본인만 — `user_id` PK · `fields` 최대 5 · `notify`)에 저장한다.
알림 중복 방지 기록은 `world_news_private.pick_log`(클라이언트 접근 없음, 120일 보관).

아래는 웹 연결 이전의 초기 설계·검증 이력이다.

이 저장소는 보통 "정책 없음 = 오류가 아니라 조용히 0행"을 **함정**으로 기록해 왔지만, 여기서는 그 성질을
**일부러** 쓴다. 정책이 하나도 없으므로 `anon`·`authenticated`에게는 아무 행도 보이지 않고,
RLS를 우회하는 `service_role`(=적재 스크립트가 쓰는 키)만 접근한다.

실측 검증(2026-09-11, 트랜잭션 안에서 1행 넣고 역할 전환 후 롤백):

| 역할 | 보이는 행 |
|---|---|
| `service_role` | 1 |
| `authenticated` | **0** |
| `anon` | **0** |

이 초기 상태에서는 앱 조회가 빈 배열을 반환했다. 현재는 위의 제한된 SELECT 정책이 적용되어 있다.

---

## 테이블

### ai_news
**Purpose**: 수집·분류된 기사 1건 = 1행
**Primary Key**: `id` (bigint, `generated always as identity`)
**RLS Enabled**: Yes (선별 기사 SELECT 정책 1개 — 위 참고)

#### Columns

식별·원문
- `id` (BIGINT): PK. `generated always as identity`라 값을 직접 넣을 수 없다(`overriding system value` 필요).
- `url` (TEXT, NOT NULL, **UNIQUE**): **업서트 충돌 키**. 적재는 `on conflict (url) do update`로 돈다.
  같은 기사를 다시 수집하면 새 행이 아니라 갱신된다.
- `source` (TEXT, NOT NULL): 매체명
- `title` (TEXT, NOT NULL)
- `published_at` (TIMESTAMPTZ, nullable): 기사 발행 시각. 정렬·최근 조회의 기준
- `summary` (TEXT, nullable)

분류 결과(LLM)
- `category` (TEXT, NOT NULL): `연구성과` | `응용사례` | `산업뉴스` | `정책` — CHECK `ai_news_category_chk`.
  **분류 체계를 늘리려면 제약도 함께 고쳐야 한다.** 안 고치면 적재가 통째로 실패한다(다행히 조용한 실패가
  아니라 오류다).
- `keep` (BOOLEAN, NOT NULL, default `false`): 브리핑에 실제로 실을 기사인지
- `classroom_hook` (TEXT, nullable): 수업에서 꺼낼 만한 지점
- `why_it_matters` (TEXT, nullable)
- `subjects` (TEXT[], NOT NULL, default `{}`): 관련 교과
- `fields` (TEXT[], nullable, 2026-10-11): 요즘 세상 **관심 분야 맞춤**용 분야 — 닫힌 14종(`world_news_private.field_list()`),
  최대 3개, 첫째 = 주된 분야. CHECK `ai_news_fields_chk`, GIN `ai_news_fields_idx`. **`null` = 아직 분류 안 함,
  `{}` = 분류했지만 맞는 분야 없음**(둘을 섞으면 같은 기사를 매시간 다시 부른다). 외부 수집기는 이 열을 쓰지 않는다 —
  이 저장소의 엣지 함수 `world-news-fields` 가 매시 30분 pg_cron(`world-news-tag`)으로 채운다. 상세 = [요즘 세상](../features/world-today.md) «관심 분야 맞춤».
- `difficulty` (TEXT, nullable)
- `impact` (SMALLINT, NOT NULL, default `0`): 0~5 — CHECK `ai_news_impact_chk`

이력
- `model` (TEXT, nullable): 분류에 쓴 모델 ID
- `classified_at` / `collected_at` (TIMESTAMPTZ, nullable)
- `created_at` (TIMESTAMPTZ, NOT NULL, default `now()`)
- `updated_at` (TIMESTAMPTZ, NOT NULL, default `now()`) — 아래 트리거가 갱신

#### 인덱스
- `ai_news_pkey` (id) · `ai_news_url_key` (url, UNIQUE)
- `ai_news_published_at_idx` — `(published_at desc)`, 최근 기사 조회용
- `ai_news_keep_idx` — `(published_at desc) where keep`. **부분 인덱스**: 브리핑에 실제 쓰인 기사만 보는
  질의가 압도적이라 `keep=true` 행만 담아 크기를 줄인다. 조건절이 `where keep`이므로 질의도 그 형태여야
  인덱스를 탄다(`where keep = true`는 플래너가 같게 보지만, `where keep is true` 같은 변형은 주의).
- `ai_news_source_idx` — `(source)`

#### 트리거
- `ai_news_touch_updated_at` — BEFORE UPDATE FOR EACH ROW → `public.ai_news_touch_updated_at()`.
  `new.updated_at = now()`. **`on conflict do update` 경로에서도 발동한다**(검증 완료) — 적재가 업서트만
  써도 `updated_at`은 제대로 갱신된다.

> ⚠️ **트리거 검증 시 `now()` 함정**: `now()`는 `transaction_timestamp()`라 같은 트랜잭션 안에서는 항상
> 같은 값이다. 그래서 `updated_at > created_at`으로 검사하면 **트리거가 멀쩡해도 false**가 나온다.
> `updated_at`을 과거 시각으로 심어 두고 갱신 뒤 덮였는지 보거나, `clock_timestamp()`를 쓸 것.

---

## 알려진 권고 (Supabase linter)

| 항목 | 수준 | 판단 |
|---|---|---|
| `rls_enabled_no_policy` | INFO | 초기 비공개 저장소 설계. 현재는 요즘 세상 SELECT 정책을 추가해 해소 |
| `function_search_path_mutable` (`ai_news_touch_updated_at`) | WARN | 미조치. SECURITY INVOKER 기본값이라 권한 상승 위험은 낮지만, 굳히려면 `alter function public.ai_news_touch_updated_at() set search_path = ''` |
