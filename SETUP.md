# 설치 안내

## 1. 준비물

- Node.js 20+
- Supabase 프로젝트 1개 (https://supabase.com — 무료 요금제로 시작 가능)
- Supabase CLI (`npx supabase` 로 충분)
- Google Cloud OAuth 클라이언트(로그인·드라이브)
- (선택) Upstage Solar 또는 OpenAI API 키 — AI 기능
- (선택) NEIS 오픈 API 키 — 학사일정·급식

## 2. 우리 학교 값 넣기

```bash
npm install
cp school.config.example.json school.config.json
```

`school.config.json` 을 채웁니다.

| 칸 | 뜻 | 예 |
|---|---|---|
| `schoolName` | 학교 정식 이름 | 한빛고등학교 |
| `shortName` | 줄임 이름 | 한빛고 |
| `emailDomain` | 교직원·학생 구글 계정 도메인 | hanbit.hs.kr |
| `neisOfficeCode` | 시도교육청 코드 | B10 |
| `neisSchoolCode` | 학교 코드(7자리) | 7010000 |
| `supabaseProjectRef` | Supabase 프로젝트 ref | abcdefghijklmnopqrst |

NEIS 코드는 [나이스 교육정보 개방 포털](https://open.neis.go.kr) «학교기본정보»에서 찾습니다.

```bash
node scripts/setup-school.mjs          # 바뀔 곳 미리 보기
node scripts/setup-school.mjs --write  # 실제로 바꾸기
```

## 3. 데이터베이스

Supabase 대시보드 › SQL Editor 에서 **순서대로** 실행합니다(파일이 커서 `psql` 이 편합니다).

```bash
psql "$DATABASE_URL" -f supabase/schema/00_baseline.sql   # 구조 (표 450여 개 · 함수 · RLS)
psql "$DATABASE_URL" -f supabase/schema/10_seed.sql       # 설정·카탈로그 (코인 경제 · 에이전트 도구 정책 · 다마고찌 아이템 · 저장소 버킷 …)
psql "$DATABASE_URL" -f supabase/schema/20_cron.sql       # 정기 작업 (pg_cron 확장을 먼저 켤 것)
```

`DATABASE_URL` = 대시보드 › Project Settings › Database › Connection string.

먼저 켤 확장: `pg_cron`, `pg_net`, `vector`, `pgcrypto`(대시보드 › Database › Extensions). `00_baseline.sql` 이 확장을 만들다 실패하면 해당 확장을 켜고 다시 실행하세요.

DB 가 엣지 함수를 부르는 기능(웹 푸시·뉴스 태그·시세·아카데미 생성)을 쓰려면
`supabase/schema/30_private_config.sql.example` 을 복사해 값을 채운 뒤 실행합니다(채운 파일은 커밋 금지).

### 생기부는 DB 에 올리지 않는다
생기부 본문(세특·창체·행특·독서·봉사·출결)과 성적(교과·모의고사)은 DB 에 넣지 않습니다.
교사 PC 의 `local-records/` 폴더에 학생마다 파일 하나로 두고, 웹이 그 자리에서 읽습니다.
DB 에는 명단(`resource`, type='student')만 넣습니다.
- 폴더 구조·칸 정의: `docs/student-records-local.md`
- 예시: `local-records.example/`

아직 DB 표를 읽는 화면(학생 기록 관리·성적 분석 등)은 표가 비어 있어 빈 상태로 보입니다. 옮길 목록도 같은 문서에 있습니다.

## 4. 인증

1. Supabase › Authentication › Providers › **Google** 켜기 — Google Cloud 의 OAuth 클라이언트 ID·비밀
2. Google Cloud › OAuth 동의 화면의 승인된 리디렉션 URI 에 `https://<ref>.supabase.co/auth/v1/callback`
3. 첫 관리자: 로그인한 뒤 SQL 로 역할을 줍니다
   ```sql
   update public.profiles set role = 'admin' where email = '나의계정@학교도메인';
   ```
   (`profiles.role` 은 트리거가 지켜서 클라이언트에서는 바꿀 수 없습니다 — SQL Editor 에서 실행)
4. Supabase › Authentication › Hooks 의 설정과 PostgREST pre-request 훅(`account_link_pre_request`)은 `docs/features/auth-and-roles.md` 참고
5. 교직원·학생 명단은 관리자 화면(«사용자 관리»·«학생 관리»)에서 넣습니다 — 명단에 연결되지 않은 계정은 기능을 쓰지 못합니다

## 5. 엣지 함수

```bash
npx supabase link --project-ref <ref>
npx supabase secrets set SOLAR_API_KEY=... UPSTAGE_API_KEY=... OPENAI_API_KEY=... NEIS_API_KEY=... APP_URL=https://내-사이트 MCP_PUBLIC_URL=https://<ref>.supabase.co/functions/v1/mcp
npx supabase functions deploy
```

`supabase/config.toml` 의 `verify_jwt` 선언을 지우지 마세요(선언이 없는 함수는 CLI 배포 때 `true` 로 돌아갑니다).
웹 푸시를 쓰려면 `VAPID_KEYS` 도 비밀값으로 넣습니다(`npx web-push generate-vapid-keys`).
교실 기기 QR 세팅(`classroom-link`)을 쓰려면 `GOOGLE_CLIENT_ID`(웹과 같은 OAuth 클라이언트 ID)도 넣습니다.

## 6. 웹 앱

```bash
cp .env.example .env.local     # VITE_SUPABASE_URL · VITE_SUPABASE_PUBLISHABLE_KEY · VITE_GOOGLE_DRIVE_CLIENT_ID
npm run dev
npm run build                  # 배포용 (dist/)
```

정적 호스팅(Vercel·Netlify·Cloudflare Pages 등)에 `dist/` 를 올리고, SPA 라우팅(모든 경로 → `index.html`)을 설정합니다.

## 7. 처음 들어가서

- 관리자 › 메뉴 관리 — 쓰지 않는 기능은 끕니다
- 관리자 › 시스템 설정 — 학사력(학년도·학기)
- 시간표 › 업로드 — 학기 시간표
- 관리자 › 코인 경제 — 게임형 기능의 보상 숫자

## 알아 둘 것

- 공개판의 DB 는 원래 학교 운영 DB 의 **현재 구조 한 장**입니다. 마이그레이션 이력은 포함하지 않았습니다.
  앞으로의 변경은 `supabase/migrations/` 에 새 파일로 쌓으세요.
- `contest` 스키마는 별도 공모전 앱용 복제본입니다. 쓰지 않으면 그대로 둬도 됩니다.
- 일부 기능은 학교 밖 프로그램과 짝입니다(교실 PC·데스크 앱·쿨메신저 실행기 등). 웹만으로도 대부분의 기능은 동작합니다.
