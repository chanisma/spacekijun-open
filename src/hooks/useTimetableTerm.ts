import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ACADEMIC_TERM_SETTING_KEY,
  parseAcademicTerm,
  type AcademicTerm,
} from "@/hooks/useAcademicTerm";

/**
 * 시간표가 사용할 학년도·학기를 해석한다.
 *
 * 우선순위
 *   1. 학사력 — 관리자가 시스템 설정에서 지정한 `system_settings.academic_term` (정본)
 *   2. 폴백   — 정규화 시간표에 존재하는 최신 (학년도, 학기) `get_latest_timetable_term()`
 *   3. null   — 시간표 데이터 자체가 없음
 *
 * 왜 폴백을 두는가: `useAcademicTerm`은 미설정 시 null을 반환하고, 협업보드 수업 검색은
 * 그때 기능을 비활성화하면 된다. 하지만 시간표는 핵심 화면이라 빈 화면이 되면 안 된다.
 * 폴백을 썼다는 사실은 `isFallback`으로 노출해 관리자에게만 안내한다.
 *
 * 학사력 자체를 읽어야 할 때(설정 화면 등)는 `useAcademicTerm`을 직접 쓴다.
 */
export interface TimetableTermState {
  /** 시간표가 사용할 학기. 데이터도 설정도 없으면 null */
  term: AcademicTerm | null;
  /** 학사력이 미설정이라 최신 학기로 폴백했는지 */
  isFallback: boolean;
  isLoading: boolean;
}

/** 학사력 미설정 시 폴백할 최신 학기. 정규화 시간표 두 테이블의 최댓값. */
function useLatestTimetableTerm(enabled: boolean) {
  return useQuery<AcademicTerm | null>({
    queryKey: ["timetable-latest-term"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_latest_timetable_term");
      if (error) {
        console.error("최신 시간표 학기 조회 오류:", error);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return parseAcademicTerm({
        year: (row as { academic_year?: number }).academic_year,
        semester: (row as { semester?: number }).semester,
      });
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTimetableTerm(): TimetableTermState {
  // 학사력을 useAcademicTerm과 같은 queryKey로 읽어 캐시를 공유한다.
  const academic = useQuery<AcademicTerm | null>({
    queryKey: ["academic-term"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", ACADEMIC_TERM_SETTING_KEY)
        .maybeSingle();

      if (error) {
        console.error("학사력 설정 조회 오류:", error);
        return null;
      }
      return parseAcademicTerm(data?.setting_value);
    },
    staleTime: 5 * 60 * 1000,
  });

  // 학사력이 해석된 뒤에만 폴백을 조회한다(불필요한 RPC 방지).
  const needsFallback = !academic.isLoading && !academic.data;
  const latest = useLatestTimetableTerm(needsFallback);

  if (academic.data) {
    return { term: academic.data, isFallback: false, isLoading: false };
  }

  return {
    term: latest.data ?? null,
    isFallback: !!latest.data,
    isLoading: academic.isLoading || (needsFallback && latest.isLoading),
  };
}

/** `2026학년도 1학기` 형태의 표시 문자열. term이 없으면 null. */
export function formatTermLabel(term: AcademicTerm | null): string | null {
  if (!term) return null;
  return `${term.year}학년도 ${term.semester}학기`;
}
