/**
 * Study Session Container (Screen 2)
 * Manages the full study flow: load cards → review → complete.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { useSrsContext } from '../../context/SrsContext';
import { useSrsDueCards } from '../../hooks/useSrsCards';
import { useStartSession, useEndSession, useRecordReview } from '../../hooks/useSrsSession';
import { sortCardsForStudy } from '../../utils/srsCalculations';
import { FlashCard } from './FlashCard';
import { ResponseButtons } from './ResponseButtons';
import { SessionProgress } from './SessionProgress';
import type { SrsCard, StudyQuality } from '../../types/srs.types';

export function StudySession() {
  const { selectedSubjectId, setCurrentView, endStudySession, setStudySession } = useSrsContext();
  const { data: rawDueCards = [] } = useSrsDueCards(selectedSubjectId ?? undefined);

  const startSessionMut = useStartSession();
  const endSessionMut = useEndSession();
  const recordReviewMut = useRecordReview();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cards, setCards] = useState<SrsCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [cardStartTime, setCardStartTime] = useState<number>(Date.now());
  const [results, setResults] = useState<Array<{ card_id: string; quality: StudyQuality; recall_time_ms: number }>>([]);

  // Initialize session
  useEffect(() => {
    if (rawDueCards.length > 0 && !sessionId) {
      const sorted = sortCardsForStudy(rawDueCards);
      setCards(sorted);
      startSessionMut.mutate(undefined, {
        onSuccess: (session) => {
          setSessionId(session.id);
          setCardStartTime(Date.now());
        },
      });
    }
  }, [rawDueCards.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentCard = cards[currentIndex];
  const isComplete = currentIndex >= cards.length && cards.length > 0;

  // Handle response
  const handleResponse = useCallback((quality: StudyQuality) => {
    if (!currentCard || !sessionId) return;

    const recallTime = Date.now() - cardStartTime;

    // Record review
    recordReviewMut.mutate({
      session_id: sessionId,
      card_id: currentCard.id,
      quality,
      recall_time_ms: recallTime,
    });

    // Track result locally
    setResults((prev) => [...prev, {
      card_id: currentCard.id,
      quality,
      recall_time_ms: recallTime,
    }]);

    // Next card
    setIsFlipped(false);
    setCurrentIndex((i) => i + 1);
    setCardStartTime(Date.now());
  }, [currentCard, sessionId, cardStartTime, recordReviewMut]);

  // Complete session
  useEffect(() => {
    if (isComplete && sessionId) {
      const correctCount = results.filter((r) => r.quality >= 3).length;
      const avgRecallMs = results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + r.recall_time_ms, 0) / results.length)
        : 0;

      // Save results to context and transition immediately
      setStudySession((prev) => prev ? { ...prev, results } : prev);

      // Transition to review right away — don't wait for DB
      setCurrentView('review');

      // Fire DB update in background (non-blocking)
      endSessionMut.mutate({
        sessionId,
        cards_reviewed: results.length,
        cards_correct: correctCount,
        avg_recall_time_ms: avgRecallMs,
      });
    }
  }, [isComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close session
  const handleClose = () => {
    if (sessionId && results.length > 0) {
      const correctCount = results.filter((r) => r.quality >= 3).length;
      const avgRecallMs = Math.round(results.reduce((sum, r) => sum + r.recall_time_ms, 0) / results.length);
      endSessionMut.mutate({
        sessionId,
        cards_reviewed: results.length,
        cards_correct: correctCount,
        avg_recall_time_ms: avgRecallMs,
      });
    }
    endStudySession();
  };

  // Loading state
  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-full" style={{ minHeight: 'calc(100vh - 64px)' }}>
        <div className="text-center">
          <div className="srs-metric-md mb-4" style={{ color: 'var(--srs-cream)' }}>
            {rawDueCards.length === 0 ? '복습할 카드가 없습니다' : '로딩 중...'}
          </div>
          <button className="srs-btn-accent" style={{ width: 64, height: 64 }} onClick={handleClose}>
            Back
          </button>
        </div>
      </div>
    );
  }

  // Session complete - should already have transitioned to review via useEffect
  if (isComplete) {
    return null;
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 64px)', backgroundColor: 'var(--srs-sage)' }}>
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-3" style={{ backgroundColor: 'var(--srs-sage-dark)' }}>
        <button onClick={handleClose} className="p-1" style={{ color: 'var(--srs-cream)' }}>
          <X size={20} />
        </button>
        <span className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--srs-cream)' }}>
          {currentCard.concept || 'Review'}
        </span>
        <SessionProgress
          current={currentIndex + 1}
          total={cards.length}
        />
        <span className="text-sm font-medium ml-auto" style={{ color: 'var(--srs-cream)' }}>
          CARD {currentIndex + 1} / {cards.length}
        </span>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <FlashCard
          card={currentCard}
          isFlipped={isFlipped}
          onFlip={() => setIsFlipped(true)}
        />
      </div>

      {/* Response buttons */}
      {isFlipped && (
        <ResponseButtons
          card={currentCard}
          onResponse={handleResponse}
        />
      )}
    </div>
  );
}
