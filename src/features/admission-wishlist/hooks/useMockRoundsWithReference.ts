/**
 * 모의고사 회차 + **참고 등급 회차**를 합친 목록.
 *
 * 수능최저 판정과 오른쪽 패널이 쓰는 `get_wishlist_mock_rounds` 는 공식 성적(`mock_result`)만
 * 읽는다. 그래서 성적 발표 전 회차(2026-09 등)는 **회차 자체가 목록에 없다** — 학생 입장에서
 * 가장 최근 시험이 수능최저 판정에서 통째로 빠진다.
 *
 * 참고 등급은 evalearn 과 **같은 서비스**(`referenceGradeService`)로 계산한다. 각자 계산하면
 * 같은 학생의 9월 등급이 화면마다 달라진다.
 *
 * 공식 회차가 이미 있으면 그대로 두고(공식이 정본), 없는 회차만 채운다.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchStudentReferenceGrades } from '@/features/evalearn/services/referenceGradeService';
import type { MockSubject } from '../utils/csat';
import { useStudentMockRounds } from './useStudentNaesin';

export interface MockRound {
  academicYear: number | null;
  examMonth: number | null;
  subjects: MockSubject[];
  /** 이 회차의 등급이 공식이 아니라 참고 등급인가 */
  isReference?: boolean;
}

export function useMockRoundsWithReference(studentCode: string | null) {
  const roundsQ = useStudentMockRounds(studentCode);

  const refQ = useQuery({
    queryKey: ['admission-wishlist', 'reference-grades', studentCode],
    queryFn: () => fetchStudentReferenceGrades(studentCode!),
    enabled: !!studentCode,
    staleTime: 5 * 60 * 1000,
  });

  const rounds: MockRound[] = useMemo(() => {
    const official: MockRound[] = (roundsQ.data ?? []) as MockRound[];
    if (!refQ.data || refQ.data.size === 0) return official;

    const seen = new Set(official.map((r) => `${r.academicYear}-${r.examMonth}`));
    const extra: MockRound[] = [];

    for (const [key, perSubject] of refQ.data) {
      // key = `${year}-${month}-${grade}` — 회차 목록은 학년 없이 (연도, 월)로 식별한다
      const [yearStr, monthStr] = key.split('-');
      const academicYear = Number(yearStr);
      const examMonth = Number(monthStr);
      if (seen.has(`${academicYear}-${examMonth}`)) continue;

      const subjects: MockSubject[] = [...perSubject].map(([subject, ref]) => ({
        subject,
        grade: ref.grade,
      }));
      if (subjects.length === 0) continue;

      extra.push({ academicYear, examMonth, subjects, isReference: true });
      seen.add(`${academicYear}-${examMonth}`);
    }

    // 최신 -> 과거 (기존 목록과 같은 정렬)
    return [...official, ...extra].sort(
      (a, b) => (b.academicYear ?? 0) - (a.academicYear ?? 0) || (b.examMonth ?? 0) - (a.examMonth ?? 0)
    );
  }, [roundsQ.data, refQ.data]);

  return {
    rounds,
    isLoading: roundsQ.isLoading,
    /** 참고 등급이 하나라도 섞여 있는가 — 화면에 밝혀야 한다 */
    hasReference: rounds.some((r) => r.isReference),
  };
}
