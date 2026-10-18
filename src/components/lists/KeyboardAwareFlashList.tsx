/**
 * A FlashList that moves a focused text field above the keyboard, as
 * KeyboardAwareScrollView does for a ScrollView. For a screen whose long list
 * of fields is the page itself: the list virtualizes its rows (a FlashList
 * inside a KeyboardAwareScrollView would not), and the content above and below
 * the rows goes into ListHeaderComponent / ListFooterComponent.
 *
 * Built with the library's HOC in its curried form. FlashList 2 exports
 * React.memo(forwardRef(...)) without a displayName, and the non-curried
 * `listenToKeyboardEvents(FlashList)` takes such an object for its options and
 * returns a function instead of a component. The HOC reaches the native
 * scroll view through the list ref's getScrollResponder(), and makes room for
 * the keyboard with contentInset (iOS) or contentContainerStyle.paddingBottom
 * (Android): give contentContainerStyle as one plain object, not an array, or
 * Android loses its own paddingBottom.
 */
import type React from 'react';
import * as KeyboardAware from 'react-native-keyboard-aware-scroll-view';
import { FlashList, type FlashListProps, type FlashListRef } from '@shopify/flash-list';

/** The keyboard props of react-native-keyboard-aware-scroll-view that this list takes. */
export interface KeyboardAwareListProps {
  enableAutomaticScroll?: boolean;
  /** Space between the focused field and the keyboard, on top of extraScrollHeight. */
  extraHeight?: number;
  extraScrollHeight?: number;
  keyboardOpeningTime?: number;
  enableResetScrollToCoords?: boolean;
  /** Receives the list's own ref (scrollToIndex and the rest); a ref on this component would reach the wrapper. */
  innerRef?: (list: FlashListRef<never> | null) => void;
}

type ListenToKeyboardEvents = (options: { enableOnAndroid?: boolean }) => (component: unknown) => unknown;
// The library's type declarations leave the HOC out.
const { listenToKeyboardEvents } = KeyboardAware as unknown as { listenToKeyboardEvents: ListenToKeyboardEvents };

export const KeyboardAwareFlashList = listenToKeyboardEvents({ enableOnAndroid: true })(FlashList) as <T>(
  props: FlashListProps<T> & KeyboardAwareListProps
) => React.ReactElement | null;

export default KeyboardAwareFlashList;
