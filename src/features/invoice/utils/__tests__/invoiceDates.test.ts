import type { InvoiceItemData } from '@/types/invoice.types';
import { dispatchAfterInvoiceDate } from '../invoiceDates';

const line = (dispatch_no: string, dispatch_date: string) => ({ dispatch_no, dispatch_date }) as InvoiceItemData;

describe('the invoice date against the dispatches of its lines', () => {
  it('is fine on the day of the latest dispatch and after it', () => {
    const lines = [line('D1', '2026-07-01'), line('D2', '2026-07-11')];
    expect(dispatchAfterInvoiceDate('2026-07-11', lines)).toBeNull();
    expect(dispatchAfterInvoiceDate('2026-10-31', lines)).toBeNull();
  });

  it('names the latest dispatch when the invoice is dated before it', () => {
    const lines = [line('D1', '2026-07-01'), line('D2', '2026-07-11')];
    expect(dispatchAfterInvoiceDate('2026-07-10', lines)).toEqual({ dispatchNo: 'D2', dispatchDate: '2026-07-11' });
    expect(dispatchAfterInvoiceDate('2026-06-05T00:00:00Z', lines)).toEqual({ dispatchNo: 'D2', dispatchDate: '2026-07-11' });
  });

  it('reads a dispatch timestamp as the business day in India', () => {
    // 20:00 UTC on 10 July is 01:30 on 11 July in India.
    const lines = [line('D2', '2026-07-10T20:00:00+00:00')];
    expect(dispatchAfterInvoiceDate('2026-07-10', lines)).toEqual({ dispatchNo: 'D2', dispatchDate: '2026-07-11' });
    expect(dispatchAfterInvoiceDate('2026-07-11', lines)).toBeNull();
  });

  it('judges nothing while the dispatches are not known or the date is missing', () => {
    expect(dispatchAfterInvoiceDate('2026-07-10', [])).toBeNull();
    expect(dispatchAfterInvoiceDate('2026-07-10', [line('D1', '')])).toBeNull();
    expect(dispatchAfterInvoiceDate('', [line('D1', '2026-07-11')])).toBeNull();
    expect(dispatchAfterInvoiceDate(undefined, [line('D1', '2026-07-11')])).toBeNull();
  });
});
