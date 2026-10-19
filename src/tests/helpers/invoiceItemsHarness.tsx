/**
 * The invoice items editor wired to the real invoice-form slice, for its tests. A test mocks
 * `@/store/hooks` with `storeHooks(() => store)` from invoiceFixtures, so typing in a cell changes the
 * store and the amounts follow, as on the screen. No jest globals here.
 */
import React from 'react';
import { TextInput } from 'react-native';
import type { ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { applySavedRates, bulkUpdateItemGroupPricing, updateEditedItem } from '@/store/slices/invoiceFormSlice';
import { InvoiceItemsEditor, type EditPricingParams, type InvoiceItemsEditorHandle } from '@/features/invoice/components/items/InvoiceItemsEditor';
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
  onEditPricing,
}: {
  oneTime?: boolean;
  editorRef?: React.Ref<InvoiceItemsEditorHandle>;
  onEditPricing?: (params: EditPricingParams) => void;
}) {
  const dispatch = useAppDispatch();
  const items = useAppSelector((state) => (state as unknown as State).invoiceForm.items);
  const itemOverrides = useAppSelector((state) => (state as unknown as State).invoiceForm.itemOverrides);
  return (
    <InvoiceItemsEditor
      ref={editorRef}
      items={items}
      oneTime={oneTime}
      itemOverrides={itemOverrides}
      onItemUpdate={(temp_id, field, value) => dispatch(updateEditedItem({ temp_id, values: { [field]: value } }))}
      onBulkEdit={(group_key, pricing) => dispatch(bulkUpdateItemGroupPricing({ group_key, pricing }))}
      onRestoreRates={(rates) => dispatch(applySavedRates(rates))}
      onEditPricing={onEditPricing}
    />
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
