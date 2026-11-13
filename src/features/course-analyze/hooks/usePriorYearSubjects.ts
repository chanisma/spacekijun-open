/**
 * Prior Year Subjects Hook — 학급별보기 탭의 국·영·수 합산용
 *
 * currentAcademicYear=2027, currentGrade=2 인 분석 컨텍스트에서, 같은 학생의
 * 직전 1학년 시기 선택과목(2026/target_grade=1 중 가장 최근 마감 라운드 = round_number 최대)을
 * 가져온다. 학생 코드(`student_code`, 예: `00-00450`) → 과목명 Set 맵으로 반환.
 * 라운드 status 조건은 `ANALYSIS_READY_STATUSES`(closed|finalized)로 databaseAdapter와 공유한다.
 *
 * 1학년 컨텍스트(currentGrade=1)는 이전 데이터가 없으므로 빈 맵 반환.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ANALYSIS_READY_STATUSES } from '../services/databaseAdapter';

export interface PriorYearSubjects {
  /** student_code (e.g. '00-00450') → Set of subject_name */
  map: Map<string, Set<string>>;
  /** academic_year of the prior round we used (or null if none) */
  priorAcademicYear: number | null;
  /** round_number of the prior round we used (or null) */
  priorRoundNumber: number | null;
  isLoading: boolean;
}

const EMPTY: PriorYearSubjects = {
  map: new Map(),
  priorAcademicYear: null,
  priorRoundNumber: null,
  isLoading: false,
};

interface RoundRow {
  id: string;
  academic_year: number;
  target_grade: number;
  round_number: number;
  status: string;
}

interface ItemRow {
  subject_name: string;
  course_selection_submission: { student_code: string | null } | null;
}

export function usePriorYearSubjects(
  currentAcademicYear: number | null,
  currentGrade: number
): PriorYearSubjects {
  const [state, setState] = useState<PriorYearSubjects>(EMPTY);

  useEffect(() => {
    // 1학년 또는 컨텍스트 부족 → no-op
    if (!currentAcademicYear || currentGrade !== 2) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState({ ...EMPTY, isLoading: true });

    const priorYear = currentAcademicYear - 1;
    const priorTargetGrade = 1;

    (async () => {
      try {
        // 1) prior year의 1학년 마감 라운드 중 가장 최근 (round_number desc)
        // status는 databaseAdapter와 동일한 집합을 써야 한다. 'finalized'만 보면 관리자가
        // 라운드를 UI에서 저장하는 순간(→ closed) 이 기능만 조용히 사라진다.
        const { data: rounds, error: rErr } = await supabase
          .from('course_selection_round')
          .select('id, academic_year, target_grade, round_number, status')
          .eq('academic_year', priorYear)
          .eq('target_grade', priorTargetGrade)
          .in('status', [...ANALYSIS_READY_STATUSES])
          .order('round_number', { ascending: false })
          .limit(1);
        if (rErr) throw rErr;
        const round = (rounds ?? [])[0] as RoundRow | undefined;
        if (!round) {
          if (!cancelled) setState(EMPTY);
          return;
        }

        // 2) 해당 라운드의 모든 items + submission.student_code (join)
        // PostgREST nested select 문법 사용
        const items: ItemRow[] = [];
        const PAGE = 1000;
        for (let page = 0; ; page++) {
          const { data, error } = await supabase
            .from('course_selection_item')
            .select(
              'subject_name, course_selection_submission!inner(student_code, round_id)'
            )
            .eq('course_selection_submission.round_id', round.id)
            .range(page * PAGE, (page + 1) * PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          items.push(...(data as unknown as ItemRow[]));
          if (data.length < PAGE) break;
        }

        // 3) student_code → Set<subject_name>
        const map = new Map<string, Set<string>>();
        for (const it of items) {
          const sc = it.course_selection_submission?.student_code;
          if (!sc) continue;
          let set = map.get(sc);
          if (!set) {
            set = new Set();
            map.set(sc, set);
          }
          set.add(it.subject_name);
        }

        if (!cancelled) {
          setState({
            map,
            priorAcademicYear: round.academic_year,
            priorRoundNumber: round.round_number,
            isLoading: false,
          });
        }
      } catch (err) {
        console.warn('usePriorYearSubjects failed:', err);
        if (!cancelled) setState(EMPTY);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentAcademicYear, currentGrade]);

  return state;
}
