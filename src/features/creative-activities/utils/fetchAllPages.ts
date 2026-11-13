/**
 * 서버의 행 상한까지 채워 목록을 끝까지 읽는다.
 *
 * **1000 은 PostgREST 의 상한이다**(`db-max-rows`, CLAUDE.md 에도 적혀 있다) — 더 키워도
 * 잘려서 오고, 잘림은 오류가 아니라 **부분 결과**라 조용하다. 종전 500 은 그 절반이라
 * 왕복이 두 배였다(활동 1,593행 = 4회 → 2회). 왕복 하나가 곧 지연이므로
 * 데이터가 늘수록 이 차이가 그대로 커진다.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}
