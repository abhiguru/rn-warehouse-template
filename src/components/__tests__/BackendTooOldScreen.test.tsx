import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import BackendTooOldScreen from '../BackendTooOldScreen';
import { setLanguage, t } from '@/i18n';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

afterEach(() => setLanguage('en'));

it('says the facility\'s server needs an update, in both languages, and Back leaves', () => {
  const onClose = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<BackendTooOldScreen onClose={onClose} />); });
  const texts = () => tree.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));
  expect(texts()).toContain("This facility's server needs an update");
  act(() => { tree.root.find(n => n.props.accessibilityLabel === 'Back' && typeof n.props.onPress === 'function').props.onPress(); });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(t('components.backendTooOld.title', undefined, 'gu')).toBe('આ કોલ્ડ સ્ટોરેજના સર્વરને અપડેટ કરવાની જરૂર છે');
});
