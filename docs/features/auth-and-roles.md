# 인증 · 계정 연결 · 역할(role) 판정

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

### 최초 로그인 · 이름 등록(온보딩)

**게이트는 "첫 로그인 여부"가 아니라 현재 상태다.** `AuthProvider.loadProfile()`이 **매 로그인마다** `profiles.name`(비었는가)과 `user_resource` 연결(있는가)을 다시 판정해 `ProfileEditDialog`를 자동으로 연다. 그래서 "resource에 없는 상태로 먼저 로그인 → 나중에 resource 등록 → 재로그인"이 **정상 복구된다**. 저장 순서가 안전장치다 — `handleSave`는 연결에 실패하면 `profiles.name`을 **저장하기 전에** 중단하므로 이름만 남고 연결이 없는 좀비 상태가 생기지 않는다.

**명단에 연결되지 않은 계정은 기능을 쓸 수 없다 (2026-10-13 사용자 결정)**: 가입 트리거는 `NN-` 가 아닌 학교 계정을 전부 `teacher` 로 만들고 서버 판정이 role 만 봐서, 명단에 없는 계정(`admin2@` 등 7개)이 학생 정보까지 읽고 있었다. 판정 단일 출처 = DB **`account_link_status(uid)`**(교직원 = teacher·staff resource 연결 / 학생 = 이메일 학번의 재학(active) 학생 resource → `linked`·`inactive`·`unlinked`), 앱은 `my_account_link_status()` 로 읽는다(`lib/resourceLink.fetchMyAccountLinkStatus`). 차단 두 겹 — ①**PostgREST pre-request 훅 `account_link_pre_request`**(`authenticator` 의 `pgrst.db_pre_request`): 미연결·비활성 계정의 Data API 요청을 42501(hint `ACCOUNT_NOT_LINKED`/`ACCOUNT_INACTIVE`)로 거부하고 연결 절차 경로(profiles·user_resource·개인정보 동의·system_settings 읽기·RPC 3종)만 연다 ②`is_teacher_or_admin`·`is_staff_teacher_or_admin` 에도 같은 조건(Storage·Realtime 경로). 화면 = `RequireAuth` 의 `AccountLinkGate`(동의 게이트 다음, 교직원은 [이름 등록하고 연결하기]). ⚠️ 훅에는 **에이전트(MCP) 토큰 분기**(2026-10-18 — `client_id` 클레임이면 `/rpc/mcp_*` 만)도 있다 — 다시 정의할 때 contest 분기와 함께 지우지 말 것. ⚠️ **연결 절차에 새 요청을 넣으면 훅의 허용 목록에도 넣을 것** — 안 넣으면 미연결 계정만 조용히 실패한다(연결된 사용자는 영향이 없어 개발 중엔 안 보인다). ⚠️ 이름 조회는 `resource` 표가 아니라 RPC `find_self_linkable_resource`(이름·종류만 — meta 에 교사 외부 계정 정보가 있다), meta 가 필요하면 연결 **뒤에** id 로 다시 읽는다. ⚠️ 훅은 anon 도 실행하므로 EXECUTE 를 anon 에서 빼지 말 것(비로그인 요청 전부가 죽는다). 끄기 = `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`. 마이그레이션 `20261013200000`. **이름만으로 스스로 연결하는 것은 유지한다(사용자 결정)** — 대신 Admin «교사 리소스»(`TeacherManagement`)가 명단 이메일(`resource.meta.email`) ↔ 연결 계정 로그인 이메일이 다르거나 명단 이메일이 빈 연결을 «이메일 확인 필요»로 표시·필터한다(판정 `src/lib/linkEmailCheck.ts`, `NAN`·`-` = 없음, 회귀 `scripts/link-email-check-test/run.mts`).

**`profiles.is_first_login`은 죽은 컬럼이다 (2026-08-14 확인)**: 앱 전체에서 write-only — 생성 시 `true`, 이후 `unifiedAuth.updateLoginStats`가 로그인마다 `false`로 덮어쓴다. 읽어서 분기하는 코드는 클라이언트에 없고 DB 함수·트리거에도 0건이다. **이 값으로 온보딩을 게이팅하지 말 것**(재시도가 영구히 막힌다).

