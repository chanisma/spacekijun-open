import React, { useState } from 'react';
import { User, Settings, Users } from 'lucide-react';
import { EvalearnStudent } from '../../types';
import { AdminDialog } from '../admin/AdminDialog';
import { useAuth } from '@/components/auth/AuthProvider';

interface HeaderProps {
  student: EvalearnStudent | null;
  studentCount: number;
  /** 학년/학급 분석 중이면 그 대상. 있으면 학생 대신 이쪽을 보여준다. */
  cohort?: { grade: number; classNum: number | null } | null;
}

const Header: React.FC<HeaderProps> = ({ student, studentCount, cohort = null }) => {
  const { isAdmin } = useAuth();
  const [showAdminDialog, setShowAdminDialog] = useState(false);

  return (
    <>
      <header className="px-5 py-2.5 bg-white/60 backdrop-blur-md border-b border-white/20 relative z-40 supports-[backdrop-filter]:bg-white/60 min-w-max">
        <div className="flex items-center justify-between h-full w-full">
          {/* 왼쪽 섹션: 타이틀 */}
          <div className="flex items-center gap-6 shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-brand-600 to-brand-500 text-white px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm tracking-wide whitespace-nowrap">
                EVALEARN
              </div>
              <div className="flex flex-col">
                <span className="text-slate-800 text-sm font-bold tracking-tight whitespace-nowrap">
                  시험 결과 분석
                </span>
              </div>
            </div>
          </div>

          {/* 중앙 섹션: 분석 대상 — 집단(학년/반)이 선택돼 있으면 학생보다 우선 */}
          <div className="flex-1 flex justify-center px-4">
            {cohort ? (
              <div className="flex items-center gap-3 bg-white/50 backdrop-blur-sm px-5 py-1.5 rounded-full border border-white/40 shadow-sm max-w-full overflow-hidden">
                <div className="shrink-0">
                  <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center border border-brand-100 text-brand-500">
                    <Users size={16} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 overflow-hidden">
                  <span className="text-base font-bold text-slate-800 tracking-tight whitespace-nowrap">
                    {cohort.classNum == null ? `${cohort.grade}학년 전체` : `${cohort.grade}학년 ${cohort.classNum}반`}
                  </span>
                  <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                    {cohort.classNum == null ? '학년 분석' : '학급 분석'}
                  </span>
                </div>
              </div>
            ) : student ? (
              <div className="flex items-center gap-3 bg-white/50 backdrop-blur-sm px-5 py-1.5 rounded-full border border-white/40 shadow-sm transition-all hover:bg-white/80 max-w-full overflow-hidden">
                <div className="shrink-0">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-400">
                    <User size={16} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 overflow-hidden">
                  <span className="text-base font-bold text-slate-800 tracking-tight whitespace-nowrap">
                    {student.name}
                  </span>
                  <span className="text-xs font-medium text-slate-500 font-mono whitespace-nowrap">
                    {student.grade}-{student.classNum} {student.number}번
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-9 flex items-center text-slate-400 text-xs font-medium whitespace-nowrap">
                학생 · 학년 · 학급 중 분석할 대상을 선택해주세요
              </div>
            )}
          </div>

          {/* 오른쪽 섹션: 학생 수 + Admin */}
          <div className="flex items-center gap-4 shrink-0 justify-end">
            {studentCount > 0 && (
              <div className="flex items-center gap-3 bg-white/50 px-3 py-1 rounded-full border border-white/40 shadow-sm">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-medium scale-90 origin-right whitespace-nowrap">학생</span>
                  <span className="font-bold text-brand-600">{studentCount}</span>
                  <span className="text-slate-400 text-[10px]">명</span>
                </div>
              </div>
            )}

            {isAdmin && (
              <>
                <div className="w-px h-3 bg-slate-200 mx-1 shrink-0"></div>

                <button
                  onClick={() => setShowAdminDialog(true)}
                  className="text-slate-500 hover:text-slate-800 text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1"
                >
                  <Settings size={14} />
                  Admin
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {isAdmin && (
        <AdminDialog
          open={showAdminDialog}
          onOpenChange={setShowAdminDialog}
        />
      )}
    </>
  );
};

export default Header;
