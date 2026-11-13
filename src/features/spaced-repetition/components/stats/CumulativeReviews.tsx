/**
 * Cumulative Reviews Line Chart
 * Shows total review count growth over the year.
 */

import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { drawLineProps } from '@/lib/chartAnimation';
import { formatCount, getMonthLabels } from '../../utils/srsFormatters';
import type { SrsDailyActivity } from '../../types/srs.types';

interface CumulativeReviewsProps {
  activities: SrsDailyActivity[];
  totalReviews: number;
}

export function CumulativeReviews({ activities, totalReviews }: CumulativeReviewsProps) {
  const chartData = useMemo(() => {
    const monthLabels = getMonthLabels();
    const monthlyData: Array<{ name: string; cumulative: number }> = [];
    let cumulative = 0;

    // Group by month
    const byMonth = new Map<number, number>();
    for (const a of activities) {
      const month = new Date(a.activity_date).getMonth();
      byMonth.set(month, (byMonth.get(month) ?? 0) + a.cards_reviewed);
    }

    for (let m = 0; m < 12; m++) {
      cumulative += byMonth.get(m) ?? 0;
      monthlyData.push({ name: monthLabels[m], cumulative });
    }

    return monthlyData;
  }, [activities]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="srs-section-title" style={{ fontSize: '1.5rem' }}>
          Cumulative<br />Reviews
        </h3>
        <div className="srs-metric-md">{formatCount(totalReviews)}</div>
      </div>

      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: 'var(--srs-text)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--srs-dark)',
                border: 'none',
                borderRadius: 4,
                color: 'var(--srs-cream)',
                fontSize: 12,
              }}
              formatter={(value: number) => [formatCount(value), 'Reviews']}
            />
            <Line
              {...drawLineProps}
              type="monotone"
              dataKey="cumulative"
              stroke="var(--srs-text)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
