/**
 * Subject Detail View (Screen 3)
 * Shows concept breakdown, retention curves, upcoming load.
 * EDIT button opens card management (add manual / AI generate).
 */

import React, { useState } from 'react';
import { ArrowLeft, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useSrsContext } from '../../context/SrsContext';
import { useSrsSubjectsWithStats, useDeleteSubject } from '../../hooks/useSrsSubjects';
import { useSrsCards, useDeleteCard } from '../../hooks/useSrsCards';
import { useToast } from '@/hooks/use-toast';
import { useSrsConceptBreakdown } from '../../hooks/useSrsStats';
import { calculateSubjectProgress, calculateAvgInterval } from '../../utils/srsCalculations';
import { SrsLayout } from '../layout/SrsLayout';
import { ConceptTable } from './ConceptTable';
import { UpcomingLoad } from './UpcomingLoad';
import { AddCardDialog } from '../dialogs/AddCardDialog';
import { AiGenerateDialog } from '../dialogs/AiGenerateDialog';

export function SubjectDetail() {
  const { selectedSubjectId, setCurrentView, startStudySession } = useSrsContext();
  const { data: subjects = [] } = useSrsSubjectsWithStats();
  const { data: cards = [] } = useSrsCards(selectedSubjectId);
  const { data: concepts = [] } = useSrsConceptBreakdown(selectedSubjectId);

  const deleteSubject = useDeleteSubject();
  const deleteCard = useDeleteCard();
  const { toast } = useToast();

  const [showAddCard, setShowAddCard] = useState(false);
  const [showAiGenerate, setShowAiGenerate] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [showCardList, setShowCardList] = useState(false);

  const subject = subjects.find((s) => s.id === selectedSubjectId);
  if (!subject) return null;

  const handleDeleteSubject = async () => {
    if (!confirm(`"${subject.name}" 과목과 모든 카드를 삭제하시겠습니까?`)) return;
    try {
      await deleteSubject.mutateAsync(subject.id);
      toast({ title: `"${subject.name}" 삭제됨` });
      setCurrentView('dashboard');
    } catch {
      toast({ title: '삭제 실패', variant: 'destructive' });
    }
  };

  const handleDeleteCard = async (cardId: string, cardFront: string) => {
    if (!confirm(`"${cardFront.slice(0, 30)}..." 카드를 삭제하시겠습니까?`)) return;
    try {
      await deleteCard.mutateAsync(cardId);
      toast({ title: '카드 삭제됨' });
    } catch {
      toast({ title: '삭제 실패', variant: 'destructive' });
    }
  };

  const progress = calculateSubjectProgress(cards);
  const avgInterval = calculateAvgInterval(cards);
  const activeItems = cards.filter((c) => c.status !== 'suspended').length;

  return (
    <>
      <SrsLayout
        left={
          <div>
            <button
              className="flex items-center gap-1 mb-4 text-sm"
              style={{ color: 'var(--srs-sage-muted)' }}
              onClick={() => setCurrentView('dashboard')}
            >
              <ArrowLeft size={16} />
            </button>

            <div className="srs-section-title-sm mb-1" style={{ color: 'var(--srs-sage-muted)' }}>
              {subject.topic || 'SUBJECT'}
            </div>
            <h2 className="srs-section-title mb-8" style={{ color: 'var(--srs-cream)', fontSize: '1.75rem' }}>
              {subject.name}
            </h2>

            <div className="srs-section-title-sm mb-2" style={{ color: 'var(--srs-sage-muted)' }}>
              MODULE PROGRESS
            </div>
            <div className="srs-metric" style={{ color: 'var(--srs-cream)' }}>
              {progress}<span className="srs-metric-unit">%</span>
            </div>

            {/* EDIT button with dropdown menu */}
            <div className="mt-8 relative">
              <button
                className="srs-btn-dark"
                style={{ width: 56, height: 56, fontSize: '0.7rem' }}
                onClick={() => setShowEditMenu(!showEditMenu)}
              >
                EDIT
              </button>

              {showEditMenu && (
                <div
                  className="absolute left-0 top-16 rounded-lg shadow-lg overflow-hidden z-10"
                  style={{ backgroundColor: 'var(--srs-cream)', minWidth: 180 }}
                >
                  <button
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-left hover:bg-black/5 transition-colors"
                    onClick={() => { setShowAddCard(true); setShowEditMenu(false); }}
                  >
                    <Plus size={16} />
                    카드 수동 추가
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-left hover:bg-black/5 transition-colors"
                    style={{ borderTop: '1px solid var(--srs-border)' }}
                    onClick={() => { setShowAiGenerate(true); setShowEditMenu(false); }}
                  >
                    <Sparkles size={16} style={{ color: 'var(--srs-accent)' }} />
                    AI 카드 생성
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-left hover:bg-black/5 transition-colors"
                    style={{ borderTop: '1px solid var(--srs-border)' }}
                    onClick={() => { setShowCardList(!showCardList); setShowEditMenu(false); }}
                  >
                    <Plus size={16} style={{ transform: 'rotate(45deg)' }} />
                    카드 관리
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-left hover:bg-black/5 transition-colors"
                    style={{ borderTop: '1px solid var(--srs-border)', color: 'var(--srs-accent)' }}
                    onClick={() => { setShowEditMenu(false); handleDeleteSubject(); }}
                  >
                    <Trash2 size={16} />
                    과목 삭제
                  </button>
                </div>
              )}
            </div>

            {/* Card count info */}
            <div className="mt-6">
              <div className="srs-section-title-sm mb-1" style={{ color: 'var(--srs-sage-muted)' }}>
                TOTAL CARDS
              </div>
              <div className="srs-metric-sm" style={{ color: 'var(--srs-cream)' }}>
                {cards.length}
              </div>
            </div>
          </div>
        }
        center={
          <div className="w-full p-0" style={{ alignSelf: 'flex-start' }}>
            {showCardList ? (
              <div>
                <div className="flex justify-between items-center mb-4 px-4">
                  <div className="srs-section-title-sm font-bold">CARD LIST ({cards.length})</div>
                  <button
                    className="text-xs font-bold px-3 py-1 rounded-full"
                    style={{ backgroundColor: 'var(--srs-text)', color: 'var(--srs-cream)' }}
                    onClick={() => setShowCardList(false)}
                  >
                    Concepts
                  </button>
                </div>
                <div className="space-y-0 px-4 max-h-[60vh] overflow-y-auto">
                  {cards.length === 0 ? (
                    <div className="text-center py-8 text-sm" style={{ color: 'var(--srs-text-muted)' }}>
                      카드가 없습니다. EDIT 메뉴에서 추가하세요.
                    </div>
                  ) : (
                    cards.map((card) => (
                      <div
                        key={card.id}
                        className="group flex items-start gap-3 py-3"
                        style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold" style={{ color: 'var(--srs-text)' }}>
                            Q: {card.front}
                          </div>
                          <div className="text-sm mt-1" style={{ color: 'var(--srs-text-muted)' }}>
                            A: {card.back}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {card.concept && (
                              <span
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: 'var(--srs-teal)', color: 'white', fontSize: '0.6rem' }}
                              >
                                {card.concept}
                              </span>
                            )}
                            <span style={{ color: 'var(--srs-text-light)', fontSize: '0.6rem' }}>
                              {card.source === 'ai_generated' ? 'AI' : card.source === 'manual' ? '수동' : '가져옴'}
                            </span>
                          </div>
                        </div>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-black/5 flex-shrink-0"
                          onClick={() => handleDeleteCard(card.id, card.front)}
                          title="카드 삭제"
                        >
                          <Trash2 size={14} style={{ color: 'var(--srs-accent)' }} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <ConceptTable concepts={concepts} activeItems={activeItems} />
            )}
          </div>
        }
        right={
          <div>
            <div className="mb-8">
              <div className="srs-section-title-sm mb-2">AVG. INTERVAL</div>
              <div className="srs-metric-md">
                {avgInterval}<span className="srs-metric-unit">DAYS</span>
              </div>
            </div>

            <div className="border-t mb-6" style={{ borderColor: 'var(--srs-border)' }} />

            <UpcomingLoad cards={cards} />

            <div className="mt-8 flex justify-end">
              <button
                className="srs-btn-accent"
                style={{ width: 96, height: 48, borderRadius: 24, fontSize: '0.75rem' }}
                onClick={() => startStudySession(subject.id)}
              >
                REVIEW ALL
              </button>
            </div>
          </div>
        }
      />

      {/* Dialogs */}
      {selectedSubjectId && (
        <>
          <AddCardDialog
            open={showAddCard}
            onOpenChange={setShowAddCard}
            subjectId={selectedSubjectId}
          />
          <AiGenerateDialog
            open={showAiGenerate}
            onOpenChange={setShowAiGenerate}
            subjectId={selectedSubjectId}
            subjectName={subject.name}
          />
        </>
      )}
    </>
  );
}
