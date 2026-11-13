# 창의적 체험활동 (Creative Activities)

> 마이그레이션 `20260827090000_creative_activities_core.sql` · 시드 `20260827091000_creative_activities_seed_clubs.sql`
> 기능 모듈 `src/features/creative-activities/` · 설계 배경 `docs/creative-activities-plan.md`

---

## 0. 모델의 중심은 '활동'이다

**동아리는 활동이 아니라 활동이 열리는 맥락이다.** 중요한 것은 "융합과학 동아리"가 아니라
그 동아리가 진행한 "혈액형 판별 실험"이다. 그래서 이름·목적·내용·시수·예산·계보가 전부
`activity` 행에 붙고, 참여도 동아리 소속이 아니라 **활동 참여**로 기록된다.

```
activity_host              활동을 여는 맥락 (동아리·학년·학교·부서·외부기관·개인교사)
  └ activity_host_member      연도별 소속 명단 (동아리 부원)
activity                ★ 활동 1건 — 이름·영역·일시·시수·예산·계보
  ├ activity_teacher          담당교사 (복수)
  └ activity_participation ★ 학생 × 활동
```

**계보(`lineage_parent_id`)는 host가 아니라 activity에 붙는다.** 이어지고 깊어지는 것은
동아리가 아니라 그 동아리가 한 일이기 때문이다. 이 한 줄이 카드의 "3년째" 배지,
상세 모달의 계보 타임라인, 인사이트의 지속성 지표를 모두 가능하게 한다.

### 왜 이 스키마가 필요했나 (2026-08-27 실측)

| 관측 | 수치 |
|---|---|
| `student_detailed_activities` 창체 3영역 | 자율/동아리/진로 각 1,954행 — 학생×학년당 1행뿐 |
| 본문 없이 `{"영역":…,"시간":…}` JSON만 든 행 | **1,751 / 5,862 = 29.9%** (1학년 25.8% → 3학년 37.9%) |
| 생기부 동아리명 ↔ `club_info.name` 일치 | 101종 중 **8종(8%)** |
| 2026 `teacher_timetable` 창체 슬롯 | 동아리 81 · 진로 54 · 자율 53 (기록될 자리가 없었다) |

시수는 남고 "누가·언제·무엇을·왜"가 사라진다. 그리고 활동에 안정 식별자가 없어
"작년 그 활동"을 올해와 이을 방법이 없다.

---

## 1. `activity_host` — 활동을 여는 맥락

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `kind` | text NOT NULL | `club` / `grade` / `school` / `department` / `external` / `teacher` |
| `name` | text NOT NULL | |
| `category` | text | 분야 (`club_info.category` 승계) |
| `description` | text | |
| `default_area` | text | 이 맥락에서 여는 활동의 기본 영역. **활동이 개별로 덮어쓸 수 있다** |
| `owner_resource_id` | uuid → `resource` | 담당교사 |
| `department` | text | |
| `status` | text | `active` / `archived` |
| `meta` | jsonb | 시드 행은 `{source:'club_info', club_info_id, seeded_academic_year}` |
| `created_by` | uuid → `profiles` | |

`UNIQUE (kind, name)` — 같은 종류 안에서 이름이 유일하다.

**`default_area`가 활동의 area를 강제하지 않는 이유**: 동아리라도 봉사성 활동을 하면
그 활동은 `area='service'`여야 생기부 봉사 시수와 맞는다.

---

## 2. `activity_host_member` — 연도별 소속 명단

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `host_id` | uuid → `activity_host` CASCADE | |
| `academic_year` | int NOT NULL | |
| `student_code` | text NOT NULL | **FK 없음** (§6 참조) |
| `student_resource_id` | uuid → `resource` SET NULL | |
| `grade` / `class_num` / `number` | int | 소속 당시 스냅샷 |
| `role` | text | `member` / `leader` / `staff` |

`UNIQUE (host_id, academic_year, student_code)`

**소속과 참여는 다른 사실이다.** 부원이어도 특정 활동에 빠질 수 있다. 이 표는 참여자
선택의 **기본값 씨앗**이지 참여 기록이 아니다 — 활동 참여는 `activity_participation`에만 있다.

---

## 3. `activity` ★ — 활동 1건

### 무엇을 했는가

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `name` | text **NOT NULL** | 활동 이름. **이름 없는 활동은 존재할 수 없다** — 이름이 없으면 검색·집계·계보 추적이 불가능하고 그것이 정확히 현행 생기부의 문제다 |
| `area` | text NOT NULL | `autonomy` / `club` / `career` / `service` |
| `purpose` | text | 왜 했는가 |
| `content` | text | 무엇을 했는가 |
| `outcome` | text | 무엇이 나왔는가 (산출물 요약) |

