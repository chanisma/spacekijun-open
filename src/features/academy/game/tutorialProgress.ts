import type { GameProgress } from './progress';
import type { GrowthState } from './growthService';
export function tutorialSteps(progress: GameProgress | null | undefined, state: GrowthState) {
  return [!!progress, !!progress && progress.quest_step !== 'accepted', progress?.quest_step === 'completed', state.hasNewsNote, !!state.tutorial?.telescope_seen, state.discoveries.length > 0 || !!state.hasSelfUnderstanding];
}
