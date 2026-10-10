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
