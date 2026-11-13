/**
 * 협업 보드 접근 판정 — **단일 출처**.
 *
 * 서버 정본은 DB 함수 `can_view_collab_board` / `can_write_collab_board` 다.
 * 이 파일은 그 규칙의 **클라이언트 거울**이고, 화면이 "보여줄지 / 쓰기 UI 를 열지"를
 * 정하는 데만 쓴다(권한 자체는 언제나 RLS 가 지킨다).
 *
 * 종전엔 같은 판정이 네 화면(`CollabBoard`·`StudentCollabBoard`·`BoardDetail`·
 * `StudentBoardDetail`)과 공지 링크 픽커에 복붙돼 있었고, 상세 2곳은 소유자를
 * 빼먹은 채 "`useCollabBoard` 가 소유자를 멤버 목록에 합성해 넣어서" 우연히
 * 동작하고 있었다. 한 벌로 합쳐 그 우연을 없앤다.
 */

export type BoardVisibilityValue = 'public' | 'read_only' | 'private';

export interface BoardAccessFields {
  visibility: string;
  created_by: string;
  memberResourceIds: string[];
}

/** 목록 조회 모양(`collab_board_members: [{ user_id }]`) → 판정 입력. */
export function boardAccessFieldsFromList(board: {
  visibility: string;
  created_by: string;
  collab_board_members?: { user_id: string }[] | null;
}): BoardAccessFields {
  return {
    visibility: board.visibility,
    created_by: board.created_by,
    memberResourceIds: (board.collab_board_members ?? []).map((m) => m.user_id),
  };
}

/** 상세 조회 모양(`members: [{ resource: { id } }]`) → 판정 입력. */
export function boardAccessFieldsFromDetail(board: {
  visibility: string;
  created_by: string;
  members?: { resource?: { id?: string } | null }[] | null;
}): BoardAccessFields {
  return {
    visibility: board.visibility,
    created_by: board.created_by,
    memberResourceIds: (board.members ?? [])
      .map((m) => m.resource?.id)
      .filter((id): id is string => Boolean(id)),
  };
}

function isMemberOrOwner(board: BoardAccessFields, resourceId: string | null | undefined): boolean {
  if (!resourceId) return false;
  return board.created_by === resourceId || board.memberResourceIds.includes(resourceId);
}

/** 읽기: public·read_only 는 전원, private 는 소유자·멤버(+admin). */
export function hasCollabViewAccess(
  board: BoardAccessFields,
  resourceId: string | null | undefined,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  if (board.visibility === 'public' || board.visibility === 'read_only') return true;
  return isMemberOrOwner(board, resourceId);
}

/** 쓰기: public 은 전원, read_only·private 는 소유자·멤버(+admin). */
export function hasCollabWriteAccess(
  board: BoardAccessFields,
  resourceId: string | null | undefined,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  if (board.visibility === 'public') return true;
  return isMemberOrOwner(board, resourceId);
}
