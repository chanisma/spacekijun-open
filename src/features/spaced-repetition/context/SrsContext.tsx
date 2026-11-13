/**
 * SRS Context Provider
 * Manages view navigation, subject selection, and study session state.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { SrsView, StudySessionState, StudyQuality } from '../types/srs.types';

// Extended context value with session result setter
interface SrsContextValue {
  currentView: SrsView;
  setCurrentView: (view: SrsView) => void;
  selectedSubjectId: string | null;
  setSelectedSubjectId: (id: string | null) => void;
  studySession: StudySessionState | null;
  setStudySession: React.Dispatch<React.SetStateAction<StudySessionState | null>>;
  startStudySession: (subjectId?: string) => void;
  endStudySession: () => void;
  // Preserved results for SessionReview (survives studySession being cleared)
  lastSessionResults: Array<{ card_id: string; quality: StudyQuality; recall_time_ms: number }>;
}

const SrsContext = createContext<SrsContextValue | null>(null);

export function useSrsContext(): SrsContextValue {
  const context = useContext(SrsContext);
  if (!context) {
    throw new Error('useSrsContext must be used within SrsProvider');
  }
  return context;
}

interface SrsProviderProps {
  children: React.ReactNode;
}

export function SrsProvider({ children }: SrsProviderProps) {
  const [currentView, setCurrentView] = useState<SrsView>('dashboard');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [studySession, setStudySession] = useState<StudySessionState | null>(null);
  const [lastSessionResults, setLastSessionResults] = useState<
    Array<{ card_id: string; quality: StudyQuality; recall_time_ms: number }>
  >([]);

  const startStudySession = useCallback((_subjectId?: string) => {
    setStudySession({
      sessionId: null,
      cards: [],
      currentIndex: 0,
      isFlipped: false,
      startedAt: new Date(),
      cardStartedAt: new Date(),
      results: [],
    });
    if (_subjectId) {
      setSelectedSubjectId(_subjectId);
    }
    setCurrentView('study');
  }, []);

  // Custom setCurrentView that preserves results when transitioning to review
  const handleSetCurrentView = useCallback((view: SrsView) => {
    if (view === 'review' && studySession?.results) {
      setLastSessionResults([...studySession.results]);
    }
    setCurrentView(view);
  }, [studySession]);

  const endStudySession = useCallback(() => {
    // Preserve results before clearing session
    if (studySession?.results && studySession.results.length > 0) {
      setLastSessionResults([...studySession.results]);
    }
    setStudySession(null);
    setCurrentView('dashboard');
  }, [studySession]);

  const value: SrsContextValue = {
    currentView,
    setCurrentView: handleSetCurrentView,
    selectedSubjectId,
    setSelectedSubjectId,
    studySession,
    setStudySession,
    startStudySession,
    endStudySession,
    lastSessionResults,
  };

  return (
    <SrsContext.Provider value={value}>
      {children}
    </SrsContext.Provider>
  );
}
