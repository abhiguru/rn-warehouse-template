/**
 * ui/Input: selectTextOnFocus is off unless asked for, and the caller's ref does not take the
 * field's own ref away (the clear button still refocuses).
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { Input } from '../ui/Input';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const field = (tree: ReturnType<typeof create>) => tree.root.findByType(TextInput);

it('selects nothing on focus by default, and the whole value when asked', async () => {
  let plain!: ReturnType<typeof create>;
  let asked!: ReturnType<typeof create>;
  await act(async () => { plain = create(<Input label="Rent" value="11.00" onChangeText={() => {}} />); });
  await act(async () => { asked = create(<Input label="Rent" value="11.00" onChangeText={() => {}} selectTextOnFocus />); });
  expect(field(plain).props.selectTextOnFocus).toBe(false);
  expect(field(asked).props.selectTextOnFocus).toBe(true);
});

it('a read-only field still selects on focus', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Input label="Rent" value="11.00" readOnly />); });
  expect(field(tree).props.selectTextOnFocus).toBe(true);
});

it('the caller gets the TextInput and the clear button focuses it', async () => {
  const callerRef = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<Input label="Rent" value="11.00" onChangeText={() => {}} ref={callerRef} />);
  });
  const given = callerRef.mock.calls.map(call => call[0]).filter(Boolean).pop();
  expect(given).toBeTruthy();
  const focus = jest.spyOn(given, 'focus').mockImplementation(() => {});
  await act(async () => { field(tree).props.onFocus({}); });
  const clear = tree.root.findAll(n => n.props.accessibilityLabel === 'Clear rent' && typeof n.props.onPress === 'function')[0];
  await act(async () => { clear.props.onPress(); });
  expect(focus).toHaveBeenCalledTimes(1);
});

it('CR-67: re-rendering does not detach and re-attach the caller\'s ref', async () => {
  const callerRef = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<Input label="Rent" value="11.00" onChangeText={() => {}} ref={callerRef} />);
  });
  expect(callerRef).toHaveBeenCalledTimes(1);
  await act(async () => {
    tree.update(<Input label="Rent" value="12.00" onChangeText={() => {}} ref={callerRef} />);
  });
  await act(async () => {
    tree.update(<Input label="Rent" value="13.00" onChangeText={() => {}} ref={callerRef} />);
  });
  // Once, with the node: never null in between.
  expect(callerRef).toHaveBeenCalledTimes(1);
  expect(callerRef.mock.calls[0][0]).toBeTruthy();
});

it('invalid draws the error outline with no message under the field; the caller hint carries the reason', () => {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<Input label="Up to (kg)" value="10" onChangeText={() => undefined} invalid accessibilityHint="Must include 12 kg" />); });
  const texts = tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat(Infinity).join(''));
  expect(texts.some(x => x.includes('Must include'))).toBe(false);
  expect(field(tree).props.accessibilityHint).toBe('Must include 12 kg');
  const outlined = tree.root.findAll(n => typeof n.type === 'string' && JSON.stringify(n.props.style ?? null).includes('"borderWidth":2'));
  expect(outlined.length).toBeGreaterThan(0);
  act(() => tree.update(<Input label="Up to (kg)" value="10" onChangeText={() => undefined} />));
  expect(tree.root.findAll(n => typeof n.type === 'string' && JSON.stringify(n.props.style ?? null).includes('"borderWidth":2'))).toHaveLength(0);
});
