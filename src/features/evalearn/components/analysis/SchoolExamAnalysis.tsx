import React, { useState } from 'react';
import { BarChart3, BookOpen, ClipboardList, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { ListPanel, ListItem, ChipBar, Chip } from '../common/panelChrome';
import { EvalearnStudent } from '../../types';
import { useSchoolExamData } from '../../hooks/useSchoolExamData';
import { examKey } from '../../services/schoolExamService';
import SchoolExamSummary from './schoolExam/SchoolExamSummary';
import SchoolExamWeakness from './schoolExam/SchoolExamWeakness';
import SchoolExamItemTable from './schoolExam/SchoolExamItemTable';
import SchoolExamBoxPlot from './schoolExam/SchoolExamBoxPlot';

interface Props {
  student: EvalearnStudent | null;
}

/**
 * 학교 지필평가(정기고사) 분석.
 *
 * **학생도 본인 것을 본다**(2026-09-03) — 서버 `school_exam_result_select` 가 학생을 본인
 * 행으로 제한하므로 남의 점수·석차는 애초에 오지 않는다.
 *
 * **단, 학생에게는 상대적 석차 분석을 제공하지 않는다**(2026-09-04 사용자 결정):
 *   · 요약의 "학년 내 위치"(상위 %·N명 중 M위) 타일 — 숨김
 *   · 과목 개요의 상자그림·상위·석차·분포 표 — 순위 없는 "과목별 내 점수" 목록으로 대체
 *     (이 화면이 과목을 고르는 진입점이라 통째로 없앨 수 없다. 정렬 기준도 백분위에서
 *      내 점수로 바꾼다 — **정렬 순서 자체가 석차를 드러내기 때문**이다)
 * 남기는 것: 지필 총점 · 선택형 정답률 · 학년 평균(등수를 알 수 없는 단일 기준점) ·
 * 난이도별 오답(문항 난이도이지 내 순위가 아니다) · 취약 영역 · 문항별 표.
 */
const SchoolExamAnalysis: React.FC<Props> = ({ student }) => {
  // 미리보기(admin의 학생 시점)까지 반영해야 실제로 학생이 보는 화면을 확인할 수 있다
  const { isStudentView } = useAuth();
  const {
    exams, subjects, selectedExam, selectedSubject, setSelectedExam, setSelectedSubject,
    loading, detailLoading, result, itemRows, areaStats, standardStats,
    difficultyBreakdown, summary, overview, overviewLoading,
  } = useSchoolExamData(student);

  const [weaknessTab, setWeaknessTab] = useState<'area' | 'standard'>('area');
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [wrongOnly, setWrongOnly] = useState(false);

  if (!student) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  if (exams.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center px-6">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{student.name} 학생의 학교 시험 데이터가 없습니다</p>
          <p className="text-xs mt-1 text-slate-300">
            관리 메뉴의 &lsquo;학교 시험&rsquo; 탭에서 NEIS 문항정보·학생답안 CSV를 등록하세요.
          </p>
        </div>
      </div>
    );
  }

  const toggleHighlight = (key: string) =>
    setHighlightKey((prev) => (prev === key ? null : key));

  return (
    <div className="flex h-full min-h-0">
      {/* ── 왼쪽: 과목 목록 (집단 분석과 같은 공용 껍데기) ── */}
      <ListPanel icon={BookOpen} title="과목">
        {/* 개요가 목록의 첫 줄이자 기본 화면이다. 특정 과목에서 여기로 돌아오는 길이
            항상 같은 자리에 있어야 "어디가 약한가"를 다시 묻기 쉽다. */}
        <ListItem
          active={selectedSubject == null}
          onClick={() => { setSelectedSubject(null); setHighlightKey(null); }}
          label={<span className="flex items-center gap-1.5"><BarChart3 className="h-3 w-3 shrink-0" />전체 과목</span>}
          sub="분포 비교"
        />
        {subjects.map((subject) => (
          <ListItem
            key={subject.subjectSection}
            active={selectedSubject === subject.subjectSection}
            onClick={() => { setSelectedSubject(subject.subjectSection); setHighlightKey(null); }}
            label={subject.subjectName}
            title={subject.subjectName}
            sub={<span className="tabular-nums">{subject.totalScore != null ? `${subject.totalScore.toFixed(1)}점` : '채점 전'}</span>}
          />
        ))}
      </ListPanel>

      {/* ── 오른쪽: 상세 ── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {/* 고사 선택 */}
        <ChipBar>
          {exams.map((exam) => {
            const key = examKey(exam.academicYear, exam.semester, exam.examRound);
            const isSelected = selectedExam === key;
            return (
              <Chip
                key={key}
                active={isSelected}
                onClick={() => { setSelectedExam(key); setHighlightKey(null); }}
              >
                {exam.label}
              </Chip>
            );
          })}
        </ChipBar>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 min-h-0">
          {selectedSubject == null ? (
            overviewLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-brand-500" />
              </div>
            ) : (
              <SchoolExamBoxPlot
                rows={overview}
                hideRanking={isStudentView}
                onSelectSubject={(section) => { setSelectedSubject(section); setHighlightKey(null); }}
              />
            )
          ) : detailLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-brand-500" />
            </div>
          ) : !result || !summary ? (
            <div className="text-center py-16 text-slate-400">
              <p className="text-sm">이 고사에서 해당 과목 응시 기록이 없습니다.</p>
            </div>
          ) : (
            <>
              <SchoolExamSummary summary={summary} difficultyBreakdown={difficultyBreakdown} hideRanking={isStudentView} />

              {/* 취약 영역 ↔ 성취기준 */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { setWeaknessTab('area'); setHighlightKey(null); }}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
                    weaknessTab === 'area' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  )}
                >
                  내용영역
                </button>
                <button
                  type="button"
                  onClick={() => { setWeaknessTab('standard'); setHighlightKey(null); }}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
                    weaknessTab === 'standard' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  )}
                >
                  성취기준
                </button>
                <span className="text-[10px] text-slate-400 ml-1">항목을 누르면 아래 표에서 해당 문항이 강조됩니다</span>
              </div>

              {weaknessTab === 'area' ? (
                <SchoolExamWeakness
                  title="내용영역별 오답 (학년 대비)"
                  hint="검은 선 = 학년 평균 오답률"
                  stats={areaStats}
                  selectedKey={highlightKey}
                  onSelect={toggleHighlight}
                  emptyText="내용영역 정보가 없습니다."
                />
              ) : (
                <SchoolExamWeakness
                  title="성취기준별 오답 (학년 대비)"
                  hint="검은 선 = 학년 평균 오답률"
                  stats={standardStats}
                  showDescription
                  selectedKey={highlightKey}
                  onSelect={toggleHighlight}
                  emptyText="성취기준 정보가 없습니다."
                />
              )}

              {/* 문항별 표 */}
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-slate-500">문항별 결과</p>
                <button
                  type="button"
                  onClick={() => setWrongOnly((prev) => !prev)}
                  className={cn(
                    'px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors flex items-center gap-1',
                    wrongOnly ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  )}
                >
                  <Filter className="h-3 w-3" />
                  오답만
                </button>
              </div>
              <SchoolExamItemTable
                rows={itemRows}
                highlightKey={highlightKey}
                highlightBy={weaknessTab}
                wrongOnly={wrongOnly}
              />

              {summary.descriptiveScore != null && (
                <p className="text-[10px] text-slate-400 px-1">
                  서답형 {summary.descriptiveScore.toFixed(1)}점은 총점에 포함돼 있지만, NEIS가 서답형의
                  문항별 정오를 제공하지 않아 위 표와 영역 분석에는 선택형만 반영됩니다.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SchoolExamAnalysis;
