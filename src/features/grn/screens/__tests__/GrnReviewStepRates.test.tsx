/**
 * The Rates section of the GRN review step (backend migration 86): a row per item and bag weight with its
 * rate and where it comes from, Create blocked while a row has no rate, the rate sheet and Undo change, the
 * rates saved with the GRN, and the re-read when the server refuses them.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN, updateGRN } from '@/features/grn/services/grnFormService';
import { setGrnRates, setRateChanges } from '@/store/slices/grnFormSlice';
import { contextKey } from '@/features/grn/rates/grnRateModel';
import { showAlert } from '@/utils/alert';
import type { ItemStoragePrice } from '@/types/item-pricing.types';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const mockDispatch = jest.fn();
let mockGrnRates: unknown[] = [];
let mockChanges: unknown[] = [];
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: { items: [], removedImages: [], saveUnconfirmed: false, grnRates: mockGrnRates, rateChanges: mockChanges } }),
}));

const mockHeader = {
  gr_no: 'A0010', date: '2026-10-12', sender_name: 'Fictional Sender', customer_id: 'cust-a', customer_name: 'Fictional Traders',
  supervisor_name: 'Fictional Supervisor', registration: '', note: '', leon: false, pricing_mode: 'MONTHLY',
  gr_images: [{ id: 'p1', fileName: 'book.webp', imageUrl: 'https://example.invalid/book', storagePath: 'headers/g/book.webp', uploadStatus: 'completed' }],
};
const line = (n: number, item: string, name: string, weight: number | null) => ({
  grn_trl_id: `55555555-2222-4333-8444-${String(n).padStart(12, '0')}`, item_table_id: item, item_name: name, packaging: 'Bag', qty: 10, stock: 10, weight, rack: '', package_mark: '', trl_images: [],
});
let mockItems = [line(1, 'gur', 'Fictional Gur', 12), line(2, 'rice', 'Fictional Rice', 30)];
let mockForm: Record<string, unknown>;
jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));

const mockRefresh = jest.fn(async () => {});
let mockRates: ItemStoragePrice[] = [];
let mockStatus: 'loading' | 'ready' | 'error' = 'ready';
jest.mock('@/features/grn/rates/useGrnRates', () => ({
  useGrnRates: () => ({ rates: mockRates, status: mockStatus, offline: false, refresh: mockRefresh }),
}));
let sheetProps: Record<string, any> = {};
jest.mock('@/features/grn/rates/GrnRateSheet', () => ({ GrnRateSheet: (props: Record<string, unknown>) => { sheetProps = props; return null; } }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null, status: 'ready' }) }));

jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: 'WizardBottomBar' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({}), useFocusEffect: jest.fn() }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn(), findLinesSavedByLostUpdate: jest.fn() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNPhotos: jest.fn(), unpreparedGRNPhotos: jest.fn(() => null) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn(async () => ({ isValid: true, errors: {} })) }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/localPhotoFiles', () => ({ abandonLocalPhotoUpload: jest.fn(), releaseLocalPhotos: jest.fn(async () => 0) }));

let seq = 0;
const stored = (item: string, min: number, max: number, rent: number, customer: string | null = null): ItemStoragePrice => ({
  id: `r${(seq += 1)}`, item_id: item, item_name: item, customer_id: customer, customer_name: customer ? 'Fictional Traders' : null, price_type: 'monthly',
  unit_price: rent, weight_min: min, weight_max: max, labour_rate: 1.5, tax_percent: 5, effective_from: '2026-01-01', effective_to: null, created_at: '', created_by: '',
});
const CTX = { customerId: 'cust-a', day: '2026-10-12', priceType: 'monthly' as const };

async function render(mode: 'create' | 'edit') {
  mockForm = {
    header: mockHeader, items: mockItems, grnId: mode === 'edit' ? GRN_ID : null, tempGrnId: mode === 'edit' ? null : 'temp_grn_fixture',
    isSaving: false, isCreateMode: mode === 'create', resetFormState: jest.fn(),
  };
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<GrnReviewStep mode={mode} />); });
  return tree;
}
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
const one = (tree: ReactTestRenderer, type: string) => tree.root.findByType(type as never);
const byId = (tree: ReactTestRenderer, id: string) => tree.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function');
const dialogs = (tree: ReactTestRenderer) => tree.root.findAllByType('ConfirmDialog' as never);
const press = async (tree: ReactTestRenderer) => { await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  mockGrnRates = [];
  mockChanges = [];
  mockStatus = 'ready';
  mockItems = [line(1, 'gur', 'Fictional Gur', 12), line(2, 'rice', 'Fictional Rice', 30)];
  // Gur has the customer's own rate for 0-50 kg; rice has no rate at all.
  mockRates = [stored('gur', 0, 50, 3.5, 'cust-a'), stored('gur', 0, 50, 3)];
  sheetProps = {};
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the rows', () => {
  it('shows the rate and its source for a line that has one, and No rate with Add rate for one that has none', async () => {
    const tree = await render('create');
    const t = texts(tree);
    expect(t).toContain('RATES');
    expect(t).toContain('Fictional Gur, 12 kg');
    expect(t).toContain('0–50 kg · ₹3.50 rent · ₹1.50 labour · 5% tax');
    expect(t).toContain('Customer rate');
    expect(t).toContain('Fictional Rice, 30 kg');
    expect(t).toContain('No rate');
    expect(byId(tree, 'grn-rate-change-0').length).toBeGreaterThan(0);
    expect(byId(tree, 'grn-rate-add-0')).toHaveLength(0);
    expect(byId(tree, 'grn-rate-add-1').length).toBeGreaterThan(0);
    expect(byId(tree, 'grn-rate-change-1')).toHaveLength(0);
  });

  it('says Item rate when the default is used, and one row for two lines of the same item and weight', async () => {
    mockRates = [stored('gur', 0, 50, 3)];
    mockItems = [line(1, 'gur', 'Fictional Gur', 12), line(2, 'gur', 'Fictional Gur', 12)];
    const tree = await render('create');
    expect(texts(tree).filter(x => x === 'Fictional Gur, 12 kg')).toHaveLength(1);
    expect(texts(tree)).toContain('Item rate');
  });

  it('a pending change shows its figures, "Changed · This customer only from 12 Oct 2026" and Undo change', async () => {
    mockChanges = [{ item_id: 'gur', weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1.5, tax_percent: 5, scope: 'customer', to: null, ctx: contextKey(CTX) }];
    const tree = await render('create');
    expect(texts(tree)).toContain('0–50 kg · ₹4.00 rent · ₹1.50 labour · 5% tax');
    expect(texts(tree)).toContain('Changed · This customer only from 12 Oct 2026');
    await act(async () => { byId(tree, 'grn-rate-undo-0')[0].props.onPress(); });
    expect(mockDispatch).toHaveBeenCalledWith(setGrnRates([]));
    expect(mockDispatch).toHaveBeenCalledWith(setRateChanges([]));
  });

  it('edit mode: the rates for this GRN only that the form was seeded with price the row, tagged This GRN only', async () => {
    mockGrnRates = [{ item_id: 'rice', weight_min: 21, weight_max: 40, unit_price: 2.25, labour_rate: 1, tax_percent: 5 }];
    const tree = await render('edit');
    expect(texts(tree)).toContain('21–40 kg · ₹2.25 rent · ₹1.00 labour · 5% tax');
    expect(texts(tree)).toContain('This GRN only');
    expect(texts(tree)).not.toContain('No rate');
    await press(tree);
    expect(dialogs(tree).find(d => d.props.title === 'Save changes to this GRN?')!.props.visible).toBe(true);
  });

  it('while the rates load or fail, it says so, and Try again reads them again', async () => {
    mockStatus = 'loading';
    let tree = await render('create');
    expect(texts(tree)).toContain('Loading rates');
    act(() => tree.unmount());
    mockStatus = 'error';
    tree = await render('create');
    expect(texts(tree)).toContain("Couldn't load the rates");
    await act(async () => { byId(tree, 'grn-rates-retry')[0].props.onPress(); });
    expect(mockRefresh).toHaveBeenCalled();
  });
});

describe('Create is blocked without a rate', () => {
  it('names how many items need one, shows no question and sends nothing', async () => {
    const tree = await render('create');
    await press(tree);
    expect(showAlert).toHaveBeenCalledWith('Add the missing rates', 'Add a rate for 1 item before saving.');
    expect(dialogs(tree).every(d => d.props.visible === false)).toBe(true);
    expect(createGRN).not.toHaveBeenCalled();
  });

  it('saving an edit is blocked the same way', async () => {
    const tree = await render('edit');
    await press(tree);
    expect(showAlert).toHaveBeenCalledWith('Add the missing rates', 'Add a rate for 1 item before saving.');
    expect(updateGRN).not.toHaveBeenCalled();
  });

  it('is blocked while the rates are not loaded', async () => {
    mockStatus = 'error';
    const tree = await render('create');
    await press(tree);
    expect(showAlert).toHaveBeenCalledWith('Add the missing rates', "The rates couldn't be loaded. Check your connection and try again before saving.");
    expect(createGRN).not.toHaveBeenCalled();
  });

  it('goes on to the question once every row has a rate', async () => {
    mockRates = [...mockRates, stored('rice', 0, 100, 2)];
    const tree = await render('create');
    await press(tree);
    expect(showAlert).not.toHaveBeenCalled();
    expect(dialogs(tree).find(d => d.props.title === 'Create this GRN?')!.props.visible).toBe(true);
  });
});

describe('Add rate and the sheet', () => {
  it('Add rate opens the sheet for that row; saving puts the rate in the form, which then prices the row', async () => {
    const tree = await render('create');
    await act(async () => { byId(tree, 'grn-rate-add-1')[0].props.onPress(); });
    expect(sheetProps.visible).toBe(true);
    expect(sheetProps.row).toMatchObject({ item_id: 'rice', weight: 30, rate: null });
    expect(sheetProps.input.ctx).toEqual(CTX);
    expect(sheetProps.customerName).toBe('Fictional Traders');
    expect(sheetProps.priceTypeText).toBe('Monthly');
    await act(async () => { sheetProps.onSave({ scope: 'grn', weight_min: 21, weight_max: 40, unit_price: 2.5, labour_rate: 1, tax_percent: 5, to: null }); });
    expect(mockDispatch).toHaveBeenCalledWith(setGrnRates([{ item_id: 'rice', weight_min: 21, weight_max: 40, unit_price: 2.5, labour_rate: 1, tax_percent: 5 }]));
    expect(sheetProps.visible).toBe(false);
  });

  it('a change of the customer or everyone is kept under the pending changes', async () => {
    const tree = await render('create');
    await act(async () => { byId(tree, 'grn-rate-change-0')[0].props.onPress(); });
    expect(sheetProps.row).toMatchObject({ item_id: 'gur', rate: { source: 'customer' } });
    await act(async () => { sheetProps.onSave({ scope: 'customer', weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1.5, tax_percent: 5, to: '2026-10-31' }); });
    expect(mockDispatch).toHaveBeenCalledWith(setRateChanges([
      { item_id: 'gur', weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1.5, tax_percent: 5, scope: 'customer', to: '2026-10-31', ctx: contextKey(CTX) },
    ]));
  });
});

describe('saving the rates with the GRN', () => {
  it('create and edit hand the rates of the form to the save', async () => {
    mockRates = [...mockRates, stored('rice', 0, 100, 2)];
    mockGrnRates = [{ item_id: 'rice', weight_min: 21, weight_max: 40, unit_price: 2.5, labour_rate: 1, tax_percent: 5 }];
    (createGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
    const tree = await render('create');
    await press(tree);
    await act(async () => { await dialogs(tree).find(d => d.props.title === 'Create this GRN?')!.props.onConfirm(); });
    expect((createGRN as jest.Mock).mock.calls[0][0].rates).toEqual([
      { scope: 'grn', item_id: 'rice', weight_min: 21, weight_max: 40, unit_price: 2.5, labour_rate: 1, tax_percent: 5 },
    ]);
    act(() => tree.unmount());

    (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
    const edit = await render('edit');
    await press(edit);
    await act(async () => { await dialogs(edit).find(d => d.props.title === 'Save changes to this GRN?')!.props.onConfirm(); });
    expect((updateGRN as jest.Mock).mock.calls[0][1].rates).toHaveLength(1);
  });

  it.each([
    ['RATE_MISSING', { lines: [{ item_id: 'rice', item_name: 'Fictional Rice', weight: 30 }] }, 'The server found no rate for 1 item. The rates are shown again; add the missing one and save.'],
    ['RATE_PLANNED', { starts_on: '2026-11-01' }, 'A rate for this weight band already starts on 1 Nov 2026. Choose a last day before it.'],
    ['BANDS_OVERLAP', {}, "This weight band overlaps another band of the item's rate. Use the same band, or change the bands in Item pricing."],
    ['GRN_INVOICED', {}, 'This GRN is invoiced, so its rates for this GRN only cannot change.'],
  ])('%s: reads the rates again and shows the reason', async (code, data, text) => {
    mockRates = [...mockRates, stored('rice', 0, 100, 2)];
    (createGRN as jest.Mock).mockResolvedValue({ success: false, error: 'server text', rateError: { code, data } });
    const tree = await render('create');
    await press(tree);
    await act(async () => { await dialogs(tree).find(d => d.props.title === 'Create this GRN?')!.props.onConfirm(); });
    expect(mockRefresh).toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Check the rates', text);
  });
});
