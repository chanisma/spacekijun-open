import { useEffect, useState } from 'react';

/** Re-reading dialogue never rewinds the persisted bookmark or repeats a chapter action. */
export function useChapterPlayback(savedStep: number) {
  const [replayStep, setReplayStep] = useState<number | null>(null);
  useEffect(() => setReplayStep(null), [savedStep]);
  const step = Math.min(replayStep ?? savedStep, savedStep);
  return {
    step,
    reviewing: step < savedStep,
    back: () => setReplayStep(Math.max(0, step - 1)),
    forward: () => setReplayStep(step + 1 < savedStep ? step + 1 : null),
    resume: () => setReplayStep(null),
  };
}
