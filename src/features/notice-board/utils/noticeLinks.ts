// ========================================
// 공지 본문 내부 링크 토큰
//
// 다른 메뉴의 데이터(스케줄 일정·업무·구매 신청 게시글)를 본문에서 참조.
// 저장 포맷은 plain text 유지 — 토큰 문법: [[type:id|라벨]]
// 렌더 시 NoticeContentView가 토큰을 클릭 가능한 칩으로 표시.
// ========================================

export type NoticeLinkType = 'schedule' | 'task' | 'purchase' | 'collab' | 'docgen' | 'activity' | 'survey';

export interface NoticeLinkToken {
  type: NoticeLinkType;
  id: string;
  label: string;
}

export type NoticeTextSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; token: NoticeLinkToken };

/** 토큰 매칭 — id는 uuid, 라벨은 ]]와 개행 미포함 */
const LINK_RE = /\[\[(schedule|task|purchase|collab|docgen|activity|survey):([0-9a-fA-F-]{36})\|([^\]\n]+?)\]\]/g;

export const NOTICE_LINK_TYPE_LABEL: Record<NoticeLinkType, string> = {
  schedule: '스케줄 일정',
  task: '업무',
  purchase: '구매 신청',
  collab: '협업보드',
  docgen: '문서 생성',
  activity: '창의적 체험활동',
  survey: '일정 설문',
};

/** 라벨을 토큰 안전 문자열로 정리 (구분자·개행 제거, 길이 제한) */
function sanitizeLabel(label: string): string {
  const cleaned = label.replace(/[[\]|\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || '(제목 없음)').slice(0, 60);
}

export function makeNoticeLinkToken(type: NoticeLinkType, id: string, label: string): string {
  return `[[${type}:${id}|${sanitizeLabel(label)}]]`;
}

/** 한 줄 텍스트를 일반 텍스트/링크 세그먼트로 분해 */
export function splitNoticeText(text: string): NoticeTextSegment[] {
  const segments: NoticeTextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(LINK_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ kind: 'text', text: text.slice(lastIndex, index) });
    }
    segments.push({
      kind: 'link',
      token: {
        type: match[1] as NoticeLinkType,
        id: match[2],
        label: match[3],
      },
    });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: 'text', text: text.slice(lastIndex) });
  }
  return segments;
}

/** 토큰 → 이동 대상. state는 react-router navigate의 state 인자 */
export function getNoticeLinkNav(token: NoticeLinkToken): { to: string; state?: unknown } {
  switch (token.type) {
    case 'schedule':
      // Schedule 페이지는 location.state.scheduleId로 해당 일정의 월로 이동 (기존 지원)
      return { to: '/schedule', state: { scheduleId: token.id } };
    case 'task':
      // 업무 관리의 ?task= 딥링크 (상세 다이얼로그 자동 오픈) — 업무 목록 페이지에서 연다
      return { to: `/tasks/mine?task=${token.id}` };
    case 'purchase':
      return { to: `/purchase-requests/${token.id}` };
    case 'collab':
      // 주의: 협업보드는 이동 전 checkCollabBoardAccess로 권한 확인 필요
      // (NoticeContentView가 처리 — 무권한이면 이동하지 않고 토스트)
      return { to: `/collab/${token.id}` };
    case 'docgen':
      // 문서 생성 페이지의 ?entry= 딥링크 — 러너 자동 오픈.
      // spec_fill은 공유 실행 유형이라 남의 생성 방식도 내 문서를 만들 수 있다.
      return { to: `/document-generation?entry=${token.id}` };
    case 'activity':
      // 창체 페이지의 ?activity= 딥링크 — 상세 모달 자동 오픈.
      // 학생도 들어오는 라우트라 RLS가 열람 범위를 판정한다(비공개 활동이면 열리지 않는다).
      return { to: `/activities?activity=${token.id}` };
    case 'survey':
      // 스케줄 페이지의 ?survey= 딥링크 — 설문 응답/결과 모달 자동 오픈.
      // 대상자가 아니면 RLS가 0행을 주므로 화면이 "찾을 수 없다"로 안내한다.
      return { to: `/schedule?survey=${token.id}` };
  }
}
