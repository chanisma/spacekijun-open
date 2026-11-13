import React, { useMemo } from 'react';
import { StudentDashboardData } from '@/hooks/useStudentDashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    BookOpen,
    Heart,
    School,
    TrendingUp,
    Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClassViewPanelProps {
    students: StudentDashboardData[];
    grade?: number;
    classNum?: number;
    afterschoolCounts?: Record<string, number>;
}

// 통계 카드 컴포넌트
const StatCard: React.FC<{
    title: string;
    icon: React.ElementType;
    iconColor: string;
    children: React.ReactNode;
}> = ({ title, icon: Icon, iconColor, children }) => (
    <Card className="border-none shadow-sm bg-white/60">
        <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
                <div className={cn("p-1.5 rounded-md", iconColor)}>
                    <Icon className="h-4 w-4" />
                </div>
                {title}
            </CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
    </Card>
);

// 학생 행 컴포넌트
const StudentRow: React.FC<{
    student: StudentDashboardData;
    rank?: number;
    value: string | number;
    subValue?: string;
    highlight?: boolean;
}> = ({ student, rank, value, subValue, highlight }) => (
    <div className={cn(
        "flex items-center justify-between py-2 px-3 rounded-lg",
        highlight ? "bg-primary/5" : "hover:bg-muted/30"
    )}>
        <div className="flex items-center gap-3">
            {rank && (
                <span className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                    rank <= 3 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
                )}>
                    {rank}
                </span>
            )}
            <div>
                <span className="text-sm font-medium">{student.name}</span>
                <span className="text-xs text-muted-foreground ml-2">
                    {student.grade}-{student.class_num}-{student.number}
                </span>
            </div>
        </div>
        <div className="text-right">
            <span className="text-sm font-bold text-primary">{value}</span>
            {subValue && <span className="text-xs text-muted-foreground ml-1">{subValue}</span>}
        </div>
    </div>
);