### 언제·어디서

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `academic_year` | int NOT NULL | |
| `semester` | int | 1 / 2 / NULL(연간) |
| `starts_on` | date NOT NULL | |
| `ends_on` | date | NULL = 하루짜리 |
| `hours` | numeric(5,1) | 인정 시수(기본값). 참여자가 개별로 덮어쓸 수 있다 |
| `place` | text | |

`CHECK (ends_on IS NULL OR ends_on >= starts_on)`

### 맥락 · 계보

| 컬럼 | 설명 |
|---|---|
| `host_id` → `activity_host` SET NULL | **NULL 허용** — 개별 교사 활동은 주최 맥락 없이 존재한다 |
| `lineage_parent_id` → `activity` SET NULL | 이전 활동에서 이어짐 |
| `lineage_note` | `'2025 융합과학에서 바이오 분과 분리'` |

`CHECK (lineage_parent_id IS DISTINCT FROM id)` + 트리거 `activity_lineage_guard_trg`가
64단계까지 조상을 거슬러 **순환을 거부**한다(23514). 순환이 생기면 계보 뷰가 무한 순회한다.

### 운영 · 예산 — 활동 단위다

| 컬럼 | 값 |
|---|---|
| `operator_type` | `internal`(교내) / `external`(외부 업체) / `joint`(공동) |
| `operator_name` | 외부 업체·기관명 |
| `scale` | `school` / `grade` / `class` / `group` / `individual` |
| `budget_source` | `school`(학교 일반예산) / `office`(교육청 사업) / `grant`(공모) / `external` / `self` / `none` |
| `budget_program` | 사업명 (`'2026 과학중점학교 운영'`) |
| `budget_planned` / `budget_spent` | numeric(12,0) |

**왜 host가 아니라 activity에 있나**: 같은 동아리도 활동마다 예산 출처가 다르다.
교육청 사업비로 탐방을 가고, 학교 예산으로 실험재료를 산다. host에 두면 연도 비교가 불가능해진다.

### 분류축 · 상태 · 출처

| 컬럼 | 설명 |
|---|---|
| `keywords` / `related_subjects` / `career_fields` | text[] — 탐색·인사이트의 뼈대. `keywords`에 GIN 인덱스 |
| `target_grades` | int[] |
| `status` | `planned` / `running` / `done` / `cancelled` |
| `visibility` | `school`(전교 열람, 기본) / `participants`(참여자 한정) |
| `source` | `manual` / `timetable` / `meeting` / `issue` / `import` — **기록을 부산물로 만드는 경로 추적** |
| `meeting_id` → `meeting` SET NULL | 학교 일정과 연결 |
| `attachments` | jsonb 배열 (tasks·notice-board 구조와 호환) |

---

## 4. `activity_teacher` — 담당교사 (복수)

`PRIMARY KEY (activity_id, teacher_resource_id)` · `role` = `lead` / `co` / `support`

학교 차원 활동은 여러 교사가 함께 진행하므로 복수를 전제한다.
**`can_manage_activity()`의 판정 근거**이기도 하다.

---

## 5. `activity_participation` ★ — 학생 × 활동

| 컬럼 | 설명 |
|---|---|
| `activity_id` → `activity` CASCADE | |
| `student_code` | **FK 없음** (§6) |
| `student_resource_id` → `resource` SET NULL | |
| `grade` / `class_num` | 참여 당시 스냅샷. **현재 반과 다를 수 있고 그 시점이 정본이다** |
| `role` | `member` / `leader` / `presenter` / `staff` |
| `status` | `applied` / `active` / `completed` / `withdrawn` |
| `hours` | NULL이면 `activity.hours`를 상속(부분 참여만 개별 지정) |
| `note` | |

`UNIQUE (activity_id, student_code)`

**시수 해석 규칙은 `src/features/creative-activities/utils/hours.ts` 단일 출처**다.
`applied`·`withdrawn`은 **0시간** — 아직 하지 않았거나 끝내지 않은 시간을 실적으로 세면
생기부 시수가 부풀려진다. 화면마다 다시 쓰면 "카드에 34시간, 상세에 30시간"이 된다.

---

## 6. 학생 참조 규약 — 이름을 저장하지 않는다

- 학생은 **`student_code`로만** 참조하고 `student_resource_id`를 보조로 둔다.
  **이름 컬럼을 두지 않는다.**
