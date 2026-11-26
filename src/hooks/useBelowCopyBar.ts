/**
 * Whether a surface sits below the phone copy's status bar (WH-298, Design offline-capture.md 1.2). The bar pads for
 * the system status bar itself, so what is below it adds no top inset. The root provides a zero top inset through the
 * safe-area context, which only `useSafeAreaInsets` reads. Two kinds of surface need more than that:
 * - native views (`SafeAreaView`, the stack's native header) measure the window themselves: they read
 *   `useBelowCopyBar` to leave the top edge out;
 * - a Modal covers the bar and the system status bar: it pads by `useWindowInsets`.
 *
 * A portal sheet (`BottomSheetModal`) is drawn at its host, outside the provider, so it needs neither. Outside the
 * provider a screen shown in place of the whole app keeps its top inset.
 */
import { createContext, useContext } from 'react';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

/** The window's own insets while below the bar; null elsewhere. */
export const BelowCopyBarContext = createContext<EdgeInsets | null>(null);

export function useBelowCopyBar(): boolean {
  return useContext(BelowCopyBarContext) !== null;
}

/** The insets for a surface that covers the whole window (a Modal), from wherever it is declared. */
export function useWindowInsets(): EdgeInsets {
  const insets = useSafeAreaInsets();
  return useContext(BelowCopyBarContext) ?? insets;
}
