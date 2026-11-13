import React, { useEffect, useState } from 'react';
import { User, Settings, Printer, HelpCircle } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Student } from '../../types';
import { AdminDialog } from '../admin/AdminDialog';
import { EvalogGuideDialog } from '../guide/EvalogGuideDialog';
import PrintSelectDialog from '../print/PrintSelectDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

interface HeaderProps {
  evaluationProgress: {
    completed: number;
    total: number;
  };
  student?: Student | null;
  onBatchAddStudents?: (students: Student[]) => void;
}

const Header: React.FC<HeaderProps> = ({ evaluationProgress, student, onBatchAddStudents }) => {
  const progressPercentage = (evaluationProgress.completed / evaluationProgress.total) * 100 || 0;
  const { isAdmin } = useAuth();
  const [showAdminDialog, setShowAdminDialog] = React.useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  useEffect(() => {
    setProfileImage(null);

    const fetchProfileImage = async () => {
      if (!student?.studentId) return;

      try {
        // resource 테이블에서 meta->>id 가 student.studentId 와 일치하는 항목 찾기
        // Note: Supabase JS library handles JSONB filtering with arrow operators in string
        const { data, error } = await supabase
          .from('resource')
          .select('meta')
          .eq('type', 'student')
          // JSON path syntax for PostgREST: col->key->>key
          // We assume meta is a JSONB column. 
          // .eq('meta->>id', student.studentId) is standard but requires type casting often.
          // Let's try explicit filter syntax if simple eq fails, but eq usually works for text casting.
          // However, for safety/compatibility with this specific codebase setup:
          .contains('meta', { id: student.studentId })
          .maybeSingle();

        if (data?.meta && (data.meta as any).picture) {
          setProfileImage((data.meta as any).picture);
        }
      } catch (error) {
        console.error('Failed to fetch profile image:', error);
      }
    };

    if (student) {
      fetchProfileImage();
    }
  }, [student]);

  return (
    <>
      <header className="px-5 py-2.5 bg-white/60 backdrop-blur-md border-b border-white/20 relative z-40 supports-[backdrop-filter]:bg-white/60 min-w-max">
        <div className="flex items-center justify-between h-full w-full">
          {/* 왼쪽 섹션: 타이틀 */}
          <div className="flex items-center gap-6 shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-brand-600 to-brand-500 text-white px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm tracking-wide whitespace-nowrap">
                EVALOG
              </div>
              <div className="flex flex-col">
                <span className="text-slate-800 text-sm font-bold tracking-tight whitespace-nowrap">
                  생활기록부 도우미
                </span>
              </div>
            </div>
          </div>

          {/* 중앙 섹션: 학생 정보 */}
          <div className="flex-1 flex justify-center px-4">
            {student ? (
              <div className="flex items-center gap-3 bg-white/50 backdrop-blur-sm px-5 py-1.5 rounded-full border border-white/40 shadow-sm transition-all hover:bg-white/80 max-w-full overflow-hidden">
                <div className="shrink-0">
                  {profileImage ? (
                    <HoverCard openDelay={300}>
                      <HoverCardTrigger asChild>
                        <img
                          src={profileImage}
                          alt={student.name}
                          className="w-8 h-8 rounded-full object-cover border border-slate-200 shadow-sm cursor-pointer"
                        />
                      </HoverCardTrigger>
                      <HoverCardContent className="w-auto p-2" sideOffset={10}>
                        <img
                          src={profileImage}
                          alt={student.name}
                          className="w-48 h-48 rounded-md object-cover border border-slate-100 shadow-sm"
                        />
                      </HoverCardContent>
                    </HoverCard>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-400">
                      <User size={16} />
                    </div>
                  )}
                </div>
                <div className="flex items-baseline gap-2 overflow-hidden">
                  <span className="text-base font-bold text-slate-800 tracking-tight whitespace-nowrap">{student.name}</span>
                  <span className="text-xs font-medium text-slate-500 font-mono whitespace-nowrap">{student.studentNo}</span>
                </div>
              </div>
            ) : (
              <div className="h-9 flex items-center text-slate-400 text-xs font-medium whitespace-nowrap">
                분석할 학생을 선택해주세요
              </div>
            )}
          </div>

          {/* 오른쪽 섹션: 정보 */}
          <div className="flex items-center gap-4 shrink-0 justify-end">
            {/* 사용 방법 — 액션 묶음의 **맨 왼쪽**이 늘 이 자리다(2026-09-04 사용자 규약).
                이 버튼 왼쪽에는 아무 버튼도 두지 않는다. 처음 온 사람만 필요하므로
                무게는 낮추되(ghost) 자리는 고정한다. */}
            <button
              onClick={() => setShowGuide(true)}
              title="사용 방법"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition-all hover:bg-brand-50 hover:text-brand-600"
            >
              <HelpCircle size={14} />
              <span className="hidden lg:inline whitespace-nowrap">사용 방법</span>
            </button>

            {/* 인쇄 버튼 */}
            {student && (
              <button
                onClick={() => setShowPrintDialog(true)}
                title="선택 인쇄"
                className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-all"
              >
                <Printer size={16} />
              </button>
            )}

            {/* 진행률 카드 */}
            <div className="flex items-center gap-3 bg-white/50 px-3 py-1 rounded-full border border-white/40 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium scale-90 origin-right whitespace-nowrap">평가현황</span>
                <div className="flex items-baseline gap-0.5 whitespace-nowrap">
                  <span className="font-bold text-brand-600">{evaluationProgress.completed}</span>
                  <span className="text-slate-400 text-[10px]">/</span>
                  <span className="text-slate-600 text-[10px]">{evaluationProgress.total}</span>
                </div>
              </div>

              <div className="w-px h-2.5 bg-slate-200 shrink-0"></div>

              <div className="flex items-center gap-2 w-[80px]">
                <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-brand-600 w-6 text-right shrink-0">{progressPercentage.toFixed(0)}%</span>
              </div>
            </div>

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
      <EvalogGuideDialog open={showGuide} onOpenChange={setShowGuide} />
      {isAdmin && (
        <AdminDialog
          open={showAdminDialog}
          onOpenChange={setShowAdminDialog}
          onBatchAddStudents={onBatchAddStudents}
        />
      )}
      {student && (
        <PrintSelectDialog
          open={showPrintDialog}
          onOpenChange={setShowPrintDialog}
          student={student}
        />
      )}
    </>
  );
};

export default Header;