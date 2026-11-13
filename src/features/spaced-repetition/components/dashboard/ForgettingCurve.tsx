/**
 * Forgetting Curve Panel (Right Column)
 * Shows retention donut chart, key metrics, and toggleable review log.
 */

import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useSrsUserStats, useSrsRecentReviews } from '../../hooks/useSrsStats';
import { QUALITY_LABELS } from '../../types/srs.types';
import type { SubjectWithStats } from '../../types/srs.types';

interface ForgettingCurveProps {
  subjects: SubjectWithStats[];
}

export function ForgettingCurve({ subjects }: ForgettingCurveProps) {
  const { data: stats } = useSrsUserStats();
  const { data: recentReviews = [] } = useSrsRecentReviews(15);
  const [showLog, setShowLog] = useState(false);

  const retentionRate = stats?.retention_rate ?? 0;
  const totalReviews = stats?.total_reviews ?? 0;

  const chartData = [
    { name: 'Retained', value: retentionRate || 1 },
    { name: 'Forgotten', value: (100 - retentionRate) || 99 },
  ];

  const COLORS = ['var(--srs-accent)', 'var(--srs-cream-dark)'];

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '방금';
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  };

  return (
    <div>
      <h2 className="srs-section-title mb-6" style={{ fontSize: '1.5rem' }}>
        Forgetting<br />Curve
      </h2>

      {!showLog ? (
        <>
          {/* Donut Chart */}
          <div className="relative mb-6" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {chartData.map((_entry, index) => (
                    <Cell key={index} fill={COLORS[index]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ pointerEvents: 'none' }}
            >
              <div className="text-center">
                <div className="srs-metric-md">{Math.round(retentionRate)}</div>
                <div className="srs-section-title-sm">%</div>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="srs-card p-4">
              <div className="srs-metric-md">{Math.round(retentionRate)}</div>
              <div className="srs-section-title-sm mt-1">Retention</div>
            </div>
            <div className="srs-card p-4">
              <div className="srs-metric-md">
                {totalReviews > 999 ? `${(totalReviews / 1000).toFixed(1)}k` : totalReviews}
              </div>
              <div className="srs-section-title-sm mt-1">Reviews</div>
            </div>
          </div>
        </>
      ) : (
        /* Review Log */
        <div>
          <div className="srs-section-title-sm mb-3">RECENT REVIEWS</div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {recentReviews.length === 0 ? (
              <div className="text-xs text-center py-6" style={{ color: 'var(--srs-text-light)' }}>
                아직 리뷰 기록이 없습니다.
              </div>
            ) : (
              recentReviews.map((review) => {
                const qualityInfo = QUALITY_LABELS[review.quality as 1 | 2 | 3 | 4];
                return (
                  <div
                    key={review.id}
                    style={{ padding: '8px 0', borderBottom: '1px solid var(--srs-border)' }}
                  >
                    {/* Row 1: quality badge + time */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="font-bold px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor:
                            review.quality === 1 ? 'var(--srs-accent)' :      // Again: orange
                            review.quality === 2 ? 'var(--srs-sage-dark)' :   // Hard: sage dark
                            review.quality === 3 ? 'var(--srs-teal)' :        // Good: teal
                            'var(--srs-text)',                                  // Easy: black
                          color: 'white',
                          fontSize: '0.6rem',
                          lineHeight: 1,
                        }}
                      >
                        {qualityInfo?.label || review.quality}
                      </span>
                      <span style={{ color: 'var(--srs-text-light)', fontSize: '0.65rem' }}>
                        {formatTimeAgo(review.reviewed_at)}
                      </span>
                    </div>
                    {/* Row 2: question text (full, wrapped) */}
                    <div className="text-xs font-medium leading-snug" style={{ color: 'var(--srs-text)' }}>
                      {review.card_front}
                    </div>
                    {/* Row 3: subject + concept */}
                    <div style={{ color: 'var(--srs-text-muted)', fontSize: '0.65rem', marginTop: 2 }}>
                      {review.subject_name}
                      {review.card_concept && ` · ${review.card_concept}`}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Log toggle button */}
      <div className="flex justify-end mt-4">
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
          style={{
            backgroundColor: showLog ? 'var(--srs-text)' : 'transparent',
            color: showLog ? 'var(--srs-cream)' : 'var(--srs-text-muted)',
            border: showLog ? 'none' : '1px solid var(--srs-border)',
          }}
          onClick={() => setShowLog(!showLog)}
        >
          {showLog ? 'Chart' : 'Log'}
        </button>
      </div>
    </div>
  );
}
