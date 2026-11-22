/**
 * Create actions on the Dispatches and Invoices list reports (style guide §14.1):
 * a 56 px floating button on brand.fill with shadow[3], shown only to roles
 * that can create.
 */
import React from 'react';

import { act, render, screen, userEvent } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { registerDispatchForm } from '@/features/dispatch/utils/openDispatchForms';
import { showAlert } from '@/utils/alert';
import DispatchTab from '../../../app/(tabs)/dispatch';
import InvoicesTab from '../../../app/(tabs)/invoices';

// The Invoices tab reads the person's role since WH-205 (it asks before a new bill opens), so the store has an auth slice.
let mockState: { theme: { preference: string; brand: string }; auth: { userProfile: { role: string } } } = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { role: 'admin' } },
};
const mockDispatch = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  // The Invoices tab takes "Create invoice" again once it is back in front.
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/components/lists', () => ({ DispatchFlashList: () => null, InvoiceFlashList: () => null }));
jest.mock('@/components/list/ListErrorBoundary', () => ({
  ListErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
let mockCanCreate = true;
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: mockCanCreate }) }));

const MODES: Mode[] = ['light', 'dark'];

const CASES = [
  { name: 'Dispatches', Screen: DispatchTab, label: 'Create dispatch', route: '/dispatch-form/step1' },
  { name: 'Invoices', Screen: InvoicesTab, label: 'Create invoice', route: '/invoice-form/step1' },
] as const;

async function mount(Screen: React.ComponentType, brand: string, mode: Mode) {
  mockState = { ...mockState, theme: { preference: mode, brand } };
  await render(<Screen />);
}

const findFab = (label: string) => screen.queryByRole('button', { name: label });

describe.each(CASES)('$name tab create action', ({ Screen, label, route }) => {
  beforeEach(() => {
    mockCanCreate = true;
    mockPush.mockClear();
  });

  it.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))(
    'is a 56 px brand.fill floating button in %s %s',
    async (brand, mode) => {
      const t = getTokens(brand, mode);
      await mount(Screen, brand, mode);
      const fab = screen.getByRole('button', { name: label });
      expect(fab).toBeOnTheScreen();
      expect(fab).toHaveStyle({ position: 'absolute', width: 56, height: 56, backgroundColor: t.brand.fill });
      // The Invoices tab asks the server whether a bill may start (WH-205) before it opens the form, so the press is awaited.
      await userEvent.press(fab);
      expect(mockPush).toHaveBeenCalledWith(route);
    }
  );

  it('is hidden for roles that cannot create', async () => {
    mockCanCreate = false;
    await mount(Screen, 'orange', 'light');
    expect(findFab(label)).not.toBeOnTheScreen();
  });
});

describe('Dispatches tab: Create dispatch', () => {
  beforeEach(() => {
    mockCanCreate = true;
    mockPush.mockClear();
    mockDispatch.mockClear();
    jest.mocked(showAlert).mockClear();
  });

  it('empties the form before step 1 opens, so a new dispatch carries nothing an earlier form left', async () => {
    await mount(DispatchTab, 'orange', 'light');

    await userEvent.press(screen.getByRole('button', { name: 'Create dispatch' }));

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'dispatchForm/resetForm' }));
    expect(mockPush).toHaveBeenCalledWith('/dispatch-form/step1');
    expect(mockDispatch.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0]);
  });

  it('a second tap before the tab is back in front opens nothing more', async () => {
    await mount(DispatchTab, 'orange', 'light');
    const fab = screen.getByRole('button', { name: 'Create dispatch' });

    // Two taps in one go, before the screen draws again: the host's click handler is what a tap calls.
    await act(async () => { fab.props.onClick(); fab.props.onClick(); });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  // Review 2026-10-20, finding 3: the form that is open (maybe hidden under other screens) is asked about BEFORE the
  // store is emptied; emptying it first would leave the open form without its data.
  it('while another dispatch form is open: says which, and resets and opens nothing', async () => {
    const release = registerDispatchForm({ kind: 'edit', id: 'd-7', number: 'DD0007' });
    try {
      await mount(DispatchTab, 'orange', 'light');

      await userEvent.press(screen.getByRole('button', { name: 'Create dispatch' }));

      expect(showAlert).toHaveBeenCalledWith('Another dispatch is open', 'Finish or cancel the edit of dispatch DD0007 first.', expect.any(Array));
      expect(mockDispatch).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();

      // A later tap, once that form is closed, opens as usual.
      release();
      await userEvent.press(screen.getByRole('button', { name: 'Create dispatch' }));
      expect(mockPush).toHaveBeenCalledWith('/dispatch-form/step1');
    } finally {
      release();
    }
  });
});
