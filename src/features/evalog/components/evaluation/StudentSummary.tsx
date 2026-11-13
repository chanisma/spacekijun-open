import React, { useState, useMemo } from 'react';
import { Student } from '../../types';
import { User, School, Hash, GraduationCap, Building2, TrendingUp, BarChart3 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { drawLineProps } from '@/lib/chartAnimation';

interface StudentSummaryProps {
  student: Student;
}

// 교과 카테고리 색상
const ACADEMIC_CATEGORY_COLORS: Record<string, string> = {
  '전과목': '#22c55e',
  '국어': '#3b82f6',
  '수학': '#ef4444',
  '영어': '#f59e0b',
  '사회': '#8b5cf6',
  '과학': '#14b8a6',
};

// 모의고사 과목 색상
const MOCK_SUBJECT_COLORS: Record<string, string> = {
  '전과목': '#22c55e',
  '국어': '#3b82f6',
  '수학': '#ef4444',
  '영어': '#f59e0b',
  '한국사': '#8b5cf6',
};
const MOCK_FALLBACK_COLORS = [
  '#6366f1', '#a855f7', '#d946ef', '#f43f5e', '#0ea5e9',
  '#10b981', '#eab308', '#78716c', '#64748b', '#dc2626',
];
const getMockSubjectColor = (subject: string, index: number): string =>
  MOCK_SUBJECT_COLORS[subject] || MOCK_FALLBACK_COLORS[index % MOCK_FALLBACK_COLORS.length];

const CHART_EXCLUDED_SUBJECTS = ['공통과학', '공통사회', '과학탐구', '사회탐구'];

const StudentSummary: React.FC<StudentSummaryProps> = ({ student }) => {
  // 교과 추이도 토글
  const [activeAcademicCategories, setActiveAcademicCategories] = useState<Set<string>>(
    new Set(['전과목', '국어', '수학', '영어', '사회', '과학'])
  );
  // 모의고사 등급 추이도 토글
  const [activeMockSubjects, setActiveMockSubjects] = useState<Set<string>>(new Set());

  // --- 교과 추이도 데이터 ---
  const academicTrendData = useMemo(() => {
    if (!student.section6_academic_development || student.section6_academic_development.length === 0) return null;

    const gradeToNumber = (grade: number | string): number => {
      if (typeof grade === 'number') return grade;
      if (grade === 'A') return 1;
      if (grade === 'B') return 2;
      if (grade === 'C') return 3;
      if (grade === 'D') return 4;
      if (grade === 'E') return 5;
      return 0;
    };

    const regularSubjects = student.section6_academic_development
      .filter((s: any) => (['regular', 'pe_arts', 'pe_arts_experiment', 'general'].includes(s.category)) && !(s.grade === 3 && s.semester === 2))
      .map((s: any) => ({
        subject: s.subject,
        category: s.subject_group,
        grade: s.rank || s.achievement || 0,
        semester: `${s.grade}-${s.semester}` as string,
        units: s.units,
        rank: s.rank,
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

    return semesters.map(semester => {
      const entry: any = { semester };
      categories.forEach(category => {
        const subjects = regularSubjects.filter(s => s.semester === semester && matchesCategory(s.category, category));
        const subjectsForAvg = subjects.filter(s => s.rank !== null && s.rank !== undefined);
        if (subjectsForAvg.length > 0) {
          const avg = subjectsForAvg.reduce((sum, s) => sum + gradeToNumber(s.grade), 0) / subjectsForAvg.length;
          entry[category] = parseFloat(avg.toFixed(2));
        } else {
          entry[category] = null;
        }
      });
      return entry;
    });
  }, [student.section6_academic_development]);

  const isGrade5System = useMemo(() => {
    const admissionYear = student.section1_personal_info?.admissionYear
      ? parseInt(String(student.section1_personal_info.admissionYear).replace(/[^0-9]/g, ''))
      : 0;
    return admissionYear >= 2025;
  }, [student.section1_personal_info?.admissionYear]);

  // --- 모의고사 등급 추이도 데이터 ---
  const sortedExams = useMemo(() =>
    [...(student.mock_result || [])].sort((a, b) => {
      if (a.academic_year !== b.academic_year) return a.academic_year - b.academic_year;
      if (a.exam_grade !== b.exam_grade) return a.exam_grade - b.exam_grade;
      return a.exam_month - b.exam_month;
    }),
    [student.mock_result]
  );

  const mockChartSubjects = useMemo(() => {
    const set = new Set<string>();
    sortedExams.forEach(exam => {
      Object.keys(exam.subjects).forEach(s => set.add(s));
    });
    return Array.from(set).filter(s => !CHART_EXCLUDED_SUBJECTS.includes(s));
  }, [sortedExams]);

  // Initialize mock active subjects
  useMemo(() => {
    if (mockChartSubjects.length > 0 && activeMockSubjects.size === 0) {
      const coreDefaults = mockChartSubjects.filter(s =>
        ['국어', '수학', '영어', '한국사'].includes(s)
      );
      const defaults = coreDefaults.length > 0 ? coreDefaults : mockChartSubjects.slice(0, 4);
      setActiveMockSubjects(new Set([...defaults, '전과목']));
    }
  }, [mockChartSubjects]);

  const mockTrendData = useMemo(() => {
    if (sortedExams.length === 0) return null;
    return sortedExams.map(exam => {
      const entry: any = { label: `${exam.exam_grade}-${exam.exam_month}월` };
      mockChartSubjects.forEach(subject => {
        entry[subject] = exam.subjects[subject]?.grade ?? null;
      });
      // 전과목 평균
      const grades = Object.values(exam.subjects)
        .map(s => s.grade)
        .filter((g): g is number => g !== null);
      entry['전과목'] = grades.length > 0
        ? parseFloat((grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2))
        : null;
      return entry;
    });
  }, [sortedExams, mockChartSubjects]);

  const toggleSet = (item: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item); else next.add(item);
      return next;
    });
  };

  const renderToggleButtons = (
    items: string[],
    activeSet: Set<string>,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    colorFn: (item: string, idx: number) => string
  ) => (
    <div className="mb-4 flex flex-wrap gap-1.5 justify-start">
      {items.map((item, idx) => (
        <button
          key={item}
          onClick={() => toggleSet(item, setter)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border",
            activeSet.has(item)
              ? "bg-white border-gray-200 shadow-sm"
              : "bg-transparent border-transparent text-gray-400 saturate-0 opacity-60 hover:opacity-100 hover:bg-gray-50"
          )}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: colorFn(item, idx) }}
          />
          <span style={{ color: activeSet.has(item) ? '#1e293b' : 'inherit' }}>
            {item}
          </span>
        </button>
      ))}
    </div>
  );

  const StatItem = ({ icon: Icon, label, value }: { icon: any, label: string, value: string | undefined }) => (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/50 border border-slate-100/50 hover:bg-white hover:shadow-sm transition-all duration-300">
      <div className="p-2.5 rounded-lg bg-white text-brand-600 shadow-sm border border-slate-100">
        <Icon size={18} />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">{label}</p>
        <p className="text-sm font-bold text-slate-800">{value || '-'}</p>
      </div>
    </div>
  );

  const academicCategories = ['전과목', '국어', '수학', '영어', '사회', '과학'];
  const mockGradeChartSubjects = ['전과목', ...mockChartSubjects];

  return (
    <div className="space-y-6">
      {/* 기본 정보 */}
      <div className="glass-panel p-6">
        <div className="flex items-center gap-3 mb-6 pb-2 border-b border-gray-100/50">
          <div className="p-2 rounded-xl bg-brand-50 text-brand-600">
            <User size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">기본 정보</h3>
            <p className="text-xs text-slate-500 font-medium">학생의 기본 신상 정보입니다.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatItem
            icon={User}
            label="성명"
            value={student.section1_personal_info?.name || student.name}
          />
          <StatItem
            icon={School}
            label="출신 중학교"
            value={student.section1_personal_info?.middleSchool || '-'}
          />
          <StatItem
            icon={Hash}
            label="학번"
            value={student.studentNo}
          />
          <StatItem
            icon={GraduationCap}
            label="학과"
            value={student.section1_personal_info?.department || '-'}
          />
          <StatItem
            icon={Building2}
            label="출신고"
            value={student.section1_personal_info?.schoolName || '샘플고등학교'}
          />
        </div>
      </div>

      {/* 교과별 추이도 */}
      {academicTrendData && (
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100/50">
            <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
              <TrendingUp size={18} />
            </div>
            <h3 className="font-semibold text-slate-800">
              교과별 추이도
              {isGrade5System && <span className="text-xs font-normal text-slate-500 ml-2">(5등급제)</span>}
            </h3>
          </div>

          {renderToggleButtons(
            academicCategories,
            activeAcademicCategories,
            setActiveAcademicCategories,
            (item) => ACADEMIC_CATEGORY_COLORS[item] || '#64748b'
          )}

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={academicTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="semester"
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[1, isGrade5System ? 5 : 9]}
                  reversed
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
                {academicCategories.map(category => (
                  activeAcademicCategories.has(category) && (
                    <Line
                      key={category}
                      {...drawLineProps}
                      type="monotone"
                      dataKey={category}
                      stroke={ACADEMIC_CATEGORY_COLORS[category]}
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
      )}

      {/* 모의고사 등급 추이도 */}
      {mockTrendData && mockTrendData.length > 0 && (
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100/50">
            <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
              <BarChart3 size={18} />
            </div>
            <h3 className="font-semibold text-slate-800">모의고사 등급 추이도</h3>
          </div>

          {renderToggleButtons(
            mockGradeChartSubjects,
            activeMockSubjects,
            setActiveMockSubjects,
            getMockSubjectColor
          )}

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[1, 9]}
                  reversed
                  ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9]}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    border: 'none',
                    fontSize: '12px'
                  }}
                  formatter={(value: any, name: string) => [value !== null ? (typeof value === 'number' ? value.toFixed(2) : value) : '-', name]}
                />
                {mockGradeChartSubjects.map((subject, idx) => (
                  activeMockSubjects.has(subject) && (
                    <Line
                      key={subject}
                      {...drawLineProps}
                      type="monotone"
                      dataKey={subject}
                      stroke={getMockSubjectColor(subject, idx)}
                      strokeWidth={subject === '전과목' ? 3 : 2}
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
      )}
    </div>
  );
};

export default StudentSummary;
