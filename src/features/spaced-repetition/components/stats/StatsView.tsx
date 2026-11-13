/**
 * Stats View (Screen 5)
 * Long-term analytics: heatmap, streak, cumulative reviews, milestones.
 */

import React from 'react';
import { useSrsContext } from '../../context/SrsContext';
import { useSrsUserStats, useSrsDailyActivity } from '../../hooks/useSrsStats';
import { formatTotalHours, formatAvgMinutesPerDay, formatCount } from '../../utils/srsFormatters';
import { SrsLayout } from '../layout/SrsLayout';
import { DailyStreak } from './DailyStreak';
import { ActivityHeatmap } from './ActivityHeatmap';
import { CumulativeReviews } from './CumulativeReviews';
import { Milestones } from './Milestones';

export function StatsView() {
  const { setCurrentView } = useSrsContext();
  const { data: stats } = useSrsUserStats();
  const { data: activities = [] } = useSrsDailyActivity();

  const retentionRate = stats?.retention_rate ?? 0;
  const totalTimeHrs = formatTotalHours(stats?.total_time_seconds ?? 0);
  const activeDays = activities.length;
  const avgMinsPerDay = formatAvgMinutesPerDay(stats?.total_time_seconds ?? 0, activeDays);

  return (
    <SrsLayout
      left={
        <DailyStreak
          currentStreak={stats?.current_streak ?? 0}
          bestStreak={stats?.best_streak ?? 0}
          lastActiveAt={stats?.last_active_at ?? null}
          onBack={() => setCurrentView('dashboard')}
        />
      }
      center={
        <div className="w-full" style={{ alignSelf: 'flex-start', padding: '24px' }}>
          <ActivityHeatmap activities={activities} />
          <div className="mt-8">
            <CumulativeReviews activities={activities} totalReviews={stats?.total_reviews ?? 0} />
          </div>
        </div>
      }
      right={
        <div>
          {/* Retention Rate */}
          <div className="mb-6">
            <div className="srs-section-title-sm" style={{ color: 'var(--srs-accent)' }}>RETENTION RATE</div>
            <div className="srs-metric mt-1">
              {Math.round(retentionRate)}<span className="srs-metric-unit">%</span>
            </div>
          </div>

          <div className="border-t mb-6" style={{ borderColor: 'var(--srs-border)' }} />

          {/* Total Time */}
          <div className="mb-6">
            <div className="srs-section-title-sm">TOTAL TIME</div>
            <div className="srs-metric mt-1">
              {totalTimeHrs}<span className="srs-metric-unit">hrs</span>
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--srs-text-muted)' }}>
              Avg. {avgMinsPerDay} mins / day
            </div>
          </div>

          <div className="border-t mb-6" style={{ borderColor: 'var(--srs-border)' }} />

          {/* Milestones */}
          <Milestones level={stats?.level ?? 1} totalReviews={stats?.total_reviews ?? 0} />
        </div>
      }
    />
  );
}
