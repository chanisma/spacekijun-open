# 구매 요청 (Purchase Request)

구매 신청 게시판 — 페이지, 신청, 이력 테이블.

> 📍 전체 스키마 인덱스: [DATABASE_TABLES.md](../../DATABASE_TABLES.md)

---

## Purchase Request Feature Tables

구매 신청 게시판(`src/features/purchase-requests`). 매니저가 신청 페이지를 만들고, 대상(학생/교사)이 항목을 신청하며, 매니저가 각 신청의 상태(제출됨/검토중/승인/거절)를 사유와 함께 변경한다.

### purchase_request_pages
**Purpose**: 구매 신청 페이지 (제목, 대상, 신청 기간, 컬럼 정의)
**Primary Key**: id (UUID)
**RLS Enabled**: Yes

#### Columns (요약):
- `id` (UUID): Primary key
- `title` (TEXT), `description` (TEXT, nullable)
- `target_roles` (text[]): 신청 대상 ('student' | 'teacher')
- `period_start` / `period_end` (TIMESTAMPTZ): 신청 기간
- `columns` (JSONB): 신청 표 컬럼 정의 (`{ id, name, type, required, isDefault }[]`)
- `is_archived` (BOOLEAN), `archived_at` (TIMESTAMPTZ, nullable)
- `created_by` (UUID): FK → `resource(id)` — 페이지 작성자(매니저)
- `created_at` / `updated_at` (TIMESTAMPTZ)

### purchase_request_collaborators
**Purpose**: 페이지 공동 작업자 (작성자와 동일한 매니저 권한)
**Columns**: `id`, `page_id` (FK), `resource_id` (FK → resource), `created_at`

### purchase_requests
**Purpose**: 개별 구매 신청 (신청자별 다건 가능). 항목은 JSONB로 저장, 상태/사유는 매니저가 관리
**Primary Key**: id (UUID)
**RLS Enabled**: Yes

#### Columns:
- `id` (UUID): Primary key (default: gen_random_uuid())
- `page_id` (UUID): FK → `purchase_request_pages(id)`
- `requester_id` (UUID): FK → `resource(id)` — 신청자
- `items` (JSONB): 신청 항목 배열 (`{ id, cells: Record<colId, string|number> }[]`, default: `[]`)
- `status` (TEXT): 처리 상태 (default: `'submitted'`) — `'submitted'`(제출됨) | `'pending'`(검토중) | `'approved'`(승인) | `'completed'`(완료) | `'rejected'`(불가). CHECK 제약 없음 — 라벨은 프론트 `purchaseRequestStatus.ts`에서 관리
- `status_reason` (TEXT, nullable): **매니저가 입력한 상태 변경 사유 (최신 1개만 보관)**
- `status_updated_at` (TIMESTAMPTZ, nullable): **매니저가 상태/사유를 마지막으로 바꾼 시각**
- `meta` (JSONB): 확장 필드 (default: `{}`). **`meta.itemStatus` = 품목 단위 승인** — `{ "<items[].id>": {status, reason, at, by} }` (2026-09-02, 아래 절 참고)
- `created_at` / `updated_at` (TIMESTAMPTZ)

#### RLS Policies:
- **SELECT/UPDATE/DELETE** (`view_own_or_manager` / `update_own_or_manager` / `delete_own_or_manager`): 본인 신청(`requester_id` = 내 resource) **또는** 페이지 매니저(`is_purchase_page_manager(page_id)`)
- **INSERT** (`create_own_request`): 본인 resource로만 신청 생성 가능
- **"본인" 판정 = `current_actor_resource_ids()` (2026-10-15)** — `purchase_request_history` SELECT 도 같다. 종전엔 `user_resource` 조인이라 **링크가 없는 학생은 제출이 42501 로 막혔다**(학생은 `user_resource` 를 쓰지 않는다 — 이메일 prefix ↔ `resource.meta->>'id'`). 클라이언트 `useRequesterResourceId` 의 자가 링크가 그 구멍을 메웠지만, 2026-07 `unifiedAuth` 에 학생 폴백이 생긴 뒤로 링크 없이도 id 가 나와 자가 링크 단계가 건너뛰어졌다(그때까지 제출한 학생 6명은 전원 링크가 있던 학생). 교직원은 같은 집합이라 권한 변화 없음(실측 4개 계정 가시 행수 전후 동일). 마이그레이션 `20261015110000`, 재현 = `scripts/purchase-requests-test/student-insert.sql`. 페이지(`purchase_request_pages`) 정책·`is_purchase_page_manager` 는 교직원 경로라 `user_resource` 그대로

