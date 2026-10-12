/**
 * The in-memory central login state (src/config/centralState.ts) for a screen:
 * who is signed in centrally, the facility being opened and its answer.
 */
import { useSyncExternalStore } from 'react';
import { getCentralState, subscribeCentralState, type CentralState } from '@/config/centralState';

export function useCentralState(): CentralState {
  return useSyncExternalStore(subscribeCentralState, getCentralState, getCentralState);
}
