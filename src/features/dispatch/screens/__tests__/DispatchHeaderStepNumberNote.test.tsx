/**
 * The number box of a new dispatch follows the facility's numbering rule (WS-8, backend migration 127): its placeholder is
 * the rule's pattern, and an empty box says what to do when the rule offered no number.
 */
import React from 'react';

import { render, screen } from '@testing-library/react-native';
import { DispatchHeaderStep } from '../DispatchHeaderStep';
import { setLanguage } from '@/i18n';
import { space } from '@/theme/tokens';
import { FIELD_BLOCK_ID } from '@/hooks/useRevealFocusedField';

const mockForm: Record<string, unknown> = {};
const reset = (over: Record<string, unknown> = {}) => {
  Object.keys(mockForm).forEach(key => delete mockForm[key]);
  Object.assign(mockForm, {
    header: { ...require('@/types/dispatch.types').createEmptyDispatchHeader(), disp_no: '', disp_date: '2026-10-28' },
    validationErrors: {},
    isGeneratingNumber: false,
    isCreateMode: true,
    invoicedNumber: null,
    numberHint: null,
    numberReason: null,
    updateHeaderField: jest.fn(),
    updateHeaderFields: jest.fn(),
    handleDispNoChange: jest.fn(),
    clearFieldValidationError: jest.fn(),
    navigateToStep: jest.fn(),
    resetFormState: jest.fn(),
    validateCurrentStep: jest.fn(),
  }, over);
};
jest.mock('@/hooks/useDispatchForm', () => ({ useDispatchForm: () => mockForm }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}), useFocusEffect: jest.fn() }));
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/CustomerSearchBottomSheet', () => ({ CustomerSearchBottomSheet: () => null }));
jest.mock('@/features/grn/components/SupervisorBottomSheet', () => ({ SupervisorBottomSheet: () => null }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/SwipeableFormStep', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/GhostTextInput', () => ({ GhostTextInput: () => null }));
jest.mock('@/services/vehicle-suggestion-service', () => ({ getTopVehicleSuggestion: jest.fn() }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const mount = () => render(<DispatchHeaderStep mode="create" />);
const box = () => screen.getByLabelText('Dispatch number');
const note = () => screen.queryByTestId('dispatch-header-number-note');

beforeEach(() => { setLanguage('en'); reset(); });

it('shows the pattern of the rule as the placeholder', async () => {
  reset({ numberHint: 'D/26-27/####' });
  await mount();
  expect(box()).toHaveProp('placeholder', 'D/26-27/####');
});

it('keeps the box\'s own placeholder where the server gave no pattern (older backend)', async () => {
  await mount();
  expect(box()).toHaveProp('placeholder', 'I####');
  expect(note()).toBeNull();
});

it('shows no pattern and says to type the number when the rule is typed by hand', async () => {
  reset({ numberReason: 'TYPE_IT' });
  await mount();
  expect(box()).toHaveProp('placeholder', '');
  expect(screen.getByText('No dispatch number is offered. Type the dispatch number.')).toBeOnTheScreen();
});

it('says to ask an administrator when the series has no number left', async () => {
  reset({ numberReason: 'SERIES_FULL', numberHint: 'I####' });
  await mount();
  expect(box()).toHaveProp('placeholder', 'I####');
  expect(
    screen.getByText('All numbers of this series are used. Type a number, or ask an administrator to change the numbering.'),
  ).toBeOnTheScreen();
});

it('says nothing once a number is in the box, while one is being fetched, or when the number is wrong', async () => {
  const withNumber = { ...require('@/types/dispatch.types').createEmptyDispatchHeader(), disp_no: '14/B/2027', disp_date: '2026-10-28' };
  reset({ numberReason: 'TYPE_IT', header: withNumber });
  const first = await mount();
  expect(note()).toBeNull();
  await first.unmount();
  reset({ numberReason: 'TYPE_IT', isGeneratingNumber: true });
  const second = await mount();
  expect(note()).toBeNull();
  await second.unmount();
  reset({ numberReason: 'TYPE_IT', validationErrors: { disp_no: 'Dispatch number is required' } });
  await mount();
  expect(note()).toBeNull();
  expect(screen.getByText('Dispatch number is required')).toBeOnTheScreen();
});

it('says it in Gujarati too', async () => {
  setLanguage('gu');
  reset({ numberReason: 'TYPE_IT' });
  await mount();
  expect(screen.getByText(/કોઈ જાવક નંબર સૂચવાયો નથી/)).toBeOnTheScreen();
});

// WH-232: the note under the number box is part of the block the wizard bar keeps above itself.
describe('the note is inside the number field\'s block', () => {
  type Node = ReturnType<typeof screen.getByText>;
  const blockOf = (start: Node) => {
    let current: Node | null = start;
    while (current) {
      if (current.props.nativeID === FIELD_BLOCK_ID) return current;
      current = current.parent;
    }
    return null;
  };

  it.each([['TYPE_IT'], ['SERIES_FULL']])('with %s: the box and its note share the nearest block, and the note follows the box closely', async (numberReason) => {
    reset({ numberReason });
    await mount();
    const noteElement = screen.getByTestId('dispatch-header-number-note');
    const noteBlock = blockOf(noteElement);
    expect(noteBlock).not.toBeNull();
    expect(blockOf(box())).toBe(noteBlock);
    expect(noteElement).toHaveStyle({ marginTop: space.xs });
  });

  it('the date field is not in that block', async () => {
    reset({ numberReason: 'TYPE_IT' });
    await mount();
    const noteBlock = blockOf(screen.getByTestId('dispatch-header-number-note'));
    expect(blockOf(screen.getByText(/^Date/))).not.toBe(noteBlock);
  });
});
