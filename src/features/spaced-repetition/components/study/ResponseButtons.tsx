/**
 * SM-2 Response Buttons (Again / Hard / Good / Easy)
 * With keyboard shortcuts (1-4) and interval preview.
 */

import React, { useEffect, useCallback } from 'react';
import { getIntervalLabel } from '../../utils/sm2Algorithm';
import { QUALITY_LABELS } from '../../types/srs.types';
import type { SrsCard, StudyQuality } from '../../types/srs.types';

interface ResponseButtonsProps {
  card: SrsCard;
  onResponse: (quality: StudyQuality) => void;
}

const QUALITIES: StudyQuality[] = [1, 2, 3, 4];

export function ResponseButtons({ card, onResponse }: ResponseButtonsProps) {
  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const key = parseInt(e.key);
    if (key >= 1 && key <= 4) {
      e.preventDefault();
      onResponse(key as StudyQuality);
    }
  }, [onResponse]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="srs-response-buttons">
      {QUALITIES.map((quality) => {
        const label = QUALITY_LABELS[quality];
        const interval = getIntervalLabel(
          quality,
          card.repetitions,
          card.interval_days,
          card.ease_factor
        );

        return (
          <button
            key={quality}
            className="srs-response-btn"
            onClick={() => onResponse(quality)}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-2"
              style={{
                backgroundColor: quality === 1 || quality === 4 ? 'var(--srs-text)' : 'transparent',
                color: quality === 1 || quality === 4 ? 'white' : 'var(--srs-text)',
                border: quality === 2 || quality === 3 ? '2px solid var(--srs-text)' : 'none',
              }}
            >
              {quality}
            </div>
            <div className="text-xs font-bold uppercase tracking-wider">
              {label.label}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--srs-text-muted)' }}>
              {interval}
            </div>
          </button>
        );
      })}
    </div>
  );
}
