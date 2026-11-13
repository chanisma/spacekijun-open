/**
 * Next Session Panel (Right Column of Review)
 * Shows when the next session is scheduled.
 */

import React from 'react';

interface NextSessionProps {
  nextDate: { month: string; day: number; time: string } | null;
}

export function NextSession({ nextDate }: NextSessionProps) {
  return (
    <div>
      <h2 className="srs-section-title mb-8" style={{ fontSize: '1.5rem' }}>
        Next<br />Session
      </h2>

      {nextDate ? (
        <div className="text-center">
          <div className="srs-section-title-sm mb-2">SCHEDULED FOR</div>
          <div className="srs-metric" style={{ fontSize: '3rem', lineHeight: 0.9 }}>
            {nextDate.month}
          </div>
          <div className="srs-metric" style={{ fontSize: '5rem', lineHeight: 1 }}>
            {nextDate.day}
          </div>
          <div className="text-sm font-medium mt-2" style={{ color: 'var(--srs-accent)' }}>
            {nextDate.time}
          </div>
        </div>
      ) : (
        <div className="text-center">
          <div className="srs-section-title-sm mb-2">NO CARDS DUE</div>
          <p className="text-sm" style={{ color: 'var(--srs-text-muted)' }}>
            모든 카드를 마스터했습니다!
          </p>
        </div>
      )}
    </div>
  );
}
