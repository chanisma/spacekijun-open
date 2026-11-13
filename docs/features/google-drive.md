# Google Drive 연동

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

### Google Drive
**Storage Options**:
- Default: User's own "Spacekijun" folder
- Shared: Team folder (set `VITE_GOOGLE_DRIVE_SHARED_FOLDER_ID`)

**Implementation**:
- Service: `src/services/googleDriveServiceNew.ts`
- Integration: `src/services/googleDriveIntegrationService.ts`

**Token Management**:
- Auto-detects token expiration
- Shows dialog for reauthentication without page navigation
- Preserves work context during reauth
- **팝업 재인증 = 구글 토큰만 받는다 (2026-10-01)**: `popupReauth()` 는 Google Identity Services 토큰 팝업(`src/services/googleIdentityPopup.ts`)이고 **Supabase 세션을 건드리지 않는다** — 예전 구현은 팝업에서 Supabase 로그인을 다시 해 원래 창 로그인까지 풀었다(2026-08-12). 받은 토큰은 `google_popup_token`(사용자 id·만료 묶음)에 두고 `getGoogleTokensFromSupabase` 가 로그인 토큰보다 먼저 본다. ⚠️ 전제 = 클라이언트 ID 가 Supabase 구글 로그인과 **같다**(`drive.file` 은 그 앱이 만든 파일만 보인다 — 다른 ID 면 폴더가 새로 생긴다) · 운영 도메인이 그 클라이언트의 «승인된 JavaScript 원본»에 등록돼 있다(localhost 는 아니라 개발 서버에서는 팝업이 거부된다). 연결 버튼은 `DriveConnectButton`(팝업 먼저, 실패하면 페이지 이동). 미리 확인은 `hasValidToken()`(`isAuthenticated()` 는 만료 토큰도 참). 회귀 = `npx tsx scripts/google-popup-reauth-test/run.mts`
