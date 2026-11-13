import { useMemo } from 'react';
import { User, GraduationCap, TrendingUp } from 'lucide-react';
import { useClassWishlist } from '../hooks/useWishlist';
import { useStudentPictures } from '@/features/rescue-note/hooks/useStudentPictures';
import { TRACK_SHORT_LABELS } from '../types';

interface Props {
  grade: number;
  classNum: number;
  onSelectStudent: (code: string) => void;
}

function fmt(n: number | null, suffix = ''): string {
  return n == null || !Number.isFinite(n) ? '–' : `${n}${suffix}`;
}

/**
 * 학급 전체 수시 지원 현황 테이블. 위기노트 StudentRoster 의 글래스모피즘 테이블
 * 디자인을 차용 (border-separate 행 pill, hover, 행 클릭 → 학생 카드).
 * 행=학생, "지원 목록" 셀에 지원 대학들을 칩으로 나열 (한 학생 여러 지원).
 */
export function ClassWishlistTable({ grade, classNum, onSelectStudent }: Props) {
  const q = useClassWishlist(grade, classNum);
  const students = q.data ?? [];

  const codes = useMemo(() => students.map((s) => s.studentCode), [students]);
  const picturesQ = useStudentPictures(codes);

  const appliedCount = students.filter((s) => s.applications.length > 0).length;
  const totalApps = students.reduce((sum, s) => sum + s.applications.length, 0);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <GraduationCap className="h-5 w-5 text-brand-500" />
        <h1 className="text-lg font-bold text-slate-800">{grade}학년 {classNum}반 수시 지원 현황</h1>
        <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
          총 {students.length}명 · 지원 {appliedCount}명 · {totalApps}건
        </span>
      </div>

      {q.isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">불러오는 중...</div>
      ) : q.isError ? (
        <div className="text-center py-16 text-red-400 text-sm">불러올 수 없습니다.</div>
      ) : students.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">학생이 없습니다.</div>
      ) : (
        <div className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm border-separate border-spacing-y-1 px-3 pt-1 pb-2">
            <thead>
              <tr className="bg-slate-50/90 backdrop-blur">
                <th className="py-2 px-3 text-xs font-semibold text-slate-500 text-center rounded-l-lg w-12">번호</th>
                <th className="py-2 px-3 text-xs font-semibold text-slate-500 text-left w-40">이름</th>
                <th className="py-2 px-3 text-xs font-semibold text-slate-500 text-left">지원 목록</th>
                <th className="py-2 px-3 text-xs font-semibold text-slate-500 text-right rounded-r-lg w-16">건수</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const picture = picturesQ.data?.[s.studentCode] ?? null;
                return (
                  <tr
                    key={s.studentCode}
                    className="bg-white/40 hover:bg-white/80 hover:shadow-sm cursor-pointer transition-all"
                    onClick={() => onSelectStudent(s.studentCode)}
                  >
                    <td className="py-2.5 px-3 text-center text-xs font-mono font-medium text-slate-500 rounded-l-lg align-top">
                      {s.numberInClass ?? ''}
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <div className="flex items-center gap-2">
                        {picture ? (
                          <img src={picture} alt={s.name} className="w-8 h-8 rounded-full object-cover border border-slate-200 shadow-sm shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-400 shrink-0">
                            <User size={14} aria-hidden />
                          </div>
                        )}
                        <span className="font-bold text-slate-800 text-xs tracking-tight">{s.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      {s.applications.length === 0 ? (
                        <span className="text-xs text-slate-300">— 미지원</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {s.applications.map((a) => (
                            <span
                              key={a.wishlistId}
                              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-white/70"
                              title={a.admissionName ?? undefined}
                            >
                              <span className={`text-[9px] font-bold px-1 rounded ${
                                a.track === 'gyogwa' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                              }`}>
                                {TRACK_SHORT_LABELS[a.track]}
                              </span>
                              <span className="font-semibold text-slate-700">{a.university}</span>
                              {a.department && <span className="text-slate-500">{a.department}</span>}
                              {a.grade70 != null && (
                                <span className="text-slate-400">컷{fmt(a.grade70)}</span>
                              )}
                              {a.competition2026 != null && (
                                <span className="inline-flex items-center text-slate-400">
                                  <TrendingUp className="h-2.5 w-2.5" />{fmt(a.competition2026, ':1')}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-xs font-medium text-slate-600 rounded-r-lg align-top">
                      {s.applications.length || '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
