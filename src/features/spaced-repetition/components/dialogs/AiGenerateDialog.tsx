/**
 * AI Card Generation Dialog — SRS Theme
 * Sage green/cream/orange styled AI generation with preview.
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Sparkles, Loader2, Check, X } from 'lucide-react';
import { useSrsAiGenerate } from '../../hooks/useSrsAiGenerate';
import { useBulkCreateCards } from '../../hooks/useSrsCards';
import { useToast } from '@/hooks/use-toast';
import type { CreateCardParams } from '../../types/srs.types';

interface AiGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  subjectName: string;
}

export function AiGenerateDialog({
  open,
  onOpenChange,
  subjectId,
  subjectName,
}: AiGenerateDialogProps) {
  const { toast } = useToast();
  const aiGenerate = useSrsAiGenerate();
  const bulkCreate = useBulkCreateCards();

  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(10);
  const [preview, setPreview] = useState<CreateCardParams[] | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({ title: '주제를 입력해주세요', variant: 'destructive' });
      return;
    }

    try {
      const result = await aiGenerate.mutateAsync({
        subjectId,
        subjectName,
        topic: topic.trim(),
        count,
      });

      setPreview(result.createParams);
      setSelectedIndices(new Set(result.createParams.map((_, i) => i)));
    } catch (error) {
      toast({
        title: 'AI 생성 실패',
        description: error instanceof Error ? error.message : '다시 시도해주세요',
        variant: 'destructive',
      });
    }
  };

  const toggleCard = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleSave = async () => {
    if (!preview) return;

    const selectedCards = preview.filter((_, i) => selectedIndices.has(i));
    if (selectedCards.length === 0) {
      toast({ title: '저장할 카드를 선택해주세요', variant: 'destructive' });
      return;
    }

    try {
      await bulkCreate.mutateAsync(selectedCards);
      toast({ title: `${selectedCards.length}개 카드가 추가되었습니다` });
      handleClose();
    } catch {
      toast({ title: '저장 실패', variant: 'destructive' });
    }
  };

  const handleClose = () => {
    setPreview(null);
    setTopic('');
    setSelectedIndices(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-2xl p-0 overflow-hidden border-0"
        style={{ backgroundColor: '#2d3a2e', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="p-6 pb-4" style={{ backgroundColor: '#f5f0e1' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: '#ff6b35' }}
              >
                <Sparkles size={20} color="white" />
              </div>
              <h2 style={{ fontWeight: 900, fontSize: '1.5rem', lineHeight: 1.1, color: '#1a1a1a' }}>
                AI 카드<br />생성
              </h2>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center text-lg"
              style={{ color: '#8a8a7a' }}
            >
              ✕
            </button>
          </div>
        </div>

        {!preview ? (
          /* Generation Form */
          <>
            <div className="px-6 py-4" style={{ backgroundColor: '#f5f0e1' }}>
              {/* Subject (read-only) */}
              <div className="mb-4" style={{ borderBottom: '1px solid #d4d0c4' }}>
                <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b9b8a' }}>
                  SUBJECT
                </label>
                <div className="py-2 text-base font-medium" style={{ color: '#1a1a1a' }}>
                  {subjectName}
                </div>
              </div>

              {/* Topic */}
              <div className="mb-4" style={{ borderBottom: '1px solid #d4d0c4' }}>
                <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b9b8a' }}>
                  TOPIC (구체적으로)
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. 시냅스 가소성의 분자 메커니즘"
                  className="w-full py-2 bg-transparent text-base outline-none"
                  style={{ color: '#1a1a1a' }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleGenerate(); }
                  }}
                />
              </div>

              {/* Card Count */}
              <div className="mb-2" style={{ borderBottom: '1px solid #d4d0c4' }}>
                <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b9b8a' }}>
                  CARD COUNT
                </label>
                <div className="flex gap-3 py-2">
                  {[5, 10, 15, 20].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className="px-4 py-1.5 rounded-full text-sm font-bold transition-colors"
                      style={{
                        backgroundColor: count === n ? '#1a1a1a' : 'transparent',
                        color: count === n ? '#f5f0e1' : '#1a1a1a',
                        border: count === n ? 'none' : '1px solid #d4d0c4',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 flex items-center justify-between" style={{ backgroundColor: '#6b7d5e' }}>
              <div className="text-xs" style={{ color: '#a3b394' }}>
                GPT가 인지과학 기반 플래시카드를 생성합니다
              </div>
              <button
                className="inline-flex items-center justify-center text-white font-bold text-sm"
                style={{
                  backgroundColor: '#ff6b35',
                  borderRadius: '50%',
                  width: 72,
                  height: 72,
                  transition: 'background-color 0.15s, transform 0.1s',
                  opacity: aiGenerate.isPending ? 0.7 : 1,
                }}
                onClick={handleGenerate}
                disabled={aiGenerate.isPending}
              >
                {aiGenerate.isPending ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  'Generate'
                )}
              </button>
            </div>
          </>
        ) : (
          /* Preview Cards */
          <>
            <div className="px-6 py-3" style={{ backgroundColor: '#f5f0e1' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b9b8a' }}>
                  {preview.length} CARDS GENERATED
                </span>
                <span className="text-xs font-bold" style={{ color: '#1a1a1a' }}>
                  {selectedIndices.size} SELECTED
                </span>
              </div>

              <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                {preview.map((card, i) => {
                  const selected = selectedIndices.has(i);
                  return (
                    <div
                      key={i}
                      className="rounded-lg p-3 cursor-pointer transition-all"
                      style={{
                        backgroundColor: selected ? '#e8e0cc' : '#faf7f0',
                        border: selected ? '2px solid #1a1a1a' : '1px solid #d4d0c4',
                        opacity: selected ? 1 : 0.6,
                      }}
                      onClick={() => toggleCard(i)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 flex-shrink-0">
                          {selected ? (
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: '#1a1a1a' }}
                            >
                              <Check size={12} color="white" />
                            </div>
                          ) : (
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ border: '1.5px solid #d4d0c4' }}
                            >
                              <X size={10} style={{ color: '#d4d0c4' }} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold" style={{ color: '#1a1a1a' }}>
                            Q: {card.front}
                          </div>
                          <div className="text-sm mt-1" style={{ color: '#6b6b5e' }}>
                            A: {card.back}
                          </div>
                          {card.concept && (
                            <div
                              className="inline-block text-xs mt-1.5 px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: '#6b9b8a', color: 'white' }}
                            >
                              {card.concept}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 flex items-center justify-between" style={{ backgroundColor: '#6b7d5e' }}>
              <button
                className="text-sm font-bold px-4 py-2 rounded-full"
                style={{ color: '#f5f0e1', border: '1px solid rgba(255,255,255,0.3)' }}
                onClick={() => setPreview(null)}
              >
                Regenerate
              </button>
              <button
                className="inline-flex items-center justify-center text-white font-bold text-sm"
                style={{
                  backgroundColor: selectedIndices.size > 0 ? '#ff6b35' : '#8a8a7a',
                  borderRadius: '50%',
                  width: 72,
                  height: 72,
                  transition: 'background-color 0.15s',
                  opacity: bulkCreate.isPending ? 0.7 : 1,
                }}
                onClick={handleSave}
                disabled={bulkCreate.isPending || selectedIndices.size === 0}
              >
                {bulkCreate.isPending ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  `Save ${selectedIndices.size}`
                )}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
