import type { AppStateStatus } from 'react-native';

export const RESUME_HANDOFF_GRACE_MS = 10 * 60 * 1000;

type ResumeGate = {
  suspend(): void;
  ensureVerified(): Promise<boolean>;
};

export type ResumeLifecycleOptions = {
  gate: ResumeGate;
  /** True while a native hand-off or a multi-request mutation is in progress. */
  isHandoffActive: () => boolean;
  /** A hand-off that outlives this window is treated as a real background stay. */
  graceMs?: number;
  now?: () => number;
  initialState?: AppStateStatus;
};

// Suspend credentialed work only for a real background stay: never for the
// 'inactive' blip of a system dialog, and not for a camera, picker or share
// round trip unless it outlives the grace window. Returning to 'active'
// re-runs public identity verification when something was suspended.
export function createResumeLifecycle({
  gate,
  isHandoffActive,
  graceMs = RESUME_HANDOFF_GRACE_MS,
  now = Date.now,
  initialState = 'active',
}: ResumeLifecycleOptions): (state: AppStateStatus) => void {
  let previous: AppStateStatus = initialState;
  let deferredSince: number | undefined;
  return state => {
    if (state === 'background') {
      if (isHandoffActive()) deferredSince ??= now();
      else {
        deferredSince = undefined;
        gate.suspend();
      }
    } else if (state === 'active') {
      if (deferredSince !== undefined && now() - deferredSince > graceMs) gate.suspend();
      deferredSince = undefined;
      if (previous !== 'active') {
        void gate.ensureVerified().catch(() => {
          // Keep local state and the gate closed; normal reads can retry discovery.
        });
      }
    }
    previous = state;
  };
}
