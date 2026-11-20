/**
 * GRN Review step: small behaviours of the batch of 2026-10-31 (staff notice for items without a rate, the section the
 * step opens on, the success dialog's total, the server's refusals for the date and the number).
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN, getNextGRNNumber, updateGRN } from '@/features/grn/services/grnFormService';
import { unpreparedGRNPhotos } from '@/features/grn/services/imageUploadService';
import { getGrnItemRates, getItemsWithoutRate } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const SAVED_PHOTO = 'aaaaaaaa-2222-4333-8444-555555555555';

const mockDispatch = jest.fn();
let mockRemovedImages: Array<{ id: string; storagePath?: string }> = [];
let mockNonce: string | null = null;
let mockNumberTyped = false;
let mockOffline = false;
let mockRole: string | undefined;
let mockInvoiced = false;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      theme: { preference: 'light', brand: 'orange' },
      auth: { userProfile: { role: mockRole } },
      grnForm: { items: [], removedImages: mockRemovedImages, submissionNonce: mockNonce, grNoTyped: mockNumberTyped, grnInvoiced: mockInvoiced },
    }),
}));
// The server is asked about the request code by this (utils/lostAnswer); the tests say what it answers and when. The
// strip shown while a lost answer is checked reads the connection with the same online test the wait uses.
jest.mock('@/utils/lostAnswer', () => ({
  checkSubmission: jest.fn(),
  waitForServer: jest.fn(),
  isLostAnswer: jest.fn(),
  useIsDisconnected: () => mockOffline,
}));

const mockHeader = {
  gr_no: 'A0010',
  date: '2026-10-01',
  sender_name: 'Fictional Sender',
  customer_id: 'c-fixture',
  customer_name: 'Fictional Traders',
  supervisor_name: 'Fictional Supervisor',
  registration: '',
  note: '',
  leon: false,
  pricing_mode: 'MONTHLY',
  gr_images: [
    { id: SAVED_PHOTO, fileName: 'book.webp', imageUrl: 'https://example.invalid/book', storagePath: 'headers/g/book.webp', uploadStatus: 'completed' },
  ],
};
const mockItems = [
  { grn_trl_id: '55555555-2222-4333-8444-555555555555', item_table_id: 'i1', item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, stock: 10, weight: 50, rack: '', package_mark: '', trl_images: [] },
];
let mockForm: Record<string, unknown>;
jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));
jest.mock('@/features/grn/rates/useGrnRates', () => require('@/tests/helpers/grnRatesMock').grnRatesModuleMock());
jest.mock('@/features/grn/rates/GrnRateSheet', () => ({ GrnRateSheet: () => null }));
jest.mock('@/services/item-pricing-service', () => ({ getGrnItemRates: jest.fn(), getItemsWithoutRate: jest.fn().mockResolvedValue(null) }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null, status: 'ready' }) }));

// Photo children are stand-ins that keep their props (the tests do not use them).
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
// Children are stand-ins that draw what the step hands them (an open dialog with its buttons, the success dialog's
// figures, the bar's Next with its busy state) and call the real props, so the test taps them.
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; message: string; confirmText?: string; cancelText?: string; onConfirm: () => unknown; onCancel: () => void }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return props.visible
      ? createElement(
        View,
        { accessible: true, accessibilityRole: 'alert' },
        createElement(Text, null, props.title),
        createElement(Text, null, props.message),
        createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: props.confirmText, onPress: props.onConfirm }),
        createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: props.cancelText, onPress: props.onCancel })
      )
      : null;
  },
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({
  DocumentSuccessDialog: (props: { isVisible: boolean; documentData: { itemCount?: number; totalQuantity?: number; notices?: string[] } | null }) => {
    const { Text, View } = require('react-native');
    const { createElement } = require('react');
    const data = props.documentData;
    return props.isVisible && data
      ? createElement(
        View,
        { accessible: true, accessibilityLabel: 'Success dialog' },
        createElement(Text, null, `Items ${data.itemCount} Total quantity ${data.totalQuantity}`),
        // The exact `notices` the dialog was given (none at all is not an empty list).
        createElement(Text, null, `Notices ${JSON.stringify(data.notices)}`)
      )
      : null;
  },
}));
jest.mock('@/components/WizardBottomBar', () => ({
  __esModule: true,
  default: (props: { onNext: () => unknown; isLoading?: boolean }) =>
    require('react').createElement(require('react-native').Pressable, {
      accessibilityRole: 'button',
      accessibilityLabel: 'Next',
      accessibilityState: { busy: props.isLoading },
      onPress: props.onNext,
    }),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useRouter: () => ({ back: jest.fn() }), useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn(), getNextGRNNumber: jest.fn() }));
// What unpreparedGRNPhotos answers for real forms is tested with the service (grnPhotoSaving.test.ts).
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNPhotos: jest.fn(), unpreparedGRNPhotos: jest.fn(() => null) }));
jest.mock('@/utils/alert', () => require('@/tests/helpers/alertMock').alertModuleMock(jest.fn()));
// The notes of unfinished creates (src/services/unfinishedSaves.ts): this test reads what the screen does with them.
jest.mock('@/services/unfinishedSaves', () => ({
  forgetUnfinishedSave: jest.fn(async () => {}),
  releaseUnfinishedSave: jest.fn(),
  rememberUnfinishedSave: jest.fn(async () => {}),
}));
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn(async () => ({ isValid: true, errors: {} })), withoutStoredNumberError: (result: unknown) => result }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/localPhotoFiles', () => ({
  abandonLocalPhotoUpload: jest.fn(),
  releaseLocalPhotos: jest.fn(async () => 0),
}));

const user = userEvent.setup({ delay: 0 });

async function show(mode: 'create' | 'edit' = 'create', header: Record<string, unknown> = mockHeader, items: Array<Record<string, unknown>> = mockItems) {
  mockForm = {
    header,
    items,
    grnId: mode === 'edit' ? GRN_ID : null,
    tempGrnId: mode === 'edit' ? null : 'temp_grn_fixture',
    isSaving: false,
    isCreateMode: mode === 'create',
    resetFormState: jest.fn(),
  };
  await render(<GrnReviewStep mode={mode} />);
}

const pressNext = () => user.press(screen.getByRole('button', { name: 'Next' }));

/**
 * Press Create in the bottom bar, then confirm the "save this GRN?" question. The confirm's handler runs until the person
 * has answered the duplicate warning, so it is not awaited here.
 */
