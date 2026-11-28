/**
 * WH-299 (Design's check of 2026-11-26, violations 3 and 4): with no connection, GRN details' Images "Add image" is
 * disabled with its reason (a screen-reader label and one visible line), and the GRN list card's Edit action says it
 * needs a connection and does nothing. Online, both are as today. The connection is the sync engine's own flag with the
 * phone copy on, the same one the screens read.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import GRNListFiori from '../GRNListFiori';
import { MemoizedDispatchItem } from '../list-items/MemoizedDispatchItem';
import type { Dispatch } from '@/services/dispatch-service';
import { GRNImagesTab } from '../grn-details/GRNImagesTab';
import { DispatchImagesTab } from '../dispatch-details/DispatchImagesTab';
import { getGRNListPage } from '@/services/grn-service';
import { router } from 'expo-router';
import { setCopyOffline } from '@/features/phone-copy/syncEngine';
import { resetSyncSnapshot } from '@/features/phone-copy/syncStore';
import { getTokens } from '@/theme/tokens';
import { setLanguage } from '@/i18n';

const mockState = { listFilters: { lists: {} }, theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', name: 'Asha Fictional', role: 'admin' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true, canDelete: true, isCustomer: false }) }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ assignedCustomerIds: [] as string[], isCustomerAccount: false }) }));
jest.mock('@/hooks/useCanPrint', () => ({ useCanPrint: () => true }));
jest.mock('@/hooks/useNetworkStatus', () => ({
  useIsOffline: () => false,
  useNetworkStatus: () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
}));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/features/filters/components/FilteredListHeader', () => ({ FilteredListHeader: () => null, filteredEmptyProps: () => ({}) }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn(), printFailureMessage: jest.fn() }));
jest.mock('@shopify/flash-list', () => ({
  FlashList: ({ data, renderItem, keyExtractor }: any) =>
    require('react').createElement(require('react').Fragment, null, data.map((item: any) => require('react').createElement(require('react').Fragment, { key: keyExtractor(item) }, renderItem({ item })))),
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({ __esModule: true, default: ({ children }: any) => children }));
jest.mock('@/services/grn-service', () => ({ ...jest.requireActual('@/services/grn-service'), getGRNListPage: jest.fn() }));

const DISABLED = getTokens('orange', 'light').interaction.disabledOpacity;
const LINE = 'Needs a connection';

beforeEach(() => {
  jest.clearAllMocks();
  resetSyncSnapshot({ feature: 'on' });
  setCopyOffline(false);
});
afterEach(async () => {
  setCopyOffline(false);
  resetSyncSnapshot();
  await setLanguage('en');
});
const goOffline = () => act(async () => { setCopyOffline(true); });

describe('GRN details, Images, Add image', () => {
  const onUpload = jest.fn();
  const photo = [{ id: 'p1', image_url: 'https://example.invalid/p1.jpg', category: 'header' as const }];
  const opacity = (name: string) => StyleSheet.flatten(screen.getByRole('button', { name }).props.style)?.opacity;

  it.each([['with photos', photo], ['with none', []]])('offline %s: is disabled, says why to a screen reader and in one line, and does nothing', async (_n, images) => {
    await render(<GRNImagesTab images={images} onUpload={onUpload} />);
    await goOffline();
    const add = screen.getByRole('button', { name: 'Add image, needs a connection' });
    expect(add).toBeDisabled();
    expect(opacity('Add image, needs a connection')).toBe(DISABLED);
    expect(screen.getByTestId('grn-images-needs-connection')).toHaveTextContent(/needs a connection/i);
    await userEvent.press(add);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it.each([['with photos', photo], ['with none', []]])('online %s: is enabled, drawn as today, with no line', async (_n, images) => {
    await render(<GRNImagesTab images={images} onUpload={onUpload} />);
    const add = screen.getByRole('button', { name: 'Add image' });
    expect(add).toBeEnabled();
    expect(opacity('Add image')).not.toBe(DISABLED);
    expect(screen.queryByTestId('grn-images-needs-connection')).not.toBeOnTheScreen();
    await userEvent.press(add);
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it('says the reason in Gujarati', async () => {
    await setLanguage('gu');
    await render(<GRNImagesTab images={photo} onUpload={onUpload} />);
    await goOffline();
    expect(screen.getByTestId('grn-images-needs-connection')).toHaveTextContent('કનેક્શન જોઈએ');
    expect(screen.getByRole('button', { name: /, કનેક્શન જોઈએ$/ })).toBeDisabled();
  });
});

describe('GRN list card, screen-reader Edit action', () => {
  const row = {
    id: 'g1', grn_id: 'g1', grn_item_id: 'g1-i', gr_no: 'A0001', date: '2026-10-01', customer_id: 'c1', customer_name: 'Fictional Traders',
    supervisor_name: null, registration: null, item_id: 'gur', item_name: 'Fictional Gur', packaging: 'Bag', qty: 10, stock: 10, weight: 12,
  };
  const open = async () => {
    jest.mocked(getGRNListPage).mockResolvedValue({
      success: true,
      data: { items: [row], pagination: { total: 1, limit: 20, offset: 0, unit: 'receipt', has_more: false } },
    } as never);
    await render(<GRNListFiori />);
    return screen.findByTestId('grn-card-g1');
  };
  const actions = () => screen.getByTestId('grn-card-g1').props.accessibilityActions as { name: string; label: string }[];
  const run = (name: string) => fireEvent(screen.getByTestId('grn-card-g1'), 'accessibilityAction', { nativeEvent: { actionName: name } });

  it('offline: Edit says it needs a connection and does not open the editor', async () => {
    await open();
    await goOffline();
    expect(actions().find(a => a.name === 'edit')?.label).toBe('Edit GRN A0001, needs a connection');
    await run('edit');
    expect(router.push).not.toHaveBeenCalledWith(expect.stringContaining('grn-edit'));
  });

  it('online: Edit is plain and opens the editor', async () => {
    await open();
    expect(actions().find(a => a.name === 'edit')?.label).toBe('Edit GRN A0001');
    await run('edit');
    expect(router.push).toHaveBeenCalledWith('/grn-edit/g1/step1');
  });
});

describe('Dispatch card, screen-reader Print action', () => {
  const dispatch = {
    dispatch_id: 'd1', disp_no: '42', disp_date: '2026-10-09', customer_name: 'Fictional Traders', total_qty: 120, total_items: 1,
    registration: 'GJ01AB1234',
    items: [{ grn_item_id: 'g1', item_name: 'Fictional Gur', rack: 'B-14', package_mark: 'PM', weight: 50, gr_no: '311', grn_qty: 200, disp_qty: 100 }],
  } as unknown as Dispatch;
  const onPrint = jest.fn();
  const open = () => render(<MemoizedDispatchItem dispatch={dispatch} onPress={jest.fn()} canPrint onPrint={onPrint} />);
  const card = () => screen.root!.queryAll(node => Array.isArray(node.props.accessibilityActions) && node.props.accessibilityActions.some((a: { name: string }) => a.name === 'print'))[0];
  const actions = () => card().props.accessibilityActions as { name: string; label: string }[];
  const run = () => fireEvent(card(), 'accessibilityAction', { nativeEvent: { actionName: 'print' } });

  it('offline: Print says it needs a connection and prints nothing', async () => {
    await open();
    await goOffline();
    expect(actions().find(a => a.name === 'print')?.label).toBe('Print Dispatch 42, needs a connection');
    await run();
    expect(onPrint).not.toHaveBeenCalled();
  });

  it('online: Print is plain and prints', async () => {
    await open();
    expect(actions().find(a => a.name === 'print')?.label).toBe('Print Dispatch 42');
    await run();
    expect(onPrint).toHaveBeenCalledTimes(1);
  });
});

describe('Kept photo, per-photo delete', () => {
  const grnPhoto = [{ id: 'p1', image_url: 'file:///kept/p1.jpg', category: 'header' as const }];
  const dispatchPhoto = [{ id: 'q1', image_url: 'file:///kept/q1.jpg' }];
  const cases = [
    ['GRN Images', 'Delete GRN photo', (onDelete: jest.Mock) => <GRNImagesTab images={grnPhoto} onDeleteImage={onDelete} />],
    ['dispatch Images', 'Delete dispatch photo 1 of 1', (onDelete: jest.Mock) => <DispatchImagesTab images={dispatchPhoto} onDelete={onDelete} />],
  ] as const;

  it.each(cases)('offline, %s: delete is disabled, says it needs a connection, and deletes nothing', async (_n, label, ui) => {
    const onDelete = jest.fn();
    await render(ui(onDelete));
    await goOffline();
    const del = screen.getByRole('button', { name: `${label}, needs a connection` });
    expect(del).toBeDisabled();
    await userEvent.press(del);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it.each(cases)('online, %s: delete stays enabled and deletes', async (_n, label, ui) => {
    const onDelete = jest.fn();
    await render(ui(onDelete));
    const del = screen.getByRole('button', { name: label });
    expect(del).toBeEnabled();
    await userEvent.press(del);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
