type Slice = typeof import('../dispatchFormSlice');

describe('dispatch form default date', () => {
  afterEach(() => jest.useRealTimers());

  it('is the day the form is reset, not the day the app was started', () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 9, 18, 0, 0) });
    let slice!: Slice;
    jest.isolateModules(() => {
      slice = require('../dispatchFormSlice');
    });
    // 01:30 in the night: as an instant this is still 9 Oct in UTC for a phone in India.
    jest.setSystemTime(new Date(2026, 9, 10, 1, 30, 0));
    // A plain calendar day, as the date picker gives: the server takes the day from the text.
    const today = '2026-10-10';

    expect(slice.default(undefined, slice.resetForm()).header.disp_date).toBe(today);
    expect(slice.default(undefined, slice.resetFormData()).header.disp_date).toBe(today);
    expect(
      slice.default(undefined, slice.loadFromOrder({ header: {}, items: [], source_order_id: 'o1' })).header.disp_date
    ).toBe(today);
  });
});

describe('what a form is, apart from its data', () => {
  const load = () => require('../dispatchFormSlice') as Slice;

  it('follows the clock until the person picks a date', () => {
    const slice = load();
    let state = slice.default(undefined, slice.resetForm());
    expect(state.dateChosenByUser).toBe(false);

    // The form is older than today: a new day opens it on that day.
    state = slice.default(state, slice.refreshDefaultDate('2031-01-02'));
    expect(state.header.disp_date).toBe('2031-01-02');

    // The person picks a day: the form keeps it, whatever the clock says.
    state = slice.default(state, slice.updateHeader({ disp_date: '2031-01-01' }));
    expect(state.dateChosenByUser).toBe(true);
    state = slice.default(state, slice.refreshDefaultDate('2031-01-03'));
    expect(state.header.disp_date).toBe('2031-01-01');

    // A header update that does not touch the date is not a choice of one.
    const other = slice.default(slice.default(undefined, slice.resetForm()), slice.updateHeader({ note: 'Fictional note' }));
    expect(other.dateChosenByUser).toBe(false);
  });

  it('remembers that the person typed the number, and forgets it with the form', () => {
    const slice = load();
    let state = slice.default(undefined, slice.resetForm());
    state = slice.default(state, slice.updateHeader({ disp_no: 'D0001' }));
    expect(state.dispNoTyped).toBe(false);
    state = slice.default(state, slice.markDispNoTyped());
    expect(state.dispNoTyped).toBe(true);
    expect(slice.default(state, slice.resetForm()).dispNoTyped).toBe(false);
    expect(slice.default(state, slice.resetFormData()).dispNoTyped).toBe(false);
  });

  it('keeps one nonce for a form, drops it when the form has made its dispatch, and starts none for a new form', () => {
    const slice = load();
    let state = slice.default(undefined, slice.resetForm());
    expect(state.submissionNonce).toBeNull();
    state = slice.default(state, slice.setSubmissionNonce('nonce-1'));
    expect(state.submissionNonce).toBe('nonce-1');

    state = slice.default(state, slice.formCreated('dispatch-1'));
    expect(state.savedDispatchId).toBe('dispatch-1');
    expect(state.submissionNonce).toBeNull();

    expect(slice.default(state, slice.resetForm()).savedDispatchId).toBeNull();
    expect(slice.default(state, slice.resetFormData()).savedDispatchId).toBeNull();
    expect(slice.default(state, slice.loadFromOrder({ header: {}, items: [], source_order_id: 'o1' })).savedDispatchId).toBeNull();
  });

  it('an order opens a form on today, not on a date a form before it was given', () => {
    const slice = load();
    let state = slice.default(undefined, slice.resetForm());
    state = slice.default(state, slice.updateHeader({ disp_date: '2020-01-01' }));
    state = slice.default(state, slice.loadFromOrder({ header: {}, items: [], source_order_id: 'o1' }));
    expect(state.dateChosenByUser).toBe(false);
    expect(state.header.disp_date).not.toBe('2020-01-01');
  });
});

describe('the bags a saved dispatch held per lot (review 2026-10-20, A11)', () => {
  const load = () => require('../dispatchFormSlice') as Slice;
  const line = (unique_id: string, grnItems_id: string, disp_quantity: number, original_disp_quantity?: number) =>
    ({ unique_id, grnItems_id, disp_quantity, original_disp_quantity }) as never;

  it('are filled when the dispatch is loaded, per lot', () => {
    const slice = load();
    const state = slice.default(
      undefined,
      slice.loadDispatchData({
        dispatchId: 'd1',
        header: {} as never,
        items: [line('a', 'lot-1', 10, 10), line('b', 'lot-2', 4, 4)],
      })
    );
    expect(state.heldBags).toEqual({ 'lot-1': 10, 'lot-2': 4 });
  });

  it('are not changed by editing the lines: a line moved to another lot, or removed, leaves them as they were read', () => {
    const slice = load();
    let state = slice.default(
      undefined,
      slice.loadDispatchData({ dispatchId: 'd1', header: {} as never, items: [line('a', 'lot-1', 10, 10)] })
    );

    state = slice.default(state, slice.updateItem({ uniqueId: 'a', updates: { grnItems_id: 'lot-2', disp_quantity: 3, original_disp_quantity: 0 } }));
    expect(state.heldBags).toEqual({ 'lot-1': 10 });

    state = slice.default(state, slice.removeItem('a'));
    expect(state.heldBags).toEqual({ 'lot-1': 10 });
  });

  it('are forgotten with the form', () => {
    const slice = load();
    const loaded = slice.default(
      undefined,
      slice.loadDispatchData({ dispatchId: 'd1', header: {} as never, items: [line('a', 'lot-1', 10, 10)] })
    );
    expect(slice.default(loaded, slice.resetForm()).heldBags).toEqual({});
    expect(slice.default(loaded, slice.resetFormData()).heldBags).toEqual({});
    expect(slice.default(loaded, slice.loadFromOrder({ header: {}, items: [], source_order_id: 'o1' })).heldBags).toEqual({});
  });
});

