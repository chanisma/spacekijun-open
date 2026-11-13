/**
 * Spaced Repetition System - Main Entry Point
 *
 * View-based routing within the feature:
 * - dashboard: Main overview with subjects, queue, forgetting curve
 * - study: Flashcard review session
 * - subject: Individual subject detail with concept breakdown
 * - review: Post-session summary
 * - stats: Long-term analytics (heatmap, streaks, milestones)
 */

import { Layout } from '@/components/layout/Layout';
import { SrsProvider, useSrsContext } from './context/SrsContext';
import { useSrsSubjectsWithStats } from './hooks/useSrsSubjects';

// Dashboard components
import { ActiveSubjects } from './components/dashboard/ActiveSubjects';
import { RepetitionQueue } from './components/dashboard/RepetitionQueue';
import { ForgettingCurve } from './components/dashboard/ForgettingCurve';
import { EmptyState } from './components/onboarding/EmptyState';

// Study components
import { StudySession } from './components/study/StudySession';

// Subject detail components
import { SubjectDetail } from './components/subject/SubjectDetail';

// Session review components
import { SessionReview } from './components/review/SessionReview';

// Stats components
import { StatsView } from './components/stats/StatsView';

// Layout
import { SrsLayout } from './components/layout/SrsLayout';

// Theme styles
import './index.css';

function SrsContent() {
  const { currentView } = useSrsContext();
  const { data: subjects = [], isLoading } = useSrsSubjectsWithStats();

  const hasSubjects = subjects.length > 0;

  // Study session is a full-screen view
  if (currentView === 'study') {
    return (
      <div className="srs-theme">
        <StudySession />
      </div>
    );
  }

  // Session review is a full-screen view
  if (currentView === 'review') {
    return (
      <div className="srs-theme">
        <SessionReview />
      </div>
    );
  }

  // Subject detail view
  if (currentView === 'subject') {
    return (
      <div className="srs-theme">
        <SubjectDetail />
      </div>
    );
  }

  // Stats view
  if (currentView === 'stats') {
    return (
      <div className="srs-theme">
        <StatsView />
      </div>
    );
  }

  // Dashboard (default) - shows onboarding if no subjects
  return (
    <div className="srs-theme">
      {!isLoading && !hasSubjects ? (
        <EmptyState />
      ) : (
        <SrsLayout
          left={<ActiveSubjects subjects={subjects} isLoading={isLoading} />}
          center={<RepetitionQueue subjects={subjects} />}
          right={<ForgettingCurve subjects={subjects} />}
        />
      )}
    </div>
  );
}

export default function SpacedRepetitionApp() {
  return (
    <Layout>
      <SrsProvider>
        <SrsContent />
      </SrsProvider>
    </Layout>
  );
}