async function save() {
  await pressNext();
  await user.press(screen.getByRole('button', { name: /^(Create|Save) GRN$/ }));
}

const alerts = () => jest.mocked(showAlert).mock.calls;
/** What the success dialog says about the saved GRN's notices: the exact `notices` it was given. */
const noticesShown = (notices?: string[]) => screen.getByText(`Notices ${JSON.stringify(notices)}`);

beforeEach(() => {
  jest.clearAllMocks();
  mockRemovedImages = [];
  mockNonce = null;
  mockNumberTyped = true;
  mockOffline = false;
  mockRole = undefined;
  mockInvoiced = false;
  (unpreparedGRNPhotos as jest.Mock).mockReturnValue(null);
  (getItemsWithoutRate as jest.Mock).mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('staff and an item with no rate (owner decision D11)', () => {
  const created = { success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { failed: [], removalFailures: 0 } } };

  it('saves, then tells staff which items have no rate yet', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce(created);
    (getGrnItemRates as jest.Mock).mockResolvedValueOnce({
      rates: [
        { item_name: 'Example Potatoes', source: null },
        { item_name: 'Example Onions', source: 'item' },
        { item_name: 'Example Potatoes', source: null },
      ],
    });
    await show();

    await save();

    expect(getGrnItemRates).toHaveBeenCalledWith(GRN_ID);
    expect(noticesShown(['No rate yet for Example Potatoes. An administrator adds it before invoicing.'])).toBeOnTheScreen();
  });

  it('says nothing when every item has a rate, or when the rates cannot be read', async () => {
    (createGRN as jest.Mock).mockResolvedValue(created);
    (getGrnItemRates as jest.Mock).mockResolvedValueOnce({ rates: [{ item_name: 'Example Potatoes', source: 'item' }] });
    await show();
    await save();
    expect(noticesShown(undefined)).toBeOnTheScreen();

    (getGrnItemRates as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await show();
    await save();
    expect(noticesShown(undefined)).toBeOnTheScreen();
  });
});

describe('the server\'s refusals for the date and the number (migration 130)', () => {
  it('words a date in the future in the app\'s text and takes the person to step 1', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'x',
      refusal: { reason: 'GRN_DATE_FUTURE', fields: { date: '2026-12-01', today: '2026-10-31' }, text: 'x' },
    });
    await show();
    await save();
    expect(alerts().at(-1)).toEqual([expect.any(String), "A GRN can't be dated in the future. Today is 31/10/26.", [expect.objectContaining({ text: 'OK' })]]);
  });

  it('words a number with a space', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'x',
      refusal: { reason: 'GRN_NUMBER_SPACES', fields: { gr_no: 'A 1' }, text: 'x' },
    });
    await show();
    await save();
    expect(alerts().at(-1)?.[1]).toBe("A GRN number can't contain spaces.");
  });
});