**셀프 연결 대상 = teacher + staff (2026-08-14)**: 이름으로 resource를 찾는 조회는 **`src/lib/resourceLink.ts`의 `findLinkableResourceByName()` 단일 출처**를 쓴다(`SELF_LINKABLE_RESOURCE_TYPES = ['teacher','staff']`). 종전엔 `ProfileEditDialog` 4곳이 `.eq('type','teacher')`, `AuthProvider` 1곳이 `.in(['teacher','student'])`로 제각각이라 ①행정 직원(`type='staff'`, 라이브 9명)은 이름 등록이 아예 불가능했고 ②연결이 이미 있어도 AuthProvider가 못 찾아 매 로그인 다이얼로그가 떴다. **`maybeSingle()`을 쓰지 않는다** — 같은 이름이 두 종류에 있으면 오류가 나는데 호출부가 이를 "리소스 없음"으로 처리해 같은 무한 다이얼로그가 된다(교사↔학생 동명이인 장재윤 실제 발생). 전부 받아 **teacher 우선**으로 결정적으로 고른다. 학생은 `user_resource`를 쓰지 않으므로(이메일 prefix ↔ `resource.meta->>'id'`) 목록에서 제외.

### 역할(role) 4종과 직원(staff) 권한 (2026-08-14)

`profiles.role` = `student | teacher | staff | admin`. **연결 성공 시 role은 연결된 `resource.type`을 따른다**(`ProfileEditDialog.syncProfileRole` — teacher↔staff 자동 정렬).

**직원(staff)은 교사보다 좁은 권한이다 (사용자 결정)**:
- **허용** — 학교 공통(홈·일정·공지·전화번호부) + 문서·행정(서류함·결재·구매 신청·발급번호 대장·툴박스/HWPX) + 업무·협업(업무 관리·업무 흐름·협업보드)
- **차단** — 학생 정보·교무(생기부·모의고사·학생 대시보드·교과분석·수시지원·시간표·시험 감독·시간표 생성·교육과정·자습실·방과후·암기카드 통계)

**서버가 정본이고 판정 함수가 둘이다. 새 정책을 쓸 때 반드시 골라야 한다**:
- `is_staff_teacher_or_admin(uid)` = teacher+staff+admin → **허용 영역 전용**
- `is_teacher_or_admin(uid)` = teacher+admin → **학생 정보·교무 유지**(넓히지 말 것 — 이 함수를 쓰는 정책에 학생 데이터가 섞여 있다)

클라이언트 짝은 `src/lib/roles.ts`의 `FACULTY_ROLES`(=앞) / `TEACHER_ROLES`(=뒤)이고 `ProtectedRoute allowed`·개별 체크가 이걸 쓴다. **한쪽만 바꾸면 화면은 열렸는데 RLS가 0행이거나(빈 화면) 메뉴는 없는데 API는 열린 상태**가 된다. `RoleGate`의 `role="teacher"`는 **staff를 포함하지 않는다**(교사 전용 UI = 교무). 직원까지면 `role={['teacher','staff']}`로 명시.

**`profiles.role`은 트리거 `protect_profile_role()`이 지킨다** — 값이 같으면 통과, 다르면 거부가 기본이다(그래서 구 구현의 `update({role:'teacher'})`는 대개 no-op였고 오류도 안 났다). 자가 전환은 **①`student`→`teacher` 오등록 교정 ②연결된 `resource.type`과 role을 일치시키는 경우** 둘뿐이고, 두 경우 모두 **이메일 prefix로 학생 리소스가 조회되면 무조건 거부**한다(학생의 권한 상승 차단). 클라이언트가 role을 주장할 수 없다는 뜻이므로 이 불변식을 깨지 말 것.

**정책 확장은 손으로 옮겨 적지 말 것**: 마이그레이션 `staff_role_scoped_access`는 현재 정의를 `pg_policies`에서 읽어 함수명·역할 배열만 치환하고 **대상 25건이 안 되면 예외로 중단**한다. 표현식이 수십 줄짜리 중첩 EXISTS라 전사 오류 하나가 곧 보안 구멍이다. 같은 작업이 또 필요하면 이 패턴을 재사용할 것.

