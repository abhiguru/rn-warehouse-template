/**
 * A dispatch list that the gateway refused with its "upgrading" answer keeps the code on the error the query sees: it is not
 * asked again (the request layer already waited and asked once more), and the words are the app's, in the app's language.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage, t } from '@/i18n';
import { shouldRetryQuery } from '@/lib/queryClient';
import { getDispatchListWithItems } from '@/services/dispatch-service';
import { useDispatchList, type UseDispatchListResult } from '../useDispatchList';

jest.mock('@/services/dispatch-service', () => ({
  getDispatchListWithItems: jest.fn(),
  getCustomerDispatchList: jest.fn(),
  deleteDispatch: jest.fn(),
}));

const failure = (extra: object) => ({
  success: false,
  message: "The facility's server is being updated. Try again in a few minutes.",
  data: { dispatches: [], pagination: { total_count: 0, limit: 20, offset: 0, has_more: false } },
  ...extra,
});

let result: UseDispatchListResult | undefined;
function Probe() {
  result = useDispatchList({ limit: 20 });
  return null;
}
async function run(): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 0 } } });
  const { unmount } = await render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
  // Wait until the query and every retry it would make have finished.
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await waitFor(() => expect(result?.isLoading).toBe(false));
  // Unmount before clearing: clearing under a mounted hook leaves TanStack's garbage-collection timer running and Jest never exits.
  await unmount();
  client.clear();
}

beforeEach(() => { result = undefined; jest.clearAllMocks(); });
afterEach(() => setLanguage('en'));

it('keeps the code: one request, no retries, and the app\'s words in Gujarati', async () => {
  setLanguage('gu');
  jest.mocked(getDispatchListWithItems).mockResolvedValue(failure({ errorCode: 'upgrading' }) as never);
  await run();
  expect(getDispatchListWithItems).toHaveBeenCalledTimes(1);
  expect(result?.error).toMatchObject({ code: 'upgrading', message: t('components.upgrading.message') });
  expect(result?.error?.message).not.toMatch(/[A-Za-z]/);
});

it('an ordinary failure without a code is still asked again', async () => {
  jest.mocked(getDispatchListWithItems).mockResolvedValue(failure({ message: 'Failed to fetch dispatches' }) as never);
  await run();
  expect(jest.mocked(getDispatchListWithItems).mock.calls.length).toBeGreaterThan(1);
});
