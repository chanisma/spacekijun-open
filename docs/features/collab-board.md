# 협업 보드 (`/collab`, `/student-collab`)

포스트잇 보드. 교사끼리도 쓰고 **교사가 학생을 초대해 함께** 쓴다.
화면은 교사용(`CollabBoard`/`BoardDetail`)과 학생용(`StudentCollabBoard`/`StudentBoardDetail`)
두 벌이지만 **데이터·훅·RLS 는 하나**다.

## 표

| 표 | 뜻 |
|---|---|
| `collab_boards` | 보드. `created_by` = **resource.id**(auth uid 아님), `visibility` 3종, 아카이브 |
| `collab_board_members` | 멤버. `user_id` = **resource.id**. `role` = owner / editor / viewer |
| `collab_notes` | 포스트잇. `author_id` = resource.id, `meta.card_type`/`card_data` 로 카드 종류 |
| `collab_note_comments` | 노트 댓글 |

**세 표 모두 사람을 `profiles.id` 가 아니라 `resource.id` 로 가리킨다.** 그래서
"지금 로그인한 사람의 resource.id" 를 구하는 단계가 모든 읽기·쓰기의 앞에 있고,
이 기능의 사고는 전부 그 한 단계에서 났다.

## 공개 범위 3종

| `visibility` | 읽기 | 쓰기 |
|---|---|---|
| `public` (전체 공개) | 로그인 사용자 전체 | 로그인 사용자 전체 |
| `read_only` (부분 공개) | 로그인 사용자 전체 | **소유자·멤버만** |
| `private` (비공개) | 소유자·멤버만 | 소유자·멤버만 |

판정 단일 출처는 **DB 함수** `can_view_collab_board(uuid)` / `can_write_collab_board(uuid)`
(노트 경유는 `can_view_collab_note` / `can_write_collab_note`). 정책은 이 함수만 부른다.

**목록 화면의 필터는 이보다 좁다.** 학생 목록은 `public ∨ 내 보드 ∨ 내가 멤버`만 보여
`read_only` 교사 보드가 630명의 목록을 채우지 않게 한다(서버는 읽기를 허용하므로
주소를 직접 열면 읽히긴 한다 — 의도된 상태다).

## ★ 학생 신원은 `user_resource` 에 없다 (2026-09-09)

**증상**: 교사가 학생을 초대했는데 **학생 화면에 보드가 하나도 안 뜬다.**
오류도 빈 화면도 아니고 목록이 그냥 비어 있어 "아직 안 만들어졌나" 로 보인다.

**원인**: 종전 정책 13개가 전부 "나"를 이렇게 판정했다.

```sql
resource_id in (select resource_id from user_resource where user_id = auth.uid())
```

그런데 **학생은 `user_resource` 를 쓰지 않는다**(이메일 prefix ↔ `resource.meta->>'id'`).
실측 재학생 630명 중 링크 보유 **12명**, 초대된 학생 9명은 **전원 미보유**.
학생에게 이 부분질의는 늘 빈 집합이고, SQL 은 오류가 아니라 **`false`** 를 낸다.

연쇄가 이렇게 갔다 — `collab_boards` SELECT 는 `auth.uid() is not null` 이라
보드 행 자체는 보였지만, `collab_board_members` SELECT 가 막혀 **학생이 자기
멤버십 행조차 못 봤다**. 목록 필터의 `members.some(나)` 가 영원히 거짓이 되고,
라이브 보드 6개 중 `public` 이 하나도 없어 결과가 0개가 됐다.

**같은 원인으로 쓰기도 전부 막혀 있었다** — 클라이언트의 보드/노트/댓글 생성이
`user_resource ... .single()` 을 직접 조회해 학생에게 PGRST116 으로 터졌다
(`User resource not found. Please connect your profile first.`).

**고친 방법**

- DB: **`collab_actor_resource_ids()`**(SETOF uuid, DEFINER) 하나로 신원 해석을 통일했다 —
  `user_resource` 링크 **와** 이메일 prefix 로 찾은 학생 resource 를 함께 낸다.
  정책 13개와 `is_board_owner()` 가 전부 이걸 쓴다. 마이그레이션
  `20260909171419` / `20260909171443`.
