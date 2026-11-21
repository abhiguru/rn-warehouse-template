/**
 * The "Sort and filter" page: nothing is applied until the button, Reset and
 * Close leave the list as it was, closing with changes asks first, and Back
 * from a picker returns to the form.
 */
import React from 'react';
import { AccessibilityInfo, BackHandler, ScrollView, StyleSheet } from 'react-native';
import { act, render, screen, userEvent, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import { space, touchTarget } from '@/theme/tokens';
import ListFiltersScreen from '../list-filters';

const mockDispatch = jest.fn();
let mockParams: { listKey?: string } = { listKey: 'grn-list' };
let mockState: {
  theme: { preference: string; brand: string };
  auth: { userProfile: unknown };
  listFilters: { lists: Record<string, { values: Record<string, unknown>; sort?: { field: string; order: string } }> };
};

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({
  forceLogoutOnInvalidToken: jest.fn(),
  logout: { fulfilled: { type: 'auth/logout/fulfilled', match: () => false } },
}));
jest.mock('@/features/filters/pickerSources', () => {
  const source = { initial: () => Promise.resolve([]), search: () => Promise.resolve([]) };
  return { customerSource: source, itemSource: source };
});
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
// The real editors, with a count of how often each one is mounted.
const mockMounts = jest.fn();
jest.mock('@/features/filters/components/FieldEditor', () => {
  const ReactMock = require('react');
  const actual = jest.requireActual('@/features/filters/components/FieldEditor');
  const FieldEditor = (props: { field: { key: string } }) => {
    ReactMock.useEffect(() => {
      mockMounts(props.field.key);
       
    }, []);
    return ReactMock.createElement(actual.FieldEditor, props);
  };
  return { ...actual, FieldEditor, default: FieldEditor };
});
jest.mock('@/features/filters/configs', () => {
  const actual = jest.requireActual('@/features/filters/configs');
  return {
    ...actual,
    FILTER_CONFIGS: {
      'grn-list': { ...actual.FILTER_CONFIGS['grn-list'], countResults: jest.fn(() => Promise.resolve(24)) },
    },
  };
});

const staffProfile = { role: 'staff' };
const oneCustomerProfile = { role: 'customer', assignedCustomers: [{ id: 'c1', name: 'Sunrise Agro Foods' }] };


const alertMock = showAlert as jest.Mock;
const backListener = jest.spyOn(BackHandler, 'addEventListener');
const backMock = router.back as jest.Mock;
// The jest ScrollView keeps one shared scrollTo stand-in on its prototype.
const scrollToMock = ScrollView.prototype.scrollTo as unknown as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  mockDispatch.mockClear();
  mockMounts.mockClear();
  alertMock.mockClear();
  backMock.mockClear();
  backListener.mockClear();
  scrollToMock.mockClear();
  mockParams = { listKey: 'grn-list' };
  mockState = {
    theme: { preference: 'light', brand: 'orange' },
    auth: { userProfile: staffProfile },
    listFilters: { lists: {} },
  };
});
afterEach(() => jest.useRealTimers());

const RESET = 'Reset all filters and the sort on this page';
const WEIGHT_MIN = 'Weight each, minimum, in kg';
const WEIGHT_MAX = 'Weight each, maximum, in kg';

const open = async () => {
  await render(<ListFiltersScreen />);
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  return {
    user,
    press: (role: 'button' | 'radio', name: string) => user.press(screen.getByRole(role, { name })),
    // The page title is the first header on the page.
    title: () => screen.getAllByRole('header')[0],
    // The apply button can be pressed once it has stopped counting the results (busy).
    apply: async () => user.press(await screen.findByRole('button', { name: /^Show /, busy: false })),
    hardwareBack: () => {
      // The listener registered last is the one in effect.
      const calls = backListener.mock.calls;
      (calls[calls.length - 1][1] as () => boolean)();
    },
  };
};

