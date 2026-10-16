/**
 * useRateEditor: opening a draft from the item's rows, what counts as a change, the payload of the save, the
 * LATER_RATES_EXIST question and every refusal of the server. It serves the rate boxes (every mode) and the edit
 * screen of the invoice pencil; the modes that only the boxes use (change, add, correct, upcoming, add_band, copy
 * bands, the start-day floor) are tested here, the screens have their own tests.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { replaceItemRates } from '@/services/item-pricing-service';
import { clearRateStartFloor, rememberRateStartFloor } from '@/services/rateStartFloor';
import { showToast } from '@/utils/toast';
import { removeBand, setBandField } from '../editModel';
import { laterDialogText } from '../laterRates';
import { useRateEditor, type UseRateEditor, type UseRateEditorArgs } from '../useRateEditor';
import { cuminRows, garlicRows, gingerRows, rate } from '@/tests/helpers/rateEditorFixtures';

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
  clearRateStartFloor();
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

// ---- the modes only the rate boxes use ----

/** Mount with other arguments than the default Cumin change; the rows array must stay the same between renders. */
async function mountWith(over: Partial<UseRateEditorArgs>) {
  const args = { ...baseArgs(over.rows === undefined ? cuminRows() : over.rows), ...over };
  await act(async () => { tree = create(React.createElement(Harness, { args })); });
  return args;
}
const GARLIC = garlicRows();

describe('add_band (the "+" of the Item pricing list)', () => {
  const garlic = { item: { id: 'garlic', name: 'Review Garlic Desi' }, rows: GARLIC, params: { add_band: '1' as const } };

  it("opens with the item's bands plus one empty band after the last, and counts as changed", async () => {
    await mountWith(garlic);
    expect(latest.draft!.bands.map(b => b.upTo)).toEqual(['40', '100', '']);
    expect(latest.initial!.bands.map(b => b.upTo)).toEqual(['40', '100']);
    expect(latest.dirty).toBe(true);
  });

  it('without the param the item opens as stored and is not changed', async () => {
    await mountWith({ item: garlic.item, rows: GARLIC });
    expect(latest.draft!.bands.map(b => b.upTo)).toEqual(['40', '100']);
    expect(latest.dirty).toBe(false);
  });

  it('removing the empty band that was added ends where it began', async () => {
    await mountWith(garlic);
    act(() => latest.setDraft(removeBand(latest.draft!, 2)));
    expect(latest.draft!.bands.map(b => b.upTo)).toEqual(['40', '100']);
    expect(latest.dirty).toBe(false);
  });
});

