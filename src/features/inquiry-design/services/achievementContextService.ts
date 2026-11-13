import { supabase } from '@/integrations/supabase/client';

/**
 * 선택한 교과의 **성취기준 맥락** — 문서 생성의 맥락 라이브러리(`docgen_context`)를 재사용한다
 * (2026-09-12 사용자 요청, **시험 단계**).
 *
 * 왜 새 표를 만들지 않았나: 라이브러리에 `category = '성취기준'` 항목이 **118건** 있고
 * 제목이 전부 `"<과목명> 성취기준"` 이다. 같은 내용을 두 곳에 두면 반드시 갈라진다.
 *
 * **매칭은 정규화 후 정확 일치뿐이다.** 비슷한 이름으로 억지로 잇지 않는다 —
 * 틀린 과목의 성취기준을 붙이는 것은 없는 것보다 나쁘다. 라이브 실측 매칭률 **70/87(80%)**,
 * 미매칭은 대부분 2015 개정 과목명(`수학Ⅰ`·`영어Ⅱ`·`미적분`·`언어와 매체` …)인데
 * 라이브러리가 2022 개정 명칭으로 채워져 있기 때문이다. 그래서 화면은 **"맥락 없음"을
 * 정상 상태로** 표시해야 한다.
 */
export interface AchievementContext {
  id: string;
  title: string;
  body: string;
}

/**
 * 과목명 정규화 — 공백 제거 + 끝의 로마숫자·아라비아 숫자 제거.
 * `생명과학Ⅱ` → `생명과학`, `공통국어1` → `공통국어`, `독서 토론과 글쓰기` → `독서토론과글쓰기`.
 * 끝자리만 떼는 이유: 가운데 숫자는 과목을 가르는 정보다(`미술 창작` vs `미술1`은 다르다).
 */
export function normalizeSubjectKey(name: string): string {
  return name.replace(/[ⅠⅡⅢⅣ123456]+$/u, '').replace(/\s+/gu, '').toLowerCase();
}

const table = () => supabase.from('docgen_context' as never);

/**
 * 성취기준 맥락의 **목차**(제목만). 본문은 최대 2만 자라 118건을 통째로 받으면
 * 몇 MB가 된다 — 어느 과목에 맥락이 있는지 아는 데는 제목이면 충분하다.
 */
export async function listAchievementContextIndex(): Promise<Map<string, { id: string; title: string }>> {
  const { data, error } = await table()
    .select('id, title')
    .eq('category', '성취기준')
    .order('updated_at', { ascending: false })
    .limit(1000);
  /*
   * ⚠️ 종전엔 여기서 `if (error) return new Map()` 으로 오류를 **삼켰다**(2026-09-14 수정).
   * 그러면 조회 실패가 "이 과목은 등록된 성취기준이 없습니다" 와 **똑같이** 보인다 —
   * 화면에도 콘솔에도 아무 흔적이 없어 원인을 짚을 수가 없다.
   *
   * 이제는 던지고, 호출부(TanStack Query)가 `isError` 로 받아 화면이 "불러오지 못했어요 ·
   * 다시 시도" 를 표시한다. **설계 진행은 그대로다** — 맥락은 선택 기능이라 이 패널만
   * 오류 상태가 되고 페이지는 정상 동작한다.
   *
   * 참고: RLS 차단은 오류가 아니라 **0행**으로 오므로 이 분기로도 안 잡힌다.
   * (학생이 성취기준을 못 읽던 문제는 정책 자체를 고쳐서 해결했다 —
   *  마이그레이션 `docgen_context_students_read_achievement_standards`, 2026-09-14)
   */
  if (error) throw new Error(error.message || '성취기준 목록을 불러오지 못했습니다.');

  const index = new Map<string, { id: string; title: string }>();
  for (const row of (data ?? []) as Array<{ id: string; title: string }>) {
    const subject = row.title.replace(/\s*성취기준\s*$/u, '');
    const key = normalizeSubjectKey(subject);
    // 같은 키가 둘이면 먼저 온 것을 남긴다(목록은 최근 수정순이라 최신이 먼저다).
    if (key && !index.has(key)) index.set(key, { id: row.id, title: row.title });
  }
  return index;
}

/** 고른 맥락의 본문. 실제로 쓰기로 한 뒤에만 받는다. */
export async function fetchAchievementContextBody(id: string): Promise<AchievementContext | null> {
  const { data, error } = await table()
    .select('id, title, body')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as AchievementContext;
}

/** A requested reference must not silently disappear from an AI request. */
export async function loadSelectedAchievementContext(context: { id: string } | null, enabled: boolean) {
  if (!enabled || !context) return undefined;
  const result = await fetchAchievementContextBody(context.id);
  if (!result?.body?.trim()) throw new Error('성취기준을 불러오지 못했어요. 다시 시도하거나 성취기준 맥락을 사용 안 함으로 바꿔 주세요.');
  return { title: result.title, body: result.body };
}
