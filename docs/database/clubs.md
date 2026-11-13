# 동아리 (clubs) — 2026-11-11

설계·인터뷰 = `docs/plans/2026-11-11-club-management.md`, 기능 = `docs/features/clubs.md`.
마이그레이션 `20261111130000_club_core` · `150000_club_requests_notes` · `170000_club_finance` · `190000_club_recruit` · `210000_club_archive` (+ MCP `140000`·`160000`·`180000`·`200000`·`220000`).

## 0. 한 줄 요약

**정본은 `club_member`(명단)·`club_year`(학년도 운영)·`club`(해를 넘는 정체성)이다.** `club_info` 와 창체 `activity_host_member` 는
확정 명단에서 트리거가 다시 만드는 **파생 사본**이다 — ⚠️ `club_info` 를 직접 고치지 말 것(다음 동기화가 덮는다). 읽는 쪽(발급대장·대상 규칙·MCP·창체)은 바꾸지 않았다.

쓰기는 모두 DEFINER RPC(`club_*`) — 표에는 SELECT 정책만 있다. 웹과 MCP(`mcp_*` INVOKER 래퍼)가 같은 RPC 를 부른다.

## 1. 표

| 표 | 무엇 | 키·주의 |
|---|---|---|
| `club` | 해를 넘는 정체성 | `meta.former_names[] {name, until_year}` — 이름 변경 이력 |
| `club_year` | 학년도별 운영 단위 | `UNIQUE(academic_year, name)`. ⚠️ **이름이 바뀐 해에는 한 club 이 두 행**(3학년 = 옛 이름 행 «반크», 1·2학년 = 새 이름 «링크») — 화면은 `club_id` 로 묶는다. `kind` regular/autonomous · `status` active/inactive/proposed(개설 신청)/rejected · `legacy_club_info_id`(파생 club_info 행) · `activity_host_id`(창체 주최) · `meta.leader_unresolved`(백필 때 명단 밖 기장) |
| `club_advisor` | 지도교사(공동지도) | `(club_year_id, teacher_resource_id)`, `is_primary`(club_info.teacher_resource_id 로 감) |
| `club_member` | 명단 정본 | `UNIQUE(club_year_id, student_code)` · `role` member/leader(확정 기장 하나 — 부분 유일 인덱스) · `status` pending(학생 제안·이월·개설 제안자)/confirmed/removed · `source` club_info_backfill/manual/student_request/recruit/carry/proposal. 이름 칸 없음(창체와 같은 결정 — 졸업 익명화 승계) |
| `club_observation` | 누가기록(지도교사 관찰) | 학생 비공개(RLS = 지도교사·담당자) · `source` manual/agent(MCP 초안) |
| `club_finance` | 배정액 · 예산 줄 · 구매 페이지 | `purchase_page_id` UNIQUE. 금액은 저장하지 않는다(읽을 때 센다) |
| `club_recruit` | 편성 회차 | 대상 학년·지망 수(1~5)·기간·kind |
| `club_application` | 지원 | `(recruit, student, club)`·`(recruit, student, rank)` 유일 · status applied/accepted/rejected/withdrawn/enrolled · `interview_note` |
| `club_host_alias` | 창체 옛 주최 → 동아리 | 담당자가 확정한 것만(자동 병합 금지) |

## 2. 판정 (DEFINER)

- `is_club_manager()` = admin ∨ 태그 **«동아리담당자»**(2026-11-11 윤도윤 선생님)
- `is_club_advisor(club_year)` = `club_advisor` ∩ `current_actor_resource_ids()`
- `club_student_role(club_year)` = 확정 부원의 leader/member, 아니면 **NULL** — ⚠️ OR 로 묶어 `if not (…)` 에 쓰면 «false OR NULL = NULL» 이 거부를 건너뛴다. `coalesce(… = 'leader', false)`(P4 드라이런에서 잡힘, `club_private.can_judge`)
- `can_manage_club_year` = 담당자 ∨ 지도교사

## 3. 동기화 (`club_private.sync_year`)

트리거: `club_year`(이름·종류·분야·장소·상태·학년도 UPDATE OF) · `club_advisor`·`club_member`(문장 트리거, transition table). 하는 일:
1. `club_info` 행을 다시 쓴다(없으면 만든다 — 새 학년도 행도 생긴다). `teacher_name` = 지도교사 이름 콤마, `students` = 확정 명단, `meta.status/place/leader/club_year_id/club_id`.
   명단 밖 기장(`meta.leader.in_roster=false`)은 정해질 때까지 그대로 둔다.
