/**
 * Active Subjects Panel (Left Column)
 * Shows list of subjects with progress indicators.
 */

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useSrsContext } from '../../context/SrsContext';
import { useDeleteSubject } from '../../hooks/useSrsSubjects';
import { AddSubjectDialog } from '../dialogs/AddSubjectDialog';
import { useToast } from '@/hooks/use-toast';
import type { SubjectWithStats } from '../../types/srs.types';

interface ActiveSubjectsProps {
  subjects: SubjectWithStats[];
  isLoading: boolean;
}

export function ActiveSubjects({ subjects, isLoading }: ActiveSubjectsProps) {
  const { setCurrentView, setSelectedSubjectId } = useSrsContext();
  const deleteSubject = useDeleteSubject();
  const { toast } = useToast();
  const [showAddSubject, setShowAddSubject] = useState(false);

  const handleSubjectClick = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setCurrentView('subject');
  };

  const handleDelete = async (e: React.MouseEvent, subject: SubjectWithStats) => {
    e.stopPropagation();
    if (!confirm(`"${subject.name}" 과목과 모든 카드를 삭제하시겠습니까?`)) return;
    try {
      await deleteSubject.mutateAsync(subject.id);
      toast({ title: `"${subject.name}" 삭제됨` });
    } catch {
      toast({ title: '삭제 실패', variant: 'destructive' });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="srs-section-title" style={{ fontSize: '1.5rem' }}>
          Active<br />Subjects
        </h2>
        <button
          onClick={() => setShowAddSubject(true)}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          title="과목 추가"
        >
          <Plus size={16} style={{ color: 'var(--srs-cream)' }} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="srs-subject-item animate-pulse">
              <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
              <div className="h-3 bg-white/10 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {subjects.map((subject) => (
            <div
              key={subject.id}
              className="srs-subject-item group"
              onClick={() => handleSubjectClick(subject.id)}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-sm font-medium truncate flex-1"
                  style={{ color: 'var(--srs-cream)' }}
                >
                  {subject.name}
                </span>
                <span
                  className="text-lg font-bold mx-2"
                  style={{ color: 'var(--srs-cream)' }}
                >
                  {subject.total_cards}
                </span>
                <button
                  onClick={(e) => handleDelete(e, subject)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10"
                  title="과목 삭제"
                >
                  <Trash2 size={13} style={{ color: 'var(--srs-accent)' }} />
                </button>
              </div>
              {subject.topic && (
                <div className="text-xs mb-2" style={{ color: 'var(--srs-sage-muted)' }}>
                  {subject.topic}
                </div>
              )}
              {subject.avg_retention !== null && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${subject.avg_retention}%`,
                        backgroundColor: 'var(--srs-accent)',
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium" style={{ color: 'var(--srs-sage-muted)' }}>
                    {subject.avg_retention}%
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AddSubjectDialog open={showAddSubject} onOpenChange={setShowAddSubject} />
    </div>
  );
}
