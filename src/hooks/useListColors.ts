/**
 * Legacy list palette (adapter).
 *
 * Older list screens read a flat palette of named colours from this hook. Every
 * value is now derived from the semantic tokens for the current brand and mode,
 * so unmigrated screens follow Settings → Brand and Appearance. New code reads
 * tokens directly (`useThemedStyles`, `useTokens`; see docs/STYLE_GUIDE.md).
 * This adapter is deleted in migration phase 6.
 */

import { useMemo } from 'react';
import { useTokens } from './useTheme';
import { buildListRowPalette } from '@/components/lists/types';

/** Map the semantic tokens onto the legacy palette keys. */
export const buildLegacyListPalette = buildListRowPalette;

/** Theme-aware legacy list palette for the current brand and mode. */
function useLegacyListPalette() {
  const tokens = useTokens();
  return useMemo(() => buildListRowPalette(tokens), [tokens]);
}

export type ListColors = ReturnType<typeof buildListRowPalette>;

// The public name is kept for the unmigrated screens that still import it.
export { useLegacyListPalette as useListColors };
export default useLegacyListPalette;
