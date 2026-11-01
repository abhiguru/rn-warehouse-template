import { useEffect, useState } from 'react';
import { DEFAULT_RACK_PRESETS, type RackPresets } from './rackPresets';
import { rackPresetsForForm } from '@/services/rackPresetsService';

/**
 * The Floor and Chamber buttons for the item form: the built-in ones at once, the facility's as soon as they are read
 * (cached after the first read). A backend without the setting, or a failed read, keeps the built-in ones.
 */
export function useRackPresets(): RackPresets {
  const [presets, setPresets] = useState<RackPresets>(DEFAULT_RACK_PRESETS);
  useEffect(() => {
    let cancelled = false;
    void rackPresetsForForm().then((next) => {
      if (!cancelled) setPresets(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return presets;
}
