import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GrnHeaderStep } from '@/features/grn/screens/GrnHeaderStep';

const mockForm = {
  header: { gr_no: 'A0002', date: '2026-09-30T00:00:00Z' },
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
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } }, grnForm: { items: [] } }),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'ScrollView' }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({
  CustomerSearchBottomSheet: require('react').forwardRef(() => null),
}));
jest.mock('@/features/grn/components/SupervisorBottomSheet', () => ({ SupervisorBottomSheet: () => null }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/GhostTextInput', () => ({ GhostTextInput: require('react').forwardRef(() => null) }));
jest.mock('@/services/vehicle-suggestion-service', () => ({ getTopVehicleSuggestion: jest.fn() }));

beforeEach(() => {
  mockForm.header.gr_no = 'A0002';
  mockForm.isGeneratingNumber = false;
  mockForm.handleGrNoChange.mockClear();
});

it('keeps a cleared generated number editable so the operator can enter a replacement', async () => {
  await render(<GrnHeaderStep mode="create" />);
  const numberInput = () => screen.getByPlaceholderText('GRN####');
  expect(numberInput()).toHaveDisplayValue('A0002');
  await fireEvent.changeText(numberInput(), '');
  await screen.rerender(<GrnHeaderStep mode="create" />);
  expect(numberInput()).toHaveDisplayValue('');
  expect(numberInput().props.editable).not.toBe(false);
  await fireEvent.changeText(numberInput(), 'fxf301');
  expect(mockForm.handleGrNoChange).toHaveBeenLastCalledWith('FXF301');
  await screen.rerender(<GrnHeaderStep mode="create" />);
  expect(numberInput()).toHaveDisplayValue('FXF301');
});

it('shows loading only during the actual initial number request and allows manual input after failure', async () => {
  mockForm.header.gr_no = '';
  mockForm.isGeneratingNumber = true;
  await render(<GrnHeaderStep mode="create" />);
  // hidden-but-mounted input must also count as absent
  expect(screen.queryByPlaceholderText('GRN####', { includeHiddenElements: true })).not.toBeOnTheScreen();
  mockForm.isGeneratingNumber = false;
  await screen.rerender(<GrnHeaderStep mode="create" />);
  expect(screen.getAllByPlaceholderText('GRN####')).toHaveLength(1);
  expect(screen.getByPlaceholderText('GRN####')).toHaveDisplayValue('');
});
