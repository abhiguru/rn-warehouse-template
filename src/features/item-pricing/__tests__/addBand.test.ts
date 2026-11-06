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

  it('on a rate older than the earliest day, a planned rate would be deleted by a change from that day: only Today is offered', () => {
    const rows = [row(0, 30, 11.25, 2.5, 5, '2020-01-01'), row(0, 30, 13, 2.5, 5, '2027-01-01')];
    const { draft, context } = open(rows, '2023-11-06');
    expect(context.othersAtRisk).toBe(true);
    expect(context.ownStart).toBeNull();
    expect(draft.startsOnChoice).toBe('today');
    expect(draft.startsOn).toBe(TODAY);
    // Nothing is sent from the earliest day, so there is nothing to block with a message.
    expect(bandBlockedByPlanned(draft, context)).toBeNull();
    const input = toReplaceInput(typed(draft), context);
    expect(input.mode).toBe('change');
    expect(input.starts_on).toBe(TODAY);
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

describe('the default day never deletes a row or drops a stop (WH-74, release review)', () => {
  /** What every save of the form can send: the mode, the day, and the band count. */
  const sends = (rows: ItemStoragePrice[], earliest?: string | null) => {
    const { draft, context } = open(rows, earliest);
    const input = toReplaceInput(typed(draft), context);
    return { context, draft, input };
  };

  it('shape A: an ended band that started the same day (0-30 and 31-50 from 1 Apr, 31-50 ended 30 Jun) offers only Today, sent as a change from today', () => {
    const { context, draft, input } = sends([row(0, 30, 11.25, 2.5, 5, '2026-04-01'), row(31, 50, 12, 2.5, 5, '2026-04-01', '2026-06-30')]);
    // Only 0-30 is in force today, so only it is locked; a correction on 1 Apr would delete the ended 31-50.
    expect(context.lockedRows).toHaveLength(1);
    expect(context.othersAtRisk).toBe(true);
    expect(context.ownStart).toBeNull();
    expect(draft.startsOnChoice).toBe('today');
    expect(input.mode).toBe('change');
    expect(input.starts_on).toBe(TODAY);
  });

  it('shape B: bands in force that stop on different days (31-50 stops 31 Mar 2027, 0-30 open) offer only Today', () => {
    const { context, draft, input } = sends([row(0, 30, 11.25, 2.5, 5, '2026-04-01'), row(31, 50, 12, 2.5, 5, '2026-04-01', '2027-03-31')]);
    expect(context.mixedStarts).toBe(false);
    expect(context.othersAtRisk).toBe(true);
    expect(draft.startsOnChoice).toBe('today');
    expect(input.mode).toBe('change');
  });

  it('a stop that every band in force shares is safe: the correction is sent and keeps the stop', () => {
    const rows = [row(0, 30, 11.25, 2.5, 5, '2026-04-01', '2026-12-31'), row(31, 50, 12, 2.5, 5, '2026-04-01', '2026-12-31')];
    const { context, draft, input } = sends(rows);
    expect(context.othersAtRisk).toBe(false);
    expect(draft.startsOnChoice).toBe('ownStart');
    expect(input.mode).toBe('correct');
    expect(input.starts_on).toBe('2026-04-01');
    expect(toReplaceInput(typed(draft, '80', '14'), context).bands.map(b => [b.weight_min, b.weight_max])).toEqual([[0, 30], [31, 50], [51, 80]]);
  });

  it('rows of another price type or of a customer that start the same day are not touched and do not matter', () => {
    const other = row(0, 30, 40, 0, 0, '2026-04-01', null, 'one_time');
    const customer = { ...row(0, 30, 9, 2.5, 5, '2026-04-01'), customer_id: 'cust-a', customer_name: 'Review Orchard A' };
    const { context, input } = sends([...ownRows(), other, customer]);
    expect(context.othersAtRisk).toBe(false);
    expect(input.mode).toBe('correct');
  });

  it('an earlier ended rate of the scope does not matter', () => {
    const { context } = sends([row(0, 30, 10, 2.5, 5, '2025-01-01', '2026-03-31'), ...ownRows()]);
    expect(context.othersAtRisk).toBe(false);
  });

  it('on a rate older than the earliest day, a row starting after that day or bands with differing stops offer only Today', () => {
    const ended = sends([row(0, 30, 11.25, 2.5, 5, '2020-01-01'), row(31, 50, 12, 2.5, 5, '2024-01-01', '2024-06-30')], '2023-11-06');
    expect(ended.context.othersAtRisk).toBe(true);
    expect(ended.input.mode).toBe('change');
    expect(ended.input.starts_on).toBe(TODAY);
    const stops = sends([row(0, 30, 11.25, 2.5, 5, '2020-01-01'), row(31, 50, 12, 2.5, 5, '2020-01-01', '2027-03-31')], '2023-11-06');
    expect(stops.context.othersAtRisk).toBe(true);
    expect(stops.input.mode).toBe('change');
    expect(stops.input.starts_on).toBe(TODAY);
  });

  it('on a rate older than the earliest day with nothing at risk, the change from that day is still the default', () => {
    const { context, input } = sends([row(0, 30, 11.25, 2.5, 5, '2020-01-01')], '2023-11-06');
    expect(context.othersAtRisk).toBe(false);
    expect(input.mode).toBe('change');
    expect(input.starts_on).toBe('2023-11-06');
  });

  it('whenever the default is withheld, no payload in any of these shapes is a correction', () => {
    const shapes = [
      [row(0, 30, 11.25, 2.5, 5, '2026-04-01'), row(31, 50, 12, 2.5, 5, '2026-04-01', '2026-06-30')],
      [row(0, 30, 11.25, 2.5, 5, '2026-04-01'), row(31, 50, 12, 2.5, 5, '2026-04-01', '2027-03-31')],
      [row(0, 30, 11.25, 2.5, 5, '2026-04-01'), row(31, 50, 12, 2.5, 5, '2026-06-01')],
    ];
    for (const rows of shapes) {
      const { draft, context } = open(rows);
      expect(toReplaceInput(typed(draft, '80', '14'), context).mode).toBe('change');
    }
  });
});

describe('the lots line for the item\'s first rate (WH-74)', () => {
  it('names the earlier days too when no row of the scope starts before the rate\'s own start', () => {
    const { draft, context } = open(ownRows());
    const line = lotsRule(draft, context);
    expect(line).toContain('including those received before 01/04/26');
    expect(line).toContain('this is the item\'s first rate');
    expect(line).toContain('The bands above keep their figures.');
  });

  it('says "received from" when an earlier rate, ended too, exists in the scope', () => {
    const { draft, context } = open([row(0, 30, 10, 2.5, 5, '2025-01-01', '2026-03-31'), ...ownRows()]);
    const line = lotsRule(draft, context);
    expect(line).toContain('received from 01/04/26');
    expect(line).not.toContain('first rate');
  });

  it('an earlier rate of another price type does not make it a later one: still the first rate', () => {
    const { draft, context } = open([row(0, 30, 40, 0, 0, '2024-01-01', null, 'one_time'), ...ownRows()]);
    expect(lotsRule(draft, context)).toContain('first rate');
  });

  it('keeps the earliest-day line when the start moved, and the Today line for Today', () => {
    const old = open([row(0, 30, 11.25, 2.5, 5, '2020-01-01')], '2023-11-06');
    expect(lotsRule(old.draft, old.context)).toContain('began before 06/11/23');
    expect(lotsRule(old.draft, old.context)).not.toContain('first rate');
    const { draft, context } = open(ownRows());
    expect(lotsRule(setStartsOn(draft, 'today', TODAY), context)).toContain('Earlier lots keep the old rent');
  });
});

describe('why only Today is offered: a planned later rate, or another cause (WH-81)', () => {
  it('an old one-band rate with a planned later rate gives "planned" and that rate\'s start', () => {
    const rows = [row(0, 30, 11.25, 2.5, 5, '2020-01-01'), row(0, 30, 13, 2.5, 5, '2027-01-01')];
    const { context } = open(rows, '2023-11-06');
    expect(context.othersAtRisk).toBe(true);
    expect(context.mixedStarts).toBe(false);
    expect(context.todayOnlyReason).toBe('planned');
    expect(context.plannedStart).toBe('2027-01-01');
  });

  it('names the soonest planned rate when two are planned', () => {
    const rows = [row(0, 30, 11.25, 2.5, 5, '2020-01-01'), row(0, 30, 14, 2.5, 5, '2028-01-01'), row(0, 30, 13, 2.5, 5, '2027-01-01')];
    const { context } = open(rows, '2023-11-06');
    expect(context.todayOnlyReason).toBe('planned');
    expect(context.plannedStart).toBe('2027-01-01');
  });

  it('bands that start on different days win over a planned rate: "mixed", with no planned start', () => {
    const rows = [row(0, 30, 11.25, 2.5, 5, '2026-04-01'), row(31, 50, 12, 2.5, 5, '2026-06-01'), row(0, 30, 13, 2.5, 5, '2027-01-01')];
    const { context } = open(rows);
    expect(context.mixedStarts).toBe(true);
    expect(context.todayOnlyReason).toBe('mixed');
    expect(context.plannedStart).toBeNull();
  });

  it('a planned rate beside another cause is "mixed": an ended band the default day would also delete', () => {
    const rows = [
      row(0, 30, 11.25, 2.5, 5, '2020-01-01'),
      row(31, 50, 12, 2.5, 5, '2024-01-01', '2024-06-30'),
      row(0, 30, 13, 2.5, 5, '2027-01-01'),
    ];
    const { context } = open(rows, '2023-11-06');
    expect(context.othersAtRisk).toBe(true);
    expect(context.todayOnlyReason).toBe('mixed');
    expect(context.plannedStart).toBeNull();
  });

  it('a cause with nothing planned is "mixed": an ended band that started the same day', () => {
    const { context } = open([row(0, 30, 11.25, 2.5, 5, '2026-04-01'), row(31, 50, 12, 2.5, 5, '2026-04-01', '2026-06-30')]);
    expect(context.othersAtRisk).toBe(true);
    expect(context.todayOnlyReason).toBe('mixed');
    expect(context.plannedStart).toBeNull();
  });

  it('with the default day safe there is no reason and no planned start', () => {
    const { context } = open(ownRows());
    expect(context.othersAtRisk).toBe(false);
    expect(context.todayOnlyReason).toBeNull();
    expect(context.plannedStart).toBeNull();
  });
});
