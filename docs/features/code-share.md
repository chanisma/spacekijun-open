# 코드 공유 (`/code-share`, 2026-10-01 신설)

바이브코딩(AI 와 함께 만든 코드)으로 만든 사이트·코드를 **올리고 · 이 화면 안에서 실행해 보고 ·
내 것으로 가져가 응용**하는 기능. 깃허브의 "저장소 · 공개 · 포크"를 학교 규모로 줄인 것이다.
**학생 + 교직원(직원 포함)이 같은 화면**을 쓴다 — 올리는 사람의 대다수가 학생이다(사용자 결정).

| 자리 | 파일 |
|---|---|
| 순수 로직(단일 출처) | `src/lib/codeShare.ts` |
| 데이터 계층 | `src/features/code-share/services/codeShareService.ts` · `hooks/useCodeProjects.ts` |
| 화면 | `CodeSharePage.tsx`(목록) · `CodeProjectPage.tsx`(상세) · `components/CodeRunner.tsx`(실행) · `CodeWorkspace.tsx`(코드 보기·편집) · `CodeUploadDialog.tsx` · `ForkDialog.tsx` · `CodeProjectEditDialog.tsx` |
| DB | `supabase/migrations/20261001220000_code_share.sql` → `docs/database/core.md` 「코드 공유」 |
| 회귀 | `npx tsx scripts/code-share-test/run.mts` |
| 샘플·적재 | `scripts/code-share-test/samples/`(단일 HTML · 정적 폴더 · React+Vite · Claude 스킬) + `seed-samples.mts <owner_resource_id> <uid>` → SQL(재실행 안전, 텍스트 파일만) |

### 샘플 폴더 회귀가 잡은 결함 (2026-10-01)

`encodeURIComponent` 는 `'`·`(`·`)` 를 인코딩하지 않는다. 홑따옴표가 든 JS 를 data: URL 로 만들어 `from '…'` 안에 넣으면 **문자열이 거기서 끊기고**,
`)` 가 든 CSS 는 따옴표 없는 `url(…)` 을 끊는다 — 오류 없이 모듈이 조용히 안 뜬다. `toTextDataUrl` 이 셋을 더 인코딩한다. 단위 테스트로는 안 잡혔고
**실제 폴더 샘플을 통째로 합쳐 겹을 벗겨 가며 확인하는 검사**에서만 드러났다(중첩 data: URL 은 겹마다 한 번씩 인코딩되므로 전체를 한 번 디코드해 찾으면 안 된다).

## 실행은 코드 종류마다 다르다

"올린 코드를 실제로 돌려볼 수 있는가"가 이 기능의 핵심 질문이었다. 답은 **종류에 따라 셋**이다.

