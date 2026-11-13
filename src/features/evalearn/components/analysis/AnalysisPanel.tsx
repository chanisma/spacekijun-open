import React from 'react';
import { cn } from '@/lib/utils';
import { FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EvalearnStudent } from '../../types';
import MockDataViewer from './MockDataViewer';
import WeaknessAnalysis from './WeaknessAnalysis';
import MockExamGrades from './MockExamGrades';
import SchoolExamAnalysis from './SchoolExamAnalysis';
import { PANEL_TAB_BAR_CLASS, PANEL_TAB_GROUP_CLASS, PANEL_TAB_RADIX_CLASS } from '../common/panelChromeStyles';

interface AnalysisPanelProps {
  student: EvalearnStudent | null;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ student }) => {
  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-50/50 border border-slate-100 flex items-center justify-center">
          <FileText size={32} className="text-slate-300" />
        </div>
        <p className="text-sm font-medium">분석할 학생을 선택해주세요</p>
      </div>
    );
  }

  return (
    /*
      집단 분석(CohortAnalysisPanel)과 **같은 껍데기**를 쓴다 — 탭 바는 패널 최상단에
      꽉 찬 흰 줄로 붙고, 본문은 그 아래 회색 바탕 위에 온다. 종전에는 개인 화면만
      유리 카드(`bg-white/40` + `shadow-inner`) 안에 탭과 본문을 함께 넣어, 학생을
      골랐을 때와 반을 골랐을 때가 다른 기능처럼 보였다.
    */
    <div className="flex flex-col h-full bg-slate-50/40">
      <Tabs defaultValue="mock-marking" className="flex flex-col h-full min-h-0">
        <div className={PANEL_TAB_BAR_CLASS}>
          <TabsList className={cn(PANEL_TAB_GROUP_CLASS, 'h-auto')}>
            <TabsTrigger value="mock-marking" className={PANEL_TAB_RADIX_CLASS}>모의고사 열람</TabsTrigger>
            <TabsTrigger value="weakness" className={PANEL_TAB_RADIX_CLASS}>취약점 분석</TabsTrigger>
            <TabsTrigger value="mock-grades" className={PANEL_TAB_RADIX_CLASS}>모의고사 성적</TabsTrigger>
            {/* 학교 시험 — 2026-09-03 부터 학생도 **자기 결과**를 본다.
                서버 RLS(`school_exam_result_select`)가 학생을 본인 행으로 제한하므로
                화면을 열어도 남의 점수·석차는 보이지 않는다. */}
            <TabsTrigger value="school-exam" className={PANEL_TAB_RADIX_CLASS}>학교 시험</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <TabsContent value="mock-marking" className="m-0 flex-1 min-h-0">
            <MockDataViewer key={student.id} student={student} />
          </TabsContent>
          <TabsContent value="weakness" className="m-0 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <WeaknessAnalysis key={student.id} student={student} />
          </TabsContent>
          <TabsContent value="mock-grades" className="m-0 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <MockExamGrades key={student.id} student={student} />
          </TabsContent>
          <TabsContent value="school-exam" className="m-0 flex-1 min-h-0">
            <SchoolExamAnalysis key={student.id} student={student} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default AnalysisPanel;
