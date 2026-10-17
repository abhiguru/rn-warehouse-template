/**
 * The Rates section of the GRN review step (backend migration 86): a row per item and bag weight with its
 * rate and where it comes from, Create blocked while a row has no rate, the rate sheet and Undo change, the
 * rates saved with the GRN, and the re-read when the server refuses them.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN, updateGRN } from '@/features/grn/services/grnFormService';
import { setGrnRates, setRateChanges, setRemovedGrnRates } from '@/store/slices/grnFormSlice';
import { contextKey } from '@/features/grn/rates/grnRateModel';
import { askAlert, showAlert } from '@/utils/alert';
import type { ItemStoragePrice } from '@/types/item-pricing.types';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const mockDispatch = jest.fn();
let mockGrnRates: unknown[] = [];
let mockChanges: unknown[] = [];
let mockRemoved: unknown[] = [];
let mockInvoiced = false;
let mockRole = 'supervisor';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: mockRole } }, grnForm: { items: [], removedImages: [], saveUnconfirmed: false, grnRates: mockGrnRates, rateChanges: mockChanges, removedGrnRates: mockRemoved, grnInvoiced: mockInvoiced } }),
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
const mockUseGrnRates = jest.fn();
let mockRates: ItemStoragePrice[] = [];
let mockStatus: 'loading' | 'ready' | 'error' = 'ready';
jest.mock('@/features/grn/rates/useGrnRates', () => ({
  useGrnRates: (...args: unknown[]) => (mockUseGrnRates(...args), { rates: mockRates, status: mockStatus, offline: false, refresh: mockRefresh }),
}));
let sheetProps: Record<string, any> = {};
jest.mock('@/features/grn/rates/GrnRateSheet', () => ({ GrnRateSheet: (props: Record<string, unknown>) => { sheetProps = props; return null; } }));
const mockUseStandardRate = jest.fn();
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: (...args: unknown[]) => { mockUseStandardRate(...args); return { rate: null, status: 'ready' }; } }));

jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: 'WizardBottomBar' }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => mockParams, useFocusEffect: jest.fn() }));
let backOptions: { enabled?: boolean; onBackPress?: () => boolean } = {};
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: (options: typeof backOptions) => { backOptions = options; } }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn(), findLinesSavedByLostUpdate: jest.fn() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNPhotos: jest.fn(), unpreparedGRNPhotos: jest.fn(() => null) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn() }));
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
/** react-test-renderer types `type` as an ElementType, but host components are named by a string. */
const isHost = (n: ReactTestInstance, name: string) => (n.type as unknown) === name;
const byId = (tree: ReactTestRenderer, id: string) => tree.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function');
/**
 * The texts of one Rates table row, in reading order: the item, the line under it (weight, band, and at jest's
 * large text labour and tax), the tags, the rent cells (the struck rent under the rent), the actions.
 */
const rowTexts = (tree: ReactTestRenderer, index: number) =>
  tree.root.find(n => n.props.testID === `grn-rate-row-${index}` && isHost(n, 'View')).findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('').replace(/\u00a0/g, ' '));
/** What a screen reader says for a row's facts. */
const rowA11y = (tree: ReactTestRenderer, index: number) =>
  tree.root.find(n => n.props.testID === `grn-rate-row-${index}` && isHost(n, 'View')).findAll(n => isHost(n, 'View') && typeof n.props.accessibilityLabel === 'string' && n.props.accessible === true)[0].props.accessibilityLabel;
