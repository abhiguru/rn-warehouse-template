/**
 * WH-260: the X of an Edit GRN, step 1, with the real step header and a real form store. Nothing changed since the GRN
 * was loaded: the X closes with no question. A real change (one character in the vehicle number): the X asks
 * "Discard changes to this GRN?" as before.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import { GrnHeaderStep } from '@/features/grn/screens/GrnHeaderStep';
import grnFormReducer, { loadGRNData, resetForm, updateHeader } from '@/store/slices/grnFormSlice';
import { showAlert } from '@/utils/alert';
import { setLanguage } from '@/i18n';

const makeStore = () => configureStore({ reducer: { grnForm: grnFormReducer }, middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }) });
let mockStore = makeStore();
const mockCancel = jest.fn();

jest.mock('@/hooks', () => ({
  useGRNForm: () => ({
    header: mockStore.getState().grnForm.header,
    isGeneratingNumber: false,
    isCreateMode: false,
    validationErrors: {},
    numberHint: null,
    numberReason: null,
    handleGrNoChange: jest.fn(),
    updateHeaderField: jest.fn(),
    updateHeaderFields: jest.fn(),
    navigateToStep: jest.fn(),
    resetFormState: mockCancel,
  }),
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } }, grnForm: mockStore.getState().grnForm }),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({}), useRouter: () => ({ replace: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useFirstStepBack', () => ({ useFirstStepBack: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'ScrollView' }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({ CustomerSearchBottomSheet: require('react').forwardRef(() => null) }));
jest.mock('@/features/grn/components/SupervisorBottomSheet', () => ({ SupervisorBottomSheet: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/GhostTextInput', () => ({ GhostTextInput: require('react').forwardRef(() => null) }));
jest.mock('@/services/vehicle-suggestion-service', () => ({ getTopVehicleSuggestion: jest.fn() }));

const mount = async () => { await render(<GrnHeaderStep mode="edit" />); };
const close = () => screen.getByRole('button', { name: 'Close GRN edit' });

beforeEach(() => {
  setLanguage('en');
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockStore = makeStore();
  const header = grnFormReducer(undefined, resetForm()).header;
  mockStore.dispatch(loadGRNData({ grnId: 'g1', header: { ...header, gr_no: 'A0010', registration: 'GJ01XX0000' }, items: [] }));
});
afterEach(() => {
  jest.restoreAllMocks();
});

it('closes with no question when nothing was changed', async () => {
  await mount();

  await userEvent.press(close());

  expect(showAlert).not.toHaveBeenCalled();
});

it('asks "Discard changes to this GRN?" once a character of the vehicle number was changed', async () => {
  mockStore.dispatch(updateHeader({ registration: 'GJ01XX0001' }));
  await mount();

  await userEvent.press(close());

  expect(showAlert).toHaveBeenCalledTimes(1);
  expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('Discard changes to this GRN?');
});