describe('the server\'s refusals for a missing sender or supervisor (WH-231)', () => {
  it.each([
    ['SENDER_REQUIRED', 'Sender name is required'],
    ['SUPERVISOR_REQUIRED', 'Supervisor is required'],
  ])('%s: the app\'s own sentence in the save-failed alert, and OK takes the person to step 1', async (reason, sentence) => {
    (createGRN as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'English from the server',
      refusal: { reason, fields: {}, text: 'English from the server' },
    });
    await show();
    await save();
    const [, message, buttons] = alerts().at(-1)!;
    expect(message).toBe(sentence);
    expect(buttons).toEqual([expect.objectContaining({ text: 'OK' })]);
    mockDispatch.mockClear();
    await act(async () => { buttons![0].onPress?.(); });
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: 1 }));
  });

  it('another refusal is unchanged: an unknown reason is worded as before and has no OK that goes to step 1', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'x',
      refusal: { reason: 'SOMETHING_NEW', fields: {}, text: 'x' },
    });
    await show();
    await save();
    const [, message, buttons] = alerts().at(-1)!;
    expect(message).not.toBe('Sender name is required');
    expect(message).not.toBe('Supervisor is required');
    expect(buttons).toBeUndefined();
  });
});

describe('an edit refused for the last photo (migration 130)', () => {
  it('says a GRN needs at least one photo', async () => {
    (updateGRN as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'x',
      refusal: { reason: 'GRN_PHOTO_REQUIRED', fields: { gr_no: 'A0010' }, text: 'x' },
    });
    await show('edit');
    await pressNext();
    await user.press(screen.getByRole('button', { name: 'Save GRN' }));
    expect(alerts().at(-1)?.[1]).toBe('A GRN needs at least one photo. Add another before deleting this one.');
  });
});

describe('the success dialog', () => {
  it('carries the total quantity saved (created)', async () => {
    (createGRN as jest.Mock).mockResolvedValueOnce({ success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { failed: [], removalFailures: 0 } } });
    await show();
    await save();
    expect(screen.getByText('Items 1 Total quantity 10')).toBeOnTheScreen();
  });
});

describe('the section the step opens on', () => {
  // No Rates section here: the fixture's role cannot set rates.
  // The headings of the sections say which one is open (`expanded`, exactly true or false).
  const SECTIONS = { details: /^GRN details/, photos: /^GRN photos/, items: /^Items/ } as const;
  const openOnes = () =>
    (Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]).filter((section) =>
      screen.getByRole('button', { name: SECTIONS[section] }).props.accessibilityState.expanded === true);
  const closedOnes = () =>
    (Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]).filter((section) =>
      screen.getByRole('button', { name: SECTIONS[section] }).props.accessibilityState.expanded === false);
  const noPhotos = { ...mockHeader, gr_images: [] };

  it('is the GRN photos on a new GRN that has no photo yet', async () => {
    await show('create', noPhotos);
    expect(openOnes()).toEqual(['photos']);
    expect(closedOnes()).toEqual(['details', 'items']);
  });

  it('is the items once a photo is attached, and on an edit', async () => {
    await show('create');
    expect(openOnes()).toEqual(['items']);
    expect(closedOnes()).toEqual(['details', 'photos']);
    await show('edit', noPhotos);
    expect(openOnes()).toEqual(['items']);
    expect(closedOnes()).toEqual(['details', 'photos']);
  });
});

