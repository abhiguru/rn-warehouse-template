/**
 * useRateEditor: opening a draft from the item's rows, what counts as a change, the payload of the save and the
 * LATER_RATES_EXIST question. The screens that use it (app/item-rates/edit.tsx) have their own tests.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { replaceItemRates } from '@/services/item-pricing-service';
import { showToast } from '@/utils/toast';
import { setBandField } from '../editModel';
import { useRateEditor, type UseRateEditor, type UseRateEditorArgs } from '../useRateEditor';
import { cuminRows } from '@/tests/helpers/rateEditorFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));

const TODAY = '2026-10-14';
const replace = jest.mocked(replaceItemRates);

let latest!: UseRateEditor;
let tree: ReactTestRenderer | undefined;
const onSaved = jest.fn();
const refreshRows = jest.fn();

function Harness({ args }: { args: UseRateEditorArgs }) {
  latest = useRateEditor(args);
  return null;
}

const baseArgs = (rows: UseRateEditorArgs['rows']): UseRateEditorArgs => ({
  item: { id: 'cumin', name: 'Review Cumin Bold' },
  customer: null,
  priceType: 'monthly',
  mode: 'change',
  rows,
  refreshRows,
  role: 'admin',
  today: TODAY,
  onSaved,
});

async function mount(rows: UseRateEditorArgs['rows'] = cuminRows()) {
  const rowsNow = rows;
  await act(async () => { tree = create(React.createElement(Harness, { args: baseArgs(rowsNow) })); });
  return rowsNow;
}

beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

it('is not ready while the rows load, and opens a draft in change mode from the rows', async () => {
  await mount(null);
  expect(latest.ready).toBe(false);
  expect(latest.draft).toBeUndefined();

  act(() => tree!.update(React.createElement(Harness, { args: baseArgs(cuminRows()) })));
  expect(latest.ready).toBe(true);
  expect(latest.ctx).toMatchObject({ mode: 'change', itemId: 'cumin', itemName: 'Review Cumin Bold', customerId: null, today: TODAY });
  // The rate in force (11, since 1 Apr 2026) is what the draft starts from.
  expect(latest.draft!.priceType).toBe('monthly');
  expect(latest.draft!.bands.map(b => [b.upTo, b.rent])).toEqual([['100', '11.00']]);
  expect(latest.dirty).toBe(false);
  expect(latest.order).toEqual(['band.0.upTo', 'band.0.rent', 'labour', 'tax']);
});

it('is dirty after a setter, and clean again when the value goes back', async () => {
  await mount();
  act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '12')));
  expect(latest.dirty).toBe(true);
  act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '11.00')));
  expect(latest.dirty).toBe(false);
});

it('sends one replace_item_rates call with the draft, then toasts and calls onSaved', async () => {
  await mount();
  act(() => latest.setStartsOn('other', '2027-01-01'));
  act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '12')));
  replace.mockResolvedValueOnce({ success: true });
  await act(async () => { await latest.submit(); });

  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace.mock.calls[0][0]).toEqual({
    mode: 'change',
    seen_rows: expect.any(Array),
    item_id: 'cumin',
    customer_id: null,
    price_type: 'monthly',
    starts_on: '2027-01-01',
    bands: [{ weight_min: 0, weight_max: 100, unit_price: 12, labour_rate: 3, tax_percent: 5 }],
  });
  expect(showToast).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(latest.saving).toBe(false);
});

it('sends nothing and shows the field error when the draft is not valid', async () => {
  await mount();
  act(() => latest.setStartsOn('other', '2027-01-01'));
  act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '')));
  await act(async () => { await latest.submit(); });
  expect(replace).not.toHaveBeenCalled();
  expect(latest.errors['band.0.rent']).toBe('Enter a rent of 0 or more.');
  expect(onSaved).not.toHaveBeenCalled();
});

it('LATER_RATES_EXIST opens the question; Yes sends the same save again with replace_later', async () => {
  await mount();
  act(() => latest.setStartsOn('other', '2027-01-01'));
  act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '12')));
  const later = [{ effective_from: '2027-04-01', weight_min: 0, weight_max: 100, unit_price: 12.5 }];
  replace.mockResolvedValueOnce({ success: false, errorCode: 'LATER_RATES_EXIST', later });
  await act(async () => { await latest.submit(); });
  expect(latest.later).toEqual(later);
  expect(replace.mock.calls[0][0]).not.toHaveProperty('replace_later');
  expect(onSaved).not.toHaveBeenCalled();

  replace.mockResolvedValueOnce({ success: true });
  await act(async () => { await latest.submit(true); });
  expect(replace).toHaveBeenCalledTimes(2);
  expect(replace.mock.calls[1][0]).toEqual({ ...replace.mock.calls[0][0], replace_later: true });
  expect(latest.later).toBeNull();
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it('STALE_RATES shows the message and asks for the rows again; the new rows open a new draft', async () => {
  await mount();
  act(() => latest.setStartsOn('other', '2027-01-01'));
  act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '12')));
  replace.mockResolvedValueOnce({ success: false, errorCode: 'STALE_RATES', message: 'Rates changed.' });
  await act(async () => { await latest.submit(); });
  expect(latest.strip).toBe('Rates changed.');
  expect(refreshRows).toHaveBeenCalledTimes(1);

  act(() => tree!.update(React.createElement(Harness, { args: baseArgs(null) })));
  act(() => tree!.update(React.createElement(Harness, { args: baseArgs(cuminRows()) })));
  expect(latest.ready).toBe(true);
  expect(latest.dirty).toBe(false);
  expect(latest.draft!.bands[0].rent).toBe('11.00');
  // The message is for the new draft: it stays; the field errors of the old one go.
  expect(latest.strip).toBe('Rates changed.');
});

it('a draft opened from new rows has none of the field errors of the last one', async () => {
  await mount();
  act(() => latest.setStartsOn('other', '2027-01-01'));
  act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '')));
  await act(async () => { await latest.submit(); });
  expect(latest.errors['band.0.rent']).toBe('Enter a rent of 0 or more.');
  act(() => tree!.update(React.createElement(Harness, { args: baseArgs(cuminRows()) })));
  expect(latest.errors).toEqual({});
  // And nothing is shown for a field the person has not touched yet: no error appears while typing.
  act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '12')));
  expect(latest.errors).toEqual({});
});

it.each(['BANDS_OVERLAP', 'BANDS_GAP'] as const)('%s puts the message under the bands as well as in the strip', async errorCode => {
  await mount();
  act(() => latest.setStartsOn('other', '2027-01-01'));
  act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '12')));
  replace.mockResolvedValueOnce({ success: false, errorCode, message: 'The bands do not fit.' });
  await act(async () => { await latest.submit(); });
  expect(latest.errors.bands).toBe('The bands do not fit.');
  expect(latest.strip).toBe('The bands do not fit.');
  expect(onSaved).not.toHaveBeenCalled();
});
