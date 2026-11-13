import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useExamScheduleStore } from '../../hooks/useExamScheduleStore';
import { GradeTabs } from '../shared/GradeTabs';
import type { ExamSubject } from '../../types';

export function Step2SubjectScope() {
  const { state, dispatch, setStep, setActiveGrade, activeGradeInput } = useExamScheduleStore();

  const toggleMajor = (s: ExamSubject) => {
    dispatch({
      type: 'UPDATE_SUBJECT',
      grade: state.activeGrade,
      subjectId: s.id,
      patch: { isMajor: !s.isMajor },
    });
  };

  const totalSubjects = state.grades.reduce(
    (acc, g) => acc + state.gradeInputs[g].subjects.length,
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>주요교과 설정</CardTitle>
        <p className="text-sm text-muted-foreground">
          응시 범위(전체/선택자)는 학생 시간표 데이터로 자동 분류됩니다.
          주요교과 여부만 학년별로 직접 선택해 주세요. 주요교과는 분산 정책의 대상이 됩니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <GradeTabs
          grades={state.grades}
          active={state.activeGrade}
          onSelect={setActiveGrade}
          badge={(g) => {
            const subjects = state.gradeInputs[g].subjects;
            const majors = subjects.filter((s) => s.isMajor).length;
            return `주요 ${majors}/${subjects.length}`;
          }}
        />

        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">과목명</th>
                <th className="px-3 py-2 text-right">응시자 수</th>
                <th className="px-3 py-2 text-center">응시 범위 (자동)</th>
                <th className="px-3 py-2 text-center">주요교과</th>
              </tr>
            </thead>
            <tbody>
              {activeGradeInput.subjects.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2">
                    <span className="font-medium">{s.name}</span>
                    {s.isMajor && (
                      <Badge className="ml-2 bg-rose-100 text-rose-700 hover:bg-rose-100">
                        주요
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.studentCodes.length}명
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.scope === 'all' ? (
                      <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100">
                        전체 응시
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        선택자 응시
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Switch
                        checked={s.isMajor}
                        onCheckedChange={() => toggleMajor(s)}
                        aria-label={`${s.name} 주요교과 토글`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {s.isMajor ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {activeGradeInput.subjects.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    {state.activeGrade}학년에 선택된 과목이 없습니다. 1단계에서 과목을 선택해 주세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep('insights')}>이전</Button>
          <Button disabled={totalSubjects === 0} onClick={() => setStep('periods')}>
            다음 단계
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
