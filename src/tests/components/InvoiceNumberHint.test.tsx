/**
 * New invoice, step 1: the hint under "Invoice number". When the next number
 * could not be fetched the user types one, and the hint must not then claim
 * that "The next number is filled in". Nor may it claim that under a number the
 * user typed over a suggestion. While the number is being asked for the hint
 * says so, and Next waits.
 */
import React from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import InvoiceFormStep1 from '../../../app/invoice-form/step1';

const mockLoadGRNData = jest.fn(async () => ({ success: true, itemCount: 1 }));
let mockInvNo: number | '' = '';
let mockInvNoTyped = false;
let mockNextNumberFailed = false;
let mockGettingNextNumber = false;
let mockItems: unknown[] = [];
const mockSuggestNumberIfEmpty = jest.fn(() => false);
const mockNavigateToStep = jest.fn();
const mockValidateField = jest.fn();
jest.mock('@/hooks/useInvoiceForm', () => ({
  useInvoiceForm: () => ({
    header: {
      inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no: mockInvNo, inv_no_typed: mockInvNoTyped,
      customer_id: '', customer_name: '', gr_id: '', gr_no: '',
    },
    items: mockItems,
    isLoading: false,
    isLoadingItems: false,
    nextNumberFailed: mockNextNumberFailed,
    isGettingNextNumber: mockGettingNextNumber,
    suggestNumberIfEmpty: mockSuggestNumberIfEmpty,
    validateField: mockValidateField,
    validationErrors: {},
    updateHeaderField: jest.fn(),
    updateHeaderFields: jest.fn(),
    loadGRNData: mockLoadGRNData,
    clearFieldValidationError: jest.fn(),
    navigateToStep: mockNavigateToStep,
    resetFormState: jest.fn(),
  }),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

// Every screen-focus callback the screen registers, so the test can bring the screen back into focus.
const mockFocusCallbacks: Array<() => void> = [];
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismiss: jest.fn(), replace: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    mockFocusCallbacks.push(callback);
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({ GRNAutocomplete: () => null }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));

const FILLED = 'The next number is filled in. You can change it.';
const UNAVAILABLE = "Couldn't get the next number. Type the invoice number.";
const TYPED = 'You typed this number. Clear the field to get the next number.';
const GETTING = 'Getting the next invoice number…';

beforeEach(() => {
  jest.clearAllMocks();
  mockGettingNextNumber = false;
  mockInvNoTyped = false;
  mockItems = [];
});

type Host = ReturnType<typeof screen.getByText>;
/** Every host element below one, in order (nothing else in Testing Library lists the spinners). */
const below = (node: Host): Host[] => node.children.flatMap((child) => (!child || typeof child === 'string' ? [] : [child as Host, ...below(child as Host)]));
const spinners = () => [screen.root as Host, ...below(screen.root as Host)].filter((node) => (node.type as unknown) === 'ActivityIndicator');
// The words on the screen; a check that something is NOT there uses the hidden ones too.
const words = (hidden: boolean) =>
  screen.queryAllByText(/^/, { includeHiddenElements: hidden }).map((node) => [node.props.children].flat(Infinity).join('')).join('\n');

async function hints(invNo: number | '', failed: boolean, typed = false) {
  mockInvNo = invNo;
  mockNextNumberFailed = failed;
  mockInvNoTyped = typed;
  await render(<InvoiceFormStep1 />);
  const flags = (text: string) => ({ filled: text.includes(FILLED), unavailable: text.includes(UNAVAILABLE), typed: text.includes(TYPED) });
  const shown = flags(words(false));
  const everything = flags(words(true));
  await screen.unmount();
  // What is drawn is what is mounted: no hint hides behind another.
  expect(everything).toEqual(shown);
  return shown;
}

describe('the hint under the invoice number', () => {
  it('says the number is filled in when the server gave one', async () => {
    expect(await hints(43, false)).toEqual({ filled: true, unavailable: false, typed: false });
  });

  it('asks for a number when the server gave none', async () => {
    expect(await hints('', true)).toEqual({ filled: false, unavailable: true, typed: false });
  });

  it('does not claim the number was filled in once the user has typed one', async () => {
    expect(await hints(7301, true, true)).toEqual({ filled: false, unavailable: true, typed: false });
  });

  it('claims nothing under a field the user has emptied', async () => {
    expect(await hints(0, false)).toEqual({ filled: false, unavailable: false, typed: false });
  });

  it('says the number is the user\'s own when it was typed over a suggestion', async () => {
    expect(await hints(7303, false, true)).toEqual({ filled: false, unavailable: false, typed: true });
  });
});

describe('while the next invoice number is being asked for', () => {
  async function open() {
    await render(<InvoiceFormStep1 />);
  }
  const numberField = () => screen.getByLabelText('Invoice number');
  const next = () => screen.getByRole('button', { name: /^(Next|Generating…)$/ });

  it('the hint says so, the field is empty with a spinner, and can still be typed in', async () => {
    mockInvNo = 0;
    mockNextNumberFailed = false;
    mockGettingNextNumber = true;
    await open();

    expect(words(false)).toContain(GETTING);
    expect(words(true)).not.toContain(FILLED);
    expect(words(true)).not.toContain(UNAVAILABLE);
    expect(numberField()).toHaveDisplayValue('');
    expect(numberField()).toHaveProp('placeholder', 'Generating…');
    // The user can always type a number of their own instead of waiting.
    expect(numberField()).toHaveProp('editable', true);
    // One spinner in the field and one on Next.
    expect(spinners()).toHaveLength(2);
  });

  it('Next waits: it is shown as busy and does not go on', async () => {
    mockInvNo = 0;
    mockGettingNextNumber = true;
    mockItems = [{ temp_id: 't1' }];
    await open();

    // Busy again (a spoken "busy" and a spinner), and it does not go on while the number is asked for.
    expect(next().props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(next()).toHaveAccessibleName('Generating…');
    expect(next()).toBeDisabled();
    expect(spinners()).toHaveLength(2);
    await userEvent.setup({ delay: 0 }).press(next());
    expect(mockNavigateToStep).not.toHaveBeenCalled();
  });

  it('Next works as usual once the number is there', async () => {
    mockInvNo = 55;
    mockItems = [{ temp_id: 't1' }];
    await open();

    expect(next().props.accessibilityState).toEqual({ disabled: false, busy: false });
    expect(spinners()).toHaveLength(0);
    await userEvent.setup({ delay: 0 }).press(next());
    expect(mockNavigateToStep).toHaveBeenCalledWith(2);
  });

  it('leaving the number field asks the form to suggest a number if the field is empty', async () => {
    mockInvNo = 0;
    await open();
    expect(mockSuggestNumberIfEmpty).not.toHaveBeenCalled();

    await fireEvent(numberField(), 'blur');

    expect(mockSuggestNumberIfEmpty).toHaveBeenCalledTimes(1);
  });

  it('leaving a number field that the form did not refill checks the field instead', async () => {
    mockInvNo = 7301;
    await open();

    await fireEvent(numberField(), 'blur');

    expect(mockSuggestNumberIfEmpty).toHaveBeenCalledTimes(1);
    expect(mockValidateField).toHaveBeenCalledWith('inv_no');
  });
});
