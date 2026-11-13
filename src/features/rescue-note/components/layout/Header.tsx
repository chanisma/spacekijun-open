import { ShieldAlert, LayoutDashboard, NotebookPen, User, Users, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useStudentPicture } from '../../hooks/useStudentPictures';

interface Props {
  selectedStudent:
    | { code: string; name: string; grade: number; classNum: number; numberInClass?: number }
    | null;
  /** Class summary shown in the header when a class (but no student) is selected. */
  selectedClass?: {
    grade: number;
    classNum: number;
    total: number;
    crisisCount: number;
    homeroomTeacher?: string | null;
  } | null;
  showDashboardLink?: boolean;
  /** If provided, the dashboard button triggers in-page transition instead of navigating. */
  onShowDashboard?: () => void;
  /** If provided, the 상담 일지 button triggers in-page transition. */
  onShowMyNotes?: () => void;
  /** Active view in the main panel (used to highlight the active button). */
  activeView?: 'dashboard' | 'my-notes' | null;
}

export function Header({ selectedStudent, selectedClass, showDashboardLink = true, onShowDashboard, onShowMyNotes, activeView }: Props) {
  const { picture } = useStudentPicture(selectedStudent?.code ?? null);

  const baseCls = 'flex items-center gap-1.5 p-1.5 rounded-lg transition-all text-xs font-medium px-3';
  const activeCls = 'text-brand-700 bg-brand-50 border border-brand-100';
  const inactiveCls = 'text-slate-400 hover:text-brand-600 hover:bg-brand-50';

  const DashboardBtn = () => {
    const cls = `${baseCls} ${activeView === 'dashboard' ? activeCls : inactiveCls}`;
    if (onShowDashboard) {
      return (
        <button onClick={onShowDashboard} className={cls} type="button">
          <LayoutDashboard className="w-4 h-4" />
          위기 관리 현황
        </button>
      );
    }
    return (
      <Link to="/rescue-note/dashboard" className={cls}>
        <LayoutDashboard className="w-4 h-4" />
        위기 관리 현황
      </Link>
    );
  };

  const MyNotesBtn = () => {
    if (!onShowMyNotes) return null;
    const cls = `${baseCls} ${activeView === 'my-notes' ? activeCls : inactiveCls}`;
    return (
      <button onClick={onShowMyNotes} className={cls} type="button">
        <NotebookPen className="w-4 h-4" />
        상담 일지
      </button>
    );
  };

  return (
    <header className="px-5 py-2.5 bg-white/60 backdrop-blur-md border-b border-white/20 relative z-40 supports-[backdrop-filter]:bg-white/60 shrink-0">
      <div className="flex items-center justify-between h-full w-full">
        {/* 왼쪽 섹션: 로고 + 타이틀 */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="bg-gradient-to-r from-brand-600 to-brand-500 text-white px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm tracking-wide flex items-center gap-1.5">
            <ShieldAlert className="w-3 h-3" aria-hidden />
            위기 노트
          </span>
          <h1 className="text-slate-800 text-sm font-bold tracking-tight">위기 관리</h1>
        </div>

        {/* 중앙 섹션: 선택된 학생 배지 */}
        <div className="flex-1 flex justify-center px-4">
          {selectedStudent ? (
            <div className="flex items-center gap-2.5 bg-white/50 backdrop-blur-sm pl-1.5 pr-5 py-1.5 rounded-full border border-white/40 shadow-sm transition-all hover:bg-white/80 max-w-full overflow-hidden">
              <div className="shrink-0">
                {picture ? (
                  <HoverCard openDelay={300}>
                    <HoverCardTrigger asChild>
                      <img
                        src={picture}
                        alt={selectedStudent.name}
                        className="w-8 h-8 rounded-full object-cover border border-slate-200 shadow-sm cursor-pointer"
                      />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-auto p-2" sideOffset={10}>
                      <img
                        src={picture}
                        alt={selectedStudent.name}
                        className="w-48 h-48 rounded-md object-cover border border-slate-100 shadow-sm"
                      />
                    </HoverCardContent>
                  </HoverCard>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-400">
                    <User size={16} aria-hidden />
                  </div>
                )}
              </div>
              <div className="flex items-baseline gap-2 overflow-hidden">
                <span className="text-sm font-bold text-slate-800 tracking-tight whitespace-nowrap">
                  {selectedStudent.name}
                </span>
                <span className="text-[11px] font-medium text-slate-500 font-mono whitespace-nowrap">
                  {selectedStudent.grade}-{selectedStudent.classNum}
                  {selectedStudent.numberInClass != null && (
                    <span className="text-slate-400"> #{selectedStudent.numberInClass}</span>
                  )}
                </span>
              </div>
            </div>
          ) : selectedClass ? (
            <div className="flex items-center gap-2.5 bg-white/50 backdrop-blur-sm px-4 py-1.5 rounded-full border border-white/40 shadow-sm transition-all hover:bg-white/80 max-w-full overflow-hidden">
              <Users className="w-4 h-4 text-brand-500 shrink-0" aria-hidden />
              <span className="text-sm font-bold text-slate-800 tracking-tight whitespace-nowrap">
                {selectedClass.grade}학년 {selectedClass.classNum}반
              </span>
              <span className="w-px h-3.5 bg-slate-200 shrink-0" />
              <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                총 <span className="font-semibold text-slate-700">{selectedClass.total}</span>명
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 whitespace-nowrap">
                <AlertTriangle className="w-3 h-3" aria-hidden />
                위기 <span className="font-semibold">{selectedClass.crisisCount}</span>명
              </span>
              {selectedClass.homeroomTeacher && (
                <>
                  <span className="w-px h-3.5 bg-slate-200 shrink-0" />
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 whitespace-nowrap">
                    <User className="w-3 h-3 text-slate-400" aria-hidden />
                    담임 <span className="font-semibold text-slate-700">{selectedClass.homeroomTeacher}</span>
                  </span>
                </>
              )}
            </div>
          ) : (
            <div className="h-9 flex items-center text-slate-400 text-xs font-medium whitespace-nowrap">
              학생을 선택하세요
            </div>
          )}
        </div>

        {/* 오른쪽 섹션: 대시보드 + 상담 일지 버튼 */}
        <div className="flex items-center gap-2 shrink-0 justify-end">
          {showDashboardLink && <DashboardBtn />}
          <MyNotesBtn />
        </div>
      </div>
    </header>
  );
}
