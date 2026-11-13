/**
 * 학년·학급 단위 분석 데이터.
 *
 * 개인 분석(`useMockData`)과 **같은 판정을 쓴다** — 정오는 `mockGrading`, 원점수는
 * `referenceGrade.computeRawScore`. 여기서 따로 계산하면 개인 화면과 집단 화면의
 * 숫자가 어긋나고, 어긋난 쪽이 어느 쪽인지 아무도 모르게 된다.
 *
 * 학년을 고르면 classNum=null 로 학년 전체, 반을 고르면 그 반만 본다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import type { EvalearnStudent, MockProblem } from '../types';
import { fetchStudentsWithMocking, fetchMockProblems } from '../services/evalearnService';
import { fetchGradeCuts } from '../services/gradeCutService';
import { gradeMarkingSubject } from '../utils/mockGrading';
import { computeRawScore, gradeFromCuts, type GradeCut } from '../utils/referenceGrade';
import { findExamGrade } from '../utils/mockResult';
import { computeCohortStats, histogram, diagnose, type CohortStats, type HistogramBin, type Diagnostic } from '../utils/cohortStats';
import {
  groupFromGrade, assignGroupsByScore, computeItemStats, computeReliability,
  skewness, kurtosis, SMALL_SAMPLE_THRESHOLD,
  type ItemResponse, type ItemStat, type SubjectReliability,
} from '../utils/itemAnalysis';
import { toDbSubject } from './useMockData';
import { orderCohortExams } from '../utils/cohortExams';

export interface CohortExam {
  academic_year: number;
  exam_month: number;
  exam_grade: number;
  label: string;
  /** 이 회차에 마킹이 있는 인원 — 목록에서 회차의 무게를 보여준다 */
  studentCount: number;
}

export interface StudentScore {
  studentId: string;
  name: string;
  classNum: number;
  rawScore: number;
  /** 공식 등급이 있으면 그 값, 없으면 참고 등급, 둘 다 없으면 null */
  grade: number | null;
  gradeIsReference: boolean;
}

export interface CohortItemStat {
  problemNumber: number;
  majorCategory: string | null;
  subCategory: string | null;
  /** 교내 정답률(%) */
  schoolRate: number;
  /** 전국 정답률(%) — 없으면 null */
  nationalRate: number | null;
  /** 오답이 가장 많이 몰린 선택지와 그 비율(%) */
  topWrongChoice: { choice: number; rate: number } | null;
  answered: number;
}

export interface CohortResult {
  subject: string;
  maxScore: number;
  scores: StudentScore[];
  stats: CohortStats | null;
  bins: HistogramBin[];
  diagnostics: Diagnostic[];
  /** 반별 통계 — 학년 단위로 볼 때만 채워진다 */
  byClass: { classNum: number; stats: CohortStats }[];
  items: CohortItemStat[];
  /** 배점이 덜 적재돼 원점수를 신뢰할 수 없는 상태 */
  pointsIncomplete: boolean;

  // ── 고전검사이론 지표 (업로드 리포트와 같은 계산) ──
  /** 문항별 그룹 정답률·변별도 */
  itemStats: ItemStat[];
  /** KR-20·평균 rpb·품질 등급 */
  reliability: SubjectReliability;
  /** 능력 그룹을 무엇으로 나눴는지 — 화면에 밝혀야 오해가 없다 */
  groupBasis: '등급' | '원점수 사분위';
  /** 원점수 왜도(+ 저득점 쏠림) */
  skew: number | null;
  /** 원점수 초과첨도(+ 양극화) */
  kurt: number | null;
  /** 소표본(N<30) 여부 — 리포트와 같은 경계 */
  smallSample: boolean;
}