- 클라이언트: 세 쓰기 경로가 **`unifiedAuth.getCurrentResourceId()`** 를 쓴다.
  이 함수는 처음부터 학생 폴백을 갖고 있었는데 collab 훅만 표를 직접 읽고 있었다.

**판정은 반드시 SECURITY DEFINER 함수로 뺄 것.** 정책 안에서 `collab_board_members` 를
직접 조인하면 **42P17 무한 재귀**가 난다(멤버 정책 → 보드 → 멤버). 이 표의 정책이
2025-10 에 그 이유로 여섯 번 고쳐진 이력이 있다(`fix_collab_board_members_infinite_recursion` 등).
DEFINER 가 RLS 를 우회해 고리를 끊는다 — 창체 `is_activity_host_member`, 결재
`can_view_approval_request` 가 같은 이유로 존재한다.

## 함께 바뀐 것 2가지

- **`collab_board_members` SELECT 가 넓어졌다**: 종전 "내 행 ∨ 내가 소유자" → **"그 보드를 볼 수 있으면 멤버 명단을 본다"**.
  멤버 수 배지·아바타·초대 확인이 전부 이 행에 달려 있어, 좁히면 초대받은 본인에게도 보드가 사라진다(=이 사고).
- **노트·댓글 INSERT 에 `author_id` 검증이 붙었다**: 종전엔 `board_id` 만 봐서 **남의 이름으로 글을 쓸 수 있었다.**
  학생에게 쓰기가 열리는 지금 실재하는 위험이라 함께 막았다.
- **학생에게는 `collab_boards` SELECT 가 좁아졌다**: 교직원(`is_staff_teacher_or_admin`)은 종전대로 전부 열람해
  비공개 보드도 잠금 배지로 목록에 남지만(기존 UX 유지), 학생은 볼 수 있는 보드만 받는다.
  교사 내부 보드 제목이 API 로 630명에게 새지 않게 한다.

## 검증 (2026-09-09, 실사용자 컨텍스트)

라이브에서 `set local role authenticated` + 실제 `auth.uid()` 로 시뮬레이션했다.

| 시점 | 보드 | 멤버 행 | 노트 | 쓰기 |
|---|---|---|---|---|
| 초대된 학생 — **고치기 전** | 6 (전부) | **0** | 6 | ✗ |
| 초대된 학생 — 고친 뒤 | 2 (볼 수 있는 것만) | 10 | 6 | **✓** |
| 초대 안 된 학생 | 2 (read_only) | — | 6 | ✗ |
| 일반 교사 | 6 (변화 없음) | 28 | 6 (변화 없음) | 종전과 동일 |
| 보드 소유자·admin | 6 | 33 | 15 | ✓ |
| 익명(anon) | 0 | 0 | 0 | ✗ |

종단 쓰기도 실제로 넣었다 확인 후 되돌렸다 — 학생이 노트 작성·댓글·수정·삭제를
모두 수행했고 전후 행 수가 동일하다(노트 15·댓글 23·보드 6·멤버 33).

**익명 호출에 3값 논리 구멍이 없다**: `can_view_collab_board` 는 `auth.uid() is not null and exists(...)`
로 시작해 `auth.uid()` 가 NULL 이면 진짜 `false` 를 낸다(NULL 이 아니다). 존재하는 보드와
없는 보드가 **똑같이 false** 라 존재 여부조차 새지 않는다. `revoke execute ... from anon` 은
이 저장소에서 **no-op** 이다(anon 접근이 PUBLIC 그랜트에서 온다 — CLAUDE.md 2026-09-04 기록) →
방어는 함수 본문의 가드가 한다.

## ★★ 학생의 보드 생성 실패 — 범인은 INSERT 정책이 아니라 SELECT 정책이다 (2026-09-12)

**증상**: 학생이 협업 보드를 만들면 `42501 new row violates row-level security policy for
table "collab_boards"`. 교직원은 멀쩡하다. 위 2026-09-09 수정 이후에도 남아 있었다.

