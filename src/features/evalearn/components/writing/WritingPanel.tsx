import React from 'react';
import { PenLine } from 'lucide-react';
import { EvalearnStudent } from '../../types';

interface WritingPanelProps {
  student: EvalearnStudent | null;
}

const WritingPanel: React.FC<WritingPanelProps> = ({ student }) => {
  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 p-6">
        <PenLine size={24} className="opacity-30" />
        <p className="text-xs font-medium text-center">학생을 선택하면<br />메모를 작성할 수 있습니다</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white/50 shrink-0">
        <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
          <PenLine className="h-3.5 w-3.5 text-brand-500" />
          분석 메모
        </h3>
        <p className="text-[10px] text-slate-400 mt-0.5">{student.name}</p>
      </div>

      {/* 메모 영역 (placeholder) */}
      <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
        <textarea
          className="w-full h-full min-h-[200px] resize-none rounded-lg border border-gray-200 bg-white p-3 text-xs text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300 transition-all"
          placeholder="학생 분석 메모를 입력하세요...&#10;&#10;• 취약 영역 분석&#10;• 학습 방향 제안&#10;• 상담 내용 기록"
        />
      </div>
    </div>
  );
};

export default WritingPanel;
