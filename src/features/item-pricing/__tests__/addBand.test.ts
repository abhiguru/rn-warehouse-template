/**
 * "Add rate" on a rate in force adds the next weight band (WH-74, spec add-rate-next-band-change-rate):
 * the draft it opens with, what a save sends (`correct` on the rate's own start, or `change` from Today or from the
 * server's earliest day), the earliest-day cases, a planned later rate, and when there is something to save.
 */
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import {
  appendEmptyBand,
  bandBlockedByPlanned,
  bandPlannedNote,
  fieldOrder,
  hasChanges,
  initialDraft,
  lotsRule,
  ownStartDay,
  removeBand,
  setStartsOn,
  startMoved,
  toReplaceInput,
  validate,
  type Draft,
} from '../editModel';

const TODAY = '2026-11-05';
const AMBALI = 'item-ambali';

let seq = 0;
const row = (min: number, max: number, rent: number, labour: number, tax: number, from: string, to: string | null = null, price_type: PriceType = 'monthly'): ItemStoragePrice => ({
  id: `row-${(seq += 1)}`,
  item_id: AMBALI,
  item_name: 'Review Ambali',
  customer_id: null,
  customer_name: null,
  price_type,
  unit_price: rent,
  weight_min: min,
  weight_max: max,
  labour_rate: labour,
  tax_percent: tax,
  effective_from: from,
  effective_to: to,
  created_at: '',
  created_by: '',
});

/** Ambali: 0-30 at 11.25, labour 2.50, tax 5, since 1 April. */
const ownRows = () => [row(0, 30, 11.25, 2.5, 5, '2026-04-01')];

const open = (rows: ItemStoragePrice[], earliest?: string | null, role = 'admin', priceType: PriceType = 'monthly') =>
  initialDraft({ mode: 'addBand', params: { mode: 'addBand', item_id: AMBALI, price_type: priceType } as never, rows, role, today: TODAY, earliest });

/** What the person types into the new band. */
const typed = (draft: Draft, upTo = '50', rent = '12'): Draft => ({
  ...draft,
  bands: draft.bands.map((band, i) => (i === draft.bands.length - 1 ? { ...band, upTo, rent } : band)),
});

describe('what Add rate opens with on 0-30 (criterion 2)', () => {
  it('Band 1 is the rate\'s own and locked, Band 2 is new with no figures but labour and tax of Band 1', () => {
    const { draft, context } = open(ownRows());
    expect(context.mode).toBe('addBand');
    expect(draft.locked).toBe(1);
    expect(draft.bands).toHaveLength(2);
    expect(draft.bands[0]).toMatchObject({ upTo: '30', rent: '11.25', labour: '2.50', tax: '5' });
    expect(draft.bands[1]).toEqual({ upTo: '', rent: '', labour: '2.50', tax: '5' });
    expect(draft.firstFrom).toBe(0);
    expect(draft.startsOnChoice).toBe('ownStart');
    expect(draft.startsOn).toBe('2026-04-01');
  });

  it('the new band starts at 31: 30 kg belongs to 0-30', () => {
    const { draft, context } = open(ownRows());
    expect(toReplaceInput(typed(draft), context).bands[1].weight_min).toBe(31);
  });

  it('opens with no messages: only the empty Up to and rent of the new band are missing, and Save shows them', () => {
    const { draft, context } = open(ownRows());
    expect(Object.keys(validate(draft, context).errors).sort()).toEqual(['band.1.rent', 'band.1.upTo']);
  });

  it('the locked band has no field in the walk of the Next key, and cannot be removed', () => {
    const { draft } = open(ownRows());
    expect(fieldOrder(draft, null).some(key => key.startsWith('band.0.'))).toBe(false);
    expect(fieldOrder(draft, null).some(key => key.startsWith('band.1.'))).toBe(true);
    expect(removeBand(draft, 0)).toBe(draft);
  });

  it('removing the last new band leaves only the rate\'s own bands', () => {
    const { draft } = open(ownRows());
    const removed = removeBand(typed(draft), 1);
    expect(removed.bands).toHaveLength(1);
    expect(removed.locked).toBe(1);
  });

  it('a further band takes its labour and tax from the band before it, the rate\'s own bands stay as loaded', () => {
    const { draft } = open(ownRows());
    const filled = typed(draft, '50', '12');
    const withTax = { ...filled, bands: filled.bands.map((band, i) => (i === 1 ? { ...band, labour: '3.00', tax: '12' } : band)) };
    const more = appendEmptyBand(withTax);
    expect(more.bands).toHaveLength(3);
    expect(more.bands[2]).toEqual({ upTo: '', rent: '', labour: '3.00', tax: '12' });
    expect(more.bands[0]).toEqual(draft.bands[0]);
  });

  it('works the same on a one-time rate (labour is sent as 0)', () => {
    const rows = [row(0, 30, 40, 0, 0, '2026-04-01', null, 'one_time')];
    const { draft, context } = open(rows, undefined, 'admin', 'one_time');
    expect(draft.priceType).toBe('one_time');
    const input = toReplaceInput(typed(draft, '50', '45'), context);
    expect(input.price_type).toBe('one_time');
    expect(input.bands.map(b => b.labour_rate)).toEqual([0, 0]);
  });
});

