/**
 * The number box of a new dispatch follows the facility's numbering rule (WS-8, backend migration 127): its placeholder is
 * the rule's pattern, and an empty box says what to do when the rule offered no number.
 */
import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { DispatchHeaderStep } from '../DispatchHeaderStep';
import { setLanguage } from '@/i18n';

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
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));


let tree: ReturnType<typeof create> | undefined;
const mount = async () => { await act(async () => { tree = create(<DispatchHeaderStep mode="create" />); }); return tree!; };
const box = () => tree!.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Dispatch number');
const note = () => tree!.root.findAll(node => node.props.testID === 'dispatch-header-number-note')[0];
const allText = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat(3).join('')).join(' | ');

beforeEach(() => { setLanguage('en'); reset(); });
afterEach(async () => { if (tree) await act(async () => { tree!.unmount(); }); tree = undefined; });

it('shows the pattern of the rule as the placeholder', async () => {
  reset({ numberHint: 'D/26-27/####' });
  await mount();
  expect(box()?.props.placeholder).toBe('D/26-27/####');
});

it('keeps the box\'s own placeholder where the server gave no pattern (older backend)', async () => {
  await mount();
  expect(box()?.props.placeholder).toBe('I####');
  expect(note()).toBeUndefined();
});

it('shows no pattern and says to type the number when the rule is typed by hand', async () => {
  reset({ numberReason: 'TYPE_IT' });
  await mount();
  expect(box()?.props.placeholder).toBe('');
  expect(allText()).toContain('No dispatch number is offered. Type the dispatch number.');
});

it('says to ask an administrator when the series has no number left', async () => {
  reset({ numberReason: 'SERIES_FULL', numberHint: 'I####' });
  await mount();
  expect(box()?.props.placeholder).toBe('I####');
  expect(allText()).toContain('All numbers of this series are used. Type a number, or ask an administrator to change the numbering.');
});

it('says nothing once a number is in the box, while one is being fetched, or when the number is wrong', async () => {
  const withNumber = { ...require('@/types/dispatch.types').createEmptyDispatchHeader(), disp_no: '14/B/2027', disp_date: '2026-10-28' };
  reset({ numberReason: 'TYPE_IT', header: withNumber });
  await mount();
  expect(note()).toBeUndefined();
  await act(async () => { tree!.unmount(); });
  reset({ numberReason: 'TYPE_IT', isGeneratingNumber: true });
  await mount();
  expect(note()).toBeUndefined();
  await act(async () => { tree!.unmount(); });
  reset({ numberReason: 'TYPE_IT', validationErrors: { disp_no: 'Dispatch number is required' } });
  await mount();
  expect(note()).toBeUndefined();
  expect(allText()).toContain('Dispatch number is required');
});

it('says it in Gujarati too', async () => {
  setLanguage('gu');
  reset({ numberReason: 'TYPE_IT' });
  await mount();
  expect(allText()).toContain('કોઈ જાવક નંબર સૂચવાયો નથી');
});
