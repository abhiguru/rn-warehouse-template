/**
 * WH-180: Save on an imported GRN through the real GrnReviewStep (handleSubmit). Its details, photos and items are not
 * checked or sent as changes; the rate checks stay; an app-made GRN still needs its details and a photo.
 * The form validation is the real one (not mocked).
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN, updateGRN } from '@/features/grn/services/grnFormService';
import { previewUpdateGrn } from '@/services/orderEffects';
import { uploadGRNPhotos } from '@/features/grn/services/imageUploadService';
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
let mockImported = false;
let mockRole = 'supervisor';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: mockRole } }, grnForm: { items: [], removedImages: [], grnRates: mockGrnRates, rateChanges: mockChanges, removedGrnRates: mockRemoved, grnInvoiced: mockInvoiced, grnImported: mockImported } }),
}));

let mockHeader: Record<string, unknown> = {
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
// The dialog draws its title and Confirm button while it is open, and the bar draws its Next button; both call the real props.
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; onConfirm: () => unknown }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return props.visible
      ? createElement(View, null,
        createElement(Text, null, props.title),
        createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Confirm', onPress: props.onConfirm }))
      : null;
  },
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/WizardBottomBar', () => ({
  __esModule: true,
  default: (props: { onNext: () => unknown }) =>
    require('react').createElement(require('react-native').Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Wizard next', onPress: props.onNext }),
}));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => mockParams, useFocusEffect: jest.fn() }));
let backOptions: { enabled?: boolean; onBackPress?: () => boolean } = {};
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: (options: typeof backOptions) => { backOptions = options; } }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/features/grn/services/grnFormService', () => ({ buildUpdateGRNRequest: jest.requireActual('@/features/grn/services/grnFormService').buildUpdateGRNRequest, createGRN: jest.fn(), updateGRN: jest.fn(), getNextGRNNumber: jest.fn() }));
// The server is asked about a lost answer by this (utils/lostAnswer); none of these tests loses one.
jest.mock('@/services/orderEffects', () => ({ ...jest.requireActual('@/services/orderEffects'), previewUpdateGrn: jest.fn(async () => []) }));
jest.mock('@/utils/lostAnswer', () => ({ checkSubmission: jest.fn() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNPhotos: jest.fn(), unpreparedGRNPhotos: jest.fn(() => null) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn() }));
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


const EDITED = { success: true, data: { id: GRN_ID, photos: { uploadedCount: 0, failed: [], removalFailures: 0 } } };
const CUST = '77777777-2222-4333-8444-555555555555';
const GUR = '88888888-2222-4333-8444-555555555555';
const RICE = '99999999-2222-4333-8444-555555555555';
const APP_HEADER = { ...mockHeader, customer_id: CUST, supervisor_id: '66666666-2222-4333-8444-555555555555' };
/** An imported GRN as the edit form loads it: no supervisor chosen, no sender, no photos. */
const IMPORTED_HEADER = { ...APP_HEADER, supervisor_id: undefined, sender_name: '', supervisor_name: '', gr_images: [] };

async function show() {
  mockForm = { header: mockHeader, items: mockItems, grnId: GRN_ID, tempGrnId: null, isSaving: false, isCreateMode: false, resetFormState: jest.fn() };
  await render(<GrnReviewStep mode="edit" />);
}
const SAVE_TITLE = 'Save changes to GRN A0010?';
const saveDialog = () => screen.queryByText(SAVE_TITLE);
const press = () => userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name: 'Wizard next' }));
const confirm = () => userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name: 'Confirm' }));
// A section of the review card has no role or text of its own to ask for, so its test id is the way to it.
const photosSection = () => screen.queryByTestId('grn-review-section-photos');

