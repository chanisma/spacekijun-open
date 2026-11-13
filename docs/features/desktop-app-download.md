# PC 앱 내려받기 (`/desktop-app`, 2026-10-20)

교직원 = **스페이스기전 데스크**(SPACEKIJUN Desktop, `SpacekijunDesk.exe`), 학생 = **스페이스기전 학생**
(SPACEKIJUN Student, `SpacekijunStudent.exe`). 앱의 원본·빌드는 NEIS_helper 저장소.

## 자리
- 진입점 = 사이드바 **[도구] «스페이스기전 데스크톱»** (2026-10-20 사용자 결정 — 처음엔 헤더 사용자 메뉴였다).
  교사 네비는 기존 [도구] 끝, **학생 네비는 이 메뉴 하나로 [도구] 범례를 새로 만들었다**(`student-tools`, 신청 다음).
  메뉴 카탈로그(`menuRegistry`)에 있어 관리자가 대상별로 켜고 끌 수 있다.
- 휴대폰에서도 메뉴는 보인다(햄버거 시트) — 열면 «Windows PC 에서 받으세요» 안내. 하단 5칸에는 영향 없음.
- 보이는 앱: 학생(관리자 학생 미리보기 포함) = 학생판 · 교직원 = 데스크 · **실제 관리자 = 둘 다**(배포 확인용) — `desktopAppsForViewer`.

## 배포본 = 이미 있는 것을 그대로
새로 올리지 않는다. 앱의 자동 업데이트가 읽는 Supabase Storage 공개 버킷 `desk-releases/<teacher|student>/` 를 읽는다
(올리기 = NEIS_helper `deploy/desk-update/publish.py [--student]`). 그래서 **새 판을 올리면 웹 다운로드도 저절로 새 판**이다.

- `latest.json` = `{manifest:{app,version,size,sha256,parts[],published}, signature}`, 실행 파일은 20MB 조각(`<버전>/<앱>.exe.partN`).
- 브라우저가 조각을 받아 이어 붙이고 조각마다·전체 SHA-256 을 맞춘 뒤 한 파일로 저장한다(업데이터 `download` 와 같은 확인).
- 목록의 **Ed25519 서명**을 업데이터와 같은 공개 키로 확인한다 — 저장소 계정이 털려도 남의 실행 파일을 내려주지 않는다는
  업데이터의 보증을 웹까지 잇는다. 서명을 확인할 수 없는 옛 브라우저(WebCrypto Ed25519 미지원)는 **받지 않고** 업데이트를 안내한다.
- 파일 이름에 판 번호를 붙이지 않는다 — 앱이 제자리에서 스스로 새 판으로 바뀌어 이름의 번호가 곧 거짓이 된다.

## ⚠️ 조용히 틀리는 자리
- 서명된 바이트 = Python `json.dumps(sort_keys=True, separators=(',',':'), ensure_ascii=True)`. `canonicalJson` 이 같아야 한다
  — 한 글자라도 다르면 모든 다운로드가 «서명 불일치»로 막힌다(회귀가 Python 출력과 대조).
- `DESKTOP_RELEASE_PUBLIC_KEY` ↔ NEIS_helper `app/core/updater.py` `PUBLIC_KEY` — 서명 키를 바꾸면 둘 다(회귀가 대조).
- 앱 이름(`SpacekijunDesk`/`SpacekijunStudent`)·조각 이름 규칙도 업데이터 `check_manifest` 와 짝.

## 사용 안내 영상
`DESKTOP_APP_GUIDE_VIDEOS`(`src/lib/desktopApps.ts`)에 `{ id, title, channel? }` 한 줄씩. `id` = 유튜브 id(`youtubeIdOf` 로
주소에서 꺼낼 수 있다), `channel` 을 주면 그 앱을 보는 사람에게만. 비어 있으면 영상 칸을 그리지 않는다.
누르기 전에는 유튜브를 부르지 않는다(youtube-nocookie, 아카데미 프롤로그 영상과 같은 방식).

