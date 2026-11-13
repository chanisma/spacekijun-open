import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MockExamImportTab } from '@/features/evalog/components/admin/MockExamImportTab';
import { MockMarkingImportTab } from '@/features/evalog/components/admin/MockMarkingImportTab';
import { GradeAnalysisImportTab } from './GradeAnalysisImportTab';
import { SchoolExamImportTab } from './SchoolExamImportTab';

interface AdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AdminDialog: React.FC<AdminDialogProps> = ({ open, onOpenChange }) => {
  const [activeTab, setActiveTab] = useState('mock-exam');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">시험 분석 관리</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="shrink-0">
            <TabsTrigger value="mock-exam">모의고사 성적</TabsTrigger>
            <TabsTrigger value="mock-marking">마킹 데이터</TabsTrigger>
            <TabsTrigger value="grade-analysis">학년 분석</TabsTrigger>
            <TabsTrigger value="school-exam">학교 시험</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto mt-4 min-h-0">
            <TabsContent value="mock-exam" className="m-0 h-full">
              <MockExamImportTab />
            </TabsContent>
            <TabsContent value="mock-marking" className="m-0 h-full">
              <MockMarkingImportTab />
            </TabsContent>
            <TabsContent value="grade-analysis" className="m-0 h-full">
              <GradeAnalysisImportTab />
            </TabsContent>
            <TabsContent value="school-exam" className="m-0 h-full">
              <SchoolExamImportTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
