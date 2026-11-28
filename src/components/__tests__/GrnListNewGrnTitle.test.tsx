/**
 * WH-161 (cdbdef6b): the GRN list card of a GRN made on this phone with no number yet is titled "New GRN" ("નવી આવક પાવતી"),
 * and the card's spoken label and its Print, View and Edit labels are built from that title; the "Not sent yet" footnote stays.
 * A GRN with a number keeps "GRN <number>"; a sent GRN with no number keeps "GRN with no number". Fictional data only.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import GRNListFiori from '../GRNListFiori';
import { getGRNListPage } from '@/services/grn-service';
import { setLanguage } from '@/i18n';

const mockState = { listFilters: { lists: {} }, theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', name: 'Asha Fictional', role: 'admin' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(mockState),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
const mockPermissions = { canCreate: true, canUpdate: true, canDelete: true, isCustomer: false };
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => mockPermissions }));
const mockAccess = { assignedCustomerIds: [] as string[], isCustomerAccount: false };
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => mockAccess }));
jest.mock('@/hooks/useCanPrint', () => ({ useCanPrint: () => true }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false, useNetworkStatus: () => ({ isConnected: true, type: 'wifi' }) }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/features/filters/components/FilteredListHeader', () => ({ FilteredListHeader: () => null, filteredEmptyProps: () => ({}) }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn(), printFailureMessage: jest.fn() }));
jest.mock('@shopify/flash-list', () => ({
  FlashList: ({ data, renderItem, keyExtractor }: any) =>
    require('react').createElement(require('react').Fragment, null, data.map((item: any) => require('react').createElement(require('react').Fragment, { key: keyExtractor(item) }, renderItem({ item })))),
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({ __esModule: true, default: ({ children }: any) => children }));
jest.mock('@/services/grn-service', () => ({
  ...jest.requireActual('@/services/grn-service'),
  getGRNListPage: jest.fn(),
}));

// What the phone holds that it has not sent (the overlay's edge): one new GRN, `g-new`, which has no number yet.
jest.mock('@/features/phone-copy/unsentOverlay', () => ({
  ...jest.requireActual('@/features/phone-copy/unsentOverlay'),
  getUnsentOverlay: () => ({
    ...jest.requireActual('@/features/phone-copy/unsentOverlay').getUnsentOverlay(),
    newDocuments: (kind: string) => (kind === 'grn' ? [{ kind: 'grn', localId: 'g-new' }] : []),
    marker: (kind: string, id: string) => (kind === 'grn' && id === 'g-new' ? 'notSent' : null),
  }),
}));

const row = (id: string, grNo: string) => ({
  id, grn_id: id, grn_item_id: `${id}-i`, gr_no: grNo, date: '2026-10-01', customer_id: 'c1', customer_name: 'Fictional Traders', supervisor_name: null,
  registration: null, item_id: 'gur', item_name: 'Fictional Gur', packaging: 'Bag', qty: 10, stock: 10, weight: 12,
});

const open = async (items: ReturnType<typeof row>[]) => {
  jest.mocked(getGRNListPage).mockResolvedValue({
    success: true,
    data: { items, pagination: { total: items.length, limit: 20, offset: 0, unit: 'receipt', has_more: false } },
  } as never);
  await render(<GRNListFiori />);
  await screen.findByTestId(`grn-card-${items[0].id}`);
};
const labelsOf = (id: string) => {
  const card = screen.getByTestId(`grn-card-${id}`);
  return { spoken: card.props.accessibilityLabel as string, actions: (card.props.accessibilityActions ?? []) as { name: string; label: string }[] };
};

afterEach(() => { setLanguage('en'); });

describe('GRN list card title', () => {
  it('a phone-only GRN with no number is "New GRN": title, spoken label, Print and Edit labels, and the Not sent yet footnote', async () => {
    await open([row('g-new', '')]);
    expect(screen.getByText('New GRN')).toBeOnTheScreen();
    expect(screen.queryByText('GRN with no number')).not.toBeOnTheScreen();
    const { spoken, actions } = labelsOf('g-new');
    expect(spoken.startsWith('New GRN, ')).toBe(true);
    expect(spoken.endsWith('Not sent yet')).toBe(true);
    expect(actions.map(a => a.label)).toEqual([expect.stringContaining('Print New GRN'), expect.stringContaining('Edit New GRN')]);
    expect(screen.getByTestId('grn-card-unsent-g-new')).toHaveTextContent('Not sent yet');
  });

  it('a sent GRN with no number keeps "GRN with no number"', async () => {
    await open([row('g-sent', '')]);
    expect(screen.getByText('GRN with no number')).toBeOnTheScreen();
    expect(screen.queryByText('New GRN')).not.toBeOnTheScreen();
    expect(labelsOf('g-sent').spoken.startsWith('GRN with no number, ')).toBe(true);
  });

  it('a GRN with a number keeps its number, even on the phone', async () => {
    await open([row('g-new', 'A0299')]);
    expect(screen.getByText('GRN A0299')).toBeOnTheScreen();
    expect(screen.queryByText('New GRN')).not.toBeOnTheScreen();
  });

  it('in Gujarati, a phone-only GRN with no number is "નવી આવક પાવતી" in the title and the labels', async () => {
    setLanguage('gu');
    await open([row('g-new', '')]);
    expect(screen.getByText('નવી આવક પાવતી')).toBeOnTheScreen();
    const { spoken, actions } = labelsOf('g-new');
    expect(spoken.startsWith('નવી આવક પાવતી, ')).toBe(true);
    expect(actions.map(a => a.label)).toEqual([expect.stringContaining('નવી આવક પાવતી પ્રિન્ટ'), expect.stringContaining('નવી આવક પાવતીમાં ફેરફાર')]);
    expect(screen.getByTestId('grn-card-unsent-g-new')).toBeOnTheScreen();
  });
});
