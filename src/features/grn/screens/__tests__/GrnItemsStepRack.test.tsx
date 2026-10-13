/**
 * Racks on the GRN items step (owner decision of 2026-10-11): any text is
 * taken, in a new GRN and in an edit, for a new line and for a line that was
 * stored with a rack such as "C3" before.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { GrnItemsStep } from '@/features/grn/screens/GrnItemsStep';
import { addItem, reconcileItems, updateItem } from '@/store/slices/grnFormSlice';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const LINE_ID = '55555555-2222-4333-8444-555555555555';
const ITEM_ID = '66666666-2222-4333-8444-555555555555';

const mockDispatch = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: { items: [] } }),
}));

const storedLine = (rack: string) => ({
  grn_trl_id: LINE_ID,
  item_table_id: ITEM_ID,
  item_name: 'Example Potatoes',
  packaging: 'Bag',
  qty: 10,
  stock: 10,
  weight: 50,
  rack,
  package_mark: '',
  trl_images: [],
});
const mockForm: Record<string, unknown> = {};
jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));

// Children are stand-ins that keep their props, so the test can call their handlers.
jest.mock('@/features/grn/components/HorizontalItemForm', () => ({
  HorizontalItemForm: require('react').forwardRef((props: object, _ref: unknown) =>
    require('react').createElement('HorizontalItemForm', props)),
}));
jest.mock('@/features/grn/components/ItemsSummaryBottomSheet', () => ({ __esModule: true, default: 'ItemsSummaryBottomSheet' }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: 'WizardBottomBar' }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: () => null }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: '11111111-2222-4333-8444-555555555555' }),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (run: () => unknown) => run() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({
  deleteGRNImage: jest.fn(),
  generateTempGRNId: () => 'temp_grn_generated',
  uploadGRNItemImage: jest.fn(),
  validateImageFile: () => ({ valid: true }),
}));

function useForm(mode: 'create' | 'edit', items: ReturnType<typeof storedLine>[]) {
  Object.assign(mockForm, {
    header: { gr_no: 'A0010' },
    items,
    grnId: mode === 'edit' ? GRN_ID : null,
    tempGrnId: null,
    isCreateMode: mode === 'create',
    resetFormState: jest.fn(),
  });
}

async function render(mode: 'create' | 'edit') {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GrnItemsStep mode={mode} />);
  });
  return tree;
}
const form = (tree: ReactTestRenderer) => tree.root.findByType('HorizontalItemForm' as never);
const set = (tree: ReactTestRenderer, field: string, value: string) =>
  act(() => form(tree).props.onFieldChange(field, value));

async function typeLine(tree: ReactTestRenderer, rack: string) {
  set(tree, 'item_table_id', ITEM_ID);
  set(tree, 'item_name', 'Example Potatoes');
  set(tree, 'qty', '10');
  set(tree, 'rack', rack);
}

describe('GRN items step racks', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(require('react-native').Vibration, 'vibrate').mockImplementation(() => {});
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((run: FrameRequestCallback) => { run(0); return 0; });
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['C3', 'C3'],
    ['20B-20C', '20B-20C'],
    ['A/1/2', 'A/1/2'],
    ['ચેમ્બર ૩', 'ચેમ્બર ૩'],
    ['', ''],
    ['20B/F1/C4', '20B/F1/C4'],
    // Spaces typed at the ends are not part of the rack.
    [' ROW 3 ', 'ROW 3'],
  ])('new GRN: a line with rack %p can be saved and is stored as %p', async (typed, stored) => {
    useForm('create', []);
    const tree = await render('create');
    await typeLine(tree, typed);

    // The save button of the item form is not held back by the rack.
    expect(form(tree).props.isValid).toBe(true);
    await act(async () => { await form(tree).props.onSaveItem(); });

    expect(alert).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(
      addItem(expect.objectContaining({ item_table_id: ITEM_ID, qty: 10, rack: stored }) as never)
    );
    await act(async () => { tree.unmount(); });
  });

  it('new GRN: Next takes the line that is still in the form, whatever its rack', async () => {
    useForm('create', []);
    const tree = await render('create');
    await typeLine(tree, '20B ');

    await act(async () => { await tree.root.findByType('WizardBottomBar' as never).props.onNext(); });
    // "Save this item first?" is asked for a typed line; the answer "Save" stores it.
    const save = alert.mock.calls[0]?.[2]?.find((button: { text: string }) => button.text === 'Save item');
    if (save) await act(async () => { await save.onPress(); });

    // Next stores the step's lines in one action.
    expect(mockDispatch).toHaveBeenCalledWith(reconcileItems([expect.objectContaining({ rack: '20B' })] as never));
    await act(async () => { tree.unmount(); });
  });

  it('edit: a line stored with "C3" opens with its rack, saves with it and does not hold Next back', async () => {
    useForm('edit', [storedLine('C3')]);
    const tree = await render('edit');
    const sheet = tree.root.findByType('ItemsSummaryBottomSheet' as never);
    expect(sheet.props.items[0].rack).toBe('C3');

    await act(async () => { sheet.props.onEditItem(sheet.props.items[0]); });
    expect(form(tree).props.currentItem.rack).toBe('C3');
    expect(form(tree).props.isValid).toBe(true);
    set(tree, 'qty', '12');
    await act(async () => { await form(tree).props.onSaveItem(); });

    expect(alert).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(
      updateItem({ grn_trl_id: LINE_ID, item: expect.objectContaining({ qty: 12, rack: 'C3' }) as never })
    );

    await act(async () => { await tree.root.findByType('WizardBottomBar' as never).props.onNext(); });
    expect(alert).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith(`/grn-edit/${GRN_ID}/step3`);
    await act(async () => { tree.unmount(); });
  });

  it('edit: a rack longer than the 30 characters the server stores is refused with that reason', async () => {
    useForm('edit', [storedLine('C3')]);
    const tree = await render('edit');
    await typeLine(tree, 'A'.repeat(31));

    await act(async () => { await form(tree).props.onSaveItem(); });

    expect(form(tree).props.currentItem.errors.rack).toBe('Rack must be at most 30 characters');
    expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: addItem.type }));
    await act(async () => { tree.unmount(); });
  });
});
