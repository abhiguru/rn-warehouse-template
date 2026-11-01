/** KeyValueCell: a date value is written DD/MM/YY on screen and read in words ("9 Oct 2026") through `spokenValue`. */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { KeyValueCell, KeyValueGroup } from '../fiori/KeyValueCell';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

let tree: ReactTestRenderer;
afterEach(() => act(() => tree.unmount()));
const mount = (element: React.ReactElement) => { act(() => { tree = create(element); }); };
const labels = () => tree.root.findAll(n => typeof n.type === 'string' && typeof n.props.accessibilityLabel === 'string').map(n => n.props.accessibilityLabel);
const shown = () => tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat(Infinity).join(''));

it('reads spokenValue in the label and shows value', () => {
  mount(<KeyValueCell keyLabel="Last dispatch" value="09/10/26" spokenValue="9 Oct 2026" />);
  expect(labels()).toEqual(['Last dispatch, 9 Oct 2026']);
  expect(shown()).toContain('09/10/26');
});

it('reads the value itself when there is no spokenValue, and a pressable cell too', () => {
  mount(<KeyValueCell keyLabel="Mark" value="A1" />);
  expect(labels()).toEqual(['Mark, A1']);
  act(() => tree.unmount());
  mount(<KeyValueCell keyLabel="Date" value="09/10/26" spokenValue="9 Oct 2026" actionable onPress={jest.fn()} />);
  expect(labels()).toEqual(['Date, 9 Oct 2026']);
});

it('a group passes spokenValue through', () => {
  mount(<KeyValueGroup items={[{ key: 'Date', value: '09/10/26', spokenValue: '9 Oct 2026' }]} />);
  expect(labels()).toEqual(['Date, 9 Oct 2026']);
});
