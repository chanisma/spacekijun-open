/**
 * 교실 기기에 넘길 구글 드라이브 토큰 — 전체 드라이브 읽기·쓰기(`drive`), 1시간 (2026-10-13 사용자 결정).
 *
 * 교실 화면의 드라이브는 «선생님 드라이브를 프로그램 안 탐색기에서 일반 폴더처럼» 쓴다. 앱이 평소 쓰는
 * `drive.file`(앱이 만들었거나 Picker 로 고른 파일만)으로는 폴더 안이 보이지 않아 이 범위를 따로 받는다.
 *
 * - 평소 드라이브 토큰(googleIdentityPopup 의 `google_popup_token`)과 **섞지 않는다** — 저장하지 않고 돌려준다.
 *   이 토큰은 교실 기기로 넘어가고, 이 기기(휴대폰)에서는 쓰지 않는다.
 * - 🚨 `drive` 는 구글의 «제한된 범위»다. 구글 클라우드의 OAuth 동의 화면이 «내부(Internal)»면 학교 계정은
 *   검수 없이 허용된다. «외부»면 미확인 앱 경고가 뜨거나 막힌다(docs/features/classroom-link.md).
 */
import { supabase } from '@/integrations/supabase/client';
import { preloadGoogleIdentity } from '@/services/googleIdentityPopup';

export const CLASSROOM_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
/**
 * 교실 기기의 «구글 수업 도구» — 클래스룸 수업 목록·공지(올리기)·과제 제출 현황(2026-10-14).
 * 구글 웹(클래스룸 사이트)은 이 토큰으로 로그인되지 않는다 — 기기가 클래스룸 API 를 직접 부른다.
 * 슬라이드 발표(Slides API)·설문지 응답(Forms API)은 드라이브 범위로 된다. 서버 CLASSROOM_SCOPES 와 같아야 한다.
 */
export const CLASSROOM_TOOL_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.announcements',
  'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
  // 원래 클래스룸처럼 — 작성자 이름·사진, 수업 탭의 주제·자료, 사용자 탭(2026-10-14)
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
  'https://www.googleapis.com/auth/classroom.profile.photos',
  'https://www.googleapis.com/auth/classroom.topics.readonly',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
];

interface TokenResponse { access_token?: string; error?: string }
interface TokenClient { requestAccessToken: (overrides?: { prompt?: string }) => void }
interface OAuth2 {
  initTokenClient: (config: {
    client_id: string; scope: string; hd?: string; login_hint?: string; include_granted_scopes?: boolean;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }) => TokenClient;
}

const oauth2 = () =>
  (window as unknown as { google?: { accounts?: { oauth2?: OAuth2 } } }).google?.accounts?.oauth2;

/** 구글 팝업으로 드라이브 전체 토큰을 받는다. 실패(팝업 차단·닫음·거부)면 null. [버튼을 누른 직후] 부를 것. */
export async function requestClassroomDriveToken(): Promise<string | null> {
  const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID as string | undefined;
  const { data: { session } } = await supabase.auth.getSession();
  if (!clientId || !session?.user) return null;
  try {
    await preloadGoogleIdentity();
  } catch {
    return null;
  }
  const api = oauth2();
  if (!api) return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (token: string | null) => { if (!settled) { settled = true; resolve(token); } };
    const client = api.initTokenClient({
      client_id: clientId,
      scope: [CLASSROOM_DRIVE_SCOPE, ...CLASSROOM_TOOL_SCOPES].join(' '),
      hd: 'myschool.hs.kr',
      login_hint: session.user.email ?? undefined,
      include_granted_scopes: true,
      callback: (response) => finish(response.error ? null : response.access_token ?? null),
      error_callback: () => finish(null),
    });
    client.requestAccessToken({ prompt: '' });
  });
}
