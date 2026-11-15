/**
 * WH-220 (F1b): the embedded InvoiceDetails view says a failed load in a toast with one action, Retry, which loads
 * again (style guide §13.9). The real component and the real showToast run; only the two service reads are faked.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import InvoiceDetails from '@/components/InvoiceDetails';
import { getInvoiceDetails, getInvoiceItemsDetailed } from '@/services/invoice-service';
import type { InvoiceDetailsResponse, InvoiceItemsDetailedResponse } from '@/services/invoice-service';
import { registerToastHost, type ToastRequest } from '@/utils/toast';

jest.mock('@/services/invoice-service', () => ({ getInvoiceDetails: jest.fn(), getInvoiceItemsDetailed: jest.fn() }));
jest.mock('@/hooks/useTheme', () => ({
  useThemedStyles: () => new Proxy({}, { get: () => ({}) }),
  useTokens: () => new Proxy({}, { get: () => new Proxy({}, { get: () => '#000' }) }),
}));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const shown: ToastRequest[] = [];
let unregister: () => void;
beforeEach(() => {
  jest.clearAllMocks();
  shown.length = 0;
  unregister = registerToastHost((request) => { shown.push(request); });
  jest.mocked(getInvoiceItemsDetailed).mockResolvedValue({ success: false } as InvoiceItemsDetailedResponse);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { unregister(); jest.restoreAllMocks(); });

it('a failed load shows the toast with a Try again action, and Try again reads the invoice again', async () => {
  jest.mocked(getInvoiceDetails).mockResolvedValue({ success: false, message: 'x' } as InvoiceDetailsResponse);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<InvoiceDetails invoiceId="fictional-invoice" />); });
  expect(shown).toHaveLength(1);
  expect(shown[0].message).toBe("Couldn't load the invoice. Check your connection and try again.");
  expect(shown[0].action?.label).toBe('Try again');
  expect(getInvoiceDetails).toHaveBeenCalledTimes(1);

  await act(async () => { shown[0].action!.onPress(); });
  expect(getInvoiceDetails).toHaveBeenCalledTimes(2);
  await act(async () => { tree.unmount(); });
});