- 이유: `process_graduated_student_cohort`가 졸업 시 `resource.name`을 `YYYY입학NNN`
  별칭으로 치환한다. 이름을 복사해 두면 익명화가 새어 나가고,
  `anonymize_detailed_activities_on_graduation` 같은 트리거를 또 만들어야 한다.
  `resource`로 조인하면 익명화가 **자동으로 따라온다.**
- **`student_code`에 FK를 걸지 않는다** — 생기부 미import
  신입생·전입생도 명단에 있어야 하고, 학생 FK가 INSERT를 막는 실제 장애가 있었다.
- 명단 조회는 `resource`(type='student', **status='active'**).
  `student_basic_info`는 졸업·전출생이 남아 있어 명단 용도로 쓰지 않는다.

---

## 7. RLS · 판정 함수

### 함수 (모두 SECURITY DEFINER)

| 함수 | 판정 |
|---|---|
| `current_student_code()` | 현재 사용자가 학생이면 학생코드(email prefix), 아니면 NULL |
| `is_activity_manager()` | `창체담당자` 태그 ∨ admin |
| `can_manage_activity(uuid)` | `activity_teacher` 담당 ∨ 생성자 ∨ 창체담당자 ∨ admin |
| `can_manage_activity_host(uuid)` | `owner_resource_id` 담당 ∨ 생성자 ∨ 창체담당자 ∨ admin |
| `is_activity_participant(uuid)` | 현재 사용자(학생)가 그 활동 참여자인가 |
| `is_activity_host_member(uuid, int)` | 현재 사용자(학생)가 그 해 그 주최의 소속인가 |

`창체담당자`는 마이그레이션이 `resource_tags`에 삽입한다
(`연수담당자`·`발급대장담당자`와 같은 패턴).

### 정책 요약

| 테이블 | SELECT | 쓰기 |
|---|---|---|
| `activity_host` | 교사/admin 전체 + **학생 전체**(동아리 목록은 공개해도 무방 — 명단은 별도 표) | INSERT=교사/admin, UPDATE·DELETE=`can_manage_activity_host` |
| `activity_host_member` | 교사/admin + 학생은 **같은 소속 명단까지**(`is_activity_host_member`) | `can_manage_activity_host` |
| `activity` | 교사/admin + 학생은 `visibility='school'` ∨ 본인 참여 | INSERT=교사/admin ∧ `created_by=auth.uid()`, 그 외 `can_manage_activity` |
| `activity_teacher` | 교사/admin + 활동을 볼 수 있는 학생 | `can_manage_activity` |
| `activity_participation` | 교사/admin + 본인 ∨ **같이 참여한 활동의 다른 참여자** | `can_manage_activity` |

**직원(staff)은 자동 차단**된다 — 정책이 `is_teacher_or_admin()`(teacher+admin)을 쓰고
`is_staff_teacher_or_admin()`을 쓰지 않기 때문이다. 학생 개인정보를 다루는 도메인이므로
의도한 결과다. 클라이언트 짝은 `TEACHER_ROLES` + `STAFF_BLOCKED_PREFIXES`의 `/activities`.

> **정책 안에서 자기 테이블(또는 서로를 참조하는 표)을 직접 조인하지 말 것.**
> `activity_host_member` SELECT 정책이 처음에 `EXISTS (SELECT 1 FROM activity_host_member ...)`로
> 자기 테이블을 다시 조회해 **42P17 infinite recursion**이 났다(마이그레이션
> `20260827092000`에서 수정). 판정은 반드시 SECURITY DEFINER 함수로 뺀다 —
> DEFINER가 RLS를 우회해 재귀를 끊는다. `activity_participation`이 같은 모양인데도
> 멀쩡했던 것은 `is_activity_participant()`가 처음부터 DEFINER였기 때문이다.
> approval 기능의 `can_view_approval_request`와 같은 패턴이다.

> **RLS 차단은 오류가 아니라 0행이다.** 모든 mutation은 `.select('id')` 반환 행으로
> 실제 반영을 확인한다. 확인하지 않으면 "저장됨"으로 보이면서 아무 일도 일어나지 않는다.

---

## 8. `club_info`와의 관계

시드 마이그레이션이 `club_info` 43개 → `activity_host`(kind='club') + 부원 623명 →
`activity_host_member`(2026학년도)로 옮겼다. 실측 결과 623명 전원이 `resource`에
연결됐고, 그중 5명은 전출·자퇴 상태다(**당시 소속이므로 보존**).

