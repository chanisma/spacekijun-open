# 알림 답장 — SPACEKIJUN 사용자에게 (2026-09-22)

알림 카드의 **[답장]** 은 보낸 사람에게 **SPACEKIJUN 알림**(`notification_events`, `type='direct_reply'`)으로
바로 간다. 받은 사람도 그 알림에서 다시 [답장]할 수 있어 대화가 SPACEKIJUN 안에서 이어진다.

| 파일 | 역할 |
|---|---|
| `src/lib/notificationReply.ts` | **받는 사람 판정 단일 출처** (순수 함수) |
| `src/lib/notificationReplyMemory.ts` | 직접 고른 사람 기억 (이 브라우저 localStorage) |
| `src/services/notificationReplyService.ts` | 교직원 명단 조회 + RPC 호출 |
| `src/components/notifications/NotificationReplyDialog.tsx` | 답장 모달 |
| `src/components/notifications/NotificationItem.tsx` | [답장] 버튼·'답장함' 배지·인용 줄 |
| `supabase/migrations/20260922100000_notification_reply.sql` | `send_notification_reply` RPC |

## 무엇이 바뀌었나

종전 [답장]은 `coolmsg_outbox` 큐에 넣고, 선생님 PC 에서 도는 로컬 폴러가 쿨메신저 앱을 조작해 발송했다
(PC 가 꺼져 있으면 켤 때까지 안 나갔다). 2026-09-22 사용자 결정으로 **방향을 완전히 바꿨다** — 쿨메신저로는
보내지 않는다. `CoolMsgReplyDialog.tsx` 는 삭제했고, **`coolmsg_outbox` 표는 남겨 두었다**(DB 구조 변경 없음).
전환 시점에 `status='sending'` 으로 멈춰 있던 2건(2026-09-15·17, 폴러가 집어 간 뒤 완료하지 못함)은
사용자 확인 후 삭제했고, 발송 완료 1건만 기록으로 남아 있다. 화면이 더 이상 그 표에 쓰지 않으므로 데스크 앱의 폴러는 할 일이 없어 대기만 한다.
표를 지우려면 별도 결정이 필요하다.

## 받는 사람 판정 — 이름이 정확히 한 명과 같을 때만 확정

쿨메신저 알림은 로컬 감시기가 넣는데, 보낸 사람 표기가 알림마다 다르다. 2026-09-22 라이브 287건에
판정 함수를 그대로 돌린 결과:

| 판정 | 건수 | 예 | 화면 |
|---|---:|---|---|
| `exact` | **251** (87%) | `황지유`, `임로아(학년부장)`, 제목만 `[쿨메신저] 오하준(1-8)` | 받는 사람 카드 + [다른 사람] |
| `unknown` | 29 | `보건실`·`최요한`·`리소스실` (교직원 명단에 없음) | 이유 안내 + 이름 검색 |
| `batch` | 4 | 제목 `[쿨메신저] 새 쪽지 19건`, 본문 = 보낸 사람 명단 | 명단 칩 + 못 찾은 이름 + 검색 |
| `partial` | 3 | `체육황지아` ⊃ `황지아` | 후보 칩(선택 안 됨) + 검색 |

- **확정은 정확 일치 한 명뿐**이다. 접두어 형태(`체육황지아`)는 거의 확실해 보여도 **제안만** 한다 —
  추정으로 확정하면 엉뚱한 사람에게 답장이 가고 되돌릴 수 없다.
- 표시 이름 출처 우선순위 = `meta.sender_plain` → `meta.sender`(괄호 꼬리 제거) → 제목 `[쿨메신저] X`.
  감시기 버전에 따라 meta 가 비어 있기도 해서 제목을 마지막 출처로 쓴다. 묶음 제목은 이름이 아니다.
- **정규화는 양쪽에 같은 함수**(`normalizePersonName` — 괄호·공백·호칭 제거). 한쪽만 정규화하면
  오류 없이 0건이 된다.
