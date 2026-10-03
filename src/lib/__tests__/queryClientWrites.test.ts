import { onlineManager } from '@tanstack/react-query';
import { queryClient } from '../queryClient';

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('application write execution policy', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    onlineManager.setOnline(true);
    queryClient.mount();
  });
  afterEach(() => {
    onlineManager.setOnline(true);
    queryClient.clear();
    queryClient.unmount();
    jest.useRealTimers();
  });

  it('surfaces a failed write after one transport attempt', async () => {
    const transport = jest.fn(async () => { throw new Error('Transport unavailable'); });
    const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: transport });
    const result = mutation.execute(undefined).catch(error => error);
    await jest.advanceTimersByTimeAsync(10000);
    expect(await result).toBeInstanceOf(Error);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a write whose commit succeeded but response was lost', async () => {
    const saved: string[] = [];
    const transport = jest.fn(async () => { saved.push('committed'); throw new Error('Response lost'); });
    const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: transport });
    const result = mutation.execute(undefined).catch(error => error);
    await jest.advanceTimersByTimeAsync(10000);
    expect(await result).toBeInstanceOf(Error);
    expect(saved).toEqual(['committed']);
  });

  it('attempts an offline action once and does not queue it for reconnection', async () => {
    onlineManager.setOnline(false);
    const transport = jest.fn(async () => { throw new Error('Offline'); });
    const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: transport });
    const result = mutation.execute(undefined).catch(error => error);
    await flush();
    const callsWhileOffline = transport.mock.calls.length;
    const pausedWhileOffline = mutation.state.isPaused;
    onlineManager.setOnline(true);
    await jest.advanceTimersByTimeAsync(10000);
    expect(await result).toBeInstanceOf(Error);
    expect(callsWhileOffline).toBe(1);
    expect(pausedWhileOffline).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('still retries a transient read and returns the successful response', async () => {
    const read = jest.fn().mockRejectedValueOnce(new Error('Read interrupted')).mockResolvedValueOnce('current');
    const result = queryClient.fetchQuery({ queryKey: ['policy-read'], queryFn: read });
    await jest.advanceTimersByTimeAsync(5000);
    expect(await result).toBe('current');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('allows a successful explicit write once', async () => {
    const transport = jest.fn(async () => 'saved');
    const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: transport });
    expect(await mutation.execute(undefined)).toBe('saved');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
