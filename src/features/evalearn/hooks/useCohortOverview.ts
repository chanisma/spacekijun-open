/**
 * 한 회차의 **모든 과목**을 한 화면에서 비교하기 위한 요약.
 *
 * 과목 하나를 고르는 `useCohortData` 와 판정을 공유한다(`gradeMarkingSubject` ·
 * `computeRawScore` · `gradeFromCuts`). 여기서 따로 계산하면 "전체"에서 본 국어 평균등급과
 * "국어"를 눌러서 본 평균등급이 어긋나고, 어느 쪽이 맞는지 아무도 모르게 된다.
 *
 * 비용: 과목 수만큼 `fetchMockProblems` 를 병렬로 부른다(회차당 10개 안팎). 등급컷은
 * 회차 단위라 한 번만 받으면 되고, 서비스가 이미 캐시한다.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import type { EvalearnStudent, MockProblem } from '../types';
import { fetchMockProblems } from '../services/evalearnService';
import { fetchGradeCuts } from '../services/gradeCutService';
import { gradeMarkingSubject } from '../utils/mockGrading';
import { computeRawScore, gradeFromCuts, type GradeCut } from '../utils/referenceGrade';
import { findExamGrade } from '../utils/mockResult';
import { groupFromGrade, ABILITY_GROUPS } from '../utils/itemAnalysis';
import { toDbSubject } from '../utils/subjectAlias';
import { sortSubjects } from '../utils/subjectOrder';
import type { CohortExam } from './useCohortData';

export interface SubjectSummary {
  subject: string;
  /** 응시 인원(마킹이 있는 학생) */
  n: number;
  /** 평균 득점률(%) — 배점이 덜 적재된 회차면 null */
  scoreRate: number | null;
  meanScore: number;
  maxScore: number;
  /** 평균 등급 — 등급을 가진 학생만의 평균. 없으면 null */
  meanGrade: number | null;
  /** 등급을 가진 인원 */
  gradedCount: number;
  /** 참고 등급이 섞였는가 */
  hasReference: boolean;
  /** 능력 그룹별 비율(%) — 합이 100. 등급이 없으면 전부 0 */
  groupRatio: Record<string, number>;
}

/** 소수 한 자리 — 화면에 그대로 쓰는 값이라 여기서 한 번만 자른다 */
function round1(v: number) {
  return Math.round(v * 10) / 10;
}

export function useCohortOverview(
  students: EvalearnStudent[],
  exam: CohortExam | null,
  subjects: string[],
  /** 전체 탭을 실제로 볼 때만 받는다 — 과목당 왕복이 생기므로 */
  enabled: boolean
) {
  const [problemsBySubject, setProblemsBySubject] = useState<Map<string, MockProblem[]>>(new Map());
  const [cuts, setCuts] = useState<Map<string, GradeCut>>(new Map());
  const [loading, setLoading] = useState(false);

  // subjects 는 매 렌더 새 배열이라 그대로 의존성에 넣으면 무한 루프가 된다
  const subjectKey = subjects.join('|');

  useEffect(() => {
    if (!enabled || !exam || subjects.length === 0) {
      setProblemsBySubject(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);

    Promise.all([
      Promise.all(
        subjects.map(async (s) => {
          try {
            const ps = await fetchMockProblems(exam.academic_year, exam.exam_month, exam.exam_grade, toDbSubject(s));
            return [s, ps] as const;
          } catch {
            // 한 과목이 실패해도 나머지 과목 비교는 성립한다
            return [s, [] as MockProblem[]] as const;
          }
        })
      ),
      fetchGradeCuts(exam.academic_year, exam.exam_month, exam.exam_grade).catch(() => new Map<string, GradeCut>()),
    ])
      .then(([pairs, cs]) => {
        if (cancelled) return;
        setProblemsBySubject(new Map(pairs));
        setCuts(cs);
      })
      .catch((e) => {
        console.error('과목별 문항 메타 조회 실패', e);
        if (!cancelled) {
          toast.error('과목별 문항 메타데이터를 불러오지 못했습니다.');
          setProblemsBySubject(new Map());
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, exam?.academic_year, exam?.exam_month, exam?.exam_grade, subjectKey]);

  const summaries: SubjectSummary[] = useMemo(() => {
    if (!exam || problemsBySubject.size === 0) return [];

    const out: SubjectSummary[] = [];

    for (const subject of sortSubjects([...problemsBySubject.keys()])) {
      const problems = problemsBySubject.get(subject) ?? [];
      if (problems.length === 0) continue;

      const problemMap = new Map(problems.map((p) => [p.problem_number, p]));
      const cut = cuts.get(toDbSubject(subject));
      const maxScore = cut?.maxScore ?? problems.reduce((a, p) => a + (p.point ?? 0), 0);

      const rawScores: number[] = [];
      const grades: number[] = [];
      const groupCounts: Record<string, number> = { 상: 0, 중상: 0, 중하: 0, 하: 0 };
      let hasReference = false;
      let pointsIncomplete = false;

      for (const s of students) {
        const entry = s.mock_marking?.find(
          (e) => e.academic_year === exam.academic_year && e.exam_month === exam.exam_month && e.exam_grade === exam.exam_grade
        );
        const subjData = entry?.subjects?.[subject];
        if (!subjData || (subjData.answers?.length ?? 0) === 0) continue;

        const graded = gradeMarkingSubject(subjData, problemMap);
        const raw = computeRawScore(graded, problemMap);
        if (raw.totalPoints !== maxScore) pointsIncomplete = true;
        rawScores.push(raw.rawScore);

        const officialGrade = findExamGrade(
          s.mock_result?.find(
            (r) => r.academic_year === exam.academic_year && r.exam_month === exam.exam_month && r.exam_grade === exam.exam_grade
          )?.subjects,
          subject
        );
        const refGrade = cut && raw.totalPoints === maxScore ? gradeFromCuts(raw.rawScore, cut.cuts) : null;
        const grade = officialGrade ?? refGrade;
        if (grade != null) {
          grades.push(grade);
          if (officialGrade === null) hasReference = true;
          const g = groupFromGrade(grade);
          if (g) groupCounts[g] += 1;
        }
      }

      if (rawScores.length === 0) continue;

      const meanScore = rawScores.reduce((a, b) => a + b, 0) / rawScores.length;
      const groupTotal = ABILITY_GROUPS.reduce((a, g) => a + groupCounts[g], 0);

      out.push({
        subject,
        n: rawScores.length,
        // 배점이 덜 적재된 회차의 득점률은 실제와 다르다 — 틀린 값을 그리느니 비운다
        scoreRate: pointsIncomplete || maxScore <= 0 ? null : round1((meanScore / maxScore) * 100),
        meanScore: round1(meanScore),
        maxScore,
        meanGrade: grades.length > 0 ? round1(grades.reduce((a, b) => a + b, 0) / grades.length) : null,
        gradedCount: grades.length,
        hasReference,
        groupRatio: Object.fromEntries(
          ABILITY_GROUPS.map((g) => [g, groupTotal > 0 ? round1((groupCounts[g] / groupTotal) * 100) : 0])
        ),
      });
    }

    return out;
  }, [students, problemsBySubject, cuts, exam]);

  return { summaries, loading };
}
