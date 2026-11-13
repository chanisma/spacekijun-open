import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  examKey,
  fetchStudentExamIndex,
  fetchStudentOverview,
  fetchSubjectDetail,
  type SchoolExamOption,
  type SchoolExamSubjectOption,
  type SchoolExamSubjectOverview,
} from '../services/schoolExamService';
import {
  buildAreaStats,
  buildDifficultyBreakdown,
  buildItemRows,
  buildStandardStats,
  buildSummary,
  type SchoolExamCohort,
  type SchoolExamQuestionRow,
  type SchoolExamResultRow,
} from '../utils/schoolExamAnalysis';
import type { EvalearnStudent } from '../types';

/**
 * 학교 지필평가 탭의 상태.
 *
 * 두 단계로 읽는다: ① 학생이 응시한 고사·과목 목록(가벼운 키만) ② 선택한 과목의 상세.
 * 목록 단계에서 답안 배열까지 가져오면 과목 20개분 text[]가 통째로 딸려와 느려진다.
 */
export function useSchoolExamData(student: EvalearnStudent | null) {
  const [exams, setExams] = useState<SchoolExamOption[]>([]);
  const [subjectsByExam, setSubjectsByExam] = useState<Map<string, SchoolExamSubjectOption[]>>(new Map());
  const [selectedExam, setSelectedExam] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);

  const [result, setResult] = useState<SchoolExamResultRow | null>(null);
  const [questions, setQuestions] = useState<SchoolExamQuestionRow[]>([]);
  const [cohort, setCohort] = useState<SchoolExamCohort | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [overview, setOverview] = useState<SchoolExamSubjectOverview[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // ① 고사·과목 목록
  useEffect(() => {
    if (!student) {
      setExams([]);
      setSubjectsByExam(new Map());
      setSelectedExam(null);
      setSelectedSubject(null);
      return;
    }
    let cancelled = false;
    setIndexLoading(true);
    fetchStudentExamIndex(student.id)
      .then(({ exams: loaded, subjectsByExam: bySubject }) => {
        if (cancelled) return;
        setExams(loaded);
        setSubjectsByExam(bySubject);
        // 가장 최근 고사의 **전체 과목 개요**로 시작한다(selectedSubject === null).
        // 특정 과목으로 바로 떨어뜨리면 왜 그 과목인지 알 수 없고, 전 과목 분포를 먼저
        // 보여주는 쪽이 "어디가 약한가"라는 첫 질문에 바로 답한다.
        const firstExam = loaded[0] ?? null;
        setSelectedExam(
          firstExam ? examKey(firstExam.academicYear, firstExam.semester, firstExam.examRound) : null
        );
        setSelectedSubject(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('학교 시험 목록을 불러오지 못했습니다:', err);
        toast.error('학교 시험 목록을 불러오지 못했습니다.');
        setExams([]);
        setSubjectsByExam(new Map());
      })
      .finally(() => {
        if (!cancelled) setIndexLoading(false);
      });
    return () => { cancelled = true; };
  }, [student]);

  const currentExam = useMemo(
    () => exams.find((e) => examKey(e.academicYear, e.semester, e.examRound) === selectedExam) ?? null,
    [exams, selectedExam]
  );
  const subjects = useMemo(
    () => (selectedExam ? subjectsByExam.get(selectedExam) ?? [] : []),
    [selectedExam, subjectsByExam]
  );

  // 응시 당시 학년. 학생의 현재 학년(student.grade)을 쓰면 지난 학년도 고사에서 문항을
  // 못 찾고, '인공지능 수학(3)'처럼 학년 간 겹치는 과목에서 남의 학년 시험을 집는다.
  const currentSubjectGrade = useMemo(
    () => subjects.find((s) => s.subjectSection === selectedSubject)?.grade ?? null,
    [subjects, selectedSubject]
  );

  // ②-a 전체 과목 개요(상자그림). 과목 선택과 무관하게 고사 단위로 한 번만 읽는다 —
  // 과목을 오갈 때마다 다시 부르면 같은 응답을 반복해서 받게 된다.
  useEffect(() => {
    if (!student || !currentExam) {
      setOverview([]);
      return;
    }
    let cancelled = false;
    setOverviewLoading(true);
    fetchStudentOverview(
      student.id,
      currentExam.academicYear,
      currentExam.semester,
      currentExam.examRound
    )
      .then((rows) => { if (!cancelled) setOverview(rows); })
      .catch((err) => {
        if (cancelled) return;
        console.error('과목별 분포를 불러오지 못했습니다:', err);
        toast.error('과목별 분포를 불러오지 못했습니다.');
        setOverview([]);
      })
      .finally(() => { if (!cancelled) setOverviewLoading(false); });
    return () => { cancelled = true; };
  }, [student, currentExam]);

  // ②-b 선택 과목 상세
  useEffect(() => {
    if (!student || !currentExam || !selectedSubject || currentSubjectGrade == null) {
      setResult(null);
      setQuestions([]);
      setCohort(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetchSubjectDetail({
      studentCode: student.id,
      academicYear: currentExam.academicYear,
      semester: currentExam.semester,
      examRound: currentExam.examRound,
      grade: currentSubjectGrade,
      subjectSection: selectedSubject,
    })
      .then((detail) => {
        if (cancelled) return;
        setResult(detail.result);
        setQuestions(detail.questions);
        setCohort(detail.cohort);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('학교 시험 상세를 불러오지 못했습니다:', err);
        toast.error('학교 시험 상세를 불러오지 못했습니다.');
        setResult(null);
        setQuestions([]);
        setCohort(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [student, currentExam, selectedSubject, currentSubjectGrade]);

  const itemRows = useMemo(
    () => (result ? buildItemRows(result, questions, cohort) : []),
    [result, questions, cohort]
  );
  const areaStats = useMemo(() => buildAreaStats(itemRows, cohort), [itemRows, cohort]);
  const standardStats = useMemo(() => buildStandardStats(itemRows, cohort), [itemRows, cohort]);
  const difficultyBreakdown = useMemo(() => buildDifficultyBreakdown(itemRows), [itemRows]);
  const summary = useMemo(
    () => (result ? buildSummary(result, questions, cohort, itemRows) : null),
    [result, questions, cohort, itemRows]
  );

  /**
   * 고사를 바꾸면 개요로 돌아간다.
   * 선택 과목을 유지하면 그 고사에 없는 과목을 가리켜 빈 화면이 되고, 첫 과목으로 자동
   * 이동시키면 사용자가 고르지 않은 과목을 보고 있게 된다.
   */
  const changeExam = useCallback((key: string) => {
    setSelectedExam(key);
    setSelectedSubject(null);
  }, []);

  return {
    exams,
    subjects,
    selectedExam,
    selectedSubject,
    setSelectedExam: changeExam,
    setSelectedSubject,
    currentExam,
    loading: indexLoading,
    detailLoading,
    overview,
    overviewLoading,
    result,
    questions,
    cohort,
    itemRows,
    areaStats,
    standardStats,
    difficultyBreakdown,
    summary,
  };
}