#### Triggers (실행 순서 = 트리거명 알파벳 순):
1. `aa_guard_purchase_request_status` → `guard_purchase_request_status()`: **비매니저가 status/status_reason/`meta.itemStatus` 변경을 시도하면 OLD 값으로 복원** (신청자의 우회 상태 변경 차단). `meta` 의 나머지 키는 그대로 두고 `itemStatus` 만 되돌린다. history 적재보다 먼저 실행되도록 `aa_` 접두 사용
2. `purchase_request_history_trigger` → `record_purchase_request_history()`: `items`·`status`·**`meta`** 변경 시 OLD 스냅샷(`status_reason`·`meta` 포함)을 `purchase_request_history`에 적재. **meta 를 넣은 이유**: 품목 하나만 승인하면 파생 status 가 그대로일 수 있어(3건 중 1건 승인 → 여전히 pending) items/status 만 보면 그 결정이 이력에서 통째로 사라진다
3. `trg_pr_updated_at` → `purchase_request_set_updated_at()`: `updated_at` 갱신
4. `notify_purchase_request_submitted_trigger` → `notify_purchase_request_submitted()`: **AFTER INSERT 전용** — 페이지 담당자(작성자 + 공동 작업자, 신청자 본인 제외)에게 `notification_events` 발송 (SECURITY DEFINER, 2026-09-03). **UPDATE 에는 걸지 않는다**(신청 수정은 새 신청이 아니다). 품목 0건이면 발송하지 않고, 본문이 하위 트랜잭션이라 **알림이 실패해도 신청은 커밋**된다(`raise warning`). 수신자 명단(`purchase_request_collaborators`)을 신청자에게 노출하지 않으려고 클라이언트가 아닌 트리거로 보낸다. 딥링크는 `meta.purchase_page_id`(`related_meeting_id` 는 meeting FK 라 쓸 수 없다). 상세 = `docs/features/purchase-requests.md` "새 신청 알림"

### purchase_request_history
**Purpose**: 신청 수정/상태 변경 이력 (트리거 전용 INSERT). 과거 사유도 보존
**Primary Key**: id (UUID)

#### Columns:
- `id` (UUID): Primary key
- `request_id` (UUID): FK → `purchase_requests(id)`
- `page_id` (UUID), `requester_id` (UUID)
- `items` (JSONB): 변경 전 항목 스냅샷
- `status` (TEXT): 변경 전 상태
- `status_reason` (TEXT, nullable): **변경 전 사유 스냅샷**
- `meta` (JSONB, nullable): **변경 전 meta 스냅샷 (itemStatus 포함)** — 품목 단위 승인 이력 추적용 (2026-09-02)
- `snapshot_at` (TIMESTAMPTZ): 변경 전 `updated_at`

#### 품목(항목) 단위 승인 (2026-09-02)

종전엔 `status` 가 신청건 1건에 하나뿐이라 **"3개 중 2개만 승인"을 표현할 수 없었다**.
지금은 품목마다 상태를 갖고 **신청건 `status` 는 품목 상태에서 파생**된다(단일 출처).

- **저장** = `purchase_requests.meta.itemStatus` = `{ "<items[].id>": {status, reason, at, by} }`
  - **새 테이블을 만들지 않은 이유**: `items` 가 JSONB 라 행 id 에 FK 를 걸 수 없어, 별도 표를 둬도
    참조 무결성은 똑같이 없고 조인만 늘어난다. `task.meta.assignees` 와 같은 패턴이다.
  - 채택 전 라이브 62행 전부 `meta` 가 비어 있음(사용처 0)을 확인했다.
- **쓰기는 `set_purchase_request_item_status(p_request_id, p_status, p_row_ids, p_reason)` RPC 하나뿐**
  (SECURITY DEFINER, `authenticated` 에만 EXECUTE). 직접 UPDATE 를 허용하면 ①JSONB
  read-modify-write 로 동시 승인이 서로를 덮어쓰고 ②파생이 클라이언트로 새어 나가 화면마다 답이 갈린다.
  - `p_row_ids` = NULL 또는 전 품목 → 신청건 전체 변경(종전 UX). 그 외 → 지정 품목만.
  - **기준선 채우기**: 품목 상태가 아직 없으면 나머지 품목을 **현재 신청 상태로 먼저 채운다**.
    이걸 안 하면 "미설정 품목은 신청 상태를 따른다" 폴백과 파생이 서로를 참조해 순환한다.
  - **일부만 바꾸면 `status_reason` 을 NULL 로 지운다** — 신청 전체를 설명하던 사유가 더는 맞지
    않기 때문. 기준선에서 각 품목이 그 사유를 복사해 갔으므로 정보는 사라지지 않는다.
  - 행이 그 사이 삭제됐으면 조용히 무시하고, `itemStatus` 의 고아 키도 정리한다.
