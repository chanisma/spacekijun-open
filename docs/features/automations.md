# 자동화 업무 (`/automations`) — 정기 쿨메신저 발송

> 2026-10-23 적용. 인터뷰·설계 근거·**실행기 계약(§6)** = `docs/plans/2026-10-23-automation-scheduler.md`.
> 실행기 = NEIS_helper `.claude/skills/coolmessenger-send/automation-runner.py`(2026-10-26, 브랜치 `feat/automation-runner`).
> **서버 PC 실기 검증 전** — 그래서 메뉴 기본값은 아직 관리자만. 설치·판정 규칙 = 그 스킬 SKILL.md «SPACEKIJUN 자동화 업무 실행기».

## 흐름

```
/automations 에서 만들기 → 저장(승인 없음, 꺼짐) → 미리보기 · [나에게 시험 발송] → [승인하고 켜기]
pg_cron automation-tick(매분) → automation_private.plan_due → automation_run(pending, 본문·명단 스냅샷)
서버 PC → 엣지 automation-runner(x-runner-key) → claim → send-message.ps1 → report(sent/unknown/failed)
```

## 표 (마이그레이션 `20261023165000_automation_scheduler.sql`)

> 2026-10-25 번호 변경: 처음엔 `20261023160000` 이었는데 main 의 `star_tower_close_focus_cast` 와 번호가 겹쳤다(둘 다 운영 적용됨).
> 이력 표는 버전으로만 기록하므로 `20261023165000` 으로 옮기고 이력에 새 번호를 기록했다 — 운영 DB 는 다시 적용하지 않았다.

| 표 | 읽기 | 쓰기 |
|---|---|---|
| `automation_grant` (사람 × 종류) | 본인 · 관리자 | 관리자 |
| `automation` | 주인 · 관리자 | 주인(허용된 사람) · 관리자 — 승인 칸은 `automation_approve` RPC 만 |
| `automation_run` | 주인 · 관리자 | **RPC 전용**(정책 없음) |
| `automation_runner` | 정책 없음 — `automation_admin_runners` | 관리자 RPC (키는 sha256 만) |
| `automation_config` (한 줄) | 교직원 | 관리자 |

RPC — 사용자: `automation_preview` · `automation_test_send`(하루 5번, 나에게만) · `automation_approve` · `automation_cancel_run`.
관리자: `automation_admin_runners` · `automation_admin_issue_runner`(키를 이 응답에서 한 번만) · `automation_admin_revoke_runner`.
실행기(service_role 만): `automation_runner_heartbeat` · `automation_runner_claim` · `automation_runner_report`.
알림 type `automation_issue` → `/automations?automation=<id>`(기록), `meta.kind=runner_offline` → `/admin`.

## 조용히 틀리는 자리

1. **두 벌 판정** — cron(`automation_private.cron_matches` ↔ `src/lib/automationCron.ts`), 본문 변수(`known_tokens`·`render` ↔
   `src/lib/automationConfig.ts`), 쉬는 날(`closed_day_reason` ↔ `src/lib/schoolDay.ts`, `applyTerm:false`·학교 전체). 한쪽만 고치면
   미리보기와 실제 발송이 어긋난다(오류 없음). 회귀 = `npx tsx scripts/automation-test/run.mts`(86) + `sql-parity.mts [--applied]`(23 — 서버 함수로 같은 표).
2. **pg_cron 에는 `auth.uid()` 가 없다** — 받는 사람 규칙은 `recipients_of(a, true)` 가 `request.jwt.claims` 를 **주인**으로 잠시 세우고
   `resolve_faculty_rule` 로 푼다. 주인이 권한을 잃으면 회차가 «권한 없음»으로 건너뛴다.
3. **승인 해제는 트리거가 정한다**(`automation_private.guard`) — kind·config·cron·기간·쉬는 날·유효 시간이 바뀌면 승인을 풀고 끈다. 이름만 바꾸면 남는다.
   화면(`AutomationEditorDialog`)의 «승인이 풀립니다» 판정도 같은 칸을 **키 정렬** 비교한다(jsonb 는 키 순서를 바꿔 돌려준다).
4. **`unknown` 은 재발송하지 않는다** — 쿨메신저 «발송 확인 실패»여도 나갔을 수 있다. 가져간 뒤 10분 보고가 없으면 서버가 `unknown` 으로 닫는다.
5. **모양이 틀린 받는 사람 규칙은 오류가 아니라 0명** — 그 회차를 `skipped`(«받는 사람이 0명»)로 남기고 알린다. 부서 조건은 이름이 아니라 `ids`.
6. 알림 `priority` 는 `low|medium|high` 만(드라이런에서 `normal` 로 회차 생성 전체가 터졌다 — 회귀가 검사).
7. 생성 타입(`types.ts`)에 표가 아직 없어 서비스가 `as never` 로 부른다 — 타입을 다시 만들면 걷어 낼 것.

## 남은 일

- 실행기 실기 검증(서버 PC, 기전봇): 관리자 «자동화 업무»에서 키 발급 → `automation-runner.py setup` → `check` →
  [나에게 시험 발송] 후 `once` → 작업 스케줄러(로그온할 때) 등록. 통과하면 Admin «메뉴 관리»에서 교사·직원에게 연다.
  - 실행기 판정: 보낸 쪽지함 새 행 1건·받는이 수 일치 → `sent` / 눌렀는데 기록 없음·수 불일치 → `unknown` / 누르기 전 멈춤 → `failed`.
  - 할 일이 있으면 한 통 보낸 뒤 5초 뒤 다음 회차를 가져온다(1분 간격은 할 일 없을 때). 여럿을 한꺼번에 가져가면 10분 규칙에 걸린다.
- 쉬는 날 두 벌 대조 회귀(지금은 cron·변수만 대조).
