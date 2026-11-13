import React from 'react';
import { useExamScheduleStore } from '../../hooks/useExamScheduleStore';
import { Step1BasicInfo } from './Step1BasicInfo';
import { StepSubjectInsights } from './StepSubjectInsights';
import { Step2SubjectScope } from './Step2SubjectScope';
import { Step3Periods } from './Step3Periods';
import { Step4Pinned } from './Step4Pinned';
import { Step5Generate } from './Step5Generate';
import { ResultsCompare } from '../results/ResultsCompare';
import { FinalEditor } from '../editor/FinalEditor';

export function ExamScheduleWizard() {
  const { state } = useExamScheduleStore();
  const step = state.step;
  // 단계 파이프라인(WizardNav)은 페이지 헤더(ExamPageHeader) 안에서 렌더된다.
  return (
    <div className="space-y-4">
      {step === 'basic' && <Step1BasicInfo />}
      {step === 'insights' && <StepSubjectInsights />}
      {step === 'scope' && <Step2SubjectScope />}
      {step === 'periods' && <Step3Periods />}
      {step === 'pinned' && <Step4Pinned />}
      {step === 'generate' && <Step5Generate />}
      {step === 'compare' && <ResultsCompare />}
      {step === 'edit' && <FinalEditor />}
    </div>
  );
}
