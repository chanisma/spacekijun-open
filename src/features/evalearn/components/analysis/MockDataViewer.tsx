import React, { useEffect } from 'react';
import { EvalearnStudent } from '../../types';
import { useMockData } from '../../hooks/useMockData';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Target, Calendar, AlertTriangle, Star, Info } from 'lucide-react';
import { sortSubjects } from '../../utils/subjectOrder';
import { ListPanel, ListGroupLabel, ListItem, ChipBar, Chip } from '../common/panelChrome';
import { resolveCoreSubjectKey } from '../../utils/grade3SubjectTrack';
import { getExamGrade, findExamGrade, findExamSubjectScore } from '../../utils/mockResult';
import { useStudentReferenceGrades, examKey } from '../../hooks/useStudentReferenceGrades';

/** correctRate 값에서 숫자만 추출 (이미 '%'가 포함된 경우 대응) */
function formatCorrectRate(rate: string | null): string | null {
  if (rate == null) return null;
  const num = rate.replace(/[^0-9.]/g, '');
  return num || null;
}

interface MockDataViewerProps {
  student: EvalearnStudent | null;
}

const MockDataViewer: React.FC<MockDataViewerProps> = ({ student }) => {
  const {
    availableExams,
    selectedExamIndex,
    setSelectedExamIndex,
    availableSubjects,
    selectedSubject,
    setSelectedSubject,
    currentExam,
    tableRows,
    subjectSummary,
    examResult,
    referenceGrade,
    loadingProblems,
    loadMockProblems,
  } = useMockData(student);

  // 참고 등급 — 회차 x 과목 전체(공식 등급이 없는 것만 계산된다)
  const referenceGrades = useStudentReferenceGrades(student);

  // Auto-select first subject when exam changes
  useEffect(() => {
    if (availableSubjects.length > 0 && !selectedSubject) {
      setSelectedSubject(availableSubjects[0]);
    }
  }, [availableSubjects, selectedSubject, setSelectedSubject]);

  // Load problems when subject changes
  useEffect(() => {
    if (selectedSubject) {
      loadMockProblems();
    }
  }, [selectedSubject, loadMockProblems]);

  if (!student) return null;

  if (!student.mock_marking || student.mock_marking.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{student.name} 학생의 마킹 데이터가 없습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* ── 왼쪽: 시험 목록 패널 (집단 분석과 같은 공용 껍데기) ── */}
      <ListPanel icon={Calendar} title="시험 목록">
          {availableExams.map((exam, idx) => {
            const isSelected = selectedExamIndex === idx;
            // 연도가 바뀌는 줄에만 헤더 — 학생 한 명도 3년치라 한 덩어리로 흐르면 경계가 안 보인다
            const isNewYear = idx === 0 || availableExams[idx - 1].academic_year !== exam.academic_year;
            // mock_result에서 해당 시험의 주요 과목 등급 추출
            const matchedResult = student.mock_result?.find(
              (r) =>
                r.academic_year === exam.academic_year &&
                r.exam_grade === exam.exam_grade &&
                r.exam_month === exam.exam_month
            );
            // 국어/영어/수학 등급만 수집 — 3학년은 mock_result에 '국어'/'수학' 키가 없고
            // 선택과목 키(화법과작문/미적분 등)로 저장돼 있어 resolveCoreSubjectKey로 폴백.
            const coreSubjects = ['국어', '영어', '수학'];
            const gradeEntries: { subj: string; grade: number; isReference: boolean }[] = [];
            const examRefs = referenceGrades.get(
              examKey(exam.academic_year, exam.exam_month, exam.exam_grade)
            );
            const markingSubjects =
              student.mock_marking?.find(
                (m) =>
                  m.academic_year === exam.academic_year &&
                  m.exam_grade === exam.exam_grade &&
                  m.exam_month === exam.exam_month
              )?.subjects ?? {};

            for (const subj of coreSubjects) {
              // 공식 등급 우선. 3학년은 '국어'/'수학' 키가 없고 선택과목 키로 저장된다.
              const officialKey = matchedResult?.subjects
                ? resolveCoreSubjectKey(exam.exam_grade, exam.academic_year, subj, matchedResult.subjects)
                : subj;
              // 미응시 과목은 grade=0 으로 저장돼 있어 `!= null` 로는 못 거른다 → '0등급'이 찍혔다
              const official = findExamGrade(matchedResult?.subjects, officialKey);
              if (official !== null) {
                gradeEntries.push({ subj, grade: official, isReference: false });
                continue;
              }
              // 공식이 없으면 참고 등급 — 마킹 쪽 키로 찾는다
              const refKey = resolveCoreSubjectKey(exam.exam_grade, exam.academic_year, subj, markingSubjects);
              const ref = examRefs?.get(refKey);
              if (ref) gradeEntries.push({ subj, grade: ref.grade, isReference: true });
            }

            return (
              <React.Fragment key={idx}>
                {isNewYear && <ListGroupLabel>{exam.academic_year}년</ListGroupLabel>}
                <ListItem
                  active={isSelected}
                  onClick={() => {
                    setSelectedExamIndex(idx);
                    setSelectedSubject(null);
                  }}
                  label={`${exam.exam_month}월`}
                  /* 국·영·수 등급 배지 — 목록에서 회차의 성적 흐름이 바로 읽힌다 */
                  meta={gradeEntries.length > 0 ? (
                    <span className="flex gap-1">
                      {gradeEntries.map((e) => (
                        <span
                          key={e.subj}
                          title={e.isReference ? `${e.subj} · 참고 등급(공식 아님)` : e.subj}
                          className={cn(
                            'text-[10px] font-bold w-4 h-4 rounded flex items-center justify-center',
                            e.grade <= 2 ? 'bg-green-100 text-green-700'
                              : e.grade <= 4 ? 'bg-blue-100 text-blue-700'
                              : e.grade <= 6 ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700',
                            // 참고 등급은 테두리 점선으로 구분 — 색(등급)은 그대로 읽히게 둔다
                            e.isReference && 'border border-dashed border-current/50'
                          )}
                        >
                          {e.grade}
                        </span>
                      ))}
                    </span>
                  ) : undefined}
                  sub={`${exam.exam_grade}학년`}
                />
              </React.Fragment>
            );
          })}
      </ListPanel>

      {/* ── 오른쪽: 과목 선택 + 데이터 테이블 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 과목 칩 — 집단 분석과 같은 공용 껍데기 */}
        <ChipBar
          right={subjectSummary ? (
            /* 정답률 — 분모는 채점된 문항 수(미채점 문항을 넣으면 정답률이 낮게 나온다) */
            <Badge
              variant="secondary"
              className="text-xs gap-1"
              title={
                subjectSummary.derivedCount > 0
                  ? `${subjectSummary.derivedCount}문항은 마킹표에 정오가 없어 정답과 대조해 채점했습니다`
                  : undefined
              }
            >
              <TrendingUp className="h-3 w-3" />
              {subjectSummary.correctCount}/{subjectSummary.graded} ({subjectSummary.rate}%)
            </Badge>
          ) : undefined}
        >
            {sortSubjects(availableSubjects).map((subj) => {
              const isActive = selectedSubject === subj;
              // 공식 등급 우선, 없으면 참고 등급
              const official = findExamGrade(examResult?.subjects, subj);
              const ref = currentExam
                ? referenceGrades
                    .get(examKey(currentExam.academic_year, currentExam.exam_month, currentExam.exam_grade))
                    ?.get(subj)
                : undefined;
              const subjGrade = official ?? ref?.grade ?? null;
              const isReference = official === null && ref != null;

              return (
                <Chip
                  key={subj}
                  active={isActive}
                  onClick={() => setSelectedSubject(subj)}
                  title={isReference ? '참고 등급 — 공식 성적 발표 전 추정치입니다' : undefined}
                >
                  {subj}
                  {subjGrade != null && (
                    <span className={cn(
                      'ml-1.5 text-[10px] font-bold',
                      subjGrade <= 2 ? 'text-green-600'
                        : subjGrade <= 4 ? 'text-blue-600'
                        : subjGrade <= 6 ? 'text-amber-600'
                        : 'text-red-500'
                    )}>
                      {subjGrade}등급
                    </span>
                  )}
                  {/* 참고 등급임을 짧게 — 등급 숫자는 공식과 같은 자리에 같은 색으로 둔다 */}
                  {isReference && (
                    <span className="ml-1 text-[9px] font-medium text-amber-600 align-top">참고</span>
                  )}
                </Chip>
              );
            })}
        </ChipBar>

        {/* 성적 요약 (mock_result) — 성적표는 과목 이름 표기가 마킹과 달라(사회·문화 등)
            반드시 findExamSubjectScore 로 찾아야 한다. 직접 인덱싱하면 등급이 통째로 빈다. */}
        {(() => {
          const score = selectedSubject
            ? findExamSubjectScore(examResult?.subjects, selectedSubject)
            : undefined;
          if (!score) return null;
          const officialGrade = getExamGrade(score);
          return (
            <div className="px-4 py-2 border-b border-gray-100 bg-brand-50/50 shrink-0">
              <div className="flex gap-4 text-xs">
                {score.raw_score != null && (
                  <span className="text-slate-600">
                    원점수: <strong className="text-slate-800">{score.raw_score}</strong>
                  </span>
                )}
                {score.standard_score != null && (
                  <span className="text-slate-600">
                    표준점수: <strong className="text-slate-800">{score.standard_score}</strong>
                  </span>
                )}
                {score.percentile != null && (
                  <span className="text-slate-600">
                    백분위: <strong className="text-slate-800">{score.percentile}</strong>
                  </span>
                )}
                {officialGrade !== null && (
                  <span className="text-slate-600">
                    등급: <strong className="text-brand-600">{officialGrade}</strong>
                  </span>
                )}
              </div>
            </div>
          );
        })()}

        {/* 참고 등급 — 공식 성적이 없는 회차에서만 뜬다.
            공식 성적 줄(brand-50)과 색을 달리해 한눈에 다른 것임이 보이게 한다. */}
        {referenceGrade && (
          <div className="px-4 py-2 border-b border-amber-100 bg-amber-50/60 shrink-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                <Info className="h-3 w-3" />
                참고 등급
              </span>
              <span className="text-slate-600">
                원점수: <strong className="text-slate-800">{referenceGrade.rawScore}</strong>
                <span className="text-slate-400"> / {referenceGrade.maxScore}</span>
              </span>
              <span className="text-slate-600">
                등급: <strong className="text-amber-700">{referenceGrade.grade}</strong>
              </span>
              {referenceGrade.vsNationalMean !== null && (
                <span className="text-slate-500">
                  전국 평균 대비{' '}
                  <strong className={referenceGrade.vsNationalMean >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {referenceGrade.vsNationalMean >= 0 ? '+' : ''}{referenceGrade.vsNationalMean}
                  </strong>
                </span>
              )}
              <span className="text-[11px] text-amber-700/80">
                {referenceGrade.isAbsolute
                  ? '절대평가 고정 구간 · 공식 성적 발표 전 추정치입니다'
                  : `${referenceGrade.source} 예상 등급컷 · 공식 등급이 아닙니다`}
              </span>
            </div>
          </div>
        )}

        {/* 정답률 대비 분석 요약 */}
        {tableRows.length > 0 && (() => {
          const criticalCount = tableRows.filter((r) => {
            const rn = r.correctRate ? parseFloat(r.correctRate.replace(/[^0-9.]/g, '')) : null;
            return rn != null && rn >= 70 && r.isCorrect === false;
          }).length;
          const strengthCount = tableRows.filter((r) => {
            const rn = r.correctRate ? parseFloat(r.correctRate.replace(/[^0-9.]/g, '')) : null;
            return rn != null && rn < 30 && r.isCorrect === true;
          }).length;
          if (criticalCount === 0 && strengthCount === 0) return null;
          return (
            <div className="px-4 py-1.5 border-b border-gray-100 bg-white shrink-0 flex gap-3 items-center text-xs">
              {criticalCount > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  핵심 보완 <strong>{criticalCount}</strong>문항
                </span>
              )}
              {strengthCount > 0 && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <Star className="h-3.5 w-3.5" />
                  강점 <strong>{strengthCount}</strong>문항
                </span>
              )}
            </div>
          );
        })()}

        {/* 마킹 데이터 테이블 */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          {loadingProblems ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500"></div>
            </div>
          ) : !selectedSubject ? (
            <div className="text-center text-slate-400 text-xs p-8">
              과목을 선택하세요
            </div>
          ) : tableRows.length === 0 ? (
            <div className="text-center text-slate-400 text-xs p-8">
              데이터가 없습니다
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="border-b border-gray-200">
                  <th className="p-2 text-center font-medium text-slate-500 w-12">번호</th>
                  <th className="p-2 text-center font-medium text-slate-500 w-14">답안</th>
                  <th className="p-2 text-center font-medium text-slate-500 w-14">정오</th>
                  <th className="p-2 text-center font-medium text-slate-500">대영역</th>
                  <th className="p-2 text-center font-medium text-slate-500">소영역</th>
                  <th className="p-2 text-center font-medium text-slate-500 w-16">정답률</th>
                  <th className="p-2 text-left font-medium text-slate-500">출제의도</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  const rateNum = formatCorrectRate(row.correctRate);
                  const rateVal = rateNum != null ? parseFloat(rateNum) : null;
                  const isCritical = rateVal != null && rateVal >= 70 && row.isCorrect === false;
                  const isStrength = rateVal != null && rateVal < 30 && row.isCorrect === true;
                  return (
                    <tr
                      key={row.problemNumber}
                      className={cn(
                        'border-b border-gray-50 transition-colors',
                        isCritical && 'bg-red-100/60',
                        isStrength && 'bg-emerald-100/50',
                        !isCritical && !isStrength && row.isCorrect === false && 'bg-red-50/50',
                        !isCritical && !isStrength && row.isCorrect === true && 'bg-green-50/30'
                      )}
                    >
                      <td className="p-2 text-center font-medium text-slate-600">
                        {row.problemNumber}
                      </td>
                      <td className="p-2 text-center font-medium text-slate-700">
                        {row.studentAnswer ?? '-'}
                      </td>
                      <td className="p-2 text-center">
                        <span
                          className="inline-flex items-center gap-1"
                          title={
                            row.gradeSource === 'answerKey'
                              ? '마킹표에 정오가 없어 정답과 대조해 채점한 문항입니다'
                              : undefined
                          }
                        >
                          {row.isCorrect === true ? (
                            <span className="text-green-600 font-bold">O</span>
                          ) : row.isCorrect === false ? (
                            <span className="text-red-500 font-bold">X</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                          {/* 유도된 정오는 점 하나로 구분 — 공식 채점값과 섞이면 안 된다 */}
                          {row.gradeSource === 'answerKey' && (
                            <span className="text-[9px] leading-none text-slate-400" aria-label="정답 대조로 채점">
                              ·
                            </span>
                          )}
                          {isCritical && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600 font-semibold" title="정답률 70%+ 이지만 오답 — 핵심 보완 필요">
                              <AlertTriangle className="h-3 w-3" />
                            </span>
                          )}
                          {isStrength && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-semibold" title="정답률 30% 미만이지만 정답 — 강점">
                              <Star className="h-3 w-3" />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="p-2 text-center text-slate-600">
                        {row.majorCategory ?? <span className="text-slate-300">-</span>}
                      </td>
                      <td className="p-2 text-center text-slate-600">
                        {row.subCategory ?? <span className="text-slate-300">-</span>}
                      </td>
                      <td className="p-2 text-center">
                        {rateNum != null ? (
                          <span
                            className={cn(
                              'font-medium',
                              parseFloat(rateNum) < 30
                                ? 'text-red-500'
                                : parseFloat(rateNum) < 60
                                ? 'text-amber-600'
                                : 'text-green-600'
                            )}
                          >
                            {rateNum}%
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-2 text-left text-slate-600 max-w-xs truncate" title={row.intention ?? ''}>
                        {row.intention ?? <span className="text-slate-300">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default MockDataViewer;
