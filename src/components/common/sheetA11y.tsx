import React, { memo, type ComponentProps } from 'react';
import { View } from 'react-native';
import { BottomSheetHandle, type BottomSheetBackgroundProps } from '@gorhom/bottom-sheet';

/**
 * Screen-reader settings shared by every @gorhom/bottom-sheet the app opens.
 *
 * The library speaks its own English words ("Bottom Sheet", "Bottom sheet handle",
 * "Bottom sheet backdrop"), also on a Gujarati screen. A sheet is announced by its
 * title, its close button closes it for a screen reader, and neither the handle nor
 * the backdrop is a stop of its own. Looks and touch behaviour do not change.
 *
 * - `accessible={false}` on the sheet turns off the content container (the first
 *   "Bottom Sheet"); the children stay reachable on their own.
 * - `backgroundComponent` replaces the library's background, which has a fixed
 *   "Bottom Sheet" label (the second one).
 * - `handleComponent` is the library's own handle with its label, role and hint off.
 * - `SHEET_BACKDROP_A11Y` goes on every BottomSheetBackdrop.
 */

// The library's own default background style, copied from
// @gorhom/bottom-sheet src/components/bottomSheetBackground/styles.ts (a library
// default, not a design value), so the replacement looks identical.
const LIBRARY_BACKGROUND_DEFAULT = { backgroundColor: 'white', borderRadius: 15 } as const;

function SheetBackgroundComponent({ pointerEvents, style }: BottomSheetBackgroundProps) {
  return (
    <View
      pointerEvents={pointerEvents}
      style={[LIBRARY_BACKGROUND_DEFAULT, style]}
      accessible={false}
      importantForAccessibility="no"
      accessibilityElementsHidden
    />
  );
}
const SheetBackground = memo(SheetBackgroundComponent);

function SheetHandleComponent(props: ComponentProps<typeof BottomSheetHandle>) {
  return (
    <BottomSheetHandle
      {...props}
      accessible={false}
      accessibilityRole={null}
      accessibilityLabel={null}
      accessibilityHint={null}
    />
  );
}
const SheetHandle = memo(SheetHandleComponent);

/** Spread on every BottomSheet and BottomSheetModal. */
export const SHEET_A11Y = {
  accessible: false,
  accessibilityRole: null,
  accessibilityLabel: null,
  backgroundComponent: SheetBackground,
  handleComponent: SheetHandle,
} as const;

/** Spread on every BottomSheetBackdrop; a tap on it still closes the sheet as before. */
export const SHEET_BACKDROP_A11Y = {
  accessible: false,
  accessibilityRole: null,
  accessibilityLabel: null,
} as const;
