/**
 * The Rates section of the GRN review step (backend migration 86): a row per item and bag weight with its
 * rate and where it comes from, Create blocked while a row has no rate, the rate sheet and Undo change, the
 * rates saved with the GRN, and the re-read when the server refuses them.
 */
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, configure, fireEvent, render as renderScreen, screen, userEvent, within } from '@testing-library/react-native';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN, updateGRN } from '@/features/grn/services/grnFormService';
import { setGrnRates, setRateChanges, setRemovedGrnRates } from '@/store/slices/grnFormSlice';
import { contextKey } from '@/features/grn/rates/grnRateModel';
import { askAlert, showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import type { ItemStoragePrice } from '@/types/item-pricing.types';

// A closed section keeps its body (display none) and hides its title from the screen reader; the rows and headings
// these tests read are drawn there too.
beforeAll(() => configure({ defaultIncludeHiddenElements: true }));
afterAll(() => configure({ defaultIncludeHiddenElements: false }));

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
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: mockRole } }, grnForm: { items: [], removedImages: [], grnRates: mockGrnRates, rateChanges: mockChanges, removedGrnRates: mockRemoved, grnInvoiced: mockInvoiced } }),
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

// Children are stand-ins that draw what the test needs: the bottom bar's two buttons, the step header's step 1 pill, an
// open confirm dialog (title, message and its Confirm button, which calls the step's own onConfirm).
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; message?: string; onConfirm: () => unknown }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return props.visible
      ? createElement(
          View,
          { accessible: true, accessibilityRole: 'alert' },
          createElement(Text, null, props.title),
          createElement(Text, null, props.message),
          createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Confirm', onPress: props.onConfirm })
        )
      : null;
  },
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/WizardBottomBar', () => ({
  __esModule: true,
  default: (props: { nextLabel?: string; onNext: () => unknown; onPrevious?: () => unknown }) => {
    const { Pressable, View } = require('react-native');
    const { createElement } = require('react');
    return createElement(
      View,
      null,
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Previous', onPress: props.onPrevious }),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: props.nextLabel, onPress: props.onNext })
    );
  },
}));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => mockParams, useFocusEffect: jest.fn() }));
let backOptions: { enabled?: boolean; onBackPress?: () => boolean } = {};
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: (options: typeof backOptions) => { backOptions = options; } }));
// An icon is drawn as an empty view that carries its name and size, so the test can tell which icons a heading shows.
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({
  __esModule: true,
  default: (props: { name: string; size?: number }) =>
    require('react').createElement(require('react-native').View, { testID: `icon-${props.name}`, style: { width: props.size, height: props.size } }),
}));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
import { showToast } from '@/utils/toast';
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({
  GRNStepIndicator: (props: { onStepPress?: (step: number) => void }) =>
    require('react').createElement(require('react-native').Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Step 1', onPress: () => props.onStepPress?.(1) }),
}));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn(), getNextGRNNumber: jest.fn() }));
// The server is asked about a lost answer by this (utils/lostAnswer); none of these tests loses one.
jest.mock('@/utils/lostAnswer', () => ({ checkSubmission: jest.fn() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNPhotos: jest.fn(), unpreparedGRNPhotos: jest.fn(() => null) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn() }));
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn(async () => ({ isValid: true, errors: {} })), withoutStoredNumberError: (result: unknown) => result }));
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

let user: ReturnType<typeof userEvent.setup>;
let currentMode: 'create' | 'edit' = 'create';
async function render(mode: 'create' | 'edit') {
  currentMode = mode;
  mockForm = {
    header: mockHeader, items: mockItems, grnId: mode === 'edit' ? GRN_ID : null, tempGrnId: mode === 'edit' ? null : 'temp_grn_fixture',
    isSaving: false, isCreateMode: mode === 'create', resetFormState: jest.fn(),
  };
  return renderScreen(<GrnReviewStep mode={mode} />);
}
/** Lets what a press started (the save's async steps, an answered askAlert) finish. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const hasText = (text: string | RegExp) => screen.queryAllByText(text).length > 0;
/** The texts under an element, in reading order, with a no-break space read as a space. */
const textsIn = (element: ReturnType<typeof screen.getByTestId>) =>
  within(element).queryAllByText(/[\s\S]*/).map((node) => [node.props.children].flat(Infinity).join('').replace(/\u00a0/g, ' '));
