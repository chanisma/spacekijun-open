/**
 * Activity Heatmap (GitHub-style year grid)
 * Shows daily study activity intensity.
 */

import React, { useMemo } from 'react';
import { generateHeatmapData } from '../../utils/srsCalculations';
import type { SrsDailyActivity } from '../../types/srs.types';

interface ActivityHeatmapProps {
  activities: SrsDailyActivity[];
}

export function ActivityHeatmap({ activities }: ActivityHeatmapProps) {
  const year = new Date().getFullYear();
  const heatmapData = useMemo(() => generateHeatmapData(activities), [activities]);

  // Generate all weeks for the year
  const weeks = useMemo(() => {
    const result: string[][] = [];
    const startDate = new Date(year, 0, 1);
    // Adjust to Monday
    const startDay = startDate.getDay();
    const firstMonday = new Date(startDate);
    firstMonday.setDate(firstMonday.getDate() - (startDay === 0 ? 6 : startDay - 1));

    let current = new Date(firstMonday);
    const endDate = new Date(year, 11, 31);

    while (current <= endDate) {
      const week: string[] = [];
      for (let d = 0; d < 7; d++) {
        if (current.getFullYear() === year) {
          week.push(current.toISOString().split('T')[0]);
        } else {
          week.push('');
        }
        current.setDate(current.getDate() + 1);
      }
      result.push(week);
    }

    return result;
  }, [year]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="srs-section-title" style={{ fontSize: '1.5rem' }}>
          Activity<br />Heatmap
        </h3>
        <span className="srs-section-title-sm">YEAR {year}</span>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-[3px]" style={{ minWidth: 'fit-content' }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((dateStr, di) => {
                if (!dateStr) return <div key={di} className="srs-heatmap-cell" />;
                const intensity = heatmapData.get(dateStr) ?? 0;
                return (
                  <div
                    key={di}
                    className={`srs-heatmap-cell srs-heatmap-${intensity}`}
                    title={`${dateStr}: ${intensity > 0 ? `Level ${intensity}` : 'No activity'}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
