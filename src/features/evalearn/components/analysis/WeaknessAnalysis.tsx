import React, { useEffect, useMemo } from 'react';
import { TrendingDown } from 'lucide-react';
import { EvalearnStudent } from '../../types';
import { useWeaknessData } from '../../hooks/useWeaknessData';
import { TimelinePoint } from '../../utils/weaknessScore';
import { DifficultyBand, DIFFICULTY_ORDER } from '../../utils/difficulty';
import WeaknessSummaryCards from './weakness/WeaknessSummaryCards';
import WeaknessStackedBar from './weakness/WeaknessStackedBar';
import WeaknessDrillDown from './weakness/WeaknessDrillDown';
import DifficultyTimelineChart from './weakness/DifficultyTimelineChart';
import { cn } from '@/lib/utils';

interface OverallBandSlot { wrong: number; total: number }
interface OverallSlot {
  examLabel: string;
  year: number;
  month: number;
  wrong: number;
  total: number;
  byBand: Record<DifficultyBand, OverallBandSlot>;
}

function emptyBands(): Record<DifficultyBand, OverallBandSlot> {
  return {
    '상': { wrong: 0, total: 0 },
    '중': { wrong: 0, total: 0 },
    '하': { wrong: 0, total: 0 },
    '미분류': { wrong: 0, total: 0 },
  };
}

function parseExamKey(examKey: string): { year: number; month: number } {
  const [y, m] = examKey.split('-').map(Number);
  return { year: y || 0, month: m || 0 };
}

interface WeaknessAnalysisProps {
  student: EvalearnStudent | null;
}

const MIN_TOTAL_FOR_STRONG = 3; // 강점 후보는 출제 ≥ 3 영역만