const ROW_NAMES = [{ item: 'Fictional Gur', weight: '12 kg' }, { item: 'Fictional Rice', weight: '30 kg' }];
type RowAction = 'changeFor' | 'addFor' | 'undoFor' | 'removeFor' | 'restoreFor';
/** A row's action button, by the name a screen reader says for it. */
const action = (kind: RowAction, index: number) => screen.queryByRole('button', { name: t(`grn.rates.${kind}`, ROW_NAMES[index]) });
const actionPress = async (kind: RowAction, index: number) => {
  await user.press(screen.getByRole('button', { name: t(`grn.rates.${kind}`, ROW_NAMES[index]) }));
  await settle();
};
const row = (index: number) => screen.getByTestId(`grn-rate-row-${index}`);
/**
 * The texts of one Rates table row, in reading order: the item, the line under it (weight, band, and at jest's
 * large text labour and tax), the tags, the rent cells (the struck rent under the rent), the actions.
 */
const rowTexts = (index: number) => textsIn(row(index));
/** What a screen reader says for a row's facts: the label of the row's first labelled element. */
const rowA11y = (index: number) => within(row(index)).getAllByLabelText(/.+/)[0].props.accessibilityLabel;
const rowCount = () => screen.queryAllByTestId(/^grn-rate-row-\d+$/).length;
const press = async () => {
  await user.press(screen.getByRole('button', { name: t(currentMode === 'create' ? 'grn.review.createGrn' : 'grn.review.saveGrn') }));
  await settle();
};
/** The save question is open: its title is on a visible dialog. */
const questionShown = (title: string) => within(screen.getByRole('alert')).queryByText(title) !== null;
const noDialogOpen = () => screen.queryAllByRole('alert').length === 0;
const confirm = async () => {
  await user.press(screen.getByRole('button', { name: 'Confirm' }));
  await settle();
};

