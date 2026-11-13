# 교실 기기 QR 세팅 (classroom-link)

> 최초 작성: 2026-10-13 · 기능 문서가 스키마 노트를 겸한다(DATABASE_TABLES.md 도메인 맵).

교실 PC(나중엔 안드로이드 전자칠판)가 QR 을 띄운다. 교사가 휴대폰으로 찍어 스페이스기전에서 **반별 세팅**을
고르고 승인하면, 교실 화면 아래에 그 교사의 **독**이 뜬다 — 세팅(드라이브 폴더·파일 · 웹사이트 · PC 프로그램 ·
스페이스기전 화면)과 «내 드라이브»가 아이콘으로 놓이고 **누르면 연다**(저절로 열지 않는다). 드라이브는 교실 프로그램 안
탐색기에서 **전체 드라이브를 일반 폴더처럼** 쓴다 — 열고 고쳐 저장하면 드라이브에 되올린다.
수업이 끝나면(정해 둔 시간 · 독의 [수업 끝] · 휴대폰의 «여기서 수업 끝내기») 연 것을 닫고, 고친 파일을 올리고,
받은 파일과 로그인을 지운다.

> **2026-10-13 2차 (사용자 피드백)**: 1차는 승인 즉시 항목을 전부 실행하고 드라이브는 Picker 로 고른 파일의 사본만
> 열었다. 사용자가 원한 것은 ① 위젯(독)에 놓여 쉽게 여는 것 ② 드라이브 폴더·전체를 일반 폴더처럼 쓰는 것이었다.
> 그래서 드라이브 토큰을 `drive.file` → **`drive`(전체 읽기·쓰기)** 로 바꾸고, 토큰 1시간이 끝나면 **«드라이브 다시 연결» QR**
> (`classroom_link.purpose = 'drive'`, 마이그레이션 `20261013240000`)로 이어 간다 — 서버 갱신 토큰은 두지 않는다(사용자 선택).

| 조각 | 어디 |
|---|---|
| 교실 프로그램(Windows) | NEIS_helper `app/classroom.py` · `app/core/classroom_{link,setup,controller}.py` · `app/web/classroom.*` — README «스페이스기전 교실» |
| 서버 | 기기 쪽 = DB RPC `classroom_device_call`(anon, 2026-11-10 — 아래 «기기 호출») · 교사 쪽 = Edge Function `supabase/functions/classroom-link/` (verify_jwt=false — 아래) |
| DB | 마이그레이션 `20261013220000_classroom_link.sql` · `20261110150000_classroom_device_rpc.sql`(기기 호출 RPC · QR 10분) |
| 휴대폰 승인 화면 | `/classroom/link/:code` = `src/features/classroom-link/ClassroomLinkPage.tsx`(본문 `ClassroomLinkBody.tsx` — 휴대폰에서는 가벼운 모바일 앱 `src/mobile` 이 같은 본문을 띄운다) (교직원 전용) |
| 세팅 편집 | **독립 화면 `/classroom` «교실 기기»**(메뉴 [도구], 교직원) = `ClassroomPage` · `components/PresetEditor`(끌어서 순서 · 탭으로 더하기 · 독 미리 보기) · `components/ItemIcon`(실제 아이콘) — 2026-10-14 프로필 카드에서 옮김 |
| 항목 규칙 | `src/features/classroom-link/presetItems.ts` (서버 CHECK · 교실 프로그램과 세 벌 — 회귀가 대조) |
| 회귀 | `npx tsx scripts/classroom-link-test/run.mts` · `npx tsx scripts/classroom-link-test/handler.mts` · NEIS_helper `cd app && python -m unittest test_classroom` |

## 흐름

```
교실 PC (DB RPC)             Edge Function classroom-link            휴대폰(교사, 스페이스기전 로그인)
start(device_key) ─────────▶ classroom_link 행(pending, 10분)
  QR = /classroom/link/<code>
poll 4초마다                                          ◀──────────── inspect(code) — 기기 이름 확인
                                                       ◀──────────── approve(code, preset_id, google_token?)
                             tokeninfo 로 구글 토큰 검사 · 스페이스기전 세션 발급(space 항목이 있을 때만)
                             → handoff 저장, status=approved
poll → handoff 를 한 번 받음 ─ handoff 를 지우고 status=active
세팅 펼치기 · 20초마다 poll(휴대폰에서 끝냈나)
end / 시간 지남 ───────────▶ status=ended · auth.sessions 에서 그 세션 삭제
                             (기기가 꺼져도 pg_cron classroom-link-sweep 5분마다)
```

