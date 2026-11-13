import React, { useMemo } from 'react';
import { StudentDashboardData } from '@/hooks/useStudentDashboard';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';
import {
    BookOpen,
    Heart,
    School,
    TrendingUp,
    Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { drawLineProps, staticLineProps } from '@/lib/chartAnimation';

interface ClassViewPanelProps {
    students: StudentDashboardData[];
    grade?: number;
    classNum?: number;
    afterschoolCounts?: Record<string, number>;
    onStudentClick?: (student: StudentDashboardData) => void;
}

// 개별 학생 카드 컴포넌트
const StudentCard: React.FC<{
    student: StudentDashboardData;
    afterschoolCount: number;
    onClick?: () => void;
    disableAnimation?: boolean; // 학년별 보기 시 애니메이션 비활성화
}> = ({ student, afterschoolCount, onClick, disableAnimation = false }) => {
    // 봉사활동 총 시간 계산
    const volunteerHours = useMemo(() => {
        if (!Array.isArray(student.volunteer)) return 0;
        return student.volunteer.reduce((sum: number, v: any) =>
            sum + (parseFloat(v.hours) || 0), 0);
    }, [student.volunteer]);

    // 평균 등급 계산
    const avgGrade = useMemo(() => {
        const grades = student.academic_development || [];
        const validGrades = grades.filter((g: any) =>
            typeof g.rank === 'number' && g.rank >= 1 && g.rank <= 9
        );
        if (validGrades.length === 0) return null;

        const totalUnits = validGrades.reduce((sum: number, g: any) => sum + (g.units || 1), 0);
        const weightedSum = validGrades.reduce((sum: number, g: any) =>
            sum + (g.rank * (g.units || 1)), 0);

        return totalUnits > 0 ? (weightedSum / totalUnits).toFixed(2) : null;
    }, [student.academic_development]);

    // 교과별 추이도 데이터 (개별 교과)
    const subjectTrendData = useMemo(() => {
        const grades = student.academic_development || [];
        if (grades.length === 0) return [];

        const semesters = ['1-1', '1-2', '2-1', '2-2', '3-1'];
        const categories = ['국어', '수학', '영어', '사회', '과학'];

        const matchesCategory = (subjectGroup: string | null | undefined, category: string): boolean => {
            if (!subjectGroup) return false;
            // 기술가정, 제2외국어, 한문 제외
            if (subjectGroup.startsWith('기술') || subjectGroup.includes('제2외국어') ||
                subjectGroup.includes('한문') || subjectGroup === '한국사') {
                return false;
            }
            return subjectGroup.includes(category);
        };

        // 등급이 있는 모든 과목 추출
        const subjectsWithRank = grades
            .filter((s: any) =>
                typeof s.rank === 'number' &&
                s.rank >= 1 &&
                s.rank <= 9 &&
                !(s.grade === 3 && s.semester === 2)
            )
            .map((s: any) => ({
                subjectGroup: s.subject_group,
                rank: s.rank,
                semester: `${s.grade}-${s.semester}`,
            }));

        return semesters.map(semester => {
            const semesterData: any = { semester };
            categories.forEach(category => {
                const subjects = subjectsWithRank.filter((s: any) =>
                    s.semester === semester && matchesCategory(s.subjectGroup, category)
                );

                if (subjects.length > 0) {
                    const avg = subjects.reduce((sum: number, s: any) => sum + s.rank, 0) / subjects.length;
                    semesterData[category] = parseFloat(avg.toFixed(2));
                } else {
                    semesterData[category] = null;
                }
            });
            return semesterData;
        }).filter(d => categories.some(cat => d[cat] !== null));
    }, [student.academic_development]);

    const categoryColors: Record<string, string> = {
        '국어': '#3b82f6',
        '수학': '#ef4444',
        '영어': '#f59e0b',
        '사회': '#8b5cf6',
        '과학': '#14b8a6'
    };

    // 출석률 색상
    const getAttendanceColor = (rate: number) => {
        if (rate >= 80) return 'text-green-600 bg-green-50';
        if (rate >= 50) return 'text-amber-600 bg-amber-50';
        return 'text-red-600 bg-red-50';
    };

    return (
        <div
            onClick={onClick}
            className={cn(
                "bg-white/70 rounded-xl border border-white/50 shadow-sm p-4 cursor-pointer",
                "hover:shadow-md hover:border-primary/20 hover:bg-white/90 transition-all duration-200"
            )}
        >
            {/* 학생 정보 헤더 */}
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-100">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {student.number}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-foreground truncate">{student.name}</div>
                    <div className="text-xs text-muted-foreground">
                        {student.grade}-{student.class_num}-{student.number}
                    </div>
                </div>
            </div>

            {/* 통계 그리드 2x2 */}
            <div className="grid grid-cols-2 gap-1.5 mb-2">
                {/* 자습실 출석률 */}
                <div className={cn(
                    "rounded-lg p-2 text-center",
                    student.total_reservations > 0
                        ? getAttendanceColor(student.attendance_rate)
                        : "bg-muted/30 text-muted-foreground"
                )}>
                    <BookOpen className="h-3.5 w-3.5 mx-auto mb-0.5 opacity-70" />
                    <div className="text-sm font-bold">
                        {student.total_reservations > 0 ? `${student.attendance_rate}%` : '-'}
                    </div>
                    <div className="text-[9px] opacity-70">자습실</div>
                </div>

                {/* 방과후 수강 */}
                <div className={cn(
                    "rounded-lg p-2 text-center",
                    afterschoolCount > 0
                        ? "bg-brand-50 text-brand-700"
                        : "bg-muted/30 text-muted-foreground"
                )}>
                    <School className="h-3.5 w-3.5 mx-auto mb-0.5 opacity-70" />
                    <div className="text-sm font-bold">
                        {afterschoolCount > 0 ? afterschoolCount : '-'}
                    </div>
                    <div className="text-[9px] opacity-70">방과후</div>
                </div>

                {/* 봉사활동 시간 */}
                <div className={cn(
                    "rounded-lg p-2 text-center",
                    volunteerHours > 0
                        ? "bg-rose-50 text-rose-700"
                        : "bg-muted/30 text-muted-foreground"
                )}>
                    <Heart className="h-3.5 w-3.5 mx-auto mb-0.5 opacity-70" />
                    <div className="text-sm font-bold">
                        {volunteerHours > 0 ? volunteerHours : '-'}
                    </div>
                    <div className="text-[9px] opacity-70">봉사</div>
                </div>

                {/* 평균 등급 */}
                <div className={cn(
                    "rounded-lg p-2 text-center",
                    avgGrade
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-muted/30 text-muted-foreground"
                )}>
                    <TrendingUp className="h-3.5 w-3.5 mx-auto mb-0.5 opacity-70" />
                    <div className="text-sm font-bold">
                        {avgGrade || '-'}
                    </div>
                    <div className="text-[9px] opacity-70">평균등급</div>
                </div>
            </div>

            {/* 교과별 추이도 차트 */}
            {subjectTrendData.length >= 1 ? (
                <div className="p-2 rounded-lg bg-slate-50/80">
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mb-1">
                        {['국어', '수학', '영어', '사회', '과학'].map(cat => (
                            <div key={cat} className="flex items-center gap-0.5">
                                <div
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: categoryColors[cat] }}
                                />
                                <span className="text-[7px] text-muted-foreground">{cat}</span>
                            </div>
                        ))}
                    </div>
                    <div className="h-16">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={subjectTrendData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                                <YAxis domain={[1, 9]} reversed hide />
                                {['국어', '수학', '영어', '사회', '과학'].map(cat => (
                                    <Line
                                        key={cat}
                                        {...(disableAnimation ? staticLineProps : drawLineProps)}
                                        type="monotone"
                                        dataKey={cat}
                                        stroke={categoryColors[cat]}
                                        strokeWidth={1.5}
                                        dot={{ r: 2, fill: categoryColors[cat] }}
                                        connectNulls
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            ) : (
                <div className="p-2 rounded-lg bg-slate-50/80 text-center">
                    <TrendingUp className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground/50" />
                    <span className="text-[8px] text-muted-foreground">성적 데이터 없음</span>
                </div>
            )}
        </div>
    );
};

export const ClassViewPanel: React.FC<ClassViewPanelProps> = ({
    students,
    grade,
    classNum,
    afterschoolCounts = {},
    onStudentClick,
}) => {
    // 헤더 텍스트 생성
    const headerTitle = classNum
        ? `${grade}학년 ${classNum}반`
        : `${grade}학년 전체`;

    if (students.length === 0) {
        return (
            // 시험 결과 분석의 빈 상태와 같은 모양 — `flex-1` 로 부모(flex-col 감싸개)를 채워 가운데에 선다
            <div className="flex flex-1 flex-col items-center justify-center h-full min-h-[16rem] text-slate-400 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-50/50 border border-slate-100 flex items-center justify-center">
                    <Users size={32} className="text-slate-300" />
                </div>
                <p className="text-sm font-medium">학년을 선택해주세요</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background/50">
            {/* 헤더 */}
            <div className="flex-shrink-0 px-8 py-6 border-b border-border bg-background/50">
                <h2 className="text-2xl font-bold text-foreground">
                    {headerTitle}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                    총 {students.length}명
                </p>
            </div>

            {/* 학생 카드 그리드 */}
            <ScrollArea className="flex-1">
                <div className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {students.map((student) => (
                            <StudentCard
                                key={student.student_code}
                                student={student}
                                afterschoolCount={afterschoolCounts[student.student_code] || 0}
                                onClick={() => onStudentClick?.(student)}
                                disableAnimation={!classNum}
                            />
                        ))}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
};
