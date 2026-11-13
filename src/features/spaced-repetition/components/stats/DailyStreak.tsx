/**
 * Daily Streak Display (Left Column of Stats)
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';

interface DailyStreakProps {
  currentStreak: number;
  bestStreak: number;
  lastActiveAt: string | null;
  onBack: () => void;
}

export function DailyStreak({ currentStreak, bestStreak, lastActiveAt, onBack }: DailyStreakProps) {
  const lastActiveLabel = lastActiveAt
    ? new Date(lastActiveAt).toDateString() === new Date().toDateString()
      ? `TODAY, ${new Date(lastActiveAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
      : new Date(lastActiveAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Never';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="srs-section-title" style={{ color: 'var(--srs-cream)', fontSize: '1.5rem' }}>
          Daily<br />Streak
        </h2>
        <ChevronDown size={20} style={{ color: 'var(--srs-cream)' }} />
      </div>

      <div className="srs-metric mb-2" style={{ color: 'var(--srs-cream)' }}>
        {currentStreak}
      </div>
      <div className="srs-section-title-sm mb-8" style={{ color: 'var(--srs-sage-muted)' }}>
        DAYS ACTIVE
      </div>

      <div className="srs-card-dark p-4 mb-6">
        <div className="srs-section-title-sm mb-1" style={{ color: 'var(--srs-sage-muted)' }}>
          BEST STREAK
        </div>
        <div className="srs-metric-md" style={{ color: 'var(--srs-cream)' }}>
          {bestStreak}
        </div>
      </div>

      <div className="mb-8">
        <div className="srs-section-title-sm mb-1" style={{ color: 'var(--srs-sage-muted)' }}>
          LAST ACTIVE
        </div>
        <div className="text-sm font-bold" style={{ color: 'var(--srs-cream)' }}>
          {lastActiveLabel}
        </div>
      </div>

      <button
        className="srs-btn-dark"
        style={{ width: 56, height: 56, fontSize: '0.7rem' }}
        onClick={onBack}
      >
        Back
      </button>
    </div>
  );
}
