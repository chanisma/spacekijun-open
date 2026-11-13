# 별빛 아카데미 공모전판 — contest 스키마 (2026-10-15)

공모전 제출용으로 아카데미만 떼어 낸 앱 = `C:\Users\you\orca\projects\academy`(종전 «단독 사본»을 덮어씀).
**같은 Supabase 프로젝트, 다른 스키마**(사용자 결정 — 새 프로젝트 비용 대신). 운영 학생 자료 표는 쓰지 않는다.

## 이 저장소가 가진 것 (DB 는 여기가 소유)
| 마이그레이션 | 내용 |
|---|---|
| `20261015160000_contest_academy_schema` | `contest`·`contest_private` 스키마 — 운영 아카데미 관련 표 76·함수 145·정책 145를 이름공간만 바꿔 복제(생성기 = orca `scripts/contest-db/gen-ddl.mjs`). anon·PUBLIC 권한 없음 |
| `20261015170000_contest_account_isolation` | **운영 사전 요청 훅**에 분기 추가: 공모전 계정(`contest.profiles` 에 있는 uid)은 `contest` 스키마만, 운영 계정은 `contest` 거부(42501 `CONTEST_ONLY`). 판정이 터지면 종전 동작으로 떨어진다 |
| `20261015180000_contest_storage_isolation` | `storage.objects` RESTRICTIVE 정책 `contest_bucket_isolation` — 공모전 계정 = `contest-*` 버킷만, 운영 계정 = `contest-*` 못 씀. 버킷 2개(`contest-academy-workshop`·`contest-world-today-comics`) |
| `20261015190000_contest_inquiry_tables` | KG 파이프라인 입력 표 5개(서비스 롤 전용) |
| `20261015200000_contest_generation_worker` | 설계 생성 큐 일꾼 설정 + cron `contest-academy-generation-worker`(15초) |
| `20261015210000_contest_activity_computed_fields` | 계산 필드 `contest.content_excerpt`·`keywords_text`(activity) — 빠져서 도서관 «책장에서 책 꺼내기»가 400(«책장을 불러오지 못했어요»)이었다 |
| `20261015230000_contest_inquiry_rpc_gaps` | `get_/upsert_inquiry_analysis_cache`·`upsert_inquiry_recommendation_prepare` — 빠져서 «별자리 조언»이 `Could not find the function … in the schema cache`(500). 엣지 함수가 `.rpc(` 다음 줄에 이름을 적는 형태라 생성기가 못 모았다 |
| `20261015220000_contest_achievement_context` | `contest.docgen_context` = 운영 성취기준 118건 스냅샷(읽기 전용, 작성 교사 id 없음) — «새 별 찾기»의 «과목의 성취기준 맥락» |

**체험 학생 자료**(orca `scripts/contest-db/`, 다시 돌려도 안전): `seed-2-finish-chapters.sql` = 90-11001 이야기 여섯 장 완료(제5장 목표·계획, 제6장 「이기적 유전자」 설명 카드 연결) · `seed-3-subjects.sql` = 세 학생의 이수(학생부)·수강 중(2026-2)·3학년 신청 과목 — **임의 자료**(사용자 결정), 서도담 = 심리·교육, 한누리 = 컴퓨터·AI 과목. 서도담·한누리는 아직 제1장 전이라 연구대가 잠겨 있다.

⚠️ **복제 생성기가 놓치는 부류 둘** — 함수를 «RPC·본문·정책에 이름이 나오는 것»으로만 모으는데 ①PostgREST 계산 필드는 프런트 `select` 문자열에만 나오고 ②`.rpc(` 다음 줄에 이름을 적는 호출은 한 줄 패턴에 안 걸린다. 둘 다 `closure-db.mjs` 의 `seedFns` 에 직접 적어 두었다. 빠지면 contest 에서만 42703·«schema cache» 오류가 난다. **점검법**: 앱·엣지 함수의 RPC 이름을 줄바꿈을 넘어 모아(`/\.rpc\(\s*['"]name/`) `contest` 의 `pg_proc` 과 대조한다(2026-10-15 기준 빠진 것 = 웹 푸시 `push_*` 뿐, 아카데미에서 안 씀).
**별자리 조언 글의 `[acti_…]`** (2026-10-15): 프롬프트가 entity 를 `[entity_id] 이름` 으로 실어 모델이 조언 글에 내부 id 를 그대로 썼다. `contest-inquiry-comprehensive/entity-refs.ts`(순수 함수)가 방향(summary·detail)과 추천(title·description·rationale)에서 id 를 `[과목] 이름`(과목 = KG 출처 subject, 창체는 영역 이름)으로 바꾼다 — 프롬프트 금지가 아니라 코드가 고친다(추천 단계는 금지문이 있어도 새던 부류). 저장돼 있던 1건도 같은 함수로 고쳤다. 회귀 = orca `npx tsx scripts/contest-advice-refs-test/run.mts`. **운영 `inquiry-comprehensive` 는 같은 프롬프트라 같은 증상이 있다(아직 안 고침).** 배포 때 esm.sh 의 `supabase-js@2`(→ 2.118.0) 번들이 깨져 이 함수와 `_shared` 의 import 를 `@2.117.0` 으로 고정했다.
⚠️ 공모전 학번 `90-` 의 앞 두 자리는 입학연도가 아니다 — 학번에서 입학연도를 유도하는 코드는 공모전판에서 학년으로 거꾸로 셈해야 한다(`CurriculumSubjectCombobox` 를 그렇게 고쳤다 · 그대로면 2090년 입학이 되어 이수 과목이 전부 «앞으로 들을 과목»).

