import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Settings } from 'lucide-react';
import { useStudentTags } from '../../hooks/useRescueTags';
import { useStudentStatus, useStatusHistory } from '../../hooks/useRescueStatus';
import { useRescueNotes } from '../../hooks/useRescueNotes';
import { useTagDefinitions } from '../../hooks/useTagDefinitions';
import { TagChip } from '../shared/TagChip';
import { StatusBadge } from '../shared/StatusBadge';
import { VisibilityBadge } from '../shared/VisibilityBadge';
import { TagPickerPopover } from '../modals/TagPickerPopover';
import { StatusChangeModal } from '../modals/StatusChangeModal';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface Props { studentCode: string; }

export function OverviewTab({ studentCode }: Props) {
  const tagsQ = useStudentTags(studentCode);
  const statusQ = useStudentStatus(studentCode);
  const historyQ = useStatusHistory(studentCode);
  const notesQ = useRescueNotes(studentCode);
  const defsQ = useTagDefinitions();
  const [statusOpen, setStatusOpen] = useState(false);

  const defByKey = new Map((defsQ.data ?? []).map((d) => [d.key, d]));
  const status = statusQ.data?.status ?? 'closed';
  const lastChange = historyQ.data?.[0];
  const recentNotes = (notesQ.data ?? []).slice(0, 3);

  return (
    <div className="p-5 space-y-4">
      {/* Crisis tags section */}
      <section className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0"></span>
            위기 태그
          </h3>
          <TagPickerPopover studentCode={studentCode}>
            <button className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-all flex items-center gap-1 text-xs font-medium">
              <Plus className="w-3.5 h-3.5" />추가
            </button>
          </TagPickerPopover>
        </div>
        <div className="flex flex-wrap gap-2">
          {(tagsQ.data ?? []).length === 0 ? (
            <span className="text-xs text-slate-400">태그 없음</span>
          ) : (
            tagsQ.data!.map((t) => {
              const def = defByKey.get(t.tagKey);
              return def ? <TagChip key={t.id} definition={def} /> : null;
            })
          )}
        </div>
      </section>

      {/* Status section */}
      <section className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0"></span>
            현재 상태
          </h3>
          <button
            onClick={() => setStatusOpen(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-all flex items-center gap-1 text-xs font-medium"
          >
            <Settings className="w-3.5 h-3.5" />변경
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={status} />
          {lastChange && (
            <span className="text-xs text-slate-400">
              {format(new Date(lastChange.changedAt), 'yyyy-MM-dd', { locale: ko })} 변경
              {lastChange.reason && <span className="text-slate-500"> — "{lastChange.reason}"</span>}
            </span>
          )}
        </div>
        <StatusChangeModal
          studentCode={studentCode}
          currentStatus={status}
          open={statusOpen}
          onOpenChange={setStatusOpen}
        />
      </section>

      {/* Recent notes section */}
      <section className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl shadow-sm p-4">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0"></span>
          최근 상담 (최대 3건)
        </h3>
        {recentNotes.length === 0 ? (
          <p className="text-xs text-slate-400">기록 없음</p>
        ) : (
          <ul className="space-y-2">
            {recentNotes.map((n) => (
              <li key={n.id} className="bg-white/50 border border-slate-100 rounded-lg p-3 text-sm hover:bg-white/80 transition-all">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {n.noteNo && (
                    <span className="font-mono text-[11px] text-slate-500">{n.noteNo}</span>
                  )}
                  <span className="text-[11px] font-medium text-slate-500">
                    {format(new Date(n.occurredAt), 'yyyy-MM-dd HH:mm', { locale: ko })}
                  </span>
                  <VisibilityBadge visibility={n.visibility} />
                </div>
                {n.title && (
                  <p className="text-sm font-medium text-slate-800 mb-0.5">{n.title}</p>
                )}
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{n.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
