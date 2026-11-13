import { useState } from 'react';
import { GraduationCap, User, ShieldCheck, Users, HelpCircle } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useStudentPicture } from '@/features/rescue-note/hooks/useStudentPictures';
import { WishlistGuideDialog } from '../guide/WishlistGuideDialog';

interface SelectedStudent {
  code: string;
  name: string;
  grade: number;
  classNum: number;
  numberInClass?: number | null;
}

interface Props {
  selectedStudent: SelectedStudent | null;
  /** 학급 테이블 보기 중일 때 학급 배지 표시 (학생 미선택 시). */
  selectedClass?: { grade: number; classNum: number } | null;
  /** admin 이 학생을 대신해 편집 가능한 모드인지 (우측 안내 배지 표시). */
  proxyEditing?: boolean;
}

/**
 * 수시 지원 — 교사/admin 뷰 상단 글래스 헤더.
 * rescue-note Header 의 3분할(좌 브랜드·중 학생배지·우 액션) 디자인을 차용하되,
 * 이 기능은 학급 대시보드가 없어 중앙은 학생 배지/placeholder 만, 우측은
 * admin 대리 편집 안내만 둔다.
 */
export function Header({ selectedStudent, selectedClass, proxyEditing = false }: Props) {
  const { picture } = useStudentPicture(selectedStudent?.code ?? null);
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <header className="px-5 py-2.5 bg-white/60 backdrop-blur-md border-b border-white/20 relative z-40 supports-[backdrop-filter]:bg-white/60 shrink-0">
      {/* min-h-[46px] = evalog 헤더의 학생 pill 높이(아바타 32px + py-1.5 + border) — 학생 미선택/학급 상태에서도 헤더 높이 일치용 */}
      <div className="flex items-center justify-between min-h-[46px] w-full">
        {/* 좌: 브랜드 배지 + 타이틀 */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="bg-gradient-to-r from-brand-600 to-brand-500 text-white px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm tracking-wide flex items-center gap-1.5">
            <GraduationCap className="w-3 h-3" aria-hidden />
            수시 지원
          </span>
          <h1 className="text-slate-800 text-sm font-bold tracking-tight">수시 지원 학교 관리</h1>
        </div>

        {/* 중앙: 선택된 학생 배지 */}
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
            <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm px-4 py-1.5 rounded-full border border-white/40 shadow-sm">
              <Users className="w-4 h-4 text-brand-500 shrink-0" aria-hidden />
              <span className="text-sm font-bold text-slate-800 tracking-tight whitespace-nowrap">
                {selectedClass.grade}학년 {selectedClass.classNum}반
              </span>
              <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">지원 현황</span>
            </div>
          ) : (
            <div className="h-9 flex items-center text-slate-400 text-xs font-medium whitespace-nowrap">
              학급 또는 학생을 선택하세요
            </div>
          )}
        </div>

        {/* 우: 사용 방법 + admin 대리 편집 안내.
            사용 방법은 **액션 묶음의 맨 왼쪽**이 늘 이 자리다(2026-09-04 사용자 규약). */}
        <div className="flex items-center gap-2 shrink-0 justify-end">
          <button
            onClick={() => setGuideOpen(true)}
            title="사용 방법"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition-all hover:bg-brand-50 hover:text-brand-600"
          >
            <HelpCircle className="w-3.5 h-3.5" aria-hidden />
            <span className="hidden lg:inline whitespace-nowrap">사용 방법</span>
          </button>
          {proxyEditing && selectedStudent && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg whitespace-nowrap">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
              대신 신청 모드
            </span>
          )}
        </div>
      </div>
      <WishlistGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </header>
  );
}
