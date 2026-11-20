import { act, renderHook, waitFor } from '@testing-library/react-native';
import { customerService } from '@/services/customer-service';
import { useCustomerDeactivatedState } from '../useCustomerDeactivated';

jest.mock('@/services/customer-service', () => ({ customerService: { getCustomerById: jest.fn() } }));

afterEach(() => jest.clearAllMocks());

it('a failed read leaves the state unknown and says so; retry reads again and answers', async () => {
  jest.mocked(customerService.getCustomerById).mockResolvedValueOnce({ success: false } as never);
  const { result } = await renderHook(() => useCustomerDeactivatedState('cust-a'));
  expect([result.current.deactivated, result.current.failed]).toEqual([null, true]);
  jest.mocked(customerService.getCustomerById).mockResolvedValueOnce({ success: true, data: { active: false } } as never);
  await act(async () => { result.current.retry(); });
  await waitFor(() => expect([result.current.deactivated, result.current.failed]).toEqual([true, false]));
  expect(customerService.getCustomerById).toHaveBeenCalledTimes(2);
});

it('a thrown read is a failure too', async () => {
  jest.mocked(customerService.getCustomerById).mockRejectedValueOnce(new Error('offline'));
  const { result } = await renderHook(() => useCustomerDeactivatedState('cust-a'));
  expect([result.current.deactivated, result.current.failed]).toEqual([null, true]);
});

it('a state carried in the link is used at once and nothing is read', async () => {
  const { result } = await renderHook(() => useCustomerDeactivatedState('cust-a', false));
  expect([result.current.deactivated, result.current.failed]).toEqual([false, false]);
  expect(customerService.getCustomerById).not.toHaveBeenCalled();
});
