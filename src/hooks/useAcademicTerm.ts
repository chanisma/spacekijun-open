import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * 현재 학년도·학기. 관리자가 system_settings의 'academic_term' 키에서 설정한다.
 * (예: { "year": 2026, "semester": 1, "start_date": "2026-03-02", "end_date": "2026-08-14" })
 *
 * 하드코딩하지 않는다 — 학기 전환은 학교 일정마다 다르므로 달력 기반 자동
 * 추정 대신 관리자가 명시적으로 지정한 값을 권위 출처로 쓴다. 미설정 시 null.
 *
 * 기간(start/end)은 선택 항목: 방학·개학일이 해마다 달라 학기 범위가 필요한
 * 기능(업무 타임라인의 학기 스코프, 대시보드 주차 표시)이 이 값을 쓴다.
 * 기간이 없어도 학기 자체는 유효하다(기간 의존 기능만 비활성).
 */
export interface AcademicTerm {
  year: number;
  semester: number;
  /** 학기 시작일 (YYYY-MM-DD, 선택) — 종료일과 쌍으로만 존재 */
  startDate?: string;
  /** 학기 종료일 (YYYY-MM-DD, 선택) */
  endDate?: string;
}

export const ACADEMIC_TERM_SETTING_KEY = "academic_term";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD 문자열을 로컬 자정 Date로. 형식·달력이 어긋나면 null. */
export function parseTermDate(value: unknown): Date | null {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // new Date는 2월 30일 같은 값을 조용히 다음 달로 넘기므로 역검증한다.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** academic_term JSONB를 안전하게 파싱. 형식이 어긋나면 null. */
export function parseAcademicTerm(value: unknown): AcademicTerm | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const year = Number(v.year);
  const semester = Number(v.semester);
  if (!Number.isFinite(year) || !Number.isFinite(semester)) return null;
  if (semester !== 1 && semester !== 2) return null;

  const term: AcademicTerm = { year, semester };
  // 기간은 시작·종료가 모두 유효하고 순서가 맞을 때만 인정 — 반쪽 값은 버린다.
  const start = parseTermDate(v.start_date);
  const end = parseTermDate(v.end_date);
  if (start && end && start.getTime() <= end.getTime()) {
    term.startDate = v.start_date as string;
    term.endDate = v.end_date as string;
  }
  return term;
}

/** 설정된 학기 기간을 Date 쌍으로. 기간 미설정이면 null. */
export function getTermPeriod(
  term: AcademicTerm | null | undefined
): { start: Date; end: Date } | null {
  if (!term?.startDate || !term?.endDate) return null;
  const start = parseTermDate(term.startDate);
  const end = parseTermDate(term.endDate);
  if (!start || !end) return null;
  return { start, end };
}

/** `3.2 ~ 8.14` 형태의 짧은 기간 라벨. 기간 미설정이면 null. */
export function formatTermPeriodLabel(term: AcademicTerm | null | undefined): string | null {
  const period = getTermPeriod(term);
  if (!period) return null;
  const fmt = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`;
  return `${fmt(period.start)} ~ ${fmt(period.end)}`;
}

/**
 * 오늘이 학기 기간 안이면 몇 주차인지(시작일 포함 주 = 1주차),
 * 개학 전이면 D-일수를 반환. 기간 밖(종료 후)·미설정이면 null.
 */
export function getTermWeekInfo(
  term: AcademicTerm | null | undefined,
  now: Date = new Date()
): { kind: "week"; week: number } | { kind: "before"; daysUntil: number } | null {
  const period = getTermPeriod(term);
  if (!period) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today.getTime() > period.end.getTime()) return null;
  const diffDays = Math.round((today.getTime() - period.start.getTime()) / 86_400_000);
  if (diffDays < 0) return { kind: "before", daysUntil: -diffDays };
  return { kind: "week", week: Math.floor(diffDays / 7) + 1 };
}

/**
 * 관리자가 설정한 현재 학년도·학기를 읽는다. 미설정이면 data=null.
 * 달력 폴백 없음(요구사항): 설정 전에는 학기 기준 기능을 비활성화한다.
 */
export function useAcademicTerm() {
  return useQuery<AcademicTerm | null>({
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
}