- **파생** = `purchase_derive_request_status(p_item_status jsonb, p_fallback text)` (IMMUTABLE)
  - 전부 같으면 그 상태 / 미결(`submitted`·`pending`)이 하나라도 있으면 `pending` /
    전부 종결이면 `completed`+`rejected` 조합만 `completed`, 그 외 혼재는 `approved`.
  - **같은 표가 클라이언트 `utils/itemStatus.ts` 에도 있다.** 한쪽만 고치면 화면과 서버가 다른
    상태를 말한다 — 회귀 `scripts/purchase-requests-test/run-item-status.mts` 와
    `scripts/purchase-requests-test/derive-status.sql` 이 양쪽을 같은 표로 고정한다.
- **호환**: 품목 상태가 없는 기존 신청은 전 품목이 신청 상태를 따른다. 데이터 마이그레이션 없음.
- **검증(라이브, 전부 롤백)**: 매니저가 4품목 중 1개를 불가 처리 → 기준선이 나머지 3개를
  `approved` 로 채우고 신청 상태는 `approved` 유지, 대상 품목만 사유·`by` 를 갖는다.
  신청자가 같은 RPC 를 부르면 42501 거부, `meta.itemStatus` 직접 UPDATE 는 guard 가 되돌린다.

#### 매니저의 품목(물품명) 수정 (2026-09-02)

`ManagerView`의 물품명 인라인 편집은 **새 컬럼·새 RPC·마이그레이션 없이** 기존 경로만 쓴다.

- **권한**: `update_own_or_manager` UPDATE 정책이 이미 페이지 매니저를 허용한다. `aa_guard_purchase_request_status` 트리거는 `status`/`status_reason`만 되돌리므로 `items` 변경은 통과한다.
- **감사**: `record_purchase_request_history()` 가 `items` 변경 시 OLD 스냅샷을 `purchase_request_history`에 적재하므로 "누가 무엇을 고쳤는지"를 위한 별도 저장이 필요 없다.
- **주의 2가지**: ①**RLS 차단은 오류가 아니라 0행**이라 클라이언트가 `.select('id')` 반환 행으로 실제 반영을 확인해야 한다(안 하면 '저장됨'으로 보인다) ②`items`는 JSONB 한 덩어리라 화면 캐시로 read-modify-write 하면 그 사이 신청자가 추가한 행이 사라진다 — **저장 직전 서버에서 다시 읽어** 대상 행만 갈아끼운다(`useUpdatePurchaseRequestItemCell`).

### 품의 정리 (2026-10-12) — purchase_order_batches · purchase_order_lines · purchase_order_line_items

신청과 공문 사이의 매니저 단계. 마이그레이션 `20261012110000_purchase_order_stage.sql`.
상세 동작 = `docs/features/purchase-requests.md` "품의 정리".

| 표 | 뜻 | 주요 컬럼 |
|---|---|---|
| `purchase_order_batches` | 품의 차수(「1차 품의」) | `page_id`(FK cascade), `title`, `columns`(열 정의), `status` CHECK `draft`(작성 중)·`submitted`(품의 완료)·`purchased`(구매 완료), `note`, `sort_order`, `status_updated_at`, `created_by` → resource |
| `purchase_order_lines` | 품의 품목(고정 항목) | `batch_id`(FK cascade), `page_id`(**트리거가 차수에서 채움** — 보낸 값은 덮어씀), `name` NOT NULL, `spec`, `unit_price`·`qty` numeric ≥0, `usage_period`, `vendor`, `url`, `payment_method`, `budget_item`, `note`, `extra`(사용자 열 값), `sort_order` |
| `purchase_order_line_items` | 신청 품목 → 품의 품목 (N:1) | `line_id`(FK cascade), `page_id`(트리거), `request_id`(FK → purchase_requests cascade), `row_id`(= `items[].id`), **UNIQUE (request_id, row_id)** |