**헤더 역할 미리보기 3종 (admin 전용)**: 학생(`Eye`+학생 선택) / 교사(`Briefcase`+역할 태그, `TeacherTagPreviewControl`) / **직원(`Building2` 토글, `StaffPreviewControl`)**. 셋은 상호 배제이고 모두 `isAdmin`을 끈다(위 "Role-based UI" 참고). **셋 다 `ProtectedRoute`를 `effectiveRole`로 판정해 라우트를 실제로 막는다** — 차단돼 홈으로 튕겨도 헤더 칩은 `Layout` 안(=`Routes` 밖)이라 항상 남아 빠져나올 수 있다. 직원은 태그로 갈라지지 않아 팝오버 없이 단순 토글이다.

**메뉴도 역할별로 걸러진다**: `useNavSections`가 `effectiveRole === 'staff'`이면 `routeAccess.ts`의 `STAFF_BLOCKED_PREFIXES`에 걸리는 항목을 빼고, 자식이 다 사라진 그룹·섹션도 함께 지운다(빈 껍데기 방지). 외부 메뉴(절대 URL)는 유지. **이 목록은 `App.tsx`의 `TEACHER_ROLES` 라우트와 짝인 거울**이라 라우트를 추가하면 같이 고쳐야 한다 — 어긋나도 접근이 뚫리진 않고 "보이는데 누르면 홈으로 튕기는" 예전 동작으로 돌아갈 뿐이다.

**라우트 가드가 비어 있던 화면들을 채웠다 (2026-08-14)**: `/timetable`·`/spaced-repetition`은 `['student', ...TEACHER_ROLES]`. **`/evalog` 는 2026-09-04 에 `['student', ...TEACHER_ROLES]` 로 되돌렸다** — 이때 `TEACHER_ROLES` 로 준 것이 회귀였다. `EvalogApp` 에는 이미 `isStudent` 단일 패널 분기와 `useStudentSelfData`(본인 1행)가 있었고 `navigation.ts` 의 `studentNavSections`·`studentAllowedRoutes` 도 학생을 상정하고 있어서, **메뉴에는 보이는데 누르면 튕기는** 상태로 방치됐다. 서버는 원래 안전했다(실측: `student_basic_info` 871행 중 학생 시점 1행, `student_detailed_activities` 44행 전부 본인 것 — RLS 가 `id = 이메일 prefix`). 학생에게 감추는 탭은 **비교과·유사도·관찰노트 3개**이고 트리거뿐 아니라 **`TabsContent` 도 같은 조건으로 막는다**(한쪽만 막으면 조건이 어긋난다). **검색·단어분석·키워드분석은 비교과 원문·키워드를 계속 노출한다** — 2026-09-04 사용자가 "비교과 탭만 숨김"을 선택한 결과이므로 의도된 상태다(범위를 넓히려면 그 세 컴포넌트의 대상에서 자율/동아리/진로/행동특성을 빼야 한다). 종전엔 `ProtectedRoute`가 없어 **직원도 페이지 자체는 열렸다**(데이터는 RLS가 막아 빈 화면). 실사용자 컨텍스트 RLS 검증(2026-08-14): 직원 = documents 80·notices 3·issues 105·workflow 6 / student_basic_info **0**·activities **0**·exam_schedule **0**·timetable_plan **0**, 교사는 전부 종전과 동일.

**RLS 비대칭 주의**: `user_resource` INSERT는 `user_id = auth.uid()`라 본인이 만들 수 있지만, `resource` INSERT/UPDATE는 **admin 전용**이다(단 이미 연결된 자기 resource는 `Users can manage their own resource` ALL 정책으로 UPDATE 가능). 그래서 `updateResourceMeta`의 "리소스가 없으면 새로 만든다" 폴백은 일반 사용자에게 RLS로 막히며, 애초에 그 앞 `attemptAutoConnection` 실패 시 return이라 **도달 불가 코드**다.

### Role-based UI (학생/교사/관리자 분기)

**원칙**: JSX 안에서 `{isStudent && X}` / `{!isStudent && X}` 같은 인라인 분기를 새로 작성하지 말 것. `<RoleGate>`(`src/components/auth/RoleGate.tsx`)를 사용한다.

```tsx
<RoleGate role="student"><MealCard /></RoleGate>
<RoleGate not="student"><TeacherActions /></RoleGate>
<RoleGate role={['teacher', 'admin']}><AdminPanel /></RoleGate>
<RoleGate role="student" fallback={<TeacherView />}><StudentView /></RoleGate>
```