describe('staff are told on the Review step which items have no rate (migration 133)', () => {
  const created = { success: true, data: { id: GRN_ID, gr_no: 'A0010', photos: { failed: [], removalFailures: 0 } } };
  const NO_RATE = 'No rate yet for Example Potatoes. An administrator adds it before invoicing.';
  const noRateStrip = () => screen.queryByTestId('grn-review-no-rate');

  it('shows the notice before the save, and again in the success dialog after it', async () => {
    (createGRN as jest.Mock).mockResolvedValue(created);
    (getItemsWithoutRate as jest.Mock).mockImplementation(async (_customer: string, lines: Array<{ itemId: string }>) => lines.map((l) => l.itemId));
    (getGrnItemRates as jest.Mock).mockResolvedValueOnce({ rates: [{ item_name: 'Example Potatoes', source: null }] });
    await show();
    expect(await screen.findByText(NO_RATE)).toBeOnTheScreen();
    expect(noRateStrip()).toBeOnTheScreen();
    expect(getItemsWithoutRate).toHaveBeenCalledWith('c-fixture', [{ itemId: 'i1', weight: 50 }], '2026-10-01', 'monthly', null);
    await save();
    expect(noticesShown(['No rate yet for Example Potatoes. An administrator adds it before invoicing.'])).toBeOnTheScreen();
  });

  it('a save while a new check is still pending uses the notice after the save, and the old answer is not shown', async () => {
    (createGRN as jest.Mock).mockResolvedValue(created);
    (getItemsWithoutRate as jest.Mock).mockResolvedValueOnce(['i1']);
    await show();
    expect(await screen.findByText(NO_RATE)).toBeOnTheScreen();
    expect(noRateStrip()).toBeOnTheScreen();
    // The next check never answers; the items change.
    (getItemsWithoutRate as jest.Mock).mockReturnValue(new Promise(() => {}));
    (getGrnItemRates as jest.Mock).mockResolvedValueOnce({ rates: [{ item_name: 'Example Potatoes', source: null }] });
    mockForm = { ...mockForm, items: [{ ...mockItems[0], weight: 60 }] };
    await screen.rerender(<GrnReviewStep mode="create" />);
    expect(noRateStrip()).not.toBeOnTheScreen();
    await save();
    expect(noticesShown(['No rate yet for Example Potatoes. An administrator adds it before invoicing.'])).toBeOnTheScreen();
  });

  it('an invoiced GRN is not asked, shows no strip and gets no notice after the save', async () => {
    mockInvoiced = true;
    (updateGRN as jest.Mock).mockResolvedValue(created);
    (getItemsWithoutRate as jest.Mock).mockImplementation(async (_c: string, lines: Array<{ itemId: string }>) => lines.map((l) => l.itemId));
    (getGrnItemRates as jest.Mock).mockResolvedValue({ rates: [{ item_name: 'Example Potatoes', source: null }] });
    await show('edit');
    expect(getItemsWithoutRate).not.toHaveBeenCalled();
    expect(noRateStrip()).not.toBeOnTheScreen();
    await save();
    expect(getGrnItemRates).not.toHaveBeenCalled();
  });

  it.each(['admin', 'supervisor'])('never asks the server about missing rates for %s', async (role) => {
    mockRole = role;
    await show();
    expect(getItemsWithoutRate).not.toHaveBeenCalled();
  });

  it('sends each line with its weight and the GRN\'s pricing mode', async () => {
    const heavy = { ...mockItems[0], grn_trl_id: 'g2', weight: 120 };
    await show('create', { ...mockHeader, pricing_mode: 'ONE_TIME' }, [mockItems[0], heavy]);
    expect(getItemsWithoutRate).toHaveBeenCalledWith('c-fixture', [{ itemId: 'i1', weight: 50 }, { itemId: 'i1', weight: 120 }], '2026-10-01', 'one_time', null);
  });

  it('sends the GRN id when editing, and none on create', async () => {
    await show('edit');
    expect(getItemsWithoutRate).toHaveBeenLastCalledWith('c-fixture', [{ itemId: 'i1', weight: 50 }], '2026-10-01', 'monthly', GRN_ID);
    (getItemsWithoutRate as jest.Mock).mockClear();
    await show('create');
    expect(getItemsWithoutRate).toHaveBeenLastCalledWith('c-fixture', [{ itemId: 'i1', weight: 50 }], '2026-10-01', 'monthly', null);
  });

  it('shows nothing when every item has a rate', async () => {
    (getItemsWithoutRate as jest.Mock).mockResolvedValue([]);
    await show();
    expect(noRateStrip()).not.toBeOnTheScreen();
  });

  it('keeps the notice after the save when the server cannot be asked (older server)', async () => {
    (createGRN as jest.Mock).mockResolvedValue(created);
    (getGrnItemRates as jest.Mock).mockResolvedValueOnce({ rates: [{ item_name: 'Example Potatoes', source: null }] });
    await show();
    expect(noRateStrip()).not.toBeOnTheScreen();
    await save();
    expect(noticesShown(['No rate yet for Example Potatoes. An administrator adds it before invoicing.'])).toBeOnTheScreen();
  });
});