## 결정과 이유

- **교실 기기는 로그인하지 않는다.** 처음 켤 때 만든 임의 키(DPAPI 로 그 PC 에 묶음)로만 자기를 증명하고,
  서버는 키의 sha256 만 둔다. 학생이 쓰는 공용 PC 에 교사 계정을 남기지 않으려는 것.
- **구글 드라이브는 «토큰을 넘기고 기기가 드라이브 API 로 탐색»한다.** 구글은 다른 기기로 로그인 세션을 넘기는 것을 막아
  drive.google.com 을 교실 기기에서 교사 계정으로 열 방법이 없다. 휴대폰이 승인할 때 GIS 팝업
  (`driveToken.ts` `requestClassroomDriveToken`, 같은 클라이언트 `491214877392-…`, **`drive`**)으로 **새** 토큰(1시간)을 받아 넘기고,
  서버가 tokeninfo 로 «같은 클라이언트 · 같은 교사 · 드라이브 범위 · 5분 넘게 남음»을 확인한 뒤 범위(scope)를 함께 넘긴다.
  이 토큰은 휴대폰에 저장하지 않는다(평소 드라이브 토큰 `google_popup_token` 과 섞지 않음).
  승인 화면의 «내 구글 드라이브 연결»은 기본으로 켜져 있다. 꺼도 드라이브 항목이 없는 세팅은 펼쳐진다.
- 🚨 **`drive` 는 구글의 «제한된 범위»다.** 구글 클라우드 OAuth 동의 화면이 **내부(Internal)** 여야 학교 계정이 검수 없이 허용한다.
  외부면 미확인 앱 경고·차단. 앱의 다른 기능은 여전히 `drive.file`(+calendar)만 쓴다.
- **드라이브 다시 연결**: 토큰이 끝나면 기기가 `purpose='drive'` QR 을 띄운다. 승인 화면은 세팅 목록 대신 [드라이브 다시 연결] 하나,
  `approve` 는 `preset_id` 없이 구글 토큰만 받는다. **그 기기에서 지금 수업 중인 교사 본인만** 된다(RPC 가 확인 — `not_session_teacher`).
  기기는 토큰만 바꾸고 그 연결을 바로 `end` 한다. 수업 연결·독은 그대로.
- 세팅의 드라이브 항목은 Picker 로 고른다(폴더 선택 가능). 폴더 = 독에서 탐색기를 그 폴더로, 파일 = 받아서 연다.
- **스페이스기전 화면 항목이 있을 때만 세션을 넘긴다.** 발급 방식은 `desktop-session` 과 같다(magiclink 를 서버가 바로
  소비 — 메일은 나가지 않는다, MFA 계정은 거부). 세션 id 를 `classroom_link.space_session_id` 에 적어 두고 끝날 때
  `auth.sessions` 행을 지운다 → 리프레시 토큰이 같이 죽는다. 이미 받은 액세스 토큰은 만료(최대 1시간)까지 남는다.
- **프로그램은 이름만.** 서버·세팅에는 `powerpoint` 같은 키만 있고 실행 파일 경로는 교실 기기가 찾는다. 목록 밖 이름은
  그 기기 관리자가 `%LOCALAPPDATA%\SpacekijunClassroom\classroom.json` 에 등록한 것만 열린다 —
  교사 계정 하나가 털려도 교실 PC 에서 아무것이나 실행하지 못하게.
- **웹사이트는 수업 전용 Edge 프로필**(수업 폴더 안 빈 프로필)로 연다. 거기서 누가 로그인해도 끝날 때 프로필째 지운다.
- **승인 화면은 지금 수업(시간표)과 같은 반 세팅을 맨 위로** 올리고, 맞는 것이 하나뿐일 때만 미리 고른다.
  추측해서 바로 펼치지는 않는다.
