import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';
import { fetchStudents, fetchStudentCountsByClass, deleteStudent, createStudent } from '../../services/adminService';
import { Loader2, Trash2, Search, RefreshCw, ChevronRight, ChevronDown, Users, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

const GRADES = [1, 2, 3];
const CLASSES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

interface DataSection {
    key: string;
    label: string;
    color: string;
}

const DATA_SECTIONS: DataSection[] = [
    { key: 'attendance', label: '출결', color: 'bg-blue-500' },
    { key: 'volunteer', label: '봉사', color: 'bg-purple-500' },
    { key: 'academic', label: '성적', color: 'bg-amber-500' },
    { key: 'creative', label: '창체', color: 'bg-green-500' },
    { key: 'behavior', label: '행특', color: 'bg-rose-500' },
    { key: 'reading', label: '독서', color: 'bg-cyan-500' },
];

const hasData = (student: any, key: string): boolean => {
    const activities = student.student_detailed_activities || [];
    switch (key) {
        case 'attendance':
            return student.attendance && Object.keys(student.attendance).length > 0;
        case 'volunteer':
            return Array.isArray(student.volunteer)
                ? student.volunteer.length > 0
                : student.volunteer && Object.keys(student.volunteer).length > 0;
        case 'academic':
            return Array.isArray(student.academic_development) && student.academic_development.length > 0;
        case 'creative':
            return activities.some((a: any) =>
                ['자율활동', '동아리활동', '진로활동'].includes(a.category)
            );
        case 'behavior':
            return activities.some((a: any) =>
                a.category?.includes('행동특성')
            );
        case 'reading':
            return Array.isArray(student.reading) && student.reading.length > 0;
        default:
            return false;
    }
};

const computeWeightedAverage = (academicDev: any[]): string | null => {
    if (!Array.isArray(academicDev) || academicDev.length === 0) return null;
    const regular = academicDev.filter(
        (r: any) => r.category === 'regular' && r.rank != null
    );
    if (regular.length === 0) return null;
    const totalWeighted = regular.reduce(
        (sum: number, r: any) => sum + r.rank * (r.units || 1),
        0
    );
    const totalUnits = regular.reduce(
        (sum: number, r: any) => sum + (r.units || 1),
        0
    );
    if (totalUnits === 0) return null;
    return (totalWeighted / totalUnits).toFixed(2);
};

const getAttendanceSummary = (attendance: any): { grade: string; days: number; absent: number; late: number }[] => {
    if (!attendance || typeof attendance !== 'object') return [];
    // attendance can be an object keyed by grade or an array
    if (Array.isArray(attendance)) {
        return attendance.map((a: any) => ({
            grade: String(a.grade || a.학년 || '-'),
            days: a.schoolDays || a.수업일수 || 0,
            absent: a.absenceDays || a.결석일수 || 0,
            late: a.late || a.지각 || 0,
        }));
    }
    return Object.entries(attendance).map(([grade, data]: [string, any]) => ({
        grade,
        days: data.수업일수 || data.schoolDays || 0,
        absent: data.결석일수 || data.absenceDays || 0,
        late: data.지각 || data.late || 0,
    }));
};

const getActivitySummary = (activities: any[]) => {
    const creative: Record<string, number> = {};
    const behaviorByGrade: Record<number, number> = {};
    let volunteerCount = 0;
    let volunteerHours = 0;
    let readingCount = 0;

    activities.forEach((a: any) => {
        if (['자율활동', '동아리활동', '진로활동'].includes(a.category)) {
            creative[a.category] = (creative[a.category] || 0) + 1;
        }
        if (a.category?.includes('행동특성') && a.content) {
            behaviorByGrade[a.grade] = (behaviorByGrade[a.grade] || 0) + (a.content?.length || 0);
        }
    });

    return { creative, behaviorByGrade, volunteerCount, volunteerHours, readingCount };
};

export const StudentManagementTab: React.FC = () => {
    const [students, setStudents] = useState<any[]>([]);
    const [classCounts, setClassCounts] = useState<{ classNum: number; count: number }[]>([]);
    const [loading, setLoading] = useState(false);
    const [grade, setGrade] = useState<number | undefined>(undefined);
    const [classNum, setClassNum] = useState<number | undefined>(undefined);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [addForm, setAddForm] = useState({ id: '', name: '', grade: '', classNum: '', number: '' });
    const [addLoading, setAddLoading] = useState(false);

    const handleAddStudent = async () => {
        const { id, name, grade: g, classNum: c, number: n } = addForm;
        if (!id.trim() || !name.trim() || !g || !c || !n) {
            toast.error('모든 항목을 입력해주세요.');
            return;
        }
        const gradeNum = parseInt(g);
        const classNumVal = parseInt(c);
        const numberVal = parseInt(n);
        const studentNo = `${gradeNum}${String(classNumVal).padStart(2, '0')}${String(numberVal).padStart(2, '0')}`;

        setAddLoading(true);
        try {
            await createStudent({
                id: id.trim(),
                name: name.trim(),
                grade: gradeNum,
                class_num: classNumVal,
                number: numberVal,
                student_no: studentNo,
            });
            toast.success(`${name} 학생이 추가되었습니다.`);
            setShowAddForm(false);
            setAddForm({ id: '', name: '', grade: '', classNum: '', number: '' });
            if (grade && classNum) loadStudents();
        } catch (error: any) {
            console.error(error);
            if (error.code === '23505') {
                toast.error('이미 동일한 ID의 학생이 존재합니다.');
            } else {
                toast.error('학생 추가에 실패했습니다.');
            }
        } finally {
            setAddLoading(false);
        }
    };

    const totalGradeCount = useMemo(
        () => classCounts.reduce((sum, c) => sum + c.count, 0),
        [classCounts]
    );

    // Load class counts when grade changes (lightweight)
    useEffect(() => {
        if (!grade) {
            setClassCounts([]);
            setStudents([]);
            return;
        }
        setClassCounts([]);
        setStudents([]);
        setLoading(true);
        fetchStudentCountsByClass(grade)
            .then((counts) => setClassCounts(counts))
            .catch((err) => {
                console.error(err);
                toast.error('반별 학생 수를 불러오는데 실패했습니다.');
            })
            .finally(() => setLoading(false));
    }, [grade]);

    // Load full data only when grade + classNum both selected
    const loadStudents = useCallback(async () => {
        if (!grade || !classNum) {
            setStudents([]);
            return;
        }
        setLoading(true);
        try {
            const data = await fetchStudents(grade, classNum);
            setStudents(data || []);
        } catch (error) {
            console.error(error);
            toast.error('학생 목록을 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    }, [grade, classNum]);

    useEffect(() => {
        if (grade && classNum) {
            loadStudents();
        } else {
            setStudents([]);
        }
    }, [grade, classNum, loadStudents]);

    const filteredStudents = useMemo(() => {
        if (!searchTerm.trim()) return students;
        const term = searchTerm.trim().toLowerCase();
        return students.filter(
            (s) =>
                s.name?.toLowerCase().includes(term) ||
                s.id?.toLowerCase().includes(term) ||
                s.student_no?.includes(term)
        );
    }, [students, searchTerm]);

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('정말 삭제하시겠습니까?')) return;
        try {
            await deleteStudent(id);
            loadStudents();
        } catch (error) {
            console.error(error);
            toast.error('삭제 실패');
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedId((prev) => (prev === id ? null : id));
    };

    return (
        <div className="flex flex-col h-full space-y-3">
            {/* Filters */}
            <div className="shrink-0 space-y-2">
                <div className="flex items-center gap-3">
                    {/* Grade toggle */}
                    <div className="flex bg-slate-100 rounded-lg p-1">
                        {GRADES.map((g) => (
                            <button
                                key={g}
                                onClick={() => {
                                    if (grade === g) {
                                        setGrade(undefined);
                                    } else {
                                        setGrade(g);
                                    }
                                    setClassNum(undefined);
                                    setExpandedId(null);
                                }}
                                className={cn(
                                    'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
                                    grade === g
                                        ? 'bg-white text-blue-700 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                                )}
                            >
                                {g}학년
                            </button>
                        ))}
                    </div>

                    {/* Class buttons - show only when grade selected */}
                    {grade && (
                        <div className="flex gap-1">
                            {CLASSES.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => setClassNum(classNum === c ? undefined : c)}
                                    className={cn(
                                        'w-7 h-7 text-xs font-medium rounded-md transition-all',
                                        classNum === c
                                            ? 'bg-blue-500 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    )}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Search */}
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            placeholder="이름 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 h-8 text-sm"
                        />
                    </div>

                    {/* Count + Refresh */}
                    <span className="text-sm shrink-0">
                        {grade && classNum ? (
                            <span className="text-slate-600">{filteredStudents.length}명</span>
                        ) : grade ? (
                            <span className="text-slate-600">{totalGradeCount}명 (반 선택)</span>
                        ) : (
                            <span className="text-amber-600 text-xs">학년 선택 필요</span>
                        )}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                            if (grade && classNum) loadStudents();
                            else if (grade) {
                                setLoading(true);
                                fetchStudentCountsByClass(grade)
                                    .then(setClassCounts)
                                    .catch(() => toast.error('새로고침 실패'))
                                    .finally(() => setLoading(false));
                            }
                        }}
                        disabled={loading || !grade}
                    >
                        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={() => setShowAddForm((v) => !v)}
                    >
                        <UserPlus className="h-3.5 w-3.5" />
                        학생 추가
                    </Button>
                </div>

                {/* Add Student Form */}
                {showAddForm && (
                    <div className="flex items-end gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="space-y-1">
                            <label className="text-xs text-slate-600">학생 ID</label>
                            <Input
                                placeholder="예: 00-00645"
                                value={addForm.id}
                                onChange={(e) => setAddForm((f) => ({ ...f, id: e.target.value }))}
                                className="h-8 w-32 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-600">이름</label>
                            <Input
                                placeholder="이름"
                                value={addForm.name}
                                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                                className="h-8 w-24 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-600">학년</label>
                            <Input
                                type="number"
                                min={1}
                                max={3}
                                placeholder="학년"
                                value={addForm.grade}
                                onChange={(e) => setAddForm((f) => ({ ...f, grade: e.target.value }))}
                                className="h-8 w-16 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-600">반</label>
                            <Input
                                type="number"
                                min={1}
                                max={9}
                                placeholder="반"
                                value={addForm.classNum}
                                onChange={(e) => setAddForm((f) => ({ ...f, classNum: e.target.value }))}
                                className="h-8 w-16 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-600">번호</label>
                            <Input
                                type="number"
                                min={1}
                                placeholder="번호"
                                value={addForm.number}
                                onChange={(e) => setAddForm((f) => ({ ...f, number: e.target.value }))}
                                className="h-8 w-16 text-xs"
                            />
                        </div>
                        <Button
                            size="sm"
                            className="h-8 text-xs"
                            onClick={handleAddStudent}
                            disabled={addLoading}
                        >
                            {addLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '저장'}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                                setShowAddForm(false);
                                setAddForm({ id: '', name: '', grade: '', classNum: '', number: '' });
                            }}
                        >
                            취소
                        </Button>
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto border rounded-md bg-white">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 sticky top-0 z-10">
                        <tr>
                            <th className="p-2 border-b w-8"></th>
                            <th className="p-2 border-b">ID</th>
                            <th className="p-2 border-b">학번</th>
                            <th className="p-2 border-b">이름</th>
                            <th className="p-2 border-b text-center">학년</th>
                            <th className="p-2 border-b text-center">반</th>
                            <th className="p-2 border-b text-center">데이터 현황</th>
                            <th className="p-2 border-b">등록일</th>
                            <th className="p-2 border-b text-right">관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={9} className="p-8 text-center">
                                    <Loader2 className="animate-spin inline-block mr-2 h-4 w-4" /> 로딩중...
                                </td>
                            </tr>
                        ) : !grade ? (
                            <tr>
                                <td colSpan={9} className="p-12 text-center text-slate-400">
                                    <div className="space-y-1">
                                        <div className="text-base font-medium">학년을 선택해주세요</div>
                                        <div className="text-xs">데이터 규모가 크므로 학년/반 선택 후 조회됩니다.</div>
                                    </div>
                                </td>
                            </tr>
                        ) : !classNum ? (
                            <tr>
                                <td colSpan={9} className="p-8">
                                    <div className="space-y-4">
                                        <div className="text-center text-slate-500 text-sm">
                                            {grade}학년 전체 <span className="font-semibold text-slate-700">{totalGradeCount}명</span> — 반을 선택하면 상세 목록을 조회합니다.
                                        </div>
                                        {classCounts.length > 0 && (
                                            <div className="flex flex-wrap justify-center gap-2">
                                                {classCounts.map((cc) => (
                                                    <button
                                                        key={cc.classNum}
                                                        onClick={() => setClassNum(cc.classNum)}
                                                        className="flex flex-col items-center gap-1 px-4 py-3 rounded-lg border bg-white hover:bg-blue-50 hover:border-blue-300 transition-all min-w-[72px]"
                                                    >
                                                        <Users className="h-4 w-4 text-slate-400" />
                                                        <span className="text-xs text-slate-500">{cc.classNum}반</span>
                                                        <span className="text-lg font-bold text-slate-800">{cc.count}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : filteredStudents.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="p-8 text-center text-slate-500">
                                    {students.length === 0 ? '등록된 학생이 없습니다.' : '검색 결과가 없습니다.'}
                                </td>
                            </tr>
                        ) : (
                            filteredStudents.map((student) => {
                                const isExpanded = expandedId === student.id;
                                const activities = student.student_detailed_activities || [];
                                return (
                                    <React.Fragment key={student.id}>
                                        {/* Summary row */}
                                        <tr
                                            className={cn(
                                                'border-b hover:bg-slate-50 cursor-pointer transition-colors',
                                                isExpanded && 'bg-blue-50/50'
                                            )}
                                            onClick={() => toggleExpand(student.id)}
                                        >
                                            <td className="p-2 text-center text-slate-400">
                                                {isExpanded ? (
                                                    <ChevronDown className="h-4 w-4 inline" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 inline" />
                                                )}
                                            </td>
                                            <td className="p-2 font-mono text-xs text-blue-600 max-w-[120px] truncate" title={student.id}>
                                                {student.id}
                                            </td>
                                            <td className="p-2 font-mono text-xs">{student.student_no}</td>
                                            <td className="p-2 font-medium">{student.name}</td>
                                            <td className="p-2 text-center">{student.grade}</td>
                                            <td className="p-2 text-center">{student.class_num}</td>
                                            <td className="p-2">
                                                <div className="flex items-center justify-center gap-1">
                                                    {DATA_SECTIONS.map((sec) => (
                                                        <span
                                                            key={sec.key}
                                                            title={sec.label}
                                                            className={cn(
                                                                'w-3 h-3 rounded-full inline-block',
                                                                hasData(student, sec.key)
                                                                    ? sec.color
                                                                    : 'bg-slate-200'
                                                            )}
                                                        />
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="p-2 text-slate-500 text-xs">
                                                {student.created_at
                                                    ? new Date(student.created_at).toLocaleDateString()
                                                    : '-'}
                                            </td>
                                            <td className="p-2 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={(e) => handleDelete(e, student.id)}
                                                >
                                                    <Trash2 size={14} />
                                                </Button>
                                            </td>
                                        </tr>

                                        {/* Detail row */}
                                        {isExpanded && (
                                            <tr className="bg-slate-50/80">
                                                <td colSpan={9} className="p-4">
                                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                                                        {/* Basic Info */}
                                                        <div className="bg-white rounded-lg p-3 border">
                                                            <h4 className="font-semibold text-slate-700 mb-2">기본정보</h4>
                                                            <div className="space-y-1 text-slate-600">
                                                                <div>이름: <span className="font-medium text-slate-900">{student.name}</span></div>
                                                                <div>ID: <span className="font-mono">{student.id}</span></div>
                                                                <div>학번: <span className="font-mono">{student.student_no}</span></div>
                                                                <div>학년/반: {student.grade}학년 {student.class_num}반</div>
                                                            </div>
                                                        </div>

                                                        {/* Attendance */}
                                                        <div className="bg-white rounded-lg p-3 border">
                                                            <h4 className="font-semibold text-slate-700 mb-2">출결 요약</h4>
                                                            {(() => {
                                                                const rows = getAttendanceSummary(student.attendance);
                                                                if (rows.length === 0) return <div className="text-slate-400">데이터 없음</div>;
                                                                return (
                                                                    <table className="w-full text-xs">
                                                                        <thead>
                                                                            <tr className="text-slate-500">
                                                                                <th className="text-left pb-1">학년</th>
                                                                                <th className="text-right pb-1">수업일</th>
                                                                                <th className="text-right pb-1">결석</th>
                                                                                <th className="text-right pb-1">지각</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {rows.map((r, i) => (
                                                                                <tr key={i}>
                                                                                    <td>{r.grade}</td>
                                                                                    <td className="text-right">{r.days}</td>
                                                                                    <td className="text-right">{r.absent}</td>
                                                                                    <td className="text-right">{r.late}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                );
                                                            })()}
                                                        </div>

                                                        {/* Academic Summary */}
                                                        <div className="bg-white rounded-lg p-3 border">
                                                            <h4 className="font-semibold text-slate-700 mb-2">성적 요약</h4>
                                                            {(() => {
                                                                const avg = computeWeightedAverage(student.academic_development);
                                                                const count = Array.isArray(student.academic_development) ? student.academic_development.length : 0;
                                                                if (!avg && count === 0) return <div className="text-slate-400">데이터 없음</div>;
                                                                return (
                                                                    <div className="space-y-1 text-slate-600">
                                                                        {avg && <div>가중 평균 등급: <span className="font-bold text-blue-700">{avg}</span></div>}
                                                                        <div>과목 수: {count}개</div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>

                                                        {/* Activities Summary */}
                                                        <div className="bg-white rounded-lg p-3 border">
                                                            <h4 className="font-semibold text-slate-700 mb-2">활동 요약</h4>
                                                            {(() => {
                                                                const summary = getActivitySummary(activities);
                                                                const volunteer = Array.isArray(student.volunteer) ? student.volunteer : [];
                                                                const reading = Array.isArray(student.reading) ? student.reading : [];
                                                                const hasAny = Object.keys(summary.creative).length > 0 ||
                                                                    Object.keys(summary.behaviorByGrade).length > 0 ||
                                                                    volunteer.length > 0 || reading.length > 0;
                                                                if (!hasAny) return <div className="text-slate-400">데이터 없음</div>;
                                                                return (
                                                                    <div className="space-y-1 text-slate-600">
                                                                        {Object.entries(summary.creative).map(([type, cnt]) => (
                                                                            <div key={type}>{type}: {cnt}건</div>
                                                                        ))}
                                                                        {Object.entries(summary.behaviorByGrade).map(([g, len]) => (
                                                                            <div key={g}>행특 {g}학년: {len}자</div>
                                                                        ))}
                                                                        {volunteer.length > 0 && (
                                                                            <div>봉사: {volunteer.length}건 / {volunteer.reduce((s: number, v: any) => s + (v.시간 || v.hours || 0), 0)}시간</div>
                                                                        )}
                                                                        {reading.length > 0 && (
                                                                            <div>독서: {reading.length}건</div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
