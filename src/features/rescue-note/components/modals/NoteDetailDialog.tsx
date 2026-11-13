import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VisibilityBadge } from '../shared/VisibilityBadge';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { RescueNote } from '../../types/rescueNote';
import { useCoStudentNames } from '../../hooks/useCoStudentNames';

interface Props {
  note: RescueNote | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function timeRange(start: string, end: string | null): string {
  const s = format(new Date(start), 'HH:mm');
  if (!end) return s;
  return `${s} ~ ${format(new Date(end), 'HH:mm')}`;
}

export function NoteDetailDialog({ note, open, onOpenChange }: Props) {
  const { resolve } = useCoStudentNames();
  if (!note) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-slate-800 text-sm font-bold flex items-center gap-2 flex-wrap">
            <span>{note.title || '(제목 없음)'}</span>
            {note.noteNo && (
              <span className="font-mono text-[11px] text-slate-500 font-normal">{note.noteNo}</span>
            )}
            {note.linkedNoteId && (
              <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-1.5 py-0.5">
                복제본
              </span>
            )}
            <VisibilityBadge visibility={note.visibility} />
          </DialogTitle>
          <div className="border-b border-slate-100 pb-2" />
        </DialogHeader>
        <div className="space-y-3 text-sm pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-500 mb-0.5">상담일자</div>
              <div className="text-slate-800">
                {format(new Date(note.occurredAt), 'yyyy-MM-dd (eee)', { locale: ko })}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-0.5">시간</div>
              <div className="text-slate-800 font-mono">{timeRange(note.occurredAt, note.endAt)}</div>
            </div>
          </div>
          {note.remarks && (
            <div>
              <div className="text-xs text-slate-500 mb-0.5">비고</div>
              <div className="text-slate-700">{note.remarks}</div>
            </div>
          )}
          {note.coStudentCodes.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">함께 상담한 학생</div>
              <div className="flex flex-wrap gap-1">
                {note.coStudentCodes.map((c) => (
                  <span
                    key={c}
                    className="text-[11px] bg-slate-100 text-slate-600 border border-slate-200 rounded px-1.5 py-0.5"
                  >
                    {resolve(c)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-xs text-slate-500 mb-1">내용</div>
            <div className="text-slate-800 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-[40vh] overflow-y-auto leading-relaxed">
              {note.content}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
            작성: {format(new Date(note.createdAt), 'yyyy-MM-dd HH:mm', { locale: ko })}
            {note.updatedAt !== note.createdAt && (
              <span className="ml-2">
                · 수정: {format(new Date(note.updatedAt), 'yyyy-MM-dd HH:mm', { locale: ko })}
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
