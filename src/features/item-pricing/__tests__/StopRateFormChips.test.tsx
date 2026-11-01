/** "Stop this rate": the last-day chips show DD/MM/YY and are read aloud as dates in words. */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StopRateForm } from '../components/StopRateForm';
import { textsOf } from '@/tests/helpers/rateEditorFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));

let tree: ReactTestRenderer;
afterEach(() => act(() => tree.unmount()));

it('reads Today and the end-of-period chips as dates in words', () => {
  act(() => {
    tree = create(
      <StopRateForm body="Body" today="2026-10-14" choice="today" day="2026-10-14" onChange={jest.fn()} busy={false} onStop={jest.fn()} onCancel={jest.fn()} />,
    );
  });
  const spoken = tree.root
    .findAll(n => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function')
    .map(n => n.props.accessibilityLabel as string);
  expect(spoken[0]).toContain('14 Oct 2026');
  expect(spoken).toEqual(expect.arrayContaining(['31 Oct 2026', '31 Mar 2027']));
  expect(spoken.join('|')).not.toMatch(/\d\d\/\d\d\/\d\d/);
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['31/10/26', '31/03/27']));
});
