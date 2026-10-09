import React from 'react';
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { GrnHeaderStep } from '@/features/grn/screens/GrnHeaderStep';

const mockForm = {
  header: { gr_no: 'A0002', date: '2026-09-30T00:00:00Z' },
  isLoading: false,
  isGeneratingNumber: false,
  isCreateMode: true,
  validationErrors: {},
  handleGrNoChange: jest.fn((value: string) => { mockForm.header.gr_no = value; }),
  updateHeaderField: jest.fn(),
  updateHeaderFields: jest.fn(),
  navigateToStep: jest.fn(),
  resetFormState: jest.fn(),
};

jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: { items: [] } }),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'ScrollView' }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({
  CustomerSearchBottomSheet: require('react').forwardRef(() => null),
}));
jest.mock('@/features/grn/components/SupervisorBottomSheet', () => ({ SupervisorBottomSheet: () => null }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: () => null }));
jest.mock('@/components/GhostTextInput', () => ({ GhostTextInput: require('react').forwardRef(() => null) }));
jest.mock('@/services/vehicle-suggestion-service', () => ({ getTopVehicleSuggestion: jest.fn() }));

beforeEach(() => {
  mockForm.header.gr_no = 'A0002';
  mockForm.isGeneratingNumber = false;
  mockForm.handleGrNoChange.mockClear();
});

it('keeps a cleared generated number editable so the operator can enter a replacement', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<GrnHeaderStep mode="create" />); });
  const numberInput = () => renderer.root.findAllByType(TextInput)
    .find(input => input.props.placeholder === 'GRN####');
  expect(numberInput()?.props.value).toBe('A0002');
  await act(async () => { numberInput()!.props.onChangeText(''); });
  await act(async () => { renderer.update(<GrnHeaderStep mode="create" />); });
  expect(numberInput()).toBeDefined();
  expect(numberInput()?.props.value).toBe('');
  expect(numberInput()?.props.editable).not.toBe(false);
  await act(async () => { numberInput()!.props.onChangeText('fxf301'); });
  expect(mockForm.handleGrNoChange).toHaveBeenLastCalledWith('FXF301');
  await act(async () => { renderer.update(<GrnHeaderStep mode="create" />); });
  expect(numberInput()?.props.value).toBe('FXF301');
  await act(async () => { renderer.unmount(); });
});

it('shows loading only during the actual initial number request and allows manual input after failure', async () => {
  mockForm.header.gr_no = '';
  mockForm.isGeneratingNumber = true;
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<GrnHeaderStep mode="create" />); });
  const numberInputs = () => renderer.root.findAllByType(TextInput)
    .filter(input => input.props.placeholder === 'GRN####');
  expect(numberInputs()).toHaveLength(0);
  mockForm.isGeneratingNumber = false;
  await act(async () => { renderer.update(<GrnHeaderStep mode="create" />); });
  expect(numberInputs()).toHaveLength(1);
  expect(numberInputs()[0].props.value).toBe('');
  await act(async () => { renderer.unmount(); });
});
