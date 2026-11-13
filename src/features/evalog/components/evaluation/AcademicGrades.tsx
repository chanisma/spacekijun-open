import React, { useState, useRef } from 'react';
import { Student } from '../../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, BookOpen, Calculator, BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { drawLineProps } from '@/lib/chartAnimation';
import SeteukDetailDialog from './SeteukDetailDialog';
import type { EvalogGranularPermissions } from '../../types/permissions';

interface AcademicGradesProps {
  student: Student;
  permissions: EvalogGranularPermissions;
}

const AcademicGrades: React.FC<AcademicGradesProps> = ({ student, permissions }) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    new Set(['전과목', '국어', '수학', '영어', '사회', '과학', '기타'])
  );
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Determine scoring system based on admission year
  // 2025학년도 이후 입학생(2025년 1학년)부터 5등급제 적용
  const admissionYear = student.section1_personal_info?.admissionYear
    ? parseInt(String(student.section1_personal_info.admissionYear).replace(/[^0-9]/g, ''))
    : 0;
  const isGrade5System = admissionYear >= 2025;

  // Refs for scrolling (kept for future use if needed)
  const trendRef = useRef<HTMLDivElement>(null);
  const subjectRef = useRef<HTMLDivElement>(null);
  const careerRef = useRef<HTMLDivElement>(null);
  const achievementRef = useRef<HTMLDivElement>(null);

  const handleSubjectClick = (subject: any) => {
    setSelectedSubject(subject);
    setIsModalOpen(true);
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

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

  // --- Render Functions ---

  const renderTrendChart = () => {
    if (!student.section6_academic_development || student.section6_academic_development.length === 0) return null;

    const regularSubjects = student.section6_academic_development
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

    const matchesCategory = (subjectGroup: string, category: string): boolean => {
      if (category === '전과목') return true;
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
        const subjectsForAvg = student.section6_academic_development
          ? subjects.filter((s: any) => s.rank !== null && s.rank !== undefined)
          : subjects;

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
      <div className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-6 pb-2 border-b border-gray-100/50">
          <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
            <TrendingUp size={18} />
          </div>
          <h3 className="font-semibold text-slate-800">교과별 추이도 {isGrade5System && <span className="text-xs font-normal text-slate-500 ml-2">(2022 개정 교육과정 5등급제 적용)</span>}</h3>
        </div>

        <div className="mb-6 flex flex-wrap gap-2 justify-start">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => toggleChartCategory(category)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                activeCategories.has(category)
                  ? "bg-white border-gray-200 shadow-sm"
                  : "bg-transparent border-transparent text-gray-400 saturate-0 opacity-60 hover:opacity-100 hover:bg-gray-50"
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: categoryColors[category as keyof typeof categoryColors] }}
              />
              <span
                style={{
                  color: activeCategories.has(category)
                    ? '#1e293b'
                    : 'inherit'
                }}
              >
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
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  border: 'none',
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

  const renderSubjectTable = () => {
    if (!student.section6_academic_development || student.section6_academic_development.length === 0) return null;

    const regularSubjects = student.section6_academic_development
      .filter((s: any) => (['regular', 'pe_arts', 'pe_arts_experiment', 'general'].includes(s.category)))
      .map((s: any) => ({
        subject: s.subject,
        category: s.subject_group,
        originalCategory: s.category, // Preserve original category for calculation filtering
        grade: s.rank || s.achievement || 0,
        semester: `${s.grade}-${s.semester}` as any,
        units: s.units,
        remarks: s.content,
        rank: s.rank,
        achievement: s.achievement,
      }));

    const matchesCategory = (subjectGroup: string, category: string): boolean => {
      if (category === '전과목') return true;
      const isSpecialCase = subjectGroup.startsWith('기술') || subjectGroup.includes('제2외국어') ||
        subjectGroup.includes('한문') || subjectGroup === '한국사';
      if (category === '기타') {
        return isSpecialCase || !['국어', '수학', '영어', '사회', '과학', '체육'].some(cat => subjectGroup.includes(cat));
      }
      if (isSpecialCase) return false;
      return subjectGroup.includes(category);
    };

    const categories = ['전과목', '국어', '수학', '영어', '사회', '과학', '체육', '기타'];
    const categoryStats = categories.map(category => {
      const subjects = regularSubjects.filter((g: any) => matchesCategory(g.category, category));
      if (subjects.length === 0) return null;

      // Filter for Average Calculation: Must have Grade/Rank AND be 'regular' category
      // Using weighted average: Sum(Grade * Units) / Sum(Units)
      // Only subjects with originalCategory === 'regular' are used for the average calculation.
      const subjectsForAvg = subjects.filter((s: any) =>
        s.rank !== null && s.rank !== undefined && s.originalCategory === 'regular'
      );

      let avgGrade = 0;
      if (subjectsForAvg.length > 0) {
        const totalWeightedScore = subjectsForAvg.reduce((sum: number, s: any) => sum + (gradeToNumber(s.grade) * s.units), 0);
        const totalAvgUnits = subjectsForAvg.reduce((sum: number, s: any) => sum + s.units, 0);
        avgGrade = totalAvgUnits > 0 ? totalWeightedScore / totalAvgUnits : 0;
      }

      const totalUnits = subjects.reduce((sum: number, s: any) => sum + s.units, 0);

      const semesterAvgs = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'].map(semester => {
        const semesterSubjects = subjects.filter((s: any) => s.semester === semester);
        const semesterSubjectsForAvg = semesterSubjects.filter((s: any) =>
          s.rank !== null && s.rank !== undefined && s.originalCategory === 'regular'
        );

        if (semesterSubjectsForAvg.length === 0) return '-';

        const semWeightedScore = semesterSubjectsForAvg.reduce((sum: number, s: any) => sum + (gradeToNumber(s.grade) * s.units), 0);
        const semTotalUnits = semesterSubjectsForAvg.reduce((sum: number, s: any) => sum + s.units, 0);

        const avg = semTotalUnits > 0 ? semWeightedScore / semTotalUnits : 0;
        return avg.toFixed(2);
      });

      return { category, avgGrade: avgGrade.toFixed(2), totalUnits, semesterAvgs };
    }).filter((stat): stat is NonNullable<typeof stat> => stat !== null);

    const tableRows: React.ReactNode[] = [];
    categoryStats.forEach((stat, idx) => {
      const category = stat.category;
      const isExpanded = expandedCategories.has(category);

      tableRows.push(
        <tr
          key={`cat-${idx}`}
          className={cn(
            "transition-colors",
            category !== '전과목' ? 'cursor-pointer hover:bg-slate-50' : 'bg-brand-50/30'
          )}
          onClick={() => category !== '전과목' && toggleCategory(category)}
        >
          <td className="py-3 px-4 font-semibold text-slate-700">
            {category !== '전과목' && (
              <span className="inline-flex items-center justify-center w-5 h-5 mr-1.5 rounded-full bg-slate-100 text-slate-400 text-[10px]">
                {isExpanded ? '▼' : '▶'}
              </span>
            )}
            {category}
          </td>
          <td className="py-3 px-2 text-center font-bold text-slate-800">{stat.avgGrade}</td>
          <td className="py-3 px-2 text-center text-slate-500">{stat.totalUnits}</td>
          {stat.semesterAvgs.map((avg, semIdx) => (
            <td key={`sem-${semIdx}`} className="py-3 px-2 text-center text-slate-600">
              {avg === '-' ? <span className="text-slate-300">-</span> : avg}
            </td>
          ))}
        </tr>
      );

      if (isExpanded) {
        const categorySubjects = regularSubjects.filter((g: any) => matchesCategory(g.category, category));
        const subjectCounts: Record<string, number> = {};
        categorySubjects.forEach((s: any) => {
          subjectCounts[s.subject] = (subjectCounts[s.subject] || 0) + 1;
        });

        categorySubjects.forEach((subject: any, subIdx: number) => {
          const hasDuplicate = subjectCounts[subject.subject] > 1;
          const displayName = hasDuplicate
            ? `${subject.subject} (${subject.semester})`
            : subject.subject;

          tableRows.push(
            <tr
              key={`sub-${idx}-${subIdx}`}
              className="bg-slate-50/50 hover:bg-white cursor-pointer border-l-2 border-l-transparent hover:border-l-brand-400 transition-all"
              onClick={() => handleSubjectClick(subject)}>
              <td className="py-2.5 px-4 pl-12 text-xs flex items-center text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-200 mr-2"></span>
                {displayName}
              </td>
              <td className="py-2.5 px-2 text-center text-xs font-medium text-slate-700">
                {gradeToNumber(subject.grade) ? <span className="px-2 py-0.5 rounded bg-white border shadow-sm">{gradeToNumber(subject.grade)}</span> : '-'}
              </td>
              <td className="py-2.5 px-2 text-center text-xs text-slate-400">{subject.units}</td>
              {['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'].map(sem => (
                <td key={`sem-val-${sem}`} className="py-2.5 px-2 text-center text-xs text-slate-500">
                  {subject.semester === sem ? subject.grade : '-'}
                </td>
              ))}
            </tr>
          );
        });
      }
    });

    return (
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-6 pb-2 border-b border-gray-100/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
              <BookOpen size={18} />
            </div>
            <h3 className="font-semibold text-slate-800">성적현황 [교과]</h3>
          </div>
          <span className="text-[10px] text-slate-400 font-normal">* 과목명을 클릭하여 상세 정보를 확인하세요</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-100/60 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-gray-100 text-slate-500">
                <th className="py-3 px-4 text-left font-medium">교과구분</th>
                <th className="py-3 px-2 text-center font-medium">전체평균</th>
                <th className="py-3 px-2 text-center font-medium">이수단위</th>
                <th className="py-3 px-2 text-center font-medium text-slate-400">1-1</th>
                <th className="py-3 px-2 text-center font-medium text-slate-400">1-2</th>
                <th className="py-3 px-2 text-center font-medium text-slate-400">2-1</th>
                <th className="py-3 px-2 text-center font-medium text-slate-400">2-2</th>
                <th className="py-3 px-2 text-center font-medium text-slate-400">3-1</th>
                <th className="py-3 px-2 text-center font-medium text-slate-400">3-2</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tableRows}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderCareerTable = () => {
    if (!student.section6_academic_development || student.section6_academic_development.filter((s: any) => s.category === 'career').length === 0) return null;

    const careerSubjects = student.section6_academic_development
      .filter((s: any) => s.category === 'career')
      .map((s: any) => ({
        subject: s.subject,
        category: s.subject_group,
        semester: `${s.grade}-${s.semester}`,
        units: s.units,
        rawScore: s.score,
        classAverage: s.average,
        achievement: s.achievement,
        totalStudents: s.students,
        achievementDistribution: s.distribution
          ? `A(${s.distribution.A}) B(${s.distribution.B}) C(${s.distribution.C})`
          : undefined,
        remarks: s.content,
        subjectType: '진로선택'
      }));

    const groupedByGrade: Record<string, any[]> = {};
    careerSubjects.forEach((subject: any) => {
      const [grade] = subject.semester.split('-');
      if (!groupedByGrade[grade]) groupedByGrade[grade] = [];
      groupedByGrade[grade].push(subject);
    });

    Object.keys(groupedByGrade).forEach(grade => {
      groupedByGrade[grade].sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.semester.localeCompare(b.semester);
      });
    });

    const careerTableRows: React.ReactNode[] = [];

    Object.entries(groupedByGrade).forEach(([grade, subjects]) => {
      const categoryGroups: Record<string, typeof subjects> = {};
      subjects.forEach((subject: any) => {
        if (!categoryGroups[subject.category]) categoryGroups[subject.category] = [];
        categoryGroups[subject.category].push(subject);
      });

      let gradeRowRendered = false;

      Object.entries(categoryGroups).forEach(([category, categorySubjects], catIdx) => {
        const categoryTotalUnits = categorySubjects.reduce((sum: number, s: any) => sum + s.units, 0);

        categorySubjects.forEach((subject: any, subIdx: number) => {
          const [, semester] = subject.semester.split('-');
          const isFirstInCategory = subIdx === 0;
          const isFirstInGrade = !gradeRowRendered && catIdx === 0 && subIdx === 0;

          if (isFirstInGrade) {
            gradeRowRendered = true;
          }

          careerTableRows.push(
            <tr
              key={`career-${grade}-${category}-${subIdx}`}
              className="hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={() => handleSubjectClick(subject)}
            >
              {isFirstInGrade && (
                <td className="py-3 px-2 text-center font-bold text-slate-700 bg-slate-50/50" rowSpan={subjects.length}>{grade}</td>
              )}
              <td className="py-3 px-2 text-center text-slate-500">{semester}</td>
              {isFirstInCategory && (
                <td className="py-3 px-2 text-center font-medium text-slate-600 border-x border-gray-50" rowSpan={categorySubjects.length}>{category}</td>
              )}
              <td className="py-3 px-2 font-semibold text-slate-800">{subject.subject}</td>
              <td className="py-3 px-2 text-center text-slate-500">{subject.units}</td>
              <td className="py-3 px-2 text-center text-slate-600 font-mono">
                {subject.rawScore && subject.classAverage
                  ? `${subject.rawScore}/${subject.classAverage}`
                  : '-'}
              </td>
              <td className="py-3 px-2 text-center">
                {subject.achievement ? (
                  <span className={cn(
                    "px-2 py-0.5 rounded text-xs font-bold",
                    subject.achievement === 'A' ? "bg-emerald-50 text-emerald-600" :
                      subject.achievement === 'B' ? "bg-blue-50 text-blue-600" :
                        subject.achievement === 'C' ? "bg-amber-50 text-amber-600" : "bg-gray-50 text-gray-500"
                  )}>
                    {subject.achievement}
                    <span className="font-normal text-slate-400 ml-1">({subject.totalStudents})</span>
                  </span>
                ) : '-'}
              </td>
              <td className="py-3 px-2 text-center text-[10px] text-slate-400">
                {subject.achievementDistribution || '-'}
              </td>
              {isFirstInCategory && (
                <td className="py-3 px-2 text-center font-bold text-brand-600 bg-brand-50/10" rowSpan={categorySubjects.length}>
                  {categoryTotalUnits}
                </td>
              )}
            </tr>
          );
        });
      });
    });

    return (
      <div className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100/50">
          <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
            <BarChart2 size={18} />
          </div>
          <h3 className="font-semibold text-slate-800">진로선택 과목</h3>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-100/60 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-gray-100 text-slate-500">
                <th className="py-3 px-2 text-center font-medium">학년</th>
                <th className="py-3 px-2 text-center font-medium">학기</th>
                <th className="py-3 px-2 text-center font-medium">교과</th>
                <th className="py-3 px-2 text-left font-medium">과목</th>
                <th className="py-3 px-2 text-center font-medium">단위</th>
                <th className="py-3 px-2 text-center font-medium">원점수/평균</th>
                <th className="py-3 px-2 text-center font-medium">성취도(수강자)</th>
                <th className="py-3 px-2 text-center font-medium">분포 비율</th>
                <th className="py-3 px-2 text-center font-medium">총이수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {careerTableRows}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderAchievementStats = () => {
    if (!student.section6_academic_development || student.section6_academic_development.filter((s: any) => s.category === 'career').length === 0) return null;

    const careerSubjects = student.section6_academic_development
      .filter((s: any) => s.category === 'career')
      .map((s: any) => ({
        category: s.subject_group,
        achievement: s.achievement,
        subject: s.subject,
        units: s.units,
        semester: `${s.grade}-${s.semester}`
      }));

    const categoryGroups: Record<string, any[]> = {};
    careerSubjects.forEach((subject: any) => {
      if (!categoryGroups[subject.category]) categoryGroups[subject.category] = [];
      categoryGroups[subject.category].push(subject);
    });

    const gradeStats: Record<string, { A: any[], B: any[], C: any[], total: number }> = {};
    Object.entries(categoryGroups).forEach(([category, subjects]) => {
      gradeStats[category] = { A: [], B: [], C: [], total: 0 };
      subjects.forEach((subject: any) => {
        const achievement = subject.achievement || subject.grade;
        if (achievement === 'A') {
          gradeStats[category].A.push(subject);
        } else if (achievement === 'B') {
          gradeStats[category].B.push(subject);
        } else if (achievement === 'C') {
          gradeStats[category].C.push(subject);
        }
        gradeStats[category].total += subject.units;
      });
    });

    let totalA = 0, totalB = 0, totalC = 0, totalUnitsAll = 0;
    let countA = 0, countB = 0, countC = 0;
    Object.values(gradeStats).forEach(stat => {
      countA += stat.A.length;
      countB += stat.B.length;
      countC += stat.C.length;
      totalA += stat.A.reduce((sum, s) => sum + s.units, 0);
      totalB += stat.B.reduce((sum, s) => sum + s.units, 0);
      totalC += stat.C.reduce((sum, s) => sum + s.units, 0);
      totalUnitsAll += stat.total;
    });

    return (
      <div className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100/50">
          <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
            <Calculator size={18} />
          </div>
          <h3 className="font-semibold text-slate-800">진로선택 과목 성취도별 통계</h3>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-100/60 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-gray-100 text-slate-500">
                <th className="py-3 px-4 text-left font-medium">교과(군)</th>
                <th className="py-3 px-2 text-center font-medium">A등급</th>
                <th className="py-3 px-2 text-center font-medium">B등급</th>
                <th className="py-3 px-2 text-center font-medium">C등급</th>
                <th className="py-3 px-2 text-center font-medium">총 이수단위</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50/50">
              {Object.entries(gradeStats).map(([category, stat]) => (
                <tr key={category} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-700">{category}</td>
                  <td className="py-3 px-2 border-l border-gray-50">
                    {stat.A.map((subject, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 mb-1 last:mb-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span className="text-slate-600">
                          {subject.semester} {subject.subject}(<span className="font-medium text-emerald-600">{subject.units}</span>)
                        </span>
                      </div>
                    ))}
                  </td>
                  <td className="py-3 px-2 border-l border-gray-50">
                    {stat.B.map((subject, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 mb-1 last:mb-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                        <span className="text-slate-600">
                          {subject.semester} {subject.subject}(<span className="font-medium text-blue-600">{subject.units}</span>)
                        </span>
                      </div>
                    ))}
                  </td>
                  <td className="py-3 px-2 border-l border-gray-50">
                    {stat.C.map((subject, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 mb-1 last:mb-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                        <span className="text-slate-600">
                          {subject.semester} {subject.subject}(<span className="font-medium text-amber-600">{subject.units}</span>)
                        </span>
                      </div>
                    ))}
                  </td>
                  <td className="py-3 px-2 text-center font-bold text-slate-700 bg-slate-50/30">{stat.total}</td>
                </tr>
              ))}
              <tr className="bg-slate-100/50 border-t border-slate-200">
                <td className="py-3 px-4 font-bold text-slate-800">합계</td>
                <td className="py-3 px-2 text-center font-medium text-emerald-700">{countA}과목 ({totalA})</td>
                <td className="py-3 px-2 text-center font-medium text-blue-700">{countB}과목 ({totalB})</td>
                <td className="py-3 px-2 text-center font-medium text-amber-700">{countC}과목 ({totalC})</td>
                <td className="py-3 px-2 text-center font-black text-slate-900">총 {countA + countB + countC}과목 ({totalUnitsAll})</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="relative isolate">
      {/* Sticky Navigation has been deactivated per user request */}

      {/* Main Content */}
      <div className="space-y-8">
        {/* 교과별 추이도 그래프 */}
        <div ref={trendRef}>
          {renderTrendChart()}
        </div>

        {/* 성적현황[교과] - 교과구분별 통계 */}
        <div ref={subjectRef}>
          {renderSubjectTable()}
        </div>

        {/* 진로선택 과목 */}
        <div ref={careerRef}>
          {renderCareerTable()}
        </div>

        {/* 진로선택 과목 성취도별 통계 */}
        <div ref={achievementRef}>
          {renderAchievementStats()}
        </div>
      </div>

      {/* Modal - Seteuk Details */}
      {selectedSubject && (
        <SeteukDetailDialog
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          subjectName={selectedSubject.subject}
          semester={selectedSubject.semester}
          category={selectedSubject.category}
          units={selectedSubject.units}
          grade={selectedSubject.achievement || selectedSubject.grade}
          remarks={selectedSubject.remarks}
          canViewRemarks={permissions.canViewSeteuk(selectedSubject.category || '')}
        />
      )}
    </div>
  );
};

export default AcademicGrades;