**`club_info`는 삭제하지 않는다.** issue-register의 봉사활동 동아리 확인서 발급이
여전히 그 표를 읽는다(`form_data.clubs[].club_id` → `club_info.id`).
`activity_host.meta.club_info_id`로 양쪽을 이어 두어 나중에 통합할 여지를 남겼다.

**활동(`activity`)은 옮기지 않았다** — `club_info`에는 활동 기록이 없다.
동아리가 무엇을 했는지는 이 시스템이 앞으로 쌓을 데이터다.

---

## 9. 인덱스

```
activity                  (academic_year, area) · host_id · lineage_parent_id
                          · starts_on DESC · created_by · meeting_id · GIN(keywords)
activity_host             owner_resource_id · created_by
activity_host_member      (host_id, academic_year) · student_code · student_resource_id
activity_participation    activity_id · student_code · student_resource_id
activity_teacher          teacher_resource_id
```

---

## 9-1. 실사용자 컨텍스트 검증 (2026-08-27)

`request.jwt.claims`를 실제 사용자로 세팅해 확인했다.

| 사용자 | activity_host | activity_host_member |
|---|---|---|
| 교사 (윤하준) | 43 | 623 |
| **직원 (권재윤)** | **0** | **0** — 차단 확인 |
| 학생 (00-00679, 방송부) | 43 | **18** — 자기 동아리 부원만 |
| admin | 43 | 623 |

쓰기 경로 종단 검증(생성 → 참여자 18명 등록 → 학생 열람 → 권한 없는 쓰기 거부 → 정리):

| 단계 | 결과 |
|---|---|
| 교사가 활동 생성 | ok |
| 소속 명단에서 참여자 일괄 등록 | 18명 |
| 참여 학생이 활동·동료 명단 열람 | 1건 / 18명 |
| **학생이 활동 생성 시도** | **거부 (42501)** |
| **학생이 참여자 삭제 시도** | **0행** |
| 교사가 활동 삭제 → 참여 기록 연쇄 삭제 | 1행 / 잔존 0행 |

---

## 10. 회귀 테스트

```
npx tsx scripts/creative-activities-test/run.mts     # 86건 — 라벨·계보·시수
```

순수 로직 3모듈(`utils/activityLabels.ts` · `lineage.ts` · `hours.ts`)은 React 비의존이라
Node 스크립트가 그대로 import한다(`dutyCsv.ts`·`swapBurden.ts` 선례).

---

## 11. `activity_post` · `activity_comment` — 성찰과 피드백 (Phase 2)

마이그레이션 `20260827100000_creative_activities_posts.sql` (+ `20260827101000` 졸업 보존 수정)

### `activity_post`

| 컬럼 | 설명 |
|---|---|
| `activity_id` → `activity` CASCADE | |
| `student_code` | **학생 글이면 채운다.** 교사 글은 NULL |
| `kind` | `reflection`(학생 성찰) / `log`(교사 기록) / `retrospective`(운영 회고) / `idea` |
| `title` / `content` | `content`는 공백만이면 CHECK가 거부 |
| `visibility` | `private`(본인+담당교사) / `participants`(**기본**) / `school`(전교 — 후배 아카이브) |
| `is_pinned` | |
| `author_profile_id` → `profiles` **SET NULL** | §11-1 참조 |

`CHECK (activity_post_author_shape)` — 성찰은 반드시 `student_code`를 갖고, 교사 글은 갖지 않는다.

### `activity_comment`

`post_id` CASCADE · `content` · `author_profile_id`(SET NULL) · `student_code`(학생 댓글이면).
**스레드 없이 평면**이다 — `collab_note_comments` 선례. 깊이가 필요할 만큼 긴 대화는 여기서 일어나지 않는다.

### 11-1. 졸업해도 글은 남는다 (2026-08-27 수정)

처음엔 `author_profile_id`를 **CASCADE**로 걸었는데, 졸업 처리(`process_graduated_student_cohort`)는
`profiles` 행을 **실제로 삭제**한다 — 라이브 실측: 졸업 리소스 237명 중 프로필 잔존 **7명**(230건 삭제).
그대로 두면 학생이 졸업하는 순간 성찰이 통째로 사라져 후배 아카이브의 전제가 깨진다.

→ **`ON DELETE SET NULL` + nullable**로 바꿨다(`20260827101000`). 학생 글의 신원은 `student_code`가
지고 이름은 `resource` 조인으로 얻으므로, 졸업 후에는 `YYYY입학NNN` 별칭으로 표시되고 글은 남는다.

