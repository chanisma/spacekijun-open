/**
 * Spaced Repetition Queue (Center Column)
 * Shows total due cards and start button.
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useSrsContext } from '../../context/SrsContext';
import { useSrsDueCards } from '../../hooks/useSrsCards';
import type { SubjectWithStats } from '../../types/srs.types';

interface RepetitionQueueProps {
  subjects: SubjectWithStats[];
}

export function RepetitionQueue({ subjects }: RepetitionQueueProps) {
  const { startStudySession, setCurrentView } = useSrsContext();
  const { data: dueCards = [] } = useSrsDueCards();

  const totalDue = dueCards.length;
  const totalCards = subjects.reduce((sum, s) => sum + s.total_cards, 0);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full max-w-md">
      <div className="flex items-center gap-2 mb-8">
        <h2 className="srs-section-title text-center">
          Spaced<br />Repetition<br />Queue
        </h2>
        <ChevronDown size={20} style={{ color: 'var(--srs-text)' }} />
      </div>

      {/* Due card count */}
      <div className="srs-metric mb-8" style={{ fontSize: '6rem' }}>
        {totalDue}
      </div>

      {/* Stats row */}
      <div className="flex gap-8 mb-8 text-center">
        <div>
          <div className="srs-section-title-sm">Total Cards</div>
          <div className="srs-metric-sm mt-1">{totalCards}</div>
        </div>
        <div>
          <div className="srs-section-title-sm">Due Today</div>
          <div className="srs-metric-sm mt-1">{totalDue}</div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-4 items-center">
        <button
          className="srs-btn-accent"
          onClick={() => startStudySession()}
          disabled={totalDue === 0}
          style={{ opacity: totalDue === 0 ? 0.5 : 1 }}
        >
          Start
        </button>
        <button
          className="srs-btn-dark"
          style={{ width: 48, height: 48, fontSize: '1.2rem' }}
          onClick={() => setCurrentView('stats')}
          title="통계 보기"
        >
          ···
        </button>
      </div>
    </div>
  );
}