- **명단 = 재직 교직원(teacher·staff, status='active')만.** 교사와 학생에 같은 이름(장재윤)이 실제로 있지만
  명단을 교직원으로 한정하므로 모호해지지 않는다. 교직원끼리의 동명이인은 현재 0건이나 `duplicate`
  판정으로 처리한다(고르게 한다).
- **묶음이 아닌 알림의 본문은 쪼개지 않는다.** 자유 본문을 쉼표로 나눠 후보를 만들면 문장 조각이 우연히
  누군가의 이름과 같을 때 엉뚱한 후보가 생긴다. 묶음 제목(`새 쪽지 N건`)일 때만 본문을 명단으로 읽는다.
  묶음이지만 명단이 전부 한 사람이면 `exact`.
- **답장의 답장**(`direct_reply`)은 이름을 추측하지 않는다 — 서버가 `meta.sender_resource_id` 를 적어 두었다.
- 확정된 경우에도 [다른 사람]으로 바꿀 수 있다(쿨메신저 쪽의 동명이인·외부인은 명단이 모른다).

### 직접 고른 사람 기억

`보건실`(10건)·`최요한`(10건)처럼 명단에 없는 표시 이름은 같은 사람이 반복해서 보낸다. 사용자가 직접 고르고
보내면 **표시 이름 → resource.id** 를 이 브라우저에 기억해, 다음에 같은 이름이 오면 **미리 선택만** 한다
(칩에 '지난번 선택' 표시, 확정 아님). 최근 50개까지. 확정 판정(exact·reply)과 표시 이름이 없는 묶음은
기억하지 않는다. 기억이 정확 일치를 이기지 않는다.

**서버에 두지 않은 이유(기각)**: 학교 공용 별칭표(`보건실 → 보건교사`)를 두면 한 사람이 잘못 고른 것이
전원에게 퍼져 엉뚱한 사람에게 답장이 간다. 사람마다 같은 표시 이름을 다르게 해석할 수 있다. 공용 별칭이
필요해지면 관리자가 확정하는 표로 따로 설계할 것.

## 서버 — `send_notification_reply(p_recipient_resource_id, p_body, p_reply_to_notification_id?)`

**쓰기는 이 RPC 전용이다.** `notification_events` 의 INSERT 정책은 `with check (true)` 라 클라이언트가 직접
넣으면 보낸 사람 이름·id 를 아무렇게나 주장할 수 있다. 받은 사람의 [답장]이 `meta.sender_resource_id` 로
되돌아가므로 이 값이 위조되면 "다른 사람 명의 쪽지"가 된다 → **보낸 사람은 서버가 `auth.uid()` 에서 유도**한다.

| 검사 | 실패 시 |
|---|---|
| `auth.uid() is null` (맨 앞 — 3값 논리 함정) | 28000 로그인이 필요합니다 |
| `is_staff_teacher_or_admin(uid)` | 42501 교직원만 답장을 보낼 수 있습니다 |
| 본문 비어 있음 / 2000자 초과 | 22023 / 22001 |
| 내 계정에 교직원 리소스 연결 없음 | P0002 |
| 받는 사람이 재직 교직원이 아님 | P0002 받는 사람을 교직원 명단에서 찾을 수 없습니다 |

- 새 알림: `type='direct_reply'`, 제목 `[답장] {보낸 사람}`, 본문 = 답장, `priority='medium'`,
  `meta = {source:'spacekijun_reply', sender_resource_id, sender_name, reply_to_notification_id?, reply_to_type?, quote?}`.
- **인용(`quote`, 원문 300자)은 원래 알림이 내 것일 때만** 서버가 복사한다. 남의 알림 id 를 주면 오류 없이
  인용만 생략한다(존재 여부를 알려 주는 오라클이 되지 않게).
- 원래 알림에 `meta.replied_at / replied_to_resource_id / replied_to_name` + `is_read=true` 를 기록한다 →
  카드에 **'답장함 · 이름'** 배지. 같은 쪽지에 두 번 답하는 일을 줄인다.
