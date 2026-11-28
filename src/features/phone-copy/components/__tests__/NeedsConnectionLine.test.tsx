/**
 * WH-348: the one "Needs a connection" line and its two opt-in insets. `inset` gives the screen's side margin (a list's
 * footnote); `insetTo="button"` starts the line at a left-aligned Button's text and wins over `inset`. With neither, the line
 * is as it was. Real component, real theme; only the icon font is faked.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { NeedsConnectionLine } from '../NeedsConnectionLine';
import { layout, space } from '@/theme/tokens';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ theme: { preference: 'light', brand: 'orange' } }),
}));

const line = () => StyleSheet.flatten(screen.getByTestId('line').props.style) as { paddingHorizontal?: number; paddingLeft?: number };

describe('NeedsConnectionLine insets', () => {
  it('with no inset, the line has no side padding', async () => {
    await render(<NeedsConnectionLine testID="line" text="Needs a connection" />);
    expect(screen.getByTestId('line')).toHaveTextContent('Needs a connection');
    expect(line().paddingHorizontal).toBeUndefined();
    expect(line().paddingLeft).toBeUndefined();
  });

  it('inset gives the screen\'s side margin on both sides', async () => {
    await render(<NeedsConnectionLine inset testID="line" text="Needs a connection" />);
    expect(line().paddingHorizontal).toBe(layout.marginCompact);
    expect(line().paddingLeft).toBeUndefined();
  });

  it('insetTo="button" pads the left by a button\'s own side padding only', async () => {
    await render(<NeedsConnectionLine insetTo="button" testID="line" text="Needs a connection" />);
    expect(line().paddingLeft).toBe(space.lg);
    expect(line().paddingHorizontal).toBeUndefined();
  });

  it('align="center" centres the row and its text; with no align, neither is centred', async () => {
    await render(<NeedsConnectionLine align="center" testID="line" text="Needs a connection" />);
    expect(StyleSheet.flatten(screen.getByTestId('line').props.style)).toMatchObject({ justifyContent: 'center' });
    expect(StyleSheet.flatten(screen.getByText('Needs a connection').props.style)).toMatchObject({ textAlign: 'center' });
    await screen.rerender(<NeedsConnectionLine testID="line" text="Needs a connection" />);
    expect(StyleSheet.flatten(screen.getByTestId('line').props.style).justifyContent).toBeUndefined();
    expect(StyleSheet.flatten(screen.getByText('Needs a connection').props.style).textAlign).toBeUndefined();
  });

  it('align="center" keeps an inset', async () => {
    await render(<NeedsConnectionLine align="center" inset testID="line" text="Needs a connection" />);
    expect(line().paddingHorizontal).toBe(layout.marginCompact);
  });

  it('insetTo wins over inset', async () => {
    await render(<NeedsConnectionLine inset insetTo="button" testID="line" text="Needs a connection" />);
    expect(line().paddingLeft).toBe(space.lg);
    expect(line().paddingHorizontal).toBeUndefined();
  });
});
