import { mapCustomerSearchResponse } from '../customerSearch';

describe('mapCustomerSearchResponse', () => {
  const customer = { id: 'customer-1', name: 'Example Customer' };

  it('maps the legacy direct-array response', () => {
    expect(mapCustomerSearchResponse([customer])).toEqual([customer]);
  });

  it('unwraps the standardized RPC response', () => {
    expect(
      mapCustomerSearchResponse({ success: true, data: [customer] })
    ).toEqual([customer]);
  });

  it('ignores malformed envelopes and rows', () => {
    expect(mapCustomerSearchResponse({ success: true })).toEqual([]);
    expect(
      mapCustomerSearchResponse({
        success: true,
        data: [null, { id: 'missing-name' }, customer],
      })
    ).toEqual([customer]);
  });
});
