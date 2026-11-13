/**
 * Flashcard Component with 3D Flip Animation
 * Shows question on front, answer on back.
 */

import React from 'react';
import type { SrsCard } from '../../types/srs.types';

interface FlashCardProps {
  card: SrsCard;
  isFlipped: boolean;
  onFlip: () => void;
}

export function FlashCard({ card, isFlipped, onFlip }: FlashCardProps) {
  const recallPercent = card.repetitions > 0
    ? Math.min(100, Math.round((card.ease_factor / 2.5) * 88))
    : 0;

  return (
    <div className="srs-flashcard-container">
      <div className={`srs-flashcard ${isFlipped ? 'flipped' : ''}`}>
        {/* Front (Question) */}
        <div className="srs-flashcard-face">
          <div className="flex justify-between mb-4">
            <div>
              <div className="srs-section-title-sm" style={{ color: 'var(--srs-teal)' }}>
                SUBJECT AREA
              </div>
              <div className="text-sm font-bold uppercase tracking-wide mt-1">
                {card.concept || '일반'}
              </div>
            </div>
            <div className="text-right">
              <div className="srs-section-title-sm" style={{ color: 'var(--srs-teal)' }}>
                RECALL HISTORY
              </div>
              <div className="text-sm font-bold mt-1">
                {recallPercent}% ACCURACY
              </div>
            </div>
          </div>

          <div className="flex-1 flex items-center">
            <h3
              className="font-black text-2xl md:text-3xl leading-tight"
              style={{ letterSpacing: '-0.02em' }}
            >
              {card.front}
            </h3>
          </div>

          {!isFlipped && (
            <div className="flex justify-end mt-4">
              <button
                className="srs-btn-accent"
                onClick={onFlip}
                style={{ width: 72, height: 72 }}
              >
                FLIP
              </button>
            </div>
          )}
        </div>

        {/* Back (Answer) */}
        <div className="srs-flashcard-face srs-flashcard-back">
          <div className="flex justify-between mb-4">
            <div>
              <div className="srs-section-title-sm" style={{ color: 'var(--srs-teal)' }}>
                ANSWER
              </div>
              <div className="text-sm font-bold uppercase tracking-wide mt-1">
                {card.concept || '일반'}
              </div>
            </div>
          </div>

          <div className="flex-1 flex items-center">
            <p className="text-lg leading-relaxed">
              {card.back}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
