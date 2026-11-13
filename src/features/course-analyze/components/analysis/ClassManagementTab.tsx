/**
 * 학급 관리 탭 — 담임/부장이 현재 차수의 학급 학생 선택과목을 편집.
 * 표 디자인은 ClassViewTab(글래스모피즘) 참고. 미신청자 포함 전체 명단 표시.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Users, Pencil, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeData } from '../../context';
import { useClassManagementAccess } from '../../hooks/useClassManagementAccess';
import { useCourseSelectionRoundId } from '../../hooks/useCourseSelectionRoundId';
import { useClassRoster, type RosterRow } from '../../hooks/useClassRoster';
import { useTargetGradeFilter } from '../../hooks/useTargetGradeFilter';
import { ClassSubjectEditDialog } from './ClassSubjectEditDialog';
import { TargetGradeFilter } from './TargetGradeFilter';

export function ClassManagementTab() {
  const {
    currentStudents, currentGrade, currentRound, currentAcademicYear, loadFromDatabase,
  } = useCourseAnalyzeData();
  const access = useClassManagementAccess();
  const { data: roundId } = useCourseSelectionRoundId(currentAcademicYear, currentGrade, currentRound);

  // 과목 학년 분리 필터 (1학년 신청 = 2·3학년 과목 혼재 시에만 토글 노출).
  // 표시용 필터일 뿐, 편집 다이얼로그는 항상 전체 과목을 다룬다.
  const targetGrade = useTargetGradeFilter(currentAcademicYear, currentGrade);

  // 관리 가능한 반 목록
  const manageableClasses = useMemo(() => {
    const fromData = Array.from(new Set(currentStudents.map((s) => s.class))).sort((a, b) => a - b);
    // 전체 부장/admin, 또는 현재 학년의 학년 부장 → 그 학년 전체 반
    if (access.allClasses || access.managedGrades.includes(currentGrade)) return fromData;
    return access.managedClasses
      .filter((m) => m.grade === currentGrade)
      .map((m) => m.classNum)
      .sort((a, b) => a - b);
  }, [currentStudents, access.allClasses, access.managedGrades, access.managedClasses, currentGrade]);

  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  useEffect(() => {
    if (selectedClass === null && manageableClasses.length > 0) {
      setSelectedClass(manageableClasses[0]);
    }
  }, [manageableClasses, selectedClass]);

  const { rows, isLoading } = useClassRoster(currentGrade, selectedClass, currentStudents);
  const [editRow, setEditRow] = useState<RosterRow | null>(null);

  if (access.isLoading) {
    return <div className="glass-panel p-6"><div className="py-10 text-center text-sm text-slate-400">권한 확인 중…</div></div>;
  }
  if (!access.canManage) {
    return (
      <div className="glass-panel p-6">
        <div className="py-10 text-center">
          <ShieldAlert className="w-6 h-6 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium">학급 관리 권한이 없습니다</p>
          <p className="text-xs text-slate-400 mt-1">담임 또는 부장 교사만 사용할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 space-y-6">
      <div className="flex items-start gap-3 pb-4 border-b border-slate-100/50">
        <div className="p-2 rounded-xl bg-brand-50 text-brand-600 shrink-0"><Users size={20} /></div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-800 tracking-tight">학급 관리</h3>
          <p className="text-sm text-slate-500 font-medium mt-0.5">
            {currentGrade}학년 · {currentRound}차 · 학급 학생의 선택과목을 직접 추가·수정합니다
            {access.isHeadTeacher && <span className="ml-1 text-brand-500">(부장 — 전체 반)</span>}
          </p>
        </div>
      </div>

      {roundId == null && (
        <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200/60 text-xs text-amber-700">
          이 차수에 연결된 신청 라운드가 없어 편집할 수 없습니다. (신청 학년도 {currentAcademicYear != null ? currentAcademicYear - 1 : '?'} / {currentGrade}학년 / {currentRound}차)
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {manageableClasses.map((classNum) => (
          <button
            key={classNum}
            onClick={() => setSelectedClass(classNum)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-bold transition-all',
              selectedClass === classNum
                ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm'
                : 'bg-white/60 hover:bg-white/80 text-slate-600 border border-white/40',
            )}
          >
            {classNum}반
          </button>
        ))}
      </div>

      {/* 과목 학년 분리 토글 — 표의 선택과목 뱃지를 해당 학년 과목만 보이도록 필터 */}
      {targetGrade.hasMultiple && (
        <TargetGradeFilter
          targetGrades={targetGrade.targetGrades}
          selected={targetGrade.selected}
          onChange={targetGrade.setSelected}
        />
      )}

      {selectedClass !== null && (
        <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/60">
                  <th className="px-4 py-3 text-center font-bold text-slate-600 w-14">번호</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">학생명</th>
                  <th className="px-4 py-3 text-center font-bold text-slate-600 w-20">신청</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">1학기</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">2학기</th>
                  <th className="px-4 py-3 text-center font-bold text-slate-600 w-20">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">명단 불러오는 중…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">학생이 없습니다</td></tr>
                ) : (
                  rows.map((r, idx) => {
                    // 표시용 과목 목록은 과목 학년 필터를 통과한 것만 (단일 학년 라운드면 전부 통과)
                    const sem1 = r.semester1.filter(targetGrade.matches);
                    const sem2 = r.semester2.filter(targetGrade.matches);
                    return (
                    <tr key={`${r.studentCode ?? r.name}-${idx}`} className={cn(idx % 2 === 0 ? 'bg-white/50' : 'bg-slate-50/30', 'hover:bg-brand-50/30')}>
                      <td className="px-4 py-3 text-center font-bold text-slate-500">{r.number}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{r.name}</td>
                      <td className="px-4 py-3 text-center">
                        {r.hasSubmission ? (
                          <span className="px-2 py-0.5 text-xs font-bold bg-emerald-50 text-emerald-600 rounded-full">신청</span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-400 rounded-full">미신청</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {sem1.length ? sem1.map((s) => (
                            <span key={s} className="px-2 py-0.5 text-xs bg-blue-50/80 text-blue-700 border border-blue-200/60 rounded-full">{s}</span>
                          )) : <span className="text-xs text-slate-400">없음</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {sem2.length ? sem2.map((s) => (
                            <span key={s} className="px-2 py-0.5 text-xs bg-green-50/80 text-green-700 border border-green-200/60 rounded-full">{s}</span>
                          )) : <span className="text-xs text-slate-400">없음</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={roundId == null || !r.studentCode}
                          onClick={() => setEditRow(r)}
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all',
                            roundId == null || !r.studentCode
                              ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                              : 'bg-brand-50 text-brand-600 hover:bg-brand-100',
                          )}
                          title={!r.studentCode ? '학생 코드 미연결' : roundId == null ? '편집 불가 차수' : '선택과목 편집'}
                        >
                          <Pencil size={12} />편집
                        </button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editRow && roundId && (
        <ClassSubjectEditDialog
          open={!!editRow}
          onClose={() => setEditRow(null)}
          roundId={roundId}
          row={editRow}
          onSaved={() => {
            if (currentAcademicYear != null) void loadFromDatabase({ academicYear: currentAcademicYear });
          }}
        />
      )}
    </div>
  );
}
