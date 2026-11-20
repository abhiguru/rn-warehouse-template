/**
 * The busy line of a list header (FioriLinearProgress, `indeterminate`) under Reduce Motion (style guide §9,
 * code review 2026-10-18, R2-4): it does not slide, a still bar says "busy".
 */
import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { FioriLinearProgress } from '@/components/FioriLinearProgress';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

afterEach(() => {
  jest.restoreAllMocks();
});

async function renderBar(reduceMotion: boolean) {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduceMotion);
  await render(<FioriLinearProgress indeterminate />);
}

/**
 * The indicator's width and left, as the style gives them. The bar has no role or text of its own: it is the
 * progressbar's track's only child.
 */
function indicator() {
  const bar = screen.getByRole('progressbar');
  expect(bar).toBeBusy();
  const track = bar.children[0] as typeof bar;
  const style = StyleSheet.flatten((track.children[0] as typeof bar).props.style);
  return { width: style?.width, left: style?.left };
}

const later = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

describe('FioriLinearProgress indeterminate', () => {
  it('sweeps when Reduce Motion is off: its width and position change as time passes', async () => {
    await renderBar(false);
    const before = indicator();
    await later(500);

    expect(indicator().width).not.toBe(before.width);
    expect(indicator().left).not.toBe(before.left);
    // Stop the loop before the test ends: a tick after that would update a tree nobody watches.
    await screen.unmount();
  });

  it('is a still bar, half the track wide and centred, when Reduce Motion is on', async () => {
    await renderBar(true);

    expect(indicator().width).toBe('50%');
    expect(indicator().left).toBe('25%');
    await later(500);
    expect(indicator().width).toBe('50%');
    expect(indicator().left).toBe('25%');
  });
});
