/**
 * The invoice items editor wired to the real invoice-form slice, for its tests. A test mocks
 * `@/store/hooks` with `storeHooks(() => store)` from invoiceFixtures, so typing in a cell changes the
 * store and the amounts follow, as on the screen. No jest globals here.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireEvent, screen } from '@testing-library/react-native';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { applySavedRates, bulkUpdateItemGroupPricing, updateEditedItem } from '@/store/slices/invoiceFormSlice';
import { InvoiceItemsEditor, type InvoiceItemsEditorHandle } from '@/features/invoice/components/items/InvoiceItemsEditor';
import type { InvoiceItemData } from '@/types/invoice.types';

interface State {
  invoiceForm: { items: InvoiceItemData[]; itemOverrides: Record<string, string[]> };
}

export function ConnectedEditor({
  oneTime = false,
  editorRef,
}: {
  oneTime?: boolean;
  editorRef?: React.Ref<InvoiceItemsEditorHandle>;
}) {
  const dispatch = useAppDispatch();
  const items = useAppSelector((state) => (state as unknown as State).invoiceForm.items);
  const itemOverrides = useAppSelector((state) => (state as unknown as State).invoiceForm.itemOverrides);
  // The app's root layout wraps every screen in GestureHandlerRootView; gesture-handler 3 requires it, tests included.
  return (
    <GestureHandlerRootView>
    <InvoiceItemsEditor
      ref={editorRef}
      items={items}
      oneTime={oneTime}
      itemOverrides={itemOverrides}
      onItemUpdate={(temp_id, field, value) => dispatch(updateEditedItem({ temp_id, values: { [field]: value } }))}
      onBulkEdit={(group_key, pricing) => dispatch(bulkUpdateItemGroupPricing({ group_key, pricing }))}
      onRestoreRates={(rates) => dispatch(applySavedRates(rates))}
    />
    </GestureHandlerRootView>
  );
}

/** A rendered host element (Testing Library exports no name for the type). */
export type Host = ReturnType<typeof screen.getByRole>;

/** The input with this test id (`cell|<temp_id>|charge`, `group|<item>:::<mark>|tax`). */
export const inputOf = (testID: string): Host => screen.getByTestId(testID);
export const hasInput = (testID: string): boolean => screen.queryByTestId(testID) !== null;

/** Every Text on screen, flattened to its string (a no-break space reads as a space). */
export const textsOf = (): string[] =>
  screen.root!
    .queryAll((node) => node.type === 'Text', { includeSelf: true })
    .map((node) => node.children.filter((child) => typeof child === 'string').join('').replace(/\u00a0/g, ' '));

/**
 * The test ids of the inputs that `focus()` (or `blur()`) was called on, in order. The test renderer gives every
 * TextInput the same `focus` and `blur` mock; its recorded `this` tells which input each call was for. The mocks
 * keep their calls for the whole file: a test that counts them clears them first (`clearFocused()`).
 */
type RecordedCalls = { mock: { contexts: Array<{ props?: { testID?: string } } | undefined> }; mockClear: () => void };
const inputMock = (name: 'focus' | 'blur') => (TextInput.prototype as unknown as Record<'focus' | 'blur', RecordedCalls>)[name];
export const focusedIds = (): string[] => inputMock('focus').mock.contexts.map((context) => String(context?.props?.testID));
export const blurredIds = (): string[] => inputMock('blur').mock.contexts.map((context) => String(context?.props?.testID));
export const clearFocused = (): void => { inputMock('focus').mockClear(); inputMock('blur').mockClear(); };

/**
 * The real `TextInput` mode. A test file that calls these starts with
 * `jest.unmock('react-native/Libraries/Components/TextInput/TextInput')`: react-native's own input
 * releases the caller's ref and sets it again on every key it reports (`setLocalRef` depends on the
 * event count), which its jest mock does not, and the editor has to hold up under that. The host input
 * (the node with the test id) is driven with the events the device sends.
 */