const WeaknessAnalysis: React.FC<WeaknessAnalysisProps> = ({ student }) => {
  const {
    allSubjects,
    selectedSubject,
    setSelectedSubject,
    availableGrades,
    selectedGrade,
    setSelectedGrade,
    categories,
    loading,
    selectedCategory,
    filteredProblems,
    handleBarClick,
  } = useWeaknessData(student);

  useEffect(() => {
    if (allSubjects.length > 0 && !selectedSubject) {
      setSelectedSubject(allSubjects[0]);
    }
  }, [allSubjects, selectedSubject, setSelectedSubject]);

  useEffect(() => {
    if (selectedSubject) setSelectedSubject(selectedSubject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrade]);

  const weakTop3 = useMemo(
    () => categories.filter((c) => c.score > 0).slice(0, 3),
    [categories]
  );

  const strongTop3 = useMemo(
    () =>
      [...categories]
        .filter((c) => c.totalCount >= MIN_TOTAL_FOR_STRONG)
        .sort((a, b) => a.rate - b.rate)
        .slice(0, 3),
    [categories]
  );

  const selectedStat = useMemo(() => {
    if (!selectedCategory) return null;
    const [major, sub] = selectedCategory.split('|');
    return categories.find(
      (c) => c.majorCategory === major && c.subCategory === sub
    ) ?? null;
  }, [selectedCategory, categories]);

  const overallTimeline: TimelinePoint[] = useMemo(() => {
    const byKey = new Map<string, OverallSlot>();
    for (const cat of categories) {
      for (const tp of cat.timeline) {
        let slot = byKey.get(tp.examKey);
        if (!slot) {
          const { year, month } = parseExamKey(tp.examKey);
          slot = {
            examLabel: tp.examLabel,
            year, month,
            wrong: 0, total: 0,
            byBand: emptyBands(),
          };
          byKey.set(tp.examKey, slot);
        }
        slot.wrong += tp.wrongCount;
        slot.total += tp.totalCount;
        for (const band of DIFFICULTY_ORDER) {
          slot.byBand[band].wrong += tp.byDifficulty[band].wrongCount;
          slot.byBand[band].total += tp.byDifficulty[band].totalCount;
        }
      }
    }
    return Array.from(byKey.entries())
      .sort((a, b) => (a[1].year - b[1].year) * 12 + (a[1].month - b[1].month))
      .map(([examKey, s]) => {
        const byDifficulty = {} as TimelinePoint['byDifficulty'];
        for (const band of DIFFICULTY_ORDER) {
          const b = s.byBand[band];
          byDifficulty[band] = {
            wrongRate: b.total > 0 ? Math.round((b.wrong / b.total) * 100) : null,
            wrongCount: b.wrong,
            totalCount: b.total,
          };
        }
        return {
          examKey,
          examLabel: s.examLabel,
          wrongRate: s.total > 0 ? Math.round((s.wrong / s.total) * 100) : 0,
          wrongCount: s.wrong,
          totalCount: s.total,
          byDifficulty,
        };
      });
  }, [categories]);

  const hasOnlyUnknown = useMemo(() => {
    if (categories.length === 0) return false;
    return categories.every(
      (c) =>
        c.byDifficulty['상'].total === 0 &&
        c.byDifficulty['중'].total === 0 &&
        c.byDifficulty['하'].total === 0
    );
  }, [categories]);

  if (!student) return null;

  if (!student.mock_marking || student.mock_marking.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <TrendingDown className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">마킹 데이터가 없습니다</p>
        </div>
      </div>
    );
  }

  const filteredExamCount = selectedGrade != null
    ? student.mock_marking.filter((e) => e.exam_grade === selectedGrade).length
    : student.mock_marking.length;

  return (
    <div className="flex flex-col h-full">
      {/* 학년 + 과목 토글 */}
      <div className="px-4 py-2.5 border-b border-gray-100 bg-white shrink-0 space-y-2">
        {availableGrades.length > 1 && (
          <div className="flex gap-1.5 items-center">
            <span className="text-[10px] text-slate-400 shrink-0">학년:</span>
            <button
              onClick={() => setSelectedGrade(null)}
              className={cn(
                'px-2 py-1 rounded text-[11px] font-medium transition-all border',
                selectedGrade === null
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'bg-white text-slate-500 border-gray-200 hover:bg-slate-50'
              )}
            >
              전체
            </button>
            {availableGrades.map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGrade(g)}
                className={cn(
                  'px-2 py-1 rounded text-[11px] font-medium transition-all border',
                  selectedGrade === g
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-slate-500 border-gray-200 hover:bg-slate-50'
                )}
              >
                {g}학년
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1.5 items-center flex-wrap">
          {allSubjects.map((subj) => (
            <button
              key={subj}
              onClick={() => setSelectedSubject(subj)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                selectedSubject === subj
                  ? 'bg-brand-50 text-brand-700 border-brand-200 shadow-sm'
                  : 'bg-white text-slate-600 border-gray-200 hover:bg-slate-50 hover:border-gray-300'
              )}
            >
              {subj}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-slate-400">{filteredExamCount}회차 분석</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500"></div>
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center text-slate-400 text-xs p-8">
            {selectedSubject ? '분석 데이터가 없습니다' : '과목을 선택하세요'}
          </div>
        ) : (
          <>
            <WeaknessSummaryCards
              weakTop3={weakTop3}
              strongTop3={strongTop3}
              onCardClick={(major, sub) => handleBarClick(sub, major)}
            />

            {hasOnlyUnknown && (
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                이 과목의 문항 정답률 데이터가 아직 입력되지 않았습니다. 막대의 회색 = 미분류.
              </div>
            )}

            <WeaknessStackedBar
              categories={categories}
              selectedCategory={selectedCategory}
              onBarClick={handleBarClick}
            />

            {selectedCategory == null && overallTimeline.length > 0 && (
              <div className="mt-4">
                <DifficultyTimelineChart
                  timeline={overallTimeline}
                  title="과목 전체 회차별 오답률 추이 (난이도별)"
                />
              </div>
            )}

            <WeaknessDrillDown
              selected={selectedStat}
              problems={filteredProblems}
              onClose={() => selectedCategory && handleBarClick(
                selectedCategory.split('|')[1],
                selectedCategory.split('|')[0]
              )}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default WeaknessAnalysis;
