/**
 * WH-228: Dispatch step 1. Dispatch number (box and error), Vehicle registration (box and error) and Notes (field
 * and count) each sit in a view marked FIELD_BLOCK_ID that holds the group's message.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { DispatchHeaderStep } from '../DispatchHeaderStep';
import { t as tr } from '@/i18n';
import { blockOf, inputsIn, wordsIn } from '@/tests/helpers/fieldBlock';

const mockForm: Record<string, unknown> = {};
const reset = (over: Record<string, unknown> = {}) => {
  Object.keys(mockForm).forEach((key) => delete mockForm[key]);
  Object.assign(mockForm, {
    header: { ...require('@/types/dispatch.types').createEmptyDispatchHeader(), disp_no: 'D/26-27/0001', disp_date: '2026-10-28', note: 'abc' },
    validationErrors: {},
    isGeneratingNumber: false,
    isCreateMode: true,
    invoicedNumber: null,
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
// The vehicle box as a plain text input, so the focused input and its ancestors can be read.
jest.mock('@/components/GhostTextInput', () => ({
  GhostTextInput: (props: { accessibilityLabel: string; value: string }) =>
    require('react').createElement(require('react-native').TextInput, { accessibilityLabel: props.accessibilityLabel, value: props.value }),
}));
jest.mock('@/services/vehicle-suggestion-service', () => ({ getTopVehicleSuggestion: jest.fn() }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

let tree: ReturnType<typeof create>;
const mount = async () => { await act(async () => { tree = create(<DispatchHeaderStep mode="create" />); }); };
const input = (label: string) => tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === label)!;
beforeEach(() => reset());
afterEach(async () => { await act(async () => { tree.unmount(); }); });

describe('Dispatch step 1 field blocks', () => {
  it('Dispatch number: the block holds the box and its error, and no other field', async () => {
    reset({ validationErrors: { disp_no: 'Dispatch number is required' } });
    await mount();
    const block = blockOf(input('Dispatch number'));
    expect(block).not.toBeNull();
    expect(inputsIn(block!)).toBe(1);
    expect(wordsIn(block!)).toContain('Dispatch number is required');
  });

  it('Vehicle registration: the block holds the box and its error, and no other field', async () => {
    reset({ validationErrors: { registration: 'Vehicle registration is required' } });
    await mount();
    const block = blockOf(input(tr('dispatch.form.vehicleRegistration')));
    expect(block).not.toBeNull();
    expect(inputsIn(block!)).toBe(1);
    expect(wordsIn(block!)).toContain('Vehicle registration is required');
  });

  it('Notes: the block holds the field and its count', async () => {
    await mount();
    const toggle = tree.root.find((node) => node.props.accessibilityLabel === tr('dispatch.form.showOptional') && typeof node.props.onPress === 'function');
    await act(async () => { toggle.props.onPress(); });
    const block = blockOf(input(tr('common.notes')));
    expect(block).not.toBeNull();
    expect(inputsIn(block!)).toBe(1);
    expect(wordsIn(block!).join(' ')).toMatch(/3\/\d+/);
  });
});
