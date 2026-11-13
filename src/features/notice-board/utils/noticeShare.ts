// ========================================
// 공지 딥링크 — 주소 만들기 + 클립보드 복사
//
// 딥링크 경로(`/notices?notice=<id>`)의 **단일 출처**. 만드는 쪽(대시보드 카드·링크
// 복사 버튼)과 읽는 쪽(NoticeBoardPage)이 같은 상수를 보게 해 둔다.
//
// ⚠ 주소창을 공유 수단으로 쓸 수 없다: NoticeBoardPage 는 `?notice=` 를 **1회 소비 후
// URL 에서 지우므로**(새로고침 때 모달이 다시 열리는 것을 막으려는 의도) 링크를 받고
// 나면 주소창에는 `/notices` 만 남는다. 공유할 주소는 반드시 여기서 만들어야 한다.
// ========================================

/** 딥링크 쿼리 파라미터 이름 — 만드는 쪽·읽는 쪽이 함께 쓴다 */
export const NOTICE_DEEP_LINK_PARAM = 'notice';

/** 앱 내부 이동용 상대 경로 (react-router `navigate`) */
export function noticeDeepLinkPath(noticeId: string): string {
  return `/notices?${NOTICE_DEEP_LINK_PARAM}=${encodeURIComponent(noticeId)}`;
}

/** 남에게 보낼 절대 주소 (메신저·메일에 붙여넣는 것) */
export function noticeShareUrl(noticeId: string): string {
  return `${window.location.origin}${noticeDeepLinkPath(noticeId)}`;
}

/**
 * 클립보드 복사. 성공 여부를 돌려주므로 호출부가 실패를 화면에 말할 수 있다.
 *
 * `navigator.clipboard` 는 **보안 컨텍스트(https·localhost)에서만 존재**하고 권한이
 * 거부될 수도 있어, 없거나 실패하면 `execCommand('copy')` 로 한 번 더 시도한다.
 * 둘 다 실패하면 false — 그때는 주소를 화면에 드러내 직접 복사하게 해야 한다
 * (복사 버튼은 "눌렀는데 아무 일도 안 일어남" 이 가장 알아채기 어려운 부류다).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 권한 거부·비보안 컨텍스트 — 아래 폴백으로 내려간다
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    // 화면 밖에 두되 display:none 은 안 된다 — 선택할 수 없는 요소는 복사되지 않는다
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}