**대시보드 분기**: 페이지 내에서 학생/교사 전용 묶음이 크면 `src/components/dashboard/StudentHome.tsx` / `TeacherHome.tsx` 같은 컴포넌트로 추출하고, RoleGate로 감싼다 (예: `src/pages/Index.tsx`).

**라우트 단위 차단**: 컴포넌트가 아닌 라우트 자체를 막아야 하면 RoleGate가 아니라 `ProtectedRoute`(`src/components/auth/ProtectedRoute.tsx`)를 쓴다. `ProtectedRoute`는 **fail-closed**다: 미로그인(`!user`) → `/auth` 리다이렉트, `profile` 미해결 → `null` 렌더(보호 콘텐츠 노출 금지). 역할(`allowed`)만 검사하므로 인증 자체는 아래 RequireAuth가 담당.

**전역 인증 차단막**: `RequireAuth`(`src/components/auth/RequireAuth.tsx`)가 `App.tsx`의 `<Routes>` 전체를 감싸 미로그인 방문자를 `/auth`로 보낸다(심층 방어 2차선, 1차선은 RLS). 세션 없이 동작해야 하는 페이지만 `PUBLIC_PATH_PREFIXES`(`/auth`, `/signature-popup`, `/training-signature-print`, `/iframe`, `/videos`, `/privacy`)에 등록한다. **기본값은 "보호"** — 새 public 라우트가 생기면 반드시 이 화이트리스트에 추가해야 하고, 그 외 라우트는 자동으로 로그인을 요구한다. **개인정보 동의 게이트(2026-07-24)**: RequireAuth는 로그인 사용자가 현재 방침 버전에 동의(`user_privacy_consents`)하지 않았으면 앱 대신 `PrivacyConsentGate`를 렌더링한다(`usePrivacyConsent` + localStorage 검증 캐시 `src/utils/privacyConsentVerification.ts`, 로그인/로그아웃 시 clear). 상세 = `docs/privacy-policy-and-consent.md`.

**중요한 시맨틱**: RoleGate의 `role="student"`는 `useAuth().isStudentView`를 사용한다 — admin이 학생 시점으로 미리보기하는 모드까지 포함한다. `profile.role === 'student'`로 직접 비교하지 말 것.

**`isAdmin`은 미리보기를 반영한다 (2026-08-14 변경)**: 예전엔 `isAdmin` = 원본 role이고 `isAdminUI`만 미리보기를 반영했는데, 실제 코드는 `isAdmin`을 **148곳(42파일)**에서 쓰고 `isAdminUI`는 5파일뿐이라 미리보기가 사실상 얕았다(관리자 권한이 그대로 비쳤다). 지금은 **`isAdmin`이 미리보기 중 false**이고 `isAdminUI`는 그 별칭이다. 미리보기는 능력을 **줄이기만** 하므로 데이터 경로에 걸려 있어도 안전하다(실측: `isAdmin` 소비처는 전부 "admin이면 더 준다" 형태).
- 원본 값이 필요하면 **`isRealAdmin`** — 단, 미리보기 컨트롤 자신(헤더 토글·나가기 칩)에만 쓴다. 여기에 일반 기능을 걸면 미리보기가 다시 얕아진다. **`isAdmin`으로 컨트롤을 감싸면 미리보기 중 나가기 버튼이 사라져 갇힌다.**
- 역할 판정의 기준값은 **`effectiveRole`**(미리보기 반영). `ProtectedRoute`·`RoleGate`가 이걸 쓰고, `RoleGate`의 `role="teacher"`는 `effectiveRole === 'teacher' || isAdmin`이다.
- **한계(구조적)**: RLS는 실제 JWT 기준이라 미리보기 중에도 서버는 admin에게 admin 데이터를 준다. 재현되는 것은 **화면 구성·라우트·기능 게이트**까지이고 데이터 권한은 아니다.

**비즈니스 로직 분기는 그대로**: 데이터 페칭/계산식 안의 `isStudent ? queryA : queryB` 같은 패턴은 RoleGate가 적용되지 않으므로 훅(`usePermissions.ts` 등)에서 처리한다.

**진행 중**: `.omc/plans/role-branching-migration.md`에 잔여 마이그레이션 로드맵.
