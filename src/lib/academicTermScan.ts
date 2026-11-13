import { supabase } from '@/integrations/supabase/client';

/**
 * (academic_year, semester)를 가진 대용량 테이블에서 "데이터가 존재하는 학기 목록"을
 * 최신순으로 구한다. 관리 화면들의 학기 드롭다운이 공유하는 단일 출처.
 *
 * 전체 행을 select해서 distinct를 만들면 안 된다: PostgREST가 요청당 행 수를 상한
 * (이 프로젝트 1000행)으로 자르는데, 학기 하나가 이미 수천 행이면 상한이 첫 학기에서
 * 다 소진된다. 그러면 뒤에 쌓인 새 학기가 통째로 누락돼 드롭다운에 항목조차 생기지
 * 않는다. 실측(2026-08): student_enrollment 2026-1이 6,285행이라 무제한 select가
 * 1000행 전부를 1학기로 채웠고, 2학기 6,286행은 단 한 건도 스캔에 들어오지 못했다.
 *
 * 잘림은 데이터가 늘수록 조용해진다 — 테이블이 작을 땐 모든 학기가 우연히 상한 안에
 * 들어와 정상 동작하다가, 임계점을 넘는 순간부터 새 학기만 보이지 않기 시작한다.
 * 그래서 지금 증상이 없는 테이블도 같은 함수를 쓴다.
 *
 * 대신 "가장 최신 학기 1건 → 그보다 이전 학기 1건 → …"으로 내려가며 모은다. 네트워크
 * 왕복이 행 수가 아니라 학기 수에 비례하므로 몇 년치가 쌓여도 안전하다.
 *
 * 아래 네 테이블 모두 (academic_year, semester)를 선두 컬럼으로 하는 인덱스가 있어
 * (teacher_timetable은 idx_tt_term_grade의 접두 부분) 각 조회가 index-only 역방향
 * 스캔으로 처리된다. 한 스텝은 이미 지나온 최신 학기의 인덱스 엔트리를 건너뛰지만
 * 힙 접근이 없어(Heap Fetches 0) 비용이 작다 — student_enrollment에서 6,286엔트리를
 * 건너뛰는 실측이 0.8ms / 18 buffer. 새 테이블을 추가할 땐 그런 인덱스를 먼저 확인할 것.
 */

export interface TermOption {
  academicYear: number;
  semester: number;
}

/** 학기 수 상한 가드 — 무한 루프 방지용이며 정상 데이터에선 도달하지 않는다. */
const MAX_TERMS = 40;

export type TermScanTable =
  | 'student_enrollment'
  | 'student_timetable'
  | 'teacher_timetable'
  | 'course_offering';

/** 데이터가 존재하는 학기 목록. 학년도·학기 모두 내림차순(최신 학기가 [0]). */
export async function fetchDistinctTerms(table: TermScanTable): Promise<TermOption[]> {
  const terms: TermOption[] = [];

  for (let i = 0; i < MAX_TERMS; i++) {
    let q = supabase
      .from(table)
      .select('academic_year, semester')
      .order('academic_year', { ascending: false })
      .order('semester', { ascending: false })
      .limit(1);

    const last = terms[terms.length - 1];
    if (last) {
      // 직전에 찾은 학기보다 엄격히 이전인 행만 — (연도, 학기) 사전식 비교
      q = q.or(
        `academic_year.lt.${last.academicYear},` +
          `and(academic_year.eq.${last.academicYear},semester.lt.${last.semester})`
      );
    }

    const { data, error } = await q;
    if (error) throw error;

    const row = data?.[0];
    if (!row) break;
    terms.push({ academicYear: row.academic_year, semester: row.semester });
  }

  return terms;
}