describe('copying the bands of another item into a new rate', () => {
  const NEW_ITEM = { item: { id: 'new-item', name: 'Review Onion Red Small' }, mode: 'add' as const, priceType: undefined };
  const NONE: never[] = [];

  it('replaces the bands with the ones chosen, names the item, counts as changed and keeps the start day', async () => {
    await mountWith({ ...NEW_ITEM, rows: NONE });
    act(() => latest.setStartsOn('today', TODAY));
    act(() => latest.copyFrom({ id: 'garlic', name: 'Review Garlic Desi' }, GARLIC));
    expect(latest.draft!.bands.map(b => [b.upTo, b.rent])).toEqual([['40', '6.00'], ['100', '9.50']]);
    expect(latest.copiedFrom).toBe('Review Garlic Desi');
    expect(latest.dirty).toBe(true);
    // Another copy keeps the day the person chose.
    act(() => latest.copyFrom({ id: 'ginger', name: 'Review Ginger Fresh' }, gingerRows()));
    expect([latest.draft!.startsOn, latest.draft!.startsOnChoice]).toEqual([TODAY, 'today']);
    expect(latest.draft!.bands.map(b => b.upTo)).toEqual(['100']);
    expect(latest.copiedFrom).toBe('Review Ginger Fresh');
  });

  it('switching from Monthly to One-time after copying clears the copied monthly rents and the note', async () => {
    await mountWith({ ...NEW_ITEM, rows: NONE });
    act(() => latest.copyFrom({ id: 'garlic', name: 'Review Garlic Desi' }, GARLIC));
    expect(latest.ctx!.priceTypeChoosable).toBe(true);
    act(() => latest.switchType('one_time'));
    expect(latest.draft!.priceType).toBe('one_time');
    expect(latest.draft!.bands.map(b => [b.upTo, b.rent])).toEqual([['40', ''], ['100', '']]);
    expect(latest.copiedFrom).toBeNull();
  });

  it('a reload after STALE_RATES drops the "copied from" note', async () => {
    await mountWith({ ...NEW_ITEM, rows: NONE });
    act(() => latest.setStartsOn('today', TODAY));
    act(() => latest.copyFrom({ id: 'garlic', name: 'Review Garlic Desi' }, GARLIC));
    act(() => latest.setDraft({ ...latest.draft!, labour: '1', tax: '5' }));
    replace.mockResolvedValueOnce({ success: false, errorCode: 'STALE_RATES', message: 'Rates changed.' });
    await act(async () => { await latest.submit(); });
    expect(replace).toHaveBeenCalledTimes(1);
    act(() => tree!.update(React.createElement(Harness, { args: { ...baseArgs([]), ...NEW_ITEM } })));
    expect(latest.copiedFrom).toBeNull();
  });
});

describe('a one-time rate beside a monthly one', () => {
  const ginger = { item: { id: 'ginger', name: 'Review Ginger Fresh' }, mode: 'add' as const, priceType: 'one_time' as const };
  const GINGER = gingerRows();

  it('has no labour of its own, an empty rent and the tax of the monthly rate; the type is fixed', async () => {
    await mountWith({ ...ginger, rows: GINGER });
    expect(latest.draft!.priceType).toBe('one_time');
    expect(latest.ctx!.priceTypeChoosable).toBe(false);
    expect(latest.draft!.bands.map(b => b.rent)).toEqual(['']);
    expect(latest.draft!.tax).toBe('5');
    expect(latest.order).not.toContain('labour');
  });

  it('saves with labour 0 and the one-time price type', async () => {
    await mountWith({ ...ginger, rows: GINGER });
    act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '20')));
    replace.mockResolvedValueOnce({ success: true });
    await act(async () => { await latest.submit(); });
    expect(replace).toHaveBeenCalledWith({
      mode: 'change',
      item_id: 'ginger',
      customer_id: null,
      price_type: 'one_time',
      starts_on: TODAY,
      seen_rows: expect.any(Array),
      bands: [{ weight_min: 0, weight_max: 100, unit_price: 20, labour_rate: 0, tax_percent: 5 }],
    });
  });

  it('an item with no rate: a labour of 3 typed under Monthly and then One-time still sends labour 0', async () => {
    await mountWith({ item: { id: 'fresh', name: 'Review Potato Seed' }, mode: 'add', priceType: undefined, rows: [] });
    act(() => latest.setDraft({ ...setBandField(latest.draft!, 0, 'rent', '4'), labour: '3', tax: '5' }));
    act(() => latest.switchType('one_time'));
    expect(latest.draft!.bands[0].rent).toBe('4');
    replace.mockResolvedValueOnce({ success: true });
    await act(async () => { await latest.submit(); });
    expect(replace.mock.calls[0][0].bands[0]).toMatchObject({ labour_rate: 0, unit_price: 4, tax_percent: 5 });
    expect(replace.mock.calls[0][0].price_type).toBe('one_time');
  });
});

