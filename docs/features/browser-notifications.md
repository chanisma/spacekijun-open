# 브라우저 알림 · 알림 답장

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

#### 알림 (`src/components/notifications/`, 브라우저 알림 2026-09-09 신설)
- **브라우저(OS) 알림 = realtime 구독 + 서비스 워커.** `notification_events` 는 **이미 `supabase_realtime` 퍼블리케이션에 있었다**(실측: 이 퍼블리케이션의 **유일한** 테이블, `pubinsert=true`) — 그래서 서버 변경이 0이다. 마운트 = `App.tsx` 의 `<BrowserNotificationBridge />` **한 개**(개수만큼 채널이 열려 같은 알림이 여러 번 소리를 낸다 — `tag` 병합은 화면만 합칠 뿐이라 눈으로는 한 개로 보인다), 표시 = `lib/browserNotifications.ts`, 설정 진입점 = 알림 페이지 헤더의 `BrowserNotificationToggle`. RLS(`owns_notification_resource`)가 realtime 에도 적용되므로 남의 알림은 애초에 오지 않는다 — 그런데도 `filter: resource_id=eq.` 를 거는 이유는 보안이 아니라 **트래픽**이다
- **⚠️ 안드로이드 크롬은 `new Notification()` 을 금지한다**(`TypeError: Illegal constructor`) — 휴대폰에서 알림을 띄우는 유일한 경로가 `ServiceWorkerRegistration.showNotification()` 이라 `public/sw.js` 를 둔다. **순서를 뒤집으면 데스크톱은 멀쩡하고 휴대폰에서만 죽는데, 정작 이 기능을 만든 이유가 휴대폰이고 개발은 데스크톱에서 한다.** 그 워커는 **`fetch` 핸들러를 갖지 않는다** — 캐싱을 시작하면 배포한 새 번들 대신 낡은 자산이 나가는, 알림과 무관한 사고가 알림 코드에서 난다
- **범위 = 탭이 살아 있는 동안** (사용자 결정 2026-09-09) — ★ **2026-10-07 Web Push 로 대체됐다**(다마고찌 Phase 4 — `src/lib/webPush.ts`·엣지 `push-send`, 상세 `docs/features/tamagotchi.md` «Phase 4»). 아래 문장은 그때의 판단 기록이다. Web Push 를 쓰지 않으므로 앱 탭을 완전히 닫거나 OS 가 브라우저를 정리하면 알림도 멈춘다. 탭이 닫혀도 받으려면 `push_subscriptions` 표 + 발송 엣지 함수 + VAPID 비밀키(`supabase secrets set` — MCP 로는 설정 불가) + **`pg_net`**(2026-09-09 현재 **미설치**라 DB 트리거가 엣지 함수를 부를 수단이 없다)가 필요하다
- **앱을 보고 있으면 OS 알림 대신 앱 안 토스트** — 한 사건에 신호를 두 번 주지 않는다. 판정은 `visibilityState === 'visible' && document.hasFocus()` 인데, **`visibilityState` 만 보면 다른 창에 가려진 경우를 놓친다**(탭은 여전히 visible) → 그 상태에서 토스트만 띄우면 사용자는 아무것도 못 본다
- **클릭 목적지는 `notificationNavigation.ts` 를 재사용**한다 — 앱 안 목록과 **같은 판정**이라야 두 경로의 클릭 결과가 갈리지 않는다. 워커는 그 값을 해석하지 않고 `postMessage` 로 되돌려 주기만 한다(라우팅 단일 출처 유지). **`sw.js` 와 lib 이 같은 메시지 타입 문자열을 각자 들고 있어** 갈라지면 알림은 뜨는데 눌러도 아무 일이 없다(오류도 안 남는다) → 회귀가 문자열 일치를 검사한다. 열린 탭이 하나도 없을 때만 `openWindow` 이고, 그때는 react-router state 가 유실된다(경로까지만 복원)
- **권한과 사용자 설정은 다른 것이다**: `denied` 는 앱에서 되돌릴 수 없어(브라우저가 재요청을 무시한다) 사이트 설정을 바꾸라고 안내해야 하고, "잠깐 끄기"는 우리 쪽 `localStorage` 설정이다(**기본 켜짐** — 권한을 일부러 허용한 사람이 원하는 상태는 "받겠다"). iOS 는 **홈 화면에 설치한 PWA 안에서만** `Notification` 이 존재하므로(16.4+) 일반 탭에서는 `'Notification' in window` 자체가 false 다 → "지원 안 함"으로 끝내지 말고 **설치 방법**을 안내한다
- **켠 직후 확인 알림을 한 번 띄운다** — 알림은 "켰는데 안 오는" 상태를 스스로 드러내지 못해, 켠 자리에서 한 번 보여 주는 것이 유일한 확인 수단이다. 같은 이유로 realtime `subscribe` 상태(`CHANNEL_ERROR`·`TIMED_OUT`·`CLOSED`)를 콘솔에 남긴다(구독이 실패해도 화면은 멀쩡하고 알림만 영영 안 온다)
- 회귀 = `npx tsx --tsconfig tsconfig.app.json scripts/browser-notification-test/run.mts`(47건 — 표시 경로 순서·폴백 3종·페이로드·설정 자가 치유·진리표 + **정적 검사**: `sw.js` ↔ lib 클릭 메시지 문자열 일치, 브리지 1회 마운트, `fetch` 핸들러 부재, 구독 필터). **`--tsconfig` 를 빠뜨리면 `@/` 별칭이 해석되지 않는다**
- **[답장] = SPACEKIJUN 교직원에게 알림으로 (2026-09-22 방향 전환)**: 쿨메신저 발송 큐(`coolmsg_outbox` → 로컬 폴러)는 **더 이상 쓰지 않는다**(표는 기록 보존용으로 남김, `CoolMsgReplyDialog` 삭제). 답장은 `type='direct_reply'` 알림이고 받은 사람이 다시 답할 수 있다. **쓰기는 `send_notification_reply` RPC 전용** — `notification_events` INSERT 가 `with check (true)` 라 클라이언트가 넣으면 보낸 사람을 위조할 수 있는데, 받은 쪽 [답장]이 `meta.sender_resource_id` 로 되돌아가므로 보낸 사람·인용은 서버가 유도한다. **받는 사람 판정 단일 출처 = `src/lib/notificationReply.ts`** — 쿨메신저 표기가 제각각이라(라이브 287건: 정확 일치 251 · 명단에 없음 `보건실` 29 · 묶음 `새 쪽지 N건` 4 · 접두어 `체육황지아` 3) **교직원 한 명과 정확히 일치할 때만 확정**하고 나머지는 사용자가 고른다(추정 확정 금지 — 엉뚱한 사람에게 간 답장은 되돌릴 수 없다). 받는 사람·보내는 사람 모두 교직원 한정(학생 계정도 쿨메신저 알림을 받지만 버튼을 감춘다). 상세 = `docs/features/notification-reply.md`, 회귀 = `npx tsx --tsconfig tsconfig.app.json scripts/notification-reply-test/run.mts`(71건)
