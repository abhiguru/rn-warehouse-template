/**
 * Whether a screen sits below the phone copy's status bar (WH-298, Design offline-capture.md 1.2). The bar pads for
 * the system status bar itself, so what is below it adds no top inset. The root provides a zero top inset through the
 * safe-area context, which only `useSafeAreaInsets` reads. Native views (`SafeAreaView`, the stack's native header)
 * measure the window themselves and read this to leave the top edge out.
 *
 * False outside the provider, so a screen shown in place of the whole app keeps its top inset.
 */
import { createContext, useContext } from 'react';

export const BelowCopyBarContext = createContext(false);

export function useBelowCopyBar(): boolean {
  return useContext(BelowCopyBarContext);
}
