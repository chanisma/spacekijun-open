import React from 'react';
import {
    StudentDashboardData,
    useAfterSchoolEnrollments,
    useCareerSubmissions,
    useStudentResource,
    useStudentReservationsByYear,
    CareerSubmission,
    YearlyReservationStats,
} from '@/hooks/useStudentDashboard';
import { drawLineProps } from '@/lib/chartAnimation';
import { AfterschoolTermList } from './AfterschoolTermList';
import { groupAfterschoolByTerm, totalAfterschoolCourseCount } from '../utils/afterschoolTerms';
import { StudentGradePanel } from './StudentGradePanel';
import { GradeTrendChart } from './GradeTrendChart';
import { MockExamTrendChart } from './MockExamTrendChart';
import { StudentCurriculumPanel } from './StudentCurriculumPanel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ComposedChart,
    Bar,
} from 'recharts';
import {
    Activity,
    BookOpen,
    Calendar,
    Clock,
    ExternalLink,
    GraduationCap,
    Hash,
    Heart,
    Loader2,
    MapPin,
    MoreHorizontal,
    School,
    Target,
    TrendingUp,
    User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface StudentDetailPanelProps {
    student: StudentDashboardData | null;
}

// Section Component (evalog pattern)
const Section = ({
    title,
    icon: Icon,
    children,
    className,
}: {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
    className?: string;
}) => (
    <div className={cn('bg-white/60 border border-white/50 rounded-xl p-5 shadow-sm', className)}>
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100/50">
            <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
                <Icon size={18} />
            </div>
            <h3 className="font-semibold text-slate-800">{title}</h3>
        </div>
        {children}
    </div>
);

// Extract real content helper
function extractRealContent(text: string | null | undefined): string {
    if (!text) return '';
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return text;
    try {
        const parsed = JSON.parse(trimmed);
        return parsed['특기사항'] ?? parsed['세부능력 및 특기사항'] ?? parsed['content'] ?? '';
    } catch {
        return text;
    }
}

export const StudentDetailPanel: React.FC<StudentDetailPanelProps> = ({
    student,
}) => {
    // Fetch additional data
    const { data: afterschoolData, isLoading: afterschoolLoading } = useAfterSchoolEnrollments(
        student?.student_code ?? null
    );
    const { data: careerData, isLoading: careerLoading } = useCareerSubmissions(
        student?.student_code ?? null
    );
    const { data: resourceData } = useStudentResource(student?.resource_id ?? null);
    const { data: yearlyReservations, isLoading: reservationsLoading } = useStudentReservationsByYear(
        student?.student_code ?? null
    );

    // Extract snum values from resource meta
    const snumBadges = React.useMemo(() => {
        if (!resourceData?.meta) return [];
        const badges: { label: string; value: string }[] = [];
        if (resourceData.meta.snum1) badges.push({ label: '1학년', value: resourceData.meta.snum1 });
        if (resourceData.meta.snum2) badges.push({ label: '2학년', value: resourceData.meta.snum2 });
        if (resourceData.meta.snum3) badges.push({ label: '3학년', value: resourceData.meta.snum3 });
        return badges;
    }, [resourceData]);

    // 방과후 학년도·학년 그룹 — 개요 카드와 방과후 탭이 같은 기준으로 세도록 한 곳에서 만든다
    const afterschoolGroups = React.useMemo(
        () => groupAfterschoolByTerm(afterschoolData ?? []),
        [afterschoolData],
    );

    // State for career tab year selection (must be before any conditional returns)
    const [selectedCareerYear, setSelectedCareerYear] = React.useState<number | 'all'>('all');

    // Helper function to get academic year (March to February)
    const getAcademicYear = (dateString: string | null): number | null => {
        if (!dateString) return null;
        const cleanDateStr = dateString.split(' ')[0].replace(/[./]/g, '-');
        const parts = cleanDateStr.split('-');
        if (parts.length < 2) return null;
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        if (isNaN(year) || isNaN(month)) return null;
        return month >= 3 ? year : year - 1;
    };

    // Process career data (must be before any conditional returns)
    const careerDataProcessed = React.useMemo(() => {
        if (!careerData || careerData.length === 0) return null;

        const groupedByYear: Record<number, CareerSubmission[]> = {};
        const unknownYear: CareerSubmission[] = [];

        careerData.forEach((submission) => {
            const dateSource = submission.submission_datetime || submission.deadline || submission.collected_at;
            const academicYear = getAcademicYear(dateSource);

            if (academicYear === null) {
                unknownYear.push(submission);
            } else {
                if (!groupedByYear[academicYear]) groupedByYear[academicYear] = [];
                groupedByYear[academicYear].push(submission);
            }
        });

        const sortedYears = Object.keys(groupedByYear)
            .map(Number)
            .sort((a, b) => b - a);

        const uniqueBoards = new Set(careerData.map(c => c.board_name));

        return { groupedByYear, unknownYear, sortedYears, uniqueBoards };
    }, [careerData]);

    if (!student) {
        return (
            // 시험 결과 분석(evalearn AnalysisPanel)의 빈 상태와 같은 모양. `flex-1` 은 부모
            // (StudentDashboardPage 의 flex-col 감싸개)를 채워 세로 가운데에 서기 위한 것
            <div className="flex flex-1 flex-col items-center justify-center h-full min-h-[16rem] text-slate-400 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-50/50 border border-slate-100 flex items-center justify-center">
                    <User size={32} className="text-slate-300" />
                </div>
                <p className="text-sm font-medium">학생을 선택해주세요</p>
            </div>
        );
    }

    const initials = student.name ? student.name.slice(0, 2) : '??';

    // Render volunteer activities (evalog style)
    const renderVolunteerActivities = () => {
        const volunteer = student.volunteer;
        if (!volunteer) return null;

        // Handle array of volunteer activities
        if (Array.isArray(volunteer) && volunteer.length > 0) {
            const groupedByGrade: Record<number, any[]> = {};
            volunteer.forEach((activity: any) => {
                const grade = activity.grade || 1;
                if (!groupedByGrade[grade]) groupedByGrade[grade] = [];
                groupedByGrade[grade].push(activity);
            });

            const totalHours = volunteer.reduce((sum: number, a: any) => sum + (parseFloat(a.hours) || 0), 0);

            return (
                <Section title="봉사활동" icon={Heart}>
                    <div className="grid gap-6">
                        {[1, 2, 3].map((grade) => {
                            const gradeActivities = groupedByGrade[grade];
                            if (!gradeActivities || gradeActivities.length === 0) return null;

                            return (
                                <div key={grade} className="flex gap-4">
                                    <div className="flex-shrink-0 w-16 pt-2 text-center">
                                        <div className="w-10 h-10 mx-auto rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold shadow-sm border border-orange-200">
                                            {grade}
                                        </div>
                                        <span className="text-xs text-slate-500 mt-1 block">학년</span>
                                    </div>
                                    <div className="flex-1 space-y-3">
                                        {gradeActivities.map((activity: any, idx: number) => (
                                            <div
                                                key={idx}
                                                className="bg-white/60 p-3 rounded-xl border border-white/50 shadow-sm flex items-start sm:items-center gap-3 flex-col sm:flex-row"
                                            >
                                                <div className="flex items-center gap-2 min-w-[120px]">
                                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                                        <Calendar size={14} />
                                                    </div>
                                                    <span className="text-xs font-medium text-slate-700">
                                                        {activity.dateOrPeriod || activity.date || '-'}
                                                    </span>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-sm font-semibold text-slate-800">
                                                        {activity.institution || activity.place || '장소 없음'}
                                                    </div>
                                                    <div className="text-xs text-slate-600 mt-0.5">
                                                        {activity.activity || extractRealContent(activity.content)}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded-lg text-xs font-bold border border-orange-100">
                                                        {activity.hours}시간
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                        <div className="flex justify-end pt-4 border-t border-dashed border-gray-200">
                            <div className="flex items-center gap-3 bg-brand-50 px-4 py-2 rounded-xl border border-brand-100">
                                <span className="text-sm text-brand-700">전체 누계 시간</span>
                                <span className="text-xl font-bold text-brand-600">{totalHours}시간</span>
                            </div>
                        </div>
                    </div>
                </Section>
            );
        }

        // Handle simple object/string
        return (
            <Card className="border-none shadow-sm bg-white/80">
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Heart className="h-4 w-4 text-pink-500" />
                        봉사활동
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="p-4 bg-pink-50/30 rounded-xl border border-pink-100/50 text-sm leading-relaxed">
                        {typeof volunteer === 'object' ? JSON.stringify(volunteer) : volunteer}
                    </div>
                </CardContent>
            </Card>
        );
    };

    // Render reading activities (evalog style)
    const renderReadingActivities = () => {
        const reading = student.reading;
        if (!reading) return null;

        if (Array.isArray(reading) && reading.length > 0) {
            return (
                <Section title="독서활동" icon={BookOpen}>
                    <div className="space-y-3">
                        {reading.map((item: any, idx: number) => (
                            <div key={idx} className="bg-white/60 p-3 rounded-xl border border-white/50 shadow-sm">
                                <div className="flex items-center gap-2 mb-1">
                                    {item.grade && (
                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-xs font-medium border border-emerald-100">
                                            {item.grade}학년
                                        </span>
                                    )}
                                    {item.title && <span className="text-sm font-semibold text-slate-800">{item.title}</span>}
                                </div>
                                {item.author && <p className="text-xs text-slate-500">저자: {item.author}</p>}
                                {item.content && (
                                    <p className="text-sm text-slate-600 mt-2">{extractRealContent(item.content)}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </Section>
            );
        }

        return (
            <Card className="border-none shadow-sm bg-white/80">
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-emerald-500" />
                        독서활동
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="p-4 bg-emerald-50/30 rounded-xl border border-emerald-100/50 text-sm leading-relaxed">
                        {typeof reading === 'object' ? JSON.stringify(reading) : reading}
                    </div>
                </CardContent>
            </Card>
        );
    };

    // Render afterschool enrollments — 학년도·학년별 (묶는 규칙은 utils/afterschoolTerms.ts)
    const renderAfterSchool = () => (
        <AfterschoolTermList enrollments={afterschoolData} isLoading={afterschoolLoading} />
    );

    // Render career submissions (리로스쿨)
    const renderCareerSubmissions = () => {
        if (careerLoading) {
            return (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
                    <span className="ml-2 text-slate-500">불러오는 중...</span>
                </div>
            );
        }

        if (!careerData || careerData.length === 0 || !careerDataProcessed) {
            return (
                <div className="text-center py-12 text-slate-400">
                    <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>등록된 리로스쿨 과제 내역이 없습니다</p>
                </div>
            );
        }

        const { groupedByYear, unknownYear, sortedYears, uniqueBoards } = careerDataProcessed;

        // Sort function for board_name: 자율진로 > 교과활동 > others (alphabetical)
        const sortByBoardName = (a: CareerSubmission, b: CareerSubmission): number => {
            const boardA = a.board_name || '기타';
            const boardB = b.board_name || '기타';

            // Priority order
            const getPriority = (name: string): number => {
                if (name === '자율진로') return 0;
                if (name === '교과활동') return 1;
                return 2;
            };

            const priorityA = getPriority(boardA);
            const priorityB = getPriority(boardB);

            if (priorityA !== priorityB) return priorityA - priorityB;
            return boardA.localeCompare(boardB, 'ko');
        };

        // Get submissions for selected year (sorted)
        const getDisplaySubmissions = (): CareerSubmission[] => {
            let submissions: CareerSubmission[];
            if (selectedCareerYear === 'all') {
                submissions = [...careerData];
            } else if (selectedCareerYear === 0) {
                submissions = [...unknownYear];
            } else {
                submissions = [...(groupedByYear[selectedCareerYear] || [])];
            }
            return submissions.sort(sortByBoardName);
        };

        const displaySubmissions = getDisplaySubmissions();

        // Format date for display
        const formatDate = (dateStr: string | null) => {
            if (!dateStr) return '-';
            const clean = dateStr.split(' ')[0];
            return clean;
        };

        return (
            <div className="space-y-4">
                {/* Summary */}
                <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-600">총 제출 과제</p>
                            <p className="text-2xl font-bold text-indigo-600">{careerData.length}건</p>
                        </div>
                        <div className="text-center">
                            <p className="text-sm text-slate-600">학년도 수</p>
                            <p className="text-2xl font-bold text-blue-600">{sortedYears.length}개</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-slate-600">게시판 수</p>
                            <p className="text-2xl font-bold text-purple-600">{uniqueBoards.size}개</p>
                        </div>
                    </div>
                </div>

                {/* Year Sub-tabs */}
                <div className="flex flex-wrap gap-2 p-1 bg-slate-100 rounded-lg">
                    <button
                        onClick={() => setSelectedCareerYear('all')}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                            selectedCareerYear === 'all'
                                ? "bg-white text-indigo-700 shadow-sm"
                                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                        )}
                    >
                        전체 ({careerData.length})
                    </button>
                    {sortedYears.map((year) => (
                        <button
                            key={year}
                            onClick={() => setSelectedCareerYear(year)}
                            className={cn(
                                "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                                selectedCareerYear === year
                                    ? "bg-white text-indigo-700 shadow-sm"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                            )}
                        >
                            {year}학년도 ({groupedByYear[year]?.length || 0})
                        </button>
                    ))}
                    {unknownYear.length > 0 && (
                        <button
                            onClick={() => setSelectedCareerYear(0)}
                            className={cn(
                                "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                                selectedCareerYear === 0
                                    ? "bg-white text-slate-700 shadow-sm"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                            )}
                        >
                            기타 ({unknownYear.length})
                        </button>
                    )}
                </div>

                {/* Table View */}
                <Card className="border-none shadow-sm bg-white/80 overflow-hidden">
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="text-left py-3 px-4 font-medium text-slate-600 w-[40%]">과제명</th>
                                        <th className="text-left py-3 px-3 font-medium text-slate-600 w-[15%]">게시판</th>
                                        <th className="text-left py-3 px-3 font-medium text-slate-600 w-[12%]">담당</th>
                                        <th className="text-left py-3 px-3 font-medium text-slate-600 w-[13%]">제출일</th>
                                        <th className="text-left py-3 px-3 font-medium text-slate-600 w-[13%]">마감일</th>
                                        <th className="text-center py-3 px-3 font-medium text-slate-600 w-[7%]">링크</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {displaySubmissions.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="py-8 text-center text-slate-400">
                                                해당 학년도의 과제가 없습니다
                                            </td>
                                        </tr>
                                    ) : (
                                        displaySubmissions.map((submission) => (
                                            <tr
                                                key={submission.id}
                                                className="hover:bg-slate-50/80 transition-colors"
                                            >
                                                <td className="py-2.5 px-4">
                                                    <span className="font-medium text-slate-800 line-clamp-1" title={submission.assignment_name}>
                                                        {submission.assignment_name}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "text-xs font-normal",
                                                            submission.board_name === '자율진로'
                                                                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                                                : submission.board_name === '교과활동'
                                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                                    : "bg-slate-50"
                                                        )}
                                                    >
                                                        {submission.board_name || '기타'}
                                                    </Badge>
                                                </td>
                                                <td className="py-2.5 px-3 text-slate-600">
                                                    {submission.teacher_in_charge || '-'}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    {submission.submission_datetime ? (
                                                        <span className="text-green-600">{formatDate(submission.submission_datetime)}</span>
                                                    ) : (
                                                        <span className="text-slate-400">-</span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3 text-slate-600">
                                                    {formatDate(submission.deadline)}
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                    {submission.material_link_url ? (
                                                        <a
                                                            href={submission.material_link_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                                            title="자료 링크 열기"
                                                        >
                                                            <ExternalLink size={14} />
                                                        </a>
                                                    ) : (
                                                        <span className="text-slate-300">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {/* Table footer with count */}
                        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
                            {selectedCareerYear === 'all' ? '전체' : selectedCareerYear === 0 ? '기타' : `${selectedCareerYear}학년도`} {displaySubmissions.length}건
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    };

    const tabItems = [
        { label: '개요', value: 'overview' },
        { label: '학업', value: 'academic' },
        { label: '교육과정', value: 'curriculum' },
        { label: '리로스쿨', value: 'career' },
        { label: '방과후', value: 'afterschool' },
        { label: '자습실', value: 'study-room' },
        { label: '기타활동', value: 'activities' },
    ];

    return (
        <div className="flex flex-col h-full bg-background/50">
            {/* 헤더 - 프로필 */}
            <div className="flex-shrink-0 border-b border-border/60">
                <div className="pt-8 pb-6 px-8 max-w-5xl mx-auto">
                    <div className="flex items-center gap-5">
                        <Avatar className="h-20 w-20 ring-2 ring-border/50 shadow-md">
                            <AvatarImage src={student.picture || undefined} alt={student.name} className="object-cover" />
                            <AvatarFallback className="bg-muted text-foreground text-xl font-semibold">
                                {initials}
                            </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold text-foreground tracking-tight">
                                        {student.name}
                                    </h2>
                                    <div className="flex items-center gap-2.5 mt-1 text-sm text-muted-foreground">
                                        <span className="font-mono text-xs">{student.student_code}@myschool.hs.kr</span>
                                    </div>
                                </div>

                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {student.major && (
                                    <Badge variant="secondary" className="bg-muted/60 text-foreground/80 border-0 px-2.5 py-0.5 text-xs font-medium">
                                        <GraduationCap className="h-3 w-3 mr-1 opacity-50" />
                                        {student.major}
                                    </Badge>
                                )}
                                {student.career && (
                                    <Badge variant="secondary" className="bg-muted/60 text-foreground/80 border-0 px-2.5 py-0.5 text-xs font-medium">
                                        <Target className="h-3 w-3 mr-1 opacity-50" />
                                        {student.career}
                                    </Badge>
                                )}
                                {student.birthday && (
                                    <Badge variant="secondary" className="bg-muted/60 text-foreground/80 border-0 px-2.5 py-0.5 text-xs font-medium">
                                        <Calendar className="h-3 w-3 mr-1 opacity-50" />
                                        {student.birthday}
                                    </Badge>
                                )}
                                {snumBadges.map((snum) => (
                                    <Badge
                                        key={snum.label}
                                        variant="secondary"
                                        className="bg-muted/60 text-foreground/80 border-0 px-2.5 py-0.5 text-xs font-medium"
                                    >
                                        <Hash className="h-3 w-3 mr-1 opacity-50" />
                                        {snum.label}: {snum.value}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 탭 컨텐츠 */}
            <div className="flex-1 min-h-0 flex flex-col">
                <Tabs defaultValue="overview" className="flex-1 flex flex-col">
                    <div className="flex-shrink-0 border-b border-border bg-background/50 px-8">
                        <div className="max-w-5xl mx-auto">
                            <TabsList className="bg-transparent p-0 h-14 w-full justify-start gap-6 overflow-x-auto">
                                {tabItems.map((tab) => (
                                    <TabsTrigger
                                        key={tab.value}
                                        value={tab.value}
                                        className="h-14 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 font-medium text-muted-foreground transition-colors hover:text-foreground whitespace-nowrap"
                                    >
                                        {tab.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden relative bg-muted/5">
                        <ScrollArea className="h-full">
                            <div className="p-8 max-w-5xl mx-auto">
                                {/* 개요 탭 */}
                                <TabsContent value="overview" className="m-0 space-y-6 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* 1. 기본 정보 카드 */}
                                        <Card className="border-none shadow-sm bg-white/60">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                                    <div className="p-1.5 bg-blue-100 rounded-md">
                                                        <User className="h-4 w-4 text-blue-600" />
                                                    </div>
                                                    상세 정보
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="space-y-4 pt-2">
                                                    <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-0 last:pb-0">
                                                        <span className="text-sm text-muted-foreground">생년월일</span>
                                                        <span className="text-sm font-medium">{student.birthday || '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-0 last:pb-0">
                                                        <span className="text-sm text-muted-foreground">상태</span>
                                                        <Badge variant="outline" className="text-xs font-normal">재학</Badge>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-0 last:pb-0">
                                                        <span className="text-sm text-muted-foreground">담임교사</span>
                                                        <span className="text-sm font-medium">-</span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* 자습실 이용 현황 */}
                                        <Card className="border-none shadow-sm bg-white/60">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                                    <div className="p-1.5 bg-primary/10 rounded-md">
                                                        <BookOpen className="h-4 w-4 text-primary" />
                                                    </div>
                                                    자습실 이용 현황
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="grid grid-cols-3 gap-4 pt-2">
                                                    <div className="text-center p-3 rounded-lg bg-muted/30">
                                                        <div className="text-xs text-muted-foreground mb-1">총 예약</div>
                                                        <div className="text-xl font-bold text-foreground">{student.total_reservations}</div>
                                                    </div>
                                                    <div className="text-center p-3 rounded-lg bg-green-50/50">
                                                        <div className="text-xs text-green-600/80 mb-1">출석</div>
                                                        <div className="text-xl font-bold text-green-700">{student.attended_count}</div>
                                                    </div>
                                                    <div className="text-center p-3 rounded-lg bg-primary/5">
                                                        <div className="text-xs text-primary/70 mb-1">출석률</div>
                                                        <div className={cn(
                                                            "text-xl font-bold",
                                                            student.attendance_rate >= 80 ? 'text-primary' : 'text-amber-600'
                                                        )}>{student.attendance_rate}%</div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* 리로스쿨 현황 */}
                                        <Card className="border-none shadow-sm bg-white/60">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                                    <div className="p-1.5 bg-indigo-100 rounded-md">
                                                        <MapPin className="h-4 w-4 text-indigo-600" />
                                                    </div>
                                                    리로스쿨 현황
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="grid grid-cols-2 gap-4 pt-2">
                                                    <div className="text-center p-3 rounded-lg bg-indigo-50/50">
                                                        <div className="text-xs text-indigo-600/80 mb-1">제출 과제</div>
                                                        <div className="text-xl font-bold text-indigo-700">
                                                            {careerLoading ? '-' : (careerData?.length || 0)}건
                                                        </div>
                                                    </div>
                                                    <div className="text-center p-3 rounded-lg bg-purple-50/50">
                                                        <div className="text-xs text-purple-600/80 mb-1">게시판</div>
                                                        <div className="text-xl font-bold text-purple-700">
                                                            {careerLoading ? '-' : (careerData ? new Set(careerData.map(c => c.board_name)).size : 0)}개
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* 방과후 현황 */}
                                        <Card className="border-none shadow-sm bg-white/60">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                                    <div className="p-1.5 bg-brand-100 rounded-md">
                                                        <School className="h-4 w-4 text-brand-600" />
                                                    </div>
                                                    방과후 현황
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                {/* 개요와 방과후 탭이 같은 수를 말해야 한다 — 둘 다
                                                    groupAfterschoolByTerm 기준(중복 개설분 제외) */}
                                                <div className="pt-2 space-y-2">
                                                    <div className="text-center p-3 rounded-lg bg-brand-50/50">
                                                        <div className="text-xs text-brand-600/80 mb-1">수강 과목</div>
                                                        <div className="text-xl font-bold text-brand-700">
                                                            {afterschoolLoading ? '-' : totalAfterschoolCourseCount(afterschoolGroups)}개
                                                        </div>
                                                    </div>
                                                    {!afterschoolLoading && afterschoolGroups.length > 0 && (
                                                        <div className="grid grid-cols-1 gap-1">
                                                            {afterschoolGroups.map((group) => (
                                                                <div
                                                                    key={group.key}
                                                                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-white/70 border border-slate-100"
                                                                >
                                                                    <span className="text-xs text-slate-600 min-w-0 truncate">{group.label}</span>
                                                                    <span className="text-xs font-semibold text-brand-700 shrink-0">
                                                                        {group.courseCount}과목
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* 교과 성적 그래프 (Full width below) */}
                                        <div className="md:col-span-2">
                                            <GradeTrendChart student={student} />
                                        </div>

                                        {/* 모의고사 추이 (내신 추이 바로 아래 — 두 척도를 나란히 본다).
                                            key로 학생이 바뀌면 라인 토글·지표 선택을 초기화한다. */}
                                        <div className="md:col-span-2">
                                            <MockExamTrendChart
                                                key={student.student_code}
                                                studentCode={student.student_code}
                                            />
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* 자습실 탭 */}
                                <TabsContent value="study-room" className="m-0 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                                    <div className="space-y-6">
                                        {/* 전체 통계 요약 */}
                                        <Card className="border-none shadow-sm bg-white/80">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                                    <Clock className="h-5 w-5 text-primary" />
                                                    전체 이용 통계
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="flex items-center gap-8">
                                                    <div className="relative w-32 h-32 flex items-center justify-center flex-shrink-0">
                                                        <svg className="w-full h-full transform -rotate-90">
                                                            <circle cx="64" cy="64" r="56" fill="transparent" stroke="currentColor" strokeWidth="10" className="text-muted/20" />
                                                            <circle
                                                                cx="64" cy="64" r="56"
                                                                fill="transparent"
                                                                stroke="currentColor"
                                                                strokeWidth="10"
                                                                strokeDasharray={2 * Math.PI * 56}
                                                                strokeDashoffset={2 * Math.PI * 56 * (1 - student.attendance_rate / 100)}
                                                                strokeLinecap="round"
                                                                className={cn(
                                                                    "transition-all duration-1000 ease-out",
                                                                    student.attendance_rate >= 80 ? 'text-primary' :
                                                                        student.attendance_rate >= 50 ? 'text-amber-500' : 'text-destructive'
                                                                )}
                                                            />
                                                        </svg>
                                                        <div className="absolute flex flex-col items-center">
                                                            <span className="text-2xl font-bold text-foreground">{student.attendance_rate}%</span>
                                                            <span className="text-xs text-muted-foreground">출석률</span>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-6 flex-1">
                                                        <div className="space-y-1 text-center p-3 rounded-lg bg-muted/30">
                                                            <div className="text-xs text-muted-foreground">총 예약</div>
                                                            <div className="text-xl font-bold">{student.total_reservations}</div>
                                                        </div>
                                                        <div className="space-y-1 text-center p-3 rounded-lg bg-green-50">
                                                            <div className="text-xs text-green-600">출석 완료</div>
                                                            <div className="text-xl font-bold text-green-700">{student.attended_count}</div>
                                                        </div>
                                                        <div className="space-y-1 text-center p-3 rounded-lg bg-amber-50">
                                                            <div className="text-xs text-amber-600">미출석</div>
                                                            <div className="text-xl font-bold text-amber-700">
                                                                {student.total_reservations - student.attended_count}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* 학년도별 추이 차트 */}
                                        {yearlyReservations && yearlyReservations.length > 0 && (
                                            <Card className="border-none shadow-sm bg-white/80">
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                                                        <TrendingUp className="h-4 w-4 text-primary" />
                                                        학년도별 추이
                                                        <span className="text-xs font-normal text-muted-foreground">(3월~2월)</span>
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    {/* 범례 */}
                                                    <div className="mb-4 flex flex-wrap gap-4 justify-start">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-3 h-3 rounded-full bg-primary" />
                                                            <span className="text-xs text-muted-foreground">출석률 (%)</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-3 h-3 rounded bg-green-500" />
                                                            <span className="text-xs text-muted-foreground">출석 횟수</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-3 h-3 rounded bg-amber-400" />
                                                            <span className="text-xs text-muted-foreground">미출석 횟수</span>
                                                        </div>
                                                    </div>
                                                    <div className="h-[250px] w-full">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <ComposedChart
                                                                data={[...yearlyReservations].reverse().map(y => ({
                                                                    year: `${y.year}`,
                                                                    출석: Number(y.attended_count),
                                                                    미출석: Number(y.total_reservations) - Number(y.attended_count),
                                                                    출석률: Number(y.attendance_rate),
                                                                }))}
                                                                margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                                                            >
                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                                <XAxis
                                                                    dataKey="year"
                                                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                                                    axisLine={false}
                                                                    tickLine={false}
                                                                />
                                                                <YAxis
                                                                    yAxisId="left"
                                                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                                                    axisLine={false}
                                                                    tickLine={false}
                                                                    width={40}
                                                                />
                                                                <YAxis
                                                                    yAxisId="right"
                                                                    orientation="right"
                                                                    domain={[0, 100]}
                                                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                                                    axisLine={false}
                                                                    tickLine={false}
                                                                    width={40}
                                                                    tickFormatter={(value) => `${value}%`}
                                                                />
                                                                <Tooltip
                                                                    contentStyle={{
                                                                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                                                        borderRadius: '12px',
                                                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                                                        border: '1px solid #e2e8f0',
                                                                        fontSize: '12px'
                                                                    }}
                                                                    formatter={(value: any, name: string) => {
                                                                        if (name === '출석률') return [`${value}%`, name];
                                                                        return [`${value}회`, name];
                                                                    }}
                                                                />
                                                                <Bar yAxisId="left" dataKey="출석" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                                                                <Bar yAxisId="left" dataKey="미출석" stackId="a" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                                                                <Line
                                                                    {...drawLineProps}
                                                                    yAxisId="right"
                                                                    type="monotone"
                                                                    dataKey="출석률"
                                                                    stroke="#3b82f6"
                                                                    strokeWidth={3}
                                                                    dot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
                                                                    activeDot={{ r: 7, strokeWidth: 0 }}
                                                                />
                                                            </ComposedChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}

                                        {/* 연도별 상세 통계 */}
                                        <Card className="border-none shadow-sm bg-white/80">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                                    <Calendar className="h-4 w-4 text-primary" />
                                                    학년도별 상세 현황
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                {reservationsLoading ? (
                                                    <div className="flex items-center justify-center py-8">
                                                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                                    </div>
                                                ) : yearlyReservations && yearlyReservations.length > 0 ? (
                                                    <div className="space-y-3">
                                                        {yearlyReservations.map((yearData: YearlyReservationStats) => (
                                                            <div key={yearData.year} className="p-4 rounded-lg bg-muted/20 border border-border/50">
                                                                <div className="flex items-center justify-between mb-3">
                                                                    <span className="text-lg font-bold text-foreground">{yearData.year}학년도</span>
                                                                    <span className={cn(
                                                                        "text-sm font-medium px-2 py-0.5 rounded-full",
                                                                        yearData.attendance_rate >= 80 ? 'bg-primary/10 text-primary' :
                                                                            yearData.attendance_rate >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                                                    )}>
                                                                        출석률 {yearData.attendance_rate}%
                                                                    </span>
                                                                </div>
                                                                <div className="grid grid-cols-3 gap-4">
                                                                    <div className="text-center">
                                                                        <div className="text-xs text-muted-foreground mb-1">총 예약</div>
                                                                        <div className="text-lg font-semibold">{yearData.total_reservations}</div>
                                                                    </div>
                                                                    <div className="text-center border-l border-border/50">
                                                                        <div className="text-xs text-green-600 mb-1">출석</div>
                                                                        <div className="text-lg font-semibold text-green-700">{yearData.attended_count}</div>
                                                                    </div>
                                                                    <div className="text-center border-l border-border/50">
                                                                        <div className="text-xs text-amber-600 mb-1">미출석</div>
                                                                        <div className="text-lg font-semibold text-amber-700">
                                                                            {Number(yearData.total_reservations) - Number(yearData.attended_count)}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {/* 프로그레스 바 */}
                                                                <div className="mt-3 h-2 bg-muted/30 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={cn(
                                                                            "h-full rounded-full transition-all duration-500",
                                                                            yearData.attendance_rate >= 80 ? 'bg-primary' :
                                                                                yearData.attendance_rate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                                                        )}
                                                                        style={{ width: `${yearData.attendance_rate}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-8 text-muted-foreground">
                                                        <Clock className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                                        <p className="text-sm">자습실 이용 기록이 없습니다</p>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </div>
                                </TabsContent>

                                {/* 학업 탭 */}
                                <TabsContent value="academic" className="m-0 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                                    <StudentGradePanel student={student} />
                                </TabsContent>

                                {/* 교육과정 탭 */}
                                <TabsContent value="curriculum" className="m-0 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                                    <StudentCurriculumPanel student={student} />
                                </TabsContent>

                                {/* 활동 탭 (evalog 비교과 스타일) */}
                                <TabsContent value="activities" className="m-0 space-y-6 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                                    <div className="grid gap-6">
                                        {renderVolunteerActivities()}
                                        {renderReadingActivities()}
                                        {!student.volunteer && !student.reading && (
                                            <div className="text-center py-12 text-slate-400">
                                                <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                                <p>등록된 활동 내역이 없습니다</p>
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>

                                {/* 방과후 탭 */}
                                <TabsContent value="afterschool" className="m-0 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                                    {renderAfterSchool()}
                                </TabsContent>

                                {/* 리로스쿨 탭 */}
                                <TabsContent value="career" className="m-0 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                                    {renderCareerSubmissions()}
                                </TabsContent>
                            </div>
                        </ScrollArea>
                    </div>
                </Tabs>
            </div>
        </div>
    );
};
