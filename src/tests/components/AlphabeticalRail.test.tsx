/** G-50: the A–Z rail scrubs: a finger drawn down it calls the letters it passes over, once each. */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AlphabeticalRail, letterAtOffset } from '@/features/customer/AlphabeticalRail';
import { railLetters } from '@/features/customer/railKey';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, Stack: { Screen: () => null }, useIsFocused: () => true }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/customer-service', () => ({ customerService: {} }));
const mockSelection = jest.fn();
jest.mock('@/hooks/useHaptics', () => ({ useHaptics: () => ({ selection: mockSelection }) }));

// A recorder in place of the gesture: the handlers the rail registers are kept here.
const mockHandlers: { onUpdate?: (event: { y: number }) => void; onFinalize?: () => void } = {};
jest.mock('react-native-gesture-handler', () => {
  const chain: Record<string, unknown> = {};
  chain.runOnJS = () => chain;
  chain.onUpdate = (fn: (event: { y: number }) => void) => { mockHandlers.onUpdate = fn; return chain; };
  chain.onFinalize = (fn: () => void) => { mockHandlers.onFinalize = fn; return chain; };
  return {
    Swipeable: ({ children }: { children: React.ReactNode }) => children,
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

const LETTER_HEIGHT = 27;
const available = new Set(['A', 'G', 'H', 'Z', '#']);
const letters = railLetters(available);

let tree: ReactTestRenderer | undefined;
const onLetterPress = jest.fn();
const mount = async () => {
  await act(async () => {
    tree = create(<AlphabeticalRail letters={letters} availableLetters={available} activeLetter={null} onLetterPress={onLetterPress} />);
  });
  const rail = (tree as ReactTestRenderer).root.find(node => typeof node.props.onLayout === 'function');
  await act(async () => { rail.props.onLayout({ nativeEvent: { layout: { height: LETTER_HEIGHT * letters.length } } }); });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockHandlers.onUpdate = undefined;
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

it('maps a finger position to the letter under it, and holds at the ends', () => {
  expect(letterAtOffset(5, LETTER_HEIGHT * 26, letters.slice(0, 26))).toBe('A');
  expect(letterAtOffset(LETTER_HEIGHT * 6 + 4, LETTER_HEIGHT * 26, letters.slice(0, 26))).toBe('G');
  expect(letterAtOffset(-30, LETTER_HEIGHT * 26, letters.slice(0, 26))).toBe('A');
  expect(letterAtOffset(9999, LETTER_HEIGHT * 26, letters.slice(0, 26))).toBe('Z');
  expect(letterAtOffset(10, 0, letters)).toBeUndefined();
});

it('calls A and then G as the finger moves down, and never the same letter twice in a row', async () => {
  await mount();
  const pan = mockHandlers.onUpdate as (event: { y: number }) => void;
  expect(pan).toBeDefined();
  // Rail built for A–Z plus '#': the letter height is the rail height over 27 entries.
  act(() => { pan({ y: 5 }); });
  act(() => { pan({ y: 9 }); });
  act(() => { pan({ y: LETTER_HEIGHT * 6 + 3 }); });
  act(() => { pan({ y: LETTER_HEIGHT * 6 + 20 }); });
  expect(onLetterPress.mock.calls.map(call => call[0])).toEqual(['A', 'G']);
  expect(mockSelection).toHaveBeenCalledTimes(2);
});

it('passes over letters without customers silently', async () => {
  await mount();
  const pan = mockHandlers.onUpdate as (event: { y: number }) => void;
  act(() => { pan({ y: LETTER_HEIGHT * 1 + 3 }); }); // B has none
  expect(onLetterPress).not.toHaveBeenCalled();
});

it('can reach the same letter again after the finger is lifted', async () => {
  await mount();
  const pan = mockHandlers.onUpdate as (event: { y: number }) => void;
  act(() => { pan({ y: 3 }); });
  act(() => { mockHandlers.onFinalize?.(); });
  act(() => { pan({ y: 3 }); });
  expect(onLetterPress.mock.calls.map(call => call[0])).toEqual(['A', 'A']);
});

it('keeps taps working, and makes letters without customers inactive but visible', async () => {
  await mount();
  const button = (label: string) =>
    (tree as ReactTestRenderer).root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label)[0];
  await act(async () => { button('Jump to H').props.onPress(); });
  expect(onLetterPress).toHaveBeenCalledWith('H');
  onLetterPress.mockClear();
  await act(async () => { button('Jump to B').props.onPress(); });
  expect(onLetterPress).not.toHaveBeenCalled();
  expect(button('Jump to B').props.accessibilityState).toEqual({ disabled: true, selected: false });
});