**오류 문구가 범인을 잘못 가리킨다.** 문장이 "new row violates ... policy" 라 `create_boards`
(INSERT 정책)를 고치러 가게 되는데 **거기엔 고칠 것이 없다** — 실측으로 그 정책은 통과한다:

| 경로 | 결과 |
|---|---|
| `insert into collab_boards ...` (RETURNING 없음) | **OK** |
| `insert into collab_boards ... returning id` | **42501** |
| 정책식 `auth.uid() is not null and created_by in (select collab_actor_resource_ids())` 수동 계산 | **true** |

**원인**: PostgreSQL 은 `INSERT ... RETURNING` 에 **SELECT 정책을 추가 WITH CHECK 로 새 행에
적용**한다. 즉 쓰기가 허용돼도 *방금 넣은 행을 읽을 수 없으면* INSERT 전체가 죽는다.
클라이언트는 `useCreateBoard` 에서 `.insert({...}).select().single()` 이므로 정확히 이 형태다.

그런데 그 SELECT 정책의 학생 분기가 `can_view_collab_board(id)` 였고, 이 함수는
**STABLE SECURITY DEFINER 로 `collab_boards` 를 `id` 로 다시 읽는다**. STABLE 은 문장 시작
시점 스냅샷을 보므로 **삽입 중인 그 행이 아직 없다** → `false`. 정책이 **자기 테이블을
되읽는** 구조라서 생기는, 오류 없이 조용한 실패다.

**교직원이 멀쩡했던 이유가 곧 학생만 터진 이유다** — 첫 분기
`is_staff_teacher_or_admin(auth.uid())` 는 행을 보지 않고 참이 되어 통과한다. 그래서
개발·검수는 교직원 계정으로 하고 사고는 학생에게서만 난다.

**수정** (`20260912120000_collab_board_insert_returning_visibility.sql`): "내가 만든 보드" 를
**새 행의 컬럼만으로 판정되는 분기**로 SELECT 정책에 세운다. `created_by` 는 함수에 넘기는
`id` 와 달리 새 튜플의 값으로 직접 평가되므로 스냅샷과 무관하다.

```sql
create policy view_all_boards on public.collab_boards
for select using (
  auth.uid() is not null
  and (
    public.is_staff_teacher_or_admin(auth.uid())
    or created_by in (select public.collab_actor_resource_ids())  -- ← 새 행에도 성립
    or public.can_view_collab_board(id)
  )
);
```

**권한은 조금도 넓어지지 않는다.** `can_view_collab_board` 가 이미
`b.created_by in (select collab_actor_resource_ids())` 를 분기로 갖고 있어, 새 분기는 기존 행에
대해 **논리적 부분집합**이다. 달라지는 것은 오직 "함수가 아직 볼 수 없는 행에 대해 판정이
가능해진다" 뿐이다. 실측(학생 3명)으로 가시 보드 수가 **old = new = 2** 로 동일했고 교직원은
종전대로 전체 7개를 본다.

**같은 함정이 다른 표로 번지지 않는 이유**: `collab_notes`·`collab_board_members` 의 SELECT
정책은 `board_id`/`note_id` 로 **이미 커밋된 다른 행**을 읽으므로 RETURNING 시점에도 정상적으로
보인다. 자기 테이블을 되읽는 것은 `collab_boards` 뿐이다. 실측 확인: 학생이 비공개 보드 생성 →
소유자 멤버 행 → 그 보드에 노트 작성(RETURNING 포함)까지 전부 OK.

**규칙**: 정책 판정 함수에 **그 행의 id 만 넘겨 테이블을 되읽는 형태**는, 그 테이블에
`INSERT ... RETURNING` 이 있으면 반드시 깨진다. 이런 정책에는 **새 행의 컬럼으로 직접
판정되는 분기**를 함께 둘 것.

## 보드 카테고리 (2026-09-18)

보드가 늘면서 목록을 묶어 볼 축이 필요해졌다. **미리 정해진 목록에서 고르게 하면
쓸모가 없다**는 것이 출발점이라 카테고리는 **자유 입력**이고, 한 번 만들어진 이름은
다른 사람도 고를 수 있다.