describe('correcting a rate in force', () => {
  const correct = { mode: 'correct' as const, params: { starts_on: '2026-04-01' } };

  it("saves from the rate's own start day as a correction, toasts it and no later question can follow", async () => {
    await mountWith(correct);
    expect(latest.draft!.startsOn).toBe('2026-04-01');
    expect(latest.draft!.startsOnChoice).toBe('fixed');
    act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '11.50')));
    replace.mockResolvedValueOnce({ success: true });
    await act(async () => { await latest.submit(); });
    expect(replace.mock.calls[0][0]).toMatchObject({ mode: 'correct', starts_on: '2026-04-01' });
    expect(showToast).toHaveBeenCalledWith('Correction saved.');
    expect(latest.later).toBeNull();
  });

  it('the toast says the rate still stops when the server kept the stop', async () => {
    const stopping = [rate('cumin', null, 0, 100, 11, 3, 5, '2026-04-01', '2027-03-31', 'monthly', 'Review Cumin Bold')];
    await mountWith({ ...correct, rows: stopping });
    act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '11.50')));
    replace.mockResolvedValueOnce({ success: true, keptEnd: '2027-03-31' });
    await act(async () => { await latest.submit(); });
    expect(showToast).toHaveBeenCalledWith('Correction saved. This rate still stops after 31 Mar 2027.');
  });
});

describe('editing a planned rate', () => {
  const planned = [...cuminRows(), rate('cumin', null, 0, 100, 12, 3, 5, '2027-01-01', null, 'monthly', 'Review Cumin Bold')];
  const upcoming = { mode: 'upcoming' as const, rows: planned, params: { starts_on: '2027-01-01' } };

  it('opens on the planned rate with its day as Other date', async () => {
    await mountWith(upcoming);
    expect([latest.draft!.startsOn, latest.draft!.startsOnChoice]).toEqual(['2027-01-01', 'other']);
    expect(latest.draft!.bands[0].rent).toBe('12.00');
    expect(latest.ctx!.plannedGone).toBe(false);
  });

  it('a moved day sends change with move_from; the same day sends correct', async () => {
    await mountWith(upcoming);
    act(() => latest.setStartsOn('other', '2027-02-01'));
    replace.mockResolvedValueOnce({ success: true });
    await act(async () => { await latest.submit(); });
    expect(replace.mock.calls[0][0]).toMatchObject({ mode: 'change', move_from: '2027-01-01', starts_on: '2027-02-01' });

    act(() => tree!.update(React.createElement(Harness, { args: { ...baseArgs(planned), ...upcoming, rows: [...planned] } })));
    act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '12.50')));
    replace.mockResolvedValueOnce({ success: true });
    await act(async () => { await latest.submit(); });
    expect(replace.mock.calls[1][0]).toMatchObject({ mode: 'correct', starts_on: '2027-01-01' });
  });
});

describe('the refusals that name a field', () => {
  const garlic = { item: { id: 'garlic', name: 'Review Garlic Desi' }, rows: GARLIC };
  const ready = async (over: Partial<UseRateEditorArgs> = {}) => {
    await mountWith({ ...garlic, ...over });
    act(() => latest.setStartsOn('other', '2027-01-01'));
  };

  it('INVALID_BAND for band 2 is for the "Up to" of that band only', async () => {
    await ready();
    replace.mockResolvedValueOnce({ success: false, errorCode: 'INVALID_BAND', bandIndex: 1, message: 'Enter whole kilograms, for example 40.' });
    await act(async () => { await latest.submit(); });
    expect(latest.errors['band.1.upTo']).toBe('Enter whole kilograms, for example 40.');
    expect(latest.errors['band.0.upTo']).toBeUndefined();
  });

  it('INVALID_AMOUNT on the rent of band 1 is for that rent', async () => {
    await ready();
    replace.mockResolvedValueOnce({ success: false, errorCode: 'INVALID_AMOUNT', bandIndex: 0, field: 'unit_price', message: 'Check the rent, labour and tax amounts.' });
    await act(async () => { await latest.submit(); });
    expect(latest.errors['band.0.rent']).toBe('Check the rent, labour and tax amounts.');
  });

  it('any other refusal is a strip at the top and keeps what was typed', async () => {
    await mountWith({});
    act(() => latest.setStartsOn('other', '2026-10-01'));
    act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '12')));
    replace.mockResolvedValueOnce({ success: false, errorCode: 'PAST_DATE_NOT_ALLOWED', message: 'Only an administrator or supervisor can start a rate in the past.' });
    await act(async () => { await latest.submit(); });
    expect(latest.strip).toBe('Only an administrator or supervisor can start a rate in the past.');
    expect(latest.draft!.bands[0].rent).toBe('12');
    expect(showToast).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('typing again clears the strip', async () => {
    await ready();
    replace.mockResolvedValueOnce({ success: false, errorCode: 'SERVER', message: 'The server is busy.' });
    await act(async () => { await latest.submit(); });
    expect(latest.strip).toBe('The server is busy.');
    act(() => latest.setDraft(setBandField(latest.draft!, 0, 'rent', '7')));
    expect(latest.strip).toBeNull();
  });
});

