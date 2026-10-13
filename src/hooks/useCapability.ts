/**
 * The capabilities of the facility the app is connected to (src/config/facilityCapabilities.ts)
 * for a screen. Renders again when they are recorded and when the active server changes.
 */
import { useSyncExternalStore } from 'react';
import {
  getFacilityCapabilities,
  subscribeFacilityCapabilities,
  type CapabilityName,
  type FacilityCapabilities,
} from '@/config/facilityCapabilities';
import { onOperatorServerChange } from '@/config/operatorServer';

function subscribe(listener: () => void): () => void {
  const stopCapabilities = subscribeFacilityCapabilities(listener);
  const stopServer = onOperatorServerChange(listener);
  return () => {
    stopCapabilities();
    stopServer();
  };
}

export function useFacilityCapabilities(): FacilityCapabilities {
  return useSyncExternalStore(subscribe, getFacilityCapabilities, getFacilityCapabilities);
}

export function useCapability(name: CapabilityName): boolean {
  return useFacilityCapabilities()[name];
}