- **엑셀식 표 · 사용자 열 (같은 날 후속, 마이그레이션 `20261012120000_purchase_order_columns.sql`)**:
  `purchase_order_batches.columns jsonb not null default '[]'`(CHECK array — 차수 표의 열 정의
  `{id, name, type, field?}`, 빈 배열 = 코드의 기본 열 품명·단가·수량·비고) ·
  `purchase_order_lines.extra jsonb not null default '{}'`(CHECK object — 사용자 열 값 `{열 id: 값}`).
  기본 칸은 그대로 실제 컬럼이다 — 금액·공문·신청자 진행 조회가 그 컬럼을 읽는다. RLS 는 기존 `manager_all`
  그대로(라이브 롤백 검증: 매니저 extra 쓰기 1행 · 배열 extra 는 CHECK 거부 · 신청자 columns UPDATE 0행).
- **왜 새 표인가**: 품의 품목 하나가 **여러 신청**을 묶는다. 한 신청의 `meta` 에 담을 수 없는 관계라 품목 단위 승인(`meta.itemStatus`)과 달리 표가 필요했다.
- **연결의 유일성**: 신청 품목 하나는 페이지 전체에서 품의 품목 하나에만 들어간다. 다른 품목·차수로 옮기기 = `on conflict (request_id,row_id) do update set line_id` (클라이언트 upsert).
- **고아 연결**: `row_id` 는 JSONB 안의 값이라 FK 가 없다. 신청자가 행을 지우면 연결이 남는데, 화면(`liveLinks`)과 RPC 가 그런 연결을 무시한다. 신청 자체를 지우면 FK cascade 로 사라진다.
- **같은 페이지 검증**: `aa_purchase_order_line_item_fill_page` 트리거가 `purchase_requests.page_id ≠ 품목의 page_id` 이면 22023 으로 거부한다.
- **RLS**: 세 표 모두 `manager_all` 하나 — `is_purchase_page_manager(page_id)` (읽기·쓰기 동일). 신청자는 0행이다. `page_id` 사본을 둔 이유가 이것이다(정책이 다른 표를 되읽지 않아 INSERT…RETURNING 이 안전하다).
- **RPC `set_purchase_order_batch_status(p_batch_id, p_status)`** (DEFINER, anon·PUBLIC 회수): 매니저 재검증 후 차수 상태를 바꾸고 연결된 신청 품목 상태를 **순방향으로만** 연동한다 — `submitted` → 미결(제출됨·검토중)을 `approved` / `purchased` → 불가·완료가 아닌 것을 `completed`. 되돌리기는 품목 상태를 건드리지 않는다. 쓰기는 기존 `set_purchase_request_item_status` 를 **(신청, 기존 사유)** 묶음마다 불러 품목별 사유를 보존하고 파생 규칙을 한 곳에 둔다. 반환 `{status, updatedItems}`.
- **RPC `get_my_purchase_order_progress(p_page_id default null)`** (DEFINER, anon·PUBLIC 회수): 신청자 본인(`current_actor_resource_ids()` — 학생 포함) 품목의 `request_id, row_id, line_name, batch_title, batch_status, status_updated_at` 만. **단가·수량·구매처·결제·예산 과목은 싣지 않는다**(사용자 결정 "진행 단계만 공개").
- **검증(라이브, 롤백)**: 매니저 생성·연결·상태 연동(품의 완료 1건 승인, 구매 완료 3건 완료, 연결 안 된 형제 품목 불변) / 중복 연결 unique 위반 / 다른 페이지 연결 거부 / 신청자: 진행 1행·표 0행·RPC·INSERT 42501 / 익명 42501 / upsert 옮기기 / 품의 품목 삭제 시 연결 cascade.

#### 에이전트(MCP) RPC (2026-10-19)
`mcp_list_purchase_pages` · `mcp_list_my_purchase_requests` · `mcp_list_managed_purchase_requests` · `mcp_submit_purchase_request` · `mcp_update_my_purchase_item` · `mcp_cancel_my_purchase_item` · `mcp_create_purchase_page` — 전부 SECURITY INVOKER(위 RLS·트리거 그대로) + `mcp_private.require_tool`. **INSERT 정책이 보지 않는 신청 기간·대상·보관을 RPC 가 확인**한다. 마이그레이션 `20261019130000`, 상세 = `docs/features/mcp-agent.md` «구매 신청 도구».

#### Helper Function:
- `is_purchase_page_manager(p_page_id uuid)` → boolean: 현재 사용자가 페이지 작성자 또는 공동작업자인지 판정 (RLS·guard 트리거에서 사용)
