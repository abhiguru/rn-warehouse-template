/**
 * New invoice, step 1: the hint under "Invoice number". When the next number
 * could not be fetched the user types one, and the hint must not then claim
 * that "The next number is filled in". Nor may it claim that under a number the
 * user typed over a suggestion. While the number is being asked for the hint
 * says so, and Next waits.
 */
import React from 'react';
import { ActivityIndicator, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import InvoiceFormStep1 from '../../../app/invoice-form/step1';

const mockLoadGRNData = jest.fn(async () => ({ success: true, itemCount: 1 }));
let mockInvNo: number | '' = '';
let mockInvNoTyped = false;
let mockNextNumberFailed = false;
let mockGettingNextNumber = false;
let mockItems: unknown[] = [];
const mockSuggestNumberIfEmpty = jest.fn(() => false);
const mockNavigateToStep = jest.fn();
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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

async function hints(invNo: number | '', failed: boolean, typed = false) {
  mockInvNo = invNo;
  mockNextNumberFailed = failed;
  mockInvNoTyped = typed;
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<InvoiceFormStep1 />);
  });
  const text = JSON.stringify(tree.toJSON());
  await act(async () => { tree.unmount(); });
  return { filled: text.includes(FILLED), unavailable: text.includes(UNAVAILABLE), typed: text.includes(TYPED) };
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
  async function render() {
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<InvoiceFormStep1 />); });
    return tree;
  }
  const numberField = (tree: ReactTestRenderer) =>
    tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'Invoice number')!;
  const next = (tree: ReactTestRenderer) =>
    tree.root.find((node) => typeof node.type !== 'string' && node.props.accessibilityLabel === 'Next: items' && 'onPress' in node.props);

  it('the hint says so, the field is empty with a spinner, and can still be typed in', async () => {
    mockInvNo = 0;
    mockNextNumberFailed = false;
    mockGettingNextNumber = true;
    const tree = await render();
    const text = JSON.stringify(tree.toJSON());

    expect(text).toContain(GETTING);
    expect(text).not.toContain(FILLED);
    expect(text).not.toContain(UNAVAILABLE);
    expect(numberField(tree).props.value).toBe('');
    expect(numberField(tree).props.placeholder).toBe('Generating…');
    // The user can always type a number of their own instead of waiting.
    expect(numberField(tree).props.editable).toBe(true);
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    await act(async () => { tree.unmount(); });
  });

  it('Next waits: it is shown as busy and does not go on', async () => {
    mockInvNo = 0;
    mockGettingNextNumber = true;
    mockItems = [{ temp_id: 't1' }];
    const tree = await render();

    expect(next(tree).props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(next(tree).props.disabled).toBe(true);
    await act(async () => { tree.unmount(); });
  });

  it('Next works as usual once the number is there', async () => {
    mockInvNo = 55;
    mockItems = [{ temp_id: 't1' }];
    const tree = await render();

    expect(next(tree).props.accessibilityState).toEqual({ disabled: false, busy: false });
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    await act(async () => { await next(tree).props.onPress(); });
    expect(mockNavigateToStep).toHaveBeenCalledWith(2);
    await act(async () => { tree.unmount(); });
  });

  it('leaving the number field asks the form to suggest a number if the field is empty', async () => {
    mockInvNo = 0;
    const tree = await render();
    expect(mockSuggestNumberIfEmpty).not.toHaveBeenCalled();

    await act(async () => { numberField(tree).props.onBlur(); });

    expect(mockSuggestNumberIfEmpty).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });
});
