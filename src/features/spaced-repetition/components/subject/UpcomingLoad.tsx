/**
 * Upcoming Load Bar Chart
 * Shows predicted review load for Mon-Fri.
 */

import React from 'react';
import { calculateUpcomingLoad } from '../../utils/sm2Algorithm';
import { getWeekdayLabels } from '../../utils/srsFormatters';
import type { SrsCard } from '../../types/srs.types';

interface UpcomingLoadProps {
  cards: SrsCard[];
}

export function UpcomingLoad({ cards }: UpcomingLoadProps) {
  const load = calculateUpcomingLoad(cards);
  const maxLoad = Math.max(1, ...load);
  const dayLabels = getWeekdayLabels();

  return (
    <div>
      <div className="srs-section-title-sm mb-4">UPCOMING LOAD</div>

      <div className="flex items-end gap-3" style={{ height: 80 }}>
        {load.map((count, i) => (
          <div key={i} className="flex flex-col items-center flex-1">
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height: `${Math.max(4, (count / maxLoad) * 64)}px`,
                backgroundColor: 'var(--srs-text)',
              }}
            />
            <span
              className="text-xs font-bold mt-2"
              style={{ color: 'var(--srs-accent)' }}
            >
              {dayLabels[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