현재(2026-10-20) = 채널 «샘플고 찬쌤»의 **일부 공개** 영상 둘(일부 공개도 퍼가기로 재생된다 — 실제 크롬에서 확인):
- `jtt4hbKe_Nw` 에이전트 터미널 사용법과 활용 → 모두(영상 설명이 데스크·학생판 독을 함께 다룬다)
- `I2rJ6LEUlNM` 스페이스기전 교실 사용 방법 → 교직원만

일부 공개 영상은 검색에 안 잡히므로 새 영상 id 는 YouTube Studio «콘텐츠» 목록에서 찾는다.

## 회귀
- `npx tsx scripts/desktop-app-download-test/run.mts` — Python 대조 · 라이브 목록 서명 · 변조 거부 · 공개 키 짝 · 영상/역할 (`FULL=1` 이면 학생판을 실제로 받아 확인)
- `node scripts/desktop-app-download-test/run-browser.mjs` — 하네스(`/scripts/desktop-app-download-test/index.html?who=teacher|student|admin&videos=1`)를
  실제 크롬으로 1280·390 스크린샷 + 학생판 끝까지 내려받아 크기 대조. 개발 서버 필요(`MODAL_TEST_URL`), playwright 가 전역에만 있으면 `PLAYWRIGHT_MODULE`.

## «이세계에서는 사회인» 3D 모델 받기 (2026-10-21)

사용자 요청: «학생 스페이스기전 데스크톱 메뉴에 이세계에서는 사회인의 3D 모델의 설치 파일을 다운 받을 수 있도록 · 공유는 구글 드라이브 활용» — 링크는 **관리자가 바꾼다**(사용자 결정).
- 카드 = `features/desktop-app/GameModelCard.tsx`, 학생판을 보는 사람(학생 · 실제 관리자)에게만(`DesktopAppPage` 가 `extra` 슬롯으로 넣는다 — 본문은 세션 없이 그려져야 해서 슬롯).
- 저장 = `system_settings` 키 `isekai3d_model_download`(`{url, note, updatedAt}`), 실제 관리자가 카드의 [링크 바꾸기]로 넣는다. 조회 → update/insert(`created_by` 보존 · RLS 는 0행으로 막는다).
- ⚠️ 링크는 **https 구글 드라이브(drive.google.com · docs.google.com)만** — 학생이 실행 파일을 받는 단추라 관리자 실수·계정 탈취로 아무 사이트로 보내지 않게. 저장 때와 읽을 때 둘 다 `validateDriveUrl`(`src/lib/gameModelDownload.ts`). 링크가 없거나 어긋나면 «아직 준비 중».
- 드라이브 쪽 공유 설정(«링크가 있는 모든 사용자» 또는 학교 도메인)은 관리자 몫 — 카드의 편집 칸이 그렇게 안내한다.
- 회귀 `npx tsx --tsconfig tsconfig.app.json scripts/desktop-app-download-test/game-model.mts`(14).

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

| `desktop-app` | **PC 앱 내려받기** (`/desktop-app`, 2026-10-20). 교직원 = 스페이스기전 데스크 · 학생 = 스페이스기전 학생(실제 관리자 = 둘 다). 진입점 = 사이드바 [도구] «스페이스기전 데스크톱»(학생 네비는 이 메뉴로 [도구] 범례 `student-tools` 신설). **새로 올리지 않는다** — 앱 자동 업데이트가 읽는 공개 버킷 `desk-releases/<teacher\|student>/` 의 서명 목록 + 20MB 조각을 브라우저가 받아 이어 붙이고 조각·전체 SHA-256 과 **Ed25519 서명**(업데이터와 같은 공개 키)까지 확인한다(서명 확인 못 하는 옛 브라우저는 거부). ⚠️ `canonicalJson` = Python `json.dumps(sort_keys, separators, ensure_ascii)` 바이트 · 공개 키 ↔ NEIS_helper `updater.py` 짝(회귀가 대조). 안내 영상 = `DESKTOP_APP_GUIDE_VIDEOS` 한 줄씩(누르기 전엔 유튜브 안 부름). 회귀 `npx tsx scripts/desktop-app-download-test/run.mts` + `run-browser.mjs` | `src/lib/desktopApps.ts`, `DesktopAppDownloads.tsx` · `docs/features/desktop-app-download.md` |
