/**
 * Session Progress Bar
 * Shows progress through the study session.
 */

import React from 'react';

interface SessionProgressProps {
  current: number;
  total: number;
}

export function SessionProgress({ current, total }: SessionProgressProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3 flex-1">
      <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--srs-cream)' }}>
        Session Progress
      </span>
      <div className="srs-progress-bar flex-1">
        <div
          className="srs-progress-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
