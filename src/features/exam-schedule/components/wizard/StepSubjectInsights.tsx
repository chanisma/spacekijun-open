import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useExamScheduleStore } from '../../hooks/useExamScheduleStore';
import { useExamSubjectInsights } from '../../hooks/useExamSubjectInsights';
import { GradeTabs } from '../shared/GradeTabs';

function formatGrade(value: number | null): string {
  return value === null ? '-' : `${value.toFixed(2)}등급`;
}

/**
 * 두 과목의 응시자 집합이 disjoint한 쌍을 모두 찾는다.
 * 이 쌍들은 같은 (day, period) 슬롯에 동시 배치 가능 — 슬롯 절약의 핵심 자유도.
 * 0개면 사실상 K_n 클리크가 형성되어 풀이공간이 매우 좁아질 위험 신호.
 */
function findConcurrencyCandidates(
  subjects: { id: string; name: string; studentCodes: string[] }[],
): Array<{ a: string; b: string }> {
  const pairs: Array<{ a: string; b: string }> = [];
  for (let i = 0; i < subjects.length; i++) {
    const setA = new Set(subjects[i].studentCodes);
    for (let j = i + 1; j < subjects.length; j++) {
      let overlap = false;
      for (const code of subjects[j].studentCodes) {
        if (setA.has(code)) {
          overlap = true;
          break;
        }
      }
      if (!overlap) pairs.push({ a: subjects[i].name, b: subjects[j].name });
    }
  }
  return pairs;
}

export function StepSubjectInsights() {
  const { state, setStep, setActiveGrade, activeGradeInput } = useExamScheduleStore();
  const { insights, isLoadingGrades, gradeError } = useExamSubjectInsights(
    activeGradeInput.subjects,
    state.activeGrade,
  );

  const concurrencyPairs = useMemo(
    () => findConcurrencyCandidates(activeGradeInput.subjects),
    [activeGradeInput.subjects],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>시험 대상 과목 기초 정보</CardTitle>
        <p className="text-sm text-muted-foreground">
          선택한 과목의 학생 응시 패턴과 DB 교과 성적을 학년별로 요약합니다. 성적은 낮은 등급 숫자일수록 우수합니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <GradeTabs
          grades={state.grades}
          active={state.activeGrade}
          onSelect={setActiveGrade}
          badge={(g) => `${state.gradeInputs[g].subjects.length}과목`}
        />
        <div className="grid gap-3 md:grid-cols-5">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">시험 대상 학생</div>
            <div className="mt-1 text-xl font-semibold">{insights.studentCount}명</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">평균 시험 응시 개수</div>
            <div className="mt-1 text-xl font-semibold">
              {insights.averageExamCount.toFixed(2)}개
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">총 과목-학생 응시 건수</div>
            <div className="mt-1 text-xl font-semibold">
              {insights.totalSubjectEnrollments}건
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">대상 학생 평균 성적</div>
            <div className="mt-1 text-xl font-semibold">
              {isLoadingGrades ? '조회 중' : formatGrade(insights.grade.averageGrade)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {insights.grade.loadedCount}/{insights.studentCount}명 성적 보유
            </div>
          </div>
          <div
            className={`rounded-md border p-3 ${
              concurrencyPairs.length === 0 ? 'border-amber-300 bg-amber-50' : ''
            }`}
          >
            <div className="text-xs text-muted-foreground">동시 배치 가능 쌍</div>
            <div
              className={`mt-1 text-xl font-semibold ${
                concurrencyPairs.length === 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {concurrencyPairs.length === 0 ? '없음' : `${concurrencyPairs.length}쌍`}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground leading-tight">
              {concurrencyPairs.length === 0
                ? '모든 과목 쌍 응시자 겹침 — 슬롯 절약 불가'
                : '응시자가 겹치지 않아 같은 슬롯에 함께 배치 가능'}
            </div>
          </div>
        </div>

        {gradeError && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            성적 데이터 조회 실패: {gradeError}
          </div>
        )}

        {concurrencyPairs.length > 0 && (
          <section className="rounded-md border">
            <div className="border-b bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
              동시 배치 가능 과목 쌍 ({concurrencyPairs.length}쌍)
              <span className="ml-2 text-[11px] font-normal text-emerald-700/80">
                같은 (일자, 교시)에 함께 배치 가능 — 슬롯 절약 자유도
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 p-3">
              {concurrencyPairs.map((pair, idx) => (
                <span
                  key={`${pair.a}-${pair.b}-${idx}`}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800"
                >
                  <span className="font-medium">{pair.a}</span>
                  <span className="text-emerald-500">+</span>
                  <span className="font-medium">{pair.b}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-md border">
            <div className="border-b bg-muted/30 px-3 py-2 text-sm font-medium">
              응시 개수별 학생 수
            </div>
            <div className="p-3">
              {insights.examCountBuckets.length === 0 ? (
                <p className="text-sm text-muted-foreground">응시 학생 데이터가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {insights.examCountBuckets.map((bucket) => {
                    const ratio =
                      insights.studentCount > 0
                        ? (bucket.studentCount / insights.studentCount) * 100
                        : 0;
                    return (
                      <div key={bucket.examCount} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>{bucket.examCount}과목 응시</span>
                          <span className="tabular-nums">
                            {bucket.studentCount}명 ({ratio.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-amber-500"
                            style={{ width: `${Math.min(100, ratio)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-md border">
            <div className="border-b bg-muted/30 px-3 py-2 text-sm font-medium">
              시험 과목별 평균 성적
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/20 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">과목</th>
                    <th className="px-3 py-2 text-right">응시자</th>
                    <th className="px-3 py-2 text-right">성적 보유</th>
                    <th className="px-3 py-2 text-right">평균 성적</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.subjectGrades.map((subject) => (
                    <tr key={subject.subjectId} className="border-t">
                      <td className="px-3 py-2">{subject.subjectName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {subject.studentCount}명
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {subject.gradeLoadedCount}/{subject.studentCount}명
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {isLoadingGrades ? '조회 중' : formatGrade(subject.averageGrade)}
                      </td>
                    </tr>
                  ))}
                  {insights.subjectGrades.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        시험 과목 데이터가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="rounded-md border">
          <div className="border-b bg-muted/30 px-3 py-2 text-sm font-medium">
            많은 학생이 선택한 과목 조합
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/20 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">과목 조합</th>
                  <th className="px-3 py-2 text-right">학생 수</th>
                  <th className="px-3 py-2 text-right">평균 성적</th>
                </tr>
              </thead>
              <tbody>
                {insights.topCombinations.map((combo, idx) => (
                  <tr key={`${combo.subjects.join('|')}-${idx}`} className="border-t">
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {combo.subjects.map((subject) => (
                          <Badge key={subject} variant="outline">
                            {subject}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{combo.studentCount}명</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatGrade(combo.averageGrade)}
                    </td>
                  </tr>
                ))}
                {insights.topCombinations.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                      과목 조합 데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep('basic')}>이전</Button>
          <Button onClick={() => setStep('scope')}>과목 범위 설정으로</Button>
        </div>
      </CardContent>
    </Card>
  );
}
