import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

import { X, BookOpen, GraduationCap, Trophy } from 'lucide-react';

interface SubjectDetailDialogProps {
    isOpen: boolean;
    onClose: () => void;
    subjectName: string;
    semester: string;
    category: string;
    units: number;
    grade?: number | string;
    remarks?: string;
}

export const SubjectDetailDialog: React.FC<SubjectDetailDialogProps> = ({
    isOpen,
    onClose,
    subjectName,
    semester,
    category,
    units,
    grade,
    remarks,
}) => {
    if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0" hideCloseButton>
                    {/* Header */}
                    <div data-slot="dialog-header" className="shrink-0 px-6 py-5 flex items-center justify-between border-b border-gray-100/50 bg-gradient-to-r from-slate-50/50 to-white/50">
                        <div>
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 uppercase tracking-wide">
                                    {category}
                                </span>
                                <span className="text-xs text-muted-foreground font-medium">
                                    {semester} 학기
                                </span>
                            </div>
                            <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                                {subjectName}
                            </DialogTitle>
                        </div>
                        <button type="button" aria-label="닫기"
                            onClick={onClose}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted/30">

                        {/* Subject Stats Card */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-border/50 shadow-sm flex items-center gap-3">
                                <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                                    <BookOpen size={20} />
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground font-medium">이수단위</div>
                                    <div className="text-sm font-bold text-foreground">{units}단위</div>
                                </div>
                            </div>

                            <div className="bg-white p-4 rounded-xl border border-border/50 shadow-sm flex items-center gap-3">
                                <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
                                    <Trophy size={20} />
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground font-medium">성적/성취도</div>
                                    <div className="text-sm font-bold text-emerald-600">{grade || '-'}</div>
                                </div>
                            </div>
                        </div>

                        {/* Seteuk Content - 비활성화 (권한 시스템 연동 전까지) */}
                        {/*
                        <div className="bg-white/60 p-6 rounded-xl border border-border/50 shadow-sm">
                            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border/50">
                                <div className="p-1.5 rounded-md bg-amber-50 text-amber-600">
                                    <GraduationCap size={16} />
                                </div>
                                <h3 className="font-bold text-foreground text-sm">과목 세부능력 및 특기사항</h3>
                            </div>

                            <div className="prose prose-sm max-w-none">
                                {remarks ? (
                                    <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap font-medium text-[13px] text-justify">
                                        {remarks}
                                    </p>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                                        <BookOpen size={32} className="opacity-20" />
                                        <span className="text-sm">입력된 세특 내용이 없습니다.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        */}
                    </div>

                    {/* Footer */}
                    <div data-slot="dialog-footer" className="shrink-0 bg-white px-6 py-4 flex items-center justify-end border-t border-border/50">
                        <button type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all font-medium shadow-sm hover:shadow active:scale-95 text-sm"
                        >
                            닫기
                        </button>
                    </div>
      </DialogContent>
    </Dialog>
  );
};
