/**
 * 구글 팝업 재인증 회귀 (2026-10-01)
 *
 * 팝업이 «로그인 세션을 건드리지 않는다»는 것이 이 설계의 전부다. 예전 팝업은 팝업 안에서 Supabase
 * 로그인을 다시 해 원래 창의 로그인을 풀었다(2026-08-12). 그 형태로 되돌아가도 빌드·타입 검사는
 * 통과하고, 실제 사고는 브라우저에서만 드러나므로 정적 검사로 못 박는다.
 *
 *   npx tsx scripts/google-popup-reauth-test/run.mts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
let fails = 0;
const check = (name: string, cond: boolean) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) fails++;
};

console.log('① 팝업은 로그인 세션을 건드리지 않는다');
{
  const popup = read('src/services/googleIdentityPopup.ts');
  const reauth = read('src/services/googlePopupReauth.ts');
  check('popupReauth 가 Supabase OAuth 로그인을 다시 하지 않는다', !/signInWithOAuth/.test(reauth));
  check('popupReauth = 구글 토큰 팝업', /requestGoogleTokenPopup\(\)/.test(reauth));
  check('토큰 팝업이 세션을 쓰지 않는다(읽기만)',
    !/signInWithOAuth|setSession|signOut|refreshSession|exchangeCodeForSession/.test(popup) && /auth\.getSession\(\)/.test(popup));
  check('구글 자체 팝업(GIS 토큰 클라이언트)', /accounts\.google\.com\/gsi\/client/.test(popup) && /initTokenClient\(/.test(popup));
  check('학교 계정·지금 로그인한 계정으로', /hd: HOSTED_DOMAIN/.test(popup) && /login_hint: user\.email/.test(popup));
  check('드라이브·캘린더 권한 둘 다(로그인과 같은 범위)', /auth\/drive\.file/.test(popup) && /auth\/calendar/.test(popup));
  check('실패를 알린다(차단·닫음·거부)', /error_callback:/.test(popup) && /response\.error \|\| !response\.access_token/.test(popup));
}

console.log('\n② 받은 토큰은 그 사람에게만, 만료 전까지만');
{
  const popup = read('src/services/googleIdentityPopup.ts');
  check('다른 사용자의 토큰은 쓰지 않는다', /stored\.userId !== currentUserId/.test(popup));
  check('만료(여유 1분)를 본다', /stored\.expiresAt - EXPIRY_MARGIN_MS <= Date\.now\(\)/.test(popup));
  check("저장 키가 'google_' 접두(로그인 정보 지우기가 함께 지운다)", /POPUP_TOKEN_KEY = 'google_popup_token'/.test(popup)
    && /key\.startsWith\('google_'\)/.test(read('src/lib/safeLocalStorage.ts')));
  check('로그아웃·계정 전환 때 지운다', /'google_popup_token'/.test(read('src/lib/googleTokenUtils.ts')));

  const auth = read('src/services/googleAuthService.ts');
  check('토큰 조회가 팝업 토큰을 먼저 본다(지금 사용자 id 로)', /readPopupToken\(session\?\.user\?\.id\)/.test(auth));
  check('팝업 토큰이 무효면 버리고 로그인 토큰으로 한 번 더', /tokens\.source === 'popup'[\s\S]{0,80}clearPopupToken\(\)/.test(auth));
}

console.log('\n③ 연결 버튼 — 팝업 먼저, 안 되면 페이지 이동');
{
  const button = read('src/components/auth/DriveConnectButton.tsx');
  check('보일 때 스크립트를 미리 받는다(누른 뒤 받으면 팝업이 막힌다)', /useEffect\(\(\) => \{ void preloadGoogleIdentity\(\)/.test(button));
  check('팝업이 먼저', /const ok = await popupReauth\(\);/.test(button));
  check('실패하면 페이지 이동을 대안으로', /phase === 'failed'[\s\S]{0,1200}페이지 이동으로 연결/.test(button) && /signInWithGoogle\(returnPath\)/.test(button));
  check('양식 첨부 칸이 쓴다', /<DriveConnectButton/.test(read('src/components/tasks/PhysicalFormFilesField.tsx')));
  check('대상자 파일 제출이 쓴다', /<DriveConnectButton/.test(read('src/features/task-workflow/components/submit/SubmitRespondPanel.tsx')));
  const dialog = read('src/components/auth/GoogleReauthDialog.tsx');
  check('전역 재인증 모달: 열릴 때 미리 받고, 실패하면 말한다', /preloadGoogleIdentity\(\)/.test(dialog) && /setPopupFailed\(true\)/.test(dialog));
}

console.log(fails === 0 ? '\n모두 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
