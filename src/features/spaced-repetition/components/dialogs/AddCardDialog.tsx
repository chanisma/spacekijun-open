/**
 * Add/Edit Card Dialog — SRS Theme
 * Sage green/cream/orange styled card creation form.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { useCreateCard, useUpdateCard } from '../../hooks/useSrsCards';
import { useToast } from '@/hooks/use-toast';
import type { SrsCard } from '../../types/srs.types';

interface AddCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  editCard?: SrsCard | null;
}

export function AddCardDialog({ open, onOpenChange, subjectId, editCard }: AddCardDialogProps) {
  const { toast } = useToast();
  const createCard = useCreateCard();
  const updateCard = useUpdateCard();

  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [concept, setConcept] = useState('');

  const isEditing = !!editCard;

  useEffect(() => {
    if (editCard) {
      setFront(editCard.front);
      setBack(editCard.back);
      setConcept(editCard.concept || '');
    } else {
      setFront('');
      setBack('');
      setConcept('');
    }
  }, [editCard, open]);

  const handleSave = async () => {
    if (!front.trim() || !back.trim()) {
      toast({ title: '질문과 답변을 모두 입력해주세요', variant: 'destructive' });
      return;
    }

    try {
      if (isEditing && editCard) {
        await updateCard.mutateAsync({
          id: editCard.id,
          front: front.trim(),
          back: back.trim(),
          concept: concept.trim() || undefined,
        });
        toast({ title: '카드가 수정되었습니다' });
      } else {
        await createCard.mutateAsync({
          subject_id: subjectId,
          front: front.trim(),
          back: back.trim(),
          concept: concept.trim() || undefined,
        });
        // Keep dialog open for rapid card entry
        setFront('');
        setBack('');
        // Keep concept for consecutive cards in same group
      }

      if (isEditing) onOpenChange(false);
    } catch {
      toast({ title: '저장 실패', variant: 'destructive' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden border-0"
        style={{ backgroundColor: 'var(--srs-dark, #2d3a2e)' }}
      >
        {/* Header */}
        <div className="p-6 pb-4" style={{ backgroundColor: '#f5f0e1' }}>
          <div className="flex items-center justify-between">
            <h2 style={{ fontWeight: 900, fontSize: '1.5rem', lineHeight: 1.1, color: '#1a1a1a' }}>
              {isEditing ? '카드 수정' : '새 카드\n추가'}
            </h2>
            <button
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 flex items-center justify-center text-lg"
              style={{ color: '#8a8a7a' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 pb-2" style={{ backgroundColor: '#f5f0e1' }}>
          {/* Front (Question) */}
          <div className="mb-4" style={{ borderBottom: '1px solid #d4d0c4' }}>
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b9b8a' }}>
              QUESTION (FRONT)
            </label>
            <textarea
              value={front}
              onChange={(e) => setFront(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="이 카드에서 물어볼 질문"
              className="w-full py-2 bg-transparent text-base outline-none resize-none"
              style={{ color: '#1a1a1a', minHeight: 60 }}
              autoFocus
            />
          </div>

          {/* Back (Answer) */}
          <div className="mb-4" style={{ borderBottom: '1px solid #d4d0c4' }}>
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b9b8a' }}>
              ANSWER (BACK)
            </label>
            <textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="정답 또는 설명"
              className="w-full py-2 bg-transparent text-base outline-none resize-none"
              style={{ color: '#1a1a1a', minHeight: 60 }}
            />
          </div>

          {/* Concept */}
          <div className="mb-2" style={{ borderBottom: '1px solid #d4d0c4' }}>
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b9b8a' }}>
              CONCEPT GROUP
            </label>
            <input
              type="text"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. 시냅스 가소성"
              className="w-full py-2 bg-transparent text-sm outline-none"
              style={{ color: '#1a1a1a' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 flex items-center justify-between" style={{ backgroundColor: '#6b7d5e' }}>
          <div>
            <div className="text-xs" style={{ color: '#a3b394' }}>
              Ctrl+Enter로 저장
            </div>
            {!isEditing && (
              <div className="text-xs mt-1" style={{ color: '#a3b394' }}>
                저장 후 계속 입력 가능
              </div>
            )}
          </div>
          <button
            className="inline-flex items-center justify-center text-white font-bold text-sm"
            style={{
              backgroundColor: '#ff6b35',
              borderRadius: '50%',
              width: 64,
              height: 64,
              transition: 'background-color 0.15s, transform 0.1s',
            }}
            onClick={handleSave}
            disabled={createCard.isPending || updateCard.isPending}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#e85a28')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#ff6b35')}
          >
            {createCard.isPending || updateCard.isPending ? '...' : isEditing ? 'Save' : 'Add'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
