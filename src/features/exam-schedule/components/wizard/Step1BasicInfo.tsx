import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Circle, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExamScheduleStore } from '../../hooks/useExamScheduleStore';
import { useExamSubjectCandidates } from '../../hooks/useExamSubjectCandidates';
import { buildExamSubject } from '../../utils/subjectCategorizer';
import { GradeTabs, GRADE_ACCENTS } from '../shared/GradeTabs';
import { ALL_GRADES } from '../../constants';
import type { Grade, SubjectCandidate } from '../../types';

export function Step1BasicInfo() {
  const { state, dispatch, setStep, setActiveGrade } = useExamScheduleStore();

  // 학년별 후보는 고정 3개 쿼리로 가져온다 (포함 학년만 enabled).
  const q1 = useExamSubjectCandidates(state.grades.includes(1) ? 1 : null);
  const q2 = useExamSubjectCandidates(state.grades.includes(2) ? 2 : null);
  const q3 = useExamSubjectCandidates(state.grades.includes(3) ? 3 : null);
  const queries: Record<Grade, typeof q1> = { 1: q1, 2: q2, 3: q3 };

  const activeGrade = state.activeGrade;
  const activeQuery = queries[activeGrade];
  const activeSubjects = state.gradeInputs[activeGrade].subjects;
  const selectedSubjectIds = new Set(activeSubjects.map((s) => s.id));

  const toggleSubject = (c: SubjectCandidate) => {
    const built = buildExamSubject(
      { name: c.subject, studentCodes: c.student_codes, isUniversal: c.is_universal },
      activeGrade,
    );
    if (selectedSubjectIds.has(built.id)) {
      dispatch({
        type: 'SET_SUBJECTS',
        grade: activeGrade,
        subjects: activeSubjects.filter((s) => s.id !== built.id),
      });
    } else {
      dispatch({
        type: 'SET_SUBJECTS',
        grade: activeGrade,
        subjects: [...activeSubjects, built],
      });
    }
  };

  const selectAllCommon = (grade: Grade) => {
    const data = queries[grade].data;
    if (!data) return;
    const universals = data
      .filter((c) => c.is_universal)
      .map((c) =>
        buildExamSubject(
          { name: c.subject, studentCodes: c.student_codes, isUniversal: true },
          grade,
        ),
      );
    dispatch({ type: 'SET_SUBJECTS', grade, subjects: universals });
  };

  const selectAllCommonAllGrades = () => {
    for (const g of state.grades) selectAllCommon(g);
  };

  const gradeIssues = state.grades.map((g) => {
    const subjects = state.gradeInputs[g].subjects;
    return {
      grade: g,
      count: subjects.length,
      hasEmpty: subjects.some((s) => s.studentCodes.length === 0),
    };
  });
  const missingGrades = gradeIssues.filter((g) => g.count === 0).map((g) => g.grade);
  const hasEmptyStudentSubject = gradeIssues.some((g) => g.hasEmpty);
  const canProceed =
    state.title.trim().length > 0 &&
    state.grades.length > 0 &&
    missingGrades.length === 0 &&
    !hasEmptyStudentSubject;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-blue-600" />
          기초 정보
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          전 학년 시험 시간표를 한 번에 생성합니다. 학년 탭을 오가며 학년별 시험 과목을 선택하세요.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>시험 시간표 이름</Label>
          <Input
            value={state.title}
            placeholder="예: 2026학년도 1학기 중간고사"
            onChange={(e) => dispatch({ type: 'SET_TITLE', title: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>포함 학년</Label>
          <div className="flex gap-2">
            {ALL_GRADES.map((g) => {
              const included = state.grades.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => dispatch({ type: 'TOGGLE_GRADE', grade: g })}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                    included
                      ? cn(GRADE_ACCENTS[g].idle, 'ring-1 ring-inset')
                      : 'border-muted bg-muted/30 text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  {included ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Circle className="h-3.5 w-3.5" />
                  )}
                  {g}학년
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            전 학년이 같은 시험 기간을 공유하며, 교시별 감독 교사 수요가 학년 간 합산되어 검증됩니다.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>학년별 시험 대상 과목</Label>
            <Button type="button" size="sm" variant="outline" onClick={selectAllCommonAllGrades}>
              모든 학년 공통 과목 일괄 선택
            </Button>
          </div>

          <GradeTabs
            grades={state.grades}
            active={activeGrade}
            onSelect={setActiveGrade}
            badge={(g) => `${state.gradeInputs[g].subjects.length}과목`}
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {activeGrade}학년 선택 과목: {activeSubjects.length}개
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => selectAllCommon(activeGrade)}
            >
              {activeGrade}학년 공통 과목 전체 선택
            </Button>
          </div>

          {activeQuery.error ? (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
              과목 후보 조회 실패:{' '}
              {activeQuery.error instanceof Error
                ? activeQuery.error.message
                : String(activeQuery.error)}
            </div>
          ) : activeQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-md border p-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {(activeQuery.data ?? []).map((c) => {
                  const sid = `g${activeGrade}-${c.subject}`;
                  const selected = selectedSubjectIds.has(sid);
                  return (
                    <button
                      key={c.subject}
                      type="button"
                      onClick={() => toggleSubject(c)}
                      className={[
                        'flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors',
                        selected
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-muted/40',
                      ].join(' ')}
                    >
                      <span className="text-sm font-medium leading-tight">{c.subject}</span>
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={[
                            'rounded-full px-2 py-0.5 text-xs',
                            c.is_universal
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700',
                          ].join(' ')}
                        >
                          {c.is_universal ? '공통' : '선택'}
                        </span>
                        <span className="text-xs text-muted-foreground">{c.student_count}명</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {!activeQuery.data?.length && (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  과목 후보가 없습니다. resource.meta.timetable이 설정되어 있는지 확인하세요.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1 text-xs text-rose-600">
            {missingGrades.length > 0 && (
              <p>⚠ {missingGrades.join('·')}학년에 선택된 과목이 없습니다.</p>
            )}
            {hasEmptyStudentSubject && <p>⚠ 응시자가 0명인 과목이 있습니다. 다시 선택해 주세요.</p>}
          </div>
          <Button disabled={!canProceed} onClick={() => setStep('insights')} className="ml-auto">
            다음 단계
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
