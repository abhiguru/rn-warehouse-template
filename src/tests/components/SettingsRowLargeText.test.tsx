/**
 * G-13: at a font scale of 1.5 or more a Settings row puts its value under its label so
 * it can wrap; below 1.5 the value stays in the right column on one line.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SettingsRow } from '@/features/settings/components/SettingsList';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange', language: 'en' } }),
}));

let tree: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  // Jest's default window font scale is 2.
  Dimensions.set({ window: { width: 750, height: 1334, scale: 2, fontScale: 2 } });
});

async function renderAt(fontScale: number) {
  Dimensions.set({ window: { width: 360, height: 800, scale: 3, fontScale } });
  await act(async () => {
    tree = create(<SettingsRow label="Language on this phone" value="Phone language" onPress={() => {}} />);
  });
  return tree!.root;
}

describe('SettingsRow value at large text', () => {
  it('at 2.0 the value is stacked under the label and not cut to one line', async () => {
    const root = await renderAt(2);
    const stacked = root.findAll(node => node.props.testID === 'settings-row-value-stacked');
    expect(stacked.length).toBeGreaterThan(0);
    expect(stacked[0].props.children).toBe('Phone language');
    expect(stacked[0].props.numberOfLines).toBeUndefined();
    // Drawn once: no second copy in the right column.
    expect(root.findAll(node => node.props.children === 'Phone language' && node.props.numberOfLines === 1)).toHaveLength(0);
  });

  it('at 1.0 the value stays in the right column on one line', async () => {
    const root = await renderAt(1);
    expect(root.findAll(node => node.props.testID === 'settings-row-value-stacked')).toHaveLength(0);
    const right = root.findAll(node => node.props.children === 'Phone language' && node.props.numberOfLines === 1);
    expect(right.length).toBeGreaterThan(0);
  });

  it('at 1.3 (the owner\'s size) the layout is unchanged', async () => {
    const root = await renderAt(1.3);
    expect(root.findAll(node => node.props.testID === 'settings-row-value-stacked')).toHaveLength(0);
  });
});