- **승인 화면(휴대폰 우선, 2026-10-14 개편)**: 기기 카드(이름·PC/전자칠판·QR 남은 시간, 다 되면 다시 물어 «만료») →
  «펼칠 세팅» 고르는 카드(교실 독 미리 보기 = 실제 아이콘) → «이번 수업» 옵션(드라이브 항목이 있는 세팅이면 드라이브 연결을 켜고 잠금)
  → 아래에 붙은 [거절] [이 기기에 펼치기](48px). 승인 뒤·만료·취소·드라이브 다시 연결은 각각 상태 카드.
- **구글 수업 도구(로그인 없이, 2026-10-14)** — 교실 기기에서 클래스룸(수업 목록·공지 보기/올리기·과제 제출 현황·수업 코드 QR)·
  슬라이드 발표(드라이브의 구글 슬라이드를 전체 화면으로)·설문지(응답 QR·응답 집계 15초마다)를 **구글 웹 로그인 없이** 쓴다.
  구글 웹(클래스룸 사이트 등)은 QR 토큰으로 로그인되지 않는다 — 기기가 구글 API 를 직접 부른다(드라이브와 같은 방식).
  승인 때 받는 토큰에 클래스룸 범위(`CLASSROOM_TOOL_SCOPES`: courses.readonly · announcements · coursework.students.readonly ·
  rosters.readonly · profile.photos · topics.readonly · courseworkmaterials.readonly — 원래 클래스룸처럼 스트림·수업·사용자 탭)를 더했고,
  서버(`CLASSROOM_SCOPES`)가 그 범위를 기기에 넘긴다. 슬라이드(Slides API)·설문지(Forms API)는 드라이브 범위로 된다.
  🚨 Google Cloud(클라이언트 491214877392 의 프로젝트)에서 **Google Classroom API · Google Slides API · Google Forms API** 를 켜야 한다.
  꺼져 있으면 기기가 «관리자에게 켜 달라고» 안내한다. 기기 쪽 허용 주소·쓰기 제한은 NEIS_helper `core/google_tools.py` · `GoogleApi.kt`.
- **휴대폰 탭 정리(2026-10-14 사용자 요청)** — QR 마다 휴대폰 브라우저에 탭이 쌓였다. `phoneTab.ts`:
  `useAutoCloseTab` = 할 일이 끝난 화면(비밀번호 보냄 · 드라이브 다시 연결 끝 · 끝난/만료된 연결)을 4초 뒤 `window.close()`,
  `useSupersededTab` = BroadcastChannel 로 같은 종류(link · drive · type)의 새 화면이 열리면 예전 화면을 닫는다(승인·보내는 중이면 둔다).
  수업 중 승인 화면은 «여기서 수업 끝내기» 때문에 자동으로 닫지 않는다 — 다음 수업 QR 을 찍으면 닫힌다. 드라이브 QR 은 종류가 달라 수업 화면을 닫지 않는다.
  🚨 브라우저는 스크립트가 연 탭이나 **방문 기록이 하나뿐인 탭**만 닫게 한다(실제 Edge 확인: 기록 1개 → 닫힘, 2개 → 막힘).
  로그인 화면을 거쳐 들어오면 막힐 수 있어 «이 창은 닫아도 됩니다» + [창 닫기](`components/CloseTabNote.tsx`)를 보인다.
- **휴대폰으로 구글 비밀번호 입력(2026-10-14 사용자 결정)** — 교실 기기에서 구글 웹(«웹으로 열기»)에 로그인할 때 칠판에서
  비밀번호를 치면 학생들에게 보일 수 있어, 기기가 QR(`/classroom/type/:code#k=<기기 공개키>`)을 띄우고 수업 중인 선생님이 휴대폰에서 입력한다.
  휴대폰이 기기 공개키(P-256)로 ECDH → HKDF-SHA256(salt=표, info=`spacekijun-classroom-type-v1`) → AES-256-GCM 으로 봉해(`typeCrypto.ts`)
  `type_submit` 으로 맡기고, 기기가 `type_poll` 로 한 번 받아 풀어 로그인 칸에 넣는다(받으면 바로 지움, 3분 만료, `classroom_type_relay`).
  서버는 암호문만 본다. 수업 중인 그 선생님만 보낼 수 있다. 🚨 Postgres 정규식 반복은 255 까지(20261014140000 에서 고침).
  기기 쪽: NEIS_helper `core/classroom_type.py`(수업용 Edge 에 UI Automation 으로 — 1.5.1) · `TypeRelay.kt`(앱 안 브라우저). 같은 표본으로 세 곳이 시험한다.
  🚨 1.5.0 은 CDP 로 넣으려고 Edge 를 `--remote-debugging-port` 로 띄웠는데, **구글은 그런 Edge 의 로그인을 막는다**(«브라우저 또는 앱이
  안전하지 않을 수 있습니다» — 사람이 직접 눌러도). 또 이메일 칸이 `type=email` 이 아니라 `type=text`(`#identifierId`)라 «구글 로그인 화면을
  찾지 못했습니다»로 실패했다(2026-10-14 사용자 보고, 실제 화면으로 확인).
