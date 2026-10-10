/**
 * The "Sort and filter" page: nothing is applied until the button, Reset and
 * Close leave the list as it was, closing with changes asks first, and Back
 * from a picker returns to the form.
 */
import React from 'react';
import { BackHandler } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { router } from 'expo-router';
import { ApplyFiltersButton } from '@/features/filters/components/ApplyFiltersButton';
import { showAlert } from '@/utils/alert';
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

function open() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ListFiltersScreen />);
  });
  const withLabel = (label: string) =>
    renderer.root.findAll(node => typeof node.type !== 'string' && node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  return {
    renderer,
    labels: () =>
      renderer.root
        .findAll(
          node =>
            typeof node.type !== 'string' &&
            typeof node.props.accessibilityLabel === 'string' &&
            node.parent?.props.accessibilityLabel !== node.props.accessibilityLabel
        )
        .map(node => node.props.accessibilityLabel as string),
    has: (label: string) => withLabel(label).length > 0,
    press: (label: string) => act(() => withLabel(label)[0].props.onPress()),
    title: () => renderer.root.findAll(node => node.type === 'Text' && node.props.accessibilityRole === 'header')[0].props.children as string,
    apply: () => act(() => renderer.root.findByType(ApplyFiltersButton).props.onPress()),
    hardwareBack: () =>
      act(() => {
        // The listener registered last is the one in effect.
        const calls = backListener.mock.calls;
        (calls[calls.length - 1][1] as () => boolean)();
      }),
  };
}

const alertMock = showAlert as jest.Mock;
const backListener = jest.spyOn(BackHandler, 'addEventListener');
const backMock = router.back as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  mockDispatch.mockClear();
  mockMounts.mockClear();
  alertMock.mockClear();
  backMock.mockClear();
  backListener.mockClear();
  mockParams = { listKey: 'grn-list' };
  mockState = {
    theme: { preference: 'light', brand: 'orange' },
    auth: { userProfile: staffProfile },
    listFilters: { lists: {} },
  };
});
afterEach(() => jest.useRealTimers());

describe('Sort and filter page', () => {
  it('closes at once when nothing was changed', () => {
    const page = open();
    page.press('Close without applying');
    expect(alertMock).not.toHaveBeenCalled();
    expect(backMock).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('asks before closing with changes, and Discard applies nothing', () => {
    const page = open();
    page.press('In stock');
    page.press('Close without applying');
    expect(backMock).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledTimes(1);
    const [title, , buttons] = alertMock.mock.calls[0];
    expect(title).toBe('Discard changes?');
    expect(buttons.map((button: { text: string }) => button.text)).toEqual(['Keep editing', 'Discard']);

    act(() => buttons[1].onPress());
    expect(backMock).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('counts a changed sort as a change', () => {
    const page = open();
    page.press('Lowest number first');
    page.press('Close without applying');
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the list as it was after Reset then Close', () => {
    const page = open();
    page.press('In stock');
    page.press('Lowest number first');
    page.press('Reset all filters and the sort on this page');
    page.press('Close without applying');
    expect(alertMock).not.toHaveBeenCalled();
    expect(backMock).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('applies the draft filters and sort in one step from the button', () => {
    const page = open();
    page.press('In stock');
    page.press('Lowest number first');
    expect(mockDispatch).not.toHaveBeenCalled();
    page.apply();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0][0]).toMatchObject({
      type: 'listFilters/applyListFilters',
      payload: { key: 'grn-list', values: { stock: 'in_stock' }, sort: { field: 'gr_no', order: 'asc' } },
    });
    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a number field mounted while typing, so the keyboard stays on it', () => {
    const page = open();
    const input = () =>
      page.renderer.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Weight, minimum, in kg')[0];
    const mounts = () => mockMounts.mock.calls.filter(([key]) => key === 'weight').length;
    expect(mounts()).toBe(1);
    // The first character turns the filter on; the field must be the same one, not a new copy.
    act(() => input().props.onChangeText('5'));
    act(() => input().props.onChangeText('50'));
    expect(mounts()).toBe(1);
    page.apply();
    expect(mockDispatch.mock.calls[0][0].payload.values).toEqual({ weight: { min: 50 } });
  });

  it('empties a typed number field on Reset', () => {
    const page = open();
    const input = () =>
      page.renderer.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Weight, minimum, in kg')[0];
    act(() => input().props.onChangeText('50'));
    expect(input().props.value).toBe('50');
    page.press('Reset all filters and the sort on this page');
    expect(input().props.value).toBe('');
  });

  it('keeps the search of the list when Reset clears the filters', () => {
    mockState.listFilters.lists['grn-list'] = { values: { search: 'garlic', stock: 'in_stock' } };
    const page = open();
    page.press('Reset all filters and the sort on this page');
    page.apply();
    expect(mockDispatch.mock.calls[0][0].payload.values).toEqual({ search: 'garlic' });
  });

  it('opens a picker inside the page, and Back returns to the form', () => {
    const page = open();
    expect(page.title()).toBe('Sort and filter');
    page.press('Customer: any. Choose');
    expect(page.title()).toBe('Customer');
    expect(page.has('Close without applying')).toBe(false);
    page.press('Back to sort and filter');
    expect(page.title()).toBe('Sort and filter');
    expect(backMock).not.toHaveBeenCalled();
  });

  it('uses the Android back button for the picker first, then for the page', () => {
    const page = open();
    page.press('Customer: any. Choose');
    page.hardwareBack();
    expect(page.title()).toBe('Sort and filter');
    expect(backMock).not.toHaveBeenCalled();
    page.hardwareBack();
    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it('has no customer row for a customer account with one customer', () => {
    mockState.auth.userProfile = oneCustomerProfile;
    const page = open();
    const labels = page.labels();
    expect(labels).toContain('Item: any. Choose');
    expect(labels.filter(label => label.startsWith('Customer:'))).toEqual([]);
  });

  it('says so when the list has no filters', () => {
    mockParams = { listKey: 'no-such-list' };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<ListFiltersScreen />);
    });
    expect(renderer.root.findByProps({ children: 'This list has no filters.' })).toBeTruthy();
  });
});
