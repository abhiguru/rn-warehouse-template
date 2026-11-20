/**
 * The parts every report shares instead of a copy each: the no-customer state,
 * the date heading over a day's rows, in all four themes, and the header's
 * "Share PDF" and the empty state's "Show last 420 days".
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { setLanguage } from '@/i18n';
import { BRANDS, fontWeight, getTokens, type Mode } from '@/theme/tokens';
import { PERIOD_KEY } from '@/features/filters/configs/reports/shared';
import { exportHeaderActions, longestPeriodAction } from '@/features/reports/reportActions';
import { ReportDateHeading } from '../ReportDateHeading';
import { ReportNoCustomer } from '../ReportNoCustomer';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }), router: { back: jest.fn() } }));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

afterEach(() => {
  setLanguage('en');
});

async function renderThemed(element: React.ReactElement, brand: string, mode: Mode) {
  mockState = { theme: { preference: mode, brand } };
  await render(element);
}

/** Every host element of the rendered tree: nothing else finds a style-only container or the mocked icon. */
type JsonElement = NonNullable<ReturnType<typeof screen.toJSON>>;
function hostNodes(): JsonElement[] {
  const found: JsonElement[] = [];
  const walk = (node: JsonElement | JsonElement[] | string | null) => {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    found.push(node);
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return found;
}

describe.each(THEMES)('shared report parts in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('the no-customer state: the report title over one wording, on the theme background', async () => {
    await renderThemed(<ReportNoCustomer title="GRN activity" />, brand, mode);
    expect(screen.getByText('GRN activity')).toBeOnTheScreen();
    expect(screen.getByText('No customer linked')).toBeOnTheScreen();
    expect(screen.getByText('No customer is linked to your account. Ask your facility to link one.')).toBeOnTheScreen();
    // Nothing to retry: a customer can only be linked by the facility.
    expect(screen.queryByLabelText('Try again')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
    const nodes = hostNodes();
    const container = nodes.filter(node => {
      const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
      return style.flex === 1 && style.backgroundColor === t.background.base;
    });
    expect(container.length).toBeGreaterThan(0);
    expect(nodes.filter(node => node.props.name === 'account-off-outline').length).toBeGreaterThan(0);
  });

  it('the date heading: the day as a header, footnote semibold in the secondary text colour', async () => {
    await renderThemed(<ReportDateHeading date="2026-10-09" />, brand, mode);
    const heading = screen.getByRole('header');
    expect(heading).toHaveTextContent(/09\/10\/26/);
    expect(heading).toHaveStyle({ color: t.text.secondary, fontWeight: fontWeight.semibold, textTransform: 'uppercase' });
  });
});

describe('the no-customer state in Gujarati', () => {
  it('uses the shared Gujarati wording', async () => {
    setLanguage('gu');
    await render(<ReportNoCustomer title="આવકની કામગીરી" />);
    expect(screen.getByText('કોઈ વેપારી જોડાયેલ નથી')).toBeOnTheScreen();
    expect(screen.getByText('તમારા ખાતા સાથે કોઈ વેપારી જોડાયેલ નથી. તમારા કોલ્ડ સ્ટોરેજને વેપારી જોડવા કહો.')).toBeOnTheScreen();
  });
});

describe('the header\'s "Share PDF"', () => {
  it('is one action while the facility can make report PDFs, busy while one is made, and none once it cannot', async () => {
    const exportPdf = jest.fn(async () => undefined);
    const [action] = exportHeaderActions({ exportPdf, busy: true, available: true });
    expect(action).toEqual(expect.objectContaining({ icon: 'file-pdf-box', label: 'Share PDF', busy: true }));
    action.onPress();
    expect(exportPdf).toHaveBeenCalledTimes(1);
    expect(exportHeaderActions({ exportPdf, busy: false, available: false })).toEqual([]);
  });
});

describe('"Show last 420 days"', () => {
  const today = new Date(2026, 9, 12);

  it('is offered while the period is shorter than the longest, and sets the period to the last 420 days', () => {
    const setField = jest.fn();
    const action = longestPeriodAction({ from: '2026-06-15', to: '2026-10-12' }, setField, today);
    expect(action?.label).toBe('Show last 420 days');
    action!.onPress();
    expect(setField).toHaveBeenCalledWith(PERIOD_KEY, { preset: 'last420' });
  });

  it('is not offered at the longest period or a longer one', () => {
    expect(longestPeriodAction({ from: '2025-08-19', to: '2026-10-12' }, jest.fn(), today)).toBeUndefined();
    expect(longestPeriodAction({ from: '2024-01-01', to: '2026-10-12' }, jest.fn(), today)).toBeUndefined();
  });

  it('reads in Gujarati with Gujarati digits', () => {
    setLanguage('gu');
    expect(longestPeriodAction({ from: '2026-06-15', to: '2026-10-12' }, jest.fn(), today)?.label).toBe('છેલ્લા ૪૨૦ દિવસ બતાવો');
  });
});