> **이름 해석 경로가 둘이다.** 학생 → `resource`(student_code) · 교사 → `profiles`.
> `author_profile_id`로 학생 이름을 찾으면 **졸업생은 이름이 사라진다**(프로필이 없다).
> 단일 출처 = `services/activityPostService.ts`.

### 11-2. 판정 함수 · 정책

`can_view_activity_post(uuid)` (SECURITY DEFINER) — `activity_comment` 정책이 `activity_post`를
직접 조인하지 않게 뺀 판정. **정책 안에서 표를 직접 조인하지 않는다**는 규칙의 재적용이다.

| 표 | SELECT | INSERT | UPDATE / DELETE |
|---|---|---|---|
| `activity_post` | 작성자 ∨ 본인(student_code) ∨ `can_manage_activity` ∨ `school` ∨ (`participants` ∧ (교사 ∨ 참여자)) | 학생=자기 참여 활동의 자기 성찰만 · 교사=`can_manage_activity` 활동의 log/회고/아이디어 | 수정=작성자 / 삭제=작성자 ∨ `is_activity_manager` |
| `activity_comment` | `can_view_activity_post` | 같은 조건 ∧ 작성자=본인 | 수정=작성자 / 삭제=작성자 ∨ `is_activity_manager` |

**삭제를 담당교사에게 열지 않은 이유**: 학생 성찰을 담당교사가 지울 수 있으면
"학생이 자기 기록의 저자가 된다"는 약속이 깨진다. 중재가 필요하면 창체담당자·admin이 한다.

### 11-3. 실사용자 검증 (2026-08-27)

| 단계 | 결과 |
|---|---|
| 참여 학생이 성찰 작성 | ok |
| **학생이 교사용 `log` 작성** | **거부 (42501)** |
| **미참여 학생이 성찰 작성** | **거부 (42501)** |
| 담당교사 피드백 댓글 | ok |
| 학생이 자기 성찰·피드백 열람 | 1건 / 1건 |
| **`private` 글을 다른 학생이 열람** | **0건** |
| **남의 성찰 삭제 시도** | **0행** |
| 활동 삭제 시 글 연쇄 삭제 | 잔존 0 |

---

## 12. `activity_proposal` · `activity_interest` — 제안과 수요 (Phase 3)

마이그레이션 `20260828090000_creative_activities_proposals.sql`

### `activity_proposal`

| 컬럼 | 설명 |
|---|---|
| `title` / `body` | 공백만이면 CHECK가 거부 |
| `area` / `career_fields` / `target_year` | 희망 분류. 수락 시 활동 폼의 씨앗이 된다 |
| `parent_activity_id` → `activity` SET NULL | **이어가려는 기존 활동** |
| `proposer_profile_id` → `profiles` **SET NULL** | 졸업해도 제안은 남는다 |
| `proposer_student_code` | 학생 제안이면. 이름은 저장하지 않는다 |
| `status` | `submitted` / `reviewing` / `accepted` / `declined` |
| `review_note` / `reviewed_by` / `reviewed_at` | |
| `resulting_activity_id` → `activity` SET NULL | 수락해서 만들어진 활동 |

**계보가 이어지는 지점**: 수락으로 만든 활동의 `lineage_parent_id` = 제안의
`parent_activity_id`. 즉 **학생 제안이 계보의 마디가 된다** — 설계 문서의 "발전시켜
나간다"가 여기서 구현된다.

### `activity_interest`

`PRIMARY KEY (subject_type, subject_id, student_code)` · `subject_type` = `activity` | `proposal`.
**FK를 걸지 않는다** — 한 컬럼이 두 표를 가리킨다.

### 12-1. 관심은 개수만 공개한다

"몇 명이 관심 있는가"가 개설 판단·정원 산정의 근거이고 "누가"는 교사만 알면 된다.
그래서 SELECT는 **교사·admin 전체 + 학생은 자기 표시만**으로 좁히고, 개수는
`get_activity_interest_counts(text, uuid[])` DEFINER RPC가 낸다(authenticated에만 EXECUTE).

### 12-2. 검토 권한은 교사 전체다

`is_activity_manager()`(창체담당자)로 좁히지 **않았다**. Phase 1의 "처음부터 관문을
두면 아무것도 안 들어온다"와 같은 이유 — 제안을 아무도 안 보면 루프가 죽는다.

제안자는 **`submitted` 상태에서만** 자기 제안을 고칠 수 있고 상태를 옮길 수 없다
(정책의 USING·WITH CHECK가 둘 다 `status = 'submitted'`를 요구해 상태 탈출을 막는다).

