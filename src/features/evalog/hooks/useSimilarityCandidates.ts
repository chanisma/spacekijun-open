import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  SIMILARITY_PAGE_SIZE, pageRanges, resolveStudentGrade, type CohortGrade,
} from '../utils/similarityCohort';
import { extractRealContent } from '../utils/textUtils';
import type { Student } from '../types';

/**
 * 유사도 분석의 대조 후보 조회 — **같은 학년 재학생의 기록만**.
 *
 * ── 종전 구현의 문제 두 가지 (2026-09-12 수정) ──────────────────────────────
 * ① **코호트 필터가 엉뚱한 값을 봤다.** `student_no.substring(0,4)` 를 입학연도로 알고
 *    접두 비교했는데 `student_no` 는 **현재 학반번**(`10926` = 1학년 9반 26번)이다.
 *    앞 4자리는 `학년+반+번호 십의자리` 라, 실측으로 후보 870명 중 **6명**만 통과했다
 *    (의도한 같은 학년은 226명). 즉 사실상 "같은 반, 번호 십의자리까지 같은 학생"과만
 *    대조하고 있었다 — 그래서 이 기능이 일치를 거의 찾지 못했다.
 * ② **행 상한에 조용히 잘렸다.** 창체 질의는 범위 없이 전체를 긁어 **5,865행**을
 *    요구했고(PostgREST 상한 1,000 → 83% 유실), 세특은 과목 목록만으로 **7,587행**을
 *    요구했다(87% 유실). 오류가 아니라 **부분 결과**로 오므로 화면은 멀쩡했다.
 *
 * 지금은 ①같은 학년 재학생 명단을 `resource` 에서 먼저 받아 ②그 학생들만 대상으로
 * `count: 'exact'` + `range()` 페이징으로 **전량**을 가져온다. 받은 행 수가 count 와
 * 어긋나면 `incomplete` 로 표시해 **화면이 그 사실을 말한다**(다시 조용히 잘리지 않게).
 *
 * 학년 판정 규칙과 근거는 `utils/similarityCohort.ts` 머리글에 있다.
 */

const CANDIDATE_STALE_MS = 5 * 60 * 1000;

/** 창의적 체험활동 3종. `student_detailed_activities.category` 의 한글 값이다. */
const CREATIVE_CATEGORIES = ['자율활동', '동아리활동', '진로활동'];

/** 화면이 세특을 부르는 이름. `analyzeCategory` 의 category 키와 짝이어야 한다. */
export const REMARKS_CATEGORY = '세부능력특기사항';

/** 생성 타입에 없는 컬럼(`segmentation` 등)을 쓰지 않지만, 조인 없는 단순 select 라 느슨하게 둔다. */
interface Filter<T> {
  eq: (column: string, value: string) => Filter<T>;
  in: (column: string, values: string[]) => Filter<T>;
  range: (from: number, to: number) => Filter<T>;
  then: <R>(
    onfulfilled: (result: { data: T[] | null; error: { message?: string } | null; count: number | null }) => R,
  ) => Promise<R>;
}
const db = supabase as unknown as {
  from: (table: string) => {
    select: <T>(columns: string, options?: { count: 'exact'; head?: boolean }) => Filter<T>;
  };
};

export interface ComparisonCandidate {
  /** 학생 학적 코드. 같은 학생의 여러 기록이 같은 값을 갖는다. */
  id: string;
  name: string;
  text: string;
  /** **기록의** 학년(그 기록이 몇 학년 때 것인가). 학생의 현재 학년과 다를 수 있다. */
  grade?: number;
  subject?: string;
  category: string;
  semester?: string;
}

export interface SimilarityCandidatePool {
  candidates: ComparisonCandidate[];
  /** 대상 학생의 학년. null 이면 판정 불가 — 화면이 그 사실을 말해야 한다. */
  grade: CohortGrade | null;
  /** 대조 대상 학생 수(자기 자신 제외). */
  peerCount: number;
  /** 받은 기록 수. */
  recordCount: number;
  /**
   * 서버가 센 것보다 적게 받았는가. true 면 결과가 불완전하다 —
   * **감추지 말고 화면에 띄운다**(종전 사고가 정확히 이 상태였다).
   */
  incomplete: boolean;
}

interface ActivityRow {
  student_id: string;
  category: string | null;
  subject_name?: string | null;
  content: string | null;
  grade: number | null;
  semester?: number | string | null;
}

/** `code:meta->>id` 로 학적 코드만 꺼낸다 — `meta` 를 통째로 받으면 학생당 수 KB 가 딸려온다. */
interface RosterRow {
  name: string | null;
  code: string | null;
}

const EMPTY_POOL: SimilarityCandidatePool = {
  candidates: [], grade: null, peerCount: 0, recordCount: 0, incomplete: false,
};