beforeEach(() => {
  jest.clearAllMocks();
  user = userEvent.setup({ delay: 0 });
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
    await render('create');
    expect(hasText('RATES')).toBe(true);
    // The rent is the row's main value; the weight is the same tag as on the Items card; band, labour and tax follow.
    expect(rowTexts(0)).toEqual(['Fictional Gur', '12 kg each · Labour ₹1.50 · Tax 5%', 'Customer rate', '3.50', 'Change']);
    expect(rowA11y(0)).toBe('Fictional Gur, 12 kg, ₹3.50 per bag, per month, 0–50 kg, labour ₹1.50 per bag, tax 5%, Customer rate');
    // No rate stands where the rent would be.
    expect(rowTexts(1)).toEqual(['Fictional Rice', '30 kg each', 'No rate', '—', 'Add rate']);
    expect(rowA11y(1)).toBe('Fictional Rice, 30 kg, No rate');
    expect(action('changeFor', 0)).toBeOnTheScreen();
    expect(action('addFor', 0)).not.toBeOnTheScreen();
    expect(action('addFor', 1)).toBeOnTheScreen();
    expect(action('changeFor', 1)).not.toBeOnTheScreen();
  });

  it('says Item rate when the default is used, and one row for two lines of the same item and weight', async () => {
    mockRates = [stored('gur', 0, 50, 3)];
    mockItems = [line(1, 'gur', 'Fictional Gur', 12), line(2, 'gur', 'Fictional Gur', 12)];
    await render('create');
    expect(rowCount()).toBe(1);
    expect(rowTexts(0)).toContain('Item rate');
  });

  it('a pending change shows its figures with the date, "Changed · This customer" and Undo change', async () => {
    mockChanges = [{ item_id: 'gur', weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1.5, tax_percent: 5, scope: 'customer', to: null, ctx: contextKey(CTX), price_type: 'monthly' }];
    await render('create');
    // The new rent, with the customer's rent it replaces struck through under it.
    expect(rowTexts(0)).toEqual([
      'Fictional Gur', '12 kg each · Labour ₹1.50 · Tax 5% · From 12/10/26', 'Changed · This customer', '4.00', '3.50',
      'Undo change', 'Change',
    ]);
    expect(screen.getByTestId('grn-rate-was-0')).toHaveStyle({ textDecorationLine: 'line-through' });
    expect(rowA11y(0)).toBe('Fictional Gur, 12 kg, ₹4.00 per bag, per month, 0–50 kg, labour ₹1.50 per bag, tax 5%, Changed · This customer, From 12 Oct 2026, was ₹3.50');
    await actionPress('undoFor', 0);
    expect(mockDispatch).toHaveBeenCalledWith(setGrnRates([]));
    expect(mockDispatch).toHaveBeenCalledWith(setRateChanges([]));
  });

  it('edit mode: the rates for this GRN only that the form was seeded with price the row, tagged This GRN only', async () => {
    mockGrnRates = [{ price_type: 'monthly', item_id: 'rice', weight_min: 21, weight_max: 40, unit_price: 2.25, labour_rate: 1, tax_percent: 5 }];
    await render('edit');
    // Rice has no stored rate, so nothing is struck through.
    expect(rowTexts(1)).toEqual(['Fictional Rice', '30 kg each · Labour ₹1.00 · Tax 5%', 'This GRN only', '2.25', 'Undo change', 'Change']);
    expect(hasText('No rate')).toBe(false);
    await press();
    expect(questionShown('Save changes to GRN A0010?')).toBe(true);
  });

  it('while the rates load or fail, it says so, and Try again reads them again', async () => {
    mockStatus = 'loading';
    const { unmount } = await render('create');
    expect(hasText('Loading rates')).toBe(true);
    await unmount();
    mockStatus = 'error';
    await render('create');
    expect(hasText("Couldn't load the rates")).toBe(true);
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(mockRefresh).toHaveBeenCalled();
  });
});

describe('Create is blocked without a rate', () => {
  it('says rates are missing, shows no question and sends nothing', async () => {
    await render('create');
    await press();
    expect(showAlert).toHaveBeenCalledWith('Add the missing rates', 'Add the missing rates before saving.');
    expect(noDialogOpen()).toBe(true);
    expect(createGRN).not.toHaveBeenCalled();
  });

  it('saving an edit is blocked the same way', async () => {
    await render('edit');
    await press();
    expect(showAlert).toHaveBeenCalledWith('Add the missing rates', 'Add the missing rates before saving.');
    expect(updateGRN).not.toHaveBeenCalled();
  });

  it('is blocked while the rates are not loaded', async () => {
    mockStatus = 'error';
    await render('create');
    await press();
    expect(showAlert).toHaveBeenCalledWith("The rates couldn't be loaded", "The rates couldn't be loaded. Check your connection and try again before saving.");
    expect(createGRN).not.toHaveBeenCalled();
  });

  it('goes on to the question once every row has a rate', async () => {
    mockRates = [...mockRates, stored('rice', 0, 100, 2)];
    await render('create');
    await press();
    expect(showAlert).not.toHaveBeenCalled();
    expect(questionShown('Create GRN A0010?')).toBe(true);
  });

  it('an administrator saving a GRN dated before the items\' first rates is not stopped: the first rate covers the day (D16)', async () => {
    mockRates = [{ ...stored('gur', 0, 50, 3), effective_from: '2026-12-01' }, { ...stored('rice', 0, 100, 2), effective_from: '2026-12-01' }];
    await render('create');
    expect(hasText('No rate')).toBe(false);
    await press();
    expect(showAlert).not.toHaveBeenCalledWith('Add the missing rates', expect.anything());
    expect(questionShown('Create GRN A0010?')).toBe(true);
  });
});