| `kind` | 판정 | 실행 | 어디서 |
|---|---|---|---|
| `html` | 파일이 하나뿐이고 .html | 그 파일 그대로 `<iframe srcdoc>` | 우리 화면 |
| `static` | .html 이 있고 파일이 여럿(package.json 없음) | `assembleStaticDocument` 가 상대 참조(`src`·`href`·CSS `url()`·`@import`·JS 상대 `import`)를 **data: URL** 로 바꿔 한 문서로 | 우리 화면 |
| `node` | 루트에 `package.json` | **Sandpack**(`@codesandbox/sandpack-react`) — CodeSandbox 번들러가 브라우저에서 빌드 | 외부 서비스(codesandbox.io) 에 기댄다 |
| `skill` | 루트에 `SKILL.md`(**다른 무엇보다 먼저** — package.json 이 있어도 스킬) | 실행 없음. **[문서] 보기**가 기본 — SKILL.md·references/*.md 를 렌더해 읽는다 | 우리 화면 |
| `other` | .html 도 package.json 도 없음(파이썬 등) | 없음 — 보기·내려받기·가져가기만(문서가 있으면 [문서]) | — |

### ⚠️ `node` 실행 — Nodebox 는 vite 5 를 못 돌린다 (2026-10-02 실제 장애)

`package.json` 프로젝트는 Sandpack 의 **Nodebox**(브라우저 안 Node 흉내)에서 `npm run dev` 가 돈다. Nodebox 는 네이티브 바이너리를 못 쓰므로
esbuild 대신 **`esbuild-wasm`** 이 있어야 하고, Sandpack 의 `vite-react` 템플릿은 그래서 `vite 4.1.4 · esbuild-wasm 0.17.12 · @vitejs/plugin-react 3.1.0` 으로
고정돼 있다. 사용자의 `package.json`(vite 5) 을 그대로 넘기면 그 고정이 덮여 `Cannot find module 'esbuild-wasm'` 으로 죽는다.
→ `buildSandpackSetup` 이 vite 계열 템플릿이면 **실행용 package.json 을 다시 쓴다**(`buildNodeboxPackageJson`): 런타임 의존성은 사용자 것, 도구만
`NODEBOX_VITE_TOOLCHAIN` 으로, `@vitejs/plugin-react-swc`(네이티브) 는 `plugin-react` 로 대체. **사용자의 원본 package.json 은 [코드] 탭에 그대로 보인다**
(다른 Provider). Sandpack 을 올리면 `node_modules/@codesandbox/sandpack-react/dist/index.mjs` 의 `VITE_REACT_TEMPLATE` 고정값을 다시 맞출 것.

### Claude 스킬 (2026-10-02 추가)

스킬 = `SKILL.md`(머리말 `name`·`description`) + `references/`·`scripts/` 폴더. **읽는 것**이지 실행하는 것이 아니라
상세 화면의 보기가 `[문서] · [코드]` 가 되고(실행 탭 없음) 머리에 「zip 을 받아 `.claude/skills/<name>/` 에 풀면 `/<name>` 으로 부른다」가 뜬다.
- **[문서] 보기 = `MarkdownReader`**: `react-markdown` + `remark-gfm` + `@tailwindcss/typography`(`prose`) — 이 기능에서 처음 들였다.
  문서 순서 = `listMarkdownPaths`(SKILL → README → 나머지), 머리말은 `parseFrontmatter`(한 줄 `key: value` 와 `>`/`|` 여러 줄만 — YAML 파서를 들이지 않았다)
  로 떼어 칩으로, **문서 사이 상대 링크는 같은 보기 안에서 열린다**(`resolveMarkdownLink` — `../`·해시·확장자 없는 링크 보완). 상대 이미지는 묶음 파일로 푼다.
  **[문서] 탭은 스킬이 아니어도 .md 가 하나라도 있으면 생긴다**(README 읽기).
- **`.claude/` 폴더는 받는다** — 점 폴더 금지의 유일한 예외(`ALLOWED_DOT_SEGMENTS`). `.claude/skills/my-skill/` 째로 올려도 공통 루트가 벗겨져
  `SKILL.md` 가 루트에 온다. 그 안의 `.env` 는 여전히 빠진다.
- 종류 CHECK 에 `skill` 추가 = 마이그레이션 `20261001230000`.

바이브코딩 산출물의 대다수가 단일 HTML(AI 도구가 "복사해서 바로 여는" 파일을 내므로 React 도 UMD CDN 으로
한 파일에 담긴다)이라 **`html`·`static` 두 단계만으로 실사용 대부분이 외부 의존 없이 돈다.**

### 왜 blob: 이 아니라 data: 인가

실행 iframe 은 `sandbox="allow-scripts …"` 로 **출처 없음(opaque origin)** 이다. blob: URL 은 만든 출처에
묶여 있어 그 안에서 읽힌다는 보장이 브라우저마다 다르다. data: URL 은 출처가 없어 어디서나 읽히고,
**Blob 없이 문자열만으로 만들어지므로 합치기가 순수 함수**가 된다(= Node 에서 회귀 테스트가 돈다).
단점은 같은 모듈을 여러 파일이 import 하면 그만큼 중복돼 문서가 커지는 것 — 상한
`CODE_SHARE_LIMITS.maxInlineAssetBytes`(8MB) 를 넘는 이진은 건너뛰고 화면이 말한다.

### ⚠️ 조용히 뚫리는 자리

- **`allow-same-origin` 을 sandbox 에 넣지 말 것.** 넣는 순간 올린 코드가 우리 앱 출처에서 돌아
  Supabase 세션·localStorage 를 읽는다. 값은 `CODE_RUN_SANDBOX` 한 곳이고 회귀가 정적으로 검사한다.
- **"새 창에서 열기"를 만들지 말 것.** blob: URL 을 새 탭에 열면 그 코드가 **우리 출처**에서 돈다(위와 같은 구멍).
  전체 화면 토글이 그 자리를 대신한다. 회귀가 `CodeRunner.tsx` 에 `window.open`·`createObjectURL` 이 없는지 본다.
- **`.env` 는 받지 않는다.** `isIgnoredProjectPath` 가 점으로 시작하는 조각을 전부 뺀다 — 바이브코딩 프로젝트에
  API 키가 든 `.env` 가 흔하고, 받아 주는 순간 학교 전체에 공유된다. node_modules·dist·lockfile 도 뺀다.
- **상세는 반드시 RPC `get_code_project` 로 읽는다.** '링크를 아는 사람' 공개는 목록 SELECT 정책에 없다
  (RLS 로는 "목록에 안 보임"을 표현할 수 없어 RPC 로 갈랐다). 표를 직접 읽으면 링크 공유가 오류 없이 빈 화면이다.
- **사람은 `resource.id`** 다 — 학생은 `user_resource` 가 없다(2026-09-09 협업 보드 사고). 신원은
  `unifiedAuth.getCurrentResourceId()` / 서버 `current_actor_resource_ids()` 하나.

## 올리기 3경로

붙여넣기(HTML 한 장) · 파일/폴더 선택 또는 끌어다 놓기(`webkitdirectory` — React 가 모르는 속성이라 ref 로 단다,
드롭은 `react-dropzone` 이 폴더를 재귀로 편다) · zip(`jszip`). 세 경로 모두 `planUpload` 를 거친다 —
경로 정규화(`..` 거부) → 무시 목록 → **공통 루트 벗기기**(zip 의 `my-app/` · 이중 포장도) → 중복 제거.
텍스트/이진은 **확장자**로 가른다(모르는 확장자 = 이진 — 그대로 저장하면 아무것도 잃지 않는다).
종류·진입 파일(`index.html` 얕은 것 우선)은 코드가 판정하고 사람은 제목·설명·공개 범위·만든 도구·태그만 정한다.

## 공개 범위 3종 · 가져가기 · 편집

| `visibility` | 목록 | id 로 열기 | 수정·삭제 |
|---|---|---|---|
| `school` 학교 전체 | 로그인 전원 | 전원 | 본인·관리자 |
| `link` 링크를 아는 사람 | **본인만** | 로그인 전원 | 본인·관리자 |
| `private` 나만 | 본인 | 본인·관리자 | 본인·관리자 |

외부(로그인 없는) 공유 링크는 **만들지 않았다**(사용자 결정) — public 라우트·anon 정책이 전부 필요해지고
올린 코드가 인터넷에 노출된다. 링크 복사 토스트가 "로그인한 사람만 열 수 있다"고 말한다.

**가져가기(포크)** = 볼 수 있으면 누구나. 텍스트는 행 복사, 이진은 버킷 안 `copy`(내려받아 다시 올리지 않는다),
`forked_from` 에 계보가 남아 상세 머리글이 「원본 ○○ (△△△)」를 링크한다. 원본이 비공개로 바뀌거나 지워지면
"원본은 비공개이거나 삭제됨"(사본은 남는다 — `on delete set null`). 원본 쪽은 「N명이 가져감」(비공개 사본도 센다 — 숫자만).

**편집** = 소유자가 [파일 편집] 을 켜면 Sandpack 의 CodeMirror 편집기가 쓰기 가능이 되고, [저장] 이 **바뀐 파일만**
upsert 한다(새 파일·이 파일 삭제 포함). 하이라이팅 라이브러리를 따로 들이지 않은 이유 — Sandpack 이 이미 안고 있다.
작업대는 미리보기를 그리지 않으므로 번들러가 뜨지 않는다(`template="static"` 은 파일 트리를 위한 껍데기).

## 저장

텍스트 = `code_project_file.content`, 이진 = 비공개 버킷 `code-projects` 의 `<project_id>/<path>` + `storage_path`.
행 먼저 파일 나중 — 파일 쓰기가 실패하면 행을 지워(cascade) 고아를 남기지 않는다. `file_count`·`total_bytes` 는
파일 표 트리거(DEFINER)가 유지한다(목록 카드가 파일을 세지 않는다).
한도 = 파일 300개 · 텍스트 1MB/장 · 이진 5MB/장 · 전체 20MB(`CODE_SHARE_LIMITS`).

## RLS 실측 (2026-10-01, 실제 학생·교사 계정으로 롤백 트랜잭션)

학생 `insert … returning` ✅ · 학생 파일 insert + 집계 ✅ · 학생이 교사 명의로 insert **42501** · 교사가 남의 프로젝트 update **0행** ·
남의 프로젝트에 파일 insert **42501** · link = 교사 목록 **0행** / `get_code_project` **1행** / 파일 열람 1행 · private = 교사 RPC 0행 / 파일 0행 ·
anon `get_code_project` **42501** · JWT 없는 authenticated 목록 0행.

## 하지 않은 것 · 다음 후보

- **깃허브 저장소 URL 가져오기** — 공개 저장소는 `api.github.com` 이 CORS 를 허용해 클라이언트만으로 된다. 2차.
- ~~README 마크다운 렌더~~ — 2026-10-02 스킬 지원과 함께 [문서] 보기로 들어왔다.
- **좋아요·댓글·조회수** — 요구가 생기면 협업 보드 댓글 표를 본보기로.
- **Service Worker 로 정적 서빙** — sandbox 된 iframe(출처 없음)은 SW 를 등록할 수 없어 애초에 길이 아니다.
- **휴대폰 화면 실측 스크린샷** — 아직. `CodeUploadDialog` 는 `mobile="fullscreen"`, 나머지 모달은 유도.

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

| `code-share` | **코드 공유** (`/code-share`, 2026-10-01). 바이브코딩 산출물을 올리고(붙여넣기·폴더·zip)·**이 화면 안에서 실행**하고·가져가기(포크). **학생 + 교직원 같은 화면**(사람 = `resource.id`, 신원 = `current_actor_resource_ids()`). 실행은 종류 셋 — `html`(srcdoc) · `static`(상대 참조 → **data: URL** 로 한 문서, 순수 함수 — ⚠️ `'`·`(`·`)` 를 추가 인코딩해야 모듈이 안 끊긴다) · `node`(Sandpack — 외부 서비스) · `other` 는 보기만. **`skill`(루트 `SKILL.md`, 2026-10-02) 은 실행 대신 [문서] 보기**(`MarkdownReader` — react-markdown+GFM+typography, 문서 간 링크, `.claude/` 폴더 허용) — .md 가 있으면 어느 종류든 [문서] 탭이 생긴다. ⚠️ sandbox 에 `allow-same-origin` 금지 · "새 창에서 열기" 금지(blob: 을 새 탭에 열면 우리 출처에서 돈다) · `.env`·node_modules 는 받지 않는다 · **상세는 RPC `get_code_project`** 로만(「링크를 아는 사람」 공개는 목록 SELECT 정책에 없다) · 외부(비로그인) 링크 없음(사용자 결정). 코드 뷰어·편집기 = Sandpack 의 CodeMirror(하이라이터를 따로 안 들였다). 회귀 `npx tsx scripts/code-share-test/run.mts`(106) | `src/lib/codeShare.ts`(단일 출처), `codeShareService.ts`, `CodeRunner.tsx`, `CodeWorkspace.tsx` · `docs/features/code-share.md`, 스키마 `docs/database/core.md` 「코드 공유」 |
