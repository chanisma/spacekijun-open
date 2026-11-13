import { useState } from 'react';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useRescueNotes, useDeleteRescueNote } from '../../hooks/useRescueNotes';
import { VisibilityBadge } from '../shared/VisibilityBadge';
import { NewNoteModal } from '../modals/NewNoteModal';
import { EditNoteModal } from '../modals/EditNoteModal';
import { NoteDetailDialog } from '../modals/NoteDetailDialog';
import { useCoStudentNames } from '../../hooks/useCoStudentNames';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { toast } from '@/components/ui/use-toast';
import type { RescueNote } from '../../types/rescueNote';

interface Props { studentCode: string; }

function timeRange(start: string, end: string | null): string {
  const s = format(new Date(start), 'HH:mm');
  if (!end) return s;
  return `${s}~${format(new Date(end), 'HH:mm')}`;
}

export function CounselingNotesTab({ studentCode }: Props) {
  const { user, isAdmin } = useAuth();
  const notesQ = useRescueNotes(studentCode);
  const del = useDeleteRescueNote(studentCode);
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<RescueNote | null>(null);
  const [viewing, setViewing] = useState<RescueNote | null>(null);
  const { resolveAll } = useCoStudentNames();

  const canEdit = (n: RescueNote) => n.createdBy === user?.id || isAdmin;
  const notes = notesQ.data ?? [];

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0"></span>
          상담일지 ({notes.length})
        </h3>
        <button
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 transition-all border border-brand-100"
        >
          <Plus className="w-3.5 h-3.5" />새 기록
        </button>
      </div>

      {notesQ.isLoading && <p className="text-sm text-slate-400">불러오는 중...</p>}
      {!notesQ.isLoading && notes.length === 0 && (
        <p className="text-sm text-slate-400">[+ 새 기록] 으로 첫 상담을 기록하세요.</p>
      )}

      {notes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-y-1">
            <thead>
              <tr className="bg-slate-50/90 backdrop-blur">
                <th className="px-3 py-2 text-left font-semibold text-slate-500 rounded-l-lg whitespace-nowrap">일지번호</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">일자</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">시간</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-500">제목</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-500">비고</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">공개</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-500 rounded-r-lg w-20">액션</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => (
                <tr
                  key={n.id}
                  className="bg-white/40 hover:bg-white/80 transition-all cursor-pointer"
                  onClick={() => setViewing(n)}
                >
                  <td className="px-3 py-2 font-mono text-slate-500 rounded-l-lg whitespace-nowrap">
                    {n.noteNo ?? '—'}
                    {n.linkedNoteId && (
                      <span className="ml-1 text-[9px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1 py-0.5 font-sans">
                        복제
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                    {format(new Date(n.occurredAt), 'yyyy-MM-dd', { locale: ko })}
                  </td>
                  <td className="px-3 py-2 text-slate-600 font-mono whitespace-nowrap">
                    {timeRange(n.occurredAt, n.endAt)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-800">{n.title || '(제목 없음)'}</span>
                    {n.coStudentCodes.length > 0 && (
                      <span
                        className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-slate-400 align-middle"
                        title={resolveAll(n.coStudentCodes).join(', ')}
                      >
                        <Users className="w-3 h-3" />+{n.coStudentCodes.length}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">{n.remarks ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <VisibilityBadge visibility={n.visibility} />
                  </td>
                  <td
                    className="px-3 py-2 rounded-r-lg text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canEdit(n) ? (
                      <div className="flex gap-0.5 justify-center">
                        <button
                          onClick={() => setEditing(n)}
                          aria-label="편집"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          aria-label="삭제"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                          onClick={async () => {
                            if (!confirm('이 상담일지를 삭제하시겠습니까?')) return;
                            try {
                              await del.mutateAsync(n.id);
                              toast({ title: '삭제되었습니다.' });
                            } catch (e: any) {
                              toast({ title: '삭제 실패', description: e.message, variant: 'destructive' });
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-300 text-[10px]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewNoteModal studentCode={studentCode} open={newOpen} onOpenChange={setNewOpen} />
      {editing && (
        <EditNoteModal
          note={editing}
          open={!!editing}
          onOpenChange={(v) => { if (!v) setEditing(null); }}
        />
      )}
      <NoteDetailDialog
        note={viewing}
        open={!!viewing}
        onOpenChange={(v) => { if (!v) setViewing(null); }}
      />
    </div>
  );
}
