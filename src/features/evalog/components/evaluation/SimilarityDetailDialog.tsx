import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Student } from '../../types';
import { X, User, Circle, FileText, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SimilarityDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clickedText: string;
  currentStudent: Student;
  similarStudents: Array<{
    student: Student;
    category: string; // '자율활동', '동아리활동', '진로활동', '세부능력특기사항'
    grade?: number;
    subject?: string;
    semester?: string;
    fullText: string;
    similarity: number;
    matchedText: string;
  }>;
}

const SimilarityDetailDialog: React.FC<SimilarityDetailDialogProps> = ({
  isOpen,
  onClose,
  clickedText,
  currentStudent,
  similarStudents,
}) => {
  if (!isOpen) return null;

  // 유사도에 따른 색상 결정
  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 70) return 'text-rose-600 bg-rose-50 border-rose-100';
    if (similarity >= 50) return 'text-orange-600 bg-orange-50 border-orange-100';
    return 'text-amber-600 bg-amber-50 border-amber-100';
  };

  // 텍스트에서 유사 문장 하이라이트
  const highlightMatchedText = (fullText: string, matchedText: string) => {
    const index = fullText.indexOf(matchedText);
    if (index === -1) {
      return <span>{fullText}</span>;
    }

    const before = fullText.substring(0, index);
    const match = fullText.substring(index, index + matchedText.length);
    const after = fullText.substring(index + matchedText.length);

    return (
      <span className="leading-relaxed">
        {before}
        <mark className="bg-yellow-200/80 px-0.5 rounded text-slate-800 font-semibold">{match}</mark>
        {after}
      </span>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0" hideCloseButton>
          {/* 헤더 */}
          <div data-slot="dialog-header" className="shrink-0 px-6 py-4 flex items-center justify-between border-b border-gray-100/50">
            <div>
              <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
                  <FileText size={20} />
                </span>
                유사 문장 상세 정보
              </DialogTitle>
              <p className="text-sm text-slate-500 mt-1 pl-1">
                총 <span className="font-bold text-brand-600">{similarStudents.length}</span>명의 학생과 유사한 내용이 발견되었습니다.
              </p>
            </div>
            <button type="button" aria-label="닫기"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* 내용 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/30">
            {/* 클릭한 문장 */}
            <div className="glass-panel p-5 border-blue-100/50 bg-blue-50/30">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-100/50 px-2.5 py-1 rounded-full border border-blue-100">
                  <User size={12} />
                  현재 학생 ({currentStudent.name})
                </span>
              </div>
              <p className="text-slate-800 leading-relaxed font-medium bg-white/60 p-4 rounded-xl border border-blue-100/30 shadow-sm">
                "{clickedText}"
              </p>
            </div>

            {/* 유사한 학생들의 글 */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-brand-500" />
                유사한 내용을 가진 학생 목록
              </h3>

              <div className="grid gap-4">
                {similarStudents.map((item, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-xl border border-gray-200/60 p-5 hover:shadow-md transition-all duration-300"
                  >
                    {/* 학생 정보 헤더 */}
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold border border-slate-200">
                          {item.student.name[0]}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 flex items-baseline gap-2">
                            {item.student.name}
                            <span className="text-xs font-normal text-slate-400">ID: {item.student.id.slice(0, 6)}...</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-medium">{item.category}</span>
                            {item.grade && <span className="flex items-center gap-1"><Circle size={3} fill="currentColor" /> {item.grade}학년</span>}
                            {item.subject && <span className="flex items-center gap-1"><Circle size={3} fill="currentColor" /> {item.subject}</span>}
                            {item.semester && <span className="flex items-center gap-1"><Circle size={3} fill="currentColor" /> {item.semester}</span>}
                          </div>
                        </div>
                      </div>
                      <div className={cn("px-3 py-1 rounded-full text-sm font-bold border shadow-sm", getSimilarityColor(item.similarity))}>
                        유사도 {Math.round(item.similarity)}%
                      </div>
                    </div>

                    {/* 전체 글 내용 */}
                    <div className="bg-slate-50/50 rounded-lg p-4 border border-slate-100">
                      <div className="text-xs text-slate-400 mb-2 font-bold uppercase tracking-wider flex items-center gap-1">
                        <FileText size={10} /> 전체 내용
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-mono text-[13px]">
                        {highlightMatchedText(item.fullText, item.matchedText)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 푸터 */}
          <div data-slot="dialog-footer" className="shrink-0 bg-white px-6 py-4 flex items-center justify-end border-t border-gray-100">
            <button type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all font-medium shadow-sm hover:shadow active:scale-95"
            >
              닫기
            </button>
          </div>
      </DialogContent>
    </Dialog>
  );
};

export default SimilarityDetailDialog;