beforeEach(() => {
  jest.clearAllMocks();
  mockGrnRates = [];
  mockChanges = [];
  mockRemoved = [];
  mockInvoiced = false;
  mockImported = false;
  mockRole = 'supervisor';
  mockStatus = 'ready';
  mockParams = {};
  backOptions = {};
  sheetProps = {};
  mockHeader = { ...APP_HEADER };
  mockItems = [line(1, GUR, 'Fictional Gur', 12), line(2, RICE, 'Fictional Rice', 30)];
  mockRates = [stored(GUR, 0, 50, 3.5, CUST), stored(RICE, 0, 100, 2)];
  (updateGRN as jest.Mock).mockResolvedValue(EDITED);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Save on an imported GRN', () => {
  beforeEach(() => {
    mockImported = true;
    mockHeader = { ...IMPORTED_HEADER, supervisor_id: undefined };
  });

  it('with no supervisor, a blank sender and no photos, asks to save and reaches the server call', async () => {
    await show();
    await press();
    expect(showAlert).not.toHaveBeenCalled();
    expect(saveDialog()).toBeOnTheScreen();
    await confirm();
    expect(updateGRN).toHaveBeenCalledTimes(1);
  });

  it('sends the rates, the details exactly as stored and no photo', async () => {
    await show();
    await press();
    await confirm();
    // An edit uploads its photos inside updateGRN (from header.gr_images) and removes them by the options' removedImages.
    const [id, request, options] = (updateGRN as jest.Mock).mock.calls[0];
    expect(id).toBe(GRN_ID);
    expect(Array.isArray(request.rates)).toBe(true);
    expect(request.header).toEqual({
      registration: '', date: '2026-10-12', sender_id: undefined, sender_name: '', customer_id: CUST, customer_name: 'Fictional Traders',
      supervisor_id: undefined, supervisor_name: '', note: '', leon: false, pricing_mode: 'MONTHLY', gr_images: [],
    });
    expect(options.removedImages).toEqual([]);
    expect(uploadGRNPhotos).not.toHaveBeenCalled();
  });

  it('the same save of a GRN made in the app does send its photo (so the check above can fail)', async () => {
    mockImported = false;
    mockHeader = { ...APP_HEADER };
    await show();
    await press();
    await confirm();
    const request = (updateGRN as jest.Mock).mock.calls[0][1];
    expect(request.header.gr_images).toHaveLength(1);
    expect(request.header.supervisor_id).toBe(APP_HEADER.supervisor_id);
  });

  it('shows no Photos section, while a GRN made in the app shows it', async () => {
    await show();
    expect(photosSection()).toBeNull();
    await act(async () => { screen.unmount(); });
    mockImported = false;
    mockHeader = { ...APP_HEADER };
    await show();
    expect(photosSection()).toBeOnTheScreen();
  });

  it('does not ask the server which orders the save changes; a GRN made in the app does', async () => {
    await show();
    await press();
    expect(previewUpdateGrn).not.toHaveBeenCalled();
    await act(async () => { screen.unmount(); });
    mockImported = false;
    mockHeader = { ...APP_HEADER };
    await show();
    await press();
    expect(previewUpdateGrn).toHaveBeenCalled();
  });

  it('is still stopped by a line without a rate', async () => {
    mockRates = [stored(GUR, 0, 50, 3.5, CUST)];
    await show();
    await press();
    expect(showAlert).toHaveBeenCalledWith('Add the missing rates', 'Add the missing rates before saving.');
    expect(saveDialog()).toBeNull();
    expect(updateGRN).not.toHaveBeenCalled();
  });

  it('is still stopped while the rates are not loaded', async () => {
    mockStatus = 'error';
    await show();
    await press();
    expect(saveDialog()).toBeNull();
    expect(updateGRN).not.toHaveBeenCalled();
  });
});

describe('Save on a GRN made in the app (the old checks stay)', () => {
  it('needs the details: a blank sender stops it with the details alert and sends nothing', async () => {
    mockHeader = { ...APP_HEADER, sender_name: '' };
    await show();
    await press();
    expect(showAlert).toHaveBeenCalledWith('Check the GRN details', expect.stringContaining('Sender name is required'));
    expect(saveDialog()).toBeNull();
    expect(updateGRN).not.toHaveBeenCalled();
  });

  it('needs a photo: with valid details and none, it says so and sends nothing', async () => {
    mockHeader = { ...APP_HEADER, gr_images: [] };
    await show();
    await press();
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect((showAlert as jest.Mock).mock.calls[0][0]).toMatch(/photo/i);
    expect(updateGRN).not.toHaveBeenCalled();
  });

  it('with details and a photo, asks to save as before', async () => {
    await show();
    await press();
    expect(showAlert).not.toHaveBeenCalled();
    expect(saveDialog()).toBeOnTheScreen();
  });
});
