/**
 * WH-161 (design 10.3): a GRN not sent yet has no number, and the hero header says "Number when sent" instead of
 * leaving the title blank. With a number it shows the number.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { GRNHeroHeader } from '../GRNHeroHeader';
import { setLanguage } from '@/i18n/language';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// At the compact font scale (the jest default is 2) the number is left to the title bar, so the test sets a normal scale.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 891, scale: 2.6, fontScale: 1 }),
}));

afterEach(() => setLanguage('en'));

const hero = (grNo: string) => (
  <GRNHeroHeader gr_no={grNo} date="2026-10-09" total_qty={10} total_stock={10} total_dispatched={0} customer_name="Fictional Traders" />
);

describe('GRN hero header number', () => {
  it('shows "Number when sent" when the number is empty', async () => {
    await render(hero(''));

    expect(screen.getByText('Number when sent')).toBeOnTheScreen();
  });

  it('shows "Number when sent" when the number is only spaces', async () => {
    await render(hero('   '));

    expect(screen.getByText('Number when sent')).toBeOnTheScreen();
  });

  // An unsent GRN can reach the header with no number at all (null or undefined, not ''): it must not crash.
  it('shows "Number when sent" when the number is null', async () => {
    await render(hero(null as unknown as string));

    expect(screen.getByText('Number when sent')).toBeOnTheScreen();
  });

  it('shows "Number when sent" when the number is undefined', async () => {
    await render(hero(undefined as unknown as string));

    expect(screen.getByText('Number when sent')).toBeOnTheScreen();
  });

  it('speaks the pending number in the header label', async () => {
    await render(hero(''));

    expect(screen.getByRole('header', { name: 'GRN, Number when sent, Fictional Traders, 9 Oct 2026' })).toBeOnTheScreen();
  });

  it('shows the number, and no pending text, when there is one', async () => {
    await render(hero('A0010'));

    expect(screen.getByText('A0010')).toBeOnTheScreen();
    expect(screen.queryByText('Number when sent')).not.toBeOnTheScreen();
  });

  it('speaks the number in the header label when there is one', async () => {
    await render(hero('A0010'));

    const label = screen.getByRole('header').props.accessibilityLabel as string;
    expect(label).toContain('A0010');
    expect(label).not.toMatch(/number when sent/i);
  });

  it('shows the pending text in Gujarati', async () => {
    setLanguage('gu');
    await render(hero(''));

    expect(screen.getByText('મોકલતી વખતે નંબર')).toBeOnTheScreen();
  });
});