**표를 만들지 않았다.** 정본은 `collab_boards.meta.category` 하나뿐이고 선택지는
그때그때 "실제로 쓰이고 있는 카테고리"에서 유도한다. 카탈로그 표를 두면 아무 보드도
쓰지 않는 유령 카테고리를 누군가 치워야 하고, 그 청소 화면이 또 필요해진다.
마지막 보드가 카테고리를 바꾸면 그 이름은 저절로 사라진다.

**두 카탈로그가 다르다 — 섞지 말 것.**

| 자리 | 모집단 | 왜 |
|---|---|---|
| 보드 만들기·수정 다이얼로그 | `useCollabBoards()` 가 준 **전부** | 남이 만든 이름을 고를 수 있어야 한다 |
| 목록 화면 필터 칩 | **지금 목록에 보이는 보드** | 요구사항 "활성화된 보드의 카테고리만" — 눌러도 0건인 칩이 생기면 안 된다 |

칩 모집단에 **검색어는 반영하지 않는다**. 타이핑할 때마다 칩이 사라지면 고르려던 것을 놓친다.

- 판정·정규화 단일 출처 = `src/lib/collabCategories.ts`
- 선택 UI = `BoardCategorySelect`(고르기와 만들기가 한 칸), 필터 UI = `BoardCategoryFilter`
- **정규화가 핵심이다**: `수업` / `수업 ` / `수 업` 이 서로 다른 칩 세 개가 되는데
  화면에서는 거의 같아 보인다. 저장·필터·카탈로그가 **같은 `normalizeCategory`** 를 거친다.
- 정렬 = 개수 내림차순 → 가나다. 개수가 앞이라 자주 쓰는 카테고리가 «+N» 뒤로 숨지 않는다.
  동점에 가나다를 넣지 않으면 칩이 새로고침마다 자리를 바꾼다.

**헤더 UI = 칩 줄 + [+N] 팝오버** (2026-09-18 사용자 선택). 앞 5개만 펴고 나머지는 접는다 —
카테고리 개수에 상한이 없어 전부 펴면 모바일에서 헤더가 두세 줄이 된다.
**고른 칩은 접힌 채로 두지 않는다**: [+N] 안에서 고른 카테고리가 숨어 있으면 목록은
걸러졌는데 "무엇으로 걸렀는지"가 화면 어디에도 없어 보드가 사라진 것처럼 보인다 →
선택된 항목이 마지막 슬롯과 자리를 바꾼다.

`BoardHeader` 는 제목 줄 **아래** 한 줄짜리 `filterSlot` 을 받는다(list = 카테고리 칩,
detail = 색 범례). 오른쪽 액션 줄에 끼우지 않는 이유는 둘 다 항목 수가 데이터를 따라
늘어나 검색창·버튼을 밀어내기 때문이다. 슬롯이 비면 줄 자체가 사라져 헤더 높이가 그대로다.

## 노트 색 팔레트와 범례 (2026-09-18)

보드 관리자가 **색을 자유롭게(RGB) 정하고 그 색에 이름을 붙인다**. 이름 붙은 색은
상세 헤더의 범례가 되고, 범례를 누르면 그 색 노트만 보인다. 이름 없는 색도 그대로
쓸 수 있고, **같은 색은 두 번 쓸 수 없다**(한 색이 두 뜻을 가지면 색 필터가 어느 쪽인지
답할 수 없다).

저장 = `collab_boards.meta.note_palette` = `[{ color: '#rrggbb', label?: string }]`.
설정이 없으면 **옛 7색**으로 떨어져 기능을 켜기 전과 화면이 같다.

### ★ 색 값이 두 모양으로 공존한다 — 반드시 정규화할 것

`collab_notes.color` 는 text 다. 옛 노트는 `'yellow'` 같은 **이름**(2026-09-18 실측:
라이브 25행 전부 이름), 새 노트는 `'#fff176'` 같은 **hex**. 일괄 마이그레이션은 하지
않았다 — 읽기가 둘 다 받으므로 수정된 노트부터 자연히 hex 가 된다.

그래서 **`note.color` 를 직접 비교하지 말고 `normalizeNoteColor()` 를 거칠 것.**
`'yellow' === '#fff176'` 은 false 지만 둘은 같은 색이다. 이걸 빠뜨리면
①범례 필터가 **영원히 0건** ②색별 개수가 같은 색을 **둘로** 센다 — 둘 다 오류가 아니다.

