/** The dispatch number box holds the 20 characters the column does (WS-8, backend migration 127), where it held 8. */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { DispatchHeaderStep } from '../DispatchHeaderStep';
import { DOCUMENT_NUMBER_MAX_LENGTH } from '@/constants/documentNumber';

jest.mock('@/hooks/useDispatchForm', () => ({
  useDispatchForm: () => ({
    header: { ...require('@/types/dispatch.types').createEmptyDispatchHeader(), disp_no: 'D/26-27/0001', disp_date: '2026-10-28' },
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
  }),
}));
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

it('lets a number of 20 characters be typed', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<DispatchHeaderStep mode="create" />); });
  const box = tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Dispatch number');
  expect(box).toBeDefined();
  expect(box!.props.maxLength).toBe(DOCUMENT_NUMBER_MAX_LENGTH);
  expect(box!.props.maxLength).toBe(20);
  await act(async () => { tree.unmount(); });
});
