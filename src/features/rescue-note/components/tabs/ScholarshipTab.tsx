import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  useRescueScholarships,
  useDeleteRescueScholarship,
} from '../../hooks/useRescueScholarships';
import { ScholarshipModal } from '../modals/ScholarshipModal';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { toast } from '@/components/ui/use-toast';
import type { RescueScholarship } from '../../types/rescueScholarship';

interface Props { studentCode: string; }

export function ScholarshipTab({ studentCode }: Props) {
  const { user, isAdmin } = useAuth();
  const listQ = useRescueScholarships(studentCode);
  const del = useDeleteRescueScholarship(studentCode);
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<RescueScholarship | null>(null);

  const canEdit = (s: RescueScholarship) => s.createdBy === user?.id || isAdmin;
  const rows = listQ.data ?? [];

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
          장학금 수여 ({rows.length})
        </h3>
        <button
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all border border-emerald-100"
        >
          <Plus className="w-3.5 h-3.5" />장학금 추가
        </button>
      </div>

      {listQ.isLoading && <p className="text-sm text-slate-400">불러오는 중...</p>}
      {!listQ.isLoading && rows.length === 0 && (
        <p className="text-sm text-slate-400">[+ 장학금 추가] 로 첫 수여 내역을 기록하세요.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-y-1">
            <thead>
              <tr className="bg-slate-50/90 backdrop-blur">
                <th className="px-3 py-2 text-left font-semibold text-slate-500 rounded-l-lg whitespace-nowrap">번호</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">수여일</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-500">장학금명</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-500">비고</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-500 rounded-r-lg w-20">액션</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  className="bg-white/40 hover:bg-white/80 transition-all cursor-pointer"
                  onClick={() => canEdit(s) && setEditing(s)}
                >
                  <td className="px-3 py-2 font-mono text-slate-500 rounded-l-lg whitespace-nowrap">
                    {s.scholarshipNo ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                    {format(new Date(s.awardedOn), 'yyyy-MM-dd', { locale: ko })}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-800">{s.name}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 max-w-[240px] truncate">{s.remarks ?? '—'}</td>
                  <td
                    className="px-3 py-2 rounded-r-lg text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canEdit(s) ? (
                      <div className="flex gap-0.5 justify-center">
                        <button
                          onClick={() => setEditing(s)}
                          aria-label="편집"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          aria-label="삭제"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                          onClick={async () => {
                            if (!confirm('이 장학금 내역을 삭제하시겠습니까?')) return;
                            try {
                              await del.mutateAsync(s.id);
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

      <ScholarshipModal studentCode={studentCode} open={newOpen} onOpenChange={setNewOpen} />
      {editing && (
        <ScholarshipModal
          studentCode={studentCode}
          scholarship={editing}
          open={!!editing}
          onOpenChange={(v) => { if (!v) setEditing(null); }}
        />
      )}
    </div>
  );
}
