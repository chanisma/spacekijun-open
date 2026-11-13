/**
 * Session Accuracy Panel (Left Column of Review)
 * Shows per-subject accuracy breakdown.
 */

import React from 'react';
import type { SubjectWithStats, StudyQuality } from '../../types/srs.types';

interface AccuracyPanelProps {
  subjects: SubjectWithStats[];
  results: Array<{ card_id: string; quality: StudyQuality; recall_time_ms: number }>;
}

export function AccuracyPanel({ subjects, results }: AccuracyPanelProps) {
  // Calculate overall accuracy
  const totalCorrect = results.filter((r) => r.quality >= 3).length;
  const overallAccuracy = results.length > 0 ? Math.round((totalCorrect / results.length) * 100) : 0;

  return (
    <div>
      <h2 className="srs-section-title mb-6" style={{ color: 'var(--srs-cream)', fontSize: '1.5rem' }}>
        Session<br />Accuracy
      </h2>

      <div className="space-y-3">
        {subjects.slice(0, 5).map((subject) => {
          const accuracy = subject.avg_retention ?? overallAccuracy;

          return (
            <div key={subject.id} className="mb-3">
              <div className="flex justify-between mb-1">
                <span className="text-xs font-bold uppercase" style={{ color: 'var(--srs-cream)' }}>
                  {subject.name}
                </span>
                <span className="text-xs font-bold" style={{ color: 'var(--srs-cream)' }}>
                  {accuracy}%
                </span>
              </div>
              <div className="h-2 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${accuracy}%`,
                    backgroundColor: accuracy >= 80 ? '#3b82f6' : accuracy >= 60 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
