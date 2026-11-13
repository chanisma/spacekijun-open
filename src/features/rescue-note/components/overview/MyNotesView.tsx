import { useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { useMyNotes, type MyNoteRow } from '../../hooks/useMyNotes';
import { useTagDefinitions } from '../../hooks/useTagDefinitions';
import { VisibilityBadge } from '../shared/VisibilityBadge';
import { StatusBadge } from '../shared/StatusBadge';
import { NoteDetailDialog } from '../modals/NoteDetailDialog';
import { useCoStudentNames } from '../../hooks/useCoStudentNames';
import { RESCUE_STATUS, STATUS_LABELS } from '../../constants';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { RescueNote } from '../../types/rescueNote';

const PAGE_SIZE = 15;

function timeRange(start: string, end: string | null): string {
  const s = format(new Date(start), 'HH:mm');
  if (!end) return s;
  return `${s}~${format(new Date(end), 'HH:mm')}`;
}

function rowToRescueNote(r: MyNoteRow): RescueNote {
  return {
    id: r.id,
    studentCode: r.studentCode,
    noteNo: r.noteNo,
    title: r.title,
    occurredAt: r.occurredAt,
    endAt: r.endAt,
    content: r.content,
    remarks: r.remarks,
    visibility: r.visibility,
    coStudentCodes: r.coStudentCodes,
    linkedNoteId: r.linkedNoteId,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    meta: r.meta,
  };
}

export function MyNotesView() {
  const { user } = useAuth();
  const notesQ = useMyNotes(user?.id ?? null);
  const defsQ = useTagDefinitions();
  const { resolveAll } = useCoStudentNames();
  const [viewing, setViewing] = useState<RescueNote | null>(null);
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [gradeF, setGradeF] = useState('all');
  const [classF, setClassF] = useState('all');
  const [tagF, setTagF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [nameF, setNameF] = useState('');

  const rows = notesQ.data ?? [];

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (startDate && r.occurredAt < startDate) return false;
      if (endDate && r.occurredAt > endDate + 'T23:59:59') return false;
      if (gradeF !== 'all' && String(r.grade) !== gradeF) return false;
      if (classF !== 'all' && String(r.classNum) !== classF) return false;
      if (tagF !== 'all' && !r.tagKeys.includes(tagF)) return false;
      if (statusF !== 'all' && r.status !== statusF) return false;
      if (nameF.trim() && !r.studentName.includes(nameF.trim())) return false;
      return true;
    });
  }, [rows, startDate, endDate, gradeF, classF, tagF, statusF, nameF]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const grades = useMemo(
    () => Array.from(new Set(rows.map((r) => r.grade).filter(Boolean))).sort(),
    [rows]
  );
  const classes = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((r) => gradeF === 'all' || String(r.grade) === gradeF)
            .map((r) => r.classNum)
            .filter(Boolean)
        )
      ).sort(),
    [rows, gradeF]
  );

  const defByKey = new Map((defsQ.data ?? []).map((d) => [d.key, d]));

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setGradeF('all');
    setClassF('all');
    setTagF('all');
    setStatusF('all');
    setNameF('');
    setPage(1);
  };

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0"></span>
          상담 일지 ({filtered.length}건)
        </h2>
      </div>

      {/* Filters */}
      <div className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl shadow-sm p-3 mb-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-600">시작</span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="w-36 h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-600">종료</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="w-36 h-8 text-xs"
            />
          </div>
          <Select value={gradeF} onValueChange={(v) => { setGradeF(v); setClassF('all'); setPage(1); }}>
            <SelectTrigger className="w-24 h-8 text-xs"><SelectValue placeholder="학년" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 학년</SelectItem>
              {grades.map((g) => <SelectItem key={g} value={String(g)}>{g}학년</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={classF} onValueChange={(v) => { setClassF(v); setPage(1); }}>
            <SelectTrigger className="w-24 h-8 text-xs"><SelectValue placeholder="반" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 반</SelectItem>
              {classes.map((c) => <SelectItem key={c} value={String(c)}>{c}반</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tagF} onValueChange={(v) => { setTagF(v); setPage(1); }}>
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="태그" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 태그</SelectItem>
              {(defsQ.data ?? []).map((d) => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusF} onValueChange={(v) => { setStatusF(v); setPage(1); }}>
            <SelectTrigger className="w-24 h-8 text-xs"><SelectValue placeholder="상태" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              {Object.values(RESCUE_STATUS).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="이름 검색"
            value={nameF}
            onChange={(e) => { setNameF(e.target.value); setPage(1); }}
            className="w-32 h-8 text-xs"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-8 text-xs text-slate-500"
          >
            초기화
          </Button>
        </div>
      </div>

      {/* Table */}
      {notesQ.isLoading && <p className="text-slate-400 text-sm">불러오는 중...</p>}
      {!notesQ.isLoading && filtered.length === 0 && (
        <p className="text-slate-400 text-sm">조건에 맞는 상담일지가 없습니다.</p>
      )}

      {filtered.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-y-1">
              <thead>
                <tr className="bg-slate-50/90 backdrop-blur">
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 rounded-l-lg whitespace-nowrap">일지번호</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">일자</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">시간</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">학년·반</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">학생</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500">제목</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500">태그</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">상태</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 rounded-r-lg whitespace-nowrap">공개</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setViewing(rowToRescueNote(r))}
                    className="bg-white/40 hover:bg-white/80 transition-all cursor-pointer"
                  >
                    <td className="px-3 py-2 font-mono text-slate-500 rounded-l-lg whitespace-nowrap">
                      {r.noteNo ?? '—'}
                      {r.linkedNoteId && (
                        <span className="ml-1 text-[9px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1 py-0.5 font-sans">복제</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {format(new Date(r.occurredAt), 'yyyy-MM-dd', { locale: ko })}
                    </td>
                    <td className="px-3 py-2 text-slate-600 font-mono whitespace-nowrap">
                      {timeRange(r.occurredAt, r.endAt)}
                    </td>
                    <td className="px-3 py-2 text-slate-600 font-mono whitespace-nowrap">
                      {r.grade}-{r.classNum}
                      {r.numberInClass != null && <span className="text-slate-400"> #{r.numberInClass}</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium text-slate-800">{r.studentName}</span>
                      {r.coStudentCodes.length > 0 && (
                        <span
                          className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-slate-400"
                          title={resolveAll(r.coStudentCodes).join(', ')}
                        >
                          <Users className="w-3 h-3" />+{r.coStudentCodes.length}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700 max-w-[240px] truncate">{r.title || '(제목 없음)'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-0.5">
                        {r.tagKeys.slice(0, 3).map((k) => {
                          const def = defByKey.get(k);
                          return def ? (
                            <span key={k} className={`w-1.5 h-1.5 rounded-full ${def.color}`} aria-label={def.label} />
                          ) : null;
                        })}
                        {r.tagKeys.length > 3 && (
                          <span className="text-[9px] text-slate-400 font-medium ml-0.5">+{r.tagKeys.length - 3}</span>
                        )}
                        {r.tagKeys.length === 0 && <span className="text-slate-300 text-[10px]">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-2 rounded-r-lg whitespace-nowrap"><VisibilityBadge visibility={r.visibility} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
                aria-label="이전 페이지"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-slate-600 px-2 font-medium">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0"
                aria-label="다음 페이지"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <NoteDetailDialog
        note={viewing}
        open={!!viewing}
        onOpenChange={(v) => { if (!v) setViewing(null); }}
      />
    </div>
  );
}
