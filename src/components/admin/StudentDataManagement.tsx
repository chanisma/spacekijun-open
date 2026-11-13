import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';
import {
    fetchStudents,
    fetchStudentCountsByClass,
    fetchGraduatedStudents,
    fetchGraduatedCountsByAdmissionYear,
} from '@/features/evalog/services/adminService';
import { syncStudentData } from '@/services/studentDataSyncService';
import {
    Loader2, Search, RefreshCw, ChevronRight, ChevronDown, Users,
    Database, AlertTriangle, CheckCircle2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type GradeKey = number | 'graduated';
type BucketKey = number | null; // class_num for active grades; admissionYear (null = 미상) for graduates

const GRADE_OPTIONS: { value: GradeKey; label: string }[] = [
    { value: 1, label: '1학년' },
    { value: 2, label: '2학년' },
    { value: 3, label: '3학년' },
    { value: 'graduated', label: '졸업' },
];
const CLASSES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

const buildPageNumbers = (current: number, total: number): (number | 'ellipsis')[] => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | 'ellipsis')[] = [1];
    if (current > 4) pages.push('ellipsis');
    for (let p = Math.max(2, current - 2); p <= Math.min(total - 1, current + 2); p++) {
        pages.push(p);
    }
    if (current < total - 3) pages.push('ellipsis');
    pages.push(total);
    return pages;
};

interface BucketCount {
    key: BucketKey;
    label: string;
    count: number;
}

const formatAdmissionLabel = (admissionYear: number | null): string =>
    admissionYear === null ? '미상' : `${admissionYear}년 입학`;

const loadBucketCounts = async (grade: GradeKey): Promise<BucketCount[]> => {
    if (grade === 'graduated') {
        const rows = await fetchGraduatedCountsByAdmissionYear();
        return rows.map(r => ({
            key: r.admissionYear,
            label: formatAdmissionLabel(r.admissionYear),
            count: r.count,
        }));
    }
    const rows = await fetchStudentCountsByClass(grade);
    return rows.map(r => ({
        key: r.classNum,
        label: `${r.classNum}반`,
        count: r.count,
    }));
};

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

// ── Helper functions (copied for independence from evalog) ──

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
            return activities.some((a: any) => a.category?.includes('행동특성'));
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
        (sum: number, r: any) => sum + r.rank * (r.units || 1), 0
    );
    const totalUnits = regular.reduce(
        (sum: number, r: any) => sum + (r.units || 1), 0
    );
    if (totalUnits === 0) return null;
    return (totalWeighted / totalUnits).toFixed(2);
};

const getAttendanceSummary = (attendance: any): { grade: string; days: number; absent: number; late: number }[] => {
    if (!attendance || typeof attendance !== 'object') return [];
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

    activities.forEach((a: any) => {
        if (['자율활동', '동아리활동', '진로활동'].includes(a.category)) {
            creative[a.category] = (creative[a.category] || 0) + 1;
        }
        if (a.category?.includes('행동특성') && a.content) {
            behaviorByGrade[a.grade] = (behaviorByGrade[a.grade] || 0) + (a.content?.length || 0);
        }
    });

    return { creative, behaviorByGrade };
};

// ── Sync Dialog ──

interface SyncDialogProps {
    open: boolean;
    onClose: () => void;
    onComplete: () => void;
}

