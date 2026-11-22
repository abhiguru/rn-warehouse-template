/** G-28: Add and Edit item draw Back + a centred title, keep Save out of the header, and show the header while Edit item loads. */
import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import ItemFormScreen from '../../../app/item-form';
import ItemEditScreen from '../../../app/item-edit/[id]';
import { itemService } from '@/services/item-service';
import { getItemStoragePrices } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { router } from 'expo-router';

let mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin', name: 'Dev Administrator' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({ id: 'i2' }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('@/services/item-service', () => ({
  itemService: {
    getItemList: jest.fn(),
    getItemById: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    deleteItem: jest.fn(),
    toggleItemActive: jest.fn(),
  },
}));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null, status: 'loading', refresh: jest.fn(), key: 'k' }) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));


const GARLIC = { id: 'i2', name: 'Garlic', packaging: 'Bag', description: '', active: true };
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(itemService.getItemById).mockResolvedValue({ success: true, message: '', data: GARLIC } as never);
  jest.mocked(itemService.getItemList).mockResolvedValue({ success: true, message: '', data: [], pagination: { total_count: 0 } } as never);
  jest.mocked(itemService.updateItem).mockResolvedValue({ success: true, message: 'ok' } as never);
  jest.mocked(itemService.createItem).mockResolvedValue({ success: true, message: 'ok' } as never);
});
const renderEdit = async () => { await render(<ItemEditScreen />); };
const renderAdd = async () => { await render(<ItemFormScreen />); };

const inside = (testID: string) => within(screen.getByTestId(testID));
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;

describe('Edit item frame', () => {
  it('shows the title and a Back button while the item loads', async () => {
    jest.mocked(itemService.getItemById).mockReturnValue(new Promise(() => undefined) as never);
    await renderEdit();
    expect(screen.getByText('Edit item')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    expect(screen.getByText('Loading item…')).toBeOnTheScreen();
  });

  it('puts Save item in a bottom bar, not in the header', async () => {
    await renderEdit();
    await screen.findByDisplayValue('Garlic');
    expect(inside('item-header').getByLabelText('Back')).toBeOnTheScreen();
    expect(inside('item-header').queryByLabelText('Save item', hidden)).not.toBeOnTheScreen();
    expect(inside('item-header').getByText('Back')).toBeOnTheScreen();
    expect(inside('item-header').getByText('Edit item')).toBeOnTheScreen();
    expect(inside('item-bottom-bar').getByLabelText('Save item')).toBeOnTheScreen();
  });
});

describe('Add item frame', () => {
  it('has an Add item button in the bottom bar and nothing to save in the header', async () => {
    await renderAdd();
    expect(inside('item-header').queryByLabelText('Save item', hidden)).not.toBeOnTheScreen();
    expect(inside('item-header').queryByLabelText('Add item', hidden)).not.toBeOnTheScreen();
    expect(inside('item-bottom-bar').getByLabelText('Add item')).toBeOnTheScreen();
  });
});