| 표 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `activity_proposal` | **전원**(공개라야 관심이 모인다) | 본인 ∧ (학생이면 자기 학생코드) | (제안자 ∧ submitted) ∨ 교사 | (제안자 ∧ submitted) ∨ 창체담당자 |
| `activity_interest` | 교사·admin ∨ 자기 것 | 자기 학생코드만 | — | 자기 것만 |

### 12-3. 실사용자 검증 (2026-08-28)

| 단계 | 결과 |
|---|---|
| 학생 제안 작성 | ok |
| **남의 학생코드로 제안** | **거부 (42501)** |
| 다른 학생이 제안 열람 | 1건 (공개) |
| 다른 학생이 관심 표시 | ok |
| **학생이 보는 관심 행** | **1행**(자기 것만 — 명단 비노출) |
| 관심 개수 RPC | 1명 |
| 교사 검토(수락) | 1행 |
| **제안자의 수락 후 수정** | **0행** |
| 교사가 보는 관심 명단 | 1행 |

---

## 13. 알림 — `notification_events` (Phase 3)

창체는 소통 루프 A를 닫는 알림 3종을 보낸다. `type`은 텍스트 컬럼이고 CHECK가 없어
새 값을 쓰는 데 마이그레이션이 필요 없다.

| type | 방향 | 없으면 |
|---|---|---|
| `activity_reflection_requested` | 교사 → 참여 학생 | 학생은 이 기능의 존재를 모른다 |
| `activity_reflection_posted` | 학생 → 담당 교사 | 교사가 답할 계기가 없다 |
| `activity_feedback_received` | 교사 → 작성 학생 | 학생이 답을 못 본다 |

`related_meeting_id`는 **meeting FK라 쓸 수 없다** — 활동 id는 `meta.activity_id`에
담고 클릭은 `/activities?activity=<id>` 딥링크로 연결한다.

### 13-1. 학생이 알림을 못 받던 결함 (2026-08-28 수정)

`notification_events`의 SELECT/UPDATE/DELETE 정책이 `user_resource` 조인으로만
수신자를 판정했다. 그런데 **학생은 `user_resource`를 쓰지 않는다**(이메일 prefix ↔
`resource.meta->>'id'`). 실측: `user_resource` 75행 중 학생 링크는 **12행**뿐이라
학생 630명 중 **618명이 자기 앞으로 온 알림을 한 건도 볼 수 없었다**.
알림 행은 정상으로 만들어지고 오류도 안 나므로 "보냈는데 아무도 못 받는" 상태가
조용히 유지된다.

→ `owns_notification_resource(uuid)`(DEFINER)로 판정을 모으고 학생 경로를 더했다
(마이그레이션 `20260828100000`). **권한이 넓어지지 않는다** — 여전히 `resource_id`가
자기 리소스인 행만 읽는다. **이 수정은 알림을 쓰는 모든 기능에 적용된다.**

검증: 교사가 학생 2명에게 발송 → 학생이 보는 알림 **1건**(자기 것만) · 읽음 처리 1행
· **교사가 보는 학생 알림 0건**.

---

## 14. 공동 주최 · 학생 기록 (2026-08-28)

마이그레이션 `20260828110000_creative_activities_multi_host.sql` · `20260828120000_creative_activities_student_authoring.sql`

### 14-1. `activity_host_link` — 주최는 다대다다

하나의 활동을 **여러 동아리가 함께** 하는 경우가 실제로 있다(융합과학·화학·생물이 함께 연
과학 축전 부스). `activity.host_id`가 단일이라 한 곳만 고를 수 있었고 나머지는 "함께
주최했다"는 사실을 잃었다 — 주최 필터에서도 빠졌다.

| 컬럼 | 설명 |
|---|---|
| `activity_id` / `host_id` | 복합 PK |
| `role` | `primary`(대표) / `co`(공동) |

- **`activity.host_id`는 삭제했다.** 두 출처가 되면 화면마다 답이 갈린다.
- 대표는 활동당 하나 — 부분 UNIQUE `activity_host_link_one_primary`가 강제한다.
  **대표를 바꿀 땐 옛 대표를 먼저 `co`로 내려야** 23505가 나지 않는다(`setActivityHosts`가 그 순서로 한다).
- 주최 필터는 조인이라 **공동 주최도 잡힌다**. 단 `activity_host_link!inner`는 **필터할 때만**
  붙인다 — 항상 붙이면 주최 없는 개별 교사 활동이 목록에서 통째로 사라진다.

### 14-2. 학생 기록 — 게이트 3중

학생도 활동을 기록할 수 있다(사용자 결정). **동아리 활동만**이며, 위조를 막는 게이트가 셋이다.