- **항목 없는 세팅도 저장된다**(2026-10-14) — 교실 독에는 «구글»·«내 드라이브»가 늘 놓인다. 서버 검사(`classroom_preset_items_valid`)는 원래 빈 배열을 허용한다.
- **스페이스기전 데스크(교사판 1.3.6) 독 [도구]에 «교실 세팅»** — 이 화면(`/classroom`)을 데스크 안 스페이스기전 창으로 연다.
- **교사 동작은 정해 둔 웹 출처에서만**(`ALLOWED_ORIGINS` = 운영 도메인 · localhost:8080). 다른 사이트가 로그인한 교사의
  브라우저로 승인시키지 못하게. 기기 동작에는 CORS 를 붙이지 않는다.

- **구글 웹 로그인 보관(A+, 2026-10-14, 사용자 결정)**: 구글은 웹 로그인을 다른 기기로 넘기지 못하게 해, 클래스룸·슬라이드·폼은
  교실 독의 «구글»에서 선생님이 직접 로그인한다(이메일은 채워 둠). 그 수업용 Edge 프로필을 수업이 끝날 때 교실 PC 에 **암호화해 남기고**
  열쇠는 서버 `classroom_profile_key`(기기 키 해시 × 선생님)가 쥔다 — 같은 선생님이 같은 PC 에서 QR 승인할 때만 `handoff.profile {ref,key}`.
  승인 화면 «이 PC(칠판)에 로그인 보관»(기본 켬, `keep_google`)을 끄면 열쇠를 넘기지 않고 **있던 것도 지운다**.
  구글뿐 아니라 그 프로필의 모든 사이트 로그인(패들렛 등)이 함께 남는다 — 사이트는 «Google 계정으로 계속»으로도(사용자 결정 ①+②).
  전자칠판(안드로이드 1.3.0~)도 같은 열쇠로 앱 안 브라우저 데이터를 그 칠판에 보관한다(`WebVault.kt`, 안드로이드 9+).
  수업 중 독의 G 오른쪽 클릭 = 기기 동작 `forget_profile` → `classroom_profile_forget`(그 수업 교사의 그 PC 열쇠 삭제).
  기기 쪽 = NEIS_helper `core/classroom_vault.py`(AES-256-GCM, 캐시 제외, 60일 정리), 상세 `app/CLASSROOM.md`.

- **교실 기기 화면(2026-10-14)**: 세팅 카드(독 미리 보기 줄 · 지금 수업 · 복제 · 지우기 확인), «세팅이 없는 반» 바로 만들기,
  «지금 연결된 교실»(원격 수업 끝), «보관한 구글 로그인»(교실 PC 별 지우기), «최근 연결». 연결·보관은 service_role 표라
  **본인 것만·비밀 없이** 돌려주는 RPC `my_classroom_overview()` · `forget_my_classroom_login(ref)`(마이그레이션 `20261014110000`).
