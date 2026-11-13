import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

import { X, BookOpen, GraduationCap, Trophy } from 'lucide-react';
import BlurredContent from '../ui/BlurredContent';

interface SeteukDetailDialogProps {
    isOpen: boolean;
    onClose: () => void;
    subjectName: string;
    semester: string;
    category: string;
    units: number;
    grade?: number | string;
    remarks?: string;
    canViewRemarks?: boolean;
}

const SeteukDetailDialog: React.FC<SeteukDetailDialogProps> = ({
    isOpen,
    onClose,
    subjectName,
    semester,
    category,
    units,
    grade,
    remarks,
    canViewRemarks = true,
}) => {
    if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0" hideCloseButton>
                    {/* Header */}
                    <div data-slot="dialog-header" className="shrink-0 px-6 py-5 flex items-center justify-between border-b border-gray-100/50 bg-gradient-to-r from-slate-50/50 to-white/50">
                        <div>
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-50 text-brand-600 border border-brand-100 uppercase tracking-wide">
                                    {category}
                                </span>
                                <span className="text-xs text-slate-400 font-medium">
                                    {semester} 학기
                                </span>
                            </div>
                            <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                {subjectName}
                            </DialogTitle>
                        </div>
                        <button type="button" aria-label="닫기"
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">

                        {/* Subject Stats Card */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                                <div className="p-2.5 bg-brand-50 rounded-lg text-brand-600">
                                    <BookOpen size={20} />
                                </div>
                                <div>
                                    <div className="text-xs text-slate-400 font-medium">이수단위</div>
                                    <div className="text-sm font-bold text-slate-700">{units}단위</div>
                                </div>
                            </div>

                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                                <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
                                    <Trophy size={20} />
                                </div>
                                <div>
                                    <div className="text-xs text-slate-400 font-medium">성적/성취도</div>
                                    <div className="text-sm font-bold text-emerald-600">{grade || '-'}</div>
                                </div>
                            </div>
                        </div>

                        {/* Seteuk Content */}
                        <div className="glass-panel p-6 border-brand-100/30 bg-white/60">
                            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
                                <div className="p-1.5 rounded-md bg-amber-50 text-amber-600">
                                    <GraduationCap size={16} />
                                </div>
                                <h3 className="font-bold text-slate-800 text-sm">과목 세부능력 및 특기사항</h3>
                            </div>

                            <div className="prose prose-sm max-w-none">
                                {!canViewRemarks ? (
                                    <BlurredContent message="세부능력 및 특기사항을 볼 수 있는 권한이 없습니다" />
                                ) : remarks ? (
                                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap font-medium text-[13px] text-justify">
                                        {remarks}
                                    </p>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                                        <BookOpen size={32} className="opacity-20" />
                                        <span className="text-sm">입력된 세특 내용이 없습니다.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div data-slot="dialog-footer" className="shrink-0 bg-white px-6 py-4 flex items-center justify-end border-t border-gray-100">
                        <button type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all font-medium shadow-sm hover:shadow active:scale-95 text-sm"
                        >
                            닫기
                        </button>
                    </div>
      </DialogContent>
    </Dialog>
  );
};

export default SeteukDetailDialog;
