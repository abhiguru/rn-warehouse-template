type Slice = typeof import('../dispatchFormSlice');

describe('dispatch form default date', () => {
  afterEach(() => jest.useRealTimers());

  it('is the moment the form is reset, not the moment the app was started', () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 9, 18, 0, 0) });
    let slice!: Slice;
    jest.isolateModules(() => {
      slice = require('../dispatchFormSlice');
    });
    jest.setSystemTime(new Date(2026, 9, 10, 8, 30, 0));
    const today = new Date(2026, 9, 10, 8, 30, 0).toISOString();

    expect(slice.default(undefined, slice.resetForm()).header.disp_date).toBe(today);
    expect(slice.default(undefined, slice.resetFormData()).header.disp_date).toBe(today);
    expect(
      slice.default(undefined, slice.loadFromOrder({ header: {}, items: [], source_order_id: 'o1' })).header.disp_date
    ).toBe(today);
  });
});
