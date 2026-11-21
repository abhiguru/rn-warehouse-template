import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SingleFilterSheet, type OpenFilter } from '../components/SingleFilterSheet';
import { FILTER_CONFIGS } from '../configs';
import { currentSort, visibleFields } from '../filterModel';
import type { FilterContext, FilterValues } from '../types';
import { COUNT_DEBOUNCE_MS } from '../useFilterResultCount';
import type { useListFilters } from '../useListFilters';


jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduceMotion,
}));

const config = { ...FILTER_CONFIGS['grn-list'], countResults: jest.fn(() => Promise.resolve(24)) };
const ctx: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };

async function setup(values: FilterValues) {
  const filters = {
    ctx,
    fields: visibleFields(config, ctx),
    values,
    sort: currentSort(config, undefined),
    setField: jest.fn(),
    setSort: jest.fn(),
  };
  const onClose = jest.fn();
  const user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
  const element = (open: OpenFilter) => (
    <SingleFilterSheet config={config} filters={filters as unknown as ReturnType<typeof useListFilters>} open={open} onClose={onClose} />
  );
  await render(element(null));
  const input = (label: string) => screen.getByLabelText(label);
  const press = (name: string, role: 'button' | 'radio' = 'button') => user.press(screen.getByRole(role, { name }));
  // The Modal is a stand-in host in the tree, and no query reaches its animation prop: read it from the rendered JSON.
  const modal = () => {
    const found: Record<string, any>[] = [];
    const walk = (node: ReturnType<typeof screen.toJSON> | string | null): void => {
      if (!node || typeof node === 'string') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if ((node.type as string) === 'Modal' && node.props.visible) found.push(node.props);
      node.children?.forEach(walk);
    };
    walk(screen.toJSON());
    return found[0];
  };
  return { filters, onClose, input, press, user, modal, open: (open: OpenFilter) => screen.rerender(element(open)) };
}

describe('single filter sheet', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('opens a typed field with the value in effect', async () => {
    const sheet = await setup({ weight: { min: 50 } });
    await sheet.open({ type: 'field', key: 'weight' });
    expect(sheet.input('Weight each, minimum, in kg')).toHaveDisplayValue('50');
    expect(sheet.input('Weight each, maximum, in kg')).toHaveDisplayValue('');
  });

  it('shows the value of the filter just opened, not of the one before', async () => {
    const sheet = await setup({ weight: { min: 50 }, package: 'Crate' });
    await sheet.open({ type: 'field', key: 'package' });
    expect(sheet.input('Package')).toHaveDisplayValue('Crate');
    await sheet.open(null);
    await sheet.open({ type: 'field', key: 'weight' });
    expect(sheet.input('Weight each, minimum, in kg')).toHaveDisplayValue('50');
  });

  it('empties the field on Reset and changes nothing until the button', async () => {
    const sheet = await setup({ weight: { min: 50 } });
    await sheet.open({ type: 'field', key: 'weight' });
    await sheet.press('Reset');
    expect(sheet.input('Weight each, minimum, in kg')).toHaveDisplayValue('');
    expect(sheet.filters.setField).not.toHaveBeenCalled();
  });

  // §10, §11.3 (code review 2026-10-18, R2-3): a blocked press says what is wrong and moves focus to the field's error.
  it('never applies a reversed range: the press announces the error and focuses it', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    const sheet = await setup({});
    await sheet.open({ type: 'field', key: 'weight' });
    await sheet.user.paste(sheet.input('Weight each, minimum, in kg'), '50');
    await sheet.user.paste(sheet.input('Weight each, maximum, in kg'), '10');

    // The count has arrived (the button is not pressable while it loads).
    await act(async () => { jest.advanceTimersByTime(COUNT_DEBOUNCE_MS); });
    await sheet.user.press(await screen.findByRole('button', { name: 'Show 24 GRNs' }));

    expect(sheet.filters.setField).not.toHaveBeenCalled();
    expect(sheet.onClose).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('The minimum is larger than the maximum.');
    expect(focus).toHaveBeenCalledTimes(1);
    const [target, event] = focus.mock.calls[0];
    expect(event).toBe('focus');
    // The focus goes to the text that shows the error (the ref is the Text instance, which no query returns; the text is on screen once).
    expect((target as unknown as { props: { children: string } }).props.children).toBe('The minimum is larger than the maximum.');
    expect(screen.getByText('The minimum is larger than the maximum.')).toBeOnTheScreen();
    announce.mockRestore();
    focus.mockRestore();
  });

  it('applies a choice on tap and closes', async () => {
    const sheet = await setup({});
    await sheet.open({ type: 'field', key: 'stock' });
    await sheet.press('In stock', 'radio');
    expect(sheet.filters.setField.mock.calls).toEqual([['stock', 'in_stock']]);
    expect(sheet.onClose).toHaveBeenCalledTimes(1);
  });

  // §9: with Reduce Motion on, the sheet fades in instead of sliding up.
  it('slides up normally and fades in when Reduce Motion is on', async () => {
    try {
      mockReduceMotion = false;
      const sliding = await setup({});
      await sliding.open({ type: 'field', key: 'stock' });
      expect(sliding.modal()?.animationType).toBe('slide');
      await screen.unmount();

      mockReduceMotion = true;
      const fading = await setup({});
      await fading.open({ type: 'field', key: 'stock' });
      expect(fading.modal()?.animationType).toBe('fade');
    } finally {
      mockReduceMotion = false;
    }
  });
});