const NATIVE_TARGET = 7;
export const hostInputOf = (testID: string): Host => screen.getByTestId(testID);
/** The focus event of the native input. */
export const hostFocus = async (testID: string): Promise<void> => {
  await fireEvent(hostInputOf(testID), 'focus', { nativeEvent: { target: NATIVE_TARGET } });
};
/** One key: the whole text now, and the number of events so far (the native input counts them). */
export const hostKey = async (testID: string, text: string, eventCount: number): Promise<void> => {
  await fireEvent(hostInputOf(testID), 'change', { nativeEvent: { text, eventCount, target: NATIVE_TARGET } });
};
export const hostBlur = async (testID: string): Promise<void> => {
  await fireEvent(hostInputOf(testID), 'blur', { nativeEvent: { target: NATIVE_TARGET } });
};
/** What the host input shows. */
export const hostText = (testID: string): string => String(hostInputOf(testID).props.text ?? hostInputOf(testID).props.value);

/** Calls the handlers registered for a keyboard event, from the recorded calls of a spy on `Keyboard.addListener`. */
export const emitKeyboard = (calls: ReadonlyArray<readonly unknown[]>, event: string): void => {
  calls.filter(([name]) => name === event).forEach(([, handler]) => (handler as () => void)());
};

/**
 * What the editor holds inside, which no screen text shows. Testing Library shows host views only, so these two
 * readers search the component tree (`unstable_fiber`) for the component the test is about.
 */
export interface FiberLike {
  type?: unknown;
  memoizedProps?: Record<string, any>;
  stateNode?: any;
  child: FiberLike | null;
  sibling: FiberLike | null;
  return: FiberLike | null;
}
/** The first component in the tree (in tree order) that `matches`; throws when there is none. */
export const findFiber = (matches: (fiber: FiberLike) => boolean): FiberLike => {
  let top = screen.root!.unstable_fiber as FiberLike | null;
  while (top?.return) top = top.return;
  // React keeps two copies of the tree; the root's `current` is the one that is on screen.
  top = top?.stateNode?.current ?? top;
  const visit = (fiber: FiberLike | null): FiberLike | undefined => {
    for (let node = fiber; node; node = node.sibling) {
      if (matches(node)) return node;
      const found = visit(node.child);
      if (found) return found;
    }
    return undefined;
  };
  const found = visit(top);
  if (!found) throw new Error('the component the test reads is not in the tree');
  return found;
};
const findProps = (matches: (props: Record<string, any>) => boolean): Record<string, any> =>
  findFiber((fiber) => !!fiber.memoizedProps && matches(fiber.memoizedProps)).memoizedProps!;


/** The text the editor holds for a line's charge entry (undefined: no entry, the stored figure shows). */
export const chargeEntryOf = (tempId: string): string | undefined =>
  findProps((props) => props.item?.temp_id === tempId && 'charge' in props && 'lastKey' in props).charge?.text;

/**
 * Opens every closed dispatch table, as a user taps "Show dispatch details" on each card. The editor starts
 * with the cards of more than one line closed; most tests are about the table, so they open it first.
 */
export const openAllGroups = async (): Promise<void> => {
  for (const toggle of screen.queryAllByRole('button', { expanded: false })) await fireEvent.press(toggle);
};

/** The column widths the rows of the line table are drawn with (the pinned Dispatch column first), from the table the editor passes to its rows. */
export const columnWidthsOf = (): number[] => {
  const table = findProps((props) => props.table?.scrolling !== undefined).table;
  return [table.pinned.width, ...table.scrolling.map((column: { width: number }) => column.width)];
};

/** The FlashList stand-in's host element, which keeps the list's props (`data`, `keyExtractor`, `getItemType` ...). */
export const flashListOf = (): Host => {
  const lists = screen.root!.queryAll((node) => node.type === 'FlashList', { includeSelf: true });
  if (lists.length !== 1) throw new Error(`expected one FlashList, found ${lists.length}`);
  return lists[0];
};

/**
 * The text input object (the component instance, with `focus()`, `isFocused()`, `setSelection()`) behind the input with
 * this test id. Testing Library shows host views only, so it is read from the component tree.
 */
export const inputObjectOf = (testID: string): any =>
  findFiber((fiber) => typeof fiber.type !== 'string' && fiber.memoizedProps?.testID === testID && typeof fiber.stateNode?.focus === 'function').stateNode;