| 게이트 | 강제 지점 |
|---|---|
| ① 영역 | `activity_insert` = `area='club'`, `activity_update` WITH CHECK로 편집도 차단 |
| ② 주최 | `can_link_activity_host` — 학생은 **자기가 그 해 소속된 동아리에만** 걸 수 있다 |
| ③ 참여자 | `can_add_activity_participant` — **그 주최 동아리의 부원만** |

**③이 ②에 의존한다.** 주최가 없으면 참여자 EXISTS가 비어 전부 거부되므로 주최 연결이
사실상 필수가 된다. 그래서 **앱은 주최를 참여자보다 먼저 저장한다**(`useCreateActivity`) —
순서가 바뀌면 참여자가 전부 거부된다.

> `WITH CHECK` 위반은 **0행이 아니라 42501 예외**로 온다(`USING`과 다르다).
> 클라이언트는 두 경우를 모두 사람이 읽을 말로 바꿔야 한다.

### 14-3. `can_manage_activity`에 주최 담당교사가 더해졌다

학생 기록을 열면서 드러난 공백이다. 종전 자격은 *활동 담당교사(`activity_teacher`) ∨ 생성자
∨ 창체담당자*뿐이라, **학생이 만든 활동을 그 동아리 담당교사가 손댈 수 없었다.**
학생 기록은 교사가 검토·교정할 수 있어야 의미가 있으므로
**주최의 `owner_resource_id`** 갈래를 더했다. 교사 전체로 넓히지는 않았다 — 남의 활동을
아무나 고치는 것은 다른 문제다(실측: 무관한 교사의 수정 0행).

### 14-4. 실사용자 검증 (2026-08-28)

| 단계 | 결과 |
|---|---|
| 학생의 동아리 활동 생성 | ok |
| **학생의 비동아리 영역 생성** | **거부 (42501)** |
| 자기 동아리 주최 연결 | ok |
| **남의 동아리 주최 연결** | **거부 (42501)** |
| 부원을 참여자로 | 18명 |
| **외부 학생 참여자 등록** | **거부 (42501)** |
| **학생의 영역 변경** | **거부 (42501)** |
| 학생이 자기 활동 수정 | 1행 |
| **주최 담당교사의 교정** | **1행** |
| 담당교사의 공동 주최 연결 | 2개 주최 |
| **무관한 교사의 수정** | **0행** |
| **대표 주최 중복** | **거부 (23505)** |

**기존 데이터 수정 확인**: 스키마 전환 후에도 기존 활동 4건을 작성자(admin)가 열람·내용
수정·주최 연결·영역 변경 모두 정상 수행(검증 후 원복).

### 14-5. 중복 활동 — 답이 두 가지다

같은 이름의 활동을 만들려 하면 화면이 알린다. **같은 학년도면 합류**(그 활동에 주최·참여자를
더한다), **지난 학년도면 이어받기**(계보 연결). 활동을 하나 더 만드는 것은 둘 다 아니다 —
목록이 갈라지고 계보·참여 집계가 어긋난다. 정규화·판정은 `utils/activityDuplicates.ts`
(공백·괄호·연도·회차·계보 접미 제거).

---

## 15. 보류 — Phase 4 (2026-08-28 사용자 결정)

**인사이트 대시보드·생기부 초안 생성은 구현하지 않는다.** 스키마 구현은 Phase 3에서 끝났다.

지표 설계가 틀려서가 아니라 **읽을 재료가 아직 없어서**다 — 활동·성찰이 쌓인 뒤에야
의미가 생기는 화면이라, 지금 만들면 전부 0으로 나온다.

되살릴 때 필요한 것은 `docs/creative-activities-plan.md` §7(8지표 정의)과 §9 Phase 4 표에
남겨 두었다. 새 테이블은 필요 없고 MV `activity_participation_flat` 하나면 시작할 수 있다
(`activity_participation` × `activity`를 학생코드·연도·영역·시수·성찰 수로 평탄화).

---

## 탐구 GraphRAG (`inquiry_*`, 2026-09-10 신설)

생기부를 분절·판정해 그래프로 묶은 결과를 담는다. **방법론 = 스킬 `/inquiry-graphrag`**,
설계·측정값 = `docs/features/creative-activities-graphrag.md`, 파이프라인 = `scripts/inquiry-graphrag/`.

### 왜 `activity` 와 별도인가