describe('a form that is asking the server what became of a request (owner rule D22)', () => {
  const load = () => require('../dispatchFormSlice') as Slice;

  it('is locked until the answer is known, and not by a reset form', () => {
    const slice = load();
    let state = slice.default(undefined, slice.resetForm());
    expect(state.checkingAnswer).toBe(false);

    state = slice.default(state, slice.setCheckingAnswer(true));
    expect(state.checkingAnswer).toBe(true);
    expect(slice.selectDispatchCheckingAnswer({ dispatchForm: state })).toBe(true);

    expect(slice.default(state, slice.setCheckingAnswer(false)).checkingAnswer).toBe(false);
    expect(slice.default(state, slice.resetForm()).checkingAnswer).toBe(false);
  });
});

// WH-264: an edited dispatch is "changed" when what a save would send differs from the form as it was read.
describe('dispatch form changed since it was loaded (WH-264)', () => {
  const load = () => require('../dispatchFormSlice') as Slice;
  const header = {
    disp_no: 'D0042', disp_date: '2026-10-01', registration: 'GJ01XX0000', customer_id: 'c1', customer_name: 'Example Traders',
    supervisor_id: 's1', note: 'Call first',
  };
  const line = (unique_id: string, grnItems_id: string, disp_quantity: number) =>
    ({ unique_id, grnItems_id, disp_quantity, original_disp_quantity: disp_quantity }) as never;
  const loaded = () => {
    const slice = load();
    return slice.default(undefined, slice.loadDispatchData({ dispatchId: 'd1', header: header as never, items: [line('a', 'lot-1', 10), line('b', 'lot-2', 4)] }));
  };
  const changed = (state: ReturnType<typeof loaded>) => load().selectDispatchFormChanged({ dispatchForm: state });

  it('is false right after the load, and for a form that was never loaded', () => {
    const slice = load();
    expect(changed(loaded())).toBe(false);
    expect(changed(slice.default(undefined, slice.resetForm()))).toBe(false);
  });

  it.each([
    ['the number', { disp_no: 'D0043' }],
    ['the day', { disp_date: '2026-10-02' }],
    ['the vehicle number', { registration: 'GJ01XX0001' }],
    ['the customer', { customer_id: 'c2' }],
    ['the supervisor', { supervisor_id: 's2' }],
    ['the note', { note: 'Call second' }],
  ])('is true when %s was changed, and false again when it is put back', (_name, update) => {
    const slice = load();
    const state = slice.default(loaded(), slice.updateHeader(update));
    expect(changed(state)).toBe(true);
    expect(changed(slice.default(state, slice.updateHeader(Object.fromEntries(Object.keys(update).map((k) => [k, (header as Record<string, unknown>)[k]])))))).toBe(false);
  });

  it('does not count what the form tidies: the vehicle in another case or edge spaces, the note\'s edge spaces, a day with a time', () => {
    const slice = load();
    const state = slice.default(loaded(), slice.updateHeader({ registration: ' gj01xx0000 ', note: '  Call first ', disp_date: '2026-10-01T00:00:00Z' }));
    expect(changed(state)).toBe(false);
  });

  it('is true when a line\'s bags or lot changed, or a line was removed or added', () => {
    const slice = load();
    expect(changed(slice.default(loaded(), slice.updateItem({ uniqueId: 'a', updates: { disp_quantity: 11 } })))).toBe(true);
    expect(changed(slice.default(loaded(), slice.updateItem({ uniqueId: 'a', updates: { grnItems_id: 'lot-3' } })))).toBe(true);
    expect(changed(slice.default(loaded(), slice.removeItem('b')))).toBe(true);
    expect(changed(slice.default(loaded(), slice.addItems([line('c', 'lot-3', 2)])))).toBe(true);
  });

  it('works the signature out once for the same header and lines, however often it is asked', () => {
    // The signature normalises the vehicle number; counting those calls counts the signatures made.
    const calls = jest.fn();
    let slice!: Slice;
    jest.isolateModules(() => {
      jest.doMock('@/utils/vehicleNumber', () => {
        const actual = jest.requireActual('@/utils/vehicleNumber');
        return { ...actual, normalizeVehicle: (text: string) => { calls(); return actual.normalizeVehicle(text); } };
      });
      slice = require('../dispatchFormSlice');
    });
    const state = slice.default(
      slice.default(undefined, slice.loadDispatchData({ dispatchId: 'd1', header: header as never, items: [line('a', 'lot-1', 10)] })),
      slice.updateHeader({ note: 'Changed' })
    );
    calls.mockClear();

    expect(slice.selectDispatchFormChanged({ dispatchForm: state })).toBe(true);
    const afterFirst = calls.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);
    // Another state object with the same header and lines (another field moved): no new signature.
    expect(slice.selectDispatchFormChanged({ dispatchForm: { ...state, is_saving: true } })).toBe(true);
    expect(slice.selectDispatchFormChanged({ dispatchForm: state })).toBe(true);
    expect(calls.mock.calls.length).toBe(afterFirst);
    jest.dontMock('@/utils/vehicleNumber');
  });
});
