import React, { useState } from 'react';
import { StudentDashboardData } from '@/hooks/useStudentDashboard';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { drawLineProps } from '@/lib/chartAnimation';

interface GradeTrendChartProps {
    student: StudentDashboardData;
}

export const GradeTrendChart: React.FC<GradeTrendChartProps> = ({ student }) => {
    const [activeCategories, setActiveCategories] = useState<Set<string>>(
        new Set(['전과목', '국어', '수학', '영어', '사회', '과학'])
    );

    // 2025학년도 이후 입학생(2025년 1학년)부터 5등급제 적용
    // ID가 25로 시작하면 2025년 입학생
    const admissionYear = student.student_code
        ? 2000 + parseInt(student.student_code.substring(0, 2))
        : 0;
    const isGrade5System = admissionYear >= 2025;

    const toggleChartCategory = (category: string) => {
        const newActive = new Set(activeCategories);
        if (newActive.has(category)) {
            newActive.delete(category);
        } else {
            newActive.add(category);
        }
        setActiveCategories(newActive);
    };

    const gradeToNumber = (grade: number | string): number => {
        if (typeof grade === 'number') return grade;
        if (grade === 'A') return 1;
        if (grade === 'B') return 2;
        if (grade === 'C') return 3;
        if (grade === 'D') return 4;
        if (grade === 'E') return 5;
        return 0;
    };

    if (!student.academic_development || student.academic_development.length === 0) return null;

    // Filter relevant subjects for trend chart
    const regularSubjects = student.academic_development
        .filter((s: any) => (['regular', 'pe_arts', 'pe_arts_experiment', 'general'].includes(s.category)) && !(s.grade === 3 && s.semester === 2))
        .map((s: any) => ({
            subject: s.subject,
            category: s.subject_group,
            grade: s.rank || s.achievement || 0,
            semester: `${s.grade}-${s.semester}` as any,
            units: s.units,
            rank: s.rank,
            achievement: s.achievement,
        }));

    if (regularSubjects.length === 0) return (
        <div className="p-6 text-center text-muted-foreground bg-muted/10 rounded-xl border border-border/50">
            <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">분석할 교과 성적 데이터가 없습니다.</p>
        </div>
    );

    const matchesCategory = (subjectGroup: string, category: string): boolean => {
        if (category === '전과목') return true;
        if (!subjectGroup) return false;
        if (subjectGroup.startsWith('기술') || subjectGroup.includes('제2외국어') ||
            subjectGroup.includes('한문') || subjectGroup === '한국사') {
            return false;
        }
        return subjectGroup.includes(category);
    };

    const semesters = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'];
    const categories = ['전과목', '국어', '수학', '영어', '사회', '과학'];

    const trendData = semesters.map(semester => {
        const semesterData: any = { semester };
        categories.forEach(category => {
            const subjects = regularSubjects.filter((s: any) => s.semester === semester && matchesCategory(s.category, category));
            const subjectsForAvg = subjects.filter((s: any) => s.rank !== null && s.rank !== undefined);

            if (subjectsForAvg.length > 0) {
                const avg = subjectsForAvg.reduce((sum: number, s: any) => sum + gradeToNumber(s.grade), 0) / subjectsForAvg.length;
                semesterData[category] = parseFloat(avg.toFixed(2));
            } else {
                semesterData[category] = null;
            }
        });
        return semesterData;
    });

    const categoryColors = {
        '전과목': '#22c55e',
        '국어': '#3b82f6',
        '수학': '#ef4444',
        '영어': '#f59e0b',
        '사회': '#8b5cf6',
        '과학': '#14b8a6'
    };

    return (
        <div className="bg-white/60 p-6 rounded-xl border border-border/50 shadow-sm">
            <div className="flex items-center gap-2 mb-6 pb-2 border-b border-border/50">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <TrendingUp size={18} />
                </div>
                <h3 className="font-semibold text-foreground">교과별 추이도 {isGrade5System && <span className="text-xs font-normal text-muted-foreground ml-2">(2022 개정 5등급제)</span>}</h3>
            </div>

            <div className="mb-6 flex flex-wrap gap-2 justify-start">
                {categories.map(category => (
                    <button
                        key={category}
                        onClick={() => toggleChartCategory(category)}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                            activeCategories.has(category)
                                ? "bg-white border-border shadow-sm text-foreground"
                                : "bg-transparent border-transparent text-muted-foreground opacity-60 hover:opacity-100 hover:bg-muted"
                        )}
                    >
                        <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: categoryColors[category as keyof typeof categoryColors] }}
                        />
                        <span className={activeCategories.has(category) ? 'opacity-100' : 'opacity-80'}>
                            {category}
                        </span>
                    </button>
                ))}
            </div>

            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                            dataKey="semester"
                            tick={{ fontSize: 12, fill: '#64748b' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            domain={[1, isGrade5System ? 5 : 9]}
                            reversed={true}
                            scale="linear"
                            ticks={isGrade5System ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7, 8, 9]}
                            tick={{ fontSize: 12, fill: '#64748b' }}
                            axisLine={false}
                            tickLine={false}
                            width={30}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                borderRadius: '12px',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                border: '1px solid #e2e8f0',
                                fontSize: '12px'
                            }}
                            formatter={(value: any) => value ? value.toFixed(2) : '-'}
                        />
                        {categories.map(category => (
                            activeCategories.has(category) && (
                                <Line
                                    key={category}
                                    {...drawLineProps}
                                    type="monotone"
                                    dataKey={category}
                                    stroke={categoryColors[category as keyof typeof categoryColors]}
                                    strokeWidth={2.5}
                                    dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                    connectNulls
                                />
                            )
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