export const ClassStatsPanel: React.FC<ClassViewPanelProps> = ({
    students,
    grade,
    classNum,
    afterschoolCounts = {},
}) => {
    // 자습실 이용 현황 통계
    // 복합 점수 알고리즘: 출석률과 출석횟수를 균형있게 고려
    const studyRoomStats = useMemo(() => {
        const studentsWithReservations = students.filter(s => s.total_reservations > 0);
        const totalReservations = students.reduce((sum, s) => sum + s.total_reservations, 0);
        const totalAttended = students.reduce((sum, s) => sum + s.attended_count, 0);
        const avgRate = totalReservations > 0
            ? Math.round((totalAttended / totalReservations) * 100)
            : 0;

        // 복합 점수 계산을 위한 최대값
        const maxAttended = Math.max(...studentsWithReservations.map(s => s.attended_count), 1);

        // 복합 점수 계산 및 순위
        // 알고리즘: (출석률 정규화 * 0.5) + (출석횟수 정규화 * 0.5)
        // - 출석률: 0-100을 0-1로 정규화
        // - 출석횟수: 최대 출석횟수 대비 비율로 0-1 정규화
        const rankedWithScore = studentsWithReservations.map(s => {
            const normalizedRate = s.attendance_rate / 100;
            const normalizedCount = s.attended_count / maxAttended;
            // 50:50 가중치로 복합 점수 계산
            const combinedScore = (normalizedRate * 0.5) + (normalizedCount * 0.5);
            return {
                ...s,
                combinedScore: Math.round(combinedScore * 100), // 0-100 점수로 변환
            };
        }).sort((a, b) => b.combinedScore - a.combinedScore);

        return {
            totalStudents: studentsWithReservations.length,
            totalReservations,
            totalAttended,
            avgRate,
            topStudents: rankedWithScore.slice(0, 5),
            lowStudents: rankedWithScore.slice(-3).reverse(),
        };
    }, [students]);

    // 방과후 현황 통계
    const afterschoolStats = useMemo(() => {
        const countsArray = students.map(s => ({
            student: s,
            count: afterschoolCounts[s.student_code] || 0,
        }));

        const totalCourses = countsArray.reduce((sum, s) => sum + s.count, 0);
        const studentsWithCourses = countsArray.filter(s => s.count > 0).length;
        const avgCourses = students.length > 0
            ? (totalCourses / students.length).toFixed(1)
            : 0;

        // 수강 개수 순위
        const ranked = [...countsArray]
            .sort((a, b) => b.count - a.count)
            .filter(s => s.count > 0);

        return {
            totalCourses,
            studentsWithCourses,
            avgCourses,
            topStudents: ranked.slice(0, 5),
        };
    }, [students, afterschoolCounts]);

    // 봉사활동 시간 통계
    const volunteerStats = useMemo(() => {
        const studentsWithVolunteer = students.map(s => {
            let totalHours = 0;
            if (Array.isArray(s.volunteer)) {
                totalHours = s.volunteer.reduce((sum: number, v: any) =>
                    sum + (parseFloat(v.hours) || 0), 0);
            }
            return { student: s, hours: totalHours };
        });

        const totalHours = studentsWithVolunteer.reduce((sum, s) => sum + s.hours, 0);
        const avgHours = students.length > 0
            ? (totalHours / students.length).toFixed(1)
            : 0;

        // 시간 순위
        const ranked = [...studentsWithVolunteer]
            .sort((a, b) => b.hours - a.hours)
            .filter(s => s.hours > 0);

        return {
            totalHours,
            avgHours,
            studentsWithHours: ranked.length,
            topStudents: ranked.slice(0, 5),
        };
    }, [students]);

    // 교과 성적 추이 통계 (평균 등급)
    const gradeStats = useMemo(() => {
        const studentsWithGrades = students.map(s => {
            const grades = s.academic_development || [];
            // 등급이 있는 과목만 필터링 (rank가 숫자인 경우)
            const validGrades = grades.filter((g: any) =>
                typeof g.rank === 'number' && g.rank >= 1 && g.rank <= 9
            );

            if (validGrades.length === 0) return { student: s, avgGrade: null, count: 0 };

            // 단위수 가중 평균
            const totalUnits = validGrades.reduce((sum: number, g: any) => sum + (g.units || 1), 0);
            const weightedSum = validGrades.reduce((sum: number, g: any) =>
                sum + (g.rank * (g.units || 1)), 0);

            return {
                student: s,
                avgGrade: totalUnits > 0 ? weightedSum / totalUnits : null,
                count: validGrades.length,
            };
        });

        const validStudents = studentsWithGrades.filter(s => s.avgGrade !== null);
        const classAvg = validStudents.length > 0
            ? validStudents.reduce((sum, s) => sum + (s.avgGrade || 0), 0) / validStudents.length
            : null;

        // 평균등급 순위 (낮을수록 좋음)
        const ranked = [...validStudents]
            .sort((a, b) => (a.avgGrade || 9) - (b.avgGrade || 9));

        return {
            classAvg: classAvg?.toFixed(2),
            studentsWithGrades: validStudents.length,
            topStudents: ranked.slice(0, 5),
        };
    }, [students]);

    // 헤더 텍스트 생성
    const headerTitle = classNum
        ? `${grade}학년 ${classNum}반 현황`
        : `${grade}학년 전체 현황`;

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

            {/* 통계 그리드 */}
            <ScrollArea className="flex-1">
                <div className="p-8 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* 자습실 이용 현황 */}
                        <StatCard
                            title="자습실 이용 현황"
                            icon={BookOpen}
                            iconColor="bg-primary/10 text-primary"
                        >
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="text-center p-3 rounded-lg bg-muted/30">
                                        <div className="text-xs text-muted-foreground mb-1">이용 학생</div>
                                        <div className="text-xl font-bold">{studyRoomStats.totalStudents}명</div>
                                    </div>
                                    <div className="text-center p-3 rounded-lg bg-primary/5">
                                        <div className="text-xs text-primary/70 mb-1">총 예약</div>
                                        <div className="text-xl font-bold text-primary">{studyRoomStats.totalReservations}</div>
                                    </div>
                                    <div className="text-center p-3 rounded-lg bg-green-50">
                                        <div className="text-xs text-green-600/80 mb-1">평균 출석률</div>
                                        <div className="text-xl font-bold text-green-700">{studyRoomStats.avgRate}%</div>
                                    </div>
                                </div>

                                {studyRoomStats.topStudents.length > 0 && (
                                    <div className="pt-3 border-t">
                                        <div className="text-xs font-medium text-muted-foreground mb-2">
                                            자습실 이용 TOP 5
                                            <span className="text-[10px] text-muted-foreground/70 ml-1">(출석률+횟수 복합점수)</span>
                                        </div>
                                        <div className="space-y-1">
                                            {studyRoomStats.topStudents.map((s: any, i) => (
                                                <StudentRow
                                                    key={s.student_code}
                                                    student={s}
                                                    rank={i + 1}
                                                    value={`${s.combinedScore}점`}
                                                    subValue={`${s.attendance_rate}% · ${s.attended_count}회`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </StatCard>

                        {/* 방과후 현황 */}
                        <StatCard
                            title="방과후 현황"
                            icon={School}
                            iconColor="bg-brand-100 text-brand-600"
                        >
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="text-center p-3 rounded-lg bg-muted/30">
                                        <div className="text-xs text-muted-foreground mb-1">수강 학생</div>
                                        <div className="text-xl font-bold">{afterschoolStats.studentsWithCourses}명</div>
                                    </div>
                                    <div className="text-center p-3 rounded-lg bg-brand-50">
                                        <div className="text-xs text-brand-600/80 mb-1">총 수강</div>
                                        <div className="text-xl font-bold text-brand-700">{afterschoolStats.totalCourses}개</div>
                                    </div>
                                    <div className="text-center p-3 rounded-lg bg-indigo-50">
                                        <div className="text-xs text-indigo-600/80 mb-1">평균 수강</div>
                                        <div className="text-xl font-bold text-indigo-700">{afterschoolStats.avgCourses}개</div>
                                    </div>
                                </div>

                                {afterschoolStats.topStudents.length > 0 && (
                                    <div className="pt-3 border-t">
                                        <div className="text-xs font-medium text-muted-foreground mb-2">수강 과목 TOP 5</div>
                                        <div className="space-y-1">
                                            {afterschoolStats.topStudents.map((s, i) => (
                                                <StudentRow
                                                    key={s.student.student_code}
                                                    student={s.student}
                                                    rank={i + 1}
                                                    value={s.count}
                                                    subValue="개"
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </StatCard>

                        {/* 봉사활동 시간 */}
                        <StatCard
                            title="봉사활동 시간"
                            icon={Heart}
                            iconColor="bg-rose-100 text-rose-600"
                        >
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="text-center p-3 rounded-lg bg-muted/30">
                                        <div className="text-xs text-muted-foreground mb-1">활동 학생</div>
                                        <div className="text-xl font-bold">{volunteerStats.studentsWithHours}명</div>
                                    </div>
                                    <div className="text-center p-3 rounded-lg bg-rose-50">
                                        <div className="text-xs text-rose-600/80 mb-1">총 시간</div>
                                        <div className="text-xl font-bold text-rose-700">{volunteerStats.totalHours}시간</div>
                                    </div>
                                    <div className="text-center p-3 rounded-lg bg-orange-50">
                                        <div className="text-xs text-orange-600/80 mb-1">평균 시간</div>
                                        <div className="text-xl font-bold text-orange-700">{volunteerStats.avgHours}시간</div>
                                    </div>
                                </div>

                                {volunteerStats.topStudents.length > 0 && (
                                    <div className="pt-3 border-t">
                                        <div className="text-xs font-medium text-muted-foreground mb-2">봉사시간 TOP 5</div>
                                        <div className="space-y-1">
                                            {volunteerStats.topStudents.map((s, i) => (
                                                <StudentRow
                                                    key={s.student.student_code}
                                                    student={s.student}
                                                    rank={i + 1}
                                                    value={s.hours}
                                                    subValue="시간"
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </StatCard>

                        {/* 교과 성적 현황 */}
                        <StatCard
                            title="교과 성적 현황"
                            icon={TrendingUp}
                            iconColor="bg-emerald-100 text-emerald-600"
                        >
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="text-center p-3 rounded-lg bg-muted/30">
                                        <div className="text-xs text-muted-foreground mb-1">성적 보유 학생</div>
                                        <div className="text-xl font-bold">{gradeStats.studentsWithGrades}명</div>
                                    </div>
                                    <div className="text-center p-3 rounded-lg bg-emerald-50">
                                        <div className="text-xs text-emerald-600/80 mb-1">학급 평균 등급</div>
                                        <div className="text-xl font-bold text-emerald-700">
                                            {gradeStats.classAvg || '-'}
                                        </div>
                                    </div>
                                </div>

                                {gradeStats.topStudents.length > 0 && (
                                    <div className="pt-3 border-t">
                                        <div className="text-xs font-medium text-muted-foreground mb-2">평균등급 TOP 5</div>
                                        <div className="space-y-1">
                                            {gradeStats.topStudents.map((s, i) => (
                                                <StudentRow
                                                    key={s.student.student_code}
                                                    student={s.student}
                                                    rank={i + 1}
                                                    value={s.avgGrade?.toFixed(2) || '-'}
                                                    subValue="등급"
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </StatCard>
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
};
