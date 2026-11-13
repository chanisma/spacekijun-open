/**
 * Session Review View (Screen 4)
 * Post-session summary with accuracy, retention gain, next session.
 */

import React from 'react';
import { useSrsContext } from '../../context/SrsContext';
import { useSrsSubjectsWithStats } from '../../hooks/useSrsSubjects';
import { useSrsDueCards } from '../../hooks/useSrsCards';
import { estimateNextSessionTime } from '../../utils/srsCalculations';
import { formatSessionDate, formatRecallTime } from '../../utils/srsFormatters';
import { SrsLayout } from '../layout/SrsLayout';
import { AccuracyPanel } from './AccuracyPanel';
import { NextSession } from './NextSession';

export function SessionReview() {
  const { endStudySession, studySession, lastSessionResults, setCurrentView } = useSrsContext();
  const { data: subjects = [] } = useSrsSubjectsWithStats();
  const { data: allCards = [] } = useSrsDueCards();

  // Use lastSessionResults (preserved in context) or fall back to studySession
  const results = lastSessionResults.length > 0 ? lastSessionResults : (studySession?.results || []);

  const handleDone = () => {
    setCurrentView('dashboard');
  };
  const totalReviewed = results.length;
  const correctCount = results.filter((r) => r.quality >= 3).length;
  const retentionRate = totalReviewed > 0 ? Math.round((correctCount / totalReviewed) * 100) : 0;
  const totalTimeMs = results.reduce((sum, r) => sum + r.recall_time_ms, 0);
  const avgRecallMs = totalReviewed > 0 ? Math.round(totalTimeMs / totalReviewed) : 0;

  const nextSessionDate = estimateNextSessionTime(allCards);
  const sessionDateFormatted = nextSessionDate ? formatSessionDate(nextSessionDate) : null;

  return (
    <SrsLayout
      left={<AccuracyPanel subjects={subjects} results={results} />}
      center={
        <div className="flex flex-col items-center justify-center h-full">
          <div className="text-right self-end mb-4">
            <button onClick={handleDone} style={{ color: 'var(--srs-text-muted)' }}>
              ✕
            </button>
          </div>

          <h2 className="srs-section-title text-center mb-8">
            Queue<br />Complete
          </h2>

          {/* Retention gain */}
          <div className="mb-6">
            <div className="srs-section-title-sm mb-2">RETENTION GAIN</div>
            <div className="srs-metric">
              +{(retentionRate / 20).toFixed(1)}<span className="srs-metric-unit">%</span>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-6 w-full max-w-sm mt-4" style={{ borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 20 }}>
            <div>
              <div className="srs-section-title-sm mb-1">TIME SPENT</div>
              <div className="srs-metric-md">
                {Math.floor(totalTimeMs / 60000)}:{String(Math.floor((totalTimeMs % 60000) / 1000)).padStart(2, '0')}
              </div>
            </div>
            <div>
              <div className="srs-section-title-sm mb-1">AVG RECALL</div>
              <div className="srs-metric-md">{formatRecallTime(avgRecallMs)}</div>
            </div>
          </div>

          {/* Total cards + Done */}
          <div className="flex items-center justify-between w-full max-w-sm mt-8">
            <div>
              <div className="srs-section-title-sm">TOTAL CARDS</div>
              <div className="srs-metric" style={{ fontSize: '3rem' }}>{totalReviewed}</div>
            </div>
            <button
              className="srs-btn-accent"
              onClick={handleDone}
            >
              Done
            </button>
          </div>
        </div>
      }
      right={
        <NextSession
          nextDate={sessionDateFormatted}
        />
      }
    />
  );
}
