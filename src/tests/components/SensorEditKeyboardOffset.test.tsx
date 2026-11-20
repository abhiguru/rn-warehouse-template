/** WH-218 review fix: the sensor edit screen has a native header, so on iOS its keyboard view lifts by the header height. */
import React from 'react';
import { Platform } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import SensorEditScreen from '../../../app/sensor-edit/[id]';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 's7' }),
}));
jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 91 }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/features/sensors/useSensorQueries', () => ({
  useSensorDevice: () => ({
    data: {
      device: {
        id: 's7', device_name: 'Ripening room probe', mac_address: '', location: 'Chamber 7', active: true,
        staleness_threshold_minutes: 30, min_temperature: 2, max_temperature: 8,
      },
    },
    loading: false,
    error: null,
    retry: jest.fn(),
  }),
}));
jest.mock('@/features/sensors/sensorQueries', () => ({ invalidateSensorQueries: jest.fn() }));
jest.mock('@/services/sensor-service', () => ({ updateDevice: jest.fn() }));
// The real component drops keyboardVerticalOffset before the native view; this stand-in shows it to the test.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: (props: object) => <View testID="keyboard-avoiding" {...props} /> };
});

const originalOS = Platform.OS;
const setOS = (os: 'ios' | 'android') => { Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os }); };
afterEach(() => setOS(originalOS as 'ios' | 'android'));

async function offsetOn(os: 'ios' | 'android') {
  setOS(os);
  await render(<SensorEditScreen />);
  return screen.getByTestId('keyboard-avoiding').props.keyboardVerticalOffset;
}

it('lifts the form by the header height on iOS', async () => {
  expect(await offsetOn('ios')).toBe(91);
});

it('adds no offset on Android', async () => {
  expect(await offsetOn('android')).toBe(0);
});
