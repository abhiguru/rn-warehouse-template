import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { customerService } from '@/services/customer-service';
import { useCustomerDeactivatedState, type CustomerDeactivatedState } from '../useCustomerDeactivated';

jest.mock('@/services/customer-service', () => ({ customerService: { getCustomerById: jest.fn() } }));

let latest!: CustomerDeactivatedState;
let tree: ReactTestRenderer | undefined;
function Probe({ known }: { known?: boolean | null }) {
  latest = useCustomerDeactivatedState('cust-a', known);
  return null;
}
const mount = async (known?: boolean | null) => { await act(async () => { tree = create(<Probe known={known} />); }); };
afterEach(() => { act(() => tree?.unmount()); tree = undefined; jest.clearAllMocks(); });

it('a failed read leaves the state unknown and says so; retry reads again and answers', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValueOnce({ success: false } as never);
  await mount();
  expect([latest.deactivated, latest.failed]).toEqual([null, true]);
  jest.mocked(customerService.getCustomerById).mockResolvedValueOnce({ success: true, data: { active: false } } as never);
  await act(async () => { latest.retry(); });
  expect([latest.deactivated, latest.failed]).toEqual([true, false]);
  expect(customerService.getCustomerById).toHaveBeenCalledTimes(2);
});

it('a thrown read is a failure too', async () => {
  jest.mocked(customerService.getCustomerById).mockRejectedValueOnce(new Error('offline'));
  await mount();
  expect([latest.deactivated, latest.failed]).toEqual([null, true]);
});

it('a state carried in the link is used at once and nothing is read', async () => {
  await mount(false);
  expect([latest.deactivated, latest.failed]).toEqual([false, false]);
  expect(customerService.getCustomerById).not.toHaveBeenCalled();
});
