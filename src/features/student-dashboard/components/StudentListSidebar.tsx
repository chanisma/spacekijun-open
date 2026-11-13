import React, { useMemo, useState } from 'react';
import { StudentDashboardData, useStudentDashboard } from '@/hooks/useStudentDashboard';
import { StudentListItem } from './StudentListItem';
import { Search, X, RotateCcw, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface StudentListSidebarProps {
    // Filter/selection props (반 트리 라벨 클릭 시 "학급별 보기"용 선택 상태)
    grade?: number;
    classNum?: number;
    searchTerm: string;
    onGradeChange: (grade: number | undefined) => void;
    onClassNumChange: (classNum: number | undefined) => void;
    onSearchTermChange: (term: string) => void;
    onClearFilters: () => void;
    /** 반 라벨 클릭(#-#반 선택) 시 호출 — "학급별 보기" 탭으로 전환 */
    onClassSelected: () => void;

    // Data Props (검색어가 있을 때만 사용 — 학교 전체 대상 검색 결과)
    students: StudentDashboardData[];
    selectedStudentCode?: string;
    onStudentClick: (student: StudentDashboardData) => void;
}

const GRADES = [1, 2, 3];
const CLASSES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const StudentListSidebar: React.FC<StudentListSidebarProps> = ({
    grade,
    classNum,
    searchTerm,
    onGradeChange,
    onClassNumChange,
    onSearchTermChange,
    onClearFilters,
    onClassSelected,
    students,
    selectedStudentCode,
    onStudentClick,
}) => {
    const isSearching = searchTerm.trim() !== '';
    const hasFilters = grade !== undefined || classNum !== undefined || isSearching;

    const [expandedGrades, setExpandedGrades] = useState<Set<number>>(new Set());
    const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

    const toggleGrade = (g: number) => {
        setExpandedGrades((prev) => {
            const next = new Set(prev);
            if (next.has(g)) next.delete(g); else next.add(g);
            return next;
        });
    };
    const toggleClass = (key: string) => {
        setExpandedClasses((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    // 라벨 클릭 = 진짜 토글: 이미 선택된 학년/반을 다시 누르면 보기에서 빠져나오며
    // 해당 행을 접는다(이때는 다른 보기로 이동하지 않음). 처음 누르면 선택 + 펼침.
    const selectGrade = (g: number) => {
        const isSelected = grade === g && classNum === undefined;
        if (isSelected) {
            onGradeChange(undefined);
            setExpandedGrades((prev) => {
                if (!prev.has(g)) return prev;
                const next = new Set(prev);
                next.delete(g);
                return next;
            });
            return;
        }
        onGradeChange(g);
        onClassNumChange(undefined);
        setExpandedGrades((prev) => (prev.has(g) ? prev : new Set(prev).add(g)));
    };
    const selectClass = (g: number, c: number) => {
        const isSelected = grade === g && classNum === c;
        const classKey = `${g}-${c}`;
        if (isSelected) {
            onGradeChange(undefined);
            onClassNumChange(undefined);
            setExpandedClasses((prev) => {
                if (!prev.has(classKey)) return prev;
                const next = new Set(prev);
                next.delete(classKey);
                return next;
            });
            return;
        }
        onGradeChange(g);
        onClassNumChange(c);
        onClassSelected();
        setExpandedGrades((prev) => (prev.has(g) ? prev : new Set(prev).add(g)));
        setExpandedClasses((prev) => (prev.has(classKey) ? prev : new Set(prev).add(classKey)));
    };

    return (
        <div className="relative flex flex-col h-full w-full bg-white">
            {/* 사이드바 헤더 */}
            <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-slate-100 shrink-0">
                <h2 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
                    학생 검색
                </h2>
                {hasFilters && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClearFilters}
                        className="h-7 w-7 p-0 hover:bg-slate-200/50"
                        title="필터 초기화"
                    >
                        <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                    </Button>
                )}
            </div>

            {/* Search Input */}
            <div className="px-4 py-2 border-b border-slate-100">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <Input
                        placeholder="이름 검색"
                        value={searchTerm}
                        onChange={(e) => onSearchTermChange(e.target.value)}
                        className="h-8 pl-8 pr-8 text-xs bg-white"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => onSearchTermChange('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Student List / Class Tree */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {isSearching ? (
                    students.length === 0 ? (
                        <div className="text-center p-6 opacity-50">
                            <p className="text-xs text-slate-400">검색 결과가 없습니다</p>
                        </div>
                    ) : (
                        <div className="p-3 space-y-1.5">
                            {students.map((student) => (
                                <StudentListItem
                                    key={student.student_code}
                                    student={student}
                                    isSelected={selectedStudentCode === student.student_code}
                                    onClick={() => onStudentClick(student)}
                                    showClassBadge
                                />
                            ))}
                        </div>
                    )
                ) : (
                    <div className="p-3 space-y-0.5">
                        {GRADES.map((g) => {
                            const isGradeExpanded = expandedGrades.has(g);
                            const isGradeSelected = grade === g && classNum === undefined;
                            return (
                                <div key={g}>
                                    <div
                                        className={cn(
                                            'w-full flex items-center gap-1 text-sm rounded-lg transition-all',
                                            isGradeSelected
                                                ? 'bg-brand-50 text-brand-700 font-medium border border-brand-100'
                                                : 'text-slate-700 hover:bg-slate-100'
                                        )}
                                    >
                                        <button
                                            onClick={() => toggleGrade(g)}
                                            className="py-1.5 pl-2 pr-0.5 shrink-0 text-slate-400 hover:text-slate-700"
                                            aria-label={isGradeExpanded ? '접기' : '펼치기'}
                                        >
                                            {isGradeExpanded
                                                ? <ChevronDown className="w-3.5 h-3.5" />
                                                : <ChevronRight className="w-3.5 h-3.5" />}
                                        </button>
                                        <button
                                            onClick={() => selectGrade(g)}
                                            className="flex-1 text-left py-1.5 pr-2 font-medium"
                                            title={`${g}학년 전체 보기`}
                                        >
                                            {g}학년
                                        </button>
                                    </div>
                                    {isGradeExpanded && (
                                        <ul className="ml-3 mt-0.5 space-y-0.5">
                                            {CLASSES.map((c) => {
                                                const classKey = `${g}-${c}`;
                                                const isClassExpanded = expandedClasses.has(classKey);
                                                const isClassSelected = grade === g && classNum === c;
                                                return (
                                                    <li key={c}>
                                                        <div
                                                            className={cn(
                                                                'w-full flex items-center gap-1 text-sm rounded-lg transition-all',
                                                                isClassSelected
                                                                    ? 'bg-brand-50 text-brand-700 font-medium border border-brand-100'
                                                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                                            )}
                                                        >
                                                            <button
                                                                onClick={() => toggleClass(classKey)}
                                                                className="py-1.5 pl-2 pr-0.5 shrink-0 text-slate-400 hover:text-slate-700"
                                                                aria-label={isClassExpanded ? '접기' : '펼치기'}
                                                            >
                                                                {isClassExpanded
                                                                    ? <ChevronDown className="w-3 h-3" />
                                                                    : <ChevronRight className="w-3 h-3" />}
                                                            </button>
                                                            <button
                                                                onClick={() => selectClass(g, c)}
                                                                className="flex-1 text-left py-1.5 pr-2"
                                                                title={`${g}학년 ${c}반 보기`}
                                                            >
                                                                {g}-{c}반
                                                            </button>
                                                        </div>
                                                        {isClassExpanded && (
                                                            <ClassRosterList
                                                                grade={g}
                                                                classNum={c}
                                                                selectedStudentCode={selectedStudentCode}
                                                                onStudentClick={onStudentClick}
                                                            />
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

// ----------------------------------------------------------------
// ClassRosterList — 펼친 반 1개당 한 인스턴스. get_student_dashboard_data RPC를
// 반 단위로 재조회한다 (이미 picture 필드를 포함하므로 별도 사진 훅이 필요 없다).
// ----------------------------------------------------------------
function ClassRosterList({
    grade, classNum, selectedStudentCode, onStudentClick,
}: {
    grade: number;
    classNum: number;
    selectedStudentCode?: string;
    onStudentClick: (student: StudentDashboardData) => void;
}) {
    const { data: roster = [], isLoading, isError } = useStudentDashboard({ grade, classNum });
    const rows = useMemo(
        () => roster.slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
        [roster]
    );

    if (isLoading) return <div className="ml-4 mt-1 text-[11px] text-slate-400 px-2 py-1">불러오는 중...</div>;
    if (isError) return <div className="ml-4 mt-1 text-[11px] text-red-500 px-2 py-1">불러올 수 없습니다</div>;
    if (rows.length === 0) return <div className="ml-4 mt-1 text-[11px] text-slate-400 px-2 py-1 flex items-center gap-1"><Users className="w-3 h-3" />학생 없음</div>;

    return (
        <ul className="ml-4 mt-0.5 space-y-0.5">
            {rows.map((student) => (
                <li key={student.student_code}>
                    <StudentListItem
                        student={student}
                        isSelected={selectedStudentCode === student.student_code}
                        onClick={() => onStudentClick(student)}
                    />
                </li>
            ))}
        </ul>
    );
}