2. 창체 `activity_host`: 없으면 같은 이름 주최를 잇거나 만든다 · inactive → archived · `activity_host_member` 를 확정 명단과 같게(기장 role 포함).
- proposed/rejected 는 동기화하지 않는다. 대량 작업은 `set_config('club.skip_sync','on', true)` 뒤 마지막에 `sync_year` 를 부른다(백필 방식).

정규 1인 1동아리: `club_member` BEFORE 트리거 — 같은 학년도 **활동 중 정규** 동아리에 확정이 둘이면 23505. 지금 없는 동아리(inactive)·자율은 세지 않는다.

## 4. 「입력 받기」 동아리 축 (P2)

줄 단위 `club`(지도 동아리마다 — `unit_key = club|<club_year_id>`) · `club_member`(부원마다 — `club|<club_year_id>|<student_code>`).
⚠️ 축 목록은 **SQL 네 곳**(`collect_config_error` · `resolve_audience` · `collect_request_axis_check` · `mcp_private.wk_request_config`) **+ TS**(`AUDIENCE_AXES`) — 회귀 `scripts/club-core-test/run.mts` ③.
운영 CHECK 에는 마이그레이션 파일에 없던 `unit`(제출 받기 과제 단위)이 있었다 — 보존.
대상 조건 `club`(동아리 지도교사)은 `club_advisor` 를 읽는다(공동지도 포함, 지금 없는·신청 중 동아리 제외).

## 5. RPC

| 묶음 | 함수 |
|---|---|
| P1 | `club_list(year)` · `club_get(id)` · `club_save(id\|null, patch)` · `club_set_advisors` · `club_set_members(id, students, add\|replace, check_only)` · `club_request_members`(학생 제안) · `club_decide_members(ids, confirm\|reject\|remove)` · `club_set_leader` |
| P2 | `club_notes` · `club_save_note` · `club_delete_note` · `club_requests(club\|null, year)` · `club_send_request`(INVOKER — 업무 «동아리 운영 (N학년도)» › 할 일 › 입력 받기 → `update_collect_config` → `start_collect_request`) · `club_activities`(INVOKER) |
| P3 | `club_finance_get` · `club_finance_overview` · `club_set_finance`(담당자) · `club_open_purchase_page`(지도교사·담당자 — 페이지 + 공동 작업자) |
| P4 | `club_recruit_save/get/list` · `club_apply` · `club_withdraw_application` · `club_applications` · `club_judge_applications`(기장·지도교사) · `club_finalize_applications`(지도교사·담당자) · `club_propose_autonomous` · `club_decide_proposal` · `club_proposals` · `club_roll_over(from, to, carry, check_only)` |
| P5 | `club_host_candidates` · `club_link_host` |
| 보기 | `club_view_as(student, fn, args)` — **관리자 전용**. 함수 안에서만 `request.jwt.claims.sub` 를 그 학생 계정(profiles)으로 바꿔 읽기 함수 8종(화이트리스트)을 부르고 되돌린다(오류 때도). 반환 `{student, data}`. 마이그레이션 `20261111235000` |

학생 찾기(`club_private.resolve_student`) = `{resource_id}` · `{code}` · `{grade,class,number}` · `"2-5-17"` · `"20517"` — 재학생(active)에서 정확히 한 명.

## 6. 구매 연결 (P3)

- 동아리 페이지 = `purchase_request_pages` 그대로(제목 `[동아리] … 물품 신청 (N학년도)`, 학년도 끝까지, 칸: 물품명·주소·가격·개수·쓰임). 지도교사·담당자가 공동 작업자 — 지도교사가 바뀌면 트리거가 더한다(빼지는 않는다).
- 가드 `purchase_requests_club_guard`(BEFORE INSERT): 학생이면 그 동아리 확정 부원만. 교직원은 막지 않는다.
- 금액(`club_private.page_amounts`): 품목 `cells.default-price × default-qty`, 상태 = `meta.itemStatus[행].status` 없으면 신청서 status — 신청(불가 제외)·승인(승인·제출·완료)·품의(`purchase_order_lines` 단가×수량).

## 7. 시험

`supabase/tests/club_core.sql` · `club_requests_notes.sql` · `club_finance.sql` · `club_recruit.sql` · `club_archive.sql` · `mcp_club*.sql` — 모두 rollback. 백필은 마이그레이션 안에서 **동기화로 다시 만든 club_info·창체 명단 = 원래**가 아니면 실패한다.