`activity` 는 **"학교가 연 활동 1건 + 참여자 N명"** 모델이고, 여기 담는 것은
**"학생이 각자 한 탐구"** 다(실측 93%가 개인 단위). 합치면 어느 한쪽이 왜곡된다.
`student_detailed_activities.id` 를 FK 로 잇되 원문은 그쪽에 그대로 둔다.

### 표

| 표 | 행 | 담는 것 |
|---|---|---|
| `inquiry_activity` | 52,246 | 분절된 활동 + 판정(33,026건). PK = `act:<record_id>#<첫문장>` |
| `inquiry_concept` | 88,516 | 정규화 개념(노드 승격 23,754 = df≥2 ∧ trait 아님) |
| `inquiry_activity_concept` | 236,930 | 활동↔개념, `weight` = IDF |
| `inquiry_edge` | 18,083 | SIMILAR_TO · DEEPENED_FROM · RELATED_TO · DUPLICATE_OF |
| `inquiry_theme` | 459 | Leiden 주제군 + E6 보고서. **PK = (graph, id)** |
| `inquiry_theme_member` | 9,260 | 주제군↔활동 |
| `inquiry_activity_type` | 289 | 활동 유형(students≥3) + 연도 간 프로그램 |
| `inquiry_activity_type_member` | 1,638 | 유형↔활동 |
| `inquiry_activity_public` | 뷰 | 학생·교사 화면용 — **`student_code` 없음** |

### 반드시 함께 읽어야 하는 컬럼

- **`inquiry_activity.n_sentences`** — 탐구 인정률이 1문장 26% → 4문장 이상 78% 로 갈린다.
  수준만 보면 **"깊이가 없는 활동"과 "판단할 재료가 없는 활동"이 구분되지 않는다.**
- **`inquiry_theme.mean_sentences`** — 같은 이유로 주제군 카드는 심화 비율과 이 값을 함께 낸다.
  **심화 비율만으로 정렬하지 말 것**(길게 적히는 과학 실험이 위로, 짧게 적히는 행사가 아래로 몰린다).
- **`inquiry_activity.seg_model`** — 같은 문장 수에서도 분절 모델에 따라 판정이 갈린다.
  코호트 간 비교는 이 값을 고정하거나 함께 밝힐 것.

### `graph` 가 주제군 키에 들어가는 이유

전체 그래프와 창체 전용 그래프가 `t:0`·`T:0` 을 **각각** 쓴다. id 만으로는 충돌해 한쪽이 덮인다.

- `graph='club'` — 창체 3영역만(리프 438 · 상위 21 · 잡탕 4.5%). **창체 화면이 쓴다.**
- `graph='full'` — 세특 포함(리프 1,568 · 상위 40). "이 개념을 세특에서도 다뤘다"는 교차 연결용.

### 권한

**쓰기 정책이 없다** — 적재는 service role(파이프라인)만.

- `inquiry_activity` SELECT = **`is_teacher_or_admin`**(직원 제외 — 생기부 본문이다)
- 나머지 표 SELECT = 로그인한 사람 전부(사람이 특정되지 않는 구조 정보)
- **`inquiry_activity_public`** = 학생·교사용. `security_invoker=false` 라 RLS 를 우회하므로
  **뷰의 `where` 가 스스로 판정한다** — `is_teacher_or_admin(auth.uid()) or current_student_code() is not null`.
  직원은 둘 다 아니라 **0행**을 받는다. `grant to authenticated` 만 두면 직원까지 열린다.
  자기 활동은 `is_mine` 으로 표시되고 `is_inquiry` 인 것만 나온다.

### 적재

```bash
npx tsx scripts/inquiry-graphrag/load-db.mts --graph graph-club --graph-name club \
  --theme-wave theme-club --top-wave topic-club
npx tsx ... --only activities     # 재판정만 반영
```

**멱등이다** — 전부 upsert 이고 키가 결정적이라 몇 번 돌려도 같고 중간에 끊겨도 이어서 돌린다.

**⚠️ 활동 id 가 고유하지 않다** — `act:<record_id>#<첫문장번호>` 인데 한 기록에서 두 활동이
같은 문장에서 시작하면 겹친다(실측 10건 · 22행). 적재기가 **그룹째 제외**하고 명단을 로그에 남긴다.
하나를 고르지 않는 이유는 판정도 이미 하나만 남아 **어느 활동의 것인지 알 수 없기** 때문이다.
근본 수정은 id 에 순번을 넣는 것이고 다음 재추출 때 함께 한다.

**임베딩 인덱스는 아직 만들지 않았다** — 행이 다 들어온 뒤에 만들어야 ivfflat 리스트가 제대로 잡힌다.