/**
 * 한 질의를 전량 받는다. `count: 'exact'` 로 총량을 먼저 알고 구간을 나눈다.
 *
 * **첫 페이지의 count 를 믿고 나머지를 병렬로 받는다** — 순차로 "빈 페이지가 나올 때까지"
 * 돌면 왕복이 행 수에 비례해 늘고, 마지막 페이지 판정이 상한값에 의존해 깨지기 쉽다.
 */
async function fetchAll<T>(
  build: () => Filter<T>,
): Promise<{ rows: T[]; total: number; incomplete: boolean }> {
  const first = await build().range(0, SIMILARITY_PAGE_SIZE - 1);
  if (first.error) throw first.error;

  const rows = [...(first.data ?? [])];
  const total = first.count ?? rows.length;

  const rest = pageRanges(total).slice(1);
  if (rest.length > 0) {
    const pages = await Promise.all(rest.map(async ([from, to]) => {
      const page = await build().range(from, to);
      if (page.error) throw page.error;
      return page.data ?? [];
    }));
    for (const page of pages) rows.push(...page);
  }

  return { rows, total, incomplete: rows.length < total };
}

export function useSimilarityCandidates(student: Student | null | undefined) {
  const studentCode = student?.studentId || student?.id || null;
  const grade = resolveStudentGrade(student ?? null);
  // 과목 목록은 세특 질의를 좁히는 데만 쓴다. 정렬해 두어야 queryKey 가 안정적이다.
  const subjects = Array.from(new Set(
    (student?.section6_academic_development ?? [])
      .map((s: { subject?: string }) => s.subject)
      .filter((s): s is string => !!s),
  )).sort();

  return useQuery<SimilarityCandidatePool>({
    queryKey: ['evalog', 'similarity-candidates', studentCode, grade, subjects],
    enabled: !!studentCode,
    staleTime: CANDIDATE_STALE_MS,
    queryFn: async () => {
      if (!studentCode) return EMPTY_POOL;
      // 학년을 모르면 **아무것도 대조하지 않는다**. 전 학년을 대조하는 것보다 낫다 —
      // 근거 없는 일치가 섞이면 이 화면의 결론을 신뢰할 수 없다.
      if (grade === null) return { ...EMPTY_POOL, grade };

      // ── 1. 같은 학년 재학생 명단 (졸업생·자퇴생 제외) ──
      // `resource` 가 재학생 정본이다(CLAUDE.md). `meta.grade` 는 JSON 숫자라
      // `meta->>grade` 로 텍스트 비교한다.
      const roster = await db
        .from('resource')
        .select<RosterRow>('name, code:meta->>id')
        .eq('type', 'student')
        .eq('status', 'active')
        .eq('meta->>grade', String(grade));
      if (roster.error) throw roster.error;

      const nameByCode = new Map<string, string>();
      for (const row of roster.data ?? []) {
        const code = row.code;
        if (!code || code === studentCode) continue;   // 자기 자신 제외
        nameByCode.set(code, row.name ?? '이름 없음');
      }
      const peerCodes = [...nameByCode.keys()];
      if (peerCodes.length === 0) {
        return { ...EMPTY_POOL, grade };
      }

      // ── 2. 그 학생들의 기록 (창체 + 세특) ──
      const creative = await fetchAll<ActivityRow>(() => db
        .from('student_detailed_activities')
        .select<ActivityRow>('student_id, category, content, grade', { count: 'exact' })
        .in('student_id', peerCodes)
        .in('category', CREATIVE_CATEGORIES));

      const remarks = subjects.length === 0
        ? { rows: [] as ActivityRow[], total: 0, incomplete: false }
        : await fetchAll<ActivityRow>(() => db
          .from('student_detailed_activities')
          .select<ActivityRow>('student_id, category, subject_name, content, grade, semester', { count: 'exact' })
          .in('student_id', peerCodes)
          .in('subject_name', subjects));

      const candidates: ComparisonCandidate[] = [];

      for (const row of creative.rows) {
        const name = nameByCode.get(row.student_id);
        if (!name || !row.category) continue;
        const text = extractRealContent(row.content ?? '');
        if (!text) continue;
        candidates.push({
          id: row.student_id,
          name,
          text,
          grade: row.grade ?? undefined,
          category: row.category,
        });
      }

      for (const row of remarks.rows) {
        const name = nameByCode.get(row.student_id);
        if (!name) continue;
        const text = extractRealContent(row.content ?? '');
        if (!text) continue;
        candidates.push({
          id: row.student_id,
          name,
          text,
          grade: row.grade ?? undefined,
          semester: row.semester == null ? undefined : String(row.semester),
          subject: row.subject_name ?? undefined,
          category: REMARKS_CATEGORY,
        });
      }

      return {
        candidates,
        grade,
        peerCount: nameByCode.size,
        recordCount: candidates.length,
        incomplete: creative.incomplete || remarks.incomplete,
      };
    },
  });
}