describe('Sort and filter page', () => {
  it('makes Reset in the header a whole touch target, with no hitSlop (§11.2)', async () => {
    const page = await open();
    await page.press('radio', 'In stock');
    const reset = screen.getByRole('button', { name: t('filters.page.resetLabel') });
    const style = StyleSheet.flatten(reset.props.style);
    expect(reset).not.toHaveProp('hitSlop');
    expect(style.minHeight).toBe(touchTarget);
  });

  it('closes at once when nothing was changed', async () => {
    const page = await open();
    await page.press('button', 'Close without applying');
    expect(alertMock).not.toHaveBeenCalled();
    expect(backMock).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('asks before closing with changes, and Discard applies nothing', async () => {
    const page = await open();
    await page.press('radio', 'In stock');
    await page.press('button', 'Close without applying');
    expect(backMock).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledTimes(1);
    const [title, , buttons] = alertMock.mock.calls[0];
    expect(title).toBe('Discard changes?');
    expect(buttons.map((button: { text: string }) => button.text)).toEqual(['Keep editing', 'Discard']);

    buttons[1].onPress();
    expect(backMock).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('counts a changed sort as a change', async () => {
    const page = await open();
    await page.press('radio', 'Lowest number first');
    await page.press('button', 'Close without applying');
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the list as it was after Reset then Close', async () => {
    const page = await open();
    await page.press('radio', 'In stock');
    await page.press('radio', 'Lowest number first');
    await page.press('button', RESET);
    await page.press('button', 'Close without applying');
    expect(alertMock).not.toHaveBeenCalled();
    expect(backMock).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('applies the draft filters and sort in one step from the button', async () => {
    const page = await open();
    await page.press('radio', 'In stock');
    await page.press('radio', 'Lowest number first');
    expect(mockDispatch).not.toHaveBeenCalled();
    await page.apply();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0][0]).toMatchObject({
      type: 'listFilters/applyListFilters',
      payload: { key: 'grn-list', values: { stock: 'in_stock' }, sort: { field: 'gr_no', order: 'asc' } },
    });
    expect(backMock).toHaveBeenCalledTimes(1);
  });

  // §10, §11.3 (code review 2026-10-18, R2-3): a blocked press brings the first wrong field into view and focuses its error.
  it('never applies a reversed range: the press scrolls to the field and focuses its error', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    const page = await open();
    scrollToMock.mockClear();
    // The Weight each section is laid out 300 down the scrolled content (the layout reaches the section around the field).
    await fireEvent(screen.getByLabelText(WEIGHT_MIN), 'layout', { nativeEvent: { layout: { y: 300 } } });
    await page.user.type(screen.getByLabelText(WEIGHT_MIN), '50');
    await page.user.type(screen.getByLabelText(WEIGHT_MAX), '10');

    await page.apply();

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('The minimum is larger than the maximum.');
    expect(scrollToMock).toHaveBeenCalledWith({ y: 300 - space.md, animated: false });
    expect(focus).toHaveBeenCalledTimes(1);
    const [target, event] = focus.mock.calls[0] as unknown as [{ props: { children: string } }, string];
    expect(event).toBe('focus');
    expect(target.props.children).toBe('The minimum is larger than the maximum.');
    announce.mockRestore();
    focus.mockRestore();
  });

  it('keeps a number field mounted while typing, so the keyboard stays on it', async () => {
    const page = await open();
    const mounts = () => mockMounts.mock.calls.filter(([key]) => key === 'weight').length;
    expect(mounts()).toBe(1);
    // The first character turns the filter on; the field must be the same one, not a new copy.
    await page.user.type(screen.getByLabelText(WEIGHT_MIN), '5');
    await page.user.type(screen.getByLabelText(WEIGHT_MIN), '0');
    expect(mounts()).toBe(1);
    await page.apply();
    expect(mockDispatch.mock.calls[0][0].payload.values).toEqual({ weight: { min: 50 } });
  });

  it('empties a typed number field on Reset', async () => {
    const page = await open();
    await page.user.type(screen.getByLabelText(WEIGHT_MIN), '50');
    expect(screen.getByLabelText(WEIGHT_MIN)).toHaveDisplayValue('50');
    await page.press('button', RESET);
    expect(screen.getByLabelText(WEIGHT_MIN)).toHaveDisplayValue('');
  });

  it('keeps the search of the list when Reset clears the filters', async () => {
    mockState.listFilters.lists['grn-list'] = { values: { search: 'garlic', stock: 'in_stock' } };
    const page = await open();
    await page.press('button', RESET);
    await page.apply();
    expect(mockDispatch.mock.calls[0][0].payload.values).toEqual({ search: 'garlic' });
  });

  it('opens a picker inside the page, and Back returns to the form', async () => {
    const page = await open();
    expect(page.title()).toHaveTextContent('Sort and filter');
    await page.press('button', 'Customer: any. Choose');
    expect(page.title()).toHaveTextContent('Customer');
    expect(screen.queryByRole('button', { name: 'Close without applying' })).not.toBeOnTheScreen();
    await page.press('button', 'Back to sort and filter');
    expect(page.title()).toHaveTextContent('Sort and filter');
    expect(backMock).not.toHaveBeenCalled();
  });

  it('uses the Android back button for the picker first, then for the page', async () => {
    const page = await open();
    await page.press('button', 'Customer: any. Choose');
    await act(() => page.hardwareBack());
    expect(page.title()).toHaveTextContent('Sort and filter');
    expect(backMock).not.toHaveBeenCalled();
    page.hardwareBack();
    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it('has no customer row for a customer account with one customer', async () => {
    mockState.auth.userProfile = oneCustomerProfile;
    await open();
    expect(screen.getByRole('button', { name: 'Item: any. Choose' })).toBeOnTheScreen();
    expect(screen.queryAllByRole('button', { name: /^Customer:/ })).toEqual([]);
  });

  it('says so when the list has no filters', async () => {
    mockParams = { listKey: 'no-such-list' };
    await render(<ListFiltersScreen />);
    expect(screen.getByText('This list has no filters.')).toBeOnTheScreen();
  });
});