describe('the earliest day a rate may start (the day of the oldest GRN)', () => {
  it('a day before it is refused at the field, naming the date, and nothing is sent', async () => {
    rememberRateStartFloor('2022-01-01');
    await mount();
    act(() => latest.setStartsOn('other', '2021-12-31'));
    await act(async () => { await latest.submit(); });
    expect(replace).not.toHaveBeenCalled();
    expect(latest.errors.startsOn).toBe('Choose a start date on or after 1 Jan 2022.');
  });

  it('the oldest GRN day itself is accepted', async () => {
    rememberRateStartFloor('2022-01-01');
    await mount();
    act(() => latest.setStartsOn('other', '2022-01-01'));
    replace.mockResolvedValueOnce({ success: true });
    await act(async () => { await latest.submit(); });
    expect(replace).toHaveBeenCalledWith(expect.objectContaining({ starts_on: '2022-01-01' }));
  });

  it("the server's INVALID_DATE shows the same text at the field and moves the floor", async () => {
    await mount();
    act(() => latest.setStartsOn('other', '2026-11-01'));
    replace.mockResolvedValueOnce({ success: false, errorCode: 'INVALID_DATE', earliest: '2026-11-02', message: 'Choose a start date on or after 2 Nov 2026.' });
    await act(async () => { await latest.submit(); });
    expect(latest.errors.startsOn).toBe('Choose a start date on or after 2 Nov 2026.');
    expect(latest.earliest).toBe('2026-11-02');
    // The rest of the form is still there.
    expect(latest.draft!.bands[0].rent).toBe('11.00');
  });
});

it('LATER_RATES_EXIST names the later rate as the one in force today when it is', async () => {
  await mount();
  act(() => latest.setStartsOn('other', '2027-01-01'));
  replace.mockResolvedValueOnce({
    success: false,
    errorCode: 'LATER_RATES_EXIST',
    later: [{ effective_from: '2026-04-01', weight_min: 0, weight_max: 100, unit_price: 11 }],
  });
  await act(async () => { await latest.submit(); });
  expect(latest.later).toHaveLength(1);
  expect(laterDialogText(latest.later!, '2027-01-01', TODAY).message).toBe(
    'A rate from 1 Apr 2026 (₹11.00) comes after this date. Saving removes it. It is the rate in force today.',
  );
});

it('"Keep it" closes the question and sends nothing more', async () => {
  await mount();
  act(() => latest.setStartsOn('other', '2027-01-01'));
  replace.mockResolvedValueOnce({
    success: false,
    errorCode: 'LATER_RATES_EXIST',
    later: [{ effective_from: '2027-04-01', weight_min: 0, weight_max: 100, unit_price: 12.5 }],
  });
  await act(async () => { await latest.submit(); });
  act(() => latest.dismissLater());
  expect(latest.later).toBeNull();
  expect(replace).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();
});

it('the hook uses no other service call to write (create, update or delete)', () => {
  expect(Object.keys(jest.requireMock('@/services/item-pricing-service'))).toEqual(['replaceItemRates', 'listItemRates']);
});
