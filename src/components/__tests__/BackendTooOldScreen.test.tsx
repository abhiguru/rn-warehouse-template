import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import BackendTooOldScreen from '../BackendTooOldScreen';
import { setLanguage, t } from '@/i18n';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

afterEach(() => setLanguage('en'));

it('says the facility\'s server needs an update, in both languages, and Back leaves', async () => {
  const onClose = jest.fn();
  await render(<BackendTooOldScreen onClose={onClose} />);
  expect(screen.getByText("This facility's server needs an update")).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(t('components.backendTooOld.title', undefined, 'gu')).toBe('આ કોલ્ડ સ્ટોરેજના સર્વરને અપડેટ કરવાની જરૂર છે');
});
