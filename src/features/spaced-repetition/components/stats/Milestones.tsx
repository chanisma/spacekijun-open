/**
 * Milestones Display
 * Shows current level and milestone progress.
 */

import React from 'react';

interface MilestonesProps {
  level: number;
  totalReviews: number;
}

export function Milestones({ level, totalReviews }: MilestonesProps) {
  // Next level threshold: (level)^2 * 50
  const nextLevelThreshold = level * level * 50;
  const currentLevelThreshold = (level - 1) * (level - 1) * 50;
  const progressToNext = nextLevelThreshold > currentLevelThreshold
    ? Math.min(100, Math.round(((totalReviews - currentLevelThreshold) / (nextLevelThreshold - currentLevelThreshold)) * 100))
    : 100;

  return (
    <div
      className="rounded-lg p-6 text-center"
      style={{ backgroundColor: 'var(--srs-accent)', color: 'white' }}
    >
      <div className="srs-section-title-sm mb-2" style={{ color: 'rgba(255,255,255,0.8)' }}>
        MILESTONES
      </div>
      <div className="text-sm font-medium mb-1">Lvl</div>
      <div className="srs-metric" style={{ fontSize: '3rem', color: 'white' }}>
        {level}
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 mt-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2.5 h-2.5 rounded-full"
            style={{
              backgroundColor: i < Math.ceil(progressToNext / 34) ? 'white' : 'rgba(255,255,255,0.3)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
