/**
 * showToast with ToastHost (G-06): the shared success snackbar of style guide
 * §13.9, shown for 4 seconds, read out to screen readers, replaced by a newer
 * one, drawn in the inverse colours of every brand and mode.
 */
import React from 'react';
import { AccessibilityInfo, Keyboard, StyleSheet } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastHost } from '../ToastHost';
import { showToast } from '@/utils/toast';
import { BRANDS, getTokens, motion, space, type Mode } from '@/theme/tokens';

let mockTheme = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ theme: mockTheme }),
}));

const BOTTOM_INSET = 24;
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: BOTTOM_INSET },
};


let announce: jest.SpyInstance;

const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ToastHost />
    </SafeAreaProvider>
  );

type Json = ReturnType<typeof screen.toJSON>;
type JsonNode = Exclude<NonNullable<Json>, unknown[]>;

/** Every element of the rendered tree (the wrapper's touch rule and position are not queryable any other way). */
function elements(): JsonNode[] {
  const out: JsonNode[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach(walk);
    out.push(node as JsonNode);
    ((node as JsonNode).children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return out;
}
const wrappers = () => elements().filter(n => n.props.pointerEvents === 'box-none');
const bottom = () => StyleSheet.flatten(wrappers()[0].props.style).bottom;

/** The text of every Text on screen, in order. */
const texts = () => screen.queryAllByText(/./, { includeHiddenElements: true }).map(n => ([] as unknown[]).concat(n.props.children).join(''));

const advance = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });
const newUser = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });

beforeEach(() => {
  jest.useFakeTimers();
  mockTheme = { preference: 'light', brand: 'orange' };
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});

afterEach(() => {
  announce.mockRestore();
  jest.useRealTimers();
});

describe('showToast with ToastHost', () => {
  it('shows nothing until a toast is asked for', async () => {
    await mount();
    expect(texts()).toEqual([]);
    expect(wrappers()).toEqual([]);
  });

  it('shows the message, reads it out, and keeps it for 4 seconds', async () => {
    await mount();
    await act(() => showToast('Garlic saved.'));

    expect(texts()).toEqual(['Garlic saved.']);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Garlic saved.');

    await advance(3999);
    expect(texts()).toEqual(['Garlic saved.']);

    await advance(1 + motion.standard);
    expect(texts()).toEqual([]);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('replaces the toast shown with a newer one, which gets its own 4 seconds', async () => {
    await mount();
    await act(() => showToast('A.'));
    await advance(3000);
    await act(() => showToast('B.'));

    expect(texts()).toEqual(['B.']);
    expect(announce).toHaveBeenLastCalledWith('B.');
    expect(announce).toHaveBeenCalledTimes(2);

    // A's time would have run out here; B stays.
    await advance(1500);
    expect(texts()).toEqual(['B.']);

    await advance(2500 + motion.standard);
    expect(texts()).toEqual([]);
  });

  it('takes a shorter duration when asked', async () => {
    await mount();
    await act(() => showToast('Name saved.', { durationMs: 2000 }));
    await advance(1999);
    expect(texts()).toEqual(['Name saved.']);
    await advance(1 + motion.standard);
    expect(texts()).toEqual([]);
  });

  it('sits above the bottom inset, lets touches beside it through, and is read once, by the announcement alone', async () => {
    await mount();
    await act(() => showToast('Customer saved.'));

    expect(wrappers()).toHaveLength(1);
    expect(bottom()).toBe(BOTTOM_INSET + space.xl);
    // CR-30: a live region on top of the announcement would make TalkBack read it twice.
    expect(elements().filter(n => n.props.accessibilityLiveRegion !== undefined)).toHaveLength(0);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('rises above the keyboard while it is up, and comes back down when it hides', async () => {
    const handlers: Record<string, (e?: unknown) => void> = {};
    const listen = jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: (e?: unknown) => void) => {
      handlers[name] = fn;
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    await mount();
    await act(() => showToast('Must include 12 kg', { durationMs: 2000 }));
    await act(() => handlers.keyboardDidShow({ endCoordinates: { height: 300 } }));
    expect(bottom()).toBe(300 + space.xl);
    await act(() => handlers.keyboardDidHide());
    expect(bottom()).toBe(BOTTOM_INSET + space.xl);
    listen.mockRestore();
  });

  it('does nothing when no host is mounted', () => {
    expect(() => showToast('Nobody is listening.')).not.toThrow();
    expect(announce).not.toHaveBeenCalled();
  });

  describe.each(BRANDS.flatMap(b => (['light', 'dark'] as Mode[]).map(m => [b, m] as const)))('%s %s', (brand, mode) => {
    it('draws the inverse surface and text', async () => {
      mockTheme = { preference: mode, brand };
      const t = getTokens(brand, mode);
      await mount();
      await act(() => showToast('Item saved.'));

      const surfaces = elements().filter(n => (StyleSheet.flatten(n.props.style ?? {}) as { backgroundColor?: string }).backgroundColor === t.surface.inverse);
      expect(surfaces.length).toBeGreaterThan(0);
      expect(screen.getByText('Item saved.')).toHaveStyle({ color: t.text.inverse });
    });
  });
});

describe('a toast with an action (WH-220)', () => {
  it('shows one button with the label; tapping it runs the action once and closes the toast', async () => {
    const user = newUser();
    await mount();
    const onPress = jest.fn();
    await act(() => showToast("Couldn't load.", { action: { label: 'Retry', onPress } }));
    expect(texts()).toEqual(["Couldn't load.", 'Retry']);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Retry' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await advance(motion.standard + 1);
    expect(texts()).toEqual([]);
    await advance(5000);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a toast without an action has no button', async () => {
    await mount();
    await act(() => showToast('Garlic saved.'));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