PostgREST 노출 스키마에 `contest` 추가(Management API `PATCH /v1/projects/{ref}/postgrest` db_schema — 대시보드 설정과 같은 값).

## 왜 이렇게
- **Storage 는 사전 요청 훅을 거치지 않는다** — 운영에는 «로그인만 하면» 열리는 버킷 정책이 있다(kijunspace 읽기·쓰기·삭제, evalearn-grade-analysis 읽기). 공모전 세션은 외부 심사위원이 쓰므로 RESTRICTIVE 정책이 필요했다.
- **공모전 계정 이메일 = `90-1100N@myschool.hs.kr`** — `profiles` 의 도메인 트리거(`check_kijun_domain`)가 학교 도메인만 받는다. 입학연도 «90» 은 운영에 없는 코드라 `account_link_status` 가 unlinked → 운영 훅이 그대로 막는다. **`00-00001@다른도메인` 처럼 운영 학번 prefix 를 쓰면 안 된다** — 연결된 학생으로 판정돼 운영 자료가 열린다.
- 감사(2026-10-15): 운영 엣지 함수 중 공모전 세션으로 운영 자료가 새는 경로 없음. `smartthings-proxy` 는 «로그인만 하면» 학교 SmartThings 목록이 보여 **명단 연결 확인을 넣었다**(공모전과 무관하게 미연결 학교 계정에도 열려 있던 것). 남은 위험 = AI 비용(`solar-chat`·`solar` 등은 원래 anon 에게도 열려 있다 — 별도 과제).

## 함께 바꾼 운영 코드
- `supabase/functions/smartthings-proxy` — 읽기 동작도 `my_account_link_status = 'linked'` 필요 + deviceId 인코딩. `config.toml` 에 verify_jwt=false 명시.

## 되돌리기
```sql
select cron.unschedule('contest-academy-generation-worker');
drop policy contest_bucket_isolation on storage.objects; drop policy contest_academy_workshop_image_read on storage.objects;
-- 훅: 20261013200000 의 정의로 다시 만든다(contest 분기 제거)
drop schema contest cascade; drop schema contest_private cascade;
```
+ PostgREST db_schema 에서 contest 제거 · auth 사용자 `90-11001~3@myschool.hs.kr` 삭제 · 엣지 함수 `contest-*` 삭제 · 버킷 2개 삭제.

## ⚠️ 운영 쪽에서 조심할 것
- **`account_link_pre_request` 를 다시 정의할 때 contest 분기를 지우지 말 것** — 지우면 공모전 계정이 연결 절차 경로(`/profiles`·`/user_resource` 쓰기)로 운영에 닿는다.
- 운영 아카데미 함수를 고치면 공모전판은 자동으로 따라오지 않는다(복제본). 따라가려면 orca `scripts/contest-db/` 로 다시 생성.

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

### 아카데미 공모전판 = contest 스키마 (2026-10-15)

공모전 제출용 아카데미 앱(`C:\Users\you\orca\projects\academy`)은 **같은 DB 의 `contest` 스키마**를 쓴다(운영 학생 자료 표 안 씀). 공모전 계정(`90-1100N@myschool.hs.kr`, 체험 학생 3명)은 **사전 요청 훅이 `contest` 만 허용**하고 운영 계정은 `contest` 를 거부한다 · Storage 는 RESTRICTIVE 정책 `contest_bucket_isolation`. ⚠️ **`account_link_pre_request` 를 다시 정의할 때 contest 분기를 지우지 말 것**(지우면 공모전 계정이 연결 절차 경로로 운영에 닿는다). 운영 아카데미 함수를 고쳐도 공모전판은 따라오지 않는다(복제본 — orca `scripts/contest-db/`). 상세·되돌리기 = `docs/features/academy-contest.md`.