### 그라데이션은 계산으로 얻는다

옛 클래스 `from-[#e3f2fd] to-[#90caf9]` 를 재 보면 밝은 쪽이 **base 를 흰색과 75% 섞은 값**과
채널당 1 안쪽으로 겹친다(계산 `#e3f2fe`, 실제 `#e3f2fd`). 옛 값은 Material 팔레트에서
손으로 고른 것이라 완전히 같지는 않지만 그 차이는 안 보인다. 그래서 자유 색도 같은
공식으로 만들면 기존 노트와 한 벌로 보인다. 회귀는 "정확히 같다"가 아니라 **채널당 2 이내**로
못 박는다(전자는 거짓이다).

**Tailwind 임의 클래스(`from-[#…]`)는 빌드 시점에 스캔**되므로 런타임 hex 에는 쓸 수 없다 —
인라인 style 이 유일한 길이다. 그래서 노트 카드의 배경·테두리·글자색이 전부 인라인이다.

### 글자색은 계산한다 (자유 색의 대가)

`readableInk(base)` 가 slate-900 과 흰색 중 대비가 큰 쪽을 고른다. 판정은 그라데이션의
**어두운 끝(base)** 으로 한다 — 밝은 끝에서만 맞으면 카드 아래쪽 글자가 읽히지 않는다.

**남은 한계(알고 두는 것)**: 노트 카드 **안쪽**에 `text-muted-foreground` 같은 고정
클래스를 쓰는 자리가 있어, 아주 어두운 색을 고르면 본문은 읽혀도 보조 텍스트 대비가
떨어진다. 그래서 팔레트 편집 모달이 **미리보기와 «글자 대비 낮음» 경고**를 그 자리에서
보여 준다. 막지는 않는다 — 자유 색이 이 기능의 요구였다.

### 색 목록은 네 화면이 공유한다

종전엔 색 배열이 `AddNoteCard`·`StickyNote`·학생용 2벌에 **복붙**돼 있었다. 하나만 고치면
같은 보드가 교사 화면과 학생 화면에서 다른 색 목록을 낸다. 지금은 `NoteColorPicker`
하나가 보드 팔레트를 받아 그린다.

### 편집 모달의 함정

팔레트 편집 모달의 초기화 effect 를 `[open, palette]` 로 두면 **부모가 다시 그릴 때마다**
(노트 높이 측정, 쿼리 갱신) palette 배열의 정체가 바뀌어 **편집 중인 입력이 통째로
되돌아간다**. 오류는 없고 "글자를 치면 사라진다"로만 보인다. 지금은 `open` 이 false→true 로
바뀌는 순간에만 초기화하고, 상세 페이지도 `useMemo(..., [board?.meta])` 로 정체를 고정한다.

## 접근 판정 단일 출처 + 비공개 보드 숨김 (2026-09-18)

**목록에서 들어갈 수 없는 비공개 보드를 뺀다** (사용자 결정). 종전엔 교사에게 남의
비공개 보드가 잠금 배지를 달고 보였다 — 의도한 동작이었지만 누를 수 없는 카드가
목록을 채우고 제목만 드러내 쓸모보다 잡음이 컸다.

**서버(RLS)는 종전대로 교직원에게 전부 내려 준다** (같은 결정에서 "화면에서만" 선택).
즉 API 응답에는 남의 비공개 보드 제목이 여전히 들어 있고, 거르는 것은 클라이언트다.
서버까지 좁히려면 `view_all_boards` 의 `is_staff_teacher_or_admin` 분기를 손봐야 하는데
그건 권한 변경이고 admin 의 남의 보드 관리·공지 링크 검사 동작이 함께 바뀐다.

**⚠ 라이브 실측(2026-09-18): 보드 7개 중 `private` 6 · `read_only` 1 · `public` 0.**
즉 이 필터가 켜지면 초대되지 않은 교사의 목록은 거의 빈다. 버그가 아니라 이 결정의
직접적인 결과다 — 그래서 빈 목록에 "왜 비었는지"를 말하는 빈 상태를 함께 넣었다.

