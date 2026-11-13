/**
 * 우측 패널 "모의고사 요약"에 놓을 **두 회차**를 고른다.
 *
 * 보고 싶은 것은 **그 학생의 3학년 6월·9월 평가원 모의평가**다. 수시 지원 판단과 수능최저
 * 가늠의 기준이 이 둘이고, 상담의 첫 질문이 "6월에서 9월로 어떻게 됐나"라서 회차를 하나씩
 * 넘겨 보던 것을 한 화면에 놓는다.
 *
 * ── 회차 목록에 학년이 없다 ────────────────────────────────────────────────
 * `get_wishlist_mock_rounds` 는 (학년도, 월)만 돌려준다(원본 JSONB 에는 `exam_grade` 가
 * 있지만 RPC 가 싣지 않는다). 그래서 월만 보고 6·9월을 고르면 **다른 학년의 6·9월이 섞인다** —
 * 2026-09 가 아직 없는 3학년 학생에게 2025-09(2학년 9월)가 그냥 "9월"로 붙었다.
 * 라이브 실측(2026-09-03): 재학 3학년 217명 중 2026-09 마킹 보유 172명 → **45명이 이 상태**.
 *
 * 학년 대신 **학년도**로 고른다. 3학년 재학생의 (학년도 → 응시학년)은 라이브에서 정확히
 * 1:1(2026→3 · 2025→2 · 2024→1)이라 판정이 같고, RPC·타입을 건드리지 않아도 된다.
 *
 * ── 없는 자리는 "가장 최근 회차"로 ─────────────────────────────────────────
 * 해당 학년도의 6월·9월 중 없는 것이 있으면 **다른 학년의 같은 달을 끌어오지 않고**
 * 남은 회차 중 가장 최근 것으로 채운다(보통 7월·5월 학평). 채운 회차가 대상 학년도가
 * 아니면 `yearNote` 에 연도를 실어 화면이 이를 밝히게 한다 — 라벨이 "9월" 하나뿐이면
 * 어느 학년 9월인지 알 길이 없어 같은 오해가 반복된다.
 */

/** 회차 식별에 필요한 최소 정보 (MockRound 의 부분집합) */
export interface SummaryRoundInput {
  academicYear: number | null;
  examMonth: number | null;
  isReference?: boolean;
}

export interface MockSummaryPick<T extends SummaryRoundInput> {
  round: T;
  /** 렌더 key — 라벨은 연도가 다르면 겹친다(같은 "9월"이 둘) */
  key: string;
  /** 예: '6월' */
  label: string;
  /** 대상 학년도가 아닌 회차의 연도(예: '2025'). 같은 학년도면 null */
  yearNote: string | null;
  /** 대상 학년도의 평가원(6·9월) 회차인가 — 대체로 채운 자리와 구분 */
  isPyeonggawon: boolean;
}

/** 평가원 모의평가 시행 월 (학평 3·5·7·10월과 구분) */
export const PYEONGGAWON_MONTHS = [6, 9] as const;

/** 최신 → 과거 */
function byRecentDesc(a: SummaryRoundInput, b: SummaryRoundInput): number {
  return (b.academicYear ?? 0) - (a.academicYear ?? 0) || (b.examMonth ?? 0) - (a.examMonth ?? 0);
}

/**
 * 요약에 놓을 회차를 **시간 순(과거 → 최신)** 으로 최대 2개 고른다.
 *
 * @param rounds     학생의 전 회차 (정렬 무관)
 * @param targetYear 기준 학년도 = 학사력의 현재 학년도. null 이면 데이터의 최신 학년도로
 *                   대체한다(학사력 미설정 시의 degradation — 그 해 회차가 하나도 없는
 *                   학생은 이전 학년 6·9월이 잡힐 수 있어 학사력 값을 우선한다).
 */
export function pickMockSummaryRounds<T extends SummaryRoundInput>(
  rounds: T[],
  targetYear: number | null
): Array<MockSummaryPick<T>> {
  if (rounds.length === 0) return [];

  const year =
    targetYear ??
    rounds.reduce<number | null>(
      (max, r) => (r.academicYear != null && (max == null || r.academicYear > max) ? r.academicYear : max),
      null
    );

  const picked: T[] = [];
  if (year != null) {
    for (const month of PYEONGGAWON_MONTHS) {
      const found = rounds.find((r) => r.academicYear === year && r.examMonth === month);
      if (found) picked.push(found);
    }
  }

  // 빈 자리는 남은 회차 중 최신부터. (정렬이 최신순이라 같은 학년도 회차가 자연히 먼저 온다)
  const rest = rounds.filter((r) => !picked.includes(r)).sort(byRecentDesc);
  while (picked.length < 2 && rest.length > 0) picked.push(rest.shift()!);

  return picked
    .sort((a, b) => -byRecentDesc(a, b))
    .map((round) => ({
      round,
      key: `${round.academicYear ?? '?'}-${round.examMonth ?? '?'}`,
      label: round.examMonth != null ? `${round.examMonth}월` : '–',
      yearNote:
        round.academicYear != null && round.academicYear !== year ? String(round.academicYear) : null,
      isPyeonggawon:
        round.academicYear === year &&
        round.examMonth != null &&
        (PYEONGGAWON_MONTHS as readonly number[]).includes(round.examMonth),
    }));
}