- 반환 `{notification_id, recipient_resource_id, recipient_name, recipient_linked}`. `recipient_linked=false`
  = 받는 분이 SPACEKIJUN 에 로그인한 적이 없어(`user_resource` 없음) **로그인해 연결하기 전까지 아무도 못 본다**.
  화면은 보내기 **전에도** 이 사실을 알린다(`user_resource` SELECT 는 로그인 사용자 전원에게 열려 있다).
  2026-09-22 실측: 재직 직원 9명 중 7명, 교사 59명 중 4명이 미연결.
- DEFINER 함수 안의 INSERT 라 `.insert().select()` 가 SELECT 정책에 걸려 42501 로 롤백되는 함정이 없다.
- ACL = `authenticated`·`service_role` 만(`revoke ... from public, anon` 둘 다 명시).
- 받는 쪽에는 기존 realtime 브리지가 그대로 브라우저 알림을 띄운다(`notification_events` INSERT 구독).
- 쿨메신저 알림의 한 달 보관 정책(`type='coolmessenger'`)은 `direct_reply` 에 적용되지 않는다.
  인용은 원래 알림을 참조하지 않고 **사본**이라 원래 알림이 지워져도 남는다.

### 적용 전 드라이런 (2026-09-22, 전부 롤백)

교사 계정으로 가장해 7개 시나리오 — 정상 발송(미연결 직원, 인용·'답장함' 기록 확인) / 빈 본문 22023 /
학생 수신자 P0002 / 남의 알림 인용 → 인용 없이 성공·원래 알림 무변경 / 2001자 22001 /
학생 계정 발신 42501 / anon 42501(permission denied). 모두 기대대로.

## 화면

- **[답장] 버튼** = `coolmessenger`·`direct_reply` 알림 + **교직원 역할**(`isFacultyRole(effectiveRole)`).
  학생 계정도 쿨메신저 알림을 받고 있어서(실측 1명 4건) 버튼을 감춘다 — 서버가 어차피 거절한다.
  종전처럼 `meta.sender` 유무로 버튼을 거르지 않는다(묶음 알림에도 답할 수 있어야 한다).
- 모달 = 받는 사람 → 원문 → 답장 3구획. 정확 일치면 데스크톱에서 바로 입력칸에 포커스(기본 동작은
  첫 버튼 [다른 사람]을 잡았다), 휴대폰은 기본 동작(키보드가 모달을 가린다).
- 실패하면 모달이 닫히지 않고 입력이 남은 채 오류가 모달 안에 표시된다. 세션 만료(anon 실행 권한 없음)는
  서버 원문이 영어라 "로그인이 만료되었습니다"로 옮긴다.
- `direct_reply` 카드는 본문 위에 인용 한 줄(`NotificationCard` 의 `quote` prop).
- 관리자 알림 카탈로그(`notificationEventCatalog.ts`)에 `notification-reply` 항목으로 등록.

## 회귀

- `npx tsx --tsconfig tsconfig.app.json scripts/notification-reply-test/run.mts` (71건) — 판정 규칙을 라이브
  표기 그대로 못 박고, 옛 경로(`coolmsg_outbox`)로 되돌아가거나 클라이언트가 `notification_events` 에
  직접 넣게 되는 것을 정적으로 잡는다. **엉뚱한 사람에게 답장이 가는 것은 오류를 내지 않으므로** 이게 방어선이다.
- 브라우저 fixture(합성 데이터): 개발 서버를 켠 뒤
  `http://localhost:8080/scripts/notification-reply-test/index.html?case=exact|partial|unknown|batch|reply`.
  명단은 조회 캐시에 미리 넣어 네트워크를 타지 않는다. 로그인 세션이 없으므로 [보내기]는 서버가 거절한다 —
  그 오류가 모달 안에 표시되는 것까지가 이 페이지의 범위다.
