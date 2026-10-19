/**
 * The busy line of a list header (FioriLinearProgress, `indeterminate`) under Reduce Motion (style guide §9,
 * code review 2026-10-18, R2-4): it does not slide, a still bar says "busy".
 */
import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { FioriLinearProgress } from '@/components/FioriLinearProgress';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const mounted: ReactTestRenderer[] = [];
afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => {
    mounted.splice(0).forEach((tree) => tree.unmount());
  });
});

async function render(reduceMotion: boolean) {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduceMotion);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<FioriLinearProgress indeterminate />);
  });
  mounted.push(tree);
  return tree;
}

/** The indicator's width and left, as the style gives them. */
function indicator(tree: ReactTestRenderer) {
  const styles = tree.root
    .findAll((node) => node.props.style !== undefined && StyleSheet.flatten(node.props.style)?.width !== undefined && StyleSheet.flatten(node.props.style)?.left !== undefined)
    .map((node) => StyleSheet.flatten(node.props.style));
  return styles[styles.length - 1];
}

const later = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

describe('FioriLinearProgress indeterminate', () => {
  it('sweeps when Reduce Motion is off: its width and position change as time passes', async () => {
    const tree = await render(false);
    const before = { ...indicator(tree) };
    await later(500);

    expect(indicator(tree).width).not.toBe(before.width);
    expect(indicator(tree).left).not.toBe(before.left);
  });

  it('is a still bar, half the track wide and centred, when Reduce Motion is on', async () => {
    const tree = await render(true);

    expect(indicator(tree).width).toBe('50%');
    expect(indicator(tree).left).toBe('25%');
    await later(500);
    expect(indicator(tree).width).toBe('50%');
    expect(indicator(tree).left).toBe('25%');
  });
});