- **화면 규약(2026-10-14)**: 머리글에 기능명·아이콘 없음(검색·[사용 방법]·[새 세팅]만, `scripts/page-header-rule-test` 에 «교실 기기» 추가), `PageContainer`, 편집기 = 모달 디자인 부품(`dialogDesign` 머리·본문·바닥, `SectionLabel`), 휴대폰은 전체 화면·«더하기»가 «순서» 위·칩 가로 밀기·누를 곳 44px·끌기는 길게 눌러(TouchSensor).
- **추천 사이트**: 웹사이트 탭에 패들렛·ChatGPT·Gemini·Claude·캔바·미리캔버스·띵커벨·카훗·클래스카드·멘티미터·퀴즈즈·리로스쿨·판서노트(`SUGGESTED_SITES`) — 누르면 넣고 다시 누르면 뺀다. 항목에 `site` 키, 아이콘은 사이트에서 받아 둔 `public/classroom-icons/sites/<키>.png`(교실 프로그램에도 같은 그림).
- **구글 앱**: 세팅에 클래스룸·설문지 등을 넣을 수 있다 — 웹사이트 항목에 `app` 키(`presetItems.GOOGLE_APPS`, 교실 프로그램 `GOOGLE_APPS` 와 같은 키). 서버 CHECK 는 그대로.
- **실제 아이콘**: 구글 앱 = `public/classroom-icons/google`(구글 공식 아이콘), 프로그램 = `public/classroom-icons/programs`(Windows 실행 파일에서 뽑음,
  없는 것은 글자 타일), 웹사이트 = 파비콘, 드라이브 = 드라이브 형식 아이콘. 교실 독도 같은 출처(교실 PC 에서는 설치된 실행 파일에서 다시 뽑는다).

## 스키마

| 표 | 내용 | 접근 |
|---|---|---|
| `classroom_preset` | 교사의 반별 세팅 — `title` · `section_name`(«과목 학년-반», `teacherSectionName` 과 같은 모양, null = 공통) · `items` jsonb(최대 30, CHECK `classroom_preset_items_valid`) · `auto_end_minutes`(10~240) · `sort_order` · `last_used_at` | RLS 본인만. 쓰기는 `is_staff_teacher_or_admin` 도 |
| `classroom_device` | 한 번이라도 승인된 기기 — `key_hash`(sha256) · `name` · `platform`(windows/android) · `last_user_id` | 정책 없음 = service_role 전용 |
| `classroom_link` | QR 한 장 = 연결 한 건 — `code` · `device_key_hash` · `status`(pending→approved→active→ended / cancelled) · `expires_at`(QR 3분) · `approved_by` · `preset_id` · **`handoff`**(기기가 받아 가면 null) · `space_session_id` · `ends_at`(승인 + auto_end, 연장은 승인부터 최대 4시간) | 정책 없음 = service_role 전용 |

| `classroom_profile_key` | 구글 로그인 보관 열쇠 — `(device_key_hash, user_id)` PK · `ref`(기기의 보관 파일 이름) · `secret`(base64 32바이트) · `last_used_at` (마이그레이션 `20261014100000`) | 정책 없음 = service_role 전용 |

🚨 **`classroom_link.handoff` 에는 교사의 구글 토큰과 스페이스기전 세션이 잠시 들어간다.** 이 표에 SELECT 정책을 만들거나
RPC 를 authenticated 에 열면 남의 토큰이 열린다. RPC 9개(`classroom_link_start/poll/extend/end/inspect/approve/stop/revoke/sweep`)는
전부 service_role 에만 EXECUTE 가 있다.

### 기기 호출 — DB RPC `classroom_device_call` (2026-11-10)

교실 기기는 Edge Function 대신 `POST /rest/v1/rpc/classroom_device_call` (anon 키)로
`{p_action, p_device_key, p_args}` 를 보낸다. 동작은 `start · poll · extend · end · forget_profile · type_start · type_poll · type_cancel`.
함수가 기기 키를 sha256 으로 바꿔 위 RPC 를 대신 부른다 — 키가 맞는 기기의 행만 보이므로 anon 에 열어도 남의 handoff 는 못 받는다
(Edge Function 의 기기 경로와 같은 규칙). 알려진 오류는 200 `{"error": 코드}`.

- 왜: QR 화면에서 2초마다 묻는 poll 이 Edge Function 한도를 넘길 만큼 많았다(2026-11-10 하루 기기 18대 · QR 대기 169시간 ≈ 30만 번).
  DB RPC 는 Edge Function 호출 수에 들지 않는다.
- 같이 바꾼 것: QR 수명 3분 → 10분 · 기기 poll 2초 → 4초 · 평일 07~18시 밖에는 QR 을 10분 띄운 뒤 쉰다(서버 안 부름, 화면을 누르면 다시).
  교실 프로그램 Windows 1.5.9 · 안드로이드 1.3.3 부터.