const rowCount = (tree: ReactTestRenderer) => tree.root.findAll(n => typeof n.props.testID === 'string' && /^grn-rate-row-\d+$/.test(n.props.testID) && isHost(n, 'View')).length;
const dialogs = (tree: ReactTestRenderer) => tree.root.findAllByType('ConfirmDialog' as never);
const press = async (tree: ReactTestRenderer) => { await act(async () => { await one(tree, 'WizardBottomBar').props.onNext(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  mockGrnRates = [];
  mockChanges = [];
  mockRemoved = [];
  mockInvoiced = false;
  mockRole = 'supervisor';
  mockStatus = 'ready';
  mockItems = [line(1, 'gur', 'Fictional Gur', 12), line(2, 'rice', 'Fictional Rice', 30)];
  // Gur has the customer's own rate for 0-50 kg; rice has no rate at all.
  mockRates = [stored('gur', 0, 50, 3.5, 'cust-a'), stored('gur', 0, 50, 3)];
  sheetProps = {};
  mockParams = {};
  backOptions = {};
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the rows', () => {
  it('shows the rate and its source for a line that has one, and No rate with Add rate for one that has none', async () => {
    const tree = await render('create');
    expect(texts(tree)).toContain('RATES');
    // The rent is the row's main value; the weight is the same tag as on the Items card; band, labour and tax follow.
    expect(rowTexts(tree, 0)).toEqual(['Fictional Gur', '12 kg each · Labour ₹1.50 · Tax 5%', 'Customer rate', '3.50', 'Change']);
    expect(rowA11y(tree, 0)).toBe('Fictional Gur, 12 kg, ₹3.50 per bag, per month, 0–50 kg, labour ₹1.50 per bag, tax 5%, Customer rate');
    // No rate stands where the rent would be.
    expect(rowTexts(tree, 1)).toEqual(['Fictional Rice', '30 kg each', 'No rate', '—', 'Add rate']);
    expect(rowA11y(tree, 1)).toBe('Fictional Rice, 30 kg, No rate');
    expect(byId(tree, 'grn-rate-change-0').length).toBeGreaterThan(0);
    expect(byId(tree, 'grn-rate-add-0')).toHaveLength(0);
    expect(byId(tree, 'grn-rate-add-1').length).toBeGreaterThan(0);
    expect(byId(tree, 'grn-rate-change-1')).toHaveLength(0);
  });

  it('says Item rate when the default is used, and one row for two lines of the same item and weight', async () => {
    mockRates = [stored('gur', 0, 50, 3)];
    mockItems = [line(1, 'gur', 'Fictional Gur', 12), line(2, 'gur', 'Fictional Gur', 12)];
    const tree = await render('create');
    expect(rowCount(tree)).toBe(1);
    expect(rowTexts(tree, 0)).toContain('Item rate');
  });

  it('a pending change shows its figures with the date, "Changed · This customer" and Undo change', async () => {
    mockChanges = [{ item_id: 'gur', weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1.5, tax_percent: 5, scope: 'customer', to: null, ctx: contextKey(CTX), price_type: 'monthly' }];
    const tree = await render('create');
    // The new rent, with the customer's rent it replaces struck through under it.
    expect(rowTexts(tree, 0)).toEqual([
      'Fictional Gur', '12 kg each · Labour ₹1.50 · Tax 5% · From 12 Oct 2026', 'Changed · This customer', '4.00', '3.50',
      'Undo change', 'Change',
    ]);
    expect(tree.root.find(n => n.props.testID === 'grn-rate-was-0' && n.type === Text).props.style).toEqual(expect.objectContaining({ textDecorationLine: 'line-through' }));
    expect(rowA11y(tree, 0)).toBe('Fictional Gur, 12 kg, ₹4.00 per bag, per month, 0–50 kg, labour ₹1.50 per bag, tax 5%, Changed · This customer, From 12 Oct 2026, was ₹3.50');
    await act(async () => { byId(tree, 'grn-rate-undo-0')[0].props.onPress(); });
    expect(mockDispatch).toHaveBeenCalledWith(setGrnRates([]));
    expect(mockDispatch).toHaveBeenCalledWith(setRateChanges([]));
  });

  it('edit mode: the rates for this GRN only that the form was seeded with price the row, tagged This GRN only', async () => {
    mockGrnRates = [{ price_type: 'monthly', item_id: 'rice', weight_min: 21, weight_max: 40, unit_price: 2.25, labour_rate: 1, tax_percent: 5 }];
    const tree = await render('edit');
    // Rice has no stored rate, so nothing is struck through.
    expect(rowTexts(tree, 1)).toEqual(['Fictional Rice', '30 kg each · Labour ₹1.00 · Tax 5%', 'This GRN only', '2.25', 'Undo change', 'Change']);
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
  it('says rates are missing, shows no question and sends nothing', async () => {
    const tree = await render('create');
    await press(tree);
    expect(showAlert).toHaveBeenCalledWith('Add the missing rates', 'Add the missing rates before saving.');
    expect(dialogs(tree).every(d => d.props.visible === false)).toBe(true);
    expect(createGRN).not.toHaveBeenCalled();
  });

  it('saving an edit is blocked the same way', async () => {
    const tree = await render('edit');
    await press(tree);
    expect(showAlert).toHaveBeenCalledWith('Add the missing rates', 'Add the missing rates before saving.');
    expect(updateGRN).not.toHaveBeenCalled();
  });

  it('is blocked while the rates are not loaded', async () => {
    mockStatus = 'error';
    const tree = await render('create');
    await press(tree);
    expect(showAlert).toHaveBeenCalledWith("The rates couldn't be loaded", "The rates couldn't be loaded. Check your connection and try again before saving.");
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
    expect(mockDispatch).toHaveBeenCalledWith(setGrnRates([{ price_type: 'monthly', item_id: 'rice', weight_min: 21, weight_max: 40, unit_price: 2.5, labour_rate: 1, tax_percent: 5 }]));
    expect(sheetProps.visible).toBe(false);
  });

  it('a change of the customer or everyone is kept under the pending changes', async () => {
    const tree = await render('create');
    await act(async () => { byId(tree, 'grn-rate-change-0')[0].props.onPress(); });
    expect(sheetProps.row).toMatchObject({ item_id: 'gur', rate: { source: 'customer' } });
    await act(async () => { sheetProps.onSave({ scope: 'customer', weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1.5, tax_percent: 5, to: '2026-10-31' }); });
    expect(mockDispatch).toHaveBeenCalledWith(setRateChanges([
      { item_id: 'gur', weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1.5, tax_percent: 5, scope: 'customer', to: '2026-10-31', ctx: contextKey(CTX), price_type: 'monthly' },
    ]));
  });
});

describe('saving the rates with the GRN', () => {
  it('create and edit hand the rates of the form to the save', async () => {
    mockRates = [...mockRates, stored('rice', 0, 100, 2)];
    mockGrnRates = [{ price_type: 'monthly', item_id: 'rice', weight_min: 21, weight_max: 40, unit_price: 2.5, labour_rate: 1, tax_percent: 5 }];
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


describe('staff set no rates on a GRN (owner, 2026-10-16)', () => {
  // Rice has no stored rate: for a supervisor Create would be blocked on it, and the form holds a rate for this GRN only.
  beforeEach(() => {
    mockRole = 'staff';
    mockGrnRates = [{ price_type: 'monthly', item_id: 'rice', weight_min: 21, weight_max: 40, unit_price: 2.5, labour_rate: 1, tax_percent: 5 }];
  });

  it('shows no Rates block, no rate sheet and reads no rates', async () => {
    const tree = await render('create');
    expect(texts(tree)).not.toContain('RATES');
    expect(tree.root.findAll(n => n.props.testID === 'grn-rates-section')).toHaveLength(0);
    expect(rowCount(tree)).toBe(0);
    expect(sheetProps).toEqual({});
    expect(mockUseGrnRates.mock.calls[0][0]).toEqual([]);
    expect(mockUseStandardRate).toHaveBeenCalledWith(false);
  });

  it('create and edit save without p_rates, and a line without a rate does not block the save', async () => {
    (createGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
    const tree = await render('create');
    await press(tree);
    expect(showAlert).not.toHaveBeenCalled();
    await act(async () => { await dialogs(tree).find(d => d.props.title === 'Create this GRN?')!.props.onConfirm(); });
    expect((createGRN as jest.Mock).mock.calls[0][0].rates).toBeUndefined();
    act(() => tree.unmount());

    (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
    const edit = await render('edit');
    await press(edit);
    await act(async () => { await dialogs(edit).find(d => d.props.title === 'Save changes to this GRN?')!.props.onConfirm(); });
    expect((updateGRN as jest.Mock).mock.calls[0][1].rates).toBeUndefined();
  });

  it('keeps the form untouched for the other price type (nothing is dropped, nobody is told)', async () => {
    mockGrnRates = [{ price_type: 'one_time', item_id: 'rice', weight_min: 21, weight_max: 40, unit_price: 2.5, labour_rate: 1, tax_percent: 5 }];
    await render('create');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('a supervisor of the same GRN still sees the block and sends the rates', async () => {
    mockRole = 'supervisor';
    const tree = await render('create');
    expect(texts(tree)).toContain('RATES');
    expect(mockUseStandardRate).toHaveBeenCalledWith(true);
    expect(mockUseGrnRates.mock.calls[0][0]).toEqual(['gur', 'rice']);
  });
});

describe('round 3', () => {
  const everyone = { item_id: 'gur', price_type: 'monthly', weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1.5, tax_percent: 5, scope: 'everyone', to: null, ctx: contextKey(CTX) };

  it('D1: an Everyone change does not price a row the customer has an own rate for; it shows both tags and Undo change', async () => {
    mockChanges = [everyone];
    const tree = await render('create');
    // The row keeps the customer's own rent, so nothing is struck through.
    expect(rowTexts(tree, 0)).toEqual(['Fictional Gur', '12 kg each · Labour ₹1.50 · Tax 5%', 'Customer rate', 'Changed · Everyone', '3.50', 'Undo change', 'Change']);
    expect(byId(tree, 'grn-rate-undo-0').length).toBeGreaterThan(0);
  });

  it('D9: the section header carries the count of rows without a rate as a tag', async () => {
    const tree = await render('create');
    expect(texts(tree)).toContain('1 without a rate');
    act(() => tree.unmount());
    mockRates = [...mockRates, stored('rice', 0, 100, 2)];
    const full = await render('create');
    expect(texts(full).some(x => x.includes('without a rate'))).toBe(false);
  });

  it('D9: Add rate is a secondary button, not a second primary', async () => {
    const tree = await render('create');
    expect(byId(tree, 'grn-rate-add-1')[0].props.type).toBe('secondary');
  });

  it('D9: a saved GRN-only rate offers Remove, a pending one Undo change', async () => {
    mockGrnRates = [{ price_type: 'monthly', item_id: 'rice', weight_min: 0, weight_max: 100, unit_price: 2, labour_rate: 1, tax_percent: 5, saved: true }];
    const saved = await render('edit');
    expect(byId(saved, 'grn-rate-undo-1')[0].props.children).toBe('Remove');
    act(() => saved.unmount());
    mockGrnRates = [{ price_type: 'monthly', item_id: 'rice', weight_min: 0, weight_max: 100, unit_price: 2, labour_rate: 1, tax_percent: 5 }];
    const pending = await render('edit');
    expect(byId(pending, 'grn-rate-undo-1')[0].props.children).toBe('Undo change');
  });

  it('Remove asks first; Cancel keeps the rate, Remove drops it; Undo change asks nothing', async () => {
    const savedRice = { price_type: 'monthly' as const, item_id: 'rice', weight_min: 0, weight_max: 100, unit_price: 2, labour_rate: 1, tax_percent: 5 };
    mockGrnRates = [{ ...savedRice, saved: true }];
    const tree = await render('edit');
    expect(byId(tree, 'grn-rate-undo-1')[0].props.accessibilityLabel).toBe("Remove this GRN's own rate of Fictional Rice, 30 kg");
    (askAlert as jest.Mock).mockResolvedValueOnce(false);
    await act(async () => { byId(tree, 'grn-rate-undo-1')[0].props.onPress(); });
    expect(askAlert).toHaveBeenCalledWith(
      "Remove this GRN's own rate?",
      "Fictional Rice will be charged at the customer's rate or the default rate instead. The rate is removed when you save the GRN.",
      [{ text: 'Cancel', style: 'cancel', value: false }, { text: 'Remove', style: 'destructive', value: true }],
      false
    );
    expect(mockDispatch).not.toHaveBeenCalledWith(setGrnRates([]));
    (askAlert as jest.Mock).mockResolvedValueOnce(true);
    await act(async () => { byId(tree, 'grn-rate-undo-1')[0].props.onPress(); });
    expect(mockDispatch).toHaveBeenCalledWith(setGrnRates([]));
    expect(mockDispatch).toHaveBeenCalledWith(setRemovedGrnRates([{ ...savedRice, saved: true }]));
    act(() => tree.unmount());
    (askAlert as jest.Mock).mockClear();
    mockDispatch.mockClear();
    mockGrnRates = [savedRice];
    const pending = await render('edit');
    await act(async () => { byId(pending, 'grn-rate-undo-1')[0].props.onPress(); });
    expect(askAlert).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(setGrnRates([]));
  });

  it('after Remove the row says "Removed when you save" and Undo remove puts the rate back', async () => {
    const savedRice = { price_type: 'monthly' as const, item_id: 'rice', weight_min: 0, weight_max: 100, unit_price: 2, labour_rate: 1, tax_percent: 5, saved: true };
    mockRemoved = [savedRice];
    const tree = await render('edit');
    // Rice has no other rate, so the row is without one, with the tag and Undo remove beside Add rate.
    expect(rowTexts(tree, 1)).toEqual(['Fictional Rice', '30 kg each', 'No rate', 'Removed when you save', '—', 'Undo remove', 'Add rate']);
    expect(byId(tree, 'grn-rate-restore-1')[0].props.accessibilityLabel).toBe("Put back this GRN's own rate of Fictional Rice, 30 kg");
    expect(rowA11y(tree, 1)).toBe('Fictional Rice, 30 kg, No rate, Removed when you save');
    expect(byId(tree, 'grn-rate-restore-0')).toHaveLength(0);
    await act(async () => { byId(tree, 'grn-rate-restore-1')[0].props.onPress(); });
    expect(mockDispatch).toHaveBeenCalledWith(setGrnRates([savedRice]));
    expect(mockDispatch).toHaveBeenCalledWith(setRemovedGrnRates([]));
    act(() => tree.unmount());
    // A rate typed after Remove prices the row: no Undo remove until that change is undone.
    mockGrnRates = [{ ...savedRice, unit_price: 3, saved: undefined }];
    const typed = await render('edit');
    expect(byId(typed, 'grn-rate-restore-1')).toHaveLength(0);
    expect(texts(typed)).not.toContain('Removed when you save');
  });

  describe('D4: an invoiced GRN', () => {
    beforeEach(() => {
      mockInvoiced = true;
      // Gur has a stored rate; rice has none (an old GRN priced by its invoice's own figures).
      mockGrnRates = [{ price_type: 'monthly', item_id: 'gur', weight_min: 0, weight_max: 50, unit_price: 4.5, labour_rate: 1, tax_percent: 5, saved: true }];
    });

    it('shows the note, no Add rate / Change / Undo, and "No rate" for a row without one', async () => {
      const tree = await render('edit');
      expect(texts(tree)).toContain('This GRN is invoiced; its rates cannot change here.');
      expect(texts(tree)).toContain('No rate');
      for (const id of ['grn-rate-add-1', 'grn-rate-change-0', 'grn-rate-undo-0']) expect(byId(tree, id)).toHaveLength(0);
      expect(texts(tree).some(x => x.includes('without a rate'))).toBe(false);
    });

    it('Save is not blocked by the missing rate and sends the stored set back unchanged', async () => {
      const tree = await render('edit');
      await press(tree);
      expect(showAlert).not.toHaveBeenCalled();
      expect(dialogs(tree).find(d => d.props.title === 'Save changes to this GRN?')!.props.visible).toBe(true);
      (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
      await act(async () => { await dialogs(tree).find(d => d.props.title === 'Save changes to this GRN?')!.props.onConfirm(); });
      expect((updateGRN as jest.Mock).mock.calls[0][1].rates).toEqual([
        { scope: 'grn', item_id: 'gur', weight_min: 0, weight_max: 50, unit_price: 4.5, labour_rate: 1, tax_percent: 5 },
      ]);
    });
  });

  it('D7: entries of the other price type are dropped from the form and the person is told once', async () => {
    mockGrnRates = [{ price_type: 'one_time', item_id: 'rice', weight_min: 0, weight_max: 100, unit_price: 2, labour_rate: 0, tax_percent: 5 }];
    mockChanges = [{ ...everyone, price_type: 'one_time' }];
    const tree = await render('create');
    expect(mockDispatch).toHaveBeenCalledWith(setGrnRates([]));
    expect(mockDispatch).toHaveBeenCalledWith(setRateChanges([]));
    const bar = one(tree, 'Snackbar');
    expect(bar.props.visible).toBe(true);
    expect(bar.props.children.props.children).toBe('Rates set for the other price type were removed.');
  });

  it('D7: nothing is dropped, and no notice shown, when every entry is of the GRN price type', async () => {
    mockGrnRates = [{ price_type: 'monthly', item_id: 'rice', weight_min: 0, weight_max: 100, unit_price: 2, labour_rate: 1, tax_percent: 5 }];
    const tree = await render('create');
    expect(mockDispatch).not.toHaveBeenCalledWith(setGrnRates([]));
    expect(one(tree, 'Snackbar').props.visible).toBe(false);
  });

  it('a refused Create leaves the form open, and the second Create sends the call again', async () => {
    mockRates = [...mockRates, stored('rice', 0, 100, 2)];
    (createGRN as jest.Mock)
      .mockResolvedValueOnce({ success: false, error: 'x', rateError: { code: 'RATE_PLANNED', data: { starts_on: '2026-11-01' } } })
      .mockResolvedValueOnce({ success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
    const tree = await render('create');
    for (let n = 0; n < 2; n += 1) {
      await press(tree);
      await act(async () => { await dialogs(tree).find(d => d.props.title === 'Create this GRN?')!.props.onConfirm(); });
    }
    expect(createGRN).toHaveBeenCalledTimes(2);
    expect(showAlert).toHaveBeenCalledTimes(1);
  });
});

describe('opened on the Rates block from GRN → Overview → Rates (owner, 2026-10-17)', () => {
  const { router } = require('expo-router');
  const scrollView = (tree: ReactTestRenderer) => tree.root.findByType(require('react-native').ScrollView);
  const layoutRates = (tree: ReactTestRenderer, y: number) =>
    act(() => { tree.root.find(n => n.props.testID === 'grn-rates-section' && typeof n.props.onLayout === 'function').props.onLayout({ nativeEvent: { layout: { y } } }); });

  it('scrolls to the Rates block each time it moves while the GRN loads, and stops once the person scrolls', async () => {
    mockParams = { id: GRN_ID, focus: 'rates' };
    const tree = await render('edit');
    const scrollTo = jest.spyOn(scrollView(tree).instance, 'scrollTo').mockImplementation(() => {});
    layoutRates(tree, 600);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 600 - 16, animated: true });
    layoutRates(tree, 900);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 900 - 16, animated: true });
    act(() => { scrollView(tree).props.onScrollBeginDrag(); });
    layoutRates(tree, 1000);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('the normal way in (from step 2) does not scroll, and Previous goes back one screen', async () => {
    mockParams = { id: GRN_ID };
    const tree = await render('edit');
    const scrollTo = jest.spyOn(scrollView(tree).instance, 'scrollTo').mockImplementation(() => {});
    layoutRates(tree, 600);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(backOptions.enabled).toBe(false);
    act(() => { one(tree, 'WizardBottomBar').props.onPrevious(); });
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('Previous and the Back key put steps 1 and 2 under it; Edit details opens step 1', async () => {
    mockParams = { id: GRN_ID, focus: 'rates' };
    const tree = await render('edit');
    act(() => { one(tree, 'WizardBottomBar').props.onPrevious(); });
    expect(router.replace).toHaveBeenLastCalledWith({ pathname: '/grn-edit/[id]/step1', params: { id: GRN_ID } });
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/grn-edit/[id]/step2', params: { id: GRN_ID } });
    expect(router.back).not.toHaveBeenCalled();
    jest.clearAllMocks();
    expect(backOptions.enabled).toBe(true);
    let handled = false;
    act(() => { handled = backOptions.onBackPress!(); });
    expect(handled).toBe(true);
    expect(router.replace).toHaveBeenLastCalledWith({ pathname: '/grn-edit/[id]/step1', params: { id: GRN_ID } });
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/grn-edit/[id]/step2', params: { id: GRN_ID } });
    jest.clearAllMocks();
    act(() => { one(tree, 'GRNStepIndicator').props.onStepPress(1); });
    expect(router.replace).toHaveBeenLastCalledWith({ pathname: '/grn-edit/[id]/step1', params: { id: GRN_ID } });
    expect(router.push).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('the sections fold, one open at a time (owner, 2026-10-17)', () => {
  const SECTIONS = ['details', 'photos', 'items', 'rates'] as const;
  const body = (tree: ReactTestRenderer, section: string) => tree.root.find(n => n.props.testID === `grn-review-body-${section}` && typeof n.type === 'string');
  const isOpen = (tree: ReactTestRenderer, section: string) => [body(tree, section).props.style].flat(Infinity).every((st: any) => st?.display !== 'none');
  const openOnes = (tree: ReactTestRenderer) => SECTIONS.filter(section => isOpen(tree, section));
  const toggle = (tree: ReactTestRenderer, section: string) => tree.root.find(n => n.props.testID === `grn-review-section-${section}` && typeof n.props.onPress === 'function');
  const line = (tree: ReactTestRenderer, section: string) =>
    tree.root.findAll(n => n.props.testID === `grn-review-section-${section}-line` && n.type === Text).map(n => [n.props.children].flat(Infinity).join(''))[0] ?? null;
  const tap = (tree: ReactTestRenderer, section: string) => act(() => { toggle(tree, section).props.onPress(); });

  it('opens on ITEMS; every closed heading carries its line; the open one none', async () => {
    const tree = await render('edit');
    expect(openOnes(tree)).toEqual(['items']);
    expect(line(tree, 'details')).toBe('A0010 · 12 Oct 2026 · Fictional Traders');
    expect(line(tree, 'photos')).toBe('1 photo');
    expect(line(tree, 'items')).toBeNull();
    // Rice has no rate: the red tag says so and no line repeats it.
    expect(line(tree, 'rates')).toBeNull();
    expect(toggle(tree, 'rates').props.accessibilityLabel).toBe('Rates, 1 without a rate');
    expect(toggle(tree, 'items').props.accessibilityState).toEqual({ expanded: true });
    expect(toggle(tree, 'details').props.accessibilityState).toEqual({ expanded: false });
  });

  it('the Edit pencil is an icon only, the chevron\'s size, beside the chevron, and is its own button', async () => {
    const tree = await render('edit');
    const header = tree.root.find(n => n.props.testID === 'grn-review-section-details' && typeof n.props.onPress === 'function').parent!;
    expect(header.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''))).toEqual(['GRN DETAILS', 'A0010 · 12 Oct 2026 · Fictional Traders']);
    const icons = header.findAllByType('Icon' as never).map(n => [n.props.name, n.props.size]);
    expect(icons).toEqual([['pencil-outline', icons[1][1]], ['chevron-down', icons[1][1]]]);
    const edit = tree.root.find(n => n.props.testID === 'grn-review-section-details-edit' && typeof n.props.onPress === 'function');
    expect(edit.props.accessibilityLabel).toBe('Edit GRN details');
    act(() => { edit.props.onPress(); });
    expect(openOnes(tree)).toEqual(['items']);
  });

  it('opening one closes the other; tapping the open one closes it', async () => {
    const tree = await render('create');
    tap(tree, 'details');
    expect(openOnes(tree)).toEqual(['details']);
    expect(line(tree, 'items')).toBe('Total quantity 20');
    tap(tree, 'rates');
    expect(openOnes(tree)).toEqual(['rates']);
    tap(tree, 'rates');
    expect(openOnes(tree)).toEqual([]);
  });

  it('RATES says when every item has a rate, and while it loads', async () => {
    mockRates = [stored('gur', 0, 50, 3), stored('rice', 0, 50, 2)];
    let tree = await render('edit');
    expect(line(tree, 'rates')).toBe('Every item has a rate');
    act(() => tree.unmount());
    mockStatus = 'loading';
    tree = await render('edit');
    expect(line(tree, 'rates')).toBe('Loading rates');
  });

  it('the Summary section is gone: Total items and Total quantity are the last lines of GRN DETAILS', async () => {
    const tree = await render('edit');
    expect(texts(tree)).not.toContain('SUMMARY');
    const detailTexts = body(tree, 'details').findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
    expect(detailTexts.slice(-4)).toEqual(['Total items', '2', 'Total quantity', '20']);
  });

  it('opened from the GRN\'s Rates, RATES is the open section', async () => {
    mockParams = { id: GRN_ID, focus: 'rates' };
    const tree = await render('edit');
    expect(openOnes(tree)).toEqual(['rates']);
  });

  it('a Save blocked by a missing rate opens RATES', async () => {
    const tree = await render('edit');
    expect(openOnes(tree)).toEqual(['items']);
    await press(tree);
    expect(openOnes(tree)).toEqual(['rates']);
  });

  it('staff have no RATES heading; ITEMS is open', async () => {
    mockRole = 'staff';
    const tree = await render('edit');
    expect(tree.root.findAll(n => n.props.testID === 'grn-review-section-rates')).toHaveLength(0);
    expect(SECTIONS.filter(section => section !== 'rates' && isOpen(tree, section))).toEqual(['items']);
  });
});