describe('what a save sends (criteria 3 and 5)', () => {
  it('the rate\'s own start (default): correct on that day, all bands, seen_rows set, the locked band exactly as loaded', () => {
    const rows = ownRows();
    const { draft, context } = open(rows);
    expect(toReplaceInput(typed(draft), context)).toEqual({
      mode: 'correct',
      item_id: AMBALI,
      customer_id: null,
      price_type: 'monthly',
      starts_on: '2026-04-01',
      seen_rows: [rows[0].id],
      bands: [
        { weight_min: 0, weight_max: 30, unit_price: 11.25, labour_rate: 2.5, tax_percent: 5 },
        { weight_min: 31, weight_max: 50, unit_price: 12, labour_rate: 2.5, tax_percent: 5 },
      ],
    });
  });

  it('the new band\'s labour and tax typed in its own boxes are what is sent', () => {
    const { draft, context } = open(ownRows());
    const filled = typed(draft);
    const own = { ...filled, bands: filled.bands.map((band, i) => (i === 1 ? { ...band, labour: '3', tax: '12' } : band)) };
    expect(toReplaceInput(own, context).bands[1]).toEqual({ weight_min: 31, weight_max: 50, unit_price: 12, labour_rate: 3, tax_percent: 12 });
  });

  it('Today: a change from today, both bands start today, the locked band still exactly as loaded', () => {
    const rows = ownRows();
    const { draft, context } = open(rows);
    const input = toReplaceInput(setStartsOn(typed(draft), 'today', TODAY), context);
    expect(input.mode).toBe('change');
    expect(input.starts_on).toBe(TODAY);
    expect(input.seen_rows).toEqual([rows[0].id]);
    expect(input.bands).toEqual([
      { weight_min: 0, weight_max: 30, unit_price: 11.25, labour_rate: 2.5, tax_percent: 5 },
      { weight_min: 31, weight_max: 50, unit_price: 12, labour_rate: 2.5, tax_percent: 5 },
    ]);
  });

  it('does not round or read the locked figures from the text shown', () => {
    const rows = [row(0, 30, 11.255, 2.5, 5.5, '2026-04-01')];
    const { draft, context } = open(rows);
    expect(toReplaceInput(typed(draft), context).bands[0]).toEqual({ weight_min: 0, weight_max: 30, unit_price: 11.255, labour_rate: 2.5, tax_percent: 5.5 });
  });

  it('an Up to at or below the end of Band 1, or a missing rent, is refused as in any rate', () => {
    const { draft, context } = open(ownRows());
    expect(validate(typed(draft, '30', '12'), context).errors['band.1.upTo']).toBeTruthy();
    expect(validate(typed(draft, '50', ''), context).errors['band.1.rent']).toBeTruthy();
    expect(validate(typed(draft, '50', '12'), context).errors).toEqual({});
  });
});

describe('when there is something to save (hasChanges)', () => {
  it('is false on opening and when only the day is chosen', () => {
    const { draft } = open(ownRows());
    expect(hasChanges(draft, draft)).toBe(false);
    expect(hasChanges(setStartsOn(draft, 'today', TODAY), draft)).toBe(false);
  });

  it('is true once something is typed in the new band', () => {
    const { draft } = open(ownRows());
    expect(hasChanges(typed(draft, '50', ''), draft)).toBe(true);
    expect(hasChanges(typed(draft, '', '12'), draft)).toBe(true);
  });

  it('is true with a further band added, and false again after removing every new band', () => {
    const { draft } = open(ownRows());
    const more = appendEmptyBand(typed(draft));
    expect(hasChanges(more, draft)).toBe(true);
    expect(hasChanges(removeBand(removeBand(more, 2), 1), draft)).toBe(false);
  });
});

