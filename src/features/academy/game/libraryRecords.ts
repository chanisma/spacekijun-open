import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * 왕립 도서관 책장의 선배 기록 — 보여 주는 규칙 (2026-10-22 사용자 결정).
 *
 * ①**지금 재학 중인 1·2·3학년의 기록은 감춘다** — 학년도 기준 «올해 − 2» 이후의 기록이 재학생 몫이다
 *   (올해 3학년은 2년 전에 입학했다). 참여자 명단으로 가리지 않는 것은 `activity_participation` 이
 *   드문드문이라(2025 기록 1,152건 중 재학생 연결 47건) 명단으로 거르면 대부분 새어 나가기 때문이다.
 * ②**구체적인 주제는 보이지 않고 키워드만** — 활동 이름·본문은 그대로 베껴 쓸 수 있는 주제라서
 *   목차·본문·연구대로 가져가는 자료 모두 키워드 나열로만 다룬다.
 */

/** 한국 시간 기준 학년도 — 3월에 바뀐다(1·2월은 지난 학년도). */
export function schoolYearOf(now: Date = new Date()): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  return kst.getUTCMonth() < 2 ? year - 1 : year;
}

/** 재학생(지금의 1·2·3학년)이 남긴 학년도의 기록인가 — 학년도를 모르면 감춘다. */
export function isCurrentStudentRecord(academicYear: number | null | undefined, now: Date = new Date()): boolean {
  if (typeof academicYear !== 'number' || !Number.isFinite(academicYear)) return true;
  return academicYear >= schoolYearOf(now) - 2;
}

/** 보여 줄 키워드 — 앞뒤 공백을 걷고 같은 말은 한 번만. */
export function recordKeywords(keywords: readonly string[] | null | undefined, max = 12): string[] {
  const seen = new Set<string>();
  for (const raw of keywords ?? []) {
    const word = raw?.trim();
    if (word && !seen.has(word)) seen.add(word);
    if (seen.size >= max) break;
  }
  return [...seen];
}

export function keywordLine(keywords: readonly string[] | null | undefined, max = 6): string {
  const list = recordKeywords(keywords, max);
  return list.length ? list.join(' · ') : '키워드 없는 기록';
}

/** 이미 남은 장 기록(활동 id)의 키워드 — 서버가 적어 둔 활동 이름 대신 쓴다. */
export function useRecordKeywords(activityId: string | null | undefined) {
  return useQuery({
    queryKey: ['academy-record-keywords', activityId],
    enabled: !!activityId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('activity').select('keywords').eq('id', activityId!).maybeSingle();
      if (error) throw error;
      return recordKeywords((data as { keywords?: string[] } | null)?.keywords);
    },
  });
}