- Edge Function 은 교사 동작(inspect · approve · stop · type_inspect · type_submit) 때문에 남는다. 기기 동작도 아직 받는다(옛 판용).
- 회귀: `supabase/tests/classroom_device_rpc.sql`(rollback).

항목 `items[]` 모양:

```json
{"kind":"drive","id":"<파일 id>","name":"1단원.pptx","mimeType":"application/vnd.google-apps.presentation"}
{"kind":"url","url":"https://padlet.com/...","name":"패들렛"}
{"kind":"program","program":"powerpoint","name":"PowerPoint"}
{"kind":"space","path":"/seat-arrangement","name":"자리 배치"}
```

정리: 끝난 연결은 handoff 없이 30일, 대기·취소는 하루 뒤 `classroom_link_start` 가 지운다.

## 함정

- **Postgres 정규식 반복 횟수는 255 까지.** 처음 CHECK 의 `[^\s]{1,2000}` 이 «invalid repetition count(s)»(2201B)로 터져 웹사이트가 든 세팅 저장이 전부 400 이었다(2026-10-13, `20261013230000` 에서 길이는 `char_length` 로 분리). 롤백 드라이런은 행을 넣지 않으면 이것을 못 잡는다 — 그 마이그레이션은 정상·비정상 항목을 직접 넣어 보는 DO 블록을 둔다.
- `verify_jwt=false` 다(`config.toml` 에 선언). 기기는 로그인 전이라 JWT 가 없다. 교사 동작은 함수 안에서 `auth/v1/user` 로 확인한다.
- 독 → 교실 프로그램 쪽 상세(되올리기·못 올린 파일·정리 순서)는 NEIS_helper `app/CLASSROOM.md`.
- 기기에서 Picker 는 쓰지 않는다 — 세팅 창(프로필)에서만. 세팅 창은 Picker 가 떠 있는 동안 모달을 내린다
  (Radix 포커스 가두기 때문에 Picker 를 누를 수 없다).
- GIS 팝업은 운영 도메인에서만 된다(localhost 미등록). 개발 서버에서 드라이브 항목이 든 세팅은 승인되지 않는다.
- 연결 시험을 휴대폰 없이 하려면 `classroom_link` 의 대기 행 하나를 SQL 로 `approved` + 가짜 handoff(토큰 없음)로 바꾸면
  기기가 받아 간다(2026-10-13 이렇게 웹사이트·메모장·없는 프로그램 실패 표시·[수업 끝내기] 정리까지 확인).

## 남은 일

- 휴대폰 실기 승인(GIS 팝업이 모바일 브라우저에서 막히지 않는지, `drive` 범위 허용 — 동의 화면 종류 확인) · 실제 토큰으로 탐색·되올리기.
- 안드로이드 전자칠판판 — NEIS_helper `android/`(2026-10-14, 1.0.0, 상세 `android/README.md`). 같은 서버 계약(`platform: 'android'`).
  다른 점: 사이트·구글 앱·스페이스기전은 앱 안 브라우저(끝나면 지우거나 보관 켬이면 칠판에 암호화해 둠 — 1.3.0),
  프로그램 키는 안드로이드 앱으로(Windows 전용은 «이 칠판에 없음»). 키가 같은지 `scripts/classroom-link-test` ③ 이 본다.

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

### 교실 기기 QR 세팅 (2026-10-13)

교실 PC 프로그램(NEIS_helper `app/classroom.py`)이 QR 을 띄우고 교사가 휴대폰(`/classroom/link/:code`)에서 반별 세팅(`classroom_preset`)을 골라 승인한다. Edge Function `classroom-link`(verify_jwt=false — 기기는 기기 키, 교사는 함수 안 `auth/v1/user`). **🚨 `classroom_link.handoff` 에 교사 구글 토큰·스페이스기전 세션이 잠시 든다 — 이 표에 정책을 만들거나 `classroom_link_*` RPC 를 authenticated 에 열지 말 것.** 구글 웹 로그인 보관 열쇠 `classroom_profile_key`(2026-10-14)도 같다 — 새면 교실 PC 의 보관 파일로 그 교사 구글에 들어간다. 항목 규칙은 서버 CHECK · `presetItems.ts` · 교실 프로그램 세 벌(회귀 `scripts/classroom-link-test/`). 상세 `docs/features/classroom-link.md`.