describe('a rate that began before the earliest day the server accepts', () => {
  const OLD = '2020-01-01';
  const rows = () => [row(0, 30, 11.25, 2.5, 5, OLD)];

  it('floor known: the default day is that earliest day and the save is a change from it', () => {
    const { draft, context } = open(rows(), '2023-11-06');
    expect(startMoved(context)).toBe(true);
    expect(ownStartDay(context)).toBe('2023-11-06');
    expect(draft.startsOn).toBe('2023-11-06');
    const input = toReplaceInput(typed(draft), context);
    expect(input.mode).toBe('change');
    expect(input.starts_on).toBe('2023-11-06');
    expect(input.bands[0]).toEqual({ weight_min: 0, weight_max: 30, unit_price: 11.25, labour_rate: 2.5, tax_percent: 5 });
    expect(validate(typed(draft), context).errors.startsOn).toBeUndefined();
  });

  it('floor unknown: the default is the rate\'s own start, sent as correct (the first refusal tells the day)', () => {
    const { draft, context } = open(rows(), null);
    expect(startMoved(context)).toBe(false);
    expect(draft.startsOn).toBe(OLD);
    const input = toReplaceInput(typed(draft), context);
    expect(input.mode).toBe('correct');
    expect(input.starts_on).toBe(OLD);
    expect(validate(typed(draft), context).errors.startsOn).toBeUndefined();
  });

  it('a rate that began after the earliest day is not moved', () => {
    const { context } = open(ownRows(), '2023-11-06');
    expect(startMoved(context)).toBe(false);
  });

  it('says the lots rule for the earliest day, and the one for Today', () => {
    const { draft, context } = open(rows(), '2023-11-06');
    expect(lotsRule(draft, context)).toContain('06/11/23');
    expect(lotsRule(setStartsOn(draft, 'today', TODAY), context)).toContain('Earlier lots keep the old rent and have no rate for the new weights');
  });
});

describe('a planned later rate (criterion 9)', () => {
  const planned = () => [row(0, 30, 11.25, 2.5, 5, '2026-04-01'), row(0, 30, 13, 2.5, 5, '2027-01-01')];

  it('is not part of the rate in force: only the rate in force is locked', () => {
    const { draft, context } = open(planned());
    expect(draft.locked).toBe(1);
    expect(context.lockedRows).toHaveLength(1);
    expect(context.lockedRows?.[0].effective_from).toBe('2026-04-01');
  });

  it('with the rate\'s own start the form says the band is not added to the planned rate; the save is still a correction of the rate in force', () => {
    const { draft, context } = open(planned());
    expect(bandPlannedNote(draft, context)).toContain('01/01/27');
    const input = toReplaceInput(typed(draft), context);
    expect(input.mode).toBe('correct');
    expect(input.starts_on).toBe('2026-04-01');
  });

  it('shows no note with Today, nor when nothing is planned', () => {
    const { draft, context } = open(planned());
    expect(bandPlannedNote(setStartsOn(draft, 'today', TODAY), context)).toBeNull();
    const none = open(ownRows());
    expect(bandPlannedNote(none.draft, none.context)).toBeNull();
  });

  it('on a rate older than the earliest day, the default choice cannot save while a rate is planned, and says so', () => {
    const rows = [row(0, 30, 11.25, 2.5, 5, '2020-01-01'), row(0, 30, 13, 2.5, 5, '2027-01-01')];
    const { draft, context } = open(rows, '2023-11-06');
    const message = bandBlockedByPlanned(draft, context);
    expect(message).toContain('01/01/27');
    expect(message).toContain('06/11/23');
    expect(bandBlockedByPlanned(setStartsOn(draft, 'today', TODAY), context)).toBeNull();
  });

  it('learns the earliest day from the server\'s refusal when it was not known', () => {
    const rows = [row(0, 30, 11.25, 2.5, 5, '2020-01-01'), row(0, 30, 13, 2.5, 5, '2027-01-01')];
    const { draft, context } = open(rows, null);
    expect(bandBlockedByPlanned(draft, context)).toBeNull();
    expect(bandBlockedByPlanned(draft, context, '2023-11-06')).toContain('06/11/23');
  });

  it('is not blocked when nothing is planned', () => {
    const { draft, context } = open([row(0, 30, 11.25, 2.5, 5, '2020-01-01')], '2023-11-06');
    expect(bandBlockedByPlanned(draft, context)).toBeNull();
  });
});

describe('a rate whose bands do not share one start day', () => {
  const mixed = () => [row(0, 30, 11.25, 2.5, 5, '2026-04-01'), row(31, 50, 12, 2.5, 5, '2026-06-01')];

  it('has no start of its own: it opens on Today, and the save is a change from today', () => {
    const { draft, context } = open(mixed());
    expect(context.mixedStarts).toBe(true);
    expect(context.ownStart).toBeNull();
    expect(draft.startsOnChoice).toBe('today');
    expect(draft.startsOn).toBe(TODAY);
    const input = toReplaceInput(typed(draft, '80', '14'), context);
    expect(input.mode).toBe('change');
    expect(input.starts_on).toBe(TODAY);
    expect(input.bands.map(b => [b.weight_min, b.weight_max])).toEqual([[0, 30], [31, 50], [51, 80]]);
  });
});

describe('with no rate in force', () => {
  it('Add rate opens as it always did: the form for a new rate, nothing locked', () => {
    const { draft, context } = open([row(0, 30, 11.25, 2.5, 5, '2020-01-01', '2021-01-01')]);
    expect(context.mode).toBe('add');
    expect(draft.locked).toBeUndefined();
  });
});
