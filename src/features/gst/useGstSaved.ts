/**
 * Whether an administrator has saved the facility's GST details (WH-151): the Home strip "Add your GST details so bills print
 * correctly." shows until then. Read from the server (`get_gst_details`) each time the screen comes into focus, for
 * administrators on a backend with migration 173 only; nothing else asks. A failed read shows no strip.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { backendHasFeature } from '@/config/backendFeatures';
import { canOpenScreen } from '@/config/roles';
import { useAppSelector } from '@/store/hooks';
import { getGstDetails } from '@/services/gstService';

const listeners = new Set<() => void>();

/** The GST details screen saved: the strip asks again. */
export function invalidateGstSaved(): void {
  for (const listener of [...listeners]) listener();
}

/** True only when the server answered that no GST details were ever saved. */
export function useGstNotSaved(): boolean {
  const role = useAppSelector((state) => state.auth.userProfile?.role);
  const enabled = canOpenScreen(role, 'gstDetails') && backendHasFeature('gstDocuments');
  const [notSaved, setNotSaved] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(useCallback(() => setFocusTick((n) => n + 1), []));

  useEffect(() => {
    if (!enabled) {
      setNotSaved(false);
      return undefined;
    }
    let current = true;
    getGstDetails()
      .then((details) => {
        if (current) setNotSaved(!details.saved);
      })
      .catch(() => {
        if (current) setNotSaved(false);
      });
    return () => {
      current = false;
    };
  }, [enabled, tick, focusTick]);

  return enabled && notSaved;
}
