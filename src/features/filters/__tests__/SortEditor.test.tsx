/**
 * The sort control of every list, by pressing it: choosing another field keeps
 * the direction, choosing another direction keeps the field, and what comes
 * out is what the list's request carries. (A render-only test cannot tell a
 * field press that also resets the direction from one that does not.)
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { SortEditor } from '../components/editors/SortEditor';
import { FILTER_CONFIGS } from '../configs';
import { SORT_DIRECTIONS } from '../filterModel';
import type { FilterContext, FilterValues, SortState } from '../types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

type ListWithRequest = { toRequest: (values: FilterValues, sort: SortState, ctx: FilterContext, today: Date) => unknown };
const staff: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };
const sortable = Object.values(FILTER_CONFIGS).filter(config => config.sort && config.sort.options.length > 1);

/** A sort control that holds its own value, as the Sort and filter page does. */
function open(listKey: string, initial: SortState) {
  const config = FILTER_CONFIGS[listKey];
  let current = initial;
  const Host = () => {
    const [sort, setSort] = React.useState(initial);
    current = sort;
    return <SortEditor options={config.sort!.options} value={sort} onChange={setSort} />;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Host />);
  });
  const radios = () => renderer.root.findAll(node => typeof node.type !== 'string' && node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function');
  return {
    sort: () => current,
    press: (label: string) => act(() => radios().find(node => node.props.accessibilityLabel === label)!.props.onPress()),
    selected: () => radios().filter(node => node.props.accessibilityState.selected).map(node => node.props.accessibilityLabel as string),
    // The registry hides each list's request type; the function itself is still there.
    request: () => JSON.stringify((config as unknown as ListWithRequest).toRequest({}, current, staff, new Date(2026, 9, 10))),
  };
}

it('covers the lists that can be sorted by more than one field', () => {
  expect(sortable.map(config => config.listKey)).toEqual(expect.arrayContaining(['grn-list', 'dispatch-list', 'invoice-list']));
});

describe.each(sortable.map(config => [config.listKey, config] as const))('sort control of %s', (listKey, config) => {
  const [first, second] = config.sort!.options;

  it('keeps the direction when another field is chosen', () => {
    const control = open(listKey, { field: first.field, order: 'asc' });
    expect(control.selected()).toEqual([first.label, SORT_DIRECTIONS[first.kind ?? 'date'].asc]);

    control.press(second.label);

    expect(control.sort()).toEqual({ field: second.field, order: 'asc' });
    // The direction chip is worded for the new field and is still the ascending one.
    expect(control.selected()).toEqual([second.label, SORT_DIRECTIONS[second.kind ?? 'date'].asc]);
  });

  it('keeps the field when the direction is flipped, and the request follows both', () => {
    const control = open(listKey, { field: second.field, order: 'asc' });
    const ascending = control.request();
    expect(ascending).toContain(`"${second.field}"`);
    expect(ascending).toContain('"asc"');

    control.press(SORT_DIRECTIONS[second.kind ?? 'date'].desc);

    expect(control.sort()).toEqual({ field: second.field, order: 'desc' });
    const descending = control.request();
    expect(descending).toContain(`"${second.field}"`);
    expect(descending).toContain('"desc"');
    expect(descending).not.toBe(ascending);
  });
});
