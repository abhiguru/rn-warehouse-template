/**
 * G-13: at a font scale of 1.5 or more a Settings row puts its value under its label so
 * it can wrap; below 1.5 the value stays in the right column on one line.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SettingsRow } from '@/features/settings/components/SettingsList';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange', language: 'en' } }),
}));

afterEach(() => {
  // Jest's default window font scale is 2.
  Dimensions.set({ window: { width: 750, height: 1334, scale: 2, fontScale: 2 } });
});

async function renderAt(fontScale: number) {
  Dimensions.set({ window: { width: 360, height: 800, scale: 3, fontScale } });
  await render(<SettingsRow label="Language on this phone" value="Phone language" onPress={() => {}} />);
}

describe('SettingsRow value at large text', () => {
  it('at 2.0 the value is stacked under the label and not cut to one line', async () => {
    await renderAt(2);
    const stacked = screen.getByTestId('settings-row-value-stacked');
    expect(stacked).toHaveTextContent('Phone language');
    expect(stacked).not.toHaveProp('numberOfLines');
    // Drawn once: no second copy in the right column.
    expect(screen.getAllByText('Phone language')).toHaveLength(1);
  });

  it('at 1.0 the value stays in the right column on one line', async () => {
    await renderAt(1);
    expect(screen.queryByTestId('settings-row-value-stacked')).not.toBeOnTheScreen();
    expect(screen.getByText('Phone language')).toHaveProp('numberOfLines', 1);
  });

  it('at 1.3 (the owner\'s size) the layout is unchanged', async () => {
    await renderAt(1.3);
    expect(screen.queryByTestId('settings-row-value-stacked')).not.toBeOnTheScreen();
  });
});