const SyncDialog: React.FC<SyncDialogProps> = ({ open, onClose, onComplete }) => {
    const [phase, setPhase] = useState<'confirm' | 'running' | 'done'>('confirm');
    const [progress, setProgress] = useState({ phase: '', current: 0, total: 0, percent: 0 });
    const [result, setResult] = useState<any>(null);

    const handleSync = async () => {
        setPhase('running');
        try {
            const res = await syncStudentData((p) => setProgress(p));
            setResult(res);
            setPhase('done');
            if (res.errors.length === 0) {
                toast.success('학생 데이터 최신화 완료');
            } else {
                toast.warning(`최신화 완료 (경고 ${res.errors.length}건)`);
            }
        } catch (err: any) {
            setResult({ errors: [err.message || '알 수 없는 오류'] });
            setPhase('done');
            toast.error('최신화 실패');
        }
    };

    const handleClose = () => {
        if (phase === 'done') onComplete();
        setPhase('confirm');
        setProgress({ phase: '', current: 0, total: 0, percent: 0 });
        setResult(null);
        onClose();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        학생 데이터 최신화
                    </h3>
                    <button onClick={handleClose} disabled={phase === 'running'} className="text-slate-400 hover:text-slate-600">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {phase === 'confirm' && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-600">
                                resource 테이블의 학생 정보를 기준으로 student_basic_info와
                                student_detailed_activities의 학년/반/번호를 최신화합니다.
                            </p>
                            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-medium">처리 내용:</p>
                                        <ul className="mt-1 space-y-0.5 list-disc list-inside">
                                            <li>활성 학생: resource 기준 학년/반/번호 업데이트</li>
                                            <li>세부활동: 해당 학생의 현재학년 레코드 반/번호 업데이트</li>
                                            <li>비활성 학생(졸업/전출/자퇴, status≠active): 학년/반/번호 → null 처리 (학생 데이터는 보존)</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={handleClose}>취소</Button>
                                <Button size="sm" onClick={handleSync}>최신화 시작</Button>
                            </div>
                        </div>
                    )}

                    {phase === 'running' && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {progress.phase}
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2">
                                <div
                                    className="bg-blue-500 h-2 rounded-full transition-all"
                                    style={{ width: `${progress.percent}%` }}
                                />
                            </div>
                            <div className="text-xs text-slate-400 text-right">
                                {progress.current} / {progress.total}
                            </div>
                        </div>
                    )}

                    {phase === 'done' && result && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                                <CheckCircle2 className="h-4 w-4" />
                                최신화 완료
                            </div>
                            <div className="bg-slate-50 rounded-md p-3 text-xs space-y-1">
                                <div>전체 리소스: <span className="font-semibold">{result.totalResources}건</span></div>
                                <div>활성 학생 업데이트: <span className="font-semibold text-blue-600">{result.activeUpdated}건</span></div>
                                <div>활성 학생 변경없음: <span className="text-slate-500">{result.activeSkipped}건</span></div>
                                <div>비활성 학생 처리: <span className="font-semibold text-amber-600">{result.inactiveUpdated}건</span></div>
                            </div>
                            {result.errors.length > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700 max-h-32 overflow-auto">
                                    <div className="font-medium mb-1">오류 ({result.errors.length}건):</div>
                                    {result.errors.slice(0, 10).map((err: string, i: number) => (
                                        <div key={i} className="truncate">{err}</div>
                                    ))}
                                    {result.errors.length > 10 && (
                                        <div className="mt-1 text-red-500">...외 {result.errors.length - 10}건</div>
                                    )}
                                </div>
                            )}
                            <div className="flex justify-end">
                                <Button size="sm" onClick={handleClose}>확인</Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Main Component ──

