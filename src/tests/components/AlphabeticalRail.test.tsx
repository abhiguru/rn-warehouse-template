/** G-50: the A–Z rail scrubs: a finger drawn down it calls the letters it passes over, once each. */
import React from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
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
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-gesture-handler', () => {
  const chain: Record<string, unknown> = {};
  chain.runOnJS = () => chain;
  chain.onUpdate = (fn: (event: { y: number }) => void) => { mockHandlers.onUpdate = fn; return chain; };
  chain.onFinalize = (fn: () => void) => { mockHandlers.onFinalize = fn; return chain; };
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

const LETTER_HEIGHT = 27;
const available = new Set(['A', 'G', 'H', 'Z', '#']);
const letters = railLetters(available);

const onLetterPress = jest.fn();
const mount = async () => {
  await render(<AlphabeticalRail letters={letters} availableLetters={available} activeLetter={null} onLetterPress={onLetterPress} />);
  // The rail's own box has no role or label; it is the parent of its letter buttons (the one place a parent is used).
  const rail = screen.getByRole('button', { name: 'Jump to A' }).parent!;
  await fireEvent(rail, 'layout', { nativeEvent: { layout: { height: LETTER_HEIGHT * letters.length } } });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockHandlers.onUpdate = undefined;
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
  pan({ y: 5 });
  pan({ y: 9 });
  pan({ y: LETTER_HEIGHT * 6 + 3 });
  pan({ y: LETTER_HEIGHT * 6 + 20 });
  expect(onLetterPress.mock.calls.map(call => call[0])).toEqual(['A', 'G']);
  expect(mockSelection).toHaveBeenCalledTimes(2);
});

it('passes over letters without customers silently', async () => {
  await mount();
  const pan = mockHandlers.onUpdate as (event: { y: number }) => void;
  pan({ y: LETTER_HEIGHT * 1 + 3 }); // B has none
  expect(onLetterPress).not.toHaveBeenCalled();
});

it('can reach the same letter again after the finger is lifted', async () => {
  await mount();
  const pan = mockHandlers.onUpdate as (event: { y: number }) => void;
  pan({ y: 3 });
  mockHandlers.onFinalize?.();
  pan({ y: 3 });
  expect(onLetterPress.mock.calls.map(call => call[0])).toEqual(['A', 'A']);
});

it('keeps taps working, and makes letters without customers inactive but visible', async () => {
  await mount();
  const user = userEvent.setup({ delay: 0 });
  await user.press(screen.getByRole('button', { name: 'Jump to H' }));
  expect(onLetterPress).toHaveBeenCalledWith('H');
  onLetterPress.mockClear();
  await user.press(screen.getByRole('button', { name: 'Jump to B' }));
  expect(onLetterPress).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Jump to B' }).props.accessibilityState).toEqual({ disabled: true, selected: false });
});
