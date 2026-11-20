/**
 * The sort control of every list, by pressing it: choosing another field keeps
 * the direction, choosing another direction keeps the field, and what comes
 * out is what the list's request carries. (A render-only test cannot tell a
 * field press that also resets the direction from one that does not.)
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
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
async function open(listKey: string, initial: SortState) {
  const config = FILTER_CONFIGS[listKey];
  let current = initial;
  const Host = () => {
    const [sort, setSort] = React.useState(initial);
    current = sort;
    return <SortEditor options={config.sort!.options} value={sort} onChange={setSort} />;
  };
  await render(<Host />);
  const user = userEvent.setup({ delay: 0 });
  return {
    sort: () => current,
    press: (label: string) => user.press(screen.getByRole('radio', { name: label })),
    /** Exactly these radios are selected: the count rules out any other, the name lookup names each. */
    expectSelected: (labels: string[]) => {
      expect(screen.getAllByRole('radio', { selected: true })).toHaveLength(labels.length);
      for (const label of labels) expect(screen.getByRole('radio', { name: label, selected: true })).toBeOnTheScreen();
    },
    // The registry hides each list's request type; the function itself is still there.
    request: () => JSON.stringify((config as unknown as ListWithRequest).toRequest({}, current, staff, new Date(2026, 9, 10))),
  };
}

it('covers the lists that can be sorted by more than one field', () => {
  expect(sortable.map(config => config.listKey)).toEqual(expect.arrayContaining(['grn-list', 'dispatch-list', 'invoice-list']));
});

describe.each(sortable.map(config => [config.listKey, config] as const))('sort control of %s', (listKey, config) => {
  const [first, second] = config.sort!.options;

  it('keeps the direction when another field is chosen', async () => {
    const control = await open(listKey, { field: first.field, order: 'asc' });
    control.expectSelected([first.label, SORT_DIRECTIONS[first.kind ?? 'date'].asc]);

    await control.press(second.label);

    expect(control.sort()).toEqual({ field: second.field, order: 'asc' });
    // The direction chip is worded for the new field and is still the ascending one.
    control.expectSelected([second.label, SORT_DIRECTIONS[second.kind ?? 'date'].asc]);
  });

  it('keeps the field when the direction is flipped, and the request follows both', async () => {
    const control = await open(listKey, { field: second.field, order: 'asc' });
    const ascending = control.request();
    expect(ascending).toContain(`"${second.field}"`);
    expect(ascending).toContain('"asc"');

    await control.press(SORT_DIRECTIONS[second.kind ?? 'date'].desc);

    expect(control.sort()).toEqual({ field: second.field, order: 'desc' });
    const descending = control.request();
    expect(descending).toContain(`"${second.field}"`);
    expect(descending).toContain('"desc"');
    expect(descending).not.toBe(ascending);
  });
});