export const StudentDataManagement: React.FC = () => {
    const [students, setStudents] = useState<any[]>([]);
    const [bucketCounts, setBucketCounts] = useState<BucketCount[]>([]);
    const [loading, setLoading] = useState(false);
    const [grade, setGrade] = useState<GradeKey | undefined>(undefined);
    const [bucket, setBucket] = useState<BucketKey | undefined>(undefined);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [syncDialogOpen, setSyncDialogOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

    const totalGradeCount = useMemo(
        () => bucketCounts.reduce((sum, c) => sum + c.count, 0),
        [bucketCounts]
    );

    useEffect(() => {
        if (grade === undefined) {
            setBucketCounts([]);
            setStudents([]);
            return;
        }
        setBucketCounts([]);
        setStudents([]);
        setLoading(true);
        loadBucketCounts(grade)
            .then(setBucketCounts)
            .catch((err) => {
                console.error(err);
                toast.error(grade === 'graduated'
                    ? '졸업생 입학년도별 인원을 불러오는데 실패했습니다.'
                    : '반별 학생 수를 불러오는데 실패했습니다.');
            })
            .finally(() => setLoading(false));
    }, [grade]);

    const loadStudents = useCallback(async () => {
        if (grade === undefined || bucket === undefined) {
            setStudents([]);
            return;
        }
        setLoading(true);
        try {
            const data = grade === 'graduated'
                ? await fetchGraduatedStudents(bucket)
                : await fetchStudents(grade as number, bucket as number);
            setStudents(data || []);
        } catch (error) {
            console.error(error);
            toast.error('학생 목록을 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    }, [grade, bucket]);

    useEffect(() => {
        if (grade !== undefined && bucket !== undefined) {
            loadStudents();
        } else {
            setStudents([]);
        }
    }, [grade, bucket, loadStudents]);

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

    // Reset pagination when filters or page size change
    useEffect(() => {
        setCurrentPage(1);
    }, [grade, bucket, searchTerm, pageSize]);

    const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const paginatedStudents = useMemo(
        () => filteredStudents.slice((safePage - 1) * pageSize, safePage * pageSize),
        [filteredStudents, safePage, pageSize]
    );
    const visiblePageNumbers = useMemo(
        () => buildPageNumbers(safePage, totalPages),
        [safePage, totalPages]
    );

    const toggleExpand = (id: string) => {
        setExpandedId((prev) => (prev === id ? null : id));
    };

    const handleSyncComplete = () => {
        // Reload current view
        if (grade !== undefined && bucket !== undefined) {
            loadStudents();
        } else if (grade !== undefined) {
            setLoading(true);
            loadBucketCounts(grade)
                .then(setBucketCounts)
                .catch(() => toast.error('새로고침 실패'))
                .finally(() => setLoading(false));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">학생 데이터 관리</h2>
                    <p className="text-sm text-muted-foreground">
                        student_basic_info / student_detailed_activities 조회 및 최신화
                    </p>
                </div>
                <Button onClick={() => setSyncDialogOpen(true)} variant="outline" className="gap-2">
                    <Database className="h-4 w-4" />
                    최신화
                </Button>
            </div>

            {/* Filters */}
            <div className="shrink-0 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Grade toggle */}
                    <div className="flex bg-slate-100 rounded-lg p-1">
                        {GRADE_OPTIONS.map((opt) => (
                            <button
                                key={String(opt.value)}
                                onClick={() => {
                                    setGrade(grade === opt.value ? undefined : opt.value);
                                    setBucket(undefined);
                                    setExpandedId(null);
                                }}
                                className={cn(
                                    'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
                                    grade === opt.value
                                        ? 'bg-white text-blue-700 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Bucket buttons (반 for active / 입학년도 for graduated) */}
                    {grade !== undefined && (
                        <div className="flex gap-1 flex-wrap">
                            {grade === 'graduated' ? (
                                bucketCounts.map((bc) => (
                                    <button
                                        key={String(bc.key)}
                                        onClick={() => setBucket(bucket === bc.key ? undefined : bc.key)}
                                        className={cn(
                                            'px-2 h-7 text-xs font-medium rounded-md transition-all',
                                            bucket === bc.key
                                                ? 'bg-blue-500 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        )}
                                        title={`${bc.label} (${bc.count}명)`}
                                    >
                                        {bc.key === null ? '미상' : bc.key}
                                    </button>
                                ))
                            ) : (
                                CLASSES.map((c) => (
                                    <button
                                        key={c}
                                        onClick={() => setBucket(bucket === c ? undefined : c)}
                                        className={cn(
                                            'w-7 h-7 text-xs font-medium rounded-md transition-all',
                                            bucket === c
                                                ? 'bg-blue-500 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        )}
                                    >
                                        {c}
                                    </button>
                                ))
                            )}
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
                        {grade !== undefined && bucket !== undefined ? (
                            filteredStudents.length === 0 ? (
                                <span className="text-slate-600">0명</span>
                            ) : (
                                <span className="text-slate-600">
                                    {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, filteredStudents.length)} / {filteredStudents.length}명
                                </span>
                            )
                        ) : grade !== undefined ? (
                            <span className="text-slate-600">
                                {totalGradeCount}명 ({grade === 'graduated' ? '입학년도 선택' : '반 선택'})
                            </span>
                        ) : (
                            <span className="text-amber-600 text-xs">학년 선택 필요</span>
                        )}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                            if (grade !== undefined && bucket !== undefined) loadStudents();
                            else if (grade !== undefined) {
                                setLoading(true);
                                loadBucketCounts(grade)
                                    .then(setBucketCounts)
                                    .catch(() => toast.error('새로고침 실패'))
                                    .finally(() => setLoading(false));
                            }
                        }}
                        disabled={loading || grade === undefined}
                    >
                        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                    </Button>
                </div>

                {/* Data section legend */}
                <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>데이터 현황:</span>
                    {DATA_SECTIONS.map((sec) => (
                        <span key={sec.key} className="flex items-center gap-1">
                            <span className={cn('w-2.5 h-2.5 rounded-full inline-block', sec.color)} />
                            {sec.label}
                        </span>
                    ))}
                </div>
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
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="p-8 text-center">
                                    <Loader2 className="animate-spin inline-block mr-2 h-4 w-4" /> 로딩중...
                                </td>
                            </tr>
                        ) : grade === undefined ? (
                            <tr>
                                <td colSpan={8} className="p-12 text-center text-slate-400">
                                    <div className="space-y-1">
                                        <div className="text-base font-medium">학년을 선택해주세요</div>
                                        <div className="text-xs">데이터 규모가 크므로 학년/반 또는 졸업/입학년도 선택 후 조회됩니다.</div>
                                    </div>
                                </td>
                            </tr>
                        ) : bucket === undefined ? (
                            <tr>
                                <td colSpan={8} className="p-8">
                                    <div className="space-y-4">
                                        <div className="text-center text-slate-500 text-sm">
                                            {grade === 'graduated' ? '졸업생' : `${grade}학년`} 전체{' '}
                                            <span className="font-semibold text-slate-700">{totalGradeCount}명</span>
                                            {' — '}
                                            {grade === 'graduated' ? '입학년도' : '반'}을(를) 선택하면 상세 목록을 조회합니다.
                                        </div>
                                        {bucketCounts.length > 0 && (
                                            <div className="flex flex-wrap justify-center gap-2">
                                                {bucketCounts.map((bc) => (
                                                    <button
                                                        key={String(bc.key)}
                                                        onClick={() => setBucket(bc.key)}
                                                        className="flex flex-col items-center gap-1 px-4 py-3 rounded-lg border bg-white hover:bg-blue-50 hover:border-blue-300 transition-all min-w-[80px]"
                                                    >
                                                        <Users className="h-4 w-4 text-slate-400" />
                                                        <span className="text-xs text-slate-500">{bc.label}</span>
                                                        <span className="text-lg font-bold text-slate-800">{bc.count}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : filteredStudents.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="p-8 text-center text-slate-500">
                                    {students.length === 0 ? '등록된 학생이 없습니다.' : '검색 결과가 없습니다.'}
                                </td>
                            </tr>
                        ) : (
                            paginatedStudents.flatMap((student) => {
                                const isExpanded = expandedId === student.id;
                                const activities = student.student_detailed_activities || [];
                                return [
                                        /* Summary row */
                                        <tr
                                            key={`${student.id}-summary`}
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
                                            <td className="p-2 text-center">
                                                {student.grade != null ? (
                                                    student.grade
                                                ) : (
                                                    <span className="text-amber-600 text-xs font-medium">졸업</span>
                                                )}
                                            </td>
                                            <td className="p-2 text-center">
                                                {student.class_num != null ? (
                                                    student.class_num
                                                ) : (
                                                    <span className="text-slate-300">-</span>
                                                )}
                                            </td>
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
                                        </tr>,
                                        /* Detail row */
                                        isExpanded && (
                                            <tr key={`${student.id}-detail`} className="bg-slate-50/80">
                                                <td colSpan={8} className="p-4">
                                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                                                        {/* Basic Info */}
                                                        <div className="bg-white rounded-lg p-3 border">
                                                            <h4 className="font-semibold text-slate-700 mb-2">기본정보</h4>
                                                            <div className="space-y-1 text-slate-600">
                                                                <div>이름: <span className="font-medium text-slate-900">{student.name}</span></div>
                                                                <div>ID: <span className="font-mono">{student.id}</span></div>
                                                                <div>학번: <span className="font-mono">{student.student_no}</span></div>
                                                                {student.grade != null ? (
                                                                    <div>학년/반: {student.grade}학년 {student.class_num}반</div>
                                                                ) : (
                                                                    <div>상태: <span className="text-amber-600 font-medium">졸업</span></div>
                                                                )}
                                                                {student.section1_personal_info?.admissionYear && (
                                                                    <div>입학년도: <span className="font-medium text-slate-900">{student.section1_personal_info.admissionYear}</span></div>
                                                                )}
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
                                        )
                                ];
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {grade !== undefined && bucket !== undefined && filteredStudents.length > 0 && (
                <div className="flex items-center justify-between gap-3 px-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>페이지당</span>
                        <select
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                            className="border rounded px-1.5 py-0.5 text-xs bg-white"
                        >
                            {PAGE_SIZE_OPTIONS.map((n) => (
                                <option key={n} value={n}>{n}명</option>
                            ))}
                        </select>
                        <span className="text-slate-400">·</span>
                        <span>{safePage} / {totalPages} 페이지</span>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={safePage === 1}
                            >
                                이전
                            </Button>
                            {visiblePageNumbers.map((p, i) =>
                                p === 'ellipsis' ? (
                                    <span key={`ell-${i}`} className="px-1 text-slate-400 text-xs">…</span>
                                ) : (
                                    <button
                                        key={p}
                                        onClick={() => setCurrentPage(p)}
                                        className={cn(
                                            'h-7 min-w-[28px] px-2 text-xs rounded-md border transition-colors',
                                            safePage === p
                                                ? 'bg-blue-500 text-white border-blue-500'
                                                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
                                        )}
                                    >
                                        {p}
                                    </button>
                                )
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={safePage === totalPages}
                            >
                                다음
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Sync Dialog */}
            <SyncDialog
                open={syncDialogOpen}
                onClose={() => setSyncDialogOpen(false)}
                onComplete={handleSyncComplete}
            />
        </div>
    );
};