export function useCohortData(
  grade: number | null,
  classNum: number | null,
  exam: CohortExam | null,
  subject: string | null
) {
  const [students, setStudents] = useState<EvalearnStudent[]>([]);
  const [problems, setProblems] = useState<MockProblem[]>([]);
  const [cuts, setCuts] = useState<Map<string, GradeCut>>(new Map());
  const [loading, setLoading] = useState(false);

  // 명단은 학년/반이 바뀔 때만 다시 받는다(회차·과목 전환마다 받으면 낭비)
  useEffect(() => {
    if (grade == null) { setStudents([]); return; }
    let cancelled = false;
    setLoading(true);
    fetchStudentsWithMocking(grade, classNum)
      .then((rows) => { if (!cancelled) setStudents(rows); })
      .catch((e) => {
        console.error('집단 명단 조회 실패', e);
        if (!cancelled) { toast.error('학생 명단을 불러오지 못했습니다.'); setStudents([]); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [grade, classNum]);

  const loadExamMeta = useCallback(async () => {
    if (!exam || !subject) { setProblems([]); return; }
    setLoading(true);
    try {
      const [ps, cs] = await Promise.all([
        fetchMockProblems(exam.academic_year, exam.exam_month, exam.exam_grade, toDbSubject(subject)),
        fetchGradeCuts(exam.academic_year, exam.exam_month, exam.exam_grade).catch(() => new Map<string, GradeCut>()),
      ]);
      setProblems(ps);
      setCuts(cs);
    } catch (e) {
      console.error('문항 메타 조회 실패', e);
      toast.error('문항 메타데이터를 불러오지 못했습니다.');
      setProblems([]);
    } finally {
      setLoading(false);
    }
  }, [exam, subject]);

  useEffect(() => { void loadExamMeta(); }, [loadExamMeta]);

  /** 이 회차에 응시 기록이 있는 학생만 추린다(미응시는 분포를 왜곡한다). */
  const result: CohortResult | null = useMemo(() => {
    if (!exam || !subject || problems.length === 0) return null;

    const problemMap = new Map(problems.map((p) => [p.problem_number, p]));
    const cut = cuts.get(toDbSubject(subject));
    const maxScore = cut?.maxScore ?? problems.reduce((a, p) => a + (p.point ?? 0), 0);

    const scores: StudentScore[] = [];
    // 문항별 집계 — 교내 정답률과 오답 쏠림
    const itemAgg = new Map<number, { correct: number; answered: number; wrong: Map<number, number> }>();
    // 고전검사이론용 — 학생별 정오 배열 + 총점
    const responses: (ItemResponse & { officialGrade: number | null })[] = [];
    const maxProblemNumber = Math.max(0, ...problems.map((p) => p.problem_number));
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

      const officialGrade = findExamGrade(
        s.mock_result?.find(
          (r) => r.academic_year === exam.academic_year && r.exam_month === exam.exam_month && r.exam_grade === exam.exam_grade
        )?.subjects,
        subject
      );
      const refGrade = cut && raw.totalPoints === maxScore ? gradeFromCuts(raw.rawScore, cut.cuts) : null;

      scores.push({
        studentId: s.id,
        name: s.name,
        classNum: s.classNum,
        rawScore: raw.rawScore,
        grade: officialGrade ?? refGrade,
        gradeIsReference: officialGrade === null && refGrade !== null,
      });

      // 문항 분석용 정오 배열 — 문항 번호를 인덱스로 맞춰 둔다(빠진 번호는 null)
      const correctByIndex: (boolean | null)[] = new Array(maxProblemNumber).fill(null);
      for (const item of graded) {
        if (item.problemNumber >= 1 && item.problemNumber <= maxProblemNumber) {
          correctByIndex[item.problemNumber - 1] = item.isCorrect;
        }
      }
      responses.push({
        studentId: s.id,
        correct: correctByIndex,
        totalScore: raw.rawScore,
        group: null, // 아래에서 등급 또는 사분위로 채운다
        officialGrade: officialGrade ?? refGrade,
      });

      for (const item of graded) {
        const agg = itemAgg.get(item.problemNumber) ?? { correct: 0, answered: 0, wrong: new Map<number, number>() };
        if (item.isCorrect !== null) {
          agg.answered += 1;
          if (item.isCorrect) agg.correct += 1;
          else if (item.studentAnswer != null && item.studentAnswer >= 1 && item.studentAnswer <= 5) {
            agg.wrong.set(item.studentAnswer, (agg.wrong.get(item.studentAnswer) ?? 0) + 1);
          }
        }
        itemAgg.set(item.problemNumber, agg);
      }
    }

    const values = scores.map((s) => s.rawScore);
    const stats = computeCohortStats(values);
    const bins = histogram(values, maxScore);

    // 능력 그룹: 등급이 대부분 있으면 등급으로, 아니면 원점수 사분위로.
    // 등급이 반쯤만 있는 상태로 등급 그룹을 쓰면 '상' 그룹이 몇 명뿐이라 변별도가 의미를 잃는다.
    const withGrade = responses.filter((r) => groupFromGrade(r.officialGrade) !== null).length;
    const useGradeGroups = responses.length > 0 && withGrade / responses.length >= 0.8;
    if (useGradeGroups) {
      for (const r of responses) r.group = groupFromGrade(r.officialGrade);
    } else {
      const byScore = assignGroupsByScore(responses.map((r) => ({ studentId: r.studentId, totalScore: r.totalScore })));
      for (const r of responses) r.group = byScore.get(r.studentId) ?? null;
    }

    const itemStats = computeItemStats(responses, maxProblemNumber);
    const reliability = computeReliability(responses, itemStats);

    // 반별 — 학년 단위로 볼 때만 의미가 있다
    const byClass: { classNum: number; stats: CohortStats }[] = [];
    if (classNum == null) {
      const groups = new Map<number, number[]>();
      for (const s of scores) {
        const list = groups.get(s.classNum) ?? [];
        list.push(s.rawScore);
        groups.set(s.classNum, list);
      }
      for (const [cn, vals] of [...groups].sort((a, b) => a[0] - b[0])) {
        const st = computeCohortStats(vals);
        if (st) byClass.push({ classNum: cn, stats: st });
      }
    }

    const items: CohortItemStat[] = [...itemAgg]
      .sort((a, b) => a[0] - b[0])
      .map(([pn, agg]) => {
        const p = problemMap.get(pn);
        const nationalRaw = p?.correct_rate ? parseFloat(p.correct_rate.replace(/[^0-9.]/g, '')) : NaN;
        let topWrong: { choice: number; rate: number } | null = null;
        for (const [choice, cnt] of agg.wrong) {
          const rate = agg.answered > 0 ? (cnt / agg.answered) * 100 : 0;
          if (!topWrong || rate > topWrong.rate) topWrong = { choice, rate: Math.round(rate * 10) / 10 };
        }
        return {
          problemNumber: pn,
          majorCategory: p?.major_category ?? null,
          subCategory: p?.sub_category ?? null,
          schoolRate: agg.answered > 0 ? Math.round((agg.correct / agg.answered) * 1000) / 10 : 0,
          nationalRate: Number.isFinite(nationalRaw) ? nationalRaw : null,
          topWrongChoice: topWrong,
          answered: agg.answered,
        };
      });

    return {
      subject,
      maxScore,
      scores,
      stats,
      bins,
      diagnostics: stats ? diagnose(stats, maxScore, bins) : [],
      byClass,
      items,
      pointsIncomplete,
      itemStats,
      reliability,
      groupBasis: useGradeGroups ? '등급' : '원점수 사분위',
      skew: skewness(values),
      kurt: kurtosis(values),
      smallSample: values.length < SMALL_SAMPLE_THRESHOLD,
    };
  }, [students, problems, cuts, exam, subject, classNum]);

  /**
   * 이 집단이 실제로 응시한 회차 목록(마킹 기준) — 정렬·정리 규칙은 `utils/cohortExams` 가 소유한다.
   */
  const availableExams: CohortExam[] = useMemo(() => {
    const seen = new Map<string, CohortExam>();
    for (const s of students) {
      for (const e of s.mock_marking ?? []) {
        const key = `${e.academic_year}-${e.exam_month}-${e.exam_grade}`;
        const prev = seen.get(key);
        if (prev) {
          prev.studentCount += 1;
          continue;
        }
        seen.set(key, {
          academic_year: e.academic_year,
          exam_month: e.exam_month,
          exam_grade: e.exam_grade,
          label: `${e.academic_year}년 ${e.exam_month}월 (${e.exam_grade}학년)`,
          studentCount: 1,
        });
      }
    }
    return orderCohortExams([...seen.values()]);
  }, [students]);

  /** 그 회차에 이 집단이 실제로 응시한 과목. */
  const availableSubjects: string[] = useMemo(() => {
    if (!exam) return [];
    const set = new Set<string>();
    for (const s of students) {
      const entry = s.mock_marking?.find(
        (e) => e.academic_year === exam.academic_year && e.exam_month === exam.exam_month && e.exam_grade === exam.exam_grade
      );
      for (const key of Object.keys(entry?.subjects ?? {})) set.add(key);
    }
    return [...set].sort();
  }, [students, exam]);

  return { students, availableExams, availableSubjects, result, loading };
}
