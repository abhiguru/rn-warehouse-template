/**
 * The invoice items editor wired to the real invoice-form slice, for its tests. A test mocks
 * `@/store/hooks` with `storeHooks(() => store)` from invoiceFixtures, so typing in a cell changes the
 * store and the amounts follow, as on the screen. No jest globals here.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { act } from 'react-test-renderer';
import type { ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { applySavedRates, bulkUpdateItemGroupPricing, updateEditedItem } from '@/store/slices/invoiceFormSlice';
import { InvoiceItemsEditor, type InvoiceItemsEditorHandle } from '@/features/invoice/components/items/InvoiceItemsEditor';
import type { InvoiceItemData } from '@/types/invoice.types';

interface State {
  invoiceForm: { items: InvoiceItemData[]; itemOverrides: Record<string, string[]> };
}

const rendered: ReactTestRenderer[] = [];
/** Remember a rendered tree so `unmountAll()` can drop it after the test (its settle timer must not outlive the test). */
export const track = (tree: ReactTestRenderer): ReactTestRenderer => {
  rendered.push(tree);
  return tree;
};
/** Unmount every tracked tree; a test file calls it in `afterEach` inside `act`. */
export const unmountAll = (): void => {
  while (rendered.length > 0) rendered.pop()!.unmount();
};

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

/** The input with this test id (`cell|<temp_id>|charge`, `group|<item>:::<mark>|tax`). */
export const inputOf = (tree: ReactTestRenderer, testID: string): ReactTestInstance => {
  const found = tree.root.findAllByType(TextInput).filter((node) => node.props.testID === testID);
  if (found.length === 0) throw new Error(`no input ${testID}`);
  return found[0];
};
export const hasInput = (tree: ReactTestRenderer, testID: string): boolean =>
  tree.root.findAllByType(TextInput).some((node) => node.props.testID === testID);

/** Every Text in the tree, flattened to its string (a no-break space reads as a space). */
export const textsOf = (tree: ReactTestRenderer): string[] =>
  tree.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .map((node) => {
      const kids = node.props.children;
      const text = Array.isArray(kids) ? kids.filter((k: unknown) => typeof k === 'string').join('') : typeof kids === 'string' ? kids : '';
      return text.replace(/\u00a0/g, ' ');
    });

/**
 * The test ids of the inputs that `focus()` was called on, in order. The test renderer gives every
 * TextInput the same `focus` mock; its recorded `this` tells which input each call was for.
 */
export const focusedIds = (tree: ReactTestRenderer): string[] => {
  const any = tree.root.findAllByType(TextInput)[0];
  const focus = any.instance.focus as unknown as { mock: { contexts: Array<{ props?: { testID?: string } } | undefined> } };
  return focus.mock.contexts.map((context) => String(context?.props?.testID));
};

/**
 * The real `TextInput` mode. A test file that calls these starts with
 * `jest.unmock('react-native/Libraries/Components/TextInput/TextInput')`: react-native's own input
 * releases the caller's ref and sets it again on every key it reports (`setLocalRef` depends on the
 * event count), which its jest mock does not, and the editor has to hold up under that. The host input
 * (the string-typed node with the test id) is driven with the events the device sends.
 */
const NATIVE_TARGET = 7;
export const hostInputOf = (tree: ReactTestRenderer, testID: string): ReactTestInstance =>
  tree.root.find((node) => typeof node.type === 'string' && node.props.testID === testID && typeof node.props.onChange === 'function');
/** The focus event of the native input. */
export const hostFocus = (tree: ReactTestRenderer, testID: string): void => {
  hostInputOf(tree, testID).props.onFocus({ nativeEvent: { target: NATIVE_TARGET } });
};
/** One key: the whole text now, and the number of events so far (the native input counts them). */
export const hostKey = (tree: ReactTestRenderer, testID: string, text: string, eventCount: number): void => {
  hostInputOf(tree, testID).props.onChange({ nativeEvent: { text, eventCount, target: NATIVE_TARGET } });
};
export const hostBlur = (tree: ReactTestRenderer, testID: string): void => {
  hostInputOf(tree, testID).props.onBlur({ nativeEvent: { target: NATIVE_TARGET } });
};
/** What the host input shows. */
export const hostText = (tree: ReactTestRenderer, testID: string): string => String(hostInputOf(tree, testID).props.text ?? hostInputOf(tree, testID).props.value);

/** Calls the handlers registered for a keyboard event, from the recorded calls of a spy on `Keyboard.addListener`. */
export const emitKeyboard = (calls: ReadonlyArray<readonly unknown[]>, event: string): void => {
  calls.filter(([name]) => name === event).forEach(([, handler]) => (handler as () => void)());
};

/** The text the editor holds for a line's charge entry (undefined: no entry, the stored figure shows). */
export const chargeEntryOf = (tree: ReactTestRenderer, tempId: string): string | undefined =>
  tree.root.find((node) => typeof node.type !== 'string' && node.props.item?.temp_id === tempId && 'charge' in node.props && 'lastKey' in node.props).props.charge?.text;

/**
 * Opens every closed dispatch table, as a user taps "Show dispatch details" on each card. The editor starts
 * with the cards of more than one line closed; most tests are about the table, so they open it first.
 */
export const openAllGroups = async (tree: ReactTestRenderer): Promise<void> => {
  const toggles = tree.root.findAll(
    (node) => typeof node.type !== 'string' && node.props.accessibilityState?.expanded === false && typeof node.props.onPress === 'function'
  );
  await act(async () => { toggles.forEach((toggle) => toggle.props.onPress()); });
};

/** The column widths the rows of the line table are drawn with (the pinned Dispatch column first), from the table the editor passes to its rows. */
export const columnWidthsOf = (tree: ReactTestRenderer): number[] => {
  const table = tree.root.findAll((node) => typeof node.type !== 'string' && node.props.table?.scrolling !== undefined)[0].props.table;
  return [table.pinned.width, ...table.scrolling.map((column: { width: number }) => column.width)];
};