그리고 종전에 화면 4곳 + 공지 픽커에 복붙돼 있던 판정을 **`src/lib/collabBoardAccess.ts`**
한 벌로 합쳤다(상세 2곳은 소유자를 빼먹은 채 `useCollabBoard` 가 소유자를 멤버 목록에
합성해 넣어 **우연히** 동작하고 있었다). 목록·상세 두 조회 모양을 위한 어댑터가 함께 있다.

## 회귀

`npx tsx scripts/collab-student-access-test/run.mts` (24건) — 학생 접근
`npx tsx scripts/collab-category-color-test/run.mts` (121건) — 카테고리·노트 색·접근 판정

뒤쪽이 잡는 것 = 색 값 두 모양의 정규화(이름 노트 ↔ hex 범례가 서로 걸리는가) ·
그라데이션 공식이 옛 색감과 채널당 2 이내인가 · 글자 대비 4.5:1 · 팔레트 중복·상한 ·
카테고리 정규화와 카탈로그 정렬 · 접근 술어 진리표, 그리고 정적 검사로
**색 배열이 네 화면에 되살아나는가** · 목록이 접근 불가 보드를 거르는가 ·
색 집계 전에 정규화하는가 · `meta` 를 병합 없이 덮어쓰는가 ·
보드 다이얼로그의 `DialogContent` 에 `overflow-hidden` 이 돌아왔는가.

이 사고는 **오류를 내지 않으므로** 정적 검사가 유일한 방어선이다. 잡는 것 =
클라이언트 쓰기 경로의 `user_resource` 직접 조회 · `collab_actor_resource_ids()` 를
쓰지 않는 새 collab 정책 · 헬퍼 함수의 `auth.uid()` 가드 누락 · INSERT 의 `author_id` 검증 누락.
그리고 **보드 SELECT 정책의 `created_by` 분기 누락**(= 위 2026-09-12 사고. 정책은 나중
마이그레이션이 덮어쓸 수 있으므로 **마지막 정의**를 찾아 검사한다 — 파일 하나만 보면
누가 옛 형태로 되돌려도 통과한다) · 클라이언트가 `.insert().select()` 형태를 유지하는지
(이것이 그 정책 요구의 근거라, 근거가 사라지면 함께 다시 적어야 한다).

## 남아 있는 것 (미수정, 알고 두는 것)

- **admin 은 남의 보드를 관리할 수 없다.** 화면은 `canManage = isAdmin || isOwner` 라
  admin 에게 [보드 수정]·[삭제] 메뉴를 보여주는데 RLS 는 **소유자 전용**이라 조용히 실패한다.
  이번 변경 이전부터 그랬고, 권한을 넓히는 것은 별도 결정이라 손대지 않았다.
- **접근 판정이 화면 4곳에 복붙돼 있다**(`CollabBoard`·`StudentCollabBoard`·`BoardDetail`·`StudentBoardDetail`).
  상세 2곳은 `hasViewAccess` 에 소유자를 빼먹었는데, `useCollabBoard` 가 소유자를 멤버 목록에
  합성해 넣어 우연히 동작한다. 서버 판정(`can_view_collab_board`)과 뜻은 같지만 단일 출처가 아니다.

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

