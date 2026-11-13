import React from 'react';
import { Button } from '@/components/ui/button';
import {
    Undo2,
    Redo2,
    Download,
    Upload,
    Play,
    RotateCcw
} from 'lucide-react';

interface HeaderProps {
    mode: 'class' | 'subject';
    onModeChange: (mode: 'class' | 'subject') => void;
    // Info badge (optional per mode)
    grade?: number;
    studentCount?: number;
    isLoading?: boolean;
    isError?: boolean;
    subjectCount?: number;
    /** 현재 보고 있는 학년의 선택과목 신청 학년도 (0이면 표시 안 함). */
    selectionAcademicYear?: number;
    // Action state
    isAssigning?: boolean;
    assignmentsCount: number;
    canUndo: boolean;
    canRedo: boolean;
    // Action callbacks
    onUndo: () => void;
    onRedo: () => void;
    onExport: () => void;
    onImport: () => void;
    onRun: () => void;
    onReset: () => void;
    // Customizable run button
    runDisabled?: boolean;
    runLabel?: string;
}

export function Header({
    mode,
    onModeChange,
    grade,
    studentCount,
    isLoading,
    isError,
    subjectCount,
    selectionAcademicYear,
    isAssigning,
    assignmentsCount,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onExport,
    onImport,
    onRun,
    onReset,
    runDisabled,
    runLabel,
}: HeaderProps) {
    const yearBadge =
        selectionAcademicYear && selectionAcademicYear > 0 ? (
            <span
                className="text-xs text-indigo-700 font-medium bg-indigo-50 px-2 py-1 rounded-full border border-indigo-200"
                title="이 학년 학생들이 선택과목을 신청한 학년도 (진급 직전 신청)"
            >
                {selectionAcademicYear}학년도 신청
            </span>
        ) : null;
    const defaultRunDisabled = runDisabled ?? (isAssigning || isLoading || (studentCount ?? 0) === 0);
    const defaultRunLabel = runLabel ?? (isAssigning ? '배정 중...' : isLoading ? '준비 중...' : '배정 실행');

    return (
        <div className="h-16 border-b bg-white/50 backdrop-blur-sm px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                    <button
                        onClick={() => onModeChange('class')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                            mode === 'class'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        신학년 반 배정
                    </button>
                    <button
                        onClick={() => onModeChange('subject')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                            mode === 'subject'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        과목별 반 배정
                    </button>
                </div>

                {/* Info Badge - mode-specific */}
                <div className="h-4 w-px bg-slate-200 mx-1" />
                {mode === 'class' ? (
                    <>
                        {isLoading ? (
                            <span className="text-sm text-muted-foreground animate-pulse">
                                데이터 로딩 중...
                            </span>
                        ) : isError ? (
                            <span className="text-sm text-destructive font-medium">
                                데이터 로드 오류
                            </span>
                        ) : (studentCount ?? 0) > 0 ? (
                            <>
                                {yearBadge}
                                <span className="text-sm text-slate-600 font-medium bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                                    {grade}학년 {studentCount}명
                                </span>
                            </>
                        ) : (
                            <span className="text-sm text-amber-600 font-medium bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                                학생 데이터 없음
                            </span>
                        )}
                    </>
                ) : (
                    <>
                        {yearBadge}
                        {(studentCount ?? 0) > 0 && (
                            <span className="text-sm text-slate-600 font-medium bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                                {grade}학년 {studentCount}명
                            </span>
                        )}
                        <span className="text-sm text-slate-600 font-medium bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                            {subjectCount ?? 0}개 과목 설정됨
                        </span>
                    </>
                )}
            </div>

            <div className="flex items-center gap-2">
                {/* Undo/Redo Group */}
                <div className="flex items-center bg-white border rounded-lg p-0.5 shadow-sm mr-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-md hover:bg-slate-100"
                        onClick={onUndo}
                        disabled={!canUndo}
                        title="실행 취소 (Ctrl+Z)"
                    >
                        <Undo2 className="h-4 w-4 text-slate-600" />
                    </Button>
                    <div className="w-px h-4 bg-slate-200 mx-0.5" />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-md hover:bg-slate-100"
                        onClick={onRedo}
                        disabled={!canRedo}
                        title="다시 실행 (Ctrl+Y)"
                    >
                        <Redo2 className="h-4 w-4 text-slate-600" />
                    </Button>
                </div>

                {/* Action Buttons */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onImport}
                    className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-sm"
                >
                    <Upload className="h-4 w-4 mr-2 text-slate-500" />
                    불러오기
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onExport}
                    disabled={assignmentsCount === 0}
                    className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-sm"
                >
                    <Download className="h-4 w-4 mr-2 text-slate-500" />
                    내보내기
                </Button>

                <div className="w-px h-6 bg-slate-200 mx-2" />

                {/* Primary Actions */}
                {assignmentsCount > 0 && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onReset}
                        className="text-slate-600 hover:text-slate-900 border-slate-200 hover:bg-slate-50"
                    >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        초기화
                    </Button>
                )}

                <Button
                    onClick={onRun}
                    disabled={defaultRunDisabled}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 transition-all hover:shadow-lg hover:shadow-indigo-300"
                >
                    <Play className="h-4 w-4 mr-2 fill-current" />
                    {defaultRunLabel}
                </Button>
            </div>
        </div>
    );
}
