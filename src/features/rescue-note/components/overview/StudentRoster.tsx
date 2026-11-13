import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, User } from 'lucide-react';
import { StatusBadge } from '../shared/StatusBadge';
import { TagBadge } from '../shared/TagBadge';
import { useTagDefinitions } from '../../hooks/useTagDefinitions';
import { useStudentPictures } from '../../hooks/useStudentPictures';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { CrisisDashboardRow } from '../../services/rescueRoster';

interface Props { rows: CrisisDashboardRow[]; }

const PAGE_SIZE = 20;

export function StudentRoster({ rows }: Props) {
  const navigate = useNavigate();
  const defsQ = useTagDefinitions();
  const defByKey = new Map((defsQ.data ?? []).map((d) => [d.key, d]));

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  // 필터 등으로 rows가 바뀌면 1페이지로 리셋 (빈 페이지에 갇히지 않도록)
  useEffect(() => { setPage(1); }, [rows]);

  const pageRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page]
  );

  // 현재 페이지에 보이는 학생 사진만 배치 조회
  const pageCodes = useMemo(() => pageRows.map((r) => r.studentCode), [pageRows]);
  const picturesQ = useStudentPictures(pageCodes);

  const goToStudent = (studentCode: string) => {
    navigate(`/rescue-note?student=${studentCode}`);
  };

  const rangeStart = rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, rows.length);

  return (
    <div className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl shadow-sm overflow-hidden">
      <table className="w-full text-sm border-separate border-spacing-y-1 px-3 pt-1 pb-2">
        <thead>
          <tr className="bg-slate-50/90 backdrop-blur">
            <th className="py-2 px-3 text-xs font-semibold text-slate-500 text-center rounded-l-lg">학년반</th>
            <th className="py-2 px-3 text-xs font-semibold text-slate-500 text-left">이름</th>
            <th className="py-2 px-3 text-xs font-semibold text-slate-500 text-left">태그</th>
            <th className="py-2 px-3 text-xs font-semibold text-slate-500 text-center">상태</th>
            <th className="py-2 px-3 text-xs font-semibold text-slate-500 text-center">최근 상담</th>
            <th className="py-2 px-3 text-xs font-semibold text-slate-500 text-right rounded-r-lg">건수</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                조건에 맞는 학생이 없습니다.
              </td>
            </tr>
          ) : (
            pageRows.map((r) => {
              const picture = picturesQ.data?.[r.studentCode] ?? null;
              return (
                <tr
                  key={r.studentCode}
                  className="bg-white/40 hover:bg-white/80 hover:shadow-sm cursor-pointer transition-all rounded-lg"
                  onClick={() => goToStudent(r.studentCode)}
                >
                  <td className="py-2.5 px-3 text-center text-xs font-mono font-medium text-slate-600 rounded-l-lg">
                    {r.grade}-{r.classNum} <span className="text-slate-400">#{r.numberInClass}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      {picture ? (
                        <img
                          src={picture}
                          alt={r.name}
                          className="w-8 h-8 rounded-full object-cover border border-slate-200 shadow-sm shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-400 shrink-0">
                          <User size={14} aria-hidden />
                        </div>
                      )}
                      <span className="font-bold text-slate-800 text-xs tracking-tight">{r.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-1">
                      {r.tagKeys.map((k) => {
                        const def = defByKey.get(k);
                        return def ? <TagBadge key={k} definition={def} /> : null;
                      })}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center"><StatusBadge status={r.status} /></td>
                  <td className="py-2.5 px-3 text-center text-xs text-slate-400">
                    {r.lastNoteAt ? format(new Date(r.lastNoteAt), 'M/d', { locale: ko }) : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right text-xs font-medium text-slate-600 rounded-r-lg">{r.noteCount}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* 페이지네이션 — 20명씩 */}
      {rows.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-white/40">
          <span className="text-[11px] text-slate-500">
            전체 <span className="font-semibold text-slate-700">{rows.length}</span>명 중{' '}
            <span className="font-medium text-slate-600">{rangeStart}–{rangeEnd}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 bg-white/70 text-slate-500 transition-all hover:bg-white hover:text-brand-600 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="이전 페이지"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-medium text-slate-600 px-1 tabular-nums">
              {page} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 bg-white/70 text-slate-500 transition-all hover:bg-white hover:text-brand-600 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="다음 페이지"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