#### 협업 보드 (`src/components/collab/`, 학생 접근 2026-09-09 수정)
- 포스트잇 보드. **교사가 학생을 초대해 함께 쓴다** — 화면은 교사용(`/collab`)·학생용(`/student-collab`) 두 벌이지만 표·훅·RLS 는 하나다. 사람은 `profiles.id` 가 아니라 **`resource.id`** 로 가리킨다(`created_by`·`collab_board_members.user_id`·`author_id` 전부)
- **공개 범위 3종**: `public`=전원 읽기·쓰기 / `read_only`=전원 읽기·**멤버만 쓰기** / `private`=멤버만. 판정 단일 출처는 **DB 함수** `can_view_collab_board(uuid)`·`can_write_collab_board(uuid)`(+노트 경유 2종)이고 정책은 이 함수만 부른다
- **★ 학생 신원은 `user_resource` 에 없다 (2026-09-09 사고)**: 정책 13개가 전부 `resource_id in (select resource_id from user_resource where user_id = auth.uid())` 로 "나"를 판정했는데 **학생은 그 표를 쓰지 않는다**(이메일 prefix ↔ `resource.meta->>'id'` — 실측 재학생 630명 중 링크 12명, 초대된 학생 9명 전원 미보유). 학생에게 이 집합은 항상 비고 SQL 은 오류가 아니라 **조용히 false** 를 낸다 → `collab_board_members` 가 막혀 **초대받은 학생이 자기 멤버십 행조차 못 봤고**, 목록 필터의 `members.some(나)` 가 영원히 거짓이라 보드가 통째로 사라졌다(빈 목록이라 "아직 안 만들어졌나" 로 보인다). 같은 원인으로 클라이언트 쓰기 3경로도 `user_resource ... .single()` 이라 PGRST116 으로 터졌다. **수정 = 신원 해석을 `collab_actor_resource_ids()`(DEFINER, 링크+학생 폴백) 하나로 통일**하고 클라이언트는 `unifiedAuth.getCurrentResourceId()` 를 쓴다
- **판정은 반드시 SECURITY DEFINER 함수로 뺄 것** — 정책 안에서 `collab_board_members` 를 직접 조인하면 **42P17 무한 재귀**가 난다(2025-10 에 이 이유로 여섯 번 고친 이력이 있다). 창체 `is_activity_host_member`·결재 `can_view_approval_request` 와 같은 이유
- 함께 바뀐 것: 멤버 SELECT 를 **"보드를 볼 수 있으면 명단을 본다"** 로 넓혔고(좁히면 초대받은 본인에게 보드가 사라진다 = 이 사고), 노트·댓글 INSERT 에 **`author_id` 검증**을 붙였으며(종전엔 남의 이름으로 글을 쓸 수 있었다), **학생에게만** `collab_boards` SELECT 를 좁혔다(교직원은 종전대로 전부 열람 — 기존 잠금 배지 UX 유지)
- **★★ `INSERT ... RETURNING` 은 SELECT 정책도 통과해야 한다 — 학생 보드 생성 실패 (2026-09-12)**: 위 수정 뒤에도 학생만 보드 생성이 `42501 new row violates row-level security policy` 로 죽었다. **범인은 INSERT 정책이 아니다** — 실측으로 `insert`(RETURNING 없음)는 **통과**하고 `insert ... returning` 만 죽으며, INSERT 정책식을 손으로 계산하면 `true` 다. PostgreSQL 이 `INSERT ... RETURNING` 에 **SELECT 정책을 추가 WITH CHECK 로 새 행에** 적용하기 때문이고, 클라이언트가 `.insert().select().single()` 이라 늘 이 형태다. 그런데 그 SELECT 정책의 학생 분기 `can_view_collab_board(id)` 는 **STABLE SECURITY DEFINER 로 `collab_boards` 를 id 로 다시 읽는데**, STABLE 은 문장 시작 스냅샷을 보므로 **삽입 중인 그 행이 없다** → false. **교직원이 멀쩡했던 이유가 곧 학생만 터진 이유다** — `is_staff_teacher_or_admin(auth.uid())` 분기는 행을 보지 않고 참이 되어 통과한다(개발은 교직원 계정으로 하고 사고는 학생에게서만 난다). **수정 = SELECT 정책에 `created_by in (select collab_actor_resource_ids())` 분기 추가** — `created_by` 는 새 튜플의 값으로 직접 평가돼 스냅샷과 무관하다. **권한은 넓어지지 않는다**(`can_view_collab_board` 가 같은 조건을 이미 분기로 갖고 있어 기존 행에 대해 논리적 부분집합 — 학생 3명 실측 가시 보드 수 old = new). **일반 규칙: 정책 판정 함수에 그 행의 id 만 넘겨 테이블을 되읽는 형태는, 그 테이블에 `INSERT ... RETURNING` 이 있으면 반드시 깨진다** — 이런 정책에는 새 행의 **컬럼으로 직접 판정되는 분기**를 함께 둘 것. 같은 함정이 notes·members 로 번지지 않는 것은 그쪽 정책이 `board_id`/`note_id` 로 **이미 커밋된 다른 행**을 읽기 때문이다(실측: 학생의 보드→멤버→노트 생성 전 구간 OK).
- **비공개 보드는 목록에서 뺀다 (2026-09-18 사용자 결정)**: 종전엔 교사에게 남의 비공개 보드가 잠금 배지를 달고 보였는데(의도한 동작이었다) 누를 수 없는 카드가 목록을 채우고 제목만 드러냈다. **거르는 것은 클라이언트이고 RLS 는 그대로**다(같은 결정에서 "화면에서만"을 골랐다 — 서버까지 좁히면 admin 의 남의 보드 관리·공지 링크 검사가 함께 바뀐다). ⚠ 라이브 실측: 보드 7개 중 private 6 · read_only 1 · **public 0** — 즉 초대되지 않은 교사의 목록은 거의 빈다(버그가 아니라 이 결정의 결과라, 왜 비었는지 말하는 빈 상태를 함께 뒀다). 접근 판정은 화면 4곳 + 공지 픽커에 복붙돼 있던 것을 **`src/lib/collabBoardAccess.ts`** 한 벌로 합쳤다
- **보드 카테고리 (2026-09-18)**: **자유 입력**이고 만들어진 이름은 다른 사람도 고른다. 정본은 `collab_boards.meta.category` 하나뿐 — **표를 만들지 않았다**(카탈로그 표를 두면 아무도 안 쓰는 유령 카테고리를 치우는 화면이 또 필요해진다. 마지막 보드가 이름을 바꾸면 저절로 사라진다). 단일 출처 = `src/lib/collabCategories.ts`. **카탈로그가 두 개고 섞으면 안 된다** — 보드 만들기/수정 = 받아본 보드 **전부**(남의 이름을 고를 수 있어야 한다), 목록 필터 칩 = **지금 목록에 보이는 보드**(요구사항 "활성화된 보드의 카테고리만", 눌러도 0건인 칩 방지). 헤더 UI = 칩 줄 앞 5개 + `[+N]` 팝오버이고 **고른 칩은 접히지 않는다**(무엇으로 걸렀는지가 화면에서 사라지면 보드가 없어진 것으로 보인다). `BoardHeader` 의 `filterSlot` = 제목 줄 아래 한 줄(list=카테고리, detail=색 범례)
- **노트 색 팔레트·범례 (2026-09-18)**: 보드 관리자가 **RGB 로 자유롭게** 색을 정하고 이름을 붙인다(`collab_boards.meta.note_palette`). 이름 붙은 색만 상세 헤더 범례가 되고 누르면 그 색 노트만 보인다. 이름 없는 색도 쓸 수 있고 **같은 색은 두 번 못 쓴다**. 미설정이면 옛 7색 폴백이라 켜기 전과 화면이 같다. **⚠ `collab_notes.color` 는 값이 두 모양이다** — 옛 노트는 `'yellow'`, 새 노트는 `'#fff176'`(마이그레이션 안 했다). **직접 비교하지 말고 `normalizeNoteColor()` 를 거칠 것** — 빠뜨리면 범례 필터가 영원히 0건이고 색별 개수가 같은 색을 둘로 센다(둘 다 오류가 아니다). 그라데이션·글자색은 계산한다(`resolveNoteColorStyle`/`readableInk`) — **Tailwind 임의 클래스는 빌드 때 스캔되므로 런타임 hex 에 못 쓴다** → 인라인 style 이 유일한 길. 색 목록이 네 화면에 복붙돼 있던 것은 `NoteColorPicker` 한 벌로 합쳤다. 단일 출처 = `src/lib/collabNoteColors.ts`
- 회귀 = `npx tsx scripts/collab-student-access-test/run.mts`(24건 — **이 사고는 오류를 내지 않으므로 정적 검사가 유일한 방어선**이다) + `npx tsx scripts/collab-category-color-test/run.mts`(121건 — 색 두 모양의 정규화·팔레트 중복·카테고리 정규화·접근 진리표 + 색 배열이 네 화면에 되살아나는지 정적 검사). 상세·검증표 = `docs/features/collab-board.md`