describe('Add rate and the sheet', () => {
  it('Add rate opens the sheet for that row; saving puts the rate in the form, which then prices the row', async () => {
    await render('create');
    await actionPress('addFor', 1);
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
    await render('create');
    await actionPress('changeFor', 0);
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
    const { unmount } = await render('create');
    await press();
    await confirm();
    expect((createGRN as jest.Mock).mock.calls[0][0].rates).toEqual([
      { scope: 'grn', item_id: 'rice', weight_min: 21, weight_max: 40, unit_price: 2.5, labour_rate: 1, tax_percent: 5 },
    ]);
    await unmount();

    (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
    await render('edit');
    await press();
    await confirm();
    expect((updateGRN as jest.Mock).mock.calls[0][1].rates).toHaveLength(1);
  });

  it.each([
    ['RATE_MISSING', { lines: [{ item_id: 'rice', item_name: 'Fictional Rice', weight: 30 }] }, 'The server found no rate for 1 item. The rates are shown again; add the missing one and save.'],
    ['RATE_PLANNED', { starts_on: '2026-11-01' }, 'A rate for this weight band already starts on 01/11/26. Choose a last day before it.'],
    ['BANDS_OVERLAP', {}, "This weight band overlaps another band of the item's rate. Use the same band, or change the bands on the item's Pricing tab."],
    ['GRN_INVOICED', {}, 'This GRN is invoiced, so its rates for this GRN only cannot change.'],
  ])('%s: reads the rates again and shows the reason', async (code, data, text) => {
    mockRates = [...mockRates, stored('rice', 0, 100, 2)];
    (createGRN as jest.Mock).mockResolvedValue({ success: false, error: 'server text', rateError: { code, data } });
    await render('create');
    await press();
    await confirm();
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
    await render('create');
    expect(hasText('RATES')).toBe(false);
    expect(screen.queryAllByTestId('grn-rates-section')).toHaveLength(0);
    expect(rowCount()).toBe(0);
    expect(sheetProps).toEqual({});
    expect(mockUseGrnRates.mock.calls[0][0]).toEqual([]);
    expect(mockUseStandardRate).toHaveBeenCalledWith(false);
  });

  it('create and edit save without p_rates, and a line without a rate does not block the save', async () => {
    (createGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
    const { unmount } = await render('create');
    await press();
    expect(showAlert).not.toHaveBeenCalled();
    await confirm();
    expect((createGRN as jest.Mock).mock.calls[0][0].rates).toBeUndefined();
    await unmount();

    (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
    await render('edit');
    await press();
    await confirm();
    expect((updateGRN as jest.Mock).mock.calls[0][1].rates).toBeUndefined();
  });

  it('keeps the form untouched for the other price type (nothing is dropped, nobody is told)', async () => {
    mockGrnRates = [{ price_type: 'one_time', item_id: 'rice', weight_min: 21, weight_max: 40, unit_price: 2.5, labour_rate: 1, tax_percent: 5 }];
    await render('create');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('a supervisor of the same GRN still sees the block and sends the rates', async () => {
    mockRole = 'supervisor';
    await render('create');
    expect(hasText('RATES')).toBe(true);
    expect(mockUseStandardRate).toHaveBeenCalledWith(true);
    expect(mockUseGrnRates.mock.calls[0][0]).toEqual(['gur', 'rice']);
  });
});

describe('round 3', () => {
  const everyone = { item_id: 'gur', price_type: 'monthly', weight_min: 0, weight_max: 50, unit_price: 4, labour_rate: 1.5, tax_percent: 5, scope: 'everyone', to: null, ctx: contextKey(CTX) };

  it('D1: an Everyone change does not price a row the customer has an own rate for; it shows both tags and Undo change', async () => {
    mockChanges = [everyone];
    await render('create');
    // The row keeps the customer's own rent, so nothing is struck through.
    expect(rowTexts(0)).toEqual(['Fictional Gur', '12 kg each · Labour ₹1.50 · Tax 5%', 'Customer rate', 'Changed · Everyone', '3.50', 'Undo change', 'Change']);
    expect(action('undoFor', 0)).toBeOnTheScreen();
  });

  it('D9: the section header carries the count of rows without a rate as a tag', async () => {
    const { unmount } = await render('create');
    expect(hasText('1 without a rate')).toBe(true);
    await unmount();
    mockRates = [...mockRates, stored('rice', 0, 100, 2)];
    await render('create');
    expect(hasText(/without a rate/)).toBe(false);
  });

  it('D9: Add rate is a secondary button, not a second primary', async () => {
    await render('create');
    // A secondary button is outlined on a transparent ground; a primary one is filled and has no border.
    expect(action('addFor', 1)).toHaveStyle({ backgroundColor: 'transparent', borderWidth: 1 });
  });

  it('D9: a saved GRN-only rate offers Remove, a pending one Undo change', async () => {
    mockGrnRates = [{ price_type: 'monthly', item_id: 'rice', weight_min: 0, weight_max: 100, unit_price: 2, labour_rate: 1, tax_percent: 5, saved: true }];
    const { unmount } = await render('edit');
    expect(within(action('removeFor', 1)!).getByText('Remove')).toBeOnTheScreen();
    expect(action('undoFor', 1)).not.toBeOnTheScreen();
    await unmount();
    mockGrnRates = [{ price_type: 'monthly', item_id: 'rice', weight_min: 0, weight_max: 100, unit_price: 2, labour_rate: 1, tax_percent: 5 }];
    await render('edit');
    expect(within(action('undoFor', 1)!).getByText('Undo change')).toBeOnTheScreen();
    expect(action('removeFor', 1)).not.toBeOnTheScreen();
  });

  it('Remove asks first; Cancel keeps the rate, Remove drops it; Undo change asks nothing', async () => {
    const savedRice = { price_type: 'monthly' as const, item_id: 'rice', weight_min: 0, weight_max: 100, unit_price: 2, labour_rate: 1, tax_percent: 5 };
    mockGrnRates = [{ ...savedRice, saved: true }];
    const { unmount } = await render('edit');
    expect(screen.getByRole('button', { name: "Remove this GRN's own rate of Fictional Rice, 30 kg" })).toBeOnTheScreen();
    (askAlert as jest.Mock).mockResolvedValueOnce(false);
    await actionPress('removeFor', 1);
    expect(askAlert).toHaveBeenCalledWith(
      "Remove this GRN's own rate?",
      "Fictional Rice will be charged at the customer's rate or the default rate instead. The rate is removed when you save the GRN.",
      [{ text: 'Cancel', style: 'cancel', value: false }, { text: 'Remove', style: 'destructive', value: true }],
      false
    );
    expect(mockDispatch).not.toHaveBeenCalledWith(setGrnRates([]));
    (askAlert as jest.Mock).mockResolvedValueOnce(true);
    await actionPress('removeFor', 1);
    expect(mockDispatch).toHaveBeenCalledWith(setGrnRates([]));
    expect(mockDispatch).toHaveBeenCalledWith(setRemovedGrnRates([{ ...savedRice, saved: true }]));
    await unmount();
    (askAlert as jest.Mock).mockClear();
    mockDispatch.mockClear();
    mockGrnRates = [savedRice];
    await render('edit');
    await actionPress('undoFor', 1);
    expect(askAlert).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(setGrnRates([]));
  });

  it('after Remove the row says "Removed when you save" and Undo remove puts the rate back', async () => {
    const savedRice = { price_type: 'monthly' as const, item_id: 'rice', weight_min: 0, weight_max: 100, unit_price: 2, labour_rate: 1, tax_percent: 5, saved: true };
    mockRemoved = [savedRice];
    const { unmount } = await render('edit');
    // Rice has no other rate, so the row is without one, with the tag and Undo remove beside Add rate.
    expect(rowTexts(1)).toEqual(['Fictional Rice', '30 kg each', 'No rate', 'Removed when you save', '—', 'Undo remove', 'Add rate']);
    expect(screen.getByRole('button', { name: "Put back this GRN's own rate of Fictional Rice, 30 kg" })).toBeOnTheScreen();
    expect(rowA11y(1)).toBe('Fictional Rice, 30 kg, No rate, Removed when you save');
    expect(action('restoreFor', 0)).not.toBeOnTheScreen();
    await actionPress('restoreFor', 1);
    expect(mockDispatch).toHaveBeenCalledWith(setGrnRates([savedRice]));
    expect(mockDispatch).toHaveBeenCalledWith(setRemovedGrnRates([]));
    await unmount();
    // A rate typed after Remove prices the row: no Undo remove until that change is undone.
    mockGrnRates = [{ ...savedRice, unit_price: 3, saved: undefined }];
    await render('edit');
    expect(action('restoreFor', 1)).not.toBeOnTheScreen();
    expect(hasText('Removed when you save')).toBe(false);
  });

  describe('D4: an invoiced GRN', () => {
    beforeEach(() => {
      mockInvoiced = true;
      // Gur has a stored rate; rice has none (an old GRN priced by its invoice's own figures).
      mockGrnRates = [{ price_type: 'monthly', item_id: 'gur', weight_min: 0, weight_max: 50, unit_price: 4.5, labour_rate: 1, tax_percent: 5, saved: true }];
    });

    it('shows the note, no Add rate / Change / Undo, and "No rate" for a row without one', async () => {
      await render('edit');
      expect(hasText('This GRN is invoiced; its rates cannot change here.')).toBe(true);
      expect(hasText('No rate')).toBe(true);
      expect(action('addFor', 1)).not.toBeOnTheScreen();
      expect(action('changeFor', 0)).not.toBeOnTheScreen();
      expect(action('undoFor', 0)).not.toBeOnTheScreen();
      expect(hasText(/without a rate/)).toBe(false);
    });

    it('Save is not blocked by the missing rate and sends the stored set back unchanged', async () => {
      await render('edit');
      await press();
      expect(showAlert).not.toHaveBeenCalled();
      expect(questionShown('Save changes to GRN A0010?')).toBe(true);
      (updateGRN as jest.Mock).mockResolvedValue({ success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
      await confirm();
      expect((updateGRN as jest.Mock).mock.calls[0][1].rates).toEqual([
        { scope: 'grn', item_id: 'gur', weight_min: 0, weight_max: 50, unit_price: 4.5, labour_rate: 1, tax_percent: 5 },
      ]);
    });
  });

  it('D7: entries of the other price type are dropped from the form and the person is told once', async () => {
    mockGrnRates = [{ price_type: 'one_time', item_id: 'rice', weight_min: 0, weight_max: 100, unit_price: 2, labour_rate: 0, tax_percent: 5 }];
    mockChanges = [{ ...everyone, price_type: 'one_time' }];
    await render('create');
    expect(mockDispatch).toHaveBeenCalledWith(setGrnRates([]));
    expect(mockDispatch).toHaveBeenCalledWith(setRateChanges([]));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Rates set for the other price type were removed.');
  });

  it('D7: nothing is dropped, and no notice shown, when every entry is of the GRN price type', async () => {
    mockGrnRates = [{ price_type: 'monthly', item_id: 'rice', weight_min: 0, weight_max: 100, unit_price: 2, labour_rate: 1, tax_percent: 5 }];
    await render('create');
    expect(mockDispatch).not.toHaveBeenCalledWith(setGrnRates([]));
    expect(screen.toJSON()).toBeTruthy();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a refused Create leaves the form open, and the second Create sends the call again', async () => {
    mockRates = [...mockRates, stored('rice', 0, 100, 2)];
    (createGRN as jest.Mock)
      .mockResolvedValueOnce({ success: false, error: 'x', rateError: { code: 'RATE_PLANNED', data: { starts_on: '2026-11-01' } } })
      .mockResolvedValueOnce({ success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } });
    await render('create');
    for (let n = 0; n < 2; n += 1) {
      await press();
      await confirm();
    }
    expect(createGRN).toHaveBeenCalledTimes(2);
    expect(showAlert).toHaveBeenCalledTimes(1);
  });
});

describe('opened on the Rates block from GRN → Overview → Rates (owner, 2026-10-17)', () => {
  const { router } = require('expo-router');
  // The jest ScrollView keeps one shared scrollTo stand-in on its prototype.
  const scrollTo = ScrollView.prototype.scrollTo as unknown as jest.Mock;
  // The scroll view has no role, label or text: it is the only way to send it a drag.
  const scrollView = () => screen.container.queryAll((node) => (node.type as unknown) === 'RCTScrollView')[0];
  const layoutRates = (y: number) => fireEvent(screen.getByTestId('grn-rates-section'), 'layout', { nativeEvent: { layout: { y } } });

  it('scrolls to the Rates block each time it moves while the GRN loads, and stops once the person scrolls', async () => {
    mockParams = { id: GRN_ID, focus: 'rates' };
    await render('edit');
    scrollTo.mockClear();
    await layoutRates(600);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 600 - 16, animated: true });
    await layoutRates(900);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 900 - 16, animated: true });
    await fireEvent(scrollView(), 'scrollBeginDrag');
    await layoutRates(1000);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('the normal way in (from step 2) does not scroll, and Previous goes back one screen', async () => {
    mockParams = { id: GRN_ID };
    await render('edit');
    scrollTo.mockClear();
    await layoutRates(600);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(backOptions.enabled).toBe(false);
    await user.press(screen.getByRole('button', { name: 'Previous' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('Previous and the Back key put steps 1 and 2 under it; Edit details opens step 1', async () => {
    mockParams = { id: GRN_ID, focus: 'rates' };
    await render('edit');
    await user.press(screen.getByRole('button', { name: 'Previous' }));
    expect(router.replace).toHaveBeenLastCalledWith({ pathname: '/grn-edit/[id]/step1', params: { id: GRN_ID } });
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/grn-edit/[id]/step2', params: { id: GRN_ID } });
    expect(router.back).not.toHaveBeenCalled();
    jest.clearAllMocks();
    expect(backOptions.enabled).toBe(true);
    let handled = false;
    await act(async () => { handled = backOptions.onBackPress!(); });
    expect(handled).toBe(true);
    expect(router.replace).toHaveBeenLastCalledWith({ pathname: '/grn-edit/[id]/step1', params: { id: GRN_ID } });
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/grn-edit/[id]/step2', params: { id: GRN_ID } });
    jest.clearAllMocks();
    await user.press(screen.getByRole('button', { name: 'Step 1' }));
    expect(router.replace).toHaveBeenLastCalledWith({ pathname: '/grn-edit/[id]/step1', params: { id: GRN_ID } });
    expect(router.push).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('the sections fold, one open at a time (owner, 2026-10-17)', () => {
  const SECTIONS = ['details', 'photos', 'items', 'rates'] as const;
  const NAMES = { details: /^GRN details/, photos: /^Photos/, items: /^Items/, rates: /^Rates/ };
  const body = (section: string) => screen.getByTestId(`grn-review-body-${section}`);
  const isOpen = (section: string) => StyleSheet.flatten(body(section).props.style)?.display !== 'none';
  const openOnes = () => SECTIONS.filter(isOpen);
  const toggle = (section: keyof typeof NAMES) => screen.getByRole('button', { name: NAMES[section] });
  const closedLine = (section: string) => {
    const node = screen.queryByTestId(`grn-review-section-${section}-line`);
    return node ? [node.props.children].flat(Infinity).join('') : null;
  };
  const tap = async (section: keyof typeof NAMES) => { await user.press(toggle(section)); };

  it('opens on ITEMS; every closed heading carries its line; the open one none', async () => {
    await render('edit');
    expect(openOnes()).toEqual(['items']);
    expect(closedLine('details')).toBe('A0010 · 12/10/26 · Fictional Traders');
    expect(closedLine('photos')).toBe('1 photo');
    expect(closedLine('items')).toBeNull();
    // Rice has no rate: the red tag says so and no line repeats it.
    expect(closedLine('rates')).toBeNull();
    expect(toggle('rates')).toHaveAccessibleName('Rates, 1 without a rate');
    // The closed DETAILS line is read with the date in words.
    expect(toggle('details')).toHaveAccessibleName('GRN details, A0010 · 12 Oct 2026 · Fictional Traders');
    expect(toggle('items')).toBeExpanded();
    expect(toggle('items').props.accessibilityState).toEqual({ expanded: true });
    expect(toggle('details').props.accessibilityState).toEqual({ expanded: false });
  });

  it('reads the date row of DETAILS in words, while the row shows 12/10/26', async () => {
    await render('edit');
    await tap('details');
    expect(screen.getAllByLabelText('Date, 12 Oct 2026').length).toBeGreaterThan(0);
    expect(hasText('12/10/26')).toBe(true);
  });

  it('the Edit pencil is an icon only, the chevron\'s size, beside the chevron, and is its own button', async () => {
    await render('edit');
    // The heading is the toggle's parent: no query reaches "the elements beside the toggle" but the tree.
    const header = toggle('details').parent!;
    expect(within(header).queryAllByText(/[\s\S]*/).map((node) => [node.props.children].flat(Infinity).join(''))).toEqual(['GRN DETAILS', 'A0010 · 12/10/26 · Fictional Traders']);
    const icons = within(header).queryAllByTestId(/^icon-/);
    expect(icons.map((icon) => icon.props.testID)).toEqual(['icon-pencil-outline', 'icon-chevron-down']);
    const chevronSize = StyleSheet.flatten(icons[1].props.style).width;
    expect(icons[0]).toHaveStyle({ width: chevronSize, height: chevronSize });
    const edit = screen.getByRole('button', { name: 'Edit GRN details' });
    expect(within(edit).getByTestId('icon-pencil-outline')).toBeOnTheScreen();
    await user.press(edit);
    expect(openOnes()).toEqual(['items']);
  });

  it('opening one closes the other; tapping the open one closes it', async () => {
    await render('create');
    await tap('details');
    expect(openOnes()).toEqual(['details']);
    expect(closedLine('items')).toBe('Total quantity 20');
    await tap('rates');
    expect(openOnes()).toEqual(['rates']);
    await tap('rates');
    expect(openOnes()).toEqual([]);
  });

  it('RATES says when every item has a rate, and while it loads', async () => {
    mockRates = [stored('gur', 0, 50, 3), stored('rice', 0, 50, 2)];
    const { unmount } = await render('edit');
    expect(closedLine('rates')).toBe('Every item has a rate');
    await unmount();
    mockStatus = 'loading';
    await render('edit');
    expect(closedLine('rates')).toBe('Loading rates');
  });

  it('the Summary section is gone: Total items and Total quantity are the last lines of GRN DETAILS', async () => {
    await render('edit');
    expect(hasText('SUMMARY')).toBe(false);
    expect(textsIn(body('details')).slice(-4)).toEqual(['Total items', '2', 'Total quantity', '20']);
  });

  it('opened from the GRN\'s Rates, RATES is the open section', async () => {
    mockParams = { id: GRN_ID, focus: 'rates' };
    await render('edit');
    expect(openOnes()).toEqual(['rates']);
  });

  it('a Save blocked by a missing rate opens RATES', async () => {
    await render('edit');
    expect(openOnes()).toEqual(['items']);
    await press();
    expect(openOnes()).toEqual(['rates']);
  });

  it('staff have no RATES heading; ITEMS is open', async () => {
    mockRole = 'staff';
    await render('edit');
    expect(screen.queryByRole('button', { name: NAMES.rates })).not.toBeOnTheScreen();
    expect(SECTIONS.filter((section) => section !== 'rates' && isOpen(section))).toEqual(['items']);
  });
});
