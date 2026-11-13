import React, { useState, useMemo } from 'react';
import { useEvaluationStore, EvaluationMode } from '../../hooks/useEvaluationStore';
import { Student } from '../../types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { DebouncedTextarea } from '../ui/DebouncedTextarea';
import { Input } from '@/components/ui/input';
import SimilarityChecker from './SimilarityChecker';
import { filterSameGrade, resolveStudentGrade } from '../../utils/similarityCohort';
import TeacherObservationPanel from './TeacherObservationPanel';
import * as XLSX from 'xlsx';
import { toast } from '@/lib/toast';
import { DialogFooter,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Download, FileText, UserCircle, Users, BookOpen, Eye, X, Pencil, Check } from 'lucide-react';

interface EvaluationWriterProps {
    student: Student | null;
    allStudents: Student[];
    onStatusChange?: (id: string, status: Student['status']) => void;
}

interface PreviewData {
    headers: string[];
    rows: any[];
    title: string;
}

const EvaluationWriter: React.FC<EvaluationWriterProps> = ({ student, allStudents, onStatusChange }) => {
    const { data, updateEvaluation, getEvaluation, sourceFilename, setSourceFilename } = useEvaluationStore();
    const [activeTab, setActiveTab] = useState<EvaluationMode | 'observation'>('homeroom');
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [isEditingFilename, setIsEditingFilename] = useState(false);
    const [editedFilename, setEditedFilename] = useState('');

    // Periodic Save Reminder (Every 10 minutes)
    React.useEffect(() => {
        const interval = setInterval(() => {
            if (!student) return;
            const currentEval = getEvaluation(student.id);
            const hasContent =
                currentEval.homeroom.autonomy ||
                currentEval.homeroom.career ||
                currentEval.homeroom.behavior ||
                currentEval.subject.content ||
                currentEval.club.content;

            if (hasContent) {
                toast.info('작성 중인 내용이 있다면 저장해주세요!', {
                    description: '작성 내용은 10분마다 자동으로 저장하라는 알림이 뜹니다.',
                    duration: 5000,
                    icon: <div className="text-xl">💾</div>
                });
            }
        }, 10 * 60 * 1000); // 10 minutes

        return () => clearInterval(interval);
    }, [student, getEvaluation]);

    // Memoize otherDocs - MUST be before early return to maintain consistent hook count
    const otherStudentDocsCache = useMemo(() => {
        if (!student) return { homeroom: { autonomy: [], career: [], behavior: [] }, subject: [], club: [] };

        /*
         * **같은 학년만 대조한다** (2026-09-12 사용자 결정 — 유사도 탭과 같은 규칙).
         *
         * 이 검사기의 후보는 DB 가 아니라 지금 불러와 있는 학생 목록이라, 교사가 여러
         * 학년을 함께 불러오면 다른 학년 초안과 대조된다. 유사도 탭은 같은 학년만 보는데
         * 여기는 안 그러면 **같은 기능이 두 화면에서 다른 답**을 낸다.
         * 학년 판정 규칙은 `utils/similarityCohort.ts` 단일 출처.
         */
        const targetGrade = resolveStudentGrade(student);
        const otherStudents = filterSameGrade(
            allStudents.filter(s => s.id !== student.id),
            targetGrade,
        );

        const buildDocs = (mode: EvaluationMode, field: string) => {
            return otherStudents
                .map(s => {
                    const evalData = getEvaluation(s.id);
                    const text = mode === 'homeroom'
                        ? (evalData.homeroom as any)[field]
                        : (evalData[mode] as any).content;
                    return {
                        studentId: s.id,
                        studentName: s.name,
                        text: text || ''
                    };
                })
                .filter(d => String(d.text || '').trim().length > 0);
        };

        return {
            homeroom: {
                autonomy: buildDocs('homeroom', 'autonomy'),
                career: buildDocs('homeroom', 'career'),
                behavior: buildDocs('homeroom', 'behavior'),
            },
            subject: buildDocs('subject', 'content'),
            club: buildDocs('club', 'content'),
        };
    }, [student?.id, allStudents, data, getEvaluation]);

    if (!student) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-50/50 border border-slate-100 flex items-center justify-center">
                    <FileText size={32} className="text-slate-300" />
                </div>
                <p className="text-sm font-medium">학생을 선택해주세요</p>
            </div>
        );
    }

    const evaluation = getEvaluation(student.id);

    // 현재 탭에 따른 기본 파일명 생성
    const getDefaultFilename = () => {
        const titles: Record<string, string> = {
            homeroom: '담임_평가데이터',
            subject: '교과_평가데이터',
            club: '동아리_평가데이터',
            observation: '관찰_데이터'
        };
        return titles[activeTab] || '평가데이터';
    };

    // 현재 사용할 파일명 반환 (편집된 값 > 불러온 파일명 > 기본값)
    const getCurrentFilename = () => {
        if (editedFilename.trim()) return editedFilename;
        if (sourceFilename) return sourceFilename;
        return getDefaultFilename();
    };

    // 파일명 편집 시작
    const handleStartEditFilename = () => {
        setEditedFilename(getCurrentFilename());
        setIsEditingFilename(true);
    };

    // 파일명 편집 완료
    const handleConfirmFilename = () => {
        const newFilename = editedFilename.trim() || getDefaultFilename();
        setSourceFilename(newFilename);
        setEditedFilename('');
        setIsEditingFilename(false);
    };

    // 파일명 편집 취소
    const handleCancelEditFilename = () => {
        setEditedFilename('');
        setIsEditingFilename(false);
    };

    const handleInputChange = (mode: EvaluationMode, field: string, value: string) => {
        updateEvaluation(student.id, mode, field, value);
    };

    // 글자수 계산 함수
    const calculateByteSize = (text: string): number => {
        let bytes = 0;
        if (!text) return 0;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '\n') {
                bytes += 2;
            } else if (/[가-힣]/.test(char)) {
                bytes += 3;
            } else {
                bytes += 1;
            }
        }
        return bytes;
    };

    const getByteLimit = (mode: EvaluationMode, field: string) => {
        if (mode === 'homeroom' && field === 'career') return 2100;
        return 1500;
    };

    const renderByteCount = (text: string, limit: number) => {
        const current = calculateByteSize(text);
        const isOver = current > limit;
        return (
            <span className={`text-xs ${isOver ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                {current} / {limit} 바이트
            </span>
        );
    };

    // 데이터 생성 로직 분리
    const generateExportData = () => {
        let category: 'homeroom' | 'subject' | 'club';
        let title: string;
        let headers: string[] = ['학번', '이름', '평가상태'];

        if (activeTab === 'homeroom') {
            category = 'homeroom';
            title = '담임';
            headers.push('자율활동', '진로활동', '행동특성');
        } else if (activeTab === 'subject') {
            category = 'subject';
            title = '교과';
            headers.push('교과세특', '성적');
        } else {
            category = 'club';
            title = '동아리';
            headers.push('동아리활동');
        }

        const rows = allStudents.map(s => {
            const evalData = getEvaluation(s.id);
            const row: any = {
                학번: s.studentNo || (s as any).studentNumber || '',
                이름: s.name,
                평가상태: s.status,
            };

            if (category === 'homeroom') {
                row['자율활동'] = evalData.homeroom.autonomy;
                row['진로활동'] = evalData.homeroom.career;
                row['행동특성'] = evalData.homeroom.behavior;
            } else if (category === 'subject') {
                row['교과세특'] = evalData.subject.content;
                row['성적'] = evalData.subject.grade || '';
            } else if (category === 'club') {
                row['동아리활동'] = evalData.club.content;
            }
            return row;
        });

        return { rows, title, headers };
    };

    // 엑셀 내보내기 (현재 활성화된 탭 기준)
    const handleExport = () => {
        const { rows, title } = generateExportData();
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, title);

        // 평가 현황 계산 (완료/전체)
        const completedCount = allStudents.filter(s => s.status === '평가완료').length;
        const totalCount = allStudents.length;
        const progressSuffix = totalCount > 0 ? `_${completedCount}-${totalCount}` : '';

        const filename = getCurrentFilename();
        const fullFilename = `${filename}${progressSuffix}`;
        XLSX.writeFile(wb, `${fullFilename}.xlsx`);
        toast.success(`${fullFilename}.xlsx 내보내기 완료`);
    };

    // 미리보기 핸들러
    const handlePreview = () => {
        const data = generateExportData();
        setPreviewData(data);
        setPreviewOpen(true);
    };

    // 문장 교체 핸들러
    const handleSentenceReplace = (original: string, replacement: string) => {
        // 현재 활성화된 탭과 필드에 따라 업데이트
        if (activeTab === 'homeroom') {
            const current = evaluation.homeroom;
            // 각 필드에서 검색하여 교체 (정확한 위치는 모르므로 순차 검색)
            if (current.autonomy.includes(original)) {
                handleInputChange('homeroom', 'autonomy', current.autonomy.replace(original, replacement));
                toast.success('문장이 수정되었습니다.');
            } else if (current.career.includes(original)) {
                handleInputChange('homeroom', 'career', current.career.replace(original, replacement));
                toast.success('문장이 수정되었습니다.');
            } else if (current.behavior.includes(original)) {
                handleInputChange('homeroom', 'behavior', current.behavior.replace(original, replacement));
                toast.success('문장이 수정되었습니다.');
            }
        } else if (activeTab === 'subject') {
            if (evaluation.subject.content.includes(original)) {
                handleInputChange('subject', 'content', evaluation.subject.content.replace(original, replacement));
                toast.success('문장이 수정되었습니다.');
            }
        } else if (activeTab === 'club') {
            if (evaluation.club.content.includes(original)) {
                handleInputChange('club', 'content', evaluation.club.content.replace(original, replacement));
                toast.success('문장이 수정되었습니다.');
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 bg-slate-50/50 shrink-0">
                {/* 학생 이름 + 토글 */}
                <div className="flex items-center gap-2 min-w-0 shrink">
                    <h2 className="font-semibold text-slate-800 flex items-center gap-1.5 text-sm whitespace-nowrap">
                        <UserCircle size={16} className="text-brand-600 shrink-0" />
                        <span className="truncate max-w-[60px]">{student.name}</span>
                    </h2>
                    {onStatusChange && (
                        <div
                            className={`relative w-7 h-3.5 rounded-full cursor-pointer transition-colors duration-300 shrink-0 ${student.status === '평가완료' ? 'bg-green-500' : 'bg-slate-300'}`}
                            onClick={() => onStatusChange(student.id, student.status === '평가완료' ? '평가중' : '평가완료')}
                            title="평가 완료 상태 토글"
                        >
                            <div className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full shadow-sm transition-transform duration-300 ${student.status === '평가완료' ? 'translate-x-3.5' : 'translate-x-0'}`} />
                        </div>
                    )}
                </div>

                {/* 파일명 + 버튼들 */}
                <div className="flex gap-1 items-center ml-auto shrink-0">
                    {/* Filename Display/Edit */}
                    {activeTab !== 'observation' && (
                        <div className="flex items-center">
                            {isEditingFilename ? (
                                <div className="flex items-center gap-0.5">
                                    <Input
                                        value={editedFilename}
                                        onChange={(e) => setEditedFilename(e.target.value)}
                                        className="h-6 w-24 text-xs px-1.5"
                                        placeholder="파일명"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleConfirmFilename();
                                            if (e.key === 'Escape') handleCancelEditFilename();
                                        }}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5"
                                        onClick={handleConfirmFilename}
                                        title="확인"
                                    >
                                        <Check size={10} className="text-green-600" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5"
                                        onClick={handleCancelEditFilename}
                                        title="취소"
                                    >
                                        <X size={10} className="text-slate-400" />
                                    </Button>
                                </div>
                            ) : (
                                <div
                                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100/80 hover:bg-slate-200/80 cursor-pointer transition-colors group"
                                    onClick={handleStartEditFilename}
                                    title="클릭하여 파일명 수정"
                                >
                                    <span className="text-[10px] text-slate-500 max-w-[80px] truncate">
                                        {getCurrentFilename()}
                                    </span>
                                    <Pencil size={8} className="text-slate-400 group-hover:text-slate-600 shrink-0" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Preview Button */}
                    {activeTab !== 'observation' && (
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={handlePreview} title="엑셀 미리보기">
                            <Eye size={12} />
                        </Button>
                    )}

                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleExport} title="현재 탭 내보내기">
                        <Download size={12} />
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EvaluationMode | 'observation')} className="flex-1 flex flex-col min-h-0">
                    <div className="px-4 pt-4 shrink-0">
                        <TabsList className="grid w-full grid-cols-4 bg-slate-100/80 p-1">
                            <TabsTrigger value="homeroom" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                <UserCircle size={14} className="mr-1.5" /> 담임
                            </TabsTrigger>
                            <TabsTrigger value="subject" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                <BookOpen size={14} className="mr-1.5" /> 교과
                            </TabsTrigger>
                            <TabsTrigger value="club" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                <Users size={14} className="mr-1.5" /> 동아리
                            </TabsTrigger>
                            <TabsTrigger value="observation" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                <Eye size={14} className="mr-1.5" /> 관찰
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        <TabsContent value="homeroom" className="space-y-6 m-0 border-none">
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-slate-700 flex justify-between">
                                    자율활동 특기사항
                                    {renderByteCount(evaluation.homeroom.autonomy, getByteLimit('homeroom', 'autonomy'))}
                                </label>
                                <DebouncedTextarea
                                    className="min-h-[120px] resize-y text-sm leading-relaxed focus:ring-brand-500/20"
                                    placeholder="자율활동 내용을 입력하세요..."
                                    value={evaluation.homeroom.autonomy}
                                    onChange={(val) => handleInputChange('homeroom', 'autonomy', val)}
                                />
                                <SimilarityChecker
                                    currentText={evaluation.homeroom.autonomy}
                                    otherDocs={otherStudentDocsCache.homeroom.autonomy}
                                    onReplace={handleSentenceReplace}
                                />
                            </div>

                            <div className="space-y-3 pt-4 border-t border-slate-100">
                                <label className="text-sm font-medium text-slate-700 flex justify-between">
                                    진로활동 특기사항
                                    {renderByteCount(evaluation.homeroom.career, getByteLimit('homeroom', 'career'))}
                                </label>
                                <DebouncedTextarea
                                    className="min-h-[120px] resize-y text-sm leading-relaxed focus:ring-brand-500/20"
                                    placeholder="진로활동 내용을 입력하세요..."
                                    value={evaluation.homeroom.career}
                                    onChange={(val) => handleInputChange('homeroom', 'career', val)}
                                />
                                <SimilarityChecker
                                    currentText={evaluation.homeroom.career}
                                    otherDocs={otherStudentDocsCache.homeroom.career}
                                    onReplace={handleSentenceReplace}
                                />
                            </div>

                            <div className="space-y-3 pt-4 border-t border-slate-100">
                                <label className="text-sm font-medium text-slate-700 flex justify-between">
                                    행동특성 및 종합의견
                                    {renderByteCount(evaluation.homeroom.behavior, getByteLimit('homeroom', 'behavior'))}
                                </label>
                                <DebouncedTextarea
                                    className="min-h-[150px] resize-y text-sm leading-relaxed focus:ring-brand-500/20"
                                    placeholder="행동특성 및 종합의견을 입력하세요..."
                                    value={evaluation.homeroom.behavior}
                                    onChange={(val) => handleInputChange('homeroom', 'behavior', val)}
                                />
                                <SimilarityChecker
                                    currentText={evaluation.homeroom.behavior}
                                    otherDocs={otherStudentDocsCache.homeroom.behavior}
                                    onReplace={handleSentenceReplace}
                                />
                            </div>
                        </TabsContent>

                        <TabsContent value="subject" className="space-y-4 m-0 border-none">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">
                                    교과 성적 (참고자료)
                                </label>
                                <Input
                                    className="text-sm"
                                    placeholder="성적 정보 (예: 1학기 1등급 / 2학기 2등급)"
                                    value={evaluation.subject.grade || ''}
                                    onChange={(e) => handleInputChange('subject', 'grade', e.target.value)}
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-slate-700 flex justify-between">
                                    세부능력 및 특기사항
                                    {renderByteCount(evaluation.subject.content, getByteLimit('subject', 'content'))}
                                </label>
                                <DebouncedTextarea
                                    className="min-h-[300px] resize-y text-sm leading-relaxed focus:ring-brand-500/20"
                                    placeholder="과목별 세부능력 및 특기사항을 입력하세요..."
                                    value={evaluation.subject.content}
                                    onChange={(val) => handleInputChange('subject', 'content', val)}
                                />
                                <SimilarityChecker
                                    currentText={evaluation.subject.content}
                                    otherDocs={otherStudentDocsCache.subject}
                                    onReplace={handleSentenceReplace}
                                />
                            </div>
                        </TabsContent>

                        <TabsContent value="club" className="space-y-4 m-0 border-none">
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-slate-700 flex justify-between">
                                    동아리활동 특기사항
                                    {renderByteCount(evaluation.club.content, getByteLimit('club', 'content'))}
                                </label>
                                <DebouncedTextarea
                                    className="min-h-[300px] resize-y text-sm leading-relaxed focus:ring-brand-500/20"
                                    placeholder="동아리활동 내용을 입력하세요..."
                                    value={evaluation.club.content}
                                    onChange={(val) => handleInputChange('club', 'content', val)}
                                />
                                <SimilarityChecker
                                    currentText={evaluation.club.content}
                                    otherDocs={otherStudentDocsCache.club}
                                    onReplace={handleSentenceReplace}
                                />
                            </div>
                        </TabsContent>

                        <TabsContent value="observation" className="h-full m-0 border-none">
                            <TeacherObservationPanel studentId={student.studentId || student.studentNo || ''} studentName={student.name} />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>

            {/* Preview Dialog */}
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-green-600" />
                            {previewData?.title} 데이터 미리보기
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-auto border rounded-md">
                        <Table>
                            <TableHeader className="bg-slate-50 sticky top-0 z-10">
                                <TableRow>
                                    {previewData?.headers.map((header) => (
                                        <TableHead key={header} className="whitespace-nowrap font-bold text-slate-700">
                                            {header}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {previewData?.rows.map((row, idx) => (
                                    <TableRow key={idx} className="hover:bg-slate-50/50">
                                        {previewData.headers.map((header) => (
                                            <TableCell key={header} className="max-w-[300px] truncate" title={String(row[header] || '')}>
                                                {row[header]}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <DialogFooter className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                            닫기
                        </Button>
                        <Button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white">
                            <Download size={16} className="mr-2" />
                            엑셀 다운로드
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default EvaluationWriter;
