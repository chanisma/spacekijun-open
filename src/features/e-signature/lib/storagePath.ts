/**
 * 전자서명 Storage 경로 규약 — 순수 함수.
 *
 * 경로 = `<request_id>/source.<확장자>` · `<request_id>/signed.<확장자>`
 *
 * **첫 세그먼트가 요청 id 여야 한다** — Storage RLS 가 그것으로
 * `can_view_signature_request` 를 판정한다. 규약을 깨면 정책이 파일을 못 찾아
 * **업로드는 되는데 아무도 못 읽는** 상태가 된다.
 *
 * **원본 파일명을 키에 넣지 않는다.** Supabase Storage 의 객체명 검증은 ASCII 기반이라
 * (`\w` 가 `[A-Za-z0-9_]`) 한글이 들어가면 `Invalid key` 로 업로드가 **거부된다** —
 * `2026학년도 샘플여자고 교과 수업공개 계획.pdf` 가 실제로 그랬다.
 * 키를 사람이 읽을 이유는 없다: 보여 줄 이름은 DB(`source_name`)에 그대로 있고
 * 내려받기도 그 값을 쓴다.
 *
 * 서비스가 아니라 여기 두는 이유 — supabase 클라이언트를 물면 Node 회귀 테스트가
 * `localStorage is not defined` 로 죽는다.
 */

export function sourceObjectPath(requestId: string, fileName: string): string {
  return `${requestId}/source${fileExtension(fileName)}`;
}

export function signedObjectPath(requestId: string, fileName: string): string {
  return `${requestId}/signed${fileExtension(fileName)}`;
}

/**
 * `.pdf` 같은 확장자만 뽑는다(점 포함). 없거나 이상하면 빈 문자열 —
 * 확장자는 편의일 뿐이고 실제 종류는 `source_kind` 가 안다.
 */
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return '';
  const ext = fileName.slice(dot + 1).toLowerCase();
  // ASCII 영숫자만, 8자 이내 — 그 밖의 것은 키에 쓰지 않는다
  if (!/^[a-z0-9]{1,8}$/.test(ext)) return '';
  return `.${ext}`;
}
