/**
 * showToast with ToastHost (G-06): the shared success snackbar of style guide
 * §13.9, shown for 4 seconds, read out to screen readers, replaced by a newer
 * one, drawn in the inverse colours of every brand and mode.
 */
import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
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

let tree: ReactTestRenderer | null = null;
let announce: jest.SpyInstance;

function mount() {
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ToastHost />
      </SafeAreaProvider>
    );
  });
  return tree!;
}

function texts() {
  return tree!.root
    .findAll(n => (n.type as unknown) === 'Text')
    .map(n => ([] as unknown[]).concat(n.props.children).join(''));
}

const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

beforeEach(() => {
  jest.useFakeTimers();
  mockTheme = { preference: 'light', brand: 'orange' };
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});

afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  announce.mockRestore();
  jest.useRealTimers();
});

describe('showToast with ToastHost', () => {
  it('shows nothing until a toast is asked for', () => {
    mount();
    expect(texts()).toEqual([]);
    expect(tree!.root.findAll(n => n.props.pointerEvents === 'box-none')).toEqual([]);
  });

  it('shows the message, reads it out, and keeps it for 4 seconds', () => {
    mount();
    act(() => showToast('Garlic saved.'));

    expect(texts()).toEqual(['Garlic saved.']);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Garlic saved.');

    advance(3999);
    expect(texts()).toEqual(['Garlic saved.']);

    advance(1 + motion.standard);
    expect(texts()).toEqual([]);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('replaces the toast shown with a newer one, which gets its own 4 seconds', () => {
    mount();
    act(() => showToast('A.'));
    advance(3000);
    act(() => showToast('B.'));

    expect(texts()).toEqual(['B.']);
    expect(announce).toHaveBeenLastCalledWith('B.');
    expect(announce).toHaveBeenCalledTimes(2);

    // A's time would have run out here; B stays.
    advance(1500);
    expect(texts()).toEqual(['B.']);

    advance(2500 + motion.standard);
    expect(texts()).toEqual([]);
  });

  it('takes a shorter duration when asked', () => {
    mount();
    act(() => showToast('Name saved.', { durationMs: 2000 }));
    advance(1999);
    expect(texts()).toEqual(['Name saved.']);
    advance(1 + motion.standard);
    expect(texts()).toEqual([]);
  });

  it('sits above the bottom inset, lets touches beside it through, and is read once, by the announcement alone', () => {
    mount();
    act(() => showToast('Customer saved.'));

    const wrapper = tree!.root.find(n => n.props.pointerEvents === 'box-none');
    expect(StyleSheet.flatten(wrapper.props.style).bottom).toBe(BOTTOM_INSET + space.xl);
    // CR-30: a live region on top of the announcement would make TalkBack read it twice.
    expect(tree!.root.findAll(n => n.props.accessibilityLiveRegion !== undefined)).toHaveLength(0);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no host is mounted', () => {
    expect(() => showToast('Nobody is listening.')).not.toThrow();
    expect(announce).not.toHaveBeenCalled();
  });

  describe.each(BRANDS.flatMap(b => (['light', 'dark'] as Mode[]).map(m => [b, m] as const)))('%s %s', (brand, mode) => {
    it('draws the inverse surface and text', () => {
      mockTheme = { preference: mode, brand };
      const t = getTokens(brand, mode);
      mount();
      act(() => showToast('Item saved.'));

      const surfaces = tree!.root.findAll(n => {
        const style = StyleSheet.flatten(n.props.style ?? {}) as { backgroundColor?: string };
        return typeof n.type !== 'string' ? false : style.backgroundColor === t.surface.inverse;
      });
      expect(surfaces.length).toBeGreaterThan(0);
      const text = tree!.root.find(n => (n.type as unknown) === 'Text');
      expect(StyleSheet.flatten(text.props.style).color).toBe(t.text.inverse);
    });
  });
});
